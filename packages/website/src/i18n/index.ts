import { createI18n } from 'vue-i18n'
import en from './en'

const saved = localStorage.getItem('hermes_website_locale')

export const i18n = createI18n({
  legacy: false,
  locale: saved || 'en',
  fallbackLocale: 'en',
  messages: { en },
})
