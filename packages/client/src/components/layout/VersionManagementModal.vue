<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { NAlert, NButton, NDrawer, NDrawerContent, NPopconfirm, NProgress, NSpin, NTag, useMessage } from 'naive-ui'
import {
  activateRuntimeVersion,
  activateUiVersion,
  deleteRuntimeVersion,
  deleteUiVersion,
  downloadRuntimeVersion,
  downloadUiVersion,
  fetchRuntimeVersionStatus,
  fetchVersionDownloadJobs,
  type InstalledRuntimeVersion,
  type InstalledUiVersion,
  type RuntimeVersionStatus,
  type VersionDownloadJob,
  type VersionDownloadJobStatus,
  type VersionDownloadKind,
} from '@/api/hermes/runtime-versions'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{ (event: 'update:show', value: boolean): void }>()

const { t } = useI18n()
const message = useMessage()

const status = ref<RuntimeVersionStatus | null>(null)
const jobs = ref<VersionDownloadJob[]>([])
const loading = ref(false)
const actionLoading = ref<Record<string, boolean>>({})
const loadError = ref('')
let pollTimer: ReturnType<typeof setInterval> | null = null

const currentPlatformRuntime = computed(() =>
  (status.value?.hermes.installed || []).filter(item => item.platform === status.value?.platform),
)

const runtimeVersions = computed(() => uniqueVersions([
  ...(status.value?.hermes.remoteVersions || []),
  ...currentPlatformRuntime.value.map(item => item.version),
]))

const uiVersions = computed(() => uniqueVersions([
  ...(status.value?.ui.remoteVersions || []),
  ...(status.value?.ui.installed || []).map(item => item.version),
  status.value?.ui.currentVersion || '',
]))

watch(() => props.show, show => {
  if (show) {
    void loadAll()
  } else {
    stopPolling()
  }
})

onBeforeUnmount(stopPolling)

function updateShow(show: boolean) {
  emit('update:show', show)
}

function uniqueVersions(values: string[]): string[] {
  return Array.from(new Set(values.map(item => item.trim().replace(/^v/, '')).filter(Boolean)))
    .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
}

async function loadAll() {
  loading.value = true
  loadError.value = ''
  try {
    await Promise.all([loadStatus(), loadJobs()])
    if (hasRunningJobs()) startPolling()
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

async function loadStatus() {
  status.value = await fetchRuntimeVersionStatus()
}

async function loadJobs() {
  const nextJobs = await fetchVersionDownloadJobs()
  jobs.value = nextJobs.jobs
}

async function refreshJobs() {
  try {
    const hadRunning = hasRunningJobs()
    await loadJobs()
    if (hadRunning && !hasRunningJobs()) {
      stopPolling()
      await loadStatus()
    } else if (!hasRunningJobs()) {
      stopPolling()
    }
  } catch {
    stopPolling()
  }
}

function startPolling() {
  if (pollTimer) return
  pollTimer = setInterval(() => {
    void refreshJobs()
  }, 2000)
}

function stopPolling() {
  if (!pollTimer) return
  clearInterval(pollTimer)
  pollTimer = null
}

function hasRunningJobs(): boolean {
  return jobs.value.some(job => job.status === 'queued' || job.status === 'running')
}

function runtimeFor(version: string): InstalledRuntimeVersion | undefined {
  return currentPlatformRuntime.value.find(item => item.version === version)
}

function uiFor(version: string): InstalledUiVersion | undefined {
  return status.value?.ui.installed.find(item => item.version === version)
}

function activeJob(kind: VersionDownloadKind, version: string): VersionDownloadJob | undefined {
  return jobs.value.find(job =>
    job.kind === kind &&
    job.version === version.replace(/^v/, '') &&
    (job.status === 'queued' || job.status === 'running'),
  )
}

function jobType(statusValue: VersionDownloadJobStatus): 'default' | 'info' | 'success' | 'error' | 'warning' {
  if (statusValue === 'completed') return 'success'
  if (statusValue === 'failed') return 'error'
  if (statusValue === 'running') return 'info'
  return 'warning'
}

function jobLabel(job: VersionDownloadJob): string {
  if (job.status === 'completed' || job.status === 'failed') {
    return t(`runtimeVersions.jobStatus.${job.status}`)
  }
  return t(`runtimeVersions.jobStageStatus.${job.stage}`)
}

function messageText(message: string): string {
  return message.startsWith('runtimeVersions.') ? t(message) : message
}

function setActionLoading(key: string, value: boolean) {
  actionLoading.value = { ...actionLoading.value, [key]: value }
}

async function runAction(key: string, action: () => Promise<void>) {
  setActionLoading(key, true)
  try {
    await action()
  } catch (err) {
    message.error(err instanceof Error ? err.message : String(err))
  } finally {
    setActionLoading(key, false)
  }
}

function sourceLabel(): string {
  return t('runtimeVersions.github')
}

function formatBytes(value?: number): string {
  if (!value || value <= 0) return ''
  const units = ['B', 'KB', 'MB', 'GB']
  let size = value
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`
}

function jobProgressText(job: VersionDownloadJob): string {
  if (job.receivedBytes && job.totalBytes) {
    return `${formatBytes(job.receivedBytes)} / ${formatBytes(job.totalBytes)}`
  }
  if (job.receivedBytes) return formatBytes(job.receivedBytes)
  return messageText(job.message)
}

async function startRuntimeDownload(version: string) {
  await runAction(`download-runtime-${version}`, async () => {
    const response = await downloadRuntimeVersion(version)
    jobs.value = [response.job, ...jobs.value.filter(job => job.id !== response.job.id)]
    message.success(t('runtimeVersions.downloadStarted'))
    startPolling()
  })
}

async function startUiDownload(version: string) {
  await runAction(`download-ui-${version}`, async () => {
    const response = await downloadUiVersion(version)
    jobs.value = [response.job, ...jobs.value.filter(job => job.id !== response.job.id)]
    message.success(t('runtimeVersions.downloadStarted'))
    startPolling()
  })
}

async function useRuntime(version: string) {
  await runAction(`activate-runtime-${version}`, async () => {
    await activateRuntimeVersion(version)
    message.success(t('runtimeVersions.activateSuccess'))
    await loadAll()
  })
}

async function removeRuntime(version: string) {
  await runAction(`delete-runtime-${version}`, async () => {
    await deleteRuntimeVersion(version)
    message.success(t('runtimeVersions.deleteRuntimeSuccess'))
    await loadAll()
  })
}

async function useUi(version: string) {
  await runAction(`activate-ui-${version}`, async () => {
    await activateUiVersion(version)
    message.success(t('runtimeVersions.activateSuccess'))
    await loadAll()
  })
}

async function removeUi(version: string) {
  await runAction(`delete-ui-${version}`, async () => {
    await deleteUiVersion(version)
    message.success(t('runtimeVersions.deleteUiSuccess'))
    await loadAll()
  })
}
</script>

<template>
  <NDrawer
    :show="props.show"
    placement="right"
    :width="'min(860px, calc(100vw - 24px))'"
    @update:show="updateShow"
  >
    <NDrawerContent :title="t('runtimeVersions.title')" closable>
      <NSpin :show="loading">
        <div class="version-management">
          <NAlert v-if="loadError" type="error" :bordered="false">
            {{ loadError }}
          </NAlert>
          <NAlert v-if="status?.remoteError" type="warning" :bordered="false">
            {{ t('runtimeVersions.remoteLoadFailed') }}: {{ status.remoteError }}
          </NAlert>

        <section class="version-section">
          <div class="section-heading">
            <div>
              <h3>{{ t('runtimeVersions.runtimeTitle') }}</h3>
              <p>{{ t('runtimeVersions.platform') }}: {{ status?.platform || '-' }}</p>
            </div>
            <NButton size="small" secondary @click="loadAll">{{ t('runtimeVersions.refresh') }}</NButton>
          </div>
          <div class="active-path">
            <span>{{ t('runtimeVersions.activeVersion') }}: {{ status?.hermes.activeVersion || '-' }}</span>
            <span :title="status?.hermes.activeDirectory || ''">{{ status?.hermes.activeDirectory || '-' }}</span>
          </div>
          <div class="version-list">
            <div v-for="version in runtimeVersions" :key="`runtime-${version}`" class="version-row">
              <div class="version-main">
                <strong>{{ version }}</strong>
                <NTag v-if="runtimeFor(version)?.active" size="small" type="success" :bordered="false">
                  {{ t('runtimeVersions.active') }}
                </NTag>
                <NTag v-else-if="runtimeFor(version)" size="small" :bordered="false">
                  {{ t('runtimeVersions.installed') }}
                </NTag>
                <NTag v-if="activeJob('runtime', version)" size="small" :type="jobType(activeJob('runtime', version)!.status)" :bordered="false">
                  {{ jobLabel(activeJob('runtime', version)!) }}
                </NTag>
              </div>
              <div class="version-actions">
                <NButton
                  v-if="runtimeFor(version) && !runtimeFor(version)?.active"
                  size="small"
                  secondary
                  :loading="actionLoading[`activate-runtime-${version}`]"
                  @click="useRuntime(version)"
                >
                  {{ t('runtimeVersions.useVersion') }}
                </NButton>
                <NPopconfirm
                  v-if="runtimeFor(version) && !runtimeFor(version)?.active"
                  @positive-click="removeRuntime(version)"
                >
                  <template #trigger>
                    <NButton
                      size="small"
                      type="error"
                      secondary
                      :loading="actionLoading[`delete-runtime-${version}`]"
                    >
                      {{ t('runtimeVersions.deleteVersion') }}
                    </NButton>
                  </template>
                  {{ t('runtimeVersions.deleteRuntimeConfirm', { version }) }}
                </NPopconfirm>
                <NButton
                  v-if="!runtimeFor(version)"
                  size="small"
                  type="primary"
                  secondary
                  :disabled="!!activeJob('runtime', version)"
                  :loading="actionLoading[`download-runtime-github-${version}`]"
                  @click="startRuntimeDownload(version)"
                >
                  {{ t('runtimeVersions.downloadGithub') }}
                </NButton>
              </div>
            </div>
            <div v-if="runtimeVersions.length === 0" class="empty-row">{{ t('runtimeVersions.noVersions') }}</div>
          </div>
        </section>

        <section class="version-section">
          <div class="section-heading">
            <div>
              <h3>{{ t('runtimeVersions.uiTitle') }}</h3>
              <p>{{ t('runtimeVersions.currentUi') }}: {{ status?.ui.currentVersion || '-' }}</p>
            </div>
          </div>
          <div class="active-path">
            <span>{{ t('runtimeVersions.activeVersion') }}: {{ status?.ui.activeVersion || '-' }}</span>
            <span :title="status?.ui.activeDirectory || ''">{{ status?.ui.activeDirectory || '-' }}</span>
          </div>
          <div class="version-list">
            <div v-for="version in uiVersions" :key="`ui-${version}`" class="version-row">
              <div class="version-main">
                <strong>{{ version }}</strong>
                <NTag v-if="uiFor(version)?.active || version === status?.ui.activeVersion" size="small" type="success" :bordered="false">
                  {{ t('runtimeVersions.active') }}
                </NTag>
                <NTag v-else-if="uiFor(version)" size="small" :bordered="false">
                  {{ t('runtimeVersions.installed') }}
                </NTag>
                <NTag v-if="activeJob('ui', version)" size="small" :type="jobType(activeJob('ui', version)!.status)" :bordered="false">
                  {{ jobLabel(activeJob('ui', version)!) }}
                </NTag>
              </div>
              <div class="version-actions">
                <NButton
                  v-if="uiFor(version) && !uiFor(version)?.active && version !== status?.ui.activeVersion"
                  size="small"
                  secondary
                  :loading="actionLoading[`activate-ui-${version}`]"
                  @click="useUi(version)"
                >
                  {{ t('runtimeVersions.useVersion') }}
                </NButton>
                <NPopconfirm
                  v-if="uiFor(version) && !uiFor(version)?.active && version !== status?.ui.activeVersion"
                  @positive-click="removeUi(version)"
                >
                  <template #trigger>
                    <NButton
                      size="small"
                      type="error"
                      secondary
                      :loading="actionLoading[`delete-ui-${version}`]"
                    >
                      {{ t('runtimeVersions.deleteVersion') }}
                    </NButton>
                  </template>
                  {{ t('runtimeVersions.deleteUiConfirm', { version }) }}
                </NPopconfirm>
                <NButton
                  v-if="!uiFor(version) && version !== status?.ui.activeVersion"
                  size="small"
                  type="primary"
                  secondary
                  :disabled="!!activeJob('ui', version)"
                  :loading="actionLoading[`download-ui-github-${version}`]"
                  @click="startUiDownload(version)"
                >
                  {{ t('runtimeVersions.downloadGithub') }}
                </NButton>
              </div>
            </div>
            <div v-if="uiVersions.length === 0" class="empty-row">{{ t('runtimeVersions.noVersions') }}</div>
          </div>
        </section>

        <section class="version-section" v-if="jobs.length > 0">
          <div class="section-heading compact">
            <h3>{{ t('runtimeVersions.downloadTasks') }}</h3>
          </div>
          <div class="job-list">
            <div v-for="job in jobs.slice(0, 6)" :key="job.id" class="job-row">
              <div class="job-main">
                <span>{{ job.kind === 'runtime' ? t('runtimeVersions.runtimeTitle') : t('runtimeVersions.uiTitle') }} {{ job.version }} · {{ sourceLabel() }}</span>
                <div v-if="job.status === 'running' || job.status === 'queued'" class="job-progress">
                  <NProgress
                    type="line"
                    :percentage="Math.round(job.percent || 0)"
                    :show-indicator="typeof job.percent === 'number'"
                    :processing="job.status === 'running' && job.stage === 'download'"
                  />
                  <small>{{ jobProgressText(job) }}</small>
                </div>
                <small v-if="job.error">{{ job.error }}</small>
              </div>
              <NTag size="small" :type="jobType(job.status)" :bordered="false">{{ jobLabel(job) }}</NTag>
            </div>
          </div>
        </section>
        </div>
      </NSpin>
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped lang="scss">
.version-management {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.version-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;

  h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }

  p {
    margin: 4px 0 0;
    color: var(--text-color-3);
    font-size: 12px;
  }

  &.compact {
    align-items: center;
  }
}

.active-path {
  display: grid;
  grid-template-columns: minmax(130px, auto) minmax(0, 1fr);
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-color-2);
  font-size: 12px;

  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.version-list,
.job-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}

.version-row,
.job-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 44px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-color);

  &:last-child {
    border-bottom: 0;
  }
}

.version-main,
.job-main {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 8px;
}

.job-main {
  flex: 1 1 auto;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;

  small {
    color: var(--text-color-3);
    word-break: break-word;
  }

  > small {
    color: var(--error-color);
  }
}

.job-progress {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(120px, 1fr) auto;
  align-items: center;
  gap: 8px;
}

.version-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-shrink: 0;
  gap: 8px;
}

.empty-row {
  padding: 14px 10px;
  color: var(--text-color-3);
  font-size: 13px;
  text-align: center;
}

@media (max-width: 640px) {
  .section-heading,
  .version-row,
  .job-row {
    align-items: stretch;
    flex-direction: column;
  }

  .active-path {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .version-actions {
    justify-content: flex-start;
  }
}
</style>
