<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { NDrawer, NDrawerContent, NForm, NFormItem, NInput, NSelect, NSlider, NButton, NSpace } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import type { VoiceApiConnection, VoiceApiSavePayload } from '@/types/voice-api'
import { VOICE_API_PRESETS } from '@/constants/voiceApiPresets'
import { DOUBAO_TTS_2_RESOURCE_ID, DOUBAO_TTS_VOICE_OPTIONS, doubaoTtsResourceForVoice } from '@/constants/doubaoTtsVoices'
// ttsHelpers intentionally not imported — local TTS uses a numeric speed directly.

const props = defineProps<{
  connection: VoiceApiConnection | null
  show: boolean
}>()

const emit = defineEmits<{
  close: []
  save: [connection: VoiceApiConnection, payload: VoiceApiSavePayload]
}>()

const { t } = useI18n()

const loading = ref(false)
const formData = ref<Record<string, string | number | undefined>>({})
const apiKeyInput = ref('')

const preset = computed(() =>
  props.connection ? VOICE_API_PRESETS.find(p => p.kind === props.connection!.kind && p.provider === props.connection!.provider && (p.baseUrl === props.connection!.baseUrl || !p.baseUrl)) : null
)

const capabilities = computed(() => preset.value?.capabilities || {})

function setField(key: string, value: string | number | null | undefined) {
  formData.value[key] = value ?? ''
}

function stringField(key: string): string {
  const value = formData.value[key]
  return typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
}

function numberField(key: string, fallback = 0): number {
  const value = formData.value[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

watch(() => props.connection, (conn) => {
  if (conn) {
    formData.value = {
      ...conn.settings,
      model: conn.model || String(conn.settings.model || ''),
      voice: conn.voice || String(conn.settings.voice || ''),
    }
    if (conn.provider === 'local') {
      formData.value.rate = numberField('rate', 1.0)
      formData.value.pitch = numberField('pitch', 0)
    }
    apiKeyInput.value = ''
  }
}, { immediate: true })

async function handleSave() {
  if (!props.connection) return

  loading.value = true
  try {
    const apiKey = apiKeyInput.value.trim()
    emit('save', props.connection, {
      settings: { ...formData.value },
      ...(apiKey ? { secrets: { apiKey } } : {}),
    })
  } finally {
    loading.value = false
  }
}

// Local TTS voice picker — 9 voices (Kokoro ships 54; subset keeps the dropdown usable).
const localVoiceOptions = [
  { label: 'Heart (en-US · Female)', value: 'af_heart' },
  { label: 'Bella (en-US · Female)', value: 'af_bella' },
  { label: 'Nicole (en-US · Female)', value: 'af_nicole' },
  { label: 'Michael (en-US · Male)', value: 'am_michael' },
  { label: 'Fenrir (en-US · Male)', value: 'am_fenrir' },
  { label: 'Emma (en-GB · Female)', value: 'bf_emma' },
  { label: 'Daniel (en-GB · Male)', value: 'bm_daniel' },
  { label: 'Xiaoxiao (zh-CN · Female)', value: 'zf_xiaoxiao' },
  { label: 'Yunjian (zh-CN · Male)', value: 'zm_yunjian' },
]

const openaiVoiceOptions = [
  { label: 'Alloy', value: 'alloy' },
  { label: 'Echo', value: 'echo' },
  { label: 'Fable', value: 'fable' },
  { label: 'Nova', value: 'nova' },
  { label: 'Onyx', value: 'onyx' },
  { label: 'Shimmer', value: 'shimmer' },
]

const mimoVoiceOptions = [
  { label: 'Bingtang (Chinese · Female)', value: 'bingtang' },
  { label: 'Moli (Chinese · Female)', value: 'moli' },
  { label: 'Soda (Chinese · Male)', value: 'soda' },
  { label: 'Baihua (Chinese · Male)', value: 'baihua' },
]

const mimoModelOptions = [
  { label: t('settings.voice.mimoModelPreset'), value: 'mimo-v2.5-tts' },
  { label: t('settings.voice.mimoModelVoiceDesign'), value: 'mimo-v2.5-tts-voicedesign' },
  { label: t('settings.voice.mimoModelVoiceClone'), value: 'mimo-v2.5-tts-voiceclone' },
]

const doubaoModelOptions = [
  { label: 'Seed TTS 2.0', value: DOUBAO_TTS_2_RESOURCE_ID },
]

const doubaoVoiceOptions = computed(() => {
  const current = stringField('voice').trim()
  const presetOptions = DOUBAO_TTS_VOICE_OPTIONS.map(option => ({
    label: option.label,
    value: option.value,
  }))
  if (current && !DOUBAO_TTS_VOICE_OPTIONS.some(option => option.value === current)) {
    return [{ label: current, value: current }, ...presetOptions]
  }
  return presetOptions
})

const sttAudioTranscodeOptions = computed(() => [
  { label: t('settings.voice.sttAudioTranscodeNone'), value: 'none' },
  { label: t('settings.voice.sttAudioTranscodeFfmpeg'), value: 'ffmpeg' },
])

function handleDoubaoVoiceUpdate(value: string) {
  setField('voice', value)
  setField('model', doubaoTtsResourceForVoice(value) || DOUBAO_TTS_2_RESOURCE_ID)
}
</script>

<template>
  <NDrawer :show="show" :width="400" @update:show="emit('close')">
    <NDrawerContent :title="connection?.label" closable>
      <NForm label-placement="top" v-if="connection">
        <NFormItem v-if="!connection.isBuiltin" :label="t('settings.voice.apiKey')">
          <NInput
            v-model:value="apiKeyInput"
            type="password"
            show-password-on="click"
            autocomplete="off"
            :placeholder="connection.hasSecret ? t('settings.voice.keepStoredKeyPlaceholder') : t('settings.voice.apiKeyPlaceholder')"
          />
        </NFormItem>

        <NFormItem :label="t('settings.voice.model')" v-if="capabilities.models">
          <NSelect
            v-if="connection.provider === 'mimo'"
            :value="stringField('model')"
            :options="mimoModelOptions"
            @update:value="value => setField('model', value)"
          />
          <NSelect
            v-else-if="connection.provider === 'doubao'"
            :value="stringField('model') || DOUBAO_TTS_2_RESOURCE_ID"
            :options="doubaoModelOptions"
            tag
            filterable
            @update:value="value => setField('model', value)"
          />
          <NInput
            v-else
            :value="stringField('model')"
            :placeholder="t('models.selectOrInput')"
            @update:value="value => setField('model', value)"
          />
        </NFormItem>

        <NFormItem :label="t('settings.voice.voice')" v-if="capabilities.voices">
          <NSelect
            v-if="connection.provider === 'local'"
            :value="stringField('voice')"
            :options="localVoiceOptions"
            filterable
            tag
            @update:value="value => setField('voice', value)"
          />
          <NSelect
            v-else-if="connection.provider === 'openai'"
            :value="stringField('voice')"
            :options="openaiVoiceOptions"
            @update:value="value => setField('voice', value)"
          />
          <NSelect
            v-else-if="connection.provider === 'mimo' && stringField('model') === 'mimo-v2.5-tts'"
            :value="stringField('voice')"
            :options="mimoVoiceOptions"
            @update:value="value => setField('voice', value)"
          />
          <NSelect
            v-else-if="connection.provider === 'doubao'"
            :value="stringField('voice')"
            :options="doubaoVoiceOptions"
            tag
            filterable
            @update:value="handleDoubaoVoiceUpdate"
          />
          <NInput
            v-else
            :value="stringField('voice')"
            @update:value="value => setField('voice', value)"
          />
        </NFormItem>

        <template v-if="connection.provider === 'local' && capabilities.speed">
          <NFormItem :label="t('settings.voice.localSpeed')">
            <NSpace vertical style="width: 100%">
              <NSlider
                :value="numberField('speed', 1)"
                :min="0.5"
                :max="2.0"
                :step="0.05"
                @update:value="value => setField('speed', Array.isArray(value) ? value[0] : value)"
              />
              <span style="font-size: 12px; opacity: 0.6">{{ numberField('speed', 1).toFixed(2) }}x</span>
            </NSpace>
          </NFormItem>
        </template>

        <template v-if="connection.provider === 'mimo'">
          <NFormItem :label="t('settings.voice.mimoStylePrompt')" v-if="capabilities.stylePrompt">
            <NInput :value="stringField('stylePrompt')" type="textarea" :rows="2" @update:value="value => setField('stylePrompt', value)" />
          </NFormItem>
          <NFormItem :label="t('settings.voice.mimoVoiceDesignPrompt')" v-if="stringField('model') === 'mimo-v2.5-tts-voicedesign'">
            <NInput :value="stringField('voiceDesignDesc')" type="textarea" :rows="3" @update:value="value => setField('voiceDesignDesc', value)" />
          </NFormItem>
        </template>

        <template v-if="connection.kind === 'stt' && connection.provider !== 'browser'">
          <NFormItem :label="t('settings.voice.sttAudioTranscode')">
            <NSelect
              :value="stringField('audioTranscode') || 'none'"
              :options="sttAudioTranscodeOptions"
              @update:value="value => setField('audioTranscode', value)"
            />
          </NFormItem>
          <NFormItem :label="t('settings.voice.sttLanguage')">
            <NInput :value="stringField('language')" @update:value="value => setField('language', value)" />
          </NFormItem>
          <NFormItem :label="t('settings.voice.sttPrompt')">
            <NInput :value="stringField('prompt')" type="textarea" :rows="2" @update:value="value => setField('prompt', value)" />
          </NFormItem>
        </template>
      </NForm>

      <template #footer>
        <NSpace justify="end">
          <NButton @click="emit('close')">{{ t('common.cancel') }}</NButton>
          <NButton type="primary" :loading="loading" @click="handleSave">{{ t('common.save') }}</NButton>
        </NSpace>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>
