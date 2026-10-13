import type { DirectMediaSource } from './NativeVideoPlayer'

export type DirectMediaUrlResult = { source: DirectMediaSource } | { error: string }

/** Accept direct, browser-compatible HTTPS media URLs only. */
export function parseDirectMediaUrl(value: string): DirectMediaUrlResult {
  const input = value.trim()
  if (!input) return { error: 'Enter a direct video URL.' }
  let url: URL
  try { url = new URL(input) } catch { return { error: 'Enter a complete HTTPS video URL.' } }
  if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return { error: 'Direct video links must use HTTPS and must not contain credentials.' }
  const extension = url.pathname.toLowerCase().split('.').pop()
  const contentType: DirectMediaSource['contentType'] | undefined = extension === 'mp4' ? 'video/mp4' : extension === 'webm' ? 'video/webm' : extension === 'ogg' ? 'video/ogg' : undefined
  if (!contentType) return { error: 'Use a direct HTTPS MP4, WebM, or Ogg file. A webpage, embed, or torrent manifest is not a video file.' }
  return { source: { url: url.href, contentType } }
}
