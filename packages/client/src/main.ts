import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import { i18n } from './i18n'
import App from './App.vue'
import './styles/global.scss'
import 'katex/dist/katex.min.css'

// Apply theme classes before mount to prevent FOUC (Flash of Unstyled Content)
const savedBrightness = localStorage.getItem('hermes_brightness') || 'system'
const savedStyle = localStorage.getItem('hermes_style') || 'ink'

// Resolve dark mode
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
const isDark = savedBrightness === 'dark' || (savedBrightness === 'system' && prefersDark)

// Resolve style
const isComic = savedStyle === 'comic'
const isDesktopShell =
  (window as typeof window & { hermesDesktop?: { isDesktop?: boolean } }).hermesDesktop?.isDesktop === true

// Apply classes to prevent FOUC
if (isDark) {
  document.documentElement.classList.add('dark')
}
if (isComic) {
  document.documentElement.classList.add('comic')
}
if (isDesktopShell) {
  document.documentElement.classList.add('hermes-desktop-shell')
}

// Read token from URL BEFORE router initializes (hash router strips params)
const urlParams = new URLSearchParams(window.location.search)
const hashQuery = window.location.hash.split('?')[1]
const urlToken = urlParams.get('token') || (hashQuery ? new URLSearchParams(hashQuery).get('token') : null)
if (urlToken) {
  ;(window as any).__LOGIN_TOKEN__ = urlToken
}

// ponytail: DEV-ONLY — auto-seed a super-admin JWT so the UI renders without a
// real backend login. Removed once a local server is available. Skip automated
// browsers (Playwright sets navigator.webdriver) — otherwise the seed leaks into
// e2e and the auth specs never see the real login screen.
if (import.meta.env.DEV && !navigator.webdriver && !localStorage.getItem('hermes_api_key')) {
  const fakeJwt = (p: Record<string, unknown>) =>
    `h.${btoa(JSON.stringify(p)).replace(/=/g, '')}.s`
  localStorage.setItem(
    'hermes_api_key',
    fakeJwt({ sub: '1', role: 'super_admin', username: 'dev' }),
  )
}

const app = createApp(App)
app.use(createPinia())
app.use(i18n)
app.use(router)
router.isReady().finally(() => {
  app.mount('#app')
})
