import { randomUUID } from 'crypto'
import { startDeviceFlow, pollDeviceFlow } from '../../services/hermes/copilot-device-flow'
import { saveEnvValue, updateConfigYaml } from '../../services/config-helpers'
import {
  invalidateAllCaches,
  resolveCopilotOAuthTokenWithSource,
  type CopilotTokenSource,
} from '../../services/hermes/copilot-models'
import { getActiveEnvPath } from '../../services/hermes/hermes-profile'
import { readAppConfig, writeAppConfig } from '../../services/app-config'
import { readFile } from 'fs/promises'
import { logger } from '../../services/logger'

const POLL_MAX_DURATION_MS = 15 * 60 * 1000 // 15 minutes hard ceiling
const SESSION_GC_GRACE_MS = 60 * 1000

interface CopilotLoginSession {
  id: string
  deviceCode: string
  userCode: string
  verificationUrl: string
  expiresIn: number
  interval: number
  status: 'pending' | 'approved' | 'denied' | 'expired' | 'error'
  error?: string
  createdAt: number
}

const sessions = new Map<string, CopilotLoginSession>()

function cleanupSessions(): void {
  const now = Date.now()
  sessions.forEach((s, id) => {
    if (now - s.createdAt > POLL_MAX_DURATION_MS + SESSION_GC_GRACE_MS) {
      sessions.delete(id)
    }
  })
}

async function persistToken(token: string): Promise<void> {
  // Symmetric with disable: only touch ~/.hermes/.env, never apps.json
  // (that file belongs to the VS Code extension).
  // Also flip `enabled` to true — by the time the device flow completes the
  // user has explicitly opted in to Copilot.
  // NOTE: We intentionally do not write process.env.COPILOT_GITHUB_TOKEN —
  // doing so would let that value persist across profile switches and keep
  // overriding resolveCopilotOAuthTokenWithSource's .env read, which would
  // resolve to the current profile's token even after the user switches
  // profiles. invalidateAllCaches() plus the .env file itself already
  // guarantee the next resolve picks up the new token.
  await saveEnvValue('COPILOT_GITHUB_TOKEN', token)
  await writeAppConfig({ copilotEnabled: true })
  invalidateAllCaches()
}

async function readEnvContent(): Promise<string> {
  try { return await readFile(getActiveEnvPath(), 'utf-8') } catch { return '' }
}

async function loginWorker(session: CopilotLoginSession): Promise<void> {
  const startTime = Date.now()
  let interval = Math.max(1, session.interval) * 1000

  while (Date.now() - startTime < POLL_MAX_DURATION_MS) {
    await new Promise((resolve) => setTimeout(resolve, interval))
    if (session.status !== 'pending') return

    const result = await pollDeviceFlow(session.deviceCode)

    if (result.kind === 'success') {
      try {
        await persistToken(result.access_token)
        session.status = 'approved'
        logger.info('Copilot OAuth login successful')
      } catch (err: any) {
        logger.error(err, 'Copilot OAuth: failed to persist token')
        session.status = 'error'
        session.error = err?.message ?? 'failed to persist token'
      }
      return
    }

    if (result.kind === 'pending') continue
    if (result.kind === 'slow_down') {
      interval += 5000
      continue
    }
    if (result.kind === 'denied') {
      session.status = 'denied'
      return
    }
    if (result.kind === 'expired') {
      session.status = 'expired'
      return
    }
    logger.error('Copilot OAuth poll error: %s %s', result.error, result.description ?? '')
    session.status = 'error'
    session.error = result.description ?? result.error
    return
  }

  session.status = 'expired'
}

export async function start(ctx: any): Promise<void> {
  cleanupSessions()
  try {
    const data = await startDeviceFlow()
    const sessionId = randomUUID()
    const session: CopilotLoginSession = {
      id: sessionId,
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUrl: data.verification_uri,
      expiresIn: data.expires_in,
      interval: data.interval,
      status: 'pending',
      createdAt: Date.now(),
    }
    sessions.set(sessionId, session)

    loginWorker(session).catch((err) => {
      logger.error(err, 'Copilot login worker error')
      session.status = 'error'
      session.error = err?.message ?? String(err)
    })

    ctx.body = {
      session_id: sessionId,
      user_code: data.user_code,
      verification_url: data.verification_uri,
      expires_in: data.expires_in,
      interval: data.interval,
    }
  } catch (err: any) {
    logger.error(err, 'Copilot OAuth start failed')
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      ctx.status = 504
      ctx.body = { error: 'GitHub timeout' }
      return
    }
    ctx.status = 502
    ctx.body = { error: err?.message ?? 'GitHub OAuth start failed' }
  }
}

export async function poll(ctx: any): Promise<void> {
  const session = sessions.get(ctx.params.sessionId)
  if (!session) {
    ctx.status = 404
    ctx.body = { error: 'Session not found' }
    return
  }
  ctx.body = { status: session.status, error: session.error || null }
}

/**
 * Reports current token resolution and whether Copilot is opt-in enabled.
 * Frontend Add Provider flow uses this to decide whether to show the
 * "token detected, click Add" confirmation or kick off device flow.
 *
 * Side effect: invalidates the model list cache so a subsequent listing
 * picks up gh-cli logout / VS Code sign-out without server restart.
 */
export async function checkToken(ctx: any): Promise<void> {
  invalidateAllCaches()
  const env = await readEnvContent()
  const { token, source } = await resolveCopilotOAuthTokenWithSource(env)
  const cfg = await readAppConfig()
  ctx.body = {
    has_token: Boolean(token),
    source: source as CopilotTokenSource,
    enabled: cfg.copilotEnabled === true,
  }
}

export async function enable(ctx: any): Promise<void> {
  await writeAppConfig({ copilotEnabled: true })
  invalidateAllCaches()
  ctx.body = { ok: true }
}

/**
 * "Soft delete" Copilot from the ui provider list.
 *   - Always: copilotEnabled = false (hides provider regardless of token source).
 *   - source='env'        → also clear ~/.hermes/.env COPILOT_GITHUB_TOKEN
 *                           (this token belongs to the hermes ecosystem).
 *   - source='gh-cli'     → leave gh CLI alone (user's terminal sessions).
 *   - source='apps-json'  → leave VS Code Copilot plugin alone.
 * The user can re-add Copilot any time via "Add Provider".
 */
export async function disable(ctx: any): Promise<void> {
  const env = await readEnvContent()
  const { source } = await resolveCopilotOAuthTokenWithSource(env)

  // Step 1: clear the default model first (the most failure-prone step:
  // writing yaml can fail). We must NOT swallow errors here — otherwise we end
  // up in the bad intermediate state "copilot is hidden from the list but
  // still set as the default model".
  let clearedDefault = false
  try {
    clearedDefault = await updateConfigYaml((cfg) => {
      const modelSection = cfg.model
      if (typeof modelSection === 'object' && modelSection !== null) {
        const provider = String(modelSection.provider || '').trim().toLowerCase()
        if (provider === 'copilot') {
          cfg.model = {}
          return { data: cfg, result: true }
        }
      }
      return { data: cfg, result: false, write: false }
    }) || false
  } catch (err: any) {
    logger.error(err, 'Copilot disable failed: cannot clear default model')
    ctx.status = 500
    ctx.body = { error: `failed to clear default model: ${err?.message ?? 'unknown error'}` }
    return
  }

  // Step 2: clear .env (only when source === 'env'). Failure here must NOT
  // silently flip the enabled flag to false.
  try {
    if (source === 'env') {
      await saveEnvValue('COPILOT_GITHUB_TOKEN', '')
      delete process.env.COPILOT_GITHUB_TOKEN
    }
  } catch (err: any) {
    logger.error(err, 'Copilot disable failed: cannot clear .env')
    ctx.status = 500
    ctx.body = { error: `failed to clear .env: ${err?.message ?? 'unknown error'}` }
    return
  }

  // Step 3: only now flip the enabled flag. Both prior steps must succeed first.
  try {
    await writeAppConfig({ copilotEnabled: false })
    invalidateAllCaches()
  } catch (err: any) {
    logger.error(err, 'Copilot disable failed: cannot persist enabled flag')
    ctx.status = 500
    ctx.body = { error: `failed to persist enabled flag: ${err?.message ?? 'unknown error'}` }
    return
  }

  ctx.body = { ok: true, cleared_env: source === 'env', cleared_default: clearedDefault }
}
