<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { NButton } from 'naive-ui'
import { useAppStore } from '@/stores/hermes/app'
import { getStoredUsername } from '@/api/client'
import LanguageSwitch from '@/components/layout/LanguageSwitch.vue'
import ThemeSwitch from '@/components/layout/ThemeSwitch.vue'

const { t } = useI18n()
const appStore = useAppStore()
const currentUsername = computed(() => getStoredUsername())
const isDesktopShell = computed(() =>
  (window as typeof window & { hermesDesktop?: { isDesktop?: boolean } }).hermesDesktop?.isDesktop === true,
)

const emit = defineEmits<{
  (e: 'logout'): void
  (e: 'update'): void
  (e: 'reload-client'): void
  (e: 'open-changelog'): void
  (e: 'open-version-management'): void
}>()
</script>

<template>
  <div class="sidebar-footer">
    <button class="sidebar-footer__logout" type="button" @click="emit('logout')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      <span class="sidebar-footer__logout-label">{{ t("sidebar.logout") }}</span>
      <span v-if="currentUsername" class="sidebar-footer__username" :title="currentUsername">{{ currentUsername }}</span>
    </button>

    <div class="sidebar-footer__status-row">
      <div
        class="sidebar-footer__status"
        :class="{ 'sidebar-footer__status--connected': appStore.connected, 'sidebar-footer__status--disconnected': !appStore.connected }"
      >
        <span class="sidebar-footer__status-dot" />
        <span class="sidebar-footer__status-text">
          {{ appStore.connected ? t("sidebar.connected") : t("sidebar.disconnected") }}
        </span>
      </div>
      <LanguageSwitch />
    </div>

    <div class="sidebar-footer__version">
      <div class="sidebar-footer__links">
        <a class="sidebar-footer__link" href="https://github.com/Pythoughts-labs/hermes-ui" target="_blank" rel="noopener noreferrer" title="GitHub">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
          </svg>
        </a>
        <a class="sidebar-footer__link" href="https://pythinker.com/hermes-ui" target="_blank" rel="noopener noreferrer" title="Website">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </a>
      </div>
      <span
        class="sidebar-footer__version-text"
        role="button"
        tabindex="0"
        @click="emit('open-changelog')"
        @keydown.enter="emit('open-changelog')"
        @keydown.space.prevent="emit('open-changelog')"
      >
        Build v{{ appStore.uiVersion }}
      </span>
      <ThemeSwitch />
    </div>

    <NButton v-if="isDesktopShell" type="primary" size="tiny" block class="sidebar-footer__update-btn" @click="emit('open-version-management')">
      {{ t('sidebar.versionManagement') }}
    </NButton>
    <NButton v-if="appStore.clientOutdated" type="warning" size="tiny" block class="sidebar-footer__update-btn" @click="emit('reload-client')">
      {{ t('sidebar.reloadClientVersion', { version: appStore.serverVersion }) }}
    </NButton>
    <NButton v-if="appStore.updateAvailable" type="primary" size="tiny" block class="sidebar-footer__update-btn" :loading="appStore.updating" @click="emit('update')">
      {{ appStore.updating ? t('sidebar.updating') : t('sidebar.updateVersion', { version: appStore.latestVersion }) }}
    </NButton>
  </div>
</template>

<style scoped>
.sidebar-footer {
  padding-top: 10px;
  border-top: 1px solid var(--border-main);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sidebar-footer__logout {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: none;
  background: none;
  appearance: none;
  text-decoration: none;
  color: var(--bolt-elements-textSecondary);
  font-size: 14px;
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
  width: 100%;
  text-align: left;
}

.sidebar-footer__logout:hover {
  background-color: var(--fill-tsp-white-main);
  color: var(--function-error);
}

.sidebar-footer__logout > svg {
  flex-shrink: 0;
  color: inherit;
}

.sidebar-footer__logout-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-footer__username {
  margin-left: auto;
  max-width: 96px;
  padding-left: 8px;
  color: var(--bolt-elements-textTertiary);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-footer__status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 0 4px;
}

.sidebar-footer__status {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding-left: 12px;
  font-size: 12px;
  color: var(--bolt-elements-textSecondary);
}

.sidebar-footer__status--connected .sidebar-footer__status-dot {
  background-color: var(--function-success);
  box-shadow: 0 0 6px var(--function-success-tsp);
}

.sidebar-footer__status--disconnected .sidebar-footer__status-dot {
  background-color: var(--function-error);
}

.sidebar-footer__status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sidebar-footer__status-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-footer__version {
  padding: 2px 0 8px 12px;
  font-size: 11px;
  color: var(--bolt-elements-textTertiary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  overflow: hidden;
}

.sidebar-footer__links {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 6px;
}

.sidebar-footer__link {
  color: var(--bolt-elements-textTertiary);
  display: flex;
  align-items: center;
  transition: color 0.15s ease;
}

.sidebar-footer__link:hover {
  color: var(--bolt-elements-textPrimary);
}

.sidebar-footer__version-text {
  flex: 0 0 auto;
  overflow: visible;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.15s ease;
}

.sidebar-footer__version-text:hover {
  color: var(--bolt-elements-item-contentAccent);
}

.sidebar-footer__version :deep(.theme-switch-container) {
  flex-shrink: 0;
}

.sidebar-footer__update-btn {
  margin: 4px 0 0;
  border-radius: 6px;
}
</style>