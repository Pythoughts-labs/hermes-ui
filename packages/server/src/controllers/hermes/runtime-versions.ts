import type { Context } from 'koa'
import {
  activateInstalledRuntimeVersion,
  activateDownloadedUiVersion,
  deleteDownloadedUiVersion,
  deleteInstalledRuntimeVersion,
  getVersionDownloadJob,
  getRuntimeVersionStatus,
  listVersionDownloadJobs,
  startRuntimeVersionDownload,
  startUiVersionDownload,
} from '../../services/runtime-version-manager'

export async function status(ctx: Context) {
  ctx.body = await getRuntimeVersionStatus()
}

export async function activateRuntime(ctx: Context) {
  const body = ctx.request.body as { version?: unknown }
  const version = typeof body?.version === 'string' ? body.version : ''
  try {
    const active = activateInstalledRuntimeVersion(version)
    ctx.body = { success: true, active }
  } catch (err) {
    ctx.status = 400
    ctx.body = { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function deleteRuntime(ctx: Context) {
  const version = String(ctx.params.version || '')
  try {
    const deleted = deleteInstalledRuntimeVersion(version)
    ctx.body = { success: true, deleted }
  } catch (err) {
    ctx.status = 400
    ctx.body = { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function activateUi(ctx: Context) {
  const body = ctx.request.body as { version?: unknown }
  const version = typeof body?.version === 'string' ? body.version : ''
  try {
    const active = activateDownloadedUiVersion(version)
    ctx.body = { success: true, active }
  } catch (err) {
    ctx.status = 400
    ctx.body = { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function deleteUi(ctx: Context) {
  const version = String(ctx.params.version || '')
  try {
    const deleted = deleteDownloadedUiVersion(version)
    ctx.body = { success: true, deleted }
  } catch (err) {
    ctx.status = 400
    ctx.body = { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function downloadRuntime(ctx: Context) {
  const body = ctx.request.body as { version?: unknown }
  const version = typeof body?.version === 'string' ? body.version : ''
  try {
    const job = startRuntimeVersionDownload(version)
    ctx.status = 202
    ctx.body = { success: true, job }
  } catch (err) {
    ctx.status = 400
    ctx.body = { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function downloadUi(ctx: Context) {
  const body = ctx.request.body as { version?: unknown }
  const version = typeof body?.version === 'string' ? body.version : ''
  try {
    const job = startUiVersionDownload(version)
    ctx.status = 202
    ctx.body = { success: true, job }
  } catch (err) {
    ctx.status = 400
    ctx.body = { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function jobs(ctx: Context) {
  ctx.body = { jobs: listVersionDownloadJobs() }
}

export async function job(ctx: Context) {
  const id = String(ctx.params.id || '')
  const downloadJob = getVersionDownloadJob(id)
  if (!downloadJob) {
    ctx.status = 404
    ctx.body = { error: 'Version download job not found' }
    return
  }
  ctx.body = downloadJob
}