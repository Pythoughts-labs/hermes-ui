// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const mockApi = vi.hoisted(() => ({
  startCopilotLogin: vi.fn(),
  pollCopilotLogin: vi.fn(),
}))

const mockMessage = vi.hoisted(() => ({
  success: vi.fn(),
  warning: vi.fn(),
  error: vi.fn(),
}))

vi.mock('@/api/hermes/copilot-auth', () => mockApi)
vi.mock('@/utils/clipboard', () => ({ copyToClipboard: vi.fn(async () => true) }))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (k: string) => k }),
}))
vi.mock('naive-ui', () => ({
  NModal: { template: '<div><slot /><slot name="footer" /></div>' },
  NButton: { template: '<button @click="$emit(\'click\')"><slot /></button>' },
  NSpin: { template: '<span class="spin" />' },
  useMessage: () => mockMessage,
}))

import CopilotLoginModal from '@/components/hermes/models/CopilotLoginModal.vue'

function mountModal() {
  return mount(CopilotLoginModal)
}

describe('CopilotLoginModal device-flow state machine', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockApi.startCopilotLogin.mockReset()
    mockApi.pollCopilotLogin.mockReset()
    mockMessage.success.mockReset()
    mockMessage.warning.mockReset()
    mockMessage.error.mockReset()
  })

  it('enters waiting state on startup and shows user_code', async () => {
    mockApi.startCopilotLogin.mockResolvedValue({
      session_id: 'sess-1',
      user_code: 'ABCD-1234',
      verification_url: 'https://github.com/login/device',
      expires_in: 900,
      interval: 5,
    })
    mockApi.pollCopilotLogin.mockResolvedValue({ status: 'pending', error: null })

    const wrapper = mountModal()
    await flushPromises()

    expect(wrapper.text()).toContain('ABCD-1234')
    expect(mockApi.startCopilotLogin).toHaveBeenCalledTimes(1)
  })

  it('emits success and message copilotApproved when approved', async () => {
    mockApi.startCopilotLogin.mockResolvedValue({
      session_id: 'sess-2',
      user_code: 'WXYZ-9999',
      verification_url: 'https://github.com/login/device',
      expires_in: 900,
      interval: 5,
    })
    mockApi.pollCopilotLogin.mockResolvedValue({ status: 'approved', error: null })

    const wrapper = mountModal()
    await flushPromises()

    // advance the poll timer once
    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()

    expect(mockMessage.success).toHaveBeenCalledWith('models.copilotApproved')

    // auto-close 1s after approval
    await vi.advanceTimersByTimeAsync(1500)
    await flushPromises()
    expect(wrapper.emitted('success')).toBeTruthy()
  })

  it('enters expired state and shows retry button when expired', async () => {
    mockApi.startCopilotLogin.mockResolvedValue({
      session_id: 'sess-3',
      user_code: 'EXPI-RED!',
      verification_url: 'https://github.com/login/device',
      expires_in: 900,
      interval: 5,
    })
    mockApi.pollCopilotLogin.mockResolvedValue({ status: 'expired', error: null })

    const wrapper = mountModal()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()

    expect(wrapper.text()).toContain('models.copilotExpired')
    expect(wrapper.emitted('success')).toBeFalsy()
  })

  it('displays error and does not emit success when startCopilotLogin throws', async () => {
    mockApi.startCopilotLogin.mockRejectedValue(new Error('boom'))

    const wrapper = mountModal()
    await flushPromises()

    expect(mockMessage.error).toHaveBeenCalled()
    expect(wrapper.emitted('success')).toBeFalsy()
  })

  it('enters error state when denied', async () => {
    mockApi.startCopilotLogin.mockResolvedValue({
      session_id: 'sess-4',
      user_code: 'NOPE',
      verification_url: 'https://github.com/login/device',
      expires_in: 900,
      interval: 5,
    })
    mockApi.pollCopilotLogin.mockResolvedValue({ status: 'denied', error: null })

    const wrapper = mountModal()
    await flushPromises()
    await vi.advanceTimersByTimeAsync(3000)
    await flushPromises()

    expect(wrapper.text()).toContain('models.copilotDenied')
    expect(wrapper.emitted('success')).toBeFalsy()
  })
})
