import { ref, watch } from 'vue'
import { DOUBAO_TTS_2_RESOURCE_ID } from '@/constants/doubaoTtsVoices'

export type TtsProvider = 'webspeech' | 'openai' | 'custom' | 'local' | 'mimo' | 'doubao'
export type MimoAuthMode = 'api-key' | 'bearer' | 'both'

export interface VoiceSettingsData {
  provider: TtsProvider

  // WebSpeech
  webspeechVoice: string

  // OpenAI
  openaiApiKey: string
  openaiBaseUrl: string
  openaiModel: string
  openaiVoice: string

  // Custom endpoint (OpenAI-compatible)
  customUrl: string
  customApiKey: string

  // Local TTS (Kokoro-82M, on-device)
  localVoice: string
  localSpeed: number   // Speech rate multiplier, 0.5~2.0, 1.0 = normal

  // MiMo TTS
  mimoApiKey: string
  mimoAuthMode: MimoAuthMode
  mimoBaseUrl: string
  mimoModel: string            // 'mimo-v2.5-tts' | 'mimo-v2.5-tts-voicedesign' | 'mimo-v2.5-tts-voiceclone'
  mimoVoice: string            // Preset voice ID
  mimoVoiceDesignDesc: string  // Voice design description text
  mimoVoiceCloneDataUri: string // Voice clone reference audio data URI
  mimoVoiceCloneFileName: string
  mimoVoiceCloneFormat: 'mp3' | 'wav'
  mimoStylePrompt: string      // Style instructions

  // Doubao TTS
  doubaoApiKey: string
  doubaoBaseUrl: string
  doubaoModel: string
  doubaoVoice: string
  doubaoStylePrompt: string
}

const STORAGE_KEY = 'hermes-tts-settings-v2'

function migrateOldKeys() {
  const oldKey = 'hermes-tts-settings'
  try {
    const old = localStorage.getItem(oldKey)
    if (old) {
      const parsed = JSON.parse(old)
      // Old 'custom' provider maps to new 'custom'
      // Old 'gptsovits' provider maps to new 'custom'
      if (parsed.provider === 'gptsovits') {
        parsed.provider = 'custom'
        // old gptsovitsUrl -> customUrl
        if (parsed.gptsovitsUrl && !parsed.customUrl) {
          parsed.customUrl = parsed.gptsovitsUrl
        }
      }
      // Store as new format
      const data = { ...DEFAULT, ...parsed }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      localStorage.removeItem(oldKey)
    }
  } catch { /* ignore */ }
}

const DEFAULT: VoiceSettingsData = {
  provider: 'webspeech',

  webspeechVoice: '',

  openaiApiKey: '',
  openaiBaseUrl: '',
  openaiModel: 'tts-1',
  openaiVoice: 'alloy',

  customUrl: '',
  customApiKey: '',

  localVoice: 'af_heart',
  localSpeed: 1.0,

  mimoApiKey: '',
  mimoAuthMode: 'bearer',
  mimoBaseUrl: 'https://api.xiaomimimo.com/v1',
  mimoModel: 'mimo-v2.5-tts',
  mimoVoice: 'bingtang', // Default MiMo voice (product identifier from MiMo TTS)
  mimoVoiceDesignDesc: '',
  mimoVoiceCloneDataUri: '',
  mimoVoiceCloneFileName: '',
  mimoVoiceCloneFormat: 'wav',
  mimoStylePrompt: '',

  doubaoApiKey: '',
  doubaoBaseUrl: 'https://openspeech.bytedance.com/api/v3/tts/unidirectional',
  doubaoModel: DOUBAO_TTS_2_RESOURCE_ID,
  doubaoVoice: '',
  doubaoStylePrompt: '',
}

function sanitize(data: VoiceSettingsData): VoiceSettingsData {
  // Migrate legacy Edge TTS fields from pre-Kokoro builds. Old fields are
  // dropped; localVoice defaults to af_heart if nothing usable is set.
  const legacyEdgeVoice = (data as unknown as { edgeVoice?: unknown }).edgeVoice
  if (typeof legacyEdgeVoice === 'string' && legacyEdgeVoice && !data.localVoice) {
    data.localVoice = legacyEdgeVoice
  }
  if (data.mimoAuthMode !== 'api-key' && data.mimoAuthMode !== 'bearer' && data.mimoAuthMode !== 'both') {
    data.mimoAuthMode = DEFAULT.mimoAuthMode
  }
  if (data.mimoVoiceCloneFormat !== 'mp3' && data.mimoVoiceCloneFormat !== 'wav') {
    data.mimoVoiceCloneFormat = DEFAULT.mimoVoiceCloneFormat
  }
  return data
}

function load(): VoiceSettingsData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return sanitize({ ...DEFAULT, ...JSON.parse(raw) })
  } catch { /* ignore */ }
  return { ...DEFAULT }
}

// Run migration once on import
migrateOldKeys()

// ── Reactive state ──
const provider = ref<TtsProvider>(load().provider)

// WebSpeech
const webspeechVoice = ref<string>(load().webspeechVoice)

// OpenAI
const openaiApiKey = ref<string>(load().openaiApiKey)
const openaiBaseUrl = ref<string>(load().openaiBaseUrl)
const openaiModel = ref<string>(load().openaiModel)
const openaiVoice = ref<string>(load().openaiVoice)

// Custom
const customUrl = ref<string>(load().customUrl)
const customApiKey = ref<string>(load().customApiKey)

// Local TTS
const localVoice = ref<string>(load().localVoice)
const localSpeed = ref<number>(load().localSpeed)

// MiMo TTS
const mimoApiKey = ref<string>(load().mimoApiKey)
const mimoAuthMode = ref<MimoAuthMode>(load().mimoAuthMode)
const mimoBaseUrl = ref<string>(load().mimoBaseUrl)
const mimoModel = ref<string>(load().mimoModel)
const mimoVoice = ref<string>(load().mimoVoice)
const mimoVoiceDesignDesc = ref<string>(load().mimoVoiceDesignDesc)
const mimoVoiceCloneDataUri = ref<string>(load().mimoVoiceCloneDataUri)
const mimoVoiceCloneFileName = ref<string>(load().mimoVoiceCloneFileName)
const mimoVoiceCloneFormat = ref<'mp3' | 'wav'>(load().mimoVoiceCloneFormat)
const mimoStylePrompt = ref<string>(load().mimoStylePrompt)

// Doubao TTS
const doubaoApiKey = ref<string>(load().doubaoApiKey)
const doubaoBaseUrl = ref<string>(load().doubaoBaseUrl)
const doubaoModel = ref<string>(load().doubaoModel)
const doubaoVoice = ref<string>(load().doubaoVoice)
const doubaoStylePrompt = ref<string>(load().doubaoStylePrompt)

// Auto-persist on change
watch(
  [provider, webspeechVoice, openaiApiKey, openaiBaseUrl, openaiModel, openaiVoice,
   customUrl, customApiKey, localVoice, localSpeed,
   mimoApiKey, mimoAuthMode, mimoBaseUrl, mimoModel, mimoVoice, mimoVoiceDesignDesc,
   mimoVoiceCloneDataUri, mimoVoiceCloneFileName, mimoVoiceCloneFormat, mimoStylePrompt,
   doubaoApiKey, doubaoBaseUrl, doubaoModel, doubaoVoice, doubaoStylePrompt],
  () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        provider: provider.value,
        webspeechVoice: webspeechVoice.value,
        openaiApiKey: openaiApiKey.value,
        openaiBaseUrl: openaiBaseUrl.value,
        openaiModel: openaiModel.value,
        openaiVoice: openaiVoice.value,
        customUrl: customUrl.value,
        customApiKey: customApiKey.value,
        localVoice: localVoice.value,
        localSpeed: localSpeed.value,
        mimoApiKey: mimoApiKey.value,
        mimoAuthMode: mimoAuthMode.value,
        mimoBaseUrl: mimoBaseUrl.value,
        mimoModel: mimoModel.value,
        mimoVoice: mimoVoice.value,
        mimoVoiceDesignDesc: mimoVoiceDesignDesc.value,
        mimoVoiceCloneDataUri: mimoVoiceCloneDataUri.value,
        mimoVoiceCloneFileName: mimoVoiceCloneFileName.value,
        mimoVoiceCloneFormat: mimoVoiceCloneFormat.value,
        mimoStylePrompt: mimoStylePrompt.value,
        doubaoApiKey: doubaoApiKey.value,
        doubaoBaseUrl: doubaoBaseUrl.value,
        doubaoModel: doubaoModel.value,
        doubaoVoice: doubaoVoice.value,
        doubaoStylePrompt: doubaoStylePrompt.value,
      }))
    } catch (err) {
      console.warn('[useVoiceSettings] Failed to persist voice settings:', err)
    }
  },
)

export function useVoiceSettings() {
  return {
    provider,
    webspeechVoice,
    openaiApiKey,
    openaiBaseUrl,
    openaiModel,
    openaiVoice,
    customUrl,
    customApiKey,
    localVoice,
    localSpeed,
    mimoApiKey,
    mimoAuthMode,
    mimoBaseUrl,
    mimoModel,
    mimoVoice,
    mimoVoiceDesignDesc,
    mimoVoiceCloneDataUri,
    mimoVoiceCloneFileName,
    mimoVoiceCloneFormat,
    mimoStylePrompt,
    doubaoApiKey,
    doubaoBaseUrl,
    doubaoModel,
    doubaoVoice,
    doubaoStylePrompt,

    setProvider(v: TtsProvider) { provider.value = v },
    setWebSpeechVoice(v: string) { webspeechVoice.value = v },
    setOpenaiApiKey(v: string) { openaiApiKey.value = v },
    setOpenaiBaseUrl(v: string) { openaiBaseUrl.value = v },
    setOpenaiModel(v: string) { openaiModel.value = v },
    setOpenaiVoice(v: string) { openaiVoice.value = v },
    setCustomUrl(v: string) { customUrl.value = v },
    setCustomApiKey(v: string) { customApiKey.value = v },
    setLocalVoice(v: string) { localVoice.value = v },
    setLocalSpeed(v: number) { localSpeed.value = v },
    setMimoApiKey(v: string) { mimoApiKey.value = v },
    setMimoAuthMode(v: MimoAuthMode) { mimoAuthMode.value = v },
    setMimoBaseUrl(v: string) { mimoBaseUrl.value = v },
    setMimoModel(v: string) { mimoModel.value = v },
    setMimoVoice(v: string) { mimoVoice.value = v },
    setMimoVoiceDesignDesc(v: string) { mimoVoiceDesignDesc.value = v },
    setMimoVoiceCloneDataUri(v: string) { mimoVoiceCloneDataUri.value = v },
    setMimoVoiceCloneFileName(v: string) { mimoVoiceCloneFileName.value = v },
    setMimoVoiceCloneFormat(v: 'mp3' | 'wav') { mimoVoiceCloneFormat.value = v },
    setMimoStylePrompt(v: string) { mimoStylePrompt.value = v },
    setDoubaoApiKey(v: string) { doubaoApiKey.value = v },
    setDoubaoBaseUrl(v: string) { doubaoBaseUrl.value = v },
    setDoubaoModel(v: string) { doubaoModel.value = v },
    setDoubaoVoice(v: string) { doubaoVoice.value = v },
    setDoubaoStylePrompt(v: string) { doubaoStylePrompt.value = v },

    reset() {
      provider.value = DEFAULT.provider
      webspeechVoice.value = DEFAULT.webspeechVoice
      openaiApiKey.value = DEFAULT.openaiApiKey
      openaiBaseUrl.value = DEFAULT.openaiBaseUrl
      openaiModel.value = DEFAULT.openaiModel
      openaiVoice.value = DEFAULT.openaiVoice
      customUrl.value = DEFAULT.customUrl
      customApiKey.value = DEFAULT.customApiKey
      localVoice.value = DEFAULT.localVoice
      localSpeed.value = DEFAULT.localSpeed
      mimoApiKey.value = DEFAULT.mimoApiKey
      mimoAuthMode.value = DEFAULT.mimoAuthMode
      mimoBaseUrl.value = DEFAULT.mimoBaseUrl
      mimoModel.value = DEFAULT.mimoModel
      mimoVoice.value = DEFAULT.mimoVoice
      mimoVoiceDesignDesc.value = DEFAULT.mimoVoiceDesignDesc
      mimoVoiceCloneDataUri.value = DEFAULT.mimoVoiceCloneDataUri
      mimoVoiceCloneFileName.value = DEFAULT.mimoVoiceCloneFileName
      mimoVoiceCloneFormat.value = DEFAULT.mimoVoiceCloneFormat
      mimoStylePrompt.value = DEFAULT.mimoStylePrompt
      doubaoApiKey.value = DEFAULT.doubaoApiKey
      doubaoBaseUrl.value = DEFAULT.doubaoBaseUrl
      doubaoModel.value = DEFAULT.doubaoModel
      doubaoVoice.value = DEFAULT.doubaoVoice
      doubaoStylePrompt.value = DEFAULT.doubaoStylePrompt
    },
  }
}
