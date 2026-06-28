import { request } from '../client'
import type { TtsProviderId } from './tts'

export type StoredTtsProvider = TtsProviderId

export interface TtsStoredSettings {
  baseUrl?: string
  baseUrlPresets?: string[]
  model?: string
  voice?: string
  rate?: string
  pitch?: string
  authMode?: string
  voiceMode?: string
  voiceDesignDesc?: string
  voiceCloneFormat?: string
  stylePrompt?: string
}

export interface TtsStoredSecretsInput {
  apiKey?: string
}

export interface TtsStoredSecretsResponse {
  apiKey?: '[stored]'
}

export interface TtsProviderSettingsResponse {
  provider: StoredTtsProvider
  settings: TtsStoredSettings
  secrets: TtsStoredSecretsResponse
  createdAt?: number
  updatedAt: number
}

export interface FetchTtsSettingsResponse {
  providers: TtsProviderSettingsResponse[]
  activeProvider?: StoredTtsProvider | null
}

function normalizeActiveProvider(value: unknown): StoredTtsProvider | null {
  return value === 'local' || value === 'openai' || value === 'custom' || value === 'mimo' || value === 'doubao' ? value : null
}

function normalizeProviders(body: unknown): FetchTtsSettingsResponse {
  if (body && typeof body === 'object') {
    const payload = body as { providers?: unknown; settings?: unknown; activeProvider?: unknown }
    const activeProvider = normalizeActiveProvider(payload.activeProvider)
    if (Array.isArray(payload.providers)) {
      return { providers: payload.providers as TtsProviderSettingsResponse[], activeProvider }
    }
    if (Array.isArray(payload.settings)) {
      return { providers: payload.settings as TtsProviderSettingsResponse[], activeProvider }
    }
  }
  return { providers: [], activeProvider: null }
}

export async function fetchTtsSettings(): Promise<FetchTtsSettingsResponse> {
  const body = await request<{ providers?: TtsProviderSettingsResponse[]; settings?: TtsProviderSettingsResponse[]; activeProvider?: StoredTtsProvider | null }>(
    '/api/hermes/tts/settings',
  )
  return normalizeProviders(body)
}

export async function saveTtsSettings(
  provider: StoredTtsProvider,
  payload: { settings?: TtsStoredSettings; secrets?: TtsStoredSecretsInput; activeProvider?: StoredTtsProvider },
): Promise<TtsProviderSettingsResponse> {
  const body = await request<TtsProviderSettingsResponse | { setting: TtsProviderSettingsResponse }>(
    `/api/hermes/tts/settings/${provider}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
  )
  return typeof body === 'object' && body !== null && 'setting' in body ? body.setting : body
}

export async function saveActiveTtsProvider(provider: StoredTtsProvider): Promise<StoredTtsProvider> {
  const body = await request<{ activeProvider: StoredTtsProvider }>(
    '/api/hermes/tts/settings/active',
    {
      method: 'PUT',
      body: JSON.stringify({ provider }),
    },
  )
  return body.activeProvider
}

export async function clearTtsSecret(
  provider: StoredTtsProvider,
  secretName: keyof TtsStoredSecretsInput,
): Promise<TtsProviderSettingsResponse | null> {
  const body = await request<
    TtsProviderSettingsResponse |
    { setting: TtsProviderSettingsResponse | null } |
    { success?: boolean; setting: TtsProviderSettingsResponse | null }
  >(
    `/api/hermes/tts/settings/${provider}/secret/${secretName}`,
    { method: 'DELETE' },
  )

  if (body && typeof body === 'object' && 'setting' in body) {
    return body.setting ?? null
  }
  return body as TtsProviderSettingsResponse
}

export async function deleteTtsProvider(
  provider: Exclude<StoredTtsProvider, 'local'>,
): Promise<{ success?: boolean; deleted?: boolean; activeProvider?: StoredTtsProvider | null }> {
  return request<{ success?: boolean; deleted?: boolean; activeProvider?: StoredTtsProvider | null }>(
    `/api/hermes/tts/settings/${provider}`,
    { method: 'DELETE' },
  )
}

export async function deleteTtsBaseUrlPreset(
  provider: StoredTtsProvider,
  url: string,
): Promise<TtsProviderSettingsResponse | null> {
  const body = await request<
    { success?: boolean; setting: TtsProviderSettingsResponse | null } |
    TtsProviderSettingsResponse
  >(
    `/api/hermes/tts/settings/${provider}/base-url-preset?url=${encodeURIComponent(url)}`,
    { method: 'DELETE' },
  )

  if (body && typeof body === 'object' && 'setting' in body) {
    return body.setting ?? null
  }
  return body as TtsProviderSettingsResponse
}

// ── Local TTS model state (Kokoro-82M) ────────────────────────────────

export interface LocalTtsModelStateMissing {
  status: 'missing'
}

export interface LocalTtsModelStateInstalling {
  status: 'installing'
  message: string
}

export interface LocalTtsModelStateDownloading {
  status: 'downloading'
  receivedBytes: number
  totalBytes: number | null
}

export interface LocalTtsModelStateReady {
  status: 'ready'
  modelBytes: number
  voicesBytes: number
}

export interface LocalTtsModelStateError {
  status: 'error'
  message: string
}

export type LocalTtsModelState =
  | LocalTtsModelStateMissing
  | LocalTtsModelStateInstalling
  | LocalTtsModelStateDownloading
  | LocalTtsModelStateReady
  | LocalTtsModelStateError

export interface LocalTtsStatusResponse {
  modelPath: string
  voicesPath: string
  model: LocalTtsModelState
  engine: { pid: number | null; startedAt: number | null; lastError: string | null }
}

export async function fetchLocalTtsStatus(): Promise<LocalTtsStatusResponse> {
  return request<LocalTtsStatusResponse>('/api/hermes/tts/local/status')
}

export async function startLocalTtsDownload(): Promise<{ ok: boolean; error?: string; modelBytes?: number; voicesBytes?: number }> {
  return request<{ ok: boolean; error?: string; modelBytes?: number; voicesBytes?: number }>(
    '/api/hermes/tts/local/download',
    { method: 'POST' },
  )
}

export async function removeLocalTtsModel(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/api/hermes/tts/local/model', { method: 'DELETE' })
}

export interface LocalTtsModelOption {
  id: string
  label: string
  size: number | null
  url: string
  releaseTag: string
}

export async function fetchLocalTtsModels(): Promise<LocalTtsModelOption[]> {
  const body = await request<{ models?: LocalTtsModelOption[] } | LocalTtsModelOption[]>(
    '/api/hermes/tts/local/models',
  )
  if (Array.isArray(body)) return body
  return Array.isArray(body?.models) ? body.models : []
}
