import { execFile } from 'child_process'
import { promisify } from 'util'
import { readFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

const execFileAsync = promisify(execFile)

const COPILOT_API_TOKEN_URL = 'https://api.github.com/copilot_internal/v2/token'
const COPILOT_MODELS_URL = 'https://api.githubcopilot.com/models'
const EDITOR_VERSION = 'vscode/1.104.1'
const PLUGIN_VERSION = 'copilot-chat/0.20.0'
const USER_AGENT = 'GithubCopilot/1.155.0'
const FETCH_TIMEOUT_MS = 8000
const POSITIVE_TTL_MS = 60 * 60 * 1000
const NEGATIVE_TTL_MS = 60 * 1000

export interface CopilotModelMeta {
  id: string
  preview: boolean
  disabled: boolean
}

const FALLBACK_MODELS: CopilotModelMeta[] = [
  { id: 'gpt-5.5', preview: false, disabled: false },
  { id: 'gpt-5.4', preview: false, disabled: false },
  { id: 'gpt-5.4-mini', preview: false, disabled: false },
  { id: 'gpt-5.4-nano', preview: false, disabled: false },
  { id: 'gpt-5-mini', preview: false, disabled: false },
  { id: 'gpt-5.3-codex', preview: false, disabled: false },
  { id: 'claude-opus-4.8', preview: false, disabled: false },
  { id: 'claude-opus-4.7', preview: false, disabled: false },
  { id: 'claude-opus-4.6', preview: false, disabled: false },
  { id: 'claude-opus-4.6-fast', preview: true, disabled: false },
  { id: 'claude-opus-4.5', preview: false, disabled: false },
  { id: 'claude-haiku-4.5', preview: false, disabled: false },
  { id: 'claude-sonnet-4.6', preview: false, disabled: false },
  { id: 'claude-sonnet-4.5', preview: false, disabled: false },
  { id: 'gemini-2.5-pro', preview: false, disabled: false },
  { id: 'gemini-3-flash', preview: true, disabled: false },
  { id: 'gemini-3.1-pro', preview: true, disabled: false },
  { id: 'gemini-3.5-flash', preview: false, disabled: false },
  { id: 'raptor-mini', preview: true, disabled: false },
]

interface CacheEntry {
  value: CopilotModelMeta[]
  expiresAt: number
  isFallback: boolean
}

// Cache is partitioned by oauth token: prevents a profile switch (different
// .env / different Copilot account) from hitting the previous account's model
// list + preview/disabled state. The key is a non-cryptographic hash of the
// token (we avoid using the raw token directly as the key, to reduce the risk
// of leaking it through logs/debug output). When no token is available, we use
// "__none__".
const cacheByToken: Map<string, CacheEntry> = new Map()
const inflightByToken: Map<string, Promise<CopilotModelMeta[]>> = new Map()

function tokenCacheKey(oauthToken: string): string {
  if (!oauthToken) return '__none__'
  // FNV-1a 32-bit; sufficient for a cache key
  let h = 0x811c9dc5
  for (let i = 0; i < oauthToken.length; i++) {
    h ^= oauthToken.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16)
}

function unquote(raw: string): string {
  const v = raw.trim()
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1)
  }
  return v
}

function readEnvVar(envContent: string, key: string): string {
  if (process.env[key]) return unquote(process.env[key]!)
  const m = envContent.match(new RegExp(`^${key}\\s*=\\s*(.+)`, 'm'))
  if (m && m[1].trim() && !m[1].trim().startsWith('#')) return unquote(m[1])
  return ''
}

// classic PATs (ghp_) cannot be used as Copilot OAuth tokens — mirror upstream
// hermes-agent copilot_auth.py and skip them so callers fall through.
function isUsableOAuthToken(token: string): boolean {
  if (!token) return false
  if (token.startsWith('ghp_')) return false
  return true
}

async function readGhAppsToken(): Promise<string> {
  const candidates = [
    join(homedir(), '.config', 'github-copilot', 'apps.json'),
    join(homedir(), '.config', 'github-copilot', 'hosts.json'),
  ]
  for (const path of candidates) {
    try {
      const text = await readFile(path, 'utf-8')
      const data = JSON.parse(text)
      for (const v of Object.values(data) as any[]) {
        const tok = v?.oauth_token
        if (typeof tok === 'string' && isUsableOAuthToken(tok.trim())) return tok.trim()
      }
    } catch { /* skip */ }
  }
  return ''
}

/**
 * Resolve the Copilot OAuth token in ui's priority order:
 *   1. COPILOT_GITHUB_TOKEN  2. GH_TOKEN  3. GITHUB_TOKEN
 *   4. ~/.config/github-copilot/apps.json (VS Code Copilot extension storage)
 *   5. `gh auth token` CLI fallback
 * Skips classic PATs (ghp_), matching upstream hermes-agent copilot_auth.py.
 * Single source of truth — authorization detection and model fetching should
 * both go through this function.
 */
export type CopilotTokenSource = 'env' | 'gh-cli' | 'apps-json' | null

export async function resolveCopilotOAuthTokenWithSource(
  envContent: string,
): Promise<{ token: string; source: CopilotTokenSource }> {
  for (const key of ['COPILOT_GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN']) {
    const v = readEnvVar(envContent, key)
    if (isUsableOAuthToken(v)) return { token: v, source: 'env' }
  }
  const appsToken = await readGhAppsToken()
  if (appsToken) return { token: appsToken, source: 'apps-json' }
  try {
    const { stdout } = await execFileAsync('gh', ['auth', 'token'], { timeout: 3000, windowsHide: true })
    const v = stdout.trim()
    if (isUsableOAuthToken(v)) return { token: v, source: 'gh-cli' }
  } catch { /* ignore */ }
  return { token: '', source: null }
}

export async function resolveCopilotOAuthToken(envContent: string): Promise<string> {
  const { token } = await resolveCopilotOAuthTokenWithSource(envContent)
  return token
}

async function exchangeForCopilotToken(oauthToken: string): Promise<string> {
  const res = await fetch(COPILOT_API_TOKEN_URL, {
    headers: {
      'Authorization': `token ${oauthToken}`,
      'Editor-Version': EDITOR_VERSION,
      'Editor-Plugin-Version': PLUGIN_VERSION,
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`token exchange ${res.status}`)
  const data = await res.json() as { token?: string }
  if (!data.token) throw new Error('no token in response')
  return data.token
}

// ID noise filtering:
// - text-embedding-* / *-embedding-* — embedding models (chat type already
//   filters these, but keep an explicit allowlist as defense in depth)
// - accounts/msft/routers/* — Copilot internal routing models. Their UI model
//   IDs contain slashes, which break the select box and are unreadable.
// - rerank* — rerank models
// Same approach as opencode/models.dev curated list: drop IDs that obviously
// are not for chat usage.
const NOISE_ID_PREFIXES = ['accounts/', 'text-embedding', 'rerank']

function isNoiseModelId(id: string): boolean {
  const lower = id.toLowerCase()
  return NOISE_ID_PREFIXES.some((p) => lower.startsWith(p))
}

async function fetchModelsList(copilotToken: string): Promise<CopilotModelMeta[]> {
  const res = await fetch(COPILOT_MODELS_URL, {
    headers: {
      'Authorization': `Bearer ${copilotToken}`,
      'Editor-Version': EDITOR_VERSION,
      'Copilot-Integration-Id': 'vscode-chat',
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`models fetch ${res.status}`)
  const data = await res.json() as { data?: any[] }
  if (!Array.isArray(data.data)) return []
  // Match upstream hermes-agent hermes_cli/models.py: only filter on chat type
  // and supports /chat/completions endpoint. Do not enforce
  // model_picker_enabled — users may want to use models not surfaced in the
  // IDE picker; we show the full list and let the user decide whether their
  // subscription covers each one.
  // Also strip noise IDs (embedding / rerank / router).
  const seen = new Set<string>()
  const out: CopilotModelMeta[] = []
  for (const m of data.data) {
    if (m?.capabilities?.type !== 'chat') continue
    const endpoints = m?.supported_endpoints
    if (Array.isArray(endpoints) && endpoints.length > 0) {
      if (!endpoints.includes('/chat/completions')) continue
    }
    const id = String(m?.id ?? '').trim()
    if (!id || seen.has(id)) continue
    if (isNoiseModelId(id)) continue
    seen.add(id)
    out.push({
      id,
      preview: m?.preview === true,
      disabled: m?.policy?.state === 'disabled',
    })
  }
  return out
}

async function loadModelsWithToken(oauth: string): Promise<CopilotModelMeta[]> {
  if (!oauth) throw new Error('no oauth token')
  const copilotToken = await exchangeForCopilotToken(oauth)
  const models = await fetchModelsList(copilotToken)
  if (models.length === 0) throw new Error('empty model list')
  return models
}

/**
 * Fetch the chat model list available to the current GitHub Copilot account
 * (including preview/disabled meta).
 * - Cache is partitioned by oauth token (profile switches do not cross-pollute)
 * - Positive cache TTL: 1 hour (successful results)
 * - Negative cache TTL: 60 seconds (fallback cached on failure to avoid
 *   repeated slow-path retries during transient failures)
 * - Concurrent request coalescing: simultaneous calls for the same token
 *   share a single in-flight Promise.
 */
export async function getCopilotModelsDetailed(envContent: string): Promise<CopilotModelMeta[]> {
  // Resolve the oauth token first — this only does fs reads, no network, and
  // is used as the cache key.
  const oauth = await resolveCopilotOAuthToken(envContent)
  const key = tokenCacheKey(oauth)
  const now = Date.now()
  const hit = cacheByToken.get(key)
  if (hit && hit.expiresAt > now) return hit.value
  const existing = inflightByToken.get(key)
  if (existing) return existing
  const promise = (async () => {
    try {
      const models = await loadModelsWithToken(oauth)
      cacheByToken.set(key, { value: models, expiresAt: Date.now() + POSITIVE_TTL_MS, isFallback: false })
      return models
    } catch {
      cacheByToken.set(key, { value: FALLBACK_MODELS, expiresAt: Date.now() + NEGATIVE_TTL_MS, isFallback: true })
      return FALLBACK_MODELS
    } finally {
      inflightByToken.delete(key)
    }
  })()
  inflightByToken.set(key, promise)
  return promise
}

/** Backwards-compatible wrapper: returns just the ID list. */
export async function getCopilotModels(envContent: string): Promise<string[]> {
  const detailed = await getCopilotModelsDetailed(envContent)
  return detailed.map((m) => m.id)
}

/** For tests only: clear all caches and in-flight state. */
export function __resetCopilotModelsCacheForTest(): void {
  cacheByToken.clear()
  inflightByToken.clear()
}

/**
 * Must be called after sign-out / account switch: clears the model-list cache
 * and in-flight requests across all token buckets. Otherwise the next query
 * still hits the previous account's cache (the key is a hash of the token;
 * once the token is removed the key becomes "__none__" and does not collide,
 * but the old key's stale data would still surface as expired models).
 */
export function invalidateAllCaches(): void {
  cacheByToken.clear()
  inflightByToken.clear()
}

export const COPILOT_FALLBACK_MODELS = FALLBACK_MODELS
