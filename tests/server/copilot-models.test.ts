import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock os.homedir before imports so file path resolution is stable.
vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os')
  return { ...actual, homedir: () => '/fake/home' }
})

const { mockReadFile, mockExecFile } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockExecFile: vi.fn(),
}))

vi.mock('fs/promises', () => ({ readFile: mockReadFile }))
vi.mock('child_process', () => ({ execFile: mockExecFile }))

import {
  resolveCopilotOAuthToken,
  getCopilotModels,
  getCopilotModelsDetailed,
  COPILOT_FALLBACK_MODELS,
  __resetCopilotModelsCacheForTest,
} from '../../packages/server/src/services/hermes/copilot-models'

const ORIGINAL_ENV = { ...process.env }
const ORIGINAL_FETCH = global.fetch

function clearTokenEnv() {
  delete process.env.COPILOT_GITHUB_TOKEN
  delete process.env.GH_TOKEN
  delete process.env.GITHUB_TOKEN
}

beforeEach(() => {
  __resetCopilotModelsCacheForTest()
  vi.clearAllMocks()
  clearTokenEnv()
  // Default: apps.json read fails (ENOENT)
  mockReadFile.mockRejectedValue(new Error('ENOENT'))
  // Default: gh CLI fails
  mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
    cb(new Error('gh not installed'), { stdout: '', stderr: '' })
  })
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  global.fetch = ORIGINAL_FETCH
})

describe('resolveCopilotOAuthToken', () => {
  it('priority: COPILOT_GITHUB_TOKEN > GH_TOKEN > GITHUB_TOKEN', async () => {
    process.env.COPILOT_GITHUB_TOKEN = 'gho_copilot'
    process.env.GH_TOKEN = 'gho_gh'
    process.env.GITHUB_TOKEN = 'gho_github'
    expect(await resolveCopilotOAuthToken('')).toBe('gho_copilot')

    delete process.env.COPILOT_GITHUB_TOKEN
    expect(await resolveCopilotOAuthToken('')).toBe('gho_gh')

    delete process.env.GH_TOKEN
    expect(await resolveCopilotOAuthToken('')).toBe('gho_github')
  })

  it('skips classic PAT (ghp_), falls back to next source', async () => {
    process.env.GH_TOKEN = 'ghp_classic_pat'
    process.env.GITHUB_TOKEN = 'gho_oauth_token'
    expect(await resolveCopilotOAuthToken('')).toBe('gho_oauth_token')
  })

  it('reads from .env and strips surrounding quotes', async () => {
    expect(await resolveCopilotOAuthToken('GH_TOKEN="gho_quoted"\n')).toBe('gho_quoted')
    expect(await resolveCopilotOAuthToken("GH_TOKEN='gho_single'\n")).toBe('gho_single')
    expect(await resolveCopilotOAuthToken('GH_TOKEN=gho_plain\n')).toBe('gho_plain')
  })

  it('ignores comment lines starting with # in .env', async () => {
    expect(await resolveCopilotOAuthToken('GH_TOKEN=# comment\n')).toBe('')
  })

  it('falls back to oauth_token in ~/.config/github-copilot/apps.json', async () => {
    mockReadFile.mockImplementation(async (p: string) => {
      if (p.includes('apps.json')) {
        return JSON.stringify({
          'github.com:abc': { oauth_token: 'gho_from_apps_json', user: 'me' },
        })
      }
      throw new Error('ENOENT')
    })
    expect(await resolveCopilotOAuthToken('')).toBe('gho_from_apps_json')
  })

  it('ghp_ tokens in apps.json should also be skipped', async () => {
    mockReadFile.mockImplementation(async (p: string) => {
      if (p.includes('apps.json')) {
        return JSON.stringify({ 'github.com:a': { oauth_token: 'ghp_pat_in_apps' } })
      }
      throw new Error('ENOENT')
    })
    expect(await resolveCopilotOAuthToken('')).toBe('')
  })

  it('last fallback to `gh auth token`', async () => {
    mockExecFile.mockImplementation((_cmd: any, _args: any, _opts: any, cb: any) => {
      cb(null, { stdout: 'gho_from_gh_cli\n', stderr: '' })
    })
    expect(await resolveCopilotOAuthToken('')).toBe('gho_from_gh_cli')
  })

  it('returns empty string when all sources fail', async () => {
    expect(await resolveCopilotOAuthToken('')).toBe('')
  })
})

describe('getCopilotModels', () => {
  function mockFetchSequence(responses: Array<Partial<Response> | Error>) {
    let i = 0
    global.fetch = vi.fn(async () => {
      const r = responses[i++]
      if (r instanceof Error) throw r
      return r as Response
    }) as any
  }

  it('fallback list contains current official Copilot models', () => {
    const ids = COPILOT_FALLBACK_MODELS.map(m => m.id)
    expect(ids).toEqual(expect.arrayContaining([
      'gpt-5.5',
      'gpt-5.4',
      'gpt-5.4-nano',
      'claude-opus-4.8',
      'gemini-3.5-flash',
      'raptor-mini',
    ]))
    expect(ids).not.toContain('grok-code-fast-1')
  })

  it('success path: returns chat-type models that support /chat/completions', async () => {
    process.env.GH_TOKEN = 'gho_token'
    mockFetchSequence([
      { ok: true, json: async () => ({ token: 'tok_copilot' }) } as any,
      {
        ok: true,
        json: async () => ({
          data: [
            { id: 'gpt-5.4', capabilities: { type: 'chat' }, supported_endpoints: ['/chat/completions'] },
            { id: 'claude-opus-4.7', capabilities: { type: 'chat' }, supported_endpoints: ['/chat/completions', '/v1/messages'] },
            { id: 'embedding-1', capabilities: { type: 'embeddings' }, supported_endpoints: ['/embeddings'] },
            { id: 'completion-only', capabilities: { type: 'chat' }, supported_endpoints: ['/completions'] },
            { id: 'no-endpoints', capabilities: { type: 'chat' } },
          ],
        }),
      } as any,
    ])
    const ids = await getCopilotModels('')
    expect(ids).toContain('gpt-5.4')
    expect(ids).toContain('claude-opus-4.7')
    expect(ids).toContain('no-endpoints') // endpoints omitted is allowed
    expect(ids).not.toContain('embedding-1')
    expect(ids).not.toContain('completion-only')
  })

  it('no longer enforces model_picker_enabled — models with picker_enabled=false are also returned', async () => {
    process.env.GH_TOKEN = 'gho_token'
    mockFetchSequence([
      { ok: true, json: async () => ({ token: 'tok' }) } as any,
      {
        ok: true,
        json: async () => ({
          data: [
            { id: 'a', capabilities: { type: 'chat' }, supported_endpoints: ['/chat/completions'], model_picker_enabled: false },
            { id: 'b', capabilities: { type: 'chat' }, supported_endpoints: ['/chat/completions'], model_picker_enabled: true },
          ],
        }),
      } as any,
    ])
    const ids = await getCopilotModels('')
    expect(ids).toEqual(expect.arrayContaining(['a', 'b']))
  })

  it('returns fallback list when there is no token', async () => {
    const ids = await getCopilotModels('')
    expect(ids).toEqual(COPILOT_FALLBACK_MODELS.map(m => m.id))
  })

  it('token exchange failure returns fallback', async () => {
    process.env.GH_TOKEN = 'gho_token'
    mockFetchSequence([{ ok: false, status: 401 } as any])
    const ids = await getCopilotModels('')
    expect(ids).toEqual(COPILOT_FALLBACK_MODELS.map(m => m.id))
  })

  it('models endpoint failure returns fallback', async () => {
    process.env.GH_TOKEN = 'gho_token'
    mockFetchSequence([
      { ok: true, json: async () => ({ token: 'tok' }) } as any,
      { ok: false, status: 503 } as any,
    ])
    const ids = await getCopilotModels('')
    expect(ids).toEqual(COPILOT_FALLBACK_MODELS.map(m => m.id))
  })

  it('network errors (such as timeout) return fallback', async () => {
    process.env.GH_TOKEN = 'gho_token'
    mockFetchSequence([new Error('AbortError: timeout')])
    const ids = await getCopilotModels('')
    expect(ids).toEqual(COPILOT_FALLBACK_MODELS.map(m => m.id))
  })

  it('positive cache hit: second call does not reissue request', async () => {
    process.env.GH_TOKEN = 'gho_token'
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'tok' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 'm1', capabilities: { type: 'chat' }, supported_endpoints: ['/chat/completions'] }] }),
      })
    global.fetch = fetchMock as any
    const a = await getCopilotModels('')
    const b = await getCopilotModels('')
    expect(a).toEqual(['m1'])
    expect(b).toEqual(['m1'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('negative cache: no retries shortly after failure', async () => {
    const fetchMock = vi.fn()
    global.fetch = fetchMock as any
    const a = await getCopilotModels('')
    const b = await getCopilotModels('')
    expect(a).toEqual(COPILOT_FALLBACK_MODELS.map(m => m.id))
    expect(b).toEqual(COPILOT_FALLBACK_MODELS.map(m => m.id))
    // when there is no token, fetch is never called
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('concurrent request coalescing: N simultaneous calls produce one request batch', async () => {
    process.env.GH_TOKEN = 'gho_token'
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'tok' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 'x', capabilities: { type: 'chat' }, supported_endpoints: ['/chat/completions'] }] }),
      })
    global.fetch = fetchMock as any
    const [a, b, c] = await Promise.all([
      getCopilotModels(''),
      getCopilotModels(''),
      getCopilotModels(''),
    ])
    expect(a).toEqual(['x'])
    expect(b).toEqual(['x'])
    expect(c).toEqual(['x'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('getCopilotModels noise filter & detailed meta', () => {
  function mockFetchSequence(responses: Array<Partial<Response> | Error>) {
    let i = 0
    global.fetch = vi.fn(async () => {
      const r = responses[i++]
      if (r instanceof Error) throw r
      return r as Response
    }) as any
  }

  it('filters out noise IDs (accounts/, text-embedding, rerank prefixes)', async () => {
    process.env.GH_TOKEN = 'gho_token'
    mockFetchSequence([
      { ok: true, json: async () => ({ token: 'tok' }) } as any,
      {
        ok: true,
        json: async () => ({
          data: [
            { id: 'gpt-5.4', capabilities: { type: 'chat' }, supported_endpoints: ['/chat/completions'] },
            { id: 'accounts/msft/routers/abc', capabilities: { type: 'chat' }, supported_endpoints: ['/chat/completions'] },
            { id: 'text-embedding-3-small', capabilities: { type: 'chat' }, supported_endpoints: ['/chat/completions'] },
            { id: 'rerank-v1', capabilities: { type: 'chat' }, supported_endpoints: ['/chat/completions'] },
          ],
        }),
      } as any,
    ])
    const ids = await getCopilotModels('')
    expect(ids).toEqual(['gpt-5.4'])
  })

  it('detailed returns preview field', async () => {
    process.env.GH_TOKEN = 'gho_token'
    mockFetchSequence([
      { ok: true, json: async () => ({ token: 'tok' }) } as any,
      {
        ok: true,
        json: async () => ({
          data: [
            { id: 'gemini-3-pro-preview', preview: true, capabilities: { type: 'chat' }, supported_endpoints: ['/chat/completions'] },
            { id: 'gpt-4o', preview: false, capabilities: { type: 'chat' }, supported_endpoints: ['/chat/completions'] },
          ],
        }),
      } as any,
    ])
    const detailed = await getCopilotModelsDetailed('')
    expect(detailed).toEqual([
      { id: 'gemini-3-pro-preview', preview: true, disabled: false },
      { id: 'gpt-4o', preview: false, disabled: false },
    ])
  })

  it('detailed returns disabled field (policy.state === "disabled")', async () => {
    process.env.GH_TOKEN = 'gho_token'
    mockFetchSequence([
      { ok: true, json: async () => ({ token: 'tok' }) } as any,
      {
        ok: true,
        json: async () => ({
          data: [
            { id: 'gpt-3.5-turbo', policy: { state: 'disabled' }, capabilities: { type: 'chat' }, supported_endpoints: ['/chat/completions'] },
            { id: 'gpt-4o', policy: { state: 'enabled' }, capabilities: { type: 'chat' }, supported_endpoints: ['/chat/completions'] },
            { id: 'claude-sonnet-4', capabilities: { type: 'chat' }, supported_endpoints: ['/chat/completions'] },
          ],
        }),
      } as any,
    ])
    const detailed = await getCopilotModelsDetailed('')
    const map = new Map(detailed.map((m) => [m.id, m]))
    expect(map.get('gpt-3.5-turbo')?.disabled).toBe(true)
    expect(map.get('gpt-4o')?.disabled).toBe(false)
    expect(map.get('claude-sonnet-4')?.disabled).toBe(false)
  })

  it('cache is isolated by oauth token: switching accounts triggers a refetch', async () => {
    const fetchMock = vi.fn()
      // account A: token exchange + models
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'tokA' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 'model-a', capabilities: { type: 'chat' }, supported_endpoints: ['/chat/completions'] }] }),
      })
      // account B: another set of token exchange + models
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'tokB' }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ id: 'model-b', capabilities: { type: 'chat' }, supported_endpoints: ['/chat/completions'] }] }),
      })
    global.fetch = fetchMock as any

    process.env.GH_TOKEN = 'gho_account_A'
    const a = await getCopilotModels('')
    expect(a).toEqual(['model-a'])

    // switch to account B, do not reset cache
    process.env.GH_TOKEN = 'gho_account_B'
    const b = await getCopilotModels('')
    expect(b).toEqual(['model-b'])

    // switch back to A: should hit A cache (no further request)
    process.env.GH_TOKEN = 'gho_account_A'
    const a2 = await getCopilotModels('')
    expect(a2).toEqual(['model-a'])

    // 4 total requests (A.exchange, A.models, B.exchange, B.models), A cache hit on switch-back
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})
