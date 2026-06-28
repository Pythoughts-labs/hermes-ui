import { defineStore } from 'pinia'
import { ref } from 'vue'
import * as profilesApi from '@/api/hermes/profiles'
import type { HermesProfile, HermesProfileDetail } from '@/api/hermes/profiles'
import { useAppStore } from './app'

const ACTIVE_PROFILE_STORAGE_KEY = 'hermes_active_profile_name'

export const useProfilesStore = defineStore('profiles', () => {
  const profiles = ref<HermesProfile[]>([])
  // Read localStorage synchronously on init so other stores (e.g. chat) can pick up the profile name at startup
  const activeProfileName = ref<string | null>(localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY))
  const activeProfile = ref<HermesProfile | null>(null)
  const detailMap = ref<Record<string, HermesProfileDetail>>({})
  const loading = ref(false)
  const switching = ref(false)

  async function fetchProfiles() {
    loading.value = true
    try {
      profiles.value = await profilesApi.fetchProfiles()
      const storedName = activeProfileName.value || localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY)
      let selected = profiles.value.find(p => p.name === storedName) ?? null
      if (!selected && profiles.value.length > 0) {
        selected = profiles.value[0]
        activeProfileName.value = selected.name
        localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, selected.name)
      }
      profiles.value = profiles.value.map(profile => ({
        ...profile,
        active: !!selected && profile.name === selected.name,
      }))
      activeProfile.value = selected
      if (selected) {
        activeProfileName.value = selected.name
      } else {
        activeProfileName.value = null
        localStorage.removeItem(ACTIVE_PROFILE_STORAGE_KEY)
      }
      // Clear all session caches (no longer using localStorage caching)
      clearAllSessionCaches()
    } catch (err) {
      console.error('Failed to fetch profiles:', err)
    } finally {
      loading.value = false
    }
  }

  async function fetchHermesProfiles() {
    loading.value = true
    try {
      profiles.value = await profilesApi.fetchProfiles()
      activeProfile.value = profiles.value.find(profile => profile.active) ?? null
      clearAllSessionCaches()
    } catch (err) {
      console.error('Failed to fetch Hermes profiles:', err)
    } finally {
      loading.value = false
    }
  }

  async function fetchProfileDetail(name: string) {
    if (detailMap.value[name]) return detailMap.value[name]
    try {
      const detail = await profilesApi.fetchProfileDetail(name)
      detailMap.value[name] = detail
      return detail
    } catch {
      return null
    }
  }

  async function updateAvatar(name: string, avatar: profilesApi.ProfileAvatar) {
    const saved = await profilesApi.updateProfileAvatar(name, avatar)
    profiles.value = profiles.value.map(profile => (
      profile.name === name ? { ...profile, avatar: saved } : profile
    ))
    if (detailMap.value[name]) {
      detailMap.value[name] = { ...detailMap.value[name], avatar: saved }
    }
    if (activeProfile.value?.name === name) {
      activeProfile.value = { ...activeProfile.value, avatar: saved }
    }
    return saved
  }

  async function deleteAvatar(name: string) {
    await profilesApi.deleteProfileAvatar(name)
    profiles.value = profiles.value.map(profile => (
      profile.name === name ? { ...profile, avatar: null } : profile
    ))
    if (detailMap.value[name]) {
      detailMap.value[name] = { ...detailMap.value[name], avatar: null }
    }
    if (activeProfile.value?.name === name) {
      activeProfile.value = { ...activeProfile.value, avatar: null }
    }
  }

  async function createProfile(name: string, clone?: boolean) {
    const res = await profilesApi.createProfile(name, clone)
    if (res.success) await fetchProfiles()
    return res
  }

  async function deleteProfile(name: string) {
    const ok = await profilesApi.deleteProfile(name)
    if (ok) {
      delete detailMap.value[name]
      await fetchProfiles()
    }
    return ok
  }

  // Clear all profile session caches
  function clearAllSessionCaches() {
    // Note: no longer clearing any cache, since session data is no longer cached
    // in localStorage. All session data is fetched live from the server.
  }

  async function renameProfile(name: string, newName: string) {
    const ok = await profilesApi.renameProfile(name, newName)
    if (ok) {
      delete detailMap.value[name]
      await fetchProfiles()
    }
    return ok
  }

  async function switchProfile(name: string) {
    switching.value = true
    try {
      const ok = await profilesApi.switchProfile(name)
      if (ok) {
        activeProfileName.value = name
        localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, name)
        profiles.value = profiles.value.map(profile => ({
          ...profile,
          active: profile.name === name,
        }))
        activeProfile.value = profiles.value.find(profile => profile.name === name) ?? null
        await useAppStore().reloadModels()
      }
      return ok
    } finally {
      switching.value = false
    }
  }

  async function switchHermesProfile(name: string) {
    switching.value = true
    try {
      const ok = await profilesApi.switchHermesProfile(name)
      if (ok) await fetchHermesProfiles()
      return ok
    } finally {
      switching.value = false
    }
  }

  async function exportProfile(name: string) {
    return profilesApi.exportProfile(name)
  }

  async function importProfile(file: File) {
    const ok = await profilesApi.importProfile(file)
    if (ok) await fetchProfiles()
    return ok
  }

  return {
    profiles,
    activeProfile,
    activeProfileName,
    detailMap,
    loading,
    switching,
    fetchProfiles,
    fetchHermesProfiles,
    fetchProfileDetail,
    createProfile,
    deleteProfile,
    renameProfile,
    switchProfile,
    switchHermesProfile,
    exportProfile,
    importProfile,
    updateAvatar,
    deleteAvatar,
    clearAllSessionCaches,
  }
})
