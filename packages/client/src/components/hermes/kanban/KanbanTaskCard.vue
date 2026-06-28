<script setup lang="ts">
import { computed } from 'vue'
import { NPopover } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import ProfileAvatar from '@/components/hermes/profiles/ProfileAvatar.vue'
import type { KanbanTask } from '@/api/hermes/kanban'
import type { ProfileAvatar as ProfileAvatarData } from '@/api/hermes/profiles'

const props = defineProps<{
  task: KanbanTask
  assigneeAvatar?: ProfileAvatarData | null
}>()

const emit = defineEmits<{
  click: [taskId: string]
  dragstart: [taskId: string]
  dragend: []
}>()

const { t } = useI18n()

const priorityBucket = computed(() => {
  if (props.task.priority >= 3) return 'high'
  if (props.task.priority === 2) return 'medium'
  return 'low'
})

const priorityText = computed(() => t(`kanban.card.priority.${priorityBucket.value}`))

const timeAgo = computed(() => {
  const diff = Date.now() / 1000 - props.task.created_at
  if (diff < 60) return t('kanban.card.timeAgo.justNow')
  if (diff < 3600) return t('kanban.card.timeAgo.minutes', { count: Math.floor(diff / 60) })
  if (diff < 86400) return t('kanban.card.timeAgo.hours', { count: Math.floor(diff / 3600) })
  return t('kanban.card.timeAgo.days', { count: Math.floor(diff / 86400) })
})

const taskShortId = computed(() => props.task.id.slice(0, 6))

const isLive = computed(() => props.task.status === 'running')

// Populate the drag payload the column's drop handler reads (getData('text/plain')).
function onDragStart(event: DragEvent) {
  if (event.dataTransfer) {
    event.dataTransfer.setData('text/plain', props.task.id)
    event.dataTransfer.effectAllowed = 'move'
  }
  emit('dragstart', props.task.id)
}

const statusLabel = computed(() => t(`kanban.columns.${props.task.status}`, props.task.status))
</script>

<template>
  <NPopover
    trigger="hover"
    placement="top-start"
    :delay="140"
    :duration="60"
    :keep-alive-on-hover="false"
    style="padding: 0;"
  >
    <template #trigger>
      <article
        class="task-file"
        :class="[`status-${task.status}`, { 'is-live': isLive }]"
        :data-task-id="task.id"
        :data-status="task.status"
        draggable="true"
        @click="emit('click', task.id)"
        @dragstart="onDragStart"
        @dragend="emit('dragend')"
      >
        <span class="file-icon" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
            <polyline points="14 3 14 8 19 8" />
          </svg>
        </span>
        <span class="file-id">{{ taskShortId }}</span>
        <span class="file-title">{{ task.title }}</span>
        <span
          v-if="task.priority >= 2"
          class="file-priority"
          :class="priorityBucket"
          :title="priorityText"
          :aria-label="priorityText"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </span>
        <ProfileAvatar
          v-if="task.assignee"
          class="file-avatar"
          :name="task.assignee"
          :avatar="assigneeAvatar"
          :size="16"
          :title="task.assignee"
          aria-hidden="true"
        />
      </article>
    </template>

    <!-- Hover reveals the fuller detail that the compact row omits. -->
    <div class="task-preview" :class="`status-${task.status}`">
      <div class="preview-head">
        <span class="preview-status">
          <span class="preview-dot" aria-hidden="true" />
          {{ statusLabel }}
        </span>
        <span class="preview-id">{{ taskShortId }}</span>
      </div>
      <p class="preview-title">{{ task.title }}</p>
      <p v-if="task.body" class="preview-body">{{ task.body }}</p>
      <div class="preview-meta">
        <span v-if="task.priority >= 2" class="priority-chip" :class="priorityBucket">{{ priorityText }}</span>
        <span v-if="task.assignee" class="preview-assignee">
          <ProfileAvatar
            :name="task.assignee"
            :avatar="assigneeAvatar"
            :size="18"
            aria-hidden="true"
          />
          <span class="preview-assignee-name">{{ task.assignee }}</span>
        </span>
        <span class="preview-spacer" aria-hidden="true" />
        <time class="preview-time">{{ timeAgo }}</time>
      </div>
    </div>
  </NPopover>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

// ─── Compact file row ────────────────────────────────────────────────
.task-file {
  --card-accent-color: #64748b;

  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 30px;
  padding: 5px 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  transition:
    background $transition-fast,
    border-color $transition-fast,
    box-shadow $transition-fast;

  &.status-triage { --card-accent-color: #94a3b8; }
  &.status-todo { --card-accent-color: #38bdf8; }
  &.status-scheduled { --card-accent-color: #06b6d4; }
  &.status-ready { --card-accent-color: #f59e0b; }
  &.status-running { --card-accent-color: #8b5cf6; }
  &.status-blocked { --card-accent-color: #ef4444; }
  &.status-review { --card-accent-color: #ec4899; }
  &.status-done { --card-accent-color: #22c55e; }
  &.status-archived { --card-accent-color: #475569; }

  &:hover {
    background: var(--background-card);
    border-color: $border-light;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  }

  &:focus-visible {
    outline: 2px solid var(--card-accent-color);
    outline-offset: 1px;
  }

  &:active {
    cursor: grabbing;
  }
}

.file-icon {
  display: inline-flex;
  flex-shrink: 0;
  color: color-mix(in srgb, var(--card-accent-color) 80%, $text-muted);
}

.task-file.is-live .file-icon {
  animation: file-live 1.6s ease-in-out infinite;
}

@keyframes file-live {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

@media (prefers-reduced-motion: reduce) {
  .task-file.is-live .file-icon { animation: none; }
}

.file-id {
  flex-shrink: 0;
  font-family: $font-code;
  font-size: 10.5px;
  letter-spacing: 0.2px;
  font-variant-numeric: tabular-nums;
  color: $text-muted;
  opacity: 0.9;
}

.file-title {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.3;
  color: $text-primary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-priority {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &.high { color: #ef4444; }
  &.medium { color: #f59e0b; }
  &.low { display: none; }
}

.file-avatar {
  flex-shrink: 0;
}

// ─── Hover preview ───────────────────────────────────────────────────
.task-preview {
  --preview-accent: #64748b;

  width: 268px;
  padding: 12px 13px;
  display: flex;
  flex-direction: column;
  gap: 7px;

  &.status-triage { --preview-accent: #94a3b8; }
  &.status-todo { --preview-accent: #38bdf8; }
  &.status-scheduled { --preview-accent: #06b6d4; }
  &.status-ready { --preview-accent: #f59e0b; }
  &.status-running { --preview-accent: #8b5cf6; }
  &.status-blocked { --preview-accent: #ef4444; }
  &.status-review { --preview-accent: #ec4899; }
  &.status-done { --preview-accent: #22c55e; }
  &.status-archived { --preview-accent: #475569; }
}

.preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.preview-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  color: $text-secondary;
}

.preview-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--preview-accent);
}

.preview-id {
  font-family: $font-code;
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  color: $text-muted;
}

.preview-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.35;
  color: $text-primary;
  word-break: break-word;
}

.preview-body {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: $text-secondary;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.preview-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 1px;
}

.priority-chip {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.3px;
  padding: 1px 6px;
  border-radius: 3px;
  text-transform: uppercase;

  &.high { background: color-mix(in srgb, #ef4444 14%, transparent); color: #dc2626; }
  &.medium { background: color-mix(in srgb, #f59e0b 14%, transparent); color: #d97706; }
  &.low { background: color-mix(in srgb, #22c55e 14%, transparent); color: #16a34a; }
}

.preview-assignee {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.preview-assignee-name {
  font-size: 11px;
  font-weight: 500;
  color: $text-secondary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 110px;
}

.preview-spacer {
  flex: 1;
}

.preview-time {
  flex-shrink: 0;
  font-family: $font-code;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
  color: $text-muted;
}
</style>
