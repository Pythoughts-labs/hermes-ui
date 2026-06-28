<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import RouteLinkItem from '@/components/common/RouteLinkItem.vue'

withDefaults(defineProps<{
  to: RouteLocationRaw
  active?: boolean
  title?: string
}>(), {
  active: false,
  title: undefined,
})
</script>

<template>
  <RouteLinkItem class="sidebar-nav-item" :to="to" :active="active" :title="title">
    <span class="sidebar-nav-item__icon">
      <slot name="icon" />
    </span>
    <span class="sidebar-nav-item__label">
      <slot />
    </span>
  </RouteLinkItem>
</template>

<style scoped>
.sidebar-nav-item {
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

.sidebar-nav-item:hover {
  background-color: var(--fill-tsp-white-main);
  color: var(--bolt-elements-textPrimary);
}

.sidebar-nav-item.active {
  background-color: var(--fill-tsp-white-dark);
  color: var(--bolt-elements-textPrimary);
}

.sidebar-nav-item__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  color: var(--icon-secondary);
}

.sidebar-nav-item__label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>