import { describe, expect, it } from 'vitest'
import { homedir } from 'os'
import { join, resolve } from 'path'
import { getCorsOrigins, getListenHost, getUiHome, shouldCreateUiDataDir } from '../../packages/server/src/config'

describe('server config', () => {
  it('defaults to an IPv4 bind host', () => {
    expect(getListenHost({})).toBe('0.0.0.0')
  })

  it('uses BIND_HOST when provided', () => {
    expect(getListenHost({ BIND_HOST: ' :: ' })).toBe('::')
  })

  it('ignores blank BIND_HOST values', () => {
    expect(getListenHost({ BIND_HOST: ' ' })).toBe('0.0.0.0')
  })

  it('defaults ui home to ~/.hermes-ui', () => {
    expect(getUiHome({})).toBe(join(homedir(), '.hermes-ui'))
  })

  it('uses HERMES_UI_HOME when provided', () => {
    expect(getUiHome({ HERMES_UI_HOME: ' ./tmp/hermes-ui ' })).toBe(resolve('./tmp/hermes-ui'))
  })

  it('uses HERMES_UI_STATE_DIR as a compatibility alias', () => {
    expect(getUiHome({ HERMES_UI_STATE_DIR: ' ./tmp/hermes-state ' })).toBe(resolve('./tmp/hermes-state'))
  })

  it('only creates the development data directory outside production', () => {
    expect(shouldCreateUiDataDir({ NODE_ENV: 'development' })).toBe(true)
    expect(shouldCreateUiDataDir({ NODE_ENV: 'production' })).toBe(false)
  })

  it('does not enable cross-origin requests by default', () => {
    expect(getCorsOrigins({})).toBe('')
  })

  it('uses CORS_ORIGINS when provided', () => {
    expect(getCorsOrigins({ CORS_ORIGINS: ' https://app.example, http://localhost:3000 ' })).toBe('https://app.example, http://localhost:3000')
  })
})
