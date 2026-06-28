import { join } from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const originalUiHome = process.env.HERMES_UI_HOME
const originalUiStateDir = process.env.HERMES_UI_STATE_DIR

afterEach(() => {
  vi.doUnmock('../../packages/server/src/services/hermes/hermes-profile')
  vi.doUnmock('../../packages/server/src/services/config-helpers')
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.resetModules()
  if (originalUiHome === undefined) delete process.env.HERMES_UI_HOME
  else process.env.HERMES_UI_HOME = originalUiHome
  if (originalUiStateDir === undefined) delete process.env.HERMES_UI_STATE_DIR
  else process.env.HERMES_UI_STATE_DIR = originalUiStateDir
})

describe('media controller', () => {
  it('uses Hermes UI media directory as the default generated video output path', async () => {
    process.env.HERMES_UI_HOME = '/tmp/hermes-ui-test-home'
    const { defaultMediaOutputPath } = await import('../../packages/server/src/controllers/hermes/media')

    expect(defaultMediaOutputPath('req_123')).toBe(join('/tmp/hermes-ui-test-home', 'media', 'req_123.mp4'))
    expect(defaultMediaOutputPath('bad/request:id')).toBe(join('/tmp/hermes-ui-test-home', 'media', 'bad_request_id.mp4'))
  })
})
