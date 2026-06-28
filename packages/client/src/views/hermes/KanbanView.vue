<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { NButton, NSelect, NSpin, NDropdown, NModal, NInput, useMessage } from 'naive-ui'
import type { DropdownOption } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import KanbanColumn from '@/components/hermes/kanban/KanbanColumn.vue'
import KanbanTaskDrawer from '@/components/hermes/kanban/KanbanTaskDrawer.vue'
import KanbanCreateForm from '@/components/hermes/kanban/KanbanCreateForm.vue'
import { DEFAULT_KANBAN_BOARD, useKanbanStore } from '@/stores/hermes/kanban'
import { useProfilesStore } from '@/stores/hermes/profiles'
import { withDefaultAssignee } from '@/utils/hermes/kanban-assignees'
import type { KanbanTaskStatus } from '@/api/hermes/kanban'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const message = useMessage()
const kanbanStore = useKanbanStore()
const profilesStore = useProfilesStore()

const showCreateForm = ref(false)
const showCreateBoardForm = ref(false)
const selectedTaskId = ref<string | null>(null)
const newBoardSlug = ref('')
const newBoardName = ref('')
const boardActionLoading = ref(false)
const refreshTimer = ref<ReturnType<typeof setInterval> | null>(null)
const routeReady = ref(false)
const draggingTaskId = ref<string | null>(null)

const boardStatuses: KanbanTaskStatus[] = ['triage', 'todo', 'scheduled', 'ready', 'running', 'blocked', 'review', 'done', 'archived']

function firstQueryString(value: unknown): string | null {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : null
  return typeof value === 'string' ? value : null
}

function routeBoard(): string | null {
  return firstQueryString(route.query.board)
}

async function replaceRouteBoard(board: string) {
  if (routeBoard() === board) return
  await router.replace({ query: { ...route.query, board } })
}

async function applyBoardSelection(candidate: string | null, notify = true, forceRefresh = false) {
  const previousBoard = kanbanStore.selectedBoard
  const { board, recovered } = kanbanStore.recoverSelectedBoard(candidate || kanbanStore.selectedBoard || DEFAULT_KANBAN_BOARD)
  selectedTaskId.value = null
  showCreateForm.value = false
  showCreateBoardForm.value = false
  if (notify && recovered && kanbanStore.boardWarning) message.warning(kanbanStore.boardWarning)
  await replaceRouteBoard(board)
  if (forceRefresh || board !== previousBoard) {
    await kanbanStore.refreshAll()
  }
}

const boardOptions = computed(() => kanbanStore.activeBoards.map(board => {
  const count = typeof board.total === 'number' ? board.total : 0
  return {
    label: `${board.icon ? `${board.icon} ` : ''}${board.name || board.slug} · ${count}`,
    value: board.slug,
  }
}))

const selectedBoardValue = computed({
  get: () => kanbanStore.selectedBoard,
  set: (value: string) => {
    void applyBoardSelection(value || DEFAULT_KANBAN_BOARD)
  },
})

const tasksByStatus = computed(() => {
  const grouped: Record<string, typeof kanbanStore.tasks> = {}
  for (const status of boardStatuses) {
    grouped[status] = kanbanStore.tasks
      .filter(task => task.status === status)
      .sort((a, b) => b.created_at - a.created_at)
  }
  return grouped
})

const visibleBoardStatuses = computed(() => {
  const status = kanbanStore.filterStatus as KanbanTaskStatus | null
  return status && boardStatuses.includes(status) ? [status] : boardStatuses
})

const visibleAssignees = computed(() => withDefaultAssignee(kanbanStore.assignees, kanbanStore.stats?.by_assignee || {}))

const menuOptions = computed<DropdownOption[]>(() => [
  {
    type: 'group',
    label: t('kanban.allStatuses'),
    key: 'status-group',
    children: [
      { label: t('kanban.allStatuses'), key: 'status:' },
      ...boardStatuses.map(status => ({
        label: `${t(`kanban.columns.${status}`, status)}`,
        key: `status:${status}`,
      })),
    ],
  },
  {
    type: 'group',
    label: t('kanban.allAssignees'),
    key: 'assignee-group',
    children: [
      { label: t('kanban.allAssignees'), key: 'assignee:' },
      ...visibleAssignees.value.map(a => ({
        label: a.name,
        key: `assignee:${a.name}`,
      })),
    ],
  },
  { type: 'divider', key: 'd1' },
  { label: t('common.add'), key: 'add-board' },
  {
    label: t('kanban.board.archive'),
    key: 'archive-board',
    disabled: kanbanStore.selectedBoard === DEFAULT_KANBAN_BOARD,
  },
  { label: t('kanban.action.dispatch'), key: 'dispatch' },
])

watch(() => route.query.board, async () => {
  if (!routeReady.value) return
  await applyBoardSelection(routeBoard(), false)
})

onMounted(async () => {
  await Promise.all([
    kanbanStore.fetchBoards(),
    kanbanStore.fetchCapabilities(),
    profilesStore.profiles.length === 0 ? profilesStore.fetchProfiles() : Promise.resolve(),
  ])
  await applyBoardSelection(routeBoard(), true, true)
  kanbanStore.startEventStream()
  routeReady.value = true
  refreshTimer.value = setInterval(() => {
    if (document.visibilityState === 'visible') {
      void Promise.all([kanbanStore.fetchBoards(), kanbanStore.fetchTasks(true), kanbanStore.fetchStats()])
    }
  }, 15000)
})

onUnmounted(() => {
  kanbanStore.stopEventStream()
  if (refreshTimer.value) clearInterval(refreshTimer.value)
})

function handleDrawerClose() {
  selectedTaskId.value = null
}

async function handleDrawerUpdated() {
  await Promise.all([kanbanStore.fetchTasks(), kanbanStore.fetchStats()])
}

function handleNavigateTask(taskId: string) {
  selectedTaskId.value = taskId
}

async function handleMenuSelect(key: string) {
  if (key.startsWith('status:')) {
    const value = key.slice('status:'.length) || null
    kanbanStore.setFilter('status', value)
    await kanbanStore.fetchTasks()
    return
  }
  if (key.startsWith('assignee:')) {
    const value = key.slice('assignee:'.length) || null
    kanbanStore.setFilter('assignee', value)
    await kanbanStore.fetchTasks()
    return
  }
  if (key === 'add-board') {
    showCreateBoardForm.value = true
    return
  }
  if (key === 'archive-board') {
    await handleArchiveSelectedBoard()
    return
  }
  if (key === 'dispatch') {
    await handleDispatch()
    return
  }
}

function goBack() {
  if (window.history.length > 1) {
    router.back()
  } else {
    router.push({ name: 'hermes.chat' })
  }
}

async function handleTaskCreated() {
  await Promise.all([kanbanStore.fetchTasks(), kanbanStore.fetchStats(), kanbanStore.fetchBoards()])
}

function handleAddTask(_status?: KanbanTaskStatus) {
  showCreateForm.value = true
  // ponytail: status is captured at submit time inside KanbanCreateForm; board scope is enforced by the store.
  void _status
}

function handleColumnTaskClick(taskId: string) {
  selectedTaskId.value = taskId
}

function handleColumnTaskDragStart(taskId: string) {
  draggingTaskId.value = taskId
}

function handleColumnTaskDragEnd() {
  draggingTaskId.value = null
}

async function handleColumnTaskDrop(taskId: string, targetStatus: KanbanTaskStatus) {
  draggingTaskId.value = null
  const task = kanbanStore.tasks.find(t => t.id === taskId)
  if (!task || task.status === targetStatus) return
  try {
    await kanbanStore.bulkUpdateTasks({ ids: [taskId], status: targetStatus })
    await Promise.all([kanbanStore.fetchTasks(true), kanbanStore.fetchStats(), kanbanStore.fetchBoards()])
  } catch (err: any) {
    message.error(err?.message || 'Failed to move task')
  }
}

async function handleCreateBoard() {
  const slug = newBoardSlug.value.trim()
  if (!slug) {
    message.warning(t('kanban.board.slugRequired'))
    return
  }
  boardActionLoading.value = true
  try {
    const board = await kanbanStore.createBoard({
      slug,
      name: newBoardName.value.trim() || undefined,
    })
    newBoardSlug.value = ''
    newBoardName.value = ''
    showCreateBoardForm.value = false
    await replaceRouteBoard(board.slug)
    message.success(t('kanban.board.created'))
  } catch (err: any) {
    message.error(err.message)
  } finally {
    boardActionLoading.value = false
  }
}

async function handleArchiveSelectedBoard() {
  if (kanbanStore.selectedBoard === DEFAULT_KANBAN_BOARD) return
  if (!window.confirm(t('kanban.board.archiveConfirm'))) return
  boardActionLoading.value = true
  try {
    await kanbanStore.archiveSelectedBoard()
    await replaceRouteBoard(DEFAULT_KANBAN_BOARD)
    message.success(t('kanban.board.archived'))
  } catch (err: any) {
    message.error(err.message)
  } finally {
    boardActionLoading.value = false
  }
}

async function handleDispatch() {
  boardActionLoading.value = true
  try {
    await kanbanStore.dispatch()
    await kanbanStore.refreshAll()
    message.success(t('kanban.message.dispatchNudged'))
  } catch (err: any) {
    message.error(err.message)
  } finally {
    boardActionLoading.value = false
  }
}
</script>

<template>
  <div class="kanban-view">
    <header class="page-header">
      <nav class="breadcrumb" aria-label="Breadcrumb">
        <button
          type="button"
          class="crumb-back"
          :title="t('sidebar.backToChat')"
          @click="goBack"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          <span>{{ t('sidebar.backToChat') }}</span>
        </button>
        <span class="crumb-sep" aria-hidden="true">/</span>
        <span class="crumb-current">{{ t('kanban.title') }}</span>
        <span class="crumb-sep" aria-hidden="true">/</span>
        <NSelect
          v-model:value="selectedBoardValue"
          :options="boardOptions"
          :loading="kanbanStore.boardsLoading"
          size="tiny"
          class="crumb-board"
          :consistent-menu-width="false"
        />
      </nav>

      <div class="header-actions">
        <NDropdown
          placement="bottom-end"
          trigger="click"
          :options="menuOptions"
          @select="handleMenuSelect"
        >
          <NButton size="small" quaternary :title="t('common.add')" :aria-label="t('common.add')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" />
            </svg>
          </NButton>
        </NDropdown>
        <NButton type="primary" size="small" @click="showCreateForm = true">
          <template #icon>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </template>
          {{ t('kanban.createTask') }}
        </NButton>
      </div>
    </header>

    <!-- Board -->
    <NSpin :show="kanbanStore.loading && kanbanStore.tasks.length === 0">
      <div class="kanban-board" :class="{ 'is-dragging': draggingTaskId }">
        <KanbanColumn
          v-for="status in visibleBoardStatuses"
          :key="status"
          :status="status"
          :tasks="tasksByStatus[status]"
          @task-click="handleColumnTaskClick"
          @task-drag-start="handleColumnTaskDragStart"
          @task-drag-end="handleColumnTaskDragEnd"
          @task-drop="handleColumnTaskDrop"
          @add-task="handleAddTask"
        />
      </div>
    </NSpin>

    <!-- Task detail drawer -->
    <KanbanTaskDrawer
      :task-id="selectedTaskId"
      @close="handleDrawerClose"
      @updated="handleDrawerUpdated"
      @navigate="handleNavigateTask"
    />

    <!-- Board management -->
    <NModal v-model:show="showCreateBoardForm" preset="dialog" :title="t('kanban.board.create')" style="width: 420px;">
      <div class="board-form">
        <NInput v-model:value="newBoardSlug" :placeholder="t('kanban.board.slugPlaceholder')" />
        <NInput v-model:value="newBoardName" :placeholder="t('kanban.board.namePlaceholder')" />
      </div>
      <template #action>
        <NButton @click="showCreateBoardForm = false">{{ t('common.cancel') }}</NButton>
        <NButton type="primary" :loading="boardActionLoading" @click="handleCreateBoard">{{ t('common.create') }}</NButton>
      </template>
    </NModal>

    <!-- Create form -->
    <KanbanCreateForm
      v-if="showCreateForm"
      @close="showCreateForm = false"
      @created="handleTaskCreated"
    />
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.kanban-view {
  height: calc(100 * var(--vh));
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}

.page-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 20px;
  border-bottom: 1px solid $border-color;
  background: $bg-primary;
}

.breadcrumb {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
}

.crumb-back {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 8px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: $text-secondary;
  font: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  min-width: 0;
  flex-shrink: 1;
  transition: background $transition-fast, color $transition-fast;

  > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  svg {
    flex-shrink: 0;
    opacity: 0.7;
    transition: transform $transition-fast, opacity $transition-fast;
  }

  &:hover {
    background: color-mix(in srgb, var(--accent-primary) 6%, transparent);
    color: $text-primary;

    svg {
      opacity: 1;
      transform: translateX(-2px);
    }
  }

  &:focus-visible {
    outline: 2px solid var(--accent-primary);
    outline-offset: 2px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .crumb-back svg {
    transition: opacity $transition-fast;
  }

  .crumb-back:hover svg {
    transform: none;
  }
}

.crumb-sep {
  font-size: 13px;
  color: $text-muted;
  opacity: 0.5;
  user-select: none;
  font-weight: 400;
}

.crumb-current {
  font-size: 13px;
  font-weight: 500;
  color: $text-primary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  flex-shrink: 1;
}

.crumb-board {
  min-width: 140px;
  max-width: 280px;

  :deep(.n-base-selection) {
    font-size: 12.5px;
    font-weight: 500;
  }
}

.header-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

// Two parallel rows of buckets: all 9 statuses visible at once, no horizontal
// scroll. ceil(9 / 2) = 5 columns → rows of 5 + 4. Each bucket scrolls its
// tasks vertically on its own. Falls back to fewer columns (and a scrolling
// board) on narrower viewports.
.kanban-board {
  flex: 1 1 auto;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  grid-auto-rows: minmax(0, 1fr);
  gap: 12px;
  padding: 14px 20px 20px;
  overflow: hidden;
  scrollbar-width: thin;

  &.is-dragging {
    cursor: grabbing;
    user-select: none;
  }
}

@media (max-width: 1280px) {
  .kanban-board {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-auto-rows: minmax(240px, 1fr);
    overflow-y: auto;
  }
}

@media (max-width: 820px) {
  .kanban-board {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .kanban-board {
    grid-template-columns: minmax(0, 1fr);
  }
}

// ponytail: NSpin wraps the board in three block divs by default; promote all
// of them to flex children so the board fills the remaining viewport height.
// (.n-spin-content is the inner wrapper that actually holds the board.)
:deep(.n-spin),
:deep(.n-spin-container),
:deep(.n-spin-content) {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
}

.board-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

@media (max-width: $breakpoint-mobile) {
  .page-header {
    padding: 10px 12px 10px 52px;
    gap: 10px;
    flex-wrap: wrap;
  }

  .breadcrumb {
    flex-wrap: wrap;
  }

  // ponytail: hide long breadcrumb labels at narrow widths so they don't
  // truncate to one letter the way the sidebar's Back tab did.
  .crumb-back > span,
  .crumb-current,
  .crumb-sep {
    display: none;
  }
}

@media (max-width: 900px) {
  .crumb-back > span {
    display: none;
  }
}
</style>