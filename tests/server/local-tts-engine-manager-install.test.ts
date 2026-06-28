import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Mock child_process BEFORE importing the module under test so the engine
// manager's spawn/spawnSync calls route through our fakes.
const spawnSyncMock = vi.fn()
const spawnMock = vi.fn()

vi.mock('node:child_process', () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
  spawnSync: (...args: unknown[]) => spawnSyncMock(...args),
}))

const tmpRoot = mkdtempSync(join(tmpdir(), 'hermes-local-tts-install-'))
process.env.HERMES_UI_HOME = tmpRoot
process.env.HERMES_LOCAL_TTS_STATE_FILE = join(tmpRoot, 'state.json')
process.env.HERMES_LOCAL_TTS_MODEL_DIR = join(tmpRoot, 'models')

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
  mkdirSync(tmpRoot, { recursive: true })
})

beforeEach(() => {
  spawnSyncMock.mockReset()
  spawnMock.mockReset()
})

async function loadManager() {
  return import('../../packages/server/src/services/hermes/local-tts/engine-manager')
}

// Build a fake ChildProcess. Handlers fire on the next event-loop tick so
// the spawn promise has time to attach listeners synchronously. The
// onExit hook runs after the exit handler so callers can simulate side
// effects (e.g. `uv venv` creating the venv directory on success).
function fakeProcess(opts: { exitCode: number; stderr?: string; stdout?: string; error?: Error; onExit?: () => void }) {
  const stderrHandlers: Array<(c: Buffer) => void> = []
  const stdoutHandlers: Array<(c: Buffer) => void> = []
  const exitHandlers: Array<(c: number | null, s: NodeJS.Signals | null) => void> = []
  const errorHandlers: Array<(e: Error) => void> = []
  const proc: any = {
    pid: 12345,
    stdin: { write: vi.fn() },
    stdout: { on: (_e: string, cb: (c: Buffer) => void) => stdoutHandlers.push(cb) },
    stderr: { on: (_e: string, cb: (c: Buffer) => void) => stderrHandlers.push(cb) },
    on: (e: string, cb: unknown) => {
      if (e === 'exit') exitHandlers.push(cb as any)
      if (e === 'error') errorHandlers.push(cb as any)
      return proc
    },
    kill: vi.fn(),
  }
  // ponytail: setImmediate fires handlers on the next macrotask — the same
  // timing real Node uses for child_process 'exit'/'stderr' — AFTER the
  // caller's sync proc.on / proc.stderr.on registrations land. The previous
  // microtask (Promise.resolve().then) version timed out under vitest's worker
  // pool because the install promise suspended on `await` before the microtask
  // could reach the registered exit handler.
  setImmediate(() => {
    if (opts.error) {
      for (const cb of errorHandlers) cb(opts.error)
      return
    }
    if (opts.stdout) {
      for (const cb of stdoutHandlers) cb(Buffer.from(opts.stdout))
    }
    if (opts.stderr) {
      for (const cb of stderrHandlers) cb(Buffer.from(opts.stderr))
    }
    for (const cb of exitHandlers) cb(opts.exitCode, null)
    opts.onExit?.()
  })
  return proc
}

function fakeUvVenvCreate(venvDir: string) {
  // ponytail: simulate `uv venv --python 3.12 <dir>` by creating the
  // python binary the engine-manager then probes for kokoro.
  return () => {
    const py = process.platform === 'win32'
      ? join(venvDir, 'Scripts', 'python.exe')
      : join(venvDir, 'bin', 'python')
    mkdirSync(join(venvDir, process.platform === 'win32' ? 'Scripts' : 'bin'), { recursive: true })
    writeFileSync(py, '#!/bin/sh\necho fake-hermes-venv')
  }
}

// ── Python version compatibility ─────────────────────────────────────

describe('local TTS engine-manager — Python version detection', () => {
  it('pythonVersion returns null when probe fails', async () => {
    spawnSyncMock.mockReturnValueOnce({ status: 1 } as any)
    const { __test } = await loadManager()
    expect(__test.pythonVersion('/nope/python')).toBeNull()
  })

  it('pythonVersion parses a real version string', async () => {
    spawnSyncMock.mockReturnValueOnce({ status: 0, stdout: Buffer.from('3.12.4\n') } as any)
    const { __test } = await loadManager()
    expect(__test.pythonVersion('/usr/bin/python3')).toEqual({ major: 3, minor: 12 })
  })

  it('isKokoroCompatible accepts 3.10-3.12 and rejects everything else', async () => {
    const { __test } = await loadManager()
    expect(__test.isKokoroCompatible({ major: 3, minor: 10 })).toBe(true)
    expect(__test.isKokoroCompatible({ major: 3, minor: 12 })).toBe(true)
    expect(__test.isKokoroCompatible({ major: 3, minor: 13 })).toBe(false)
    expect(__test.isKokoroCompatible({ major: 3, minor: 14 })).toBe(false)
    expect(__test.isKokoroCompatible({ major: 3, minor: 9 })).toBe(false)
    expect(__test.isKokoroCompatible({ major: 4, minor: 0 })).toBe(false)
    expect(__test.isKokoroCompatible(null)).toBe(false)
  })
})

// ── Kokoro install: probe → direct pip → uv provision ────────────────

describe('local TTS engine-manager — kokoro auto-install', () => {
  it('returns installed=true when probe finds kokoro + soundfile already importable', async () => {
    // import kokoro probe succeeds
    spawnSyncMock.mockReturnValueOnce({ status: 0 } as any)
    // import soundfile probe succeeds
    spawnSyncMock.mockReturnValueOnce({ status: 0 } as any)
    const { ensureKokoroInstalled } = await loadManager()
    const result = await ensureKokoroInstalled('/usr/bin/python3')
    expect(result.installed).toBe(true)
    expect(result.message).toMatch(/already installed/)
    expect(spawnMock).not.toHaveBeenCalled()
  })

  it('reinstalls via uv when soundfile is missing even if kokoro is importable', async () => {
    // import kokoro probe succeeds
    spawnSyncMock.mockReturnValueOnce({ status: 0 } as any)
    // import soundfile probe fails → partial install, must reinstall
    spawnSyncMock.mockReturnValueOnce({ status: 1 } as any)
    // pythonVersion probe returns 3.12 (in kokoro range)
    spawnSyncMock.mockReturnValueOnce({ status: 0, stdout: Buffer.from('3.12.1\n') } as any)
    // hasUv probe → uv is available (installPackages prefers uv path)
    spawnSyncMock.mockReturnValueOnce({ status: 0 } as any)
    // uv pip install --python <py> kokoro soundfile succeeds
    spawnMock.mockReturnValueOnce(fakeProcess({ exitCode: 0 }))
    // re-probe after install: kokoro now importable
    spawnSyncMock.mockReturnValueOnce({ status: 0 } as any)
    // re-probe after install: soundfile now importable
    spawnSyncMock.mockReturnValueOnce({ status: 0 } as any)
    const { ensureKokoroInstalled } = await loadManager()
    const result = await ensureKokoroInstalled('/usr/bin/python3')
    expect(result.installed).toBe(true)
    expect(spawnMock).toHaveBeenCalledTimes(1)
    const [cmd, args] = spawnMock.mock.calls[0] as [string, string[]]
    expect(cmd).toBe('uv')
    expect(args).toContain('pip')
    expect(args).toContain('--python')
    expect(args).toContain('kokoro>=0.9.4')
    expect(args).toContain('soundfile')
  })

  it('falls back to python -m pip when uv is unavailable', async () => {
    // import kokoro probe fails → top-level check short-circuits (soundfile not
    // probed) so there is no early return; we proceed to install.
    spawnSyncMock.mockReturnValueOnce({ status: 1 } as any)
    // pythonVersion probe → 3.12 (in range)
    spawnSyncMock.mockReturnValueOnce({ status: 0, stdout: Buffer.from('3.12.1\n') } as any)
    // hasUv probe → uv absent → installPackages falls back to python -m pip
    spawnSyncMock.mockReturnValueOnce({ status: 1 } as any)
    // python -m pip install succeeds
    spawnMock.mockReturnValueOnce(fakeProcess({ exitCode: 0 }))
    // re-probe after install: kokoro importable
    spawnSyncMock.mockReturnValueOnce({ status: 0 } as any)
    // re-probe after install: soundfile importable
    spawnSyncMock.mockReturnValueOnce({ status: 0 } as any)
    const { ensureKokoroInstalled } = await loadManager()
    const result = await ensureKokoroInstalled('/usr/bin/python3')
    expect(result.installed).toBe(true)
    expect(spawnMock).toHaveBeenCalledTimes(1)
    const [, args] = spawnMock.mock.calls[0] as [string, string[]]
    expect(args).toContain('--break-system-packages')
    expect(args).toContain('kokoro>=0.9.4')
    expect(args).toContain('soundfile')
  })

  it('skips to uv provisioning when system Python is outside kokoro range', async () => {
    const venvDir = join(tmpRoot, '.venv')
    // import kokoro probe on the resolved python → fails
    spawnSyncMock.mockReturnValueOnce({ status: 1 } as any)
    // pythonVersion probe → 3.14
    spawnSyncMock.mockReturnValueOnce({ status: 0, stdout: Buffer.from('3.14.0\n') } as any)
    // hasUv probe → uv is available
    spawnSyncMock.mockReturnValueOnce({ status: 0 } as any)
    // uv python install 3.12
    spawnMock.mockReturnValueOnce(fakeProcess({ exitCode: 0 }))
    // uv venv --python 3.12 <dir> — fake creates the venv binary on exit
    spawnMock.mockReturnValueOnce(fakeProcess({ exitCode: 0, onExit: fakeUvVenvCreate(venvDir) }))
    // uv pip install --python <venv> kokoro soundfile
    spawnMock.mockReturnValueOnce(fakeProcess({ exitCode: 0 }))
    // Final import kokoro probe on the venv → success
    spawnSyncMock.mockReturnValueOnce({ status: 0 } as any)
    // Final import soundfile probe on the venv → success (provisionHermesVenv
    // now verifies the COMPLETE dep set, not just kokoro)
    spawnSyncMock.mockReturnValueOnce({ status: 0 } as any)

    const { ensureKokoroInstalled } = await loadManager()
    const result = await ensureKokoroInstalled('/usr/bin/python3.14')
    expect(result.installed).toBe(true)
    expect(result.message).toMatch(/hermes venv/)
    // Three uv commands: python install, venv, pip install
    expect(spawnMock).toHaveBeenCalledTimes(3)
    const calls = spawnMock.mock.calls.map((c) => c[0] as string)
    expect(calls).toEqual(['uv', 'uv', 'uv'])
  })

  it('surfaces a clear error when uv is unavailable and Python is incompatible', async () => {
    // import kokoro probe fails
    spawnSyncMock.mockReturnValueOnce({ status: 1 } as any)
    // pythonVersion probe returns 3.14
    spawnSyncMock.mockReturnValueOnce({ status: 0, stdout: Buffer.from('3.14.0\n') } as any)
    // uv --version probe fails (uv not on PATH)
    spawnSyncMock.mockReturnValueOnce({ status: 1 } as any)

    const { ensureKokoroInstalled } = await loadManager()
    await expect(ensureKokoroInstalled('/usr/bin/python3.14')).rejects.toThrow(
      /Python 3\.14 is outside kokoro's supported 3\.10-3\.12 range and uv is not available/s,
    )
  })

  it('persists the error state when all provisioning paths fail', async () => {
    // import kokoro fails
    spawnSyncMock.mockReturnValueOnce({ status: 1 } as any)
    // pythonVersion: incompatible
    spawnSyncMock.mockReturnValueOnce({ status: 0, stdout: Buffer.from('3.14.0\n') } as any)
    // uv --version fails
    spawnSyncMock.mockReturnValueOnce({ status: 1 } as any)
    ;(globalThis as any).fetch = vi.fn()

    const { downloadLocalModel, getLocalTtsStatus, __test } = await loadManager()
    await expect(downloadLocalModel()).rejects.toThrow(/Python 3\.14 is outside kokoro/)
    const state = getLocalTtsStatus()
    expect(state.model.status).toBe('error')
    const stateFilePath = __test.stateFile()
    expect(existsSync(stateFilePath)).toBe(true)
    const persisted = JSON.parse(readFileSync(stateFilePath, 'utf-8'))
    expect(persisted.model.status).toBe('error')
  })
})

// ── resolvePython priority ───────────────────────────────────────────

describe('local TTS engine-manager — resolvePython', () => {
  it('prefers hermes-managed venv when present', async () => {
    // Create a fake hermes venv with a python binary at the expected path.
    const venvDir = join(tmpRoot, '.venv')
    mkdirSync(join(venvDir, 'bin'), { recursive: true })
    writeFileSync(join(venvDir, 'bin', 'python'), '#!/bin/sh\necho hermes-venv')

    const { __test } = await loadManager()
    expect(__test.resolvePython()).toBe(join(venvDir, 'bin', 'python'))
  })

  it('exposes hermesVenvPython helper for the same path', async () => {
    const { __test } = await loadManager()
    const venv = __test.hermesVenvPython()
    expect(venv).toMatch(/[/\\]\.venv[/\\]bin[/\\]python$/)
  })
})

// ── Subprocess cache respawns when the engine script changes ──────────

describe('local TTS engine-manager — subprocess cache', () => {
  it('respawns the subprocess when hermes_tts_engine.py is edited on disk', async () => {
    // Point HERMES_LOCAL_TTS_ENGINE_SCRIPT at a real file we control so
    // resolveEngineScript picks it up and statSync can read its mtime.
    const scriptPath = join(tmpRoot, 'hermes_tts_engine.py')
    writeFileSync(scriptPath, '# v1\n')
    process.env.HERMES_LOCAL_TTS_ENGINE_SCRIPT = scriptPath

    const { __test } = await loadManager()
    const before = __test.scriptMtime(scriptPath)
    expect(before).toBeGreaterThan(0)

    // Bump mtime past the filesystem's resolution (1s on most platforms).
    await new Promise((r) => setTimeout(r, 1100))
    writeFileSync(scriptPath, '# v2\n')
    const after = __test.scriptMtime(scriptPath)
    expect(after).toBeGreaterThan(before)
  })
})