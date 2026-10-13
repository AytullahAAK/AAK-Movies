import type { ReactElement } from 'react'

/** A direct browser media URL; the caller is responsible for confirming its rights. */
export type DirectMediaSource = {
  url: string
  contentType: 'video/mp4' | 'video/webm' | 'video/ogg'
}

/** Kept separate from external iframe providers. Never pass an embed page URL here. */
export function NativeVideoPlayer({ source, title, onError }: { source: DirectMediaSource; title: string; onError: () => void }): ReactElement | null {
  let parsed: URL
  try { parsed = new URL(source.url) } catch { return null }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null
  const extension = parsed.pathname.toLowerCase().split('.').pop()
  const matchesType = source.contentType === 'video/mp4' ? ['mp4', 'm4v'].includes(extension ?? '') : source.contentType === 'video/webm' ? extension === 'webm' : ['ogg', 'ogv'].includes(extension ?? '')
  if (!matchesType) return null
  return <video controls playsInline preload="metadata" aria-label={title} onError={onError}>
    <source src={source.url} type={source.contentType} />
    Your browser does not support this video format.
  </video>
}
