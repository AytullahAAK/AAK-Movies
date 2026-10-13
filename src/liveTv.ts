export type LiveTvFormat = 'hls' | 'mp4' | 'webm' | 'ogg'

/**
 * A channel can only appear in the viewer after the operator confirms its
 * authorization and supplies an HTTPS browser media URL. Keep this registry
 * empty until a channel has been reviewed and tested.
 */
export type LiveTvChannel = {
  id: string
  name: string
  category: string
  description: string
  logoUrl?: string
  playbackUrl: string
  format: LiveTvFormat
  rightsConfirmed: true
  playbackTested: true
}

// Add only channels that AAK Movies is authorized to retransmit. Do not put
// private provider credentials here; browser-visible channel URLs are public.
export const liveTvChannels: readonly LiveTvChannel[] = []

const allowedExtensions: Record<LiveTvFormat, RegExp> = {
  hls: /\.m3u8$/i,
  mp4: /\.mp4$/i,
  webm: /\.webm$/i,
  ogg: /\.(?:ogg|ogv)$/i,
}

export function isConfiguredLiveChannel(channel: LiveTvChannel): boolean {
  if (!channel.id.trim() || !channel.name.trim() || !channel.category.trim() || channel.rightsConfirmed !== true || channel.playbackTested !== true) return false
  try {
    const url = new URL(channel.playbackUrl)
    const extension = allowedExtensions[channel.format]
    return Boolean(extension) && url.protocol === 'https:' && !url.username && !url.password && extension.test(url.pathname)
  } catch {
    return false
  }
}

export function getConfiguredLiveChannels(channels: readonly LiveTvChannel[] = liveTvChannels): LiveTvChannel[] {
  return channels.filter(isConfiguredLiveChannel)
}

export function isSafeLiveTvLogo(url: string | undefined): boolean {
  if (!url) return false
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}
