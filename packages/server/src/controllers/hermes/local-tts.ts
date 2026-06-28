import type { Context } from 'koa'
import { logger } from '../../services/logger'
import {
  downloadLocalModel,
  fetchAvailableModels,
  getLocalTtsStatus,
  removeLocalModel,
} from '../../services/hermes/local-tts/engine-manager'

function currentUserId(ctx: Context): number | null {
  const rawUserId = ctx.state?.user?.id
  const userId = typeof rawUserId === 'number' ? rawUserId : Number.NaN
  return Number.isInteger(userId) && userId > 0 ? userId : null
}

function authUserId(ctx: Context): number | null {
  const userId = currentUserId(ctx)
  if (!userId) {
    ctx.status = 401
    ctx.body = { error: 'Unauthorized' }
    return null
  }
  return userId
}

export async function getStatus(ctx: Context) {
  if (!authUserId(ctx)) return
  ctx.body = getLocalTtsStatus()
}

export async function startDownload(ctx: Context) {
  if (!authUserId(ctx)) return

  try {
    // The engine-manager persists install/download progress into its state file
    // as it works; the client polls GET /status to render it. This request only
    // resolves once the whole download finishes (or fails).
    const result = await downloadLocalModel()
    ctx.body = { ok: true, ...result }
  } catch (err) {
    ctx.status = 500
    ctx.body = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function removeModel(ctx: Context) {
  if (!authUserId(ctx)) return
  removeLocalModel()
  ctx.body = { ok: true }
}

export async function listAvailableModels(ctx: Context) {
  if (!authUserId(ctx)) return
  try {
    const models = await fetchAvailableModels()
    ctx.body = { models }
  } catch (err) {
    logger.warn({ err }, 'failed to fetch local TTS models from GitHub')
    ctx.status = 502
    ctx.body = { error: err instanceof Error ? err.message : String(err) }
  }
}
