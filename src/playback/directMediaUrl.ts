import type { DirectMediaSource } from './NativeVideoPlayer'

/** Validate a URL that points directly to browser-compatible video media. */
export function parseDirectMediaUrl(value: string): DirectMediaSource {
  if (!value.trim()) throw new Error('Enter a direct HTTPS video URL.')

  let parsed: URL
  try { parsed = new URL(value) } catch { throw new Error('Enter a valid HTTPS video URL.') }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('Use a secure HTTPS direct video URL without embedded credentials.')
  }

  const extension = parsed.pathname.toLowerCase().split('.').pop()
  const contentType = extension === 'mp4' ? 'video/mp4'
    : extension === 'webm' ? 'video/webm'
      : extension === 'ogg' || extension === 'ogv' ? 'video/ogg' : null
  if (!contentType) {
    throw new Error('Use a direct MP4, WebM, or Ogg file URL. A webpage, embed, torrent, or manifest URL is not a video file.')
  }
  return { url: parsed.href, contentType }
}
