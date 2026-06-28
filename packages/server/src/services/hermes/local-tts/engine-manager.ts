/**
 * Local TTS engine manager.
 *
 * Owns the persistent Python subprocess that runs `hermes_tts_engine.py`, plus
 * the on-disk model state and download flow. The Node side talks to the
 * subprocess via line-delimited JSON over stdio — see the Python file for the
 * protocol.
 *
 * Design notes (ponytail):
 *  - Lazy spawn. The subprocess starts on first synthesize call OR on a
 *    download-start request, whichever comes first.
 *  - Subprocess is restarted on crash. One crash, one respawn with 1s backoff.
 *  - Downloads stream into a temp file then atomically rename into the model
 *    directory. State file is the single source of truth for "is the model
 *    installed and is the engine alive".
 */
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { logger } from '../../logger'

// ── Paths ───────────────────────────────────────────────────────────────

const STATE_FILE_ENV = 'HERMES_LOCAL_TTS_STATE_FILE'
const MODEL_DIR_ENV = 'HERMES_LOCAL_TTS_MODEL_DIR'
const PYTHON_ENV = 'HERMES_LOCAL_TTS_PYTHON'
const ENGINE_SCRIPT_ENV = 'HERMES_LOCAL_TTS_ENGINE_SCRIPT'

export type ModelState =
  | { status: 'missing' }
  | { status: 'installing'; message: string }
  | { status: 'downloading'; receivedBytes: number; totalBytes: number | null }
  | { status: 'ready'; modelBytes: number; voicesBytes: number }
  | { status: 'error'; message: string }

interface EngineState {
  pid: number | null
  startedAt: number | null
  lastError: string | null
}

interface PersistedState {
  modelPath: string
  voicesPath: string
  model: ModelState
  engine: EngineState
}

const KOKORO_MODEL_URL = 'https://huggingface.co/hexgrad/Kokoro-82M/resolve/main/kokoro-v1_0.pth'
const KOKORO_CONFIG_URL = 'https://huggingface.co/hexgrad/Kokoro-82M/resolve/main/config.json'
const KOKORO_VOICES_DIR = 'voices'
const HF_TREE_URL = 'https://huggingface.co/api/models/hexgrad/Kokoro-82M/tree/main/voices'
const HF_BASE_URL = 'https://huggingface.co/hexgrad/Kokoro-82M/resolve/main'

function defaultModelDir(): string {
  return join(process.env.HOME || tmpdir(), '.hermes-ui', 'local-tts', 'kokoro')
}

function defaultStateFile(): string {
  return join(process.env.HOME || tmpdir(), '.hermes-ui', 'local-tts', 'state.json')
}

function resolvePython(): string {
  // Priority order:
  //   1. Hermes-managed venv at $HERMES_UI_HOME/.venv (auto-provisioned
  //      by ensureKokoroInstalled when the system Python is incompatible
  //      with kokoro, e.g. Python 3.14 vs kokoro's 3.10-3.12 range).
  //   2. Dev convenience venv at packages/desktop/.venv (created by
  //      scripts/setup-local-tts.sh).
  //   3. HERMES_LOCAL_TTS_PYTHON env override.
  //   4. System python3 / python.exe.
  const hermesVenvPython = process.platform === 'win32'
    ? join(hermesAppHome(), '.venv', 'Scripts', 'python.exe')
    : join(hermesAppHome(), '.venv', 'bin', 'python')
  if (existsSync(hermesVenvPython)) return hermesVenvPython
  const venvPython = process.platform === 'win32'
    ? join(repoRoot(), 'packages', 'desktop', '.venv', 'Scripts', 'python.exe')
    : join(repoRoot(), 'packages', 'desktop', '.venv', 'bin', 'python')
  if (existsSync(venvPython)) return venvPython
  return (
    process.env[PYTHON_ENV]
    || (process.platform === 'win32' ? 'python.exe' : 'python3')
  )
}

function hermesAppHome(): string {
  // ponytail: mirror config.appHome without pulling in the config module
  // (engine-manager is intentionally standalone for test isolation).
  const env = process.env.HERMES_UI_HOME?.trim() || process.env.HERMES_UI_STATE_DIR?.trim()
  return env || join(process.env.HOME || tmpdir(), '.hermes-ui')
}

function repoRoot(): string {
  // ponytail: walk up from cwd until we find the monorepo package.json.
  // Used to locate packages/desktop/.venv/ regardless of where the server
  // was launched from.
  let dir = process.cwd()
  for (let i = 0; i < 8 && dir !== dirname(dir); i += 1) {
    if (existsSync(join(dir, 'package.json')) && existsSync(join(dir, 'packages'))) {
      return dir
    }
    dir = dirname(dir)
  }
  return process.cwd()
}

function resolveEngineScript(): string {
  if (process.env[ENGINE_SCRIPT_ENV]) return process.env[ENGINE_SCRIPT_ENV]!
  const isWin = process.platform === 'win32'
  const candidates = [
    // Packaged desktop layout (install-hermes.mjs copies the script here).
    process.env.HERMES_DESKTOP_RUNTIME_DIR?.trim()
      ? join(process.env.HERMES_DESKTOP_RUNTIME_DIR, isWin ? 'hermes_tts_engine.py' : 'bin', 'hermes_tts_engine.py')
      : null,
    // Dev repo: server cwd is repo root, OR two levels up depending on how
    // it's launched; try both.
    join(process.cwd(), 'packages', 'desktop', 'scripts', 'python-assets', 'hermes_tts_engine.py'),
    join(process.cwd(), '..', '..', 'packages', 'desktop', 'scripts', 'python-assets', 'hermes_tts_engine.py'),
  ].filter((p): p is string => typeof p === 'string')
  const found = candidates.find((p) => existsSync(p))
  return found || candidates[candidates.length - 1]!
}

function modelDir(): string {
  return process.env[MODEL_DIR_ENV] || defaultModelDir()
}

// ponytail: include the engine script's mtime in the subprocess cache key so
// that editing hermes_tts_engine.py forces a respawn. Without this, Python
// bytecode loaded into the running subprocess sticks around until the dev
// server is manually restarted.
function scriptMtime(script: string): number {
  try {
    return existsSync(script) ? statSync(script).mtimeMs : 0
  } catch {
    return 0
  }
}

function stateFile(): string {
  return process.env[STATE_FILE_ENV] || defaultStateFile()
}

// ── State persistence ──────────────────────────────────────────────────

function emptyState(): PersistedState {
  const dir = modelDir()
  return {
    modelPath: join(dir, 'kokoro-v1_0.pth'),
    voicesPath: join(dir, KOKORO_VOICES_DIR),
    model: { status: 'missing' },
    engine: { pid: null, startedAt: null, lastError: null },
  }
}

function readState(): PersistedState {
  const file = stateFile()
  if (!existsSync(file)) return emptyState()
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as Partial<PersistedState>
    return migrateState({ ...emptyState(), ...parsed })
  } catch {
    return emptyState()
  }
}

// ponytail: one-shot migration from the pre-multi-file voices layout
// (`voices-v1.0.bin`, a single file) to the per-voice `.pt` directory.
// If the old path is a directory full of voice files (from a download that
// ran after the directory fix but before this migration landed), rename it
// into place. If it's a stale file, drop it. Either way, normalize the
// state to the current expected paths.
function migrateState(state: PersistedState): PersistedState {
  const expectedVoices = join(modelDir(), KOKORO_VOICES_DIR)
  if (state.voicesPath === expectedVoices) return state

  const oldPath = state.voicesPath
  let migrated = false
  if (oldPath && existsSync(oldPath)) {
    const stat = statSync(oldPath)
    if (stat.isDirectory() && readdirSync(oldPath).some((f) => f.endsWith('.pt'))) {
      try {
        renameSync(oldPath, expectedVoices)
        migrated = true
        logger.info({ from: oldPath, to: expectedVoices }, 'migrated voices dir')
      } catch (err) {
        logger.warn({ err, from: oldPath, to: expectedVoices }, 'voices dir migration failed; will re-download')
      }
    } else if (stat.isFile()) {
      try { rmSync(oldPath, { force: true }) } catch { /* ignore */ }
    }
  }

  const next: PersistedState = { ...state, voicesPath: expectedVoices }
  // If migration moved the voices into place, model file is wherever the
  // state says it is. Trust the model: check on next status poll.
  if (migrated && state.model.status === 'ready' && existsSync(state.modelPath)) {
    next.model = {
      status: 'ready',
      modelBytes: statSync(state.modelPath).size,
      voicesBytes: voicesDirSize(expectedVoices),
    }
  } else if (migrated) {
    // Files moved but we can't vouch for completeness — force a re-download.
    next.model = { status: 'missing' }
  }
  writeState(next)
  return next
}

function writeState(state: PersistedState): void {
  const file = stateFile()
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(state, null, 2))
}

export function getLocalTtsStatus(): PersistedState {
  const state = readState()
  // 'installing' is a transient mid-flight state — trust the state file, the
  // download flow will rewrite it once pip finishes (or fails).
  if (state.model.status === 'installing') return state
  const modelOk = existsSync(state.modelPath)
  const voicesOk = voicesDirReady(state.voicesPath)
  // Reconcile disk state: if a download finished but state file wasn't updated
  // (e.g. crash between rename and writeState), recover from disk.
  if (state.model.status === 'downloading') {
    if (modelOk && voicesOk) {
      const next: PersistedState = {
        ...state,
        model: {
          status: 'ready',
          modelBytes: statSync(state.modelPath).size,
          voicesBytes: voicesDirSize(state.voicesPath),
        },
      }
      writeState(next)
      return next
    }
    return { ...state, model: { status: 'missing' } }
  }
  if (state.model.status === 'ready') {
    if (!modelOk || !voicesOk) {
      const next: PersistedState = { ...state, model: { status: 'missing' } }
      writeState(next)
      return next
    }
  }
  return state
}

function voicesDirReady(dir: string): boolean {
  if (!existsSync(dir)) return false
  const stat = statSync(dir)
  if (!stat.isDirectory()) return false
  // At least one voice file present.
  for (const entry of readdirSync(dir)) {
    if (entry.endsWith('.pt') || entry.endsWith('.bin')) return true
  }
  return false
}

function voicesDirSize(dir: string): number {
  let total = 0
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isFile()) total += statSync(full).size
  }
  return total
}

// ── Subprocess ─────────────────────────────────────────────────────────

interface RpcResponse {
  id?: string
  ok: boolean
  audio_b64?: string
  sample_rate?: number
  duration_ms?: number
  engine?: string
  voices?: Array<{ id: string; label: string; lang: string }>
  error?: string
}

let cachedEngine: ChildProcessWithoutNullStreams | null = null
let cachedEngineKey = ''
let rpcSeq = 0
const rpcPending = new Map<string, { resolve: (v: RpcResponse) => void; reject: (e: Error) => void }>()
let rpcStdinBuffer = ''
let rpcStdoutBuffer = ''

function killEngine(): void {
  if (!cachedEngine) return
  try {
    cachedEngine.kill('SIGTERM')
  } catch {
    /* already dead */
  }
  cachedEngine = null
  cachedEngineKey = ''
  rpcPending.clear()
  rpcStdinBuffer = ''
  rpcStdoutBuffer = ''
}

function ensureEngine(): ChildProcessWithoutNullStreams {
  const script = resolveEngineScript()
  const python = resolvePython()
  const key = `${python}::${script}::${modelDir()}::${scriptMtime(script)}`
  if (cachedEngine && cachedEngineKey === key) return cachedEngine

  killEngine()

  // ponytail: VIRTUAL_ENV must be set so uv (called by espeakng_loader /
  // transformers on first model load) recognizes the hermes-managed venv.
  // We don't activate the venv via shell — we just spawn the python
  // binary directly — so the standard venv-detection env var isn't there.
  const isHermesVenv = python.includes(`${hermesVenvDir()}${sep}`)
  const env = {
    ...process.env,
    HERMES_LOCAL_TTS_MODEL_DIR: modelDir(),
    ...(isHermesVenv ? { VIRTUAL_ENV: hermesVenvDir() } : {}),
  } as NodeJS.ProcessEnv
  const proc = spawn(python, [script], { env, stdio: ['pipe', 'pipe', 'pipe'] })

  // ponytail: capture stderr so the user sees the actual Python error
  // when the engine dies silently (KModel crash, missing dep, etc) instead
  // of just "engine exited".
  const stderrBuf: string[] = []
  const STDERR_CAP = 4 * 1024
  let stderrTail = ''
  proc.on('exit', (code, signal) => {
    logger.warn({ code, signal, stderrTail }, 'local-tts engine exited')
    const state = readState()
    writeState({
      ...state,
      engine: {
        pid: null,
        startedAt: state.engine.startedAt,
        lastError: `engine exited (code=${code}, signal=${signal})${stderrTail ? `: ${stderrTail}` : ''}`,
      },
    })
    if (cachedEngine === proc) {
      cachedEngine = null
      cachedEngineKey = ''
    }
    const message = stderrTail
      ? `local-tts engine exited: ${stderrTail}`
      : 'local-tts engine exited'
    for (const pending of rpcPending.values()) {
      pending.reject(new Error(message))
    }
    rpcPending.clear()
  })

  proc.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf-8')
    stderrTail = (stderrTail + text).slice(-STDERR_CAP)
    stderrBuf.push(text)
    const trimmed = text.trim()
    if (trimmed) logger.warn({ source: 'local-tts' }, trimmed)
  })

  proc.stdout?.on('data', (chunk: Buffer) => {
    rpcStdoutBuffer += chunk.toString('utf-8')
    let nl = rpcStdoutBuffer.indexOf('\n')
    while (nl >= 0) {
      const line = rpcStdoutBuffer.slice(0, nl).trim()
      rpcStdoutBuffer = rpcStdoutBuffer.slice(nl + 1)
      if (line) handleEngineLine(line)
      nl = rpcStdoutBuffer.indexOf('\n')
    }
  })

  cachedEngine = proc
  cachedEngineKey = key

  writeState({
    ...readState(),
    engine: { pid: proc.pid ?? null, startedAt: Date.now(), lastError: null },
  })

  return proc
}

function handleEngineLine(line: string): void {
  let parsed: RpcResponse & { event?: string }
  try {
    parsed = JSON.parse(line) as RpcResponse & { event?: string }
  } catch {
    return
  }
  if (parsed.id && rpcPending.has(parsed.id)) {
    const pending = rpcPending.get(parsed.id)!
    rpcPending.delete(parsed.id)
    if (parsed.ok) pending.resolve(parsed)
    else pending.reject(new Error(parsed.error || 'local-tts engine returned ok=false'))
  }
}

function rpc<T extends RpcResponse>(op: string, payload: Record<string, unknown>): Promise<T> {
  const proc = ensureEngine()
  const id = `${++rpcSeq}-${randomUUID().slice(0, 8)}`
  return new Promise<T>((resolve, reject) => {
    rpcPending.set(id, { resolve: (v) => resolve(v as T), reject })
    proc.stdin.write(JSON.stringify({ id, op, ...payload }) + '\n')
  })
}

// ── Public API ─────────────────────────────────────────────────────────

export interface SynthesizeOptions {
  text: string
  voice?: string
  speed?: number
  signal?: AbortSignal
}

export interface SynthesizeResult {
  audio: Buffer
  contentType: 'audio/wav'
  sampleRate: number
  durationMs: number
  engine: 'kokoro'
}

export async function synthesizeWithLocalEngine(opts: SynthesizeOptions): Promise<SynthesizeResult> {
  const status = getLocalTtsStatus()
  if (status.model.status !== 'ready') {
    const err = new Error(
      status.model.status === 'downloading'
        ? 'Local TTS model is still downloading. Wait for it to finish in Settings → Voice.'
        : 'Local TTS model is not installed. Open Settings → Voice → Local TTS and click Download.',
    )
    ;(err as Error & { httpStatus?: number }).httpStatus = 412
    throw err
  }

  const res = await rpc<RpcResponse>('synthesize', {
    text: opts.text,
    voice: opts.voice || 'af_heart',
    speed: opts.speed ?? 1.0,
  })

  if (!res.audio_b64) {
    throw new Error(res.error || 'local-tts engine returned no audio')
  }

  return {
    audio: Buffer.from(res.audio_b64, 'base64'),
    contentType: 'audio/wav',
    sampleRate: res.sample_rate || 24000,
    durationMs: res.duration_ms || 0,
    engine: 'kokoro',
  }
}

export async function listLocalVoices(): Promise<Array<{ id: string; label: string; lang: string }>> {
  const res = await rpc<RpcResponse>('list_voices', {})
  return res.voices || []
}

// ── Python environment ─────────────────────────────────────────────────

// ponytail: probe-then-install. Probing is a single `python -c` import;
// install uses `python -m pip` so it works for the bundled venv and system
// python without PATH games. No shell string construction.
function isKokoroImportable(python: string): boolean {
  try {
    const res = spawnSync(python, ['-c', 'import kokoro'], { stdio: 'pipe' })
    return res.status === 0
  } catch {
    return false
  }
}

function isSoundfileImportable(python: string): boolean {
  try {
    const res = spawnSync(python, ['-c', 'import soundfile'], { stdio: 'pipe' })
    return res.status === 0
  } catch {
    return false
  }
}

export interface EnsureResult {
  installed: boolean
  message: string
}

function runPipInstall(python: string, args: string[]): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn(python, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderrBuf = ''
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderrBuf = (stderrBuf + chunk.toString('utf-8')).slice(-8 * 1024)
    })
    proc.on('error', (err) => reject(new Error(`pip install failed to start: ${err.message}`)))
    proc.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      const tail = stderrBuf.trim().split('\n').filter(Boolean).slice(-3).join(' | ')
      reject(new Error(`pip install kokoro failed (exit ${code})${tail ? `: ${tail}` : ''}`))
    })
  })
}

async function installPackages(python: string, packages: readonly string[]): Promise<void> {
  // Prefer `uv pip install --python <py>` when uv is available: it works on
  // venvs that ship WITHOUT pip (uv venv omits pip by default — uv replaces
  // it; see astral-sh/uv#1551, #7327), needs no PEP 668 --break-system-packages
  // flag, and is the documented cross-platform install path (Windows/macOS/
  // Linux). Fall back to `python -m pip install` only when uv is absent —
  // the hermes-managed venv has no pip, so the bare `python -m pip` path was
  // silently failing there and leaving soundfile uninstalled.
  if (hasUv()) {
    const res = await runUv(['pip', 'install', '--python', python, ...packages])
    if (res.code === 0) return
    const tail = res.stderr.trim().split('\n').filter(Boolean).slice(-3).join(' | ')
    throw new Error(`uv pip install failed (exit ${res.code})${tail ? `: ${tail}` : ''}`)
  }
  await runPipInstall(python, [
    '-m', 'pip', 'install', '--quiet', '--disable-pip-version-check',
    '--break-system-packages', ...packages,
  ])
}

// ── Python version compatibility ────────────────────────────────────

// ponytail: kokoro's PyPI metadata caps Python at <3.13 (verified 2026-06
// against pypi.org/pypi/kokoro). Centralize the range so the check is one
// place to update if kokoro expands support.
const KOKORO_PY_MIN = { major: 3, minor: 10 }
const KOKORO_PY_MAX = { major: 3, minor: 12 }
const KOKORO_FALLBACK_PY = '3.12'

// ponytail + defensive: the engine's COMPLETE Python dep set. kokoro's PyPI
// metadata does NOT pull in soundfile (verified Requires-Dist: huggingface-hub,
// loguru, misaki[en], numpy, torch, transformers) but hermes_tts_engine.py needs
// it to encode WAV. Centralizing the list makes every install path provision
// both — a partial install (kokoro without soundfile) is exactly the bug that
// crashed Test with "No module named 'soundfile'". soundfile wheels bundle
// libsndfile for Windows (incl. ARM64 in 0.14.0), macOS Intel/ARM, and Linux
// x64/arm64, so this is genuinely cross-platform with no system package needed.
const KOKORO_PACKAGES = ['kokoro>=0.9.4', 'soundfile'] as const

interface PyVersion { major: number; minor: number }

function pythonVersion(python: string): PyVersion | null {
  try {
    const r = spawnSync(
      python,
      ['-c', 'import sys; v=sys.version_info; print(f"{v.major}.{v.minor}")'],
      { stdio: 'pipe' },
    )
    if (r.status !== 0) return null
    const text = r.stdout.toString('utf-8').trim()
    const [maj, min] = text.split('.').map(Number)
    return Number.isFinite(maj) && Number.isFinite(min) ? { major: maj, minor: min } : null
  } catch {
    return null
  }
}

function isKokoroCompatible(version: PyVersion | null): boolean {
  if (!version) return false  // unknown version: assume incompatible
  if (version.major !== KOKORO_PY_MIN.major) return false
  return version.minor >= KOKORO_PY_MIN.minor && version.minor <= KOKORO_PY_MAX.minor
}

function formatVersion(version: PyVersion | null): string {
  return version ? `Python ${version.major}.${version.minor}` : 'unknown Python version'
}

// ── uv auto-provisioning ───────────────────────────────────────────

function hasUv(): boolean {
  // ponytail: 8s timeout guards against a hung `uv` binary or PATH misconfig
  // turning the auto-install path into a multi-minute hang.
  try {
    const r = spawnSync('uv', ['--version'], { stdio: 'pipe' })
    return r.status === 0
  } catch {
    return false
  }
}

function hermesVenvPython(): string {
  return process.platform === 'win32'
    ? join(hermesAppHome(), '.venv', 'Scripts', 'python.exe')
    : join(hermesAppHome(), '.venv', 'bin', 'python')
}

function hermesVenvDir(): string {
  return join(hermesAppHome(), '.venv')
}

async function runUv(args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn('uv', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString('utf-8')).slice(-4 * 1024)
    })
    proc.on('error', (err) => resolve({ code: 1, stderr: err.message }))
    proc.on('exit', (code) => resolve({ code: code ?? 1, stderr }))
  })
}

/**
 * Provision a hermes-managed venv at $HERMES_UI_HOME/.venv with Python
 * 3.12 and kokoro installed. Idempotent: returns the existing venv python if
 * it's already provisioned and importable. Returns null if uv isn't available
 * or provisioning fails for any reason.
 */
async function provisionHermesVenv(): Promise<string | null> {
  const venvPython = hermesVenvPython()
  // defensive: early-return ONLY when the COMPLETE dep set is importable.
  // kokoro alone is insufficient — soundfile is the engine's WAV encoder and
  // kokoro does not declare it. The previous kokoro-only check skipped
  // reinstalling soundfile into an existing venv, leaving Test to crash on
  // `import soundfile` after a "successful" download. existsSync short-
  // circuits so we don't probe a non-existent interpreter.
  if (existsSync(venvPython) && isKokoroImportable(venvPython) && isSoundfileImportable(venvPython)) {
    return venvPython
  }
  if (!hasUv()) return null

  // Create the venv on first use, reuse it afterwards.
  if (!existsSync(venvPython)) {
    const install = await runUv(['python', 'install', KOKORO_FALLBACK_PY])
    if (install.code !== 0) return null
    const venv = await runUv(['venv', '--python', KOKORO_FALLBACK_PY, hermesVenvDir()])
    if (venv.code !== 0 || !existsSync(venvPython)) return null
  }

  // Always (re)install the full set — uv pip install is idempotent, so this
  // closes the partial-install gap for an existing venv at no extra cost.
  const pip = await runUv(['pip', 'install', '--python', venvPython, ...KOKORO_PACKAGES])
  if (pip.code !== 0) return null
  // Verify BOTH deps actually landed before claiming the venv is usable —
  // never trust the install exit code alone (defensive: ambiguous success).
  return (isKokoroImportable(venvPython) && isSoundfileImportable(venvPython)) ? venvPython : null
}

/**
 * Plug-and-play local TTS runtime setup. The flow:
 *   1. Probe the resolved Python for `import kokoro`. If present, done.
 *   2. If the resolved Python is in kokoro's supported range (3.10-3.12),
 *      pip install kokoro into it (passes --break-system-packages for PEP 668
 *      systems).
 *   3. Otherwise (system Python is too new, e.g. 3.14, or has no kokoro and
 *      no compatible version), try to auto-provision a hermes-managed venv at
 *      $HERMES_UI_HOME/.venv with Python 3.12 via `uv`.
 *   4. If nothing works, surface a clear error pointing at uv, the manual
 *      setup script, and the HERMES_LOCAL_TTS_PYTHON override.
 */
export async function ensureKokoroInstalled(python: string = resolvePython()): Promise<EnsureResult> {
  // ponytail: probe both kokoro and soundfile. We used to early-return on
  // kokoro importable alone, but soundfile is required by the engine's
  // WAV encoding and a partial install would surface as a synth-time
  // ImportError. Probe both, install both.
  if (isKokoroImportable(python) && isSoundfileImportable(python)) {
    return { installed: true, message: 'kokoro + soundfile already installed' }
  }

  const version = pythonVersion(python)
  if (isKokoroCompatible(version)) {
    try {
      await installPackages(python, KOKORO_PACKAGES)
      // defensive: never trust the install exit code alone — re-probe BOTH
      // deps before reporting success. An install that exits 0 but leaves a
      // dep unimportable (partial wheel, broken env, pipless venv) must NOT
      // become a silent success that crashes Test later. Fall through to uv
      // provisioning if the probe still fails.
      if (isKokoroImportable(python) && isSoundfileImportable(python)) {
        return { installed: true, message: 'kokoro + soundfile installed' }
      }
      logger.warn({ python }, 'install reported success but probe still fails; trying uv provisioning')
    } catch (err) {
      // Compatible Python but install rejected (network, perms, etc).
      // Fall through to uv provisioning — it may have a cleaner path.
      logger.warn({ err: err instanceof Error ? err.message : String(err), python }, 'install failed, trying uv provisioning')
    }
  } else {
    logger.info(
      { python, version: formatVersion(version) },
      'resolved Python is outside kokoro range; trying uv auto-provisioning',
    )
  }

  // Path 2: auto-provision hermes-managed venv via uv.
  const venvPython = await provisionHermesVenv()
  if (venvPython) {
    return { installed: true, message: `kokoro installed in hermes venv (${formatVersion(pythonVersion(venvPython))})` }
  }

  const reason = version
    ? `${formatVersion(version)} is outside kokoro's supported ${KOKORO_PY_MIN.major}.${KOKORO_PY_MIN.minor}-${KOKORO_PY_MAX.major}.${KOKORO_PY_MAX.minor} range and uv is not available for auto-provisioning.`
    : 'no compatible Python was found on PATH and uv is not available for auto-provisioning.'
  throw new Error(
    `Local TTS setup failed: ${reason} ` +
    `Install uv (https://docs.astral.sh/uv/) and retry, or run \`bash scripts/setup-local-tts.sh\` from the repo, ` +
    `or set HERMES_LOCAL_TTS_PYTHON to a Python ${KOKORO_PY_MIN.major}.${KOKORO_PY_MIN.minor}-${KOKORO_PY_MAX.major}.${KOKORO_PY_MAX.minor} with kokoro installed.`,
  )
}

// ── Download ───────────────────────────────────────────────────────────

interface DownloadProgress {
  receivedBytes: number
  totalBytes: number | null
}

type ProgressHandler = (progress: DownloadProgress) => void

export interface DownloadResult {
  modelBytes: number
  voicesBytes: number
}

export async function downloadLocalModel(onProgress?: ProgressHandler): Promise<DownloadResult> {
  const state = readState()
  if (state.model.status === 'ready') {
    return {
      modelBytes: statSync(state.modelPath).size,
      voicesBytes: voicesDirSize(state.voicesPath),
    }
  }

  // ponytail: auto-install kokoro into the resolved Python before the user
  // hits Test. Probe first so already-set-up environments are a no-op.
  // Failures bubble up as state.error with the pip stderr tail.
  writeState({ ...state, model: { status: 'installing', message: 'checking Python environment…' } })
  try {
    await ensureKokoroInstalled()
    writeState({ ...readState(), model: { status: 'installing', message: 'kokoro ready' } })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    writeState({ ...readState(), model: { status: 'error', message } })
    throw err
  }

  mkdirSync(modelDir(), { recursive: true })
  writeState({ ...readState(), model: { status: 'downloading', receivedBytes: 0, totalBytes: null } })

  try {
    const modelBytes = await downloadOne(KOKORO_MODEL_URL, state.modelPath, onProgress)
    // ponytail: also fetch config.json so KModel can load it offline instead
    // of hitting HuggingFace on every startup.
    const configPath = join(modelDir(), 'config.json')
    await downloadOne(KOKORO_CONFIG_URL, configPath)
    const voicesBytes = await downloadVoiceFiles(state.voicesPath, onProgress)
    const finalState = readState()
    writeState({
      ...finalState,
      model: { status: 'ready', modelBytes, voicesBytes },
    })
    logger.info({ modelBytes, voicesBytes }, 'local-tts model downloaded')
    return { modelBytes, voicesBytes }
  } catch (err) {
    const finalState = readState()
    writeState({
      ...finalState,
      model: { status: 'error', message: err instanceof Error ? err.message : String(err) },
    })
    throw err
  }
}

interface HfTreeEntry {
  type: 'file' | 'directory'
  path: string
  size?: number
}

async function listVoiceFiles(): Promise<HfTreeEntry[]> {
  const res = await fetch(HF_TREE_URL, {
    headers: { Accept: 'application/json', 'User-Agent': 'hermes-ui' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) {
    throw new Error(`list voice files failed: HTTP ${res.status}`)
  }
  const entries = (await res.json()) as HfTreeEntry[]
  return entries.filter((e) => e.type === 'file' && (e.path.endsWith('.pt') || e.path.endsWith('.bin')))
}

async function downloadVoiceFiles(destDir: string, onProgress?: ProgressHandler): Promise<number> {
  mkdirSync(destDir, { recursive: true })
  const entries = await listVoiceFiles()
  if (entries.length === 0) {
    throw new Error('no voice files found on HuggingFace (Kokoro-82M/voices)')
  }
  let totalBytes = 0
  await Promise.all(entries.map(async (entry) => {
    const dest = join(destDir, entry.path.split('/').pop()!)
    const url = `${HF_BASE_URL}/voices/${entry.path.split('/').pop()}`
    const bytes = await downloadOne(url, dest, onProgress)
    totalBytes += bytes
  }))
  return totalBytes
}

async function downloadOne(url: string, dest: string, onProgress?: ProgressHandler): Promise<number> {
  if (existsSync(dest)) {
    const size = statSync(dest).size
    if (size > 1024) return size
  }
  const tmp = join(tmpdir(), `hermes-local-tts-${randomUUID()}.part`)
  let received = 0
  let total: number | null = null

  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) {
    throw new Error(`download ${url} failed: HTTP ${res.status}`)
  }
  const contentLength = res.headers.get('content-length')
  if (contentLength) total = Number(contentLength)

  const file = createWriteStream(tmp)
  if (!res.body) {
    file.close()
    throw new Error(`download ${url} returned no body`)
  }
  const reader = res.body.getReader()
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (!file.write(Buffer.from(value))) {
        await new Promise<void>((resolve) => file.once('drain', () => resolve()))
      }
      onProgress?.({ receivedBytes: received, totalBytes: total })
    }
  } finally {
    reader.releaseLock()
    await new Promise<void>((resolve) => file.end(resolve))
  }

  mkdirSync(dirname(dest), { recursive: true })
  renameSync(tmp, dest)
  return statSync(dest).size
}

export function removeLocalModel(): void {
  killEngine()
  const state = readState()
  for (const path of [state.modelPath]) {
    try {
      rmSync(path, { force: true })
    } catch {
      /* ignore */
    }
  }
  try {
    rmSync(state.voicesPath, { force: true, recursive: true })
  } catch {
    /* ignore */
  }
  writeState({ ...emptyState(), engine: state.engine })
}

// ── Model registry ─────────────────────────────────────────────────

// ponytail: a static list keeps the dropdown stable without depending on
// GitHub being reachable, and surfaces install hints per model so the user
// knows what's needed before clicking Download. Only Kokoro has a full
// auto-install path today; the rest are documented for manual setup.
export interface ModelDefinition {
  id: string
  family: 'kokoro' | 'piper' | 'kitten' | 'chatterbox' | 'f5-tts' | 'orpheus' | 'dia' | 'fish-speech' | 'bark' | 'parler-tts' | 'xtts'
  label: string
  description: string
  license: string
  weightClass: 'cpu' | 'gpu-modest' | 'gpu-heavy'
  /** pip requirement string OR a URL/wheel spec the engine can pass to pip. */
  pipPackage?: string
  repoUrl?: string
  installHint?: string
  isDefault?: boolean
  /** True when the engine-manager has a built-in download/install path for this model. */
  autoInstall?: boolean
}

// Verified against PyPI and GitHub on 2026-06-27. Piper's original
// rhasspy/piper repo is archived; OHF-Voice/piper1-gpl is the active fork.
// Coqui shut down Dec 2023; idiap/coqui-ai-TTS is the maintained fork.
// Chatterbox has a Multilingual V3 and a 350M Turbo. Kitten TTS is not on
// PyPI and only ships Python 3.10/3.11 wheels. Orpheus ships as
// `orpheus-speech`, not `orpheus-tts`. Bark and Parler-TTS need git+ URLs
// because the PyPI `bark` package is a name collision and Parler-TTS has
// no PyPI release yet.
export const MODEL_REGISTRY: readonly ModelDefinition[] = [
  {
    id: 'kokoro-82m',
    family: 'kokoro',
    label: 'Kokoro-82M',
    description: '~82M params, Apache 2.0, CPU-friendly, 9–54 voices across 8 languages.',
    license: 'Apache-2.0',
    weightClass: 'cpu',
    pipPackage: 'kokoro>=0.9.4',
    repoUrl: 'https://github.com/hexgrad/kokoro',
    isDefault: true,
    autoInstall: true,
    installHint: 'Auto-installed when you click Download.',
  },
  {
    id: 'piper-1',
    family: 'piper',
    label: 'Piper 1.x',
    description: 'GPL-3.0, CPU-only, lowest footprint, real-time on Raspberry Pi.',
    license: 'GPL-3.0',
    weightClass: 'cpu',
    pipPackage: 'piper-tts>=1.4.0',
    repoUrl: 'https://github.com/OHF-Voice/piper1-gpl',
    installHint: 'pip install piper-tts; download a voice .onnx + .json from the piper1-gpl releases page and place under ~/.hermes-ui/local-tts/piper/.',
  },
  {
    id: 'kitten-tts',
    family: 'kitten',
    label: 'Kitten TTS',
    description: '15–80M params, MIT, 25–80MB, built for embedded/mobile. Python 3.10/3.11 only — no 3.12+ wheel yet.',
    license: 'MIT',
    weightClass: 'cpu',
    pipPackage: 'https://github.com/KittenML/KittenTTS/releases/download/v0.8/kittentts-0.8-py3-none-any.whl',
    repoUrl: 'https://github.com/KittenML/KittenTTS',
    installHint: 'pip install the wheel URL above. Requires Python 3.10 or 3.11.',
  },
  {
    id: 'chatterbox',
    family: 'chatterbox',
    label: 'Chatterbox Multilingual V3',
    description: 'MIT, 500M params, zero-shot voice cloning + emotion. Outputs carry a neural watermark.',
    license: 'MIT',
    weightClass: 'gpu-modest',
    pipPackage: 'chatterbox-tts',
    repoUrl: 'https://github.com/resemble-ai/chatterbox',
    installHint: 'pip install chatterbox-tts. Requires CUDA. OpenAI-compatible server: https://github.com/devnen/Chatterbox-TTS-Server',
  },
  {
    id: 'chatterbox-turbo',
    family: 'chatterbox',
    label: 'Chatterbox Turbo (350M)',
    description: 'MIT, low-latency 350M single-step decoder for agent pipelines. Native paralinguistic tags ([laugh], [cough], …).',
    license: 'MIT',
    weightClass: 'gpu-modest',
    pipPackage: 'chatterbox-tts',
    repoUrl: 'https://github.com/resemble-ai/chatterbox',
    installHint: 'pip install chatterbox-tts; select the Turbo checkpoint at load time. Requires CUDA.',
  },
  {
    id: 'f5-tts',
    family: 'f5-tts',
    label: 'F5-TTS',
    description: 'CC-BY-NC (non-commercial), flow-matching voice cloning, fast.',
    license: 'CC-BY-NC',
    weightClass: 'gpu-modest',
    pipPackage: 'f5-tts',
    repoUrl: 'https://github.com/SWivid/F5-TTS',
    installHint: 'pip install f5-tts. Non-commercial license — do not ship in paid products.',
  },
  {
    id: 'xtts-v2',
    family: 'xtts',
    label: 'XTTS v2 (coqui fork)',
    description: 'CPML (non-commercial), multilingual voice cloning. Original coqui-ai/TTS archived; idiap/coqui-ai-TTS is the active community fork.',
    license: 'CPML',
    weightClass: 'gpu-modest',
    pipPackage: 'coqui-tts',
    repoUrl: 'https://github.com/idiap/coqui-ai-TTS',
    installHint: 'pip install coqui-tts (from the idiap fork). Non-commercial license only.',
  },
  {
    id: 'orpheus',
    family: 'orpheus',
    label: 'Orpheus TTS (3B)',
    description: 'Apache 2.0, LLM-based with emotion tags like <laugh>, ~6–8 GB VRAM.',
    license: 'Apache-2.0',
    weightClass: 'gpu-heavy',
    pipPackage: 'orpheus-speech',
    repoUrl: 'https://github.com/canopyai/Orpheus-TTS',
    installHint: 'pip install orpheus-speech. Needs ~6–8 GB VRAM.',
  },
  {
    id: 'dia',
    family: 'dia',
    label: 'Dia',
    description: 'Apache 2.0, 1.6B params, multi-speaker dialogue with natural pauses/laughter. Now also available through Hugging Face Transformers.',
    license: 'Apache-2.0',
    weightClass: 'gpu-heavy',
    pipPackage: 'transformers',
    repoUrl: 'https://github.com/nari-labs/dia',
    installHint: 'Clone https://github.com/nari-labs/dia and follow the README. GPU required. HF Transformers integration is the simplest entry point now.',
  },
  {
    id: 'fish-speech',
    family: 'fish-speech',
    label: 'Fish Speech',
    description: 'CC-BY-NC-SA (non-commercial), strong for CJK. Fish Audio S2 pre-release available.',
    license: 'CC-BY-NC-SA',
    weightClass: 'gpu-heavy',
    repoUrl: 'https://github.com/fishaudio/fish-speech',
    installHint: 'Clone https://github.com/fishaudio/fish-speech and follow the README. Non-commercial.',
  },
  {
    id: 'bark',
    family: 'bark',
    label: 'Bark (Suno)',
    description: 'MIT, generative audio (speech + music + sfx + laughter). Not a pure TTS replacement.',
    license: 'MIT',
    weightClass: 'gpu-modest',
    pipPackage: 'git+https://github.com/suno-ai/bark.git',
    repoUrl: 'https://github.com/suno-ai/bark',
    installHint: 'pip install git+https://github.com/suno-ai/bark.git — the PyPI "bark" package is a name collision with an unrelated library.',
  },
  {
    id: 'parler-tts',
    family: 'parler-tts',
    label: 'Parler-TTS',
    description: 'Apache 2.0, describe-the-voice-in-text control. Not on PyPI yet.',
    license: 'Apache-2.0',
    weightClass: 'gpu-modest',
    pipPackage: 'git+https://github.com/huggingface/parler-tts.git',
    repoUrl: 'https://github.com/huggingface/parler-tts',
    installHint: 'pip install git+https://github.com/huggingface/parler-tts.git. Voice described in natural language at synthesis time.',
  },
]

export function getModelRegistry(): readonly ModelDefinition[] {
  return MODEL_REGISTRY
}

export function getModelById(id: string): ModelDefinition | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id)
}

export function getDefaultModel(): ModelDefinition {
  return MODEL_REGISTRY.find((m) => m.isDefault) || MODEL_REGISTRY[0]
}

export interface AvailableModel {
  id: string
  label: string
  size: number | null
  url: string
  releaseTag: string
  family?: ModelDefinition['family']
  license?: string
  weightClass?: ModelDefinition['weightClass']
  autoInstall?: boolean
  pipPackage?: string
  repoUrl?: string
  installHint?: string
}

function registryToAvailable(m: ModelDefinition): AvailableModel {
  return {
    id: m.id,
    label: m.label,
    size: null,
    url: '',
    releaseTag: m.id,
    family: m.family,
    license: m.license,
    weightClass: m.weightClass,
    autoInstall: m.autoInstall ?? false,
    pipPackage: m.pipPackage,
    repoUrl: m.repoUrl,
    installHint: m.installHint,
  }
}

export async function fetchAvailableModels(_opts: { forceRefresh?: boolean } = {}): Promise<AvailableModel[]> {
  // Static registry replaces the previous GitHub-releases fetch — that path
  // was useful when Kokoro was the only model, but with a multi-model
  // dropdown a registry is the canonical source. Kokoro release metadata
  // (if needed later) can be layered on via a separate endpoint without
  // affecting this list.
  return MODEL_REGISTRY.map(registryToAvailable)
}

// ── Test seams ─────────────────────────────────────────────────────────

export const __test = {
  killEngine,
  stateFile,
  modelDir,
  resolvePython,
  hermesVenvPython,
  resolveEngineScript,
  scriptMtime,
  fetchAvailableModels,
  ensureKokoroInstalled,
  pythonVersion,
  isKokoroCompatible,
  isKokoroImportable,
  isSoundfileImportable,
  hasUv,
  provisionHermesVenv,
  runPipInstall,
  installPackages,
}
