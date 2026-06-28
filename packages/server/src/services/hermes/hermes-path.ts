/**
 * Hermes path detection helpers — cross-platform.
 *
 * Where the Hermes data directory lives on each platform:
 * - Native Windows install: %LOCALAPPDATA%\hermes when it exists
 * - Linux/macOS/WSL2: ~/.hermes
 * - User override: HERMES_HOME environment variable
 */

import { existsSync } from 'fs'
import { basename, dirname, isAbsolute, relative, resolve, join } from 'path'
import { homedir } from 'os'

/**
 * Detect the Hermes data directory.
 *
 * Detection priority:
 * 1. HERMES_HOME environment variable (user override)
 * 2. Windows: existing %LOCALAPPDATA%\hermes or %APPDATA%\hermes
 * 3. Default: ~/.hermes (Linux/macOS/WSL2)
 *
 * @returns absolute path to the Hermes data directory
 */
export function detectHermesHome(): string {
  // 1. User override via env var (highest priority)
  if (process.env.HERMES_HOME) {
    return resolve(process.env.HERMES_HOME)
  }

  const defaultHome = resolve(homedir(), '.hermes')

  // 2. Windows: prefer an existing native install; fall back to ~/.hermes.
  if (process.platform === 'win32') {
    const candidates = [
      process.env.LOCALAPPDATA,
      process.env.APPDATA,
    ]
      .map(value => value?.trim())
      .filter((value): value is string => !!value)
      .map(value => resolve(value, 'hermes'))

    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate
    }
  }

  // 3. Linux/macOS: ~/.hermes
  return defaultHome
}

/**
 * Detect the Hermes root data directory.
 *
 * `HERMES_HOME` may intentionally point at a profile directory when launching a
 * specific gateway (`<root>/profiles/<name>`). UI profile management needs
 * the root directory so it can read `active_profile` and enumerate profiles.
 */
export function detectHermesRootHome(): string {
  const home = detectHermesHome()
  const parent = dirname(home)
  if (basename(parent) === 'profiles') return dirname(parent)
  return home
}

/**
 * Resolve the Hermes CLI binary path.
 * @param customBin user-provided hermes binary path override
 * @returns the hermes command name or path to invoke
 */
export function getHermesBin(customBin?: string): string {
  if (customBin?.trim()) return customBin.trim()
  if (process.env.HERMES_BIN?.trim()) return process.env.HERMES_BIN.trim()
  return 'hermes'
}

function comparablePath(path: string): string {
  return process.platform === 'win32' ? path.toLowerCase() : path
}

export function isPathWithin(targetPath: string, basePath: string): boolean {
  const base = resolve(basePath)
  const target = resolve(targetPath)
  const rel = relative(comparablePath(base), comparablePath(target))
  return rel === '' || (!!rel && !rel.startsWith('..') && !isAbsolute(rel))
}

export function relativePathFromBase(targetPath: string, basePath: string): string | null {
  if (!isPathWithin(targetPath, basePath)) return null
  const rel = relative(resolve(basePath), resolve(targetPath))
  return rel.replace(/\\/g, '/')
}
