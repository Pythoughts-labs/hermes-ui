import type { Context } from 'koa'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { config } from '../../config'
import { getActiveProfileName, getProfileDir, listProfileNamesFromDisk } from '../../services/hermes/hermes-profile'

const XAI_VIDEO_GENERATIONS_URL = 'https://api.x.ai/v1/videos/generations'
const XAI_VIDEO_STATUS_URL = 'https://api.x.ai/v1/videos'
const XAI_VIDEO_MODEL = 'grok-imagine-video'
const DEFAULT_POLL_INTERVAL_MS = 5000
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000

function requestedProfileName(ctx: Context): string {
  const headerProfile = ctx.get('x-hermes-profile')
  const queryProfile = typeof ctx.query.profile === 'string' ? ctx.query.profile : ''
  const body = ctx.request.body as { profile?: unknown } | undefined
  const bodyProfile = typeof body?.profile === 'string' ? body.profile : ''
  return (ctx.state.profile?.name || headerProfile || queryProfile || bodyProfile || '').trim()
}

function resolveMediaProfile(ctx: Context): string {
  let requested = requestedProfileName(ctx)
  if (!requested && ctx.state.user?.role !== 'super_admin' && !ctx.state.serverTokenAuth) {
    const profiles = ctx.state.user?.profiles || []
    if (profiles.length === 1) {
      requested = profiles[0]
    } else {
      const err: any = new Error('Profile is required')
      err.status = 400
      err.code = 'profile_required'
      throw err
    }
  }

  const profile = requested || getActiveProfileName() || 'default'
  if (!listProfileNamesFromDisk().includes(profile)) {
    const err: any = new Error(`Profile "${profile}" does not exist`)
    err.status = 404
    err.code = 'profile_not_found'
    throw err
  }
  return profile
}

function readJsonFile(path: string): any {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

function authPathForProfile(profile: string): string {
  return join(getProfileDir(profile), 'auth.json')
}

function mimeFromPath(path: string): string | null {
  const ext = path.toLowerCase().split('.').pop() || ''
  if (ext === 'png') return 'image/png'
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return null
}

function mimeFromMagic(buffer: Buffer): string | null {
  if (buffer.length >= 8 &&
      buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png'
  }
  if (buffer.length >= 3 &&
      buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg'
  }
  if (buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp'
  }
  if (buffer.length >= 6 &&
      (buffer.toString('ascii', 0, 6) === 'GIF87a' || buffer.toString('ascii', 0, 6) === 'GIF89a')) {
    return 'image/gif'
  }
  return null
}

function imagePathToDataUri(imagePath: string): string {
  const image = readFileSync(imagePath)
  const mime = mimeFromMagic(image) || mimeFromPath(imagePath) || 'application/octet-stream'
  return `data:${mime};base64,${image.toString('base64')}`
}

function normalizeImageInput(body: any): string {
  if (typeof body.image_data_uri === 'string' && body.image_data_uri.startsWith('data:image/')) {
    return body.image_data_uri
  }
  if (typeof body.image_url === 'string' && body.image_url) {
    return body.image_url
  }
  if (typeof body.image_path === 'string' && body.image_path) {
    return imagePathToDataUri(body.image_path)
  }
  throw Object.assign(new Error('image_data_uri, image_url, or image_path is required'), { status: 400, code: 'missing_image' })
}

function normalizeDuration(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return 8
  return Math.max(1, Math.min(n, 30))
}

export function defaultMediaOutputPath(requestId: string, now = new Date()): string {
  const safeRequestId = requestId.replace(/[^A-Za-z0-9_-]/g, '_') || `video_${now.getTime()}`
  return join(config.appHome, 'media', `${safeRequestId}.mp4`)
}

function resolveXaiToken(profile: string): { token: string; source: string } | null {
  const auth = readJsonFile(authPathForProfile(profile)) as { providers?: Record<string, { access_token?: string }> } | null
  const xaiProvider = auth?.providers?.xai
  const oauthToken = typeof xaiProvider?.access_token === 'string' ? xaiProvider.access_token.trim() : ''
  if (oauthToken) return { token: oauthToken, source: 'oauth' }
  const envToken = process.env.XAI_API_KEY?.trim()
  if (envToken) return { token: envToken, source: 'env' }
  return null
}

async function requestXaiJson(url: string, token: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  let data: any = null
  try { data = text ? JSON.parse(text) : null } catch {}
  if (!res.ok) {
    const detail = data?.error?.message || data?.error || text || res.statusText
    const err: any = new Error(`xAI request failed: ${res.status} ${detail}`)
    err.status = res.status === 401 || res.status === 403 ? 502 : 502
    throw err
  }
  return data
}

async function downloadVideo(url: string, outputPath: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`failed to download generated video: ${res.status} ${res.statusText}`)
  const arrayBuffer = await res.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, buffer)
}

export async function grokImageToVideo(ctx: Context) {
  let profile: string
  try {
    profile = resolveMediaProfile(ctx)
  } catch (err: any) {
    ctx.status = err.status || 400
    ctx.body = { error: err.message || String(err), code: err.code || 'invalid_profile' }
    return
  }

  const tokenInfo = resolveXaiToken(profile)
  if (!tokenInfo) {
    ctx.status = 401
    ctx.body = {
      error: `Missing xAI token for profile "${profile}". Set XAI_API_KEY or complete xAI OAuth login first.`,
      code: 'missing_xai_token',
    }
    return
  }

  const body = ctx.request.body as any
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
  if (!prompt) {
    ctx.status = 400
    ctx.body = { error: 'prompt is required', code: 'missing_prompt' }
    return
  }

  try {
    const image = normalizeImageInput(body)
    const duration = normalizeDuration(body.duration)
    const rawTimeoutMs = Number(body.timeout_ms || DEFAULT_TIMEOUT_MS)
    const timeoutMs = Number.isFinite(rawTimeoutMs)
      ? Math.max(10000, Math.min(rawTimeoutMs, 30 * 60 * 1000))
      : DEFAULT_TIMEOUT_MS
    const requestedOutputPath = typeof body.output_path === 'string' ? body.output_path.trim() : ''

    const started = await requestXaiJson(XAI_VIDEO_GENERATIONS_URL, tokenInfo.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: XAI_VIDEO_MODEL,
        prompt,
        image: { url: image },
        duration,
      }),
    })
    const requestId = String(started?.request_id || '').trim()
    if (!requestId) throw new Error('xAI response missing request_id')

    const deadline = Date.now() + timeoutMs
    let latest: any = null
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, DEFAULT_POLL_INTERVAL_MS))
      latest = await requestXaiJson(`${XAI_VIDEO_STATUS_URL}/${encodeURIComponent(requestId)}`, tokenInfo.token)
      if (latest?.status === 'done') {
        const videoUrl = String(latest?.video?.url || '').trim()
        const outputPath = requestedOutputPath || defaultMediaOutputPath(requestId)
        if (videoUrl) await downloadVideo(videoUrl, outputPath)
        ctx.body = {
          request_id: requestId,
          status: latest.status,
          video_url: videoUrl,
          output_path: outputPath,
          token_source: tokenInfo.source,
          profile,
        }
        return
      }
      if (latest?.status === 'expired' || latest?.status === 'failed' || latest?.status === 'error') {
        ctx.status = 502
        ctx.body = { request_id: requestId, status: latest.status, error: latest?.error || 'xAI video generation failed' }
        return
      }
    }

    ctx.status = 504
    ctx.body = { request_id: requestId, status: latest?.status || 'pending', error: 'Timed out waiting for xAI video generation' }
  } catch (err: any) {
    ctx.status = err.status || 500
    ctx.body = { error: err.message || String(err) }
  }
}
