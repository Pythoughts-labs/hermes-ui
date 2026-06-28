<script setup lang="ts">
import { NSwitch, NInputNumber, useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '@/stores/hermes/settings'
import SettingRow from './SettingRow.vue'

const settingsStore = useSettingsStore()
const message = useMessage()
const { t } = useI18n()

// Debounced save: each field has its own timer, only the last HTTP request
// within 300ms is sent
const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {}

function save(values: Record<string, any>) {
  // Switch and other one-shot operations save immediately, no debounce needed
  settingsStore.updateLocal('memory', values)
  settingsStore.saveSection('memory', values).then(() => {
    message.success(t('settings.saved'))
  }).catch(() => {
    message.error(t('settings.saveFailed'))
  })
}

function debouncedSave(key: string, value: any) {
  // Update the local store first for instant UI feedback
  settingsStore.updateLocal('memory', { [key]: value })
  // Then debounce the HTTP save
  if (debounceTimers[key]) clearTimeout(debounceTimers[key])
  debounceTimers[key] = setTimeout(async () => {
    try {
      await settingsStore.saveSection('memory', { [key]: value })
      message.success(t('settings.saved'))
    } catch (err: any) {
      message.error(t('settings.saveFailed'))
    }
  }, 300)
}
</script>

<template>
  <section class="settings-section">
    <SettingRow :label="t('settings.memory.enabled')" :hint="t('settings.memory.enabledHint')">
      <NSwitch :value="settingsStore.memory.memory_enabled" @update:value="v => save({ memory_enabled: v })" />
    </SettingRow>
    <SettingRow :label="t('settings.memory.userProfile')" :hint="t('settings.memory.userProfileHint')">
      <NSwitch :value="settingsStore.memory.user_profile_enabled" @update:value="v => save({ user_profile_enabled: v })" />
    </SettingRow>
    <SettingRow :label="t('settings.memory.charLimit')" :hint="t('settings.memory.charLimitHint')">
      <NInputNumber
        :value="settingsStore.memory.memory_char_limit"
        :min="100" :max="10000" :step="100"
        size="small" class="input-sm"
        @update:value="v => v != null && debouncedSave('memory_char_limit', v)"
      />
    </SettingRow>
    <SettingRow :label="t('settings.memory.userCharLimit')" :hint="t('settings.memory.userCharLimitHint')">
      <NInputNumber
        :value="settingsStore.memory.user_char_limit"
        :min="100" :max="10000" :step="100"
        size="small" class="input-sm"
        @update:value="v => v != null && debouncedSave('user_char_limit', v)"
      />
    </SettingRow>
  </section>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.settings-section {
  margin-top: 16px;
}
</style>
