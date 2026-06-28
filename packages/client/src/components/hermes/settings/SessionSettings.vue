<script setup lang="ts">
import { NInputNumber, NSelect, NSwitch, useMessage } from "naive-ui";
import { useI18n } from "vue-i18n";
import { useSettingsStore } from "@/stores/hermes/settings";
import { useSessionBrowserPrefsStore } from "@/stores/hermes/session-browser-prefs";
import SettingRow from "./SettingRow.vue";

const settingsStore = useSettingsStore();
const sessionBrowserPrefsStore = useSessionBrowserPrefsStore();
const message = useMessage();
const { t } = useI18n();

// Debounced save: each field has its own timer, only the last HTTP request
// within 300ms is sent
const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {};

function save(values: Record<string, any>) {
  // NSelect/NSwitch and other one-shot operations save immediately, no debounce needed
  settingsStore.updateLocal('session_reset', values)
  settingsStore.saveSection('session_reset', values).then(() => {
    message.success(t("settings.saved"));
  }).catch(() => {
    message.error(t("settings.saveFailed"));
  });
}

function debouncedSave(key: string, value: any) {
  // Update the local store first for instant UI feedback
  settingsStore.updateLocal('session_reset', { [key]: value });
  // Then debounce the HTTP save
  if (debounceTimers[key]) clearTimeout(debounceTimers[key])
  debounceTimers[key] = setTimeout(async () => {
    try {
      await settingsStore.saveSection('session_reset', { [key]: value });
      message.success(t("settings.saved"));
    } catch (err: any) {
      message.error(t("settings.saveFailed"));
    }
  }, 300);
}

async function toggleRequireAuth(value: boolean) {
  try {
    await settingsStore.saveSection("approvals", { mode: value ? "manual" : "off" });
    message.success(t("settings.saved"));
  } catch (err: any) {
    message.error(t("settings.saveFailed"));
  }
}

async function toggleWriteApproval(section: "memory" | "skills", value: boolean) {
  try {
    settingsStore.updateLocal(section, { write_approval: value });
    await settingsStore.saveSection(section, { write_approval: value });
    message.success(t("settings.saved"));
  } catch (err: any) {
    message.error(t("settings.saveFailed"));
  }
}

</script>

<template>
  <section class="settings-section">
    <SettingRow
      :label="t('settings.session.requireAuth')"
      :hint="t('settings.session.requireAuthHint')"
    >
      <NSwitch :value="settingsStore.approvals.mode === 'manual'" @update:value="toggleRequireAuth" />
    </SettingRow>
    <SettingRow
      :label="t('settings.session.memoryWriteApproval')"
      :hint="t('settings.session.memoryWriteApprovalHint')"
    >
      <NSwitch
        :value="settingsStore.memory.write_approval === true"
        @update:value="(value) => toggleWriteApproval('memory', value)"
      />
    </SettingRow>
    <SettingRow
      :label="t('settings.session.skillsWriteApproval')"
      :hint="t('settings.session.skillsWriteApprovalHint')"
    >
      <NSwitch
        :value="settingsStore.skills.write_approval === true"
        @update:value="(value) => toggleWriteApproval('skills', value)"
      />
    </SettingRow>
    <SettingRow
      :label="t('settings.session.mode')"
      :hint="t('settings.session.modeHint')"
    >
      <NSelect
        :value="settingsStore.sessionReset.mode || 'both'"
        :options="[
          { label: t('settings.session.modeBoth'), value: 'both' },
          { label: t('settings.session.modeIdle'), value: 'idle' },
          { label: t('settings.session.modeDaily'), value: 'daily' },
          { label: t('settings.session.modeNone'), value: 'none' },
        ]"
        size="small"
        class="input-md"
        @update:value="(v) => save({ mode: v })"
      />
    </SettingRow>
    <SettingRow
      :label="t('settings.session.idleMinutes')"
      :hint="t('settings.session.idleMinutesHint')"
    >
      <NInputNumber
        :value="settingsStore.sessionReset.idle_minutes"
        :min="10"
        :max="10080"
        :step="30"
        size="small"
        class="input-sm"
        @update:value="(v) => v != null && debouncedSave('idle_minutes', v)"
      />
    </SettingRow>
    <SettingRow
      :label="t('settings.session.atHour')"
      :hint="t('settings.session.atHourHint')"
    >
      <NInputNumber
        :value="settingsStore.sessionReset.at_hour"
        :min="0"
        :max="23"
        :step="1"
        size="small"
        class="input-sm"
        @update:value="(v) => v != null && debouncedSave('at_hour', v)"
      />
    </SettingRow>
    <SettingRow
      :label="t('settings.session.liveMonitorHumanOnly')"
      :hint="t('settings.session.liveMonitorHumanOnlyHint')"
    >
      <NSwitch
        :value="sessionBrowserPrefsStore.humanOnly"
        @update:value="(value) => sessionBrowserPrefsStore.setHumanOnly(value)"
      />
    </SettingRow>
  </section>
</template>

<style scoped lang="scss">
@use "@/styles/variables" as *;

.settings-section {
  margin-top: 16px;
}
</style>
