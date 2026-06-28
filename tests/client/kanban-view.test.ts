// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'

const routeState = vi.hoisted(() => ({
  query: { board: 'project-a' } as Record<string, string>,
}))

const routerReplace = vi.hoisted(() => vi.fn())

const storeState = vi.hoisted(() => ({
  tasks: [] as Array<{ id: string; title: string; status: string; created_at: number; assignee?: string | null }>,
  stats: { by_status: { todo: 1, done: 0 }, by_assignee: {}, total: 1 } as Record<string, any>,
  assignees: [] as Array<{ name: string; counts: Record<string, number> | null }>,
  activeBoards: [] as Array<{ slug: string; name: string; icon?: string; total?: number }>,
  loading: false,
  boardsLoading: false,
  selectedBoard: 'default',
  boardWarning: null as string | null,
  capabilities: null as Record<string, any> | null,
  filterStatus: null as string | null,
  filterAssignee: null as string | null,
}))

const mockFetchBoards = vi.hoisted(() => vi.fn())
const mockFetchCapabilities = vi.hoisted(() => vi.fn())
const mockRefreshAll = vi.hoisted(() => vi.fn())
const mockFetchTasks = vi.hoisted(() => vi.fn())
const mockFetchStats = vi.hoisted(() => vi.fn())
const mockSetFilter = vi.hoisted(() => vi.fn())
const mockRecoverSelectedBoard = vi.hoisted(() => vi.fn())
const mockCreateBoard = vi.hoisted(() => vi.fn())
const mockArchiveSelectedBoard = vi.hoisted(() => vi.fn())
const mockDispatch = vi.hoisted(() => vi.fn())
const mockStartEventStream = vi.hoisted(() => vi.fn())
const mockStopEventStream = vi.hoisted(() => vi.fn())
const mockFetchProfiles = vi.hoisted(() => vi.fn())
const mockBulkUpdateTasks = vi.hoisted(() => vi.fn())
const profilesState = vi.hoisted(() => ({
  profiles: [] as Array<{ name: string; avatar?: Record<string, any> | null }>,
}))

vi.mock('vue-router', () => ({
  useRoute: () => routeState,
  useRouter: () => ({ replace: routerReplace }),
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/stores/hermes/kanban', () => ({
  DEFAULT_KANBAN_BOARD: 'default',
  useKanbanStore: () => ({
    ...storeState,
    fetchBoards: mockFetchBoards,
    fetchCapabilities: mockFetchCapabilities,
    refreshAll: mockRefreshAll,
    fetchTasks: mockFetchTasks,
    fetchStats: mockFetchStats,
    setFilter: mockSetFilter,
    recoverSelectedBoard: mockRecoverSelectedBoard,
    createBoard: mockCreateBoard,
    archiveSelectedBoard: mockArchiveSelectedBoard,
    dispatch: mockDispatch,
    startEventStream: mockStartEventStream,
    stopEventStream: mockStopEventStream,
    bulkUpdateTasks: mockBulkUpdateTasks,
  }),
}))

vi.mock('@/stores/hermes/profiles', () => ({
  useProfilesStore: () => ({
    profiles: profilesState.profiles,
    fetchProfiles: mockFetchProfiles,
  }),
}))

vi.mock('@/components/hermes/kanban/KanbanTaskCard.vue', () => ({
  default: defineComponent({
    name: 'KanbanTaskCard',
    props: { task: { type: Object, required: true }, assigneeAvatar: { type: Object, required: false } },
    emits: ['click', 'dragstart', 'dragend'],
    template: '<div class="kanban-task-card-stub" :data-avatar-seed="assigneeAvatar?.seed || null" :data-task-id="task.id" @click="$emit(\'click\', task.id)">{{ task.title }}</div>',
  }),
}))

vi.mock('@/components/hermes/kanban/KanbanColumn.vue', () => ({
  default: defineComponent({
    name: 'KanbanColumn',
    props: { status: { type: String, required: true }, tasks: { type: Array, required: true } },
    emits: ['task-click', 'task-drop', 'add-task'],
    methods: {
      handleDrop(event: DragEvent) {
        event.preventDefault()
        const taskId = event.dataTransfer?.getData('text/plain')
        if (taskId) this.$emit('task-drop', taskId, this.status)
      },
    },
    template: '<section class="kanban-column-stub" :data-status="status" :data-count="tasks.length" @drop="handleDrop"><slot /><button class="column-add-stub" @click="$emit(\'add-task\', status)">+</button><div class="column-task-stub" v-for="task in tasks" :key="task.id" :data-task-id="task.id">{{ task.title }}</div></section>',
  }),
}))

vi.mock('@/components/hermes/kanban/KanbanTaskDrawer.vue', () => ({
  default: defineComponent({
    name: 'KanbanTaskDrawer',
    emits: ['updated', 'close'],
    template: '<button class="drawer-updated" @click="$emit(\'updated\')">drawer</button>',
  }),
}))

vi.mock('@/components/hermes/kanban/KanbanCreateForm.vue', () => ({
  default: defineComponent({
    name: 'KanbanCreateForm',
    emits: ['created', 'close'],
    template: '<button class="form-created" @click="$emit(\'created\')">form</button>',
  }),
}))

vi.mock('naive-ui', () => ({
  useMessage: () => ({ warning: vi.fn(), error: vi.fn(), success: vi.fn() }),
  NButton: defineComponent({
    name: 'NButton',
    emits: ['click'],
    template: '<button class="n-button-stub" @click="$emit(\'click\')"><slot /><slot name="icon" /></button>',
  }),
  NSelect: defineComponent({
    name: 'NSelect',
    props: { value: null, options: { type: Array, default: () => [] }, loading: Boolean },
    emits: ['update:value'],
    template: '<button class="n-select-stub" @click="$emit(\'update:value\', options[1]?.value || value)"><span v-for="option in options" :key="option.value">{{ option.label }}</span>{{ value }}</button>',
  }),
  NInput: defineComponent({
    name: 'NInput',
    props: { value: { type: String, default: '' }, placeholder: { type: String, required: false } },
    emits: ['update:value'],
    template: '<input class="n-input-stub" :placeholder="placeholder" :value="value" @input="$emit(\'update:value\', $event.target.value)" />',
  }),
  NModal: defineComponent({
    name: 'NModal',
    props: { show: Boolean },
    emits: ['update:show', 'close'],
    template: '<div v-if="show" class="n-modal-stub"><slot /><slot name="action" /></div>',
  }),
  NSpin: defineComponent({
    name: 'NSpin',
    template: '<div class="n-spin-stub"><slot /></div>',
  }),
  NDropdown: defineComponent({
    name: 'NDropdown',
    props: { options: { type: Array, default: () => [] }, trigger: { type: String, default: 'click' } },
    emits: ['select', 'clickoutside'],
    template: `<div class="n-dropdown-stub" @click.stop>
      <slot />
      <div class="n-dropdown-menu-stub">
        <template v-for="option in options" :key="option.key">
          <button v-if="option.type === 'group'" class="n-dropdown-group-stub">
            <span class="n-dropdown-group-label">{{ option.label }}</span>
            <button
              v-for="child in option.children"
              :key="child.key"
              class="n-dropdown-option-stub"
              :data-key="child.key"
              @click.stop="$emit('select', child.key)"
            >{{ child.label }}</button>
          </button>
          <button
            v-else
            class="n-dropdown-option-stub"
            :data-key="option.key"
            @click.stop="$emit('select', option.key)"
          >{{ option.label }}</button>
        </template>
      </div>
    </div>`,
  }),
}))

import KanbanView from '@/views/hermes/KanbanView.vue'

describe('KanbanView', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    routeState.query = { board: 'project-a' }
    routerReplace.mockResolvedValue(undefined)
    storeState.tasks = [
      { id: 'task-1', title: 'Task one', status: 'todo', created_at: 10 },
      { id: 'task-2', title: 'Task two', status: 'done', created_at: 20 },
    ]
    storeState.stats = {
      by_status: { triage: 0, todo: 1, ready: 0, running: 0, blocked: 0, done: 1, archived: 0 },
      by_assignee: {},
      total: 2,
    }
    storeState.assignees = []
    storeState.activeBoards = [
      { slug: 'default', name: 'Default', total: 0 },
      { slug: 'project-a', name: 'Project A', total: 2 },
    ]
    storeState.loading = false
    storeState.boardsLoading = false
    storeState.selectedBoard = 'default'
    storeState.boardWarning = null
    storeState.capabilities = null
    storeState.filterStatus = null
    storeState.filterAssignee = null
    profilesState.profiles = []
    mockFetchBoards.mockResolvedValue(undefined)
    mockFetchCapabilities.mockResolvedValue(undefined)
    mockRefreshAll.mockResolvedValue(undefined)
    mockFetchTasks.mockResolvedValue(undefined)
    mockFetchStats.mockResolvedValue(undefined)
    mockFetchProfiles.mockResolvedValue(undefined)
    mockCreateBoard.mockResolvedValue({ slug: 'new-board' })
    mockArchiveSelectedBoard.mockResolvedValue(undefined)
    mockBulkUpdateTasks.mockResolvedValue({ results: [{ id: 'task-1', ok: true }] })
    mockRecoverSelectedBoard.mockImplementation((candidate: string) => {
      storeState.selectedBoard = candidate || 'default'
      return { board: storeState.selectedBoard, recovered: false }
    })
    mockSetFilter.mockImplementation((key: 'status' | 'assignee', value: string | null) => {
      if (key === 'status') storeState.filterStatus = value
      else storeState.filterAssignee = value
    })
    mockDispatch.mockResolvedValue({ spawned: 1 })
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
  })

  it('initializes board from route query and refreshes stats alongside tasks', async () => {
    const wrapper = mount(KanbanView)
    await flushPromises()

    expect(mockFetchBoards).toHaveBeenCalledOnce()
    expect(mockFetchCapabilities).toHaveBeenCalledOnce()
    expect(mockFetchProfiles).toHaveBeenCalledOnce()
    expect(mockRecoverSelectedBoard).toHaveBeenCalledWith('project-a')
    expect(mockRefreshAll).toHaveBeenCalledOnce()
    expect(routerReplace).not.toHaveBeenCalled()

    const columns = wrapper.findAll('.kanban-column-stub')
    expect(columns).toHaveLength(9)
    expect(columns.map(c => c.attributes('data-status'))).toEqual([
      'triage', 'todo', 'scheduled', 'ready', 'running', 'blocked', 'review', 'done', 'archived',
    ])

    await wrapper.find('.drawer-updated').trigger('click')
    expect(mockFetchTasks).toHaveBeenCalledTimes(1)
    expect(mockFetchStats).toHaveBeenCalledTimes(1)

    await vi.advanceTimersByTimeAsync(15000)
    await flushPromises()

    expect(mockFetchBoards).toHaveBeenCalledTimes(2)
    expect(mockFetchTasks).toHaveBeenCalledTimes(2)
    expect(mockFetchStats).toHaveBeenCalledTimes(2)
  })

  it('renders board count labels and compact assignee profile labels', async () => {
    storeState.assignees = [{ name: 'alice', counts: { todo: 2, done: 1 } }]
    const wrapper = mount(KanbanView)
    await flushPromises()

    expect(wrapper.text()).toContain('Default · 0')
    expect(wrapper.text()).toContain('Project A · 2')
    const assigneeOptions = wrapper.findAll('.n-dropdown-option-stub').filter(o => o.text().includes('alice'))
    expect(assigneeOptions.length).toBeGreaterThan(0)
    expect(wrapper.text()).not.toContain('kanban.detail.assignee: alice')
  })

  it('filters the visible board columns from overflow menu', async () => {
    storeState.filterStatus = 'done'

    const wrapper = mount(KanbanView)
    await flushPromises()

    const columns = wrapper.findAll('.kanban-column-stub')
    expect(columns).toHaveLength(1)
    expect(columns[0].attributes('data-status')).toBe('done')
    expect(columns[0].attributes('data-count')).toBe('1')
    expect(wrapper.text()).toContain('Task two')
    expect(wrapper.text()).not.toContain('Task one')

    await wrapper.find('[data-key="status:todo"]').trigger('click')
    await flushPromises()

    expect(mockSetFilter).toHaveBeenCalledWith('status', 'todo')
    expect(mockFetchTasks).toHaveBeenCalledTimes(1)

    await wrapper.find('[data-key="status:"]').trigger('click')
    await flushPromises()

    expect(mockSetFilter).toHaveBeenCalledWith('status', null)
    expect(mockFetchTasks).toHaveBeenCalledTimes(2)
  })

  it('creates and archives boards from the overflow menu', async () => {
    storeState.selectedBoard = 'project-a'
    const wrapper = mount(KanbanView)
    await flushPromises()

    // Open Add Board from the overflow menu.
    await wrapper.find('[data-key="add-board"]').trigger('click')
    await flushPromises()
    const inputs = wrapper.findAll('.n-input-stub')
    await inputs[0].setValue('new-board')
    await inputs[1].setValue('New Board')
    // Modal action: last n-button-stub is the primary Create button.
    await wrapper.findAll('.n-button-stub').at(-1)!.trigger('click')
    await flushPromises()

    expect(mockCreateBoard).toHaveBeenCalledWith({ slug: 'new-board', name: 'New Board' })
    expect(routerReplace).toHaveBeenCalledWith({ query: { board: 'new-board' } })

    // Open Archive Board from the overflow menu.
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true)
    storeState.selectedBoard = 'project-a'
    await wrapper.find('[data-key="archive-board"]').trigger('click')
    await flushPromises()

    expect(mockArchiveSelectedBoard).toHaveBeenCalled()
    expect(routerReplace).toHaveBeenCalledWith({ query: { board: 'default' } })
  })

  it('makes default board explicit when route query is absent', async () => {
    routeState.query = {}
    mockRecoverSelectedBoard.mockImplementation(() => {
      storeState.selectedBoard = 'default'
      return { board: 'default', recovered: false }
    })

    mount(KanbanView)
    await flushPromises()

    expect(routerReplace).toHaveBeenCalledWith({ query: { board: 'default' } })
    expect(mockRefreshAll).toHaveBeenCalledOnce()
  })

  it('moves a task to a new status when dropped onto another column', async () => {
    storeState.tasks = [
      { id: 'task-1', title: 'Task one', status: 'todo', created_at: 10 },
      { id: 'task-2', title: 'Task two', status: 'done', created_at: 20 },
    ]

    const wrapper = mount(KanbanView)
    await flushPromises()

    // Reassign in the mocked store to reflect optimistic move after drop.
    mockBulkUpdateTasks.mockImplementationOnce(async ({ ids, status }) => {
      const task = storeState.tasks.find(t => t.id === ids[0])
      if (task) task.status = status as string
      return { results: ids.map(id => ({ id, ok: true })) }
    })

    const todoColumn = wrapper.findAll('.kanban-column-stub').find(c => c.attributes('data-status') === 'todo')!
    expect(todoColumn.attributes('data-count')).toBe('1')

    // ponytail: dispatch a native drag-drop sequence on the Running column
    const runningColumn = wrapper.findAll('.kanban-column-stub').find(c => c.attributes('data-status') === 'running')!
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { getData: () => 'task-1', dropEffect: 'move' },
    })
    runningColumn.element.dispatchEvent(dropEvent)
    await flushPromises()

    expect(mockBulkUpdateTasks).toHaveBeenCalledWith({ ids: ['task-1'], status: 'running' })
  })

  it('no-ops the drop when the task is already in the target column', async () => {
    storeState.tasks = [
      { id: 'task-1', title: 'Task one', status: 'todo', created_at: 10 },
    ]

    const wrapper = mount(KanbanView)
    await flushPromises()

    const todoColumn = wrapper.findAll('.kanban-column-stub').find(c => c.attributes('data-status') === 'todo')!
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(dropEvent, 'dataTransfer', {
      value: { getData: () => 'task-1', dropEffect: 'move' },
    })
    todoColumn.element.dispatchEvent(dropEvent)
    await flushPromises()

    expect(mockBulkUpdateTasks).not.toHaveBeenCalled()
  })
})