<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NButton, NDropdown, NProgress, NSelect, NTag } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { fetchLocalTtsModels, type LocalTtsModelOption } from '@/api/hermes/tts-settings'
import ProviderMetaItem from './ProviderMetaItem.vue'
import type { VoiceApiConnection } from '@/types/voice-api'

export type VoiceApiCardTestState = {
  status: 'idle' | 'recording' | 'loading' | 'success' | 'error'
  message?: string
}

const props = defineProps<{
  connection: VoiceApiConnection
  testState?: VoiceApiCardTestState
}>()

const emit = defineEmits<{
  setActive: [connection: VoiceApiConnection]
  test: [connection: VoiceApiConnection]
  edit: [connection: VoiceApiConnection]
  connect: [connection: VoiceApiConnection]
  remove: [connection: VoiceApiConnection]
  downloadLocal: [connection: VoiceApiConnection]
  removeLocal: [connection: VoiceApiConnection]
  selectModel: [connection: VoiceApiConnection, modelId: string]
}>()

const { t } = useI18n()
const showErrorDetails = ref(false)

watch(() => props.testState?.message, () => {
  showErrorDetails.value = false
})

const canEdit = computed(() => !(props.connection.kind === 'stt' && props.connection.provider === 'browser'))
const requiresKey = computed(() => !props.connection.isBuiltin)
const keyStateLabel = computed(() => {
  if (!requiresKey.value) return t('settings.voice.builtin')
  return props.connection.hasSecret ? t('settings.voice.keyStored') : t('settings.voice.keyMissing')
})

const providerTypeLabel = computed(() => props.connection.isBuiltin
  ? t('settings.voice.builtin')
  : t('settings.voice.customApi'))

const statusType = computed(() => {
  if (props.connection.active) return 'success'
  if (requiresKey.value && !props.connection.hasSecret) return 'warning'
  return 'default'
})

const statusLabel = computed(() => {
  if (props.connection.active) return t('settings.voice.active')
  if (requiresKey.value && !props.connection.hasSecret) return t('settings.voice.keyMissing')
  return t('settings.voice.connected')
})

const modelValue = computed(() => {
  if (props.connection.isLocal) return t('settings.voice.localModelDefault')
  return props.connection.model || String(props.connection.settings.model || '')
})
const voiceValue = computed(() => props.connection.voice || String(props.connection.settings.voice || ''))
const sourceValue = computed(() => props.connection.baseUrl || (props.connection.isBuiltin ? t('settings.voice.localBuiltin') : ''))

const localModelStatus = computed(() => {
  if (!props.connection.isLocal) return null
  return props.connection.modelState || 'missing'
})

const localDownloadPercent = computed(() => {
  const progress = props.connection.modelProgress
  if (!progress || !progress.totalBytes) return null
  return Math.min(100, Math.round((progress.receivedBytes / progress.totalBytes) * 100))
})

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = units[0]
  for (let i = 1; i < units.length && value >= 1024; i += 1) {
    value /= 1024
    unit = units[i]
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${unit}`
}

const localDownloadLabel = computed(() => {
  const progress = props.connection.modelProgress
  if (!progress) return ''
  const recv = formatBytes(progress.receivedBytes)
  if (progress.totalBytes) {
    return `${recv} / ${formatBytes(progress.totalBytes)}`
  }
  return recv
})

const localModelStatusLabel = computed(() => {
  switch (localModelStatus.value) {
    case 'ready': return t('settings.voice.localModelReady')
    case 'downloading': return t('settings.voice.localModelDownloading')
    case 'installing': return t('settings.voice.localModelInstalling')
    case 'error': return t('settings.voice.localModelError')
    default: return t('settings.voice.localModelMissing')
  }
})

const localModelStatusType = computed(() => {
  switch (localModelStatus.value) {
    case 'ready': return 'success'
    case 'downloading': return 'info'
    case 'installing': return 'info'
    case 'error': return 'error'
    default: return 'warning'
  }
})

const localDownloading = computed(() =>
  localModelStatus.value === 'downloading' || localModelStatus.value === 'installing',
)

const localInstallMessage = computed(() => {
  if (!props.connection.isLocal) return ''
  const modelState = props.connection.modelState
  return modelState === 'installing' ? props.connection.installMessage || '' : ''
})

const availableModels = ref<LocalTtsModelOption[]>([])
const fetchingModels = ref(false)
const fetchError = ref('')
const selectedModelId = ref<string>('default')

const modelOptions = computed(() => {
  const options = availableModels.value.map((m) => ({ label: m.label, value: m.id }))
  if (!options.some((o) => o.value === 'default')) {
    options.unshift({ label: t('settings.voice.localModelDefault'), value: 'default' })
  }
  return options
})

async function handleFetchModels() {
  if (fetchingModels.value) return
  fetchingModels.value = true
  fetchError.value = ''
  try {
    availableModels.value = await fetchLocalTtsModels()
  } catch (err) {
    fetchError.value = err instanceof Error ? err.message : String(err)
    availableModels.value = []
  } finally {
    fetchingModels.value = false
  }
}

const lastTestLabel = computed(() => {
  const status = props.testState?.status
  if (status === 'success') return t('settings.voice.testSuccess')
  if (status === 'error') return t('settings.voice.testFailedShort')
  if (status === 'loading') return t('settings.voice.testing')
  if (status === 'recording') return t('settings.voice.recording')
  return t('settings.voice.notTested')
})

const actionLabel = computed(() => requiresKey.value && !props.connection.hasSecret
  ? t('settings.voice.connect')
  : t('common.edit'))
const testActionLabel = computed(() => props.testState?.status === 'recording'
  ? t('settings.voice.sttTestStopButton')
  : t('settings.voice.testAction'))

const metaItems = computed(() => {
  if (props.connection.kind === 'tts') {
    return [
      { key: 'source', label: t('settings.voice.source'), value: sourceValue.value },
      { key: 'model', label: t('settings.voice.model'), value: modelValue.value },
      { key: 'voice', label: t('settings.voice.voice'), value: voiceValue.value },
      { key: 'api-key', label: t('settings.voice.apiKey'), value: keyStateLabel.value },
    ]
  }
  return [
    { key: 'source', label: t('settings.voice.source'), value: sourceValue.value },
    { key: 'model', label: t('settings.voice.model'), value: modelValue.value },
    { key: 'api-key', label: t('settings.voice.apiKey'), value: keyStateLabel.value },
    { key: 'last-test', label: t('settings.voice.lastTest'), value: lastTestLabel.value },
  ]
})

const metaItemsWithLocalModel = computed(() => {
  if (!props.connection.isLocal) return metaItems.value
  // Local provider: surface model status as a fourth meta item so it's visible
  // at a glance without expanding the card.
  return [
    ...metaItems.value,
    { key: 'local-model', label: t('settings.voice.localModel'), value: localModelStatusLabel.value },
  ]
})

const hasInlineFeedback = computed(() => {
  const status = props.testState?.status
  return !!status && status !== 'idle' && status !== 'error'
})

const hasError = computed(() => props.testState?.status === 'error')
const rawErrorMessage = computed(() => props.testState?.message || '')

function parseErrorPayload(raw: string): string | null {
  const jsonStart = raw.indexOf('{')
  if (jsonStart < 0) return null
  try {
    const parsed = JSON.parse(raw.slice(jsonStart)) as { error?: unknown; message?: unknown; detail?: unknown }
    const candidate = parsed.error || parsed.message || parsed.detail
    return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null
  } catch {
    return null
  }
}

function stripTechnicalPrefix(raw: string): string {
  return raw
    .replace(/^API Error\s+\d+\s*:\s*/i, '')
    .replace(/^Error\s*:\s*/i, '')
    .trim()
}

const friendlyErrorMessage = computed(() => {
  const raw = rawErrorMessage.value.trim()
  if (!raw) return t('settings.voice.testFailedSummary')
  const parsed = parseErrorPayload(raw)
  const candidate = parsed || stripTechnicalPrefix(raw)
  if (!candidate || candidate.startsWith('{') || candidate.startsWith('[')) {
    return t('settings.voice.testFailedSummary')
  }
  // For engine startup / subprocess errors the actionable line is usually
  // at the END of the captured stderr (debug context prints first, then the
  // real traceback). Show the tail so the user can see what failed without
  // clicking Show details.
  const limit = 320
  if (candidate.length <= limit) return candidate
  return `…${candidate.slice(-limit + 1).trim()}`
})

const showDetailsToggle = computed(() => {
  const raw = rawErrorMessage.value.trim()
  return raw.length > 0 && raw !== friendlyErrorMessage.value
})

const moreOptions = computed(() => [
  {
    label: t('settings.voice.remove'),
    key: 'remove',
    disabled: props.connection.isBuiltin,
  },
])

function handleEditAction() {
  if (requiresKey.value && !props.connection.hasSecret) {
    emit('connect', props.connection)
    return
  }
  emit('edit', props.connection)
}

function handleMoreSelect(key: string | number) {
  if (key === 'remove' && !props.connection.isBuiltin) {
    emit('remove', props.connection)
  }
}
</script>

<template>
  <article class="voice-api-card" :class="{ active: connection.active }" :data-state="testState?.status || 'idle'">
    <div class="card-main">
      <div class="provider-identity">
        <div class="provider-icon" :class="`is-${connection.kind}`" aria-hidden="true">
          <span class="provider-icon-glyph">{{ connection.kind === 'tts' ? 'T' : 'S' }}</span>
          <span class="provider-icon-kind">{{ connection.kind.toUpperCase() }}</span>
        </div>
        <div class="provider-copy">
          <div class="provider-title-row">
            <h5 class="provider-title" :title="connection.label">{{ connection.label }}</h5>
            <span class="provider-kind">{{ providerTypeLabel }}</span>
            <NTag class="status-badge" size="small" :type="statusType" round :bordered="false">
              {{ statusLabel }}
            </NTag>
          </div>
          <p class="provider-description">
            {{ connection.kind === 'tts' ? t('settings.voice.ttsCardHint') : t('settings.voice.sttCardHint') }}
          </p>
        </div>
      </div>

      <dl class="provider-meta">
        <ProviderMetaItem
          v-for="item in metaItemsWithLocalModel"
          :key="item.key"
          :label="item.label"
          :value="item.value"
        />
      </dl>

      <div class="provider-control">
        <div class="card-actions" :aria-label="`${connection.label} actions`">
          <NButton
            v-if="!connection.active"
            size="tiny"
            secondary
            @click="emit('setActive', connection)"
          >
            {{ t('settings.voice.setActive') }}
          </NButton>
          <NButton
            size="tiny"
            :loading="testState?.status === 'loading'"
            :data-testid="`voice-card-test-${connection.id}`"
            @click="emit('test', connection)"
          >
            {{ testActionLabel }}
          </NButton>
          <NButton
            v-if="canEdit"
            size="tiny"
            @click="handleEditAction"
          >
            {{ actionLabel }}
          </NButton>
          <NDropdown
            v-if="requiresKey"
            trigger="click"
            size="small"
            :options="moreOptions"
            @select="handleMoreSelect"
          >
            <NButton size="tiny" :aria-label="t('settings.voice.moreActionsFor', { provider: connection.label })">
              {{ t('settings.voice.moreActions') }}
            </NButton>
          </NDropdown>
        </div>
      </div>
    </div>

    <div v-if="hasInlineFeedback" class="feedback-row" :class="testState?.status" role="status">
      {{ testState?.message || (testState?.status === 'success' ? t('settings.voice.testSuccess') : '') }}
    </div>

    <div v-if="connection.isLocal" class="local-model-row" role="region" :aria-label="t('settings.voice.localModel')">
      <div class="local-model-picker">
        <span class="local-model-picker-label">{{ t('settings.voice.localModelLabel') }}</span>
        <NSelect
          v-model:value="selectedModelId"
          :options="modelOptions"
          :disabled="fetchingModels || localDownloading"
          size="tiny"
          :aria-label="t('settings.voice.localModelLabel')"
          data-testid="voice-card-model-select"
          @update:value="(value: string) => emit('selectModel', connection, value)"
        />
        <NButton
          size="tiny"
          :loading="fetchingModels"
          :disabled="localDownloading"
          secondary
          data-testid="voice-card-fetch-models"
          @click="handleFetchModels"
        >
          {{ t('settings.voice.localFetchModels') }}
        </NButton>
      </div>
      <div v-if="fetchError" class="local-model-error">{{ fetchError }}</div>
      <div class="local-model-status">
        <NTag size="small" :type="localModelStatusType" round :bordered="false">
          {{ localModelStatusLabel }}
        </NTag>
        <span v-if="localDownloadLabel" class="local-model-progress-text">{{ localDownloadLabel }}</span>
        <span v-else-if="localInstallMessage" class="local-model-progress-text">{{ localInstallMessage }}</span>
      </div>
      <div class="local-model-actions">
        <NProgress
          v-if="localDownloading"
          type="line"
          :percentage="localModelStatus === 'downloading' && localDownloadPercent !== null ? localDownloadPercent : 0"
          :processing="localModelStatus === 'installing' || (localModelStatus === 'downloading' && localDownloadPercent === null)"
          :show-indicator="false"
          :height="6"
          style="flex: 1; min-width: 120px;"
        />
        <NButton
          v-if="!localDownloading && localModelStatus !== 'ready'"
          size="tiny"
          type="primary"
          :data-testid="`voice-card-download-${connection.id}`"
          @click="emit('downloadLocal', connection)"
        >
          {{ t('settings.voice.localDownload') }}
        </NButton>
        <NButton
          v-if="!localDownloading && localModelStatus === 'ready'"
          size="tiny"
          secondary
          @click="emit('removeLocal', connection)"
        >
          {{ t('settings.voice.localRemove') }}
        </NButton>
      </div>
    </div>

    <div v-if="hasError" class="feedback-row error" role="alert">
      <div class="error-summary">{{ friendlyErrorMessage }}</div>
      <NButton
        v-if="showDetailsToggle"
        class="details-toggle"
        text
        size="tiny"
        @click="showErrorDetails = !showErrorDetails"
      >
        {{ showErrorDetails ? t('settings.voice.hideDetails') : t('settings.voice.showDetails') }}
      </NButton>
      <pre v-if="showErrorDetails" class="error-details">{{ rawErrorMessage }}</pre>
    </div>
  </article>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.voice-api-card {
  position: relative;
  overflow: hidden;
  border: 1px solid $border-color;
  border-radius: $radius-md;
  background: $bg-card;
  transition: background $transition-fast, border-color $transition-fast;

  &.active {
    background: color-mix(in oklab, $accent-primary 4%, $bg-card);
    border-color: color-mix(in oklab, $accent-primary 24%, $border-color);
  }

  &.active::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 3px;
    background: $accent-primary;
  }
}

.card-main {
  display: grid;
  grid-template-columns: minmax(210px, 240px) minmax(0, 1fr) 188px;
  align-items: start;
  gap: 16px;
  min-width: 0;
  padding: 14px 16px 14px 18px;
}

.provider-identity {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}

.provider-icon {
  width: 36px;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  gap: 2px;
  padding: 4px 0;
  border-radius: $radius-sm;
  border: 1px solid $border-color;
  background: $bg-input;
  color: $text-secondary;

  &.is-tts {
    background: color-mix(in oklab, $accent-primary 10%, $bg-input);
    border-color: color-mix(in oklab, $accent-primary 22%, $border-color);
    color: color-mix(in oklab, $accent-primary 70%, $text-primary);
  }
}

.provider-icon-glyph {
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
}

.provider-icon-kind {
  font-size: 8px;
  font-weight: 600;
  letter-spacing: 0.06em;
  line-height: 1;
  opacity: 0.75;
}

.provider-copy {
  min-width: 0;
}

.provider-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
}

.status-badge {
  flex-shrink: 0;
  max-width: 100%;
}

.provider-title {
  min-width: 0;
  margin: 0;
  color: $text-primary;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.provider-kind {
  flex-shrink: 0;
  color: $text-muted;
  font-size: 11px;
  line-height: 1.35;
}

.provider-description {
  margin: 5px 0 0;
  color: $text-muted;
  font-size: 12px;
  line-height: 1.45;
}

.provider-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px 16px;
  margin: 0;
  min-width: 0;
}

.provider-control {
  display: grid;
  justify-items: end;
  gap: 8px;
  width: 188px;
  min-width: 0;
}

.card-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  width: 100%;

  :deep(.n-button) {
    min-width: 72px;
  }
}

.local-model-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 12px;
  margin: 12px 16px 14px 18px;
  padding-top: 12px;
  border-top: 1px solid $border-color;
}

.local-model-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 280px;
}

.local-model-picker-label {
  flex-shrink: 0;
  color: $text-muted;
  font-size: 11px;
  font-weight: 500;
}

.local-model-picker :deep(.n-select) {
  min-width: 0;
  flex: 1 1 200px;
  max-width: 320px;
}

.local-model-error {
  width: 100%;
  color: $error;
  font-size: 11px;
  line-height: 1.4;
}

.local-model-status {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.local-model-progress-text {
  color: $text-muted;
  font-family: $font-code;
  font-size: 11px;
}

.local-model-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
  margin-left: auto;
}

.feedback-row {
  margin: 0 16px 14px 18px;
  padding: 8px 10px;
  border-radius: $radius-sm;
  background: $bg-input;
  color: $text-muted;
  font-size: 12px;
  line-height: 1.45;

  &.success {
    color: $success;
  }

  &.error {
    border: 1px solid rgba(var(--error-rgb), 0.22);
    background: rgba(var(--error-rgb), 0.06);
    color: $error;
  }
}

.error-summary {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.details-toggle {
  margin-top: 4px;
}

.error-details {
  max-height: 160px;
  overflow: auto;
  margin: 6px 0 0;
  padding: 8px;
  border-radius: $radius-sm;
  background: $code-bg;
  color: $text-secondary;
  font-family: $font-code;
  font-size: 11px;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 1080px) {
  .card-main {
    grid-template-columns: minmax(170px, 190px) minmax(0, 1fr) 156px;
    gap: 14px;
  }

  .provider-meta {
    grid-template-columns: 1fr;
  }

  .provider-control {
    width: 156px;
  }

  .card-actions {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 820px) {
  .card-main {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .provider-control {
    grid-column: auto;
    grid-row: auto;
    width: 100%;
    justify-items: start;
  }

  .provider-meta {
    grid-column: auto;
    grid-row: auto;
  }

  .card-actions {
    grid-template-columns: repeat(2, minmax(0, 120px));
    width: auto;
  }
}

@media (max-width: 520px) {
  .provider-meta {
    grid-template-columns: 1fr;
  }

  .card-actions {
    grid-template-columns: 1fr;
    width: 100%;
  }
}
</style>
