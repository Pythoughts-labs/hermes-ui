<script setup lang="ts">
import { useTheme } from '@/composables/useTheme'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const { isDark, toggleBrightness } = useTheme()
</script>

<template>
  <button
    class="brightness-toggle"
    type="button"
    :title="isDark ? t('settings.display.themeLight') : t('settings.display.themeDark')"
    :aria-label="isDark ? t('settings.display.themeLight') : t('settings.display.themeDark')"
    @click="toggleBrightness"
  >
    <!-- Sun (shown in dark mode → click to go light) -->
    <svg
      v-if="isDark"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="12" y1="20" x2="12" y2="22" />
      <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
      <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
      <line x1="2" y1="12" x2="4" y2="12" />
      <line x1="20" y1="12" x2="22" y2="12" />
      <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
      <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
    </svg>
    <!-- Moon (shown in light mode → click to go dark) -->
    <svg
      v-else
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  </button>
</template>

<style scoped>
.brightness-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary, currentColor);
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.brightness-toggle:hover {
  background: rgba(var(--accent-primary-rgb), 0.06);
  color: var(--text-primary, currentColor);
}
</style>