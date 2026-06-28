import { request } from '@/api/client'

export interface ActiveVersionManifest {
  schema: number
  hermesRuntimeVersion?: string
  uiVersion?: string
  runtimeDirectory?: string
  uiDirectory?: string
  platform?: string
  updatedAt?: string
}

export interface InstalledRuntimeVersion {
  version: string
  platform: string
  directory: string
  active: boolean
  manifestHermesRuntimeVersion?: string
}

export interface InstalledUiVersion {
  version: string
  directory: string
  active: boolean
}

export type VersionDownloadKind = 'runtime' | 'ui'
export type VersionDownloadJobStatus = 'queued' | 'running' | 'completed' | 'failed'
export type VersionDownloadStage = 'queued' | 'resolve' | 'download' | 'verify' | 'extract' | 'install' | 'completed' | 'failed'

export interface VersionDownloadJob {
  id: string
  kind: VersionDownloadKind
  version: string
  status: VersionDownloadJobStatus
  stage: VersionDownloadStage
  message: string
  error: string
  percent?: number
  receivedBytes?: number
  totalBytes?: number
  createdAt: string
  updatedAt: string
  result?: InstalledRuntimeVersion | InstalledUiVersion
}

export interface RuntimeVersionStatus {
  active: ActiveVersionManifest | null
  platform: string
  activeVersionPath: string
  remoteManifestUrl: string
  remoteError: string
  hermes: {
    activeVersion: string
    activeDirectory: string
    installed: InstalledRuntimeVersion[]
    remoteVersions: string[]
  }
  ui: {
    currentVersion: string
    activeVersion: string
    activeDirectory: string
    installed: InstalledUiVersion[]
    remoteVersions: string[]
  }
}

export async function fetchRuntimeVersionStatus(): Promise<RuntimeVersionStatus> {
  return request<RuntimeVersionStatus>('/api/hermes/runtime-versions')
}

export async function activateRuntimeVersion(version: string): Promise<{ success: boolean; active: ActiveVersionManifest }> {
  return request<{ success: boolean; active: ActiveVersionManifest }>('/api/hermes/runtime-versions/active-runtime', {
    method: 'POST',
    body: JSON.stringify({ version }),
  })
}

export async function activateUiVersion(version: string): Promise<{ success: boolean; active: ActiveVersionManifest }> {
  return request<{ success: boolean; active: ActiveVersionManifest }>('/api/hermes/runtime-versions/active-ui', {
    method: 'POST',
    body: JSON.stringify({ version }),
  })
}

export async function downloadRuntimeVersion(version: string): Promise<{ success: boolean; job: VersionDownloadJob }> {
  return request<{ success: boolean; job: VersionDownloadJob }>('/api/hermes/runtime-versions/runtime/download', {
    method: 'POST',
    body: JSON.stringify({ version }),
  })
}

export async function deleteRuntimeVersion(version: string): Promise<{ success: boolean; deleted: InstalledRuntimeVersion }> {
  return request<{ success: boolean; deleted: InstalledRuntimeVersion }>(`/api/hermes/runtime-versions/runtime/${encodeURIComponent(version)}`, {
    method: 'DELETE',
  })
}

export async function downloadUiVersion(version: string): Promise<{ success: boolean; job: VersionDownloadJob }> {
  return request<{ success: boolean; job: VersionDownloadJob }>('/api/hermes/runtime-versions/ui/download', {
    method: 'POST',
    body: JSON.stringify({ version }),
  })
}

export async function deleteUiVersion(version: string): Promise<{ success: boolean; deleted: InstalledUiVersion }> {
  return request<{ success: boolean; deleted: InstalledUiVersion }>(`/api/hermes/runtime-versions/ui/${encodeURIComponent(version)}`, {
    method: 'DELETE',
  })
}

export async function fetchVersionDownloadJobs(): Promise<{ jobs: VersionDownloadJob[] }> {
  return request<{ jobs: VersionDownloadJob[] }>('/api/hermes/runtime-versions/jobs')
}

export async function fetchVersionDownloadJob(id: string): Promise<VersionDownloadJob> {
  return request<VersionDownloadJob>(`/api/hermes/runtime-versions/jobs/${encodeURIComponent(id)}`)
}