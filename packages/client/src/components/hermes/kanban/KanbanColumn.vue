<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import KanbanTaskCard from './KanbanTaskCard.vue'
import type { KanbanTask, KanbanTaskStatus } from '@/api/hermes/kanban'

const props = defineProps<{
  status: KanbanTaskStatus
  tasks: KanbanTask[]
}>()

const emit = defineEmits<{
  taskClick: [taskId: string]
  taskDragStart: [taskId: string]
  taskDragEnd: []
  taskDrop: [taskId: string, targetStatus: KanbanTaskStatus]
  addTask: [status: KanbanTaskStatus]
}>()

const { t } = useI18n()

const isDragOver = ref(false)
const dragCounter = ref(0)

function handleDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

function handleDragEnter(event: DragEvent) {
  event.preventDefault()
  dragCounter.value++
  isDragOver.value = true
}

function handleDragLeave() {
  dragCounter.value = Math.max(0, dragCounter.value - 1)
  if (dragCounter.value === 0) isDragOver.value = false
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  isDragOver.value = false
  dragCounter.value = 0
  const taskId = event.dataTransfer?.getData('text/plain')
  if (taskId) emit('taskDrop', taskId, props.status)
}

function handleEmptyAdd() {
  emit('addTask', props.status)
}
</script>

<template>
  <section
    class="kanban-column"
    :class="[`status-${status}`, { 'is-drag-over': isDragOver, 'is-empty': tasks.length === 0 }]"
    :data-status="status"
    :aria-label="t(`kanban.columns.${status}`, status)"
    @dragover="handleDragOver"
    @dragenter="handleDragEnter"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
  >
    <header class="column-head">
      <div class="head-main">
        <span class="status-dot" aria-hidden="true" />
        <span class="column-title">{{ t(`kanban.columns.${status}`, status) }}</span>
        <span class="column-count">{{ tasks.length }}</span>
      </div>
      <button
        type="button"
        class="add-task-btn"
        :aria-label="`${t('kanban.createTask')} — ${t(`kanban.columns.${status}`, status)}`"
        :title="`${t('kanban.createTask')} — ${t(`kanban.columns.${status}`, status)}`"
        @click="handleEmptyAdd"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </header>

    <div class="column-body">
      <KanbanTaskCard
        v-for="task in tasks"
        :key="task.id"
        :task="task"
        :assignee-avatar="null"
        @click="emit('taskClick', task.id)"
        @dragstart="emit('taskDragStart', task.id)"
        @dragend="emit('taskDragEnd')"
      />

      <!-- Compact empty hint — shown only when the column is empty and nothing is being dragged over it. -->
      <button
        v-if="tasks.length === 0 && !isDragOver"
        type="button"
        class="column-empty"
        @click="handleEmptyAdd"
      >
        <span class="column-empty-text">{{ t('kanban.noTasks') }}</span>
        <span class="column-empty-add">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          {{ t('kanban.createTask') }}
        </span>
      </button>

      <!-- Drop placeholder — appears only during an active drag over this column (standard board behavior). -->
      <div v-if="isDragOver" class="drop-placeholder" aria-hidden="true" />
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

$column-radius: 10px;
$column-head-height: 40px;

.kanban-column {
  --column-accent-color: #64748b;

  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--background-card) 60%, transparent);
  border: 1px solid $border-light;
  border-radius: $column-radius;
  overflow: hidden;
  transition: border-color $transition-fast, background $transition-fast;

  &.status-triage { --column-accent-color: #94a3b8; }
  &.status-todo { --column-accent-color: #38bdf8; }
  &.status-scheduled { --column-accent-color: #06b6d4; }
  &.status-ready { --column-accent-color: #f59e0b; }
  &.status-running { --column-accent-color: #8b5cf6; }
  &.status-blocked { --column-accent-color: #ef4444; }
  &.status-review { --column-accent-color: #ec4899; }
  &.status-done { --column-accent-color: #22c55e; }
  &.status-archived { --column-accent-color: #475569; }

  &.is-drag-over {
    border-color: var(--column-accent-color);
    background: color-mix(in srgb, var(--column-accent-color) 7%, transparent);

    .drop-placeholder {
      border-color: var(--column-accent-color);
      background: color-mix(in srgb, var(--column-accent-color) 8%, transparent);
    }
  }
}

// Neutral chrome: grey label + muted count; the status is signalled only by the
// small colored dot (color reserved for signal, Linear-style).
.column-head {
  flex: 0 0 $column-head-height;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 6px 0 12px;
  border-bottom: 1px solid $border-light;
}

.head-main {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--column-accent-color);
  flex-shrink: 0;
}

.column-title {
  font-size: 12.5px;
  font-weight: 600;
  color: $text-secondary;
  letter-spacing: 0.1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 0 1 auto;
  min-width: 0;
}

.column-count {
  font-family: $font-code;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: $text-muted;
  padding: 1px 7px;
  border-radius: 4px;
  background: color-mix(in srgb, $text-muted 12%, transparent);
  min-width: 20px;
  text-align: center;
}

.add-task-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: $text-muted;
  cursor: pointer;
  flex-shrink: 0;
  transition: background $transition-fast, color $transition-fast;

  &:hover {
    background: color-mix(in srgb, var(--column-accent-color) 14%, transparent);
    color: var(--column-accent-color);
  }

  &:focus-visible {
    outline: 2px solid var(--column-accent-color);
    outline-offset: 1px;
  }
}

.column-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  overflow-y: auto;
  flex: 1 1 auto;
  min-height: 0;
  scrollbar-width: thin;
}

// Compact, low-emphasis empty state — not a full-height drop zone.
.column-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  margin: 6px auto 0;
  padding: 12px 14px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: $text-muted;
  cursor: pointer;
  font: inherit;
  text-align: center;
  transition: color $transition-fast, background $transition-fast;

  &:hover {
    color: $text-secondary;
    background: color-mix(in srgb, var(--column-accent-color) 6%, transparent);
  }

  &:focus-visible {
    outline: 2px solid var(--column-accent-color);
    outline-offset: 2px;
  }
}

.column-empty-text {
  font-size: 12px;
  opacity: 0.85;
}

.column-empty-add {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  font-weight: 500;
  opacity: 0.7;

  svg { flex-shrink: 0; }
}

// Drop target hint, only rendered while dragging over the column.
.drop-placeholder {
  flex-shrink: 0;
  min-height: 38px;
  margin-top: 2px;
  border: 1px dashed $border-color;
  border-radius: 6px;
  background: transparent;
  transition: border-color $transition-fast, background $transition-fast;
}
</style>
