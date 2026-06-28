<script setup lang="ts">
import { ref, onMounted } from "vue";
import { NButton, NInput, NModal, NForm, NFormItem, NPopconfirm, NPopover, useMessage } from "naive-ui";
import { useI18n } from "vue-i18n";
import { changePassword, changeUsername, fetchCurrentUser, fetchLockedIps, unlockSpecificIp, unlockAllIps, fetchMyAvatar, updateMyAvatar, resetMyAvatar, fetchAvatarPresets, urlToDataUrl } from "@/api/auth";
import type { LockedIp, UserAvatar } from "@/api/auth";
import ProfileAvatar from "@/components/hermes/profiles/ProfileAvatar.vue";
import multiavatar from "@multiavatar/multiavatar";

const { t } = useI18n();
const message = useMessage();

const username = ref<string | null>(null);
const loading = ref(false);

// User avatar
const avatar = ref<UserAvatar | null>(null);
const avatarFileInput = ref<HTMLInputElement | null>(null);
const avatarSaving = ref(false);
const avatarPickerOpen = ref(false);
// ponytail: the yellow guy in the reference image becomes the visual default
// when no avatar is set or after reset. Add a new preset when re-branding.
const DEFAULT_AVATAR_PRESET = '3d_1.png';

function compressImage(file: File, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0)
        const tryCompress = (quality: number) => {
          const result = canvas.toDataURL('image/jpeg', quality)
          if (result.length <= maxBytes || quality <= 0.3) resolve(result)
          else tryCompress(quality - 0.1)
        }
        tryCompress(0.8)
      }
      img.onerror = reject
      img.src = reader.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function handleAvatarUpload(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    message.error(t('settings.userAvatar.invalidType'))
    target.value = ''
    return
  }
  if (file.size > 1024 * 1024) {
    message.error(t('settings.userAvatar.tooLarge'))
    target.value = ''
    return
  }
  avatarSaving.value = true
  try {
    let dataUrl: string
    if (file.size > 500 * 1024) {
      dataUrl = await compressImage(file, 500 * 1024)
    } else {
      dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result as string)
        r.onerror = reject
        r.readAsDataURL(file)
      })
    }
    await updateMyAvatar({ type: 'image', dataUrl })
    avatar.value = { type: 'image', dataUrl }
    message.success(t('settings.userAvatar.saveSuccess'))
  } catch (err: any) {
    message.error(err.message || t('settings.userAvatar.saveFailed'))
  } finally {
    avatarSaving.value = false
    target.value = ''
  }
}

async function handleRandomAvatar() {
  avatarSaving.value = true
  try {
    const randomPart = typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
    const seed = `${username.value || 'default'}-${Date.now()}-${randomPart}`
    const svg = multiavatar(seed)
    const dataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)))
    await updateMyAvatar({ type: 'image', dataUrl, seed })
    avatar.value = { type: 'image', dataUrl, seed }
    message.success(t('settings.userAvatar.saveSuccess'))
  } catch (err: any) {
    message.error(err.message || t('settings.userAvatar.saveFailed'))
  } finally {
    avatarSaving.value = false
  }
}

async function handleResetAvatar() {
  avatarSaving.value = true
  try {
    await resetMyAvatar()
    avatar.value = { type: 'image', dataUrl: `/avatars/${DEFAULT_AVATAR_PRESET}`, seed: DEFAULT_AVATAR_PRESET }
    message.success(t('settings.userAvatar.resetSuccess'))
  } catch (err: any) {
    message.error(err.message || t('settings.userAvatar.resetFailed'))
  } finally {
    avatarSaving.value = false
  }
}

const presetAvatars = ref<string[]>([])
const presetLoading = ref(false)

async function loadPresetAvatars() {
  if (presetLoading.value) return
  presetLoading.value = true
  try {
    presetAvatars.value = await fetchAvatarPresets()
  } finally {
    presetLoading.value = false
  }
}

async function handlePickPreset(filename: string) {
  if (avatarSaving.value) return
  avatarSaving.value = true
  try {
    const dataUrl = await urlToDataUrl(`/avatars/${filename}`)
    await updateMyAvatar({ type: 'image', dataUrl, seed: filename })
    avatar.value = { type: 'image', dataUrl, seed: filename }
    avatarPickerOpen.value = false
    message.success(t('settings.userAvatar.saveSuccess'))
  } catch (err: any) {
    message.error(err.message || t('settings.userAvatar.saveFailed'))
  } finally {
    avatarSaving.value = false
  }
}

// Change password form
const showChangePasswordModal = ref(false);
const currentPasswordForPwd = ref("");
const newPasswordVal = ref("");
const newPasswordConfirm = ref("");

// Change username form
const showChangeUsernameModal = ref(false);
const currentPasswordForName = ref("");
const newUsernameVal = ref("");

onMounted(async () => {
  try {
    const user = await fetchCurrentUser();
    username.value = user.username;
  } catch { /* ignore */ }
  try {
    const av = await fetchMyAvatar();
    avatar.value = av || { type: 'image', dataUrl: `/avatars/${DEFAULT_AVATAR_PRESET}`, seed: DEFAULT_AVATAR_PRESET };
    loadPresetAvatars();
  } catch { /* ignore */ }
});

async function handleChangePassword() {
  if (newPasswordVal.value !== newPasswordConfirm.value) {
    message.error(t("login.passwordMismatch"));
    return;
  }
  if (newPasswordVal.value.length < 6) {
    message.error(t("login.passwordTooShort"));
    return;
  }
  loading.value = true;
  try {
    await changePassword(currentPasswordForPwd.value, newPasswordVal.value);
    showChangePasswordModal.value = false;
    currentPasswordForPwd.value = "";
    newPasswordVal.value = "";
    newPasswordConfirm.value = "";
    message.success(t("login.passwordChanged"));
  } catch (err: any) {
    message.error(err.message || t("common.saveFailed"));
  } finally {
    loading.value = false;
  }
}

async function handleChangeUsername() {
  if (newUsernameVal.value.trim().length < 2) {
    message.error(t("login.usernameTooShort"));
    return;
  }
  loading.value = true;
  try {
    await changeUsername(currentPasswordForName.value, newUsernameVal.value.trim());
    username.value = newUsernameVal.value.trim();
    showChangeUsernameModal.value = false;
    currentPasswordForName.value = "";
    newUsernameVal.value = "";
    message.success(t("login.usernameChanged"));
  } catch (err: any) {
    message.error(err.message || t("common.saveFailed"));
  } finally {
    loading.value = false;
  }
}

function openChangePasswordModal() {
  currentPasswordForPwd.value = "";
  newPasswordVal.value = "";
  newPasswordConfirm.value = "";
  showChangePasswordModal.value = true;
}

function openChangeUsernameModal() {
  currentPasswordForName.value = "";
  newUsernameVal.value = "";
  showChangeUsernameModal.value = true;
}

// Locked IPs management
const lockedIps = ref<LockedIp[]>([]);
const loadingLocks = ref(false);

async function loadLockedIps() {
  loadingLocks.value = true;
  try {
    lockedIps.value = await fetchLockedIps();
  } catch { /* ignore */ }
  finally {
    loadingLocks.value = false;
  }
}

async function handleUnlockIp(ip: string) {
  try {
    await unlockSpecificIp(ip);
    message.success(t("settings.lockedIps.unlocked"));
    await loadLockedIps();
  } catch (err: any) {
    message.error(err.message || t("common.saveFailed"));
  }
}

async function handleUnlockAll() {
  try {
    const count = await unlockAllIps();
    message.success(t("settings.lockedIps.allUnlocked", { count }));
    await loadLockedIps();
  } catch (err: any) {
    message.error(err.message || t("common.saveFailed"));
  }
}

function formatTime(ts: number): string {
  const remaining = Math.max(0, Math.round((ts - Date.now()) / 60000));
  return remaining > 0 ? `${remaining} min` : t("common.expired");
}

function lockedIpTypeLabel(type: LockedIp["type"]): string {
  return t(`settings.lockedIps.type.${type}`);
}

onMounted(() => { loadLockedIps(); });
</script>

<template>
  <div class="account-settings">
    <p class="section-desc">{{ t("login.setupDescription") }}</p>

    <!-- User Avatar — collapsed line + popover dropdown -->
    <div class="avatar-section">
      <h3 class="section-title">{{ t('settings.userAvatar.title') }}</h3>
      <div class="avatar-line">
        <ProfileAvatar
          class="avatar-line-preview"
          :name="username || 'default'"
          :avatar="avatar?.type === 'image' && avatar.dataUrl ? { type: 'image', dataUrl: avatar.dataUrl } : null"
          :size="40"
        />
        <div class="avatar-line-info">
          <span class="avatar-line-label">{{ t('settings.userAvatar.title') }}</span>
          <span class="avatar-line-hint">{{ t('settings.userAvatar.hint') }}</span>
        </div>
        <NPopover
          v-model:show="avatarPickerOpen"
          trigger="click"
          placement="bottom-end"
          :width="380"
          :show-arrow="false"
        >
          <template #trigger>
            <NButton class="avatar-line-trigger" :loading="avatarSaving" ghost>
              {{ t('settings.userAvatar.change') }}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </NButton>
          </template>
          <div class="avatar-popover">
            <div class="popover-actions">
              <NButton size="small" @click="avatarFileInput?.click()">{{ t('settings.userAvatar.upload') }}</NButton>
              <NButton size="small" @click="handleRandomAvatar" :loading="avatarSaving">{{ t('settings.userAvatar.random') }}</NButton>
              <NButton size="small" @click="handleResetAvatar" :loading="avatarSaving">{{ t('settings.userAvatar.reset') }}</NButton>
            </div>
            <input
              ref="avatarFileInput"
              type="file"
              accept=".png,.jpg,.jpeg,.webp"
              style="display: none"
              @change="handleAvatarUpload"
            />
            <div v-if="presetAvatars.length > 0" class="popover-presets">
              <p class="popover-label">{{ t('settings.userAvatar.presetsHint') }}</p>
              <div class="preset-grid">
                <button
                  v-for="name in presetAvatars"
                  :key="name"
                  type="button"
                  class="preset-item"
                  :disabled="avatarSaving"
                  :class="{ 'is-active': avatar?.seed === name }"
                  :title="name"
                  @click="handlePickPreset(name)"
                >
                  <img :src="`/avatars/${name}`" :alt="name" draggable="false" />
                </button>
              </div>
            </div>
          </div>
        </NPopover>
      </div>
    </div>

    <div class="configured-section">
      <div class="action-row">
        <span class="action-label">{{ t("login.passwordLoginConfigured", { username }) }}</span>
        <div class="action-buttons">
          <NButton @click="openChangePasswordModal">{{ t("login.changePassword") }}</NButton>
          <NButton @click="openChangeUsernameModal">{{ t("login.changeUsername") }}</NButton>
        </div>
      </div>
    </div>

    <!-- Locked IPs management -->
    <div class="locked-ips-section">
      <h3 class="section-title">{{ t("settings.lockedIps.title") }}</h3>
      <div class="action-row" style="margin-bottom: 12px;">
        <span class="action-label">{{ t("settings.lockedIps.count", { count: lockedIps.length }) }}</span>
        <div class="action-buttons">
          <NButton size="small" :loading="loadingLocks" @click="loadLockedIps">{{ t("common.retry") }}</NButton>
          <NPopconfirm v-if="lockedIps.length > 0" @positive-click="handleUnlockAll">
            <template #trigger>
              <NButton size="small" type="warning">{{ t("settings.lockedIps.unlockAll") }}</NButton>
            </template>
            {{ t("settings.lockedIps.unlockAllConfirm") }}
          </NPopconfirm>
        </div>
      </div>
      <div v-if="lockedIps.length > 0" class="locked-list">
        <div v-for="lock in lockedIps" :key="lock.ip + lock.type" class="locked-item">
          <div class="locked-info">
            <span class="locked-ip">{{ lock.ip }}</span>
            <span class="locked-badge">{{ lockedIpTypeLabel(lock.type) }}</span>
            <span class="locked-ttl">{{ formatTime(lock.lockedUntil) }}</span>
          </div>
          <NButton size="tiny" type="error" ghost @click="handleUnlockIp(lock.ip)">{{ t("settings.lockedIps.unlock") }}</NButton>
        </div>
      </div>
      <p v-else class="empty-hint">{{ t("settings.lockedIps.empty") }}</p>
    </div>

    <!-- Change password modal -->
    <NModal v-model:show="showChangePasswordModal" preset="dialog" :title="t('login.changePassword')">
      <NForm label-placement="top">
        <NFormItem :label="t('login.currentPassword')">
          <NInput v-model:value="currentPasswordForPwd" type="password" show-password-on="click" :placeholder="t('login.currentPassword')" />
        </NFormItem>
        <NFormItem :label="t('login.newPassword')">
          <NInput v-model:value="newPasswordVal" type="password" show-password-on="click" :placeholder="t('login.newPassword')" />
        </NFormItem>
        <NFormItem :label="t('login.confirmPassword')">
          <NInput v-model:value="newPasswordConfirm" type="password" show-password-on="click" :placeholder="t('login.confirmPassword')" @keyup.enter="handleChangePassword" />
        </NFormItem>
      </NForm>
      <template #action>
        <NButton @click="showChangePasswordModal = false">{{ t("common.cancel") }}</NButton>
        <NButton type="primary" :loading="loading" @click="handleChangePassword">{{ t("common.save") }}</NButton>
      </template>
    </NModal>

    <!-- Change username modal -->
    <NModal v-model:show="showChangeUsernameModal" preset="dialog" :title="t('login.changeUsername')">
      <NForm label-placement="top">
        <NFormItem :label="t('login.currentPassword')">
          <NInput v-model:value="currentPasswordForName" type="password" show-password-on="click" :placeholder="t('login.currentPassword')" />
        </NFormItem>
        <NFormItem :label="t('login.newUsername')">
          <NInput v-model:value="newUsernameVal" :placeholder="t('login.usernamePlaceholder')" @keyup.enter="handleChangeUsername" />
        </NFormItem>
      </NForm>
      <template #action>
        <NButton @click="showChangeUsernameModal = false">{{ t("common.cancel") }}</NButton>
        <NButton type="primary" :loading="loading" @click="handleChangeUsername">{{ t("common.save") }}</NButton>
      </template>
    </NModal>
  </div>
</template>

<style scoped lang="scss">
@use "@/styles/variables" as *;

.account-settings {
  padding: 8px 0;
}

.section-desc {
  font-size: 13px;
  color: $text-muted;
  margin: 0 0 20px;
  line-height: 1.6;
}

.action-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.action-label {
  font-size: 14px;
  color: $text-secondary;
}

.action-buttons {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.locked-ips-section {
  margin-top: 32px;
  padding-top: 20px;
  border-top: 1px solid $border-color;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: $text-primary;
  margin: 0 0 16px;
}

.locked-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.locked-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  background: $bg-input;
}

.locked-info {
  display: flex;
  align-items: center;
  gap: 8px;
}

.locked-ip {
  font-family: $font-code;
  font-size: 13px;
  color: $text-primary;
}

.locked-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 3px;
  background: rgba($error, 0.1);
  color: $error;
}

.locked-ttl {
  font-size: 12px;
  color: $text-muted;
}

.empty-hint {
  font-size: 13px;
  color: $text-muted;
  margin: 0;
}

.avatar-section {
  margin-bottom: 32px;
  padding-bottom: 20px;
  border-bottom: 1px solid $border-color;
}

.avatar-line {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 6px 0;
}

.avatar-line-preview {
  flex-shrink: 0;
  box-shadow: 0 0 0 1px $border-color;
}

.avatar-line-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.avatar-line-label {
  font-size: 13px;
  color: $text-primary;
  font-weight: 500;
}

.avatar-line-hint {
  font-size: 12px;
  color: $text-muted;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.avatar-line-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.avatar-popover {
  padding: 4px;
  max-height: 420px;
  overflow-y: auto;
}

.popover-actions {
  display: flex;
  gap: 6px;
  padding-bottom: 12px;
  margin-bottom: 12px;
  border-bottom: 1px solid $border-color;
}

.popover-presets {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.popover-label {
  font-size: 12px;
  color: $text-muted;
  margin: 0;
  padding: 0 4px;
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
  gap: 8px;
}

.preset-item {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 8px;
  border: 1px solid $border-color;
  background: var(--bg-secondary);
  padding: 0;
  cursor: pointer;
  overflow: hidden;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;

  &:hover:not(:disabled) {
    transform: scale(1.05);
    border-color: var(--primary-color, #18a058);
  }

  &.is-active {
    border-color: var(--primary-color, #18a058);
    box-shadow: 0 0 0 2px rgba(24, 160, 88, 0.25);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}
</style>
