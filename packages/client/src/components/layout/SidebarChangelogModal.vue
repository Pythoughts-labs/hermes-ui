<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { NModal } from 'naive-ui'
import { changelog } from '@/data/changelog'

const { t } = useI18n()
defineProps<{ show: boolean }>()
const emit = defineEmits<{
  (e: 'update:show', value: boolean): void
}>()
</script>

<template>
  <NModal
    :show="show"
    preset="dialog"
    :title="t('sidebar.changelog')"
    style="width: 520px;"
    @update:show="emit('update:show', $event)"
  >
    <div class="changelog-list">
      <div v-for="entry in changelog" :key="entry.version" class="changelog-version-block">
        <div class="changelog-version-header">
          <span class="changelog-version-tag">v{{ entry.version }}</span>
          <span class="changelog-date">{{ entry.date }}</span>
        </div>
        <ul class="changelog-changes">
          <li v-for="(change, idx) in entry.changes" :key="idx">{{ t(change) }}</li>
        </ul>
      </div>
    </div>
  </NModal>
</template>

<style scoped>
.changelog-list {
  max-height: min(70vh, 640px);
  overflow-y: auto;
}

.changelog-version-block {
  margin-bottom: 20px;
}

.changelog-version-block:last-child {
  margin-bottom: 0;
}

.changelog-version-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.changelog-version-tag {
  font-weight: 600;
  font-size: 14px;
  color: var(--bolt-elements-textPrimary);
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
}

.changelog-date {
  font-size: 12px;
  color: var(--bolt-elements-textTertiary);
}

.changelog-changes {
  list-style: none;
  padding: 0;
  margin: 0;
}

.changelog-changes li {
  font-size: 13px;
  color: var(--bolt-elements-textSecondary);
  padding: 4px 0 4px 16px;
  position: relative;
}

.changelog-changes li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 12px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--bolt-elements-textTertiary);
}
</style>