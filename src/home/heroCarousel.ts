import type { Media, MovieDetails } from '../data'

export const YOUR_NAME_TMDB_ID = 372058
export type HeroMedia = Media & { trailerKey?: string }

export function getNextHeroIndex(currentIndex: number, direction: number, itemCount: number) {
  if (!Number.isSafeInteger(itemCount) || itemCount <= 0) return 0
  return ((currentIndex + direction) % itemCount + itemCount) % itemCount
}

export function buildHeroCarousel(yourName: MovieDetails | null, trending: Media[], maxItems = 10): HeroMedia[] {
  if (!yourName || yourName.media_type !== 'movie' || yourName.id !== YOUR_NAME_TMDB_ID) return []
  const limit = Number.isSafeInteger(maxItems) ? Math.max(1, maxItems) : 10
  const items: HeroMedia[] = [yourName]
  const seen = new Set([`movie:${YOUR_NAME_TMDB_ID}`])
  for (const item of trending) {
    if (items.length >= limit) break
    const key = `${item.media_type}:${item.id}`
    if (!Number.isSafeInteger(item.id) || item.id <= 0 || seen.has(key)) continue
    seen.add(key)
    items.push(item)
  }
  return items
}

export function getHeroSwipeDirection(startX: number, startY: number, endX: number, endY: number, threshold = 56) {
  const deltaX = endX - startX
  const deltaY = endY - startY
  if (![startX, startY, endX, endY, threshold].every(Number.isFinite)) return 0
  if (Math.abs(deltaX) < threshold || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return 0
  return deltaX < 0 ? 1 : -1
}

export function isCurrentHeroEvent(eventMediaKey: string, currentMediaKey: string) {
  return eventMediaKey !== '' && eventMediaKey === currentMediaKey
}
