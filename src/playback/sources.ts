import type { Media } from '../data'

/** External providers generate embed-page URLs; they are never treated as media streams. */
export type ExternalPlaybackSource = {
  name: string
  mapMediaId: (media: Media) => string | null
  buildUrl: (providerId: string) => string
}

export const nxshaPlaybackSource: ExternalPlaybackSource = {
  name: 'Nxsha',
  // Explicitly movie-only. This configured template uses the TMDB movie ID as its provider ID;
  // provider acceptance remains unverified. TV IDs are never sent to this movie endpoint.
  mapMediaId: media => media.media_type === 'movie' ? String(media.id) : null,
  buildUrl: providerId => `https://web.nxsha.app/embed/movie/${encodeURIComponent(providerId)}?color=orange`,
}

export function getExternalPlayerUrl(source: ExternalPlaybackSource, media: Media): string | null {
  const providerId = source.mapMediaId(media)
  return providerId ? source.buildUrl(providerId) : null
}
