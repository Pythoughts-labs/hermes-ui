// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, number>) => {
      if (key === 'kanban.card.timeAgo.justNow') return 'Just now'
      if (key === 'kanban.card.timeAgo.minutes') return `${params?.count} min ago`
      if (key === 'kanban.card.timeAgo.hours') return `${params?.count} h ago`
      if (key === 'kanban.card.timeAgo.days') return `${params?.count} d ago`
      if (key === 'kanban.card.priority.high') return 'High'
      if (key === 'kanban.card.priority.medium') return 'Medium'
      if (key === 'kanban.card.priority.low') return 'Low'
      if (key === 'kanban.card.assigneeTooltip') return 'Assignee'
      return key
    },
  }),
}))

vi.mock('naive-ui', () => ({
  NPopover: defineComponent({
    name: 'NPopover',
    template: '<div class="n-popover-stub"><slot name="trigger" /><div class="n-popover-content"><slot /></div></div>',
  }),
}))

vi.mock('@/components/hermes/profiles/ProfileAvatar.vue', () => ({
  default: defineComponent({
    name: 'ProfileAvatar',
    props: { name: { type: String, required: true }, avatar: { type: Object, required: false }, size: { type: Number, required: false } },
    template: '<span class="assignee-profile-avatar-stub" :data-name="name" :data-avatar-type="avatar?.type || null" :data-avatar-seed="avatar?.seed || null"></span>',
  }),
}))

import KanbanTaskCard from '@/components/hermes/kanban/KanbanTaskCard.vue'

describe('KanbanTaskCard i18n', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders the compact file row plus localized priority and relative time in the hover preview', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-08T03:00:00Z'))

    const wrapper = mount(KanbanTaskCard, {
      props: {
        assigneeAvatar: { type: 'generated', seed: 'alice-seed' },
        task: {
          id: 'task-1',
          title: 'Ship kanban i18n',
          body: 'Body preview content',
          assignee: 'alice',
          status: 'todo',
          priority: 3,
          created_by: null,
          created_at: Math.floor(new Date('2026-05-08T02:58:00Z').getTime() / 1000),
          started_at: null,
          completed_at: null,
          workspace_kind: 'local',
          workspace_path: null,
          tenant: null,
          result: null,
          skills: null,
        },
      },
    })

    // Compact row carries the title, short id, and status class.
    expect(wrapper.find('.task-file').classes()).toContain('status-todo')
    expect(wrapper.find('.file-title').text()).toBe('Ship kanban i18n')
    expect(wrapper.find('.file-id').text()).toBe('task-1')
    // Fuller detail (priority + relative time) lives in the hover preview.
    expect(wrapper.text()).toContain('High')
    expect(wrapper.text()).toContain('2 min ago')
    // Assignee avatar is rendered with the resolved profile avatar data.
    const avatar = wrapper.find('.assignee-profile-avatar-stub')
    expect(avatar.attributes('data-name')).toBe('alice')
    expect(avatar.attributes('data-avatar-type')).toBe('generated')
    expect(avatar.attributes('data-avatar-seed')).toBe('alice-seed')
  })
})
