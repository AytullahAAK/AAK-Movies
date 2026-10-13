/** A provider-specific playback identity. TMDB movie and TV IDs stay distinct. */
export type PlaybackTarget =
  | { media_type: 'movie'; id: number }
  | { media_type: 'tv'; id: number; season_number: number; episode_number: number }

/** External providers generate embed pages; they are never treated as video streams. */
export type ExternalPlaybackSource = {
  name: string
  buildUrl: (target: PlaybackTarget) => string | null
}

function validPositiveId(value: number) {
  return Number.isSafeInteger(value) && value > 0
}

export const nxshaPlaybackSource: ExternalPlaybackSource = {
  name: 'Nxsha',
  buildUrl: target => {
    if (!validPositiveId(target.id)) return null
    if (target.media_type === 'movie') {
      return `https://web.nxsha.app/embed/movie/${target.id}?color=orange`
    }
    if (!Number.isSafeInteger(target.season_number) || target.season_number < 0 || !validPositiveId(target.episode_number)) return null
    return `https://web.nxsha.app/embed/tv/${target.id}/${target.season_number}/${target.episode_number}`
  },
}

export function getExternalPlayerUrl(source: ExternalPlaybackSource, target: PlaybackTarget): string | null {
  return source.buildUrl(target)
}
