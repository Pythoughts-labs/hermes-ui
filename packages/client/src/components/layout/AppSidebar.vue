<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useMessage } from 'naive-ui'
import { useAppStore } from '@/stores/hermes/app'
import { usePersistentRecord } from '@/composables/usePersistentRecord'
import { isStoredSuperAdmin } from '@/api/client'
import SidebarGroup from '@/components/layout/SidebarGroup.vue'
import SidebarNavItem from '@/components/layout/SidebarNavItem.vue'
import SidebarFooter from '@/components/layout/SidebarFooter.vue'
import SidebarChangelogModal from '@/components/layout/SidebarChangelogModal.vue'
import ProfileSelector from '@/components/layout/ProfileSelector.vue'
import ModelSelector from '@/components/layout/ModelSelector.vue'
import VersionManagementModal from '@/components/layout/VersionManagementModal.vue'

const { t } = useI18n()
const message = useMessage()
const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const message_ = message

const selectedKey = computed(() => route.name as string)
const isSuperAdmin = computed(() => isStoredSuperAdmin())
const isVersionPreview = import.meta.env.VITE_HERMES_PREVIEW === '1'
const isDesktopShell = computed(() =>
  (window as typeof window & { hermesDesktop?: { isDesktop?: boolean } }).hermesDesktop?.isDesktop === true,
)

const showChangelog = ref(false)
const showVersionManagement = ref(false)

const { record: collapsedGroups, persist: persistCollapsedGroups } = usePersistentRecord('hermes.sidebar.collapsedGroups')

function hasRoute(name: string): boolean {
  return router.hasRoute(name)
}

function toggleGroup(key: string) {
  collapsedGroups[key] = !collapsedGroups[key]
  persistCollapsedGroups()
}

function isGroupCollapsed(key: string) {
  return !!collapsedGroups[key]
}

function handleSidebarClick(event: MouseEvent) {
  const target = event.target instanceof Element ? event.target : null
  if (!target?.closest('.sidebar-nav-item')) return
  if (typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches) {
    appStore.closeSidebar()
  }
}

async function handleUpdate() {
  const ok = await appStore.doUpdate()
  if (ok) message_.success(t('sidebar.updateSuccess'), { duration: 5000 })
  else message_.error(t('sidebar.updateFailed'))
}

function handleReloadClient() { appStore.reloadClient() }
function handleLogout() { localStorage.clear(); window.location.reload() }
function openChangelog() { showChangelog.value = true }
function openVersionManagement() { showVersionManagement.value = true }
</script>

<template>
  <aside class="sidebar" :class="{ open: appStore.sidebarOpen, collapsed: appStore.sidebarCollapsed }" @click="handleSidebarClick">
    <div class="sidebar-top-actions">
      <SidebarNavItem class="sidebar-return-tab" :to="{ name: 'hermes.chat' }" :title="t('sidebar.backToChat')">
        <template #icon><ArrowLeftIcon /></template>
        {{ t('sidebar.backToChat') }}
      </SidebarNavItem>
      <button
        class="sidebar-collapse-btn"
        :title="appStore.sidebarCollapsed ? t('sidebar.expand') : t('sidebar.collapse')"
        @click="appStore.toggleSidebarCollapsed()"
      >
        <PanelLeftOpenIcon v-if="appStore.sidebarCollapsed" :size="16" aria-hidden="true" />
        <PanelLeftCloseIcon v-else :size="16" aria-hidden="true" />
      </button>
    </div>
    <nav class="sidebar-nav">
      <!-- Agent -->
      <SidebarGroup
        group-key="agent"
        :label="t('sidebar.groupAgent')"
        :short-label="t('sidebar.groupAgentShort')"
        :collapsed="isGroupCollapsed('agent')"
        :collapsed-mode="appStore.sidebarCollapsed"
        @toggle="toggleGroup"
      >
        <SidebarNavItem :to="{ name: 'hermes.jobs' }" :active="selectedKey === 'hermes.jobs'">
          <template #icon><CalendarDaysIcon /></template>
          {{ t('sidebar.jobs') }}
        </SidebarNavItem>
        <SidebarNavItem :to="{ name: 'hermes.kanban' }" :active="selectedKey === 'hermes.kanban'">
          <template #icon><Columns3Icon /></template>
          {{ t('sidebar.kanban') }}
        </SidebarNavItem>
        <SidebarNavItem :to="{ name: 'hermes.channels' }" :active="selectedKey === 'hermes.channels'">
          <template #icon><MoonIcon /></template>
          {{ t('sidebar.channels') }}
        </SidebarNavItem>
        <SidebarNavItem :to="{ name: 'hermes.skills' }" :active="selectedKey === 'hermes.skills'">
          <template #icon><LayersIcon /></template>
          {{ t('sidebar.skills') }}
        </SidebarNavItem>
        <SidebarNavItem :to="{ name: 'hermes.plugins' }" :active="selectedKey === 'hermes.plugins'">
          <template #icon><PlugIcon /></template>
          {{ t('sidebar.plugins') }}
        </SidebarNavItem>
        <SidebarNavItem :to="{ name: 'hermes.mcp' }" :active="selectedKey === 'hermes.mcp'">
          <template #icon><ServerIcon /></template>
          {{ t('sidebar.mcp') }}
        </SidebarNavItem>
        <SidebarNavItem :to="{ name: 'hermes.memory' }" :active="selectedKey === 'hermes.memory'">
          <template #icon><LightbulbIcon /></template>
          {{ t('sidebar.memory') }}
        </SidebarNavItem>
        <SidebarNavItem :to="{ name: 'hermes.models' }" :active="selectedKey === 'hermes.models'">
          <template #icon><SparklesIcon /></template>
          {{ t('sidebar.models') }}
        </SidebarNavItem>
      </SidebarGroup>

      <!-- Monitoring -->
      <SidebarGroup
        group-key="monitoring"
        :label="t('sidebar.groupMonitoring')"
        :short-label="t('sidebar.groupMonitoringShort')"
        :collapsed="isGroupCollapsed('monitoring')"
        :collapsed-mode="appStore.sidebarCollapsed"
        @toggle="toggleGroup"
      >
        <SidebarNavItem :to="{ name: 'hermes.logs' }" :active="selectedKey === 'hermes.logs'">
          <template #icon><FileTextIcon /></template>
          {{ t('sidebar.logs') }}
        </SidebarNavItem>
        <SidebarNavItem :to="{ name: 'hermes.usage' }" :active="selectedKey === 'hermes.usage'">
          <template #icon><BarChart3Icon /></template>
          {{ t('sidebar.usage') }}
        </SidebarNavItem>
        <SidebarNavItem v-if="isSuperAdmin" :to="{ name: 'hermes.performance' }" :active="selectedKey === 'hermes.performance'">
          <template #icon><ActivityIcon /></template>
          {{ t('sidebar.performance') }}
        </SidebarNavItem>
        <SidebarNavItem :to="{ name: 'hermes.skillsUsage' }" :active="selectedKey === 'hermes.skillsUsage'">
          <template #icon><PieChartIcon /></template>
          {{ t('sidebar.skillsUsage') }}
        </SidebarNavItem>
      </SidebarGroup>

      <!-- Tools -->
      <SidebarGroup
        group-key="tools"
        :label="t('sidebar.groupTools')"
        :short-label="t('sidebar.groupToolsShort')"
        :collapsed="isGroupCollapsed('tools')"
        :collapsed-mode="appStore.sidebarCollapsed"
        @toggle="toggleGroup"
      >
        <SidebarNavItem v-if="hasRoute('hermes.codingAgents')" :to="{ name: 'hermes.codingAgents' }" :active="selectedKey === 'hermes.codingAgents'">
          <template #icon><Code2Icon /></template>
          {{ t('sidebar.codingAgents') }}
        </SidebarNavItem>
        <SidebarNavItem v-if="hasRoute('hermes.versionPreview') && isSuperAdmin && !isVersionPreview" :to="{ name: 'hermes.versionPreview' }" :active="selectedKey === 'hermes.versionPreview'">
          <template #icon><PackageIcon /></template>
          {{ t('sidebar.versionPreview') }}
        </SidebarNavItem>
        <SidebarNavItem v-if="isSuperAdmin" :to="{ name: 'hermes.devices' }" :active="selectedKey === 'hermes.devices'">
          <template #icon><MonitorIcon /></template>
          {{ t('sidebar.devices') }}
        </SidebarNavItem>
      </SidebarGroup>

      <!-- System -->
      <SidebarGroup
        group-key="system"
        :label="t('sidebar.groupSystem')"
        :short-label="t('sidebar.groupSystemShort')"
        :collapsed="isGroupCollapsed('system')"
        :collapsed-mode="appStore.sidebarCollapsed"
        @toggle="toggleGroup"
      >
        <SidebarNavItem v-if="isSuperAdmin" :to="{ name: 'hermes.profiles' }" :active="selectedKey === 'hermes.profiles'">
          <template #icon><UsersIcon /></template>
          {{ t('sidebar.profiles') }}
        </SidebarNavItem>
        <SidebarNavItem :to="{ name: 'hermes.settings' }" :active="selectedKey === 'hermes.settings'">
          <template #icon><SettingsIcon /></template>
          {{ t('sidebar.settings') }}
        </SidebarNavItem>
      </SidebarGroup>
    </nav>

    <ProfileSelector />
    <ModelSelector />

    <SidebarFooter
      @logout="handleLogout"
      @update="handleUpdate"
      @reload-client="handleReloadClient"
      @open-changelog="openChangelog"
      @open-version-management="openVersionManagement"
    />

    <SidebarChangelogModal v-model:show="showChangelog" />
    <VersionManagementModal v-if="isDesktopShell" v-model:show="showVersionManagement" />
  </aside>
</template>

<script lang="ts">
// ponytail: lucide icons declared via a tiny renderless component, avoids
// importing the entire icon set into the bundle for one component.
import {
  ArrowLeft as ArrowLeftIcon,
  ArrowRight as ArrowRightIcon,
  Activity as ActivityIcon,
  BarChart3 as BarChart3Icon,
  CalendarDays as CalendarDaysIcon,
  Code2 as Code2Icon,
  Columns3 as Columns3Icon,
  FileText as FileTextIcon,
  Layers as LayersIcon,
  Lightbulb as LightbulbIcon,
  Monitor as MonitorIcon,
  Moon as MoonIcon,
  Package as PackageIcon,
  PanelLeftClose as PanelLeftCloseIcon,
  PanelLeftOpen as PanelLeftOpenIcon,
  PieChart as PieChartIcon,
  Plug as PlugIcon,
  Server as ServerIcon,
  Settings as SettingsIcon,
  Sparkles as SparklesIcon,
  Users as UsersIcon,
} from 'lucide-vue-next'
export {
  ArrowLeftIcon,
  ArrowRightIcon,
  ActivityIcon,
  BarChart3Icon,
  CalendarDaysIcon,
  Code2Icon,
  Columns3Icon,
  FileTextIcon,
  LayersIcon,
  LightbulbIcon,
  MonitorIcon,
  MoonIcon,
  PackageIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  PieChartIcon,
  PlugIcon,
  ServerIcon,
  SettingsIcon,
  SparklesIcon,
  UsersIcon,
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.sidebar {
  position: relative;
  width: $sidebar-width;
  height: calc(100 * var(--vh));
  background-color: var(--bg-sidebar);
  border-right: 1px solid $border-color;
  display: flex;
  flex-direction: column;
  padding: 8px 12px 20px;
  flex-shrink: 0;
  transition: width $transition-normal;
}

.sidebar-nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  min-height: 0;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.sidebar-top-actions {
  display: flex;
  align-items: stretch;
  gap: 8px;
  margin-bottom: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid $border-color;
  min-height: 40px;
}

.sidebar-return-tab {
  flex: 1;
  min-width: 0;

  :deep(.sidebar-nav-item__icon svg) {
    transition: transform $transition-fast;
  }

  &:hover :deep(.sidebar-nav-item__icon svg),
  &:focus-visible :deep(.sidebar-nav-item__icon svg) {
    transform: translateX(-2px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sidebar-return-tab :deep(.sidebar-nav-item__icon svg) {
    transition: none;
  }

  .sidebar-return-tab:hover :deep(.sidebar-nav-item__icon svg),
  .sidebar-return-tab:focus-visible :deep(.sidebar-nav-item__icon svg) {
    transform: none;
  }
}

.sidebar-collapse-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  align-self: center;
  aspect-ratio: 1;
  height: 100%;
  padding: 0;
  border: 1px solid $border-color;
  background: $bg-card;
  appearance: none;
  text-decoration: none;
  color: $text-secondary;
  border-radius: $radius-sm;
  cursor: pointer;
  transition: color $transition-fast, background-color $transition-fast, border-color $transition-fast;

  &:hover {
    color: $text-primary;
    background-color: rgba(var(--accent-primary-rgb), 0.08);
    border-color: rgba(var(--accent-primary-rgb), 0.35);
  }

  &:focus-visible {
    outline: 2px solid rgba(var(--accent-primary-rgb), 0.55);
    outline-offset: 1px;
  }

  svg {
    width: 16px;
    height: 16px;
    display: block;
  }
}

.sidebar.collapsed {
  width: $sidebar-collapsed-width;
  padding: 8px 8px 12px;
  overflow: hidden;

  .sidebar-collapse-btn {
    display: flex;
    margin: 0;
  }

  .sidebar-top-actions {
    flex-direction: column;
    gap: 6px;
    margin-bottom: 8px;
    padding-bottom: 8px;
    align-items: stretch;
  }

  .sidebar-return-tab {
    width: 100%;
    flex: 0 0 auto;
    padding: 10px 4px;
    justify-content: center;

    :deep(.sidebar-nav-item__label) {
      display: none;
    }
  }

  .sidebar-collapse-btn {
    width: 100%;
    height: auto;
    aspect-ratio: auto;
    padding: 8px;
  }

  :deep(.model-selector) {
    display: none;
  }

  :deep(.profile-selector) {
    display: flex;
    justify-content: center;
    padding: 8px 0;
  }

  :deep(.profile-selector .selector-label),
  :deep(.profile-selector .profile-name) {
    display: none;
  }

  :deep(.profile-selector .profile-display) {
    width: 40px;
    justify-content: center;
    padding: 4px;
  }

  :deep(.sidebar-footer) {
    align-items: center;
    gap: 6px;
    padding-top: 8px;
  }

  :deep(.sidebar-footer__status-row),
  :deep(.sidebar-footer__version),
  :deep(.sidebar-footer__update-btn) {
    display: none;
  }
}

@media (max-width: $breakpoint-mobile) {
  .sidebar {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 1000;
    transform: translateX(-100%);
    transition: transform $transition-normal;
    padding-top: env(safe-area-inset-top, 0px);

    &.open {
      transform: translateX(0);
    }

    .sidebar-collapse-btn {
      display: flex;
    }

    .input-sm {
      width: 90px;
    }
  }
}
</style>