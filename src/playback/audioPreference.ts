export const audioPreferenceKey = 'aak-movies-audio-muted'

let inMemoryPreference: boolean | null = null
const preferenceEventName = 'aak-audio-preference-change'

export function readAudioMutedPreference(): boolean {
  try {
    const stored = globalThis.localStorage?.getItem(audioPreferenceKey)
    if (stored === 'true') return true
    if (stored === 'false') return false
  } catch {
    // Browser storage can be unavailable in private browsing or embedded contexts.
  }
  return inMemoryPreference ?? true
}

export function writeAudioMutedPreference(muted: boolean): boolean {
  inMemoryPreference = muted
  let persisted = false
  try {
    globalThis.localStorage?.setItem(audioPreferenceKey, String(muted))
    persisted = Boolean(globalThis.localStorage)
  } catch {
    // Keep the current preference for the active page if storage is blocked.
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(preferenceEventName))
  return persisted
}

export function subscribeAudioMutedPreference(listener: (muted: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  const notify = () => listener(readAudioMutedPreference())
  const onStorage = (event: StorageEvent) => {
    if (event.key === audioPreferenceKey || event.key === null) notify()
  }
  window.addEventListener(preferenceEventName, notify)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(preferenceEventName, notify)
    window.removeEventListener('storage', onStorage)
  }
}

/** Apply the saved preference to a native player, then remember user volume changes. */
export function syncVideoAudioPreference(video: HTMLVideoElement): () => void {
  const saved = readAudioMutedPreference()
  let skipInitialMutedEvent = true
  video.muted = saved
  const onVolumeChange = () => {
    if (skipInitialMutedEvent && video.muted === saved) {
      skipInitialMutedEvent = false
      return
    }
    skipInitialMutedEvent = false
    writeAudioMutedPreference(video.muted)
  }
  video.addEventListener('volumechange', onVolumeChange)
  return () => video.removeEventListener('volumechange', onVolumeChange)
}
