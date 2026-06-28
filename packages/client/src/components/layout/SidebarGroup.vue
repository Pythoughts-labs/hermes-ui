<script setup lang="ts">
withDefaults(defineProps<{
  groupKey: string
  label: string
  shortLabel?: string
  collapsed: boolean
  collapsedMode?: boolean
}>(), {
  shortLabel: undefined,
  collapsedMode: false,
})

const emit = defineEmits<{
  (e: 'toggle', key: string): void
}>()
</script>

<template>
  <div class="sidebar-group">
    <button
      type="button"
      class="sidebar-group__label"
      :aria-expanded="!collapsed"
      @click="emit('toggle', groupKey)"
    >
      <span class="sidebar-group__label-text">{{ collapsedMode && shortLabel ? shortLabel : label }}</span>
      <svg
        class="sidebar-group__chevron"
        :class="{ 'sidebar-group__chevron-collapsed': collapsed }"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
    <div v-show="!collapsed" class="sidebar-group__items">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.sidebar-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sidebar-group__label {
  font-size: 11px;
  font-weight: 600;
  color: var(--bolt-elements-textTertiary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 8px 12px 4px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  user-select: none;
  border: none;
  background: transparent;
  width: 100%;
  border-radius: 6px;
  transition: color 0.15s ease;
}

.sidebar-group__label:hover {
  color: var(--bolt-elements-textSecondary);
}

.sidebar-group__label-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-group__chevron {
  transition: transform 0.15s ease;
  flex-shrink: 0;
}

.sidebar-group__chevron-collapsed {
  transform: rotate(-90deg);
}

.sidebar-group__items {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
</style>