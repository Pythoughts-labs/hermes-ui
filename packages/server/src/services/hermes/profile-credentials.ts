/**
 * Smart profile clone credential cleanup.
 *
 * Background: `hermes profile create --clone` fully copies the source profile's
 * .env + config.yaml, including the exclusive credentials for each platform
 * (Weixin / Telegram / Slack / ...). This causes multiple profiles to hold the
 * same bot token at once, and hermes-agent's internal token-mutex mechanism
 * kills whichever gateway started later during the health-check phase — which
 * surfaces as "profile load error".
 *
 * Solution: after cloning, automatically run on the new profile:
 *   1. Strip any KEY matching an exclusive-platform prefix from .env.
 *   2. Set `enabled: true` to false on every exclusive platform in config.yaml.
 * Original files are backed up as `.bak.<timestamp>` before any modification.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import yaml from 'js-yaml'
import { detectHermesHome } from './hermes-path'

function hermesBase(): string {
  return detectHermesHome()
}

function profileDir(profileName: string): string {
  const base = hermesBase()
  return profileName === 'default'
    ? base
    : join(base, 'profiles', profileName)
}

function activeProfileName(): string {
  try {
    return readFileSync(join(hermesBase(), 'active_profile'), 'utf-8').trim() || 'default'
  } catch {
    return 'default'
  }
}

/**
 * Regex prefix patterns for known "exclusive" platform env-var keys.
 *
 * These platforms have "one-to-one identity binding" credentials: a single token
 * or app_id maps to exactly one bot or account. Multiple profiles sharing the
 * same credential triggers hermes-agent's token-mutex mechanism → startup
 * failure.
 *
 * Anything not on this list (model provider API keys, tool debug flags, ...)
 * is considered safe to share.
 *
 * **Source of truth (do not extend by intuition)**: 1:1 alignment with the
 * adapters in `gateway/platforms/` that actually call
 * `_acquire_platform_lock` / `acquire_scoped_lock` in hermes-agent.
 * Verification: `grep -l _acquire_platform_lock gateway/platforms/*.py`.
 * Currently matches the upstream's 7 platforms: discord, feishu, signal, slack,
 * telegram, weixin, whatsapp.
 */
export const EXCLUSIVE_PLATFORM_ENV_PATTERNS: RegExp[] = [
  /^TELEGRAM_/,  // Telegram bot
  /^DISCORD_/,   // Discord bot
  /^SLACK_/,     // Slack app
  /^WHATSAPP_/,  // WhatsApp Business
  /^SIGNAL_/,    // Signal
  /^WEIXIN_/,    // Personal WeChat bot
  /^FEISHU_/,    // Feishu (Lark)
]

/**
 * Platform node names in config.yaml that correspond to exclusive platforms.
 * Mirrors EXCLUSIVE_PLATFORM_ENV_PATTERNS; used to flip `enabled` to false.
 */
export const EXCLUSIVE_PLATFORMS = [
  'telegram', 'discord', 'slack', 'whatsapp', 'signal', 'weixin', 'feishu',
]

/**
 * Blacklist of "sensitive credential fields" inside exclusive-platform config nodes.
 *
 * Only applies under EXCLUSIVE_PLATFORMS nodes (including their `extra` child),
 * so we never accidentally strip model-provider keys or other unrelated config.
 * These fields are stripped during clone so re-enabling the platform later does
 * not silently reuse the source profile's identity.
 */
export const EXCLUSIVE_PLATFORM_CREDENTIAL_KEYS = [
  'token', 'bot_token', 'app_token',
  'signing_secret', 'app_secret', 'client_secret',
  'access_token', 'webhook_secret',
  'account_id', 'phone_number_id', 'app_id',
  'encrypt_key', 'verification_token',
]

/** Whether a KEY in .env belongs to an exclusive platform credential */
export function isExclusivePlatformKey(key: string): boolean {
  return EXCLUSIVE_PLATFORM_ENV_PATTERNS.some(re => re.test(key))
}

/**
 * Strip exclusive platform credentials from a .env file.
 * @param envPath absolute path to the .env file
 * @returns list of removed KEY names (in original .env order); empty when the
 *   file does not exist or no keys need stripping
 *
 * Side effect: backs up the original as `.env.bak.<timestamp>` before writing,
 * so the user can recover.
 */
export function stripExclusivePlatformCredentials(envPath: string): string[] {
  if (!existsSync(envPath)) return []
  const original = readFileSync(envPath, 'utf-8')
  const lines = original.split('\n')
  const removedKeys: string[] = []
  const kept: string[] = []
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=/)
    if (m && isExclusivePlatformKey(m[1])) {
      removedKeys.push(m[1])
    } else {
      kept.push(line)
    }
  }
  if (removedKeys.length === 0) return []
  writeFileSync(`${envPath}.bak.${Date.now()}`, original, 'utf-8')
  writeFileSync(envPath, kept.join('\n'), 'utf-8')
  return removedKeys
}

/**
 * Disable the `enabled` field of known exclusive platforms in config.yaml and
 * strip sensitive credential fields under those nodes.
 * @param configPath absolute path to config.yaml
 * @returns
 *   - disabled: list of platform names that were disabled
 *   - strippedConfigCredentials: list of stripped credential field paths
 *     (e.g. 'weixin.extra.token')
 *   Both arrays are empty when nothing was changed.
 *
 * Side effect: backs up the original as `config.yaml.bak.<timestamp>`.
 */
export function disableExclusivePlatformsInConfig(configPath: string): {
  disabled: string[]
  strippedConfigCredentials: string[]
} {
  if (!existsSync(configPath)) return { disabled: [], strippedConfigCredentials: [] }
  const original = readFileSync(configPath, 'utf-8')
  let cfg: any
  try {
    cfg = yaml.load(original, { json: true })
  } catch {
    return { disabled: [], strippedConfigCredentials: [] }
  }
  if (!cfg || typeof cfg !== 'object') return { disabled: [], strippedConfigCredentials: [] }
  const platforms = cfg.platforms
  if (!platforms || typeof platforms !== 'object') return { disabled: [], strippedConfigCredentials: [] }

  const disabled: string[] = []
  const strippedConfigCredentials: string[] = []

  for (const platName of EXCLUSIVE_PLATFORMS) {
    const node = platforms[platName]
    if (!node || typeof node !== 'object') continue

    if (node.enabled === true) {
      node.enabled = false
      disabled.push(platName)
    }

    // Strip credential fields directly on the node
    for (const k of EXCLUSIVE_PLATFORM_CREDENTIAL_KEYS) {
      if (k in node) {
        delete node[k]
        strippedConfigCredentials.push(`${platName}.${k}`)
      }
    }
    // Strip credential fields under the `extra` child node
    if (node.extra && typeof node.extra === 'object') {
      for (const k of EXCLUSIVE_PLATFORM_CREDENTIAL_KEYS) {
        if (k in node.extra) {
          delete node.extra[k]
          strippedConfigCredentials.push(`${platName}.extra.${k}`)
        }
      }
    }
  }

  if (disabled.length === 0 && strippedConfigCredentials.length === 0) {
    return { disabled: [], strippedConfigCredentials: [] }
  }
  writeFileSync(`${configPath}.bak.${Date.now()}`, original, 'utf-8')
  writeFileSync(configPath, yaml.dump(cfg, { lineWidth: -1 }), 'utf-8')
  return { disabled, strippedConfigCredentials }
}

export interface SmartCloneCleanup {
  /** KEY names removed from .env */
  strippedCredentials: string[]
  /** Platform names disabled in config.yaml */
  disabledPlatforms: string[]
  /** Paths of inline credential fields stripped from config.yaml (e.g. 'weixin.extra.token') */
  strippedConfigCredentials: string[]
}

function configuredModelProvider(configPath: string): string {
  if (!existsSync(configPath)) return ''
  let cfg: any
  try {
    cfg = yaml.load(readFileSync(configPath, 'utf-8'), { json: true })
  } catch {
    return ''
  }
  const provider = cfg?.model && typeof cfg.model === 'object'
    ? String(cfg.model.provider || '').trim()
    : ''
  if (!provider || provider === 'custom') return ''
  return provider
}

function readAuthJson(path: string): any {
  if (!existsSync(path)) return {}
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function authProviderKeysForModelProvider(provider: string): string[] {
  return provider === 'claude-oauth' ? ['claude-oauth', 'anthropic'] : [provider]
}

const MODEL_AUTH_PROVIDERS = new Set([
  'openai-codex',
  'claude-oauth',
  'xai-oauth',
  'google-gemini-cli',
  'nous',
])

/**
 * Copy the source profile's OAuth auth for the cloned profile's configured model
 * provider only.
 *
 * Hermes CLI `profile create --clone` copies config/.env/SOUL/skills, but not
 * `auth.json`. OAuth-only model providers such as `openai-codex` then look
 * configured in the cloned profile while `/available-models?profile=<clone>`
 * returns no groups because the profile-local auth file is missing. Copying only
 * the provider keys required by the cloned `model.provider` preserves model
 * access without copying unrelated provider or platform credentials across
 * profiles. Claude OAuth also copies its `anthropic` runtime alias because chat
 * execution rewrites `claude-oauth` to `anthropic`.
 */
export function copyModelProviderAuthForClone(profileName: string): string[] {
  if (!profileName || profileName === 'default') return []
  const targetDir = profileDir(profileName)
  const provider = configuredModelProvider(join(targetDir, 'config.yaml'))
  if (!MODEL_AUTH_PROVIDERS.has(provider)) return []

  const sourceDir = profileDir(activeProfileName())
  const sourceAuth = readAuthJson(join(sourceDir, 'auth.json'))
  const targetAuthPath = join(targetDir, 'auth.json')
  const targetAuth = readAuthJson(targetAuthPath)
  const copied = new Set<string>()

  for (const authProvider of authProviderKeysForModelProvider(provider)) {
    if (sourceAuth.providers?.[authProvider] && !targetAuth.providers?.[authProvider]) {
      targetAuth.providers = { ...(targetAuth.providers || {}), [authProvider]: sourceAuth.providers[authProvider] }
      copied.add(authProvider)
    }
    if (sourceAuth.credential_pool?.[authProvider] && !targetAuth.credential_pool?.[authProvider]) {
      targetAuth.credential_pool = { ...(targetAuth.credential_pool || {}), [authProvider]: sourceAuth.credential_pool[authProvider] }
      copied.add(authProvider)
    }
  }
  if (copied.size === 0) return []

  mkdirSync(targetDir, { recursive: true })
  if (existsSync(targetAuthPath)) {
    writeFileSync(`${targetAuthPath}.bak.${Date.now()}`, JSON.stringify(readAuthJson(targetAuthPath), null, 2) + '\n', 'utf-8')
  }
  writeFileSync(targetAuthPath, JSON.stringify(targetAuth, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 })
  return [...copied]
}

/**
 * One-shot: strip exclusive credentials from the new profile + disable
 * exclusive platforms in config.yaml.
 *
 * @param profileName profile name ('default' → ~/.hermes/, otherwise
 *   ~/.hermes/profiles/<name>/)
 */
export function smartCloneCleanup(profileName: string): SmartCloneCleanup {
  const targetDir = profileDir(profileName)
  const configResult = disableExclusivePlatformsInConfig(join(targetDir, 'config.yaml'))
  return {
    strippedCredentials: stripExclusivePlatformCredentials(join(targetDir, '.env')),
    disabledPlatforms: configResult.disabled,
    strippedConfigCredentials: configResult.strippedConfigCredentials,
  }
}
