import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('hermesDesktop', {
  getToken: (): Promise<string> => ipcRenderer.invoke('hermes-desktop:get-token'),
  retryBootstrap: (): Promise<void> => ipcRenderer.invoke('hermes-desktop:retry-bootstrap'),
  notifyCompletion: (payload: { title: string; body?: string; icon?: string; tag?: string }): Promise<boolean> => ipcRenderer.invoke('hermes-desktop:notify-completion', payload),
  getWindowState: (): Promise<{ isMaximized: boolean }> => ipcRenderer.invoke('hermes-desktop:get-window-state'),
  windowControl: (action: 'minimize' | 'toggle-maximize' | 'close'): Promise<{ isMaximized: boolean }> => ipcRenderer.invoke('hermes-desktop:window-control', action),
  platform: process.platform,
  isDesktop: true,
})

const API_KEY_LS = 'hermes_api_key'
const DEFAULT_USERNAME = 'admin'
const DEFAULT_PASSWORD = 'admin'

// Auto-login the bundled UI so users see the app on first launch. The
// server seeds a `admin` / `admin` super-admin on first boot and marks the
// account with `requiresCredentialChange: true`; the UI prompts for a
// new password before unlocking the rest of the app. We keep the auto-login
// here so the very first launch is one click away from the change-password
// prompt instead of a manual login round-trip.
async function autoLogin(token: string): Promise<void> {
  if (localStorage.getItem(API_KEY_LS)) return
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ username: DEFAULT_USERNAME, password: DEFAULT_PASSWORD }),
    })
    if (!res.ok) return
    const body = await res.json().catch(() => null) as { token?: string; jwt?: string } | null
    const jwt = body?.token || body?.jwt
    if (jwt) localStorage.setItem(API_KEY_LS, jwt)
  } catch {
    /* ignore — first-load race or server still starting */
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  try {
    const token = await ipcRenderer.invoke('hermes-desktop:get-token')
    if (token) {
      try { localStorage.setItem('AUTH_TOKEN', token) } catch { /* */ }
      await autoLogin(token)
    }
  } catch {
    /* ignore */
  }
})
