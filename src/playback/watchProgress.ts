export type WatchProgress = {
  key: string
  media_type: 'movie' | 'tv'
  tmdbId: number
  seriesId?: number
  seasonNumber?: number
  episodeNumber?: number
  episodeId?: number
  title: string
  poster: string
  episodeTitle?: string
  position: number
  duration: number
  updatedAt: number
}

export type WatchProgressContext = Omit<WatchProgress, 'key' | 'position' | 'duration' | 'updatedAt'>

const storageKey = 'aak-movies-watch-progress'
const progressEvent = 'aak-movies-watch-progress-change'
export const COMPLETION_RATIO = 0.95

export function getProgressKey(media: Pick<WatchProgressContext, 'media_type' | 'tmdbId' | 'seriesId' | 'seasonNumber' | 'episodeNumber'>) {
  return media.media_type === 'movie'
    ? `movie:${media.tmdbId}`
    : `tv:${media.seriesId ?? media.tmdbId}:${media.seasonNumber ?? 0}:${media.episodeNumber ?? 0}`
}

export function isProgressComplete(position: number, duration: number) {
  return Number.isFinite(duration) && duration > 0 && Number.isFinite(position) && position / duration >= COMPLETION_RATIO
}

export function sortProgress(items: WatchProgress[]) {
  return [...items].sort((a, b) => b.updatedAt - a.updatedAt)
}

export function upsertProgress(items: WatchProgress[], context: WatchProgressContext, position: number, duration: number, updatedAt = Date.now()) {
  const key = getProgressKey(context)
  const withoutCurrent = items.filter(item => item.key !== key)
  if (!Number.isFinite(position) || !Number.isFinite(duration) || duration <= 0 || position <= 0 || isProgressComplete(position, duration)) {
    return sortProgress(withoutCurrent)
  }
  const item: WatchProgress = { ...context, key, position: Math.min(position, duration), duration, updatedAt }
  return sortProgress([item, ...withoutCurrent]).slice(0, 50)
}

export function readWatchProgress(): WatchProgress[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return sortProgress(parsed.filter((item): item is WatchProgress => isValidProgress(item)))
  } catch {
    return []
  }
}

function isValidProgress(item: unknown): item is WatchProgress {
  if (!item || typeof item !== 'object') return false
  const value = item as Partial<WatchProgress>
  return typeof value.key === 'string' && (value.media_type === 'movie' || value.media_type === 'tv') &&
    Number.isSafeInteger(value.tmdbId) && typeof value.title === 'string' && typeof value.poster === 'string' &&
    Number.isFinite(value.position) && Number.isFinite(value.duration) && Number.isFinite(value.updatedAt) &&
    value.duration! > 0 && value.position! >= 0 && value.position! < value.duration!
}

function commit(items: WatchProgress[]) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(items))
    window.dispatchEvent(new Event(progressEvent))
  } catch (cause) {
    console.warn('[Watch progress] Could not save local playback progress.', cause)
  }
}

export function saveWatchProgress(context: WatchProgressContext, position: number, duration: number) {
  commit(upsertProgress(readWatchProgress(), context, position, duration))
}

export function removeWatchProgress(key: string) {
  commit(readWatchProgress().filter(item => item.key !== key))
}

export function subscribeWatchProgress(onChange: () => void) {
  window.addEventListener(progressEvent, onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener(progressEvent, onChange)
    window.removeEventListener('storage', onChange)
  }
}
