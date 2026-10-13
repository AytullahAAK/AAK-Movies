import { useRef, useState, type ReactElement } from 'react'

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
  return <NativeVideoElement source={source} title={title} onError={onError} />
}

function NativeVideoElement({ source, title, onError }: { source: DirectMediaSource; title: string; onError: () => void }): ReactElement {
  const video = useRef<HTMLVideoElement>(null)
  const [speed, setSpeed] = useState('1')
  const changeSpeed = (value: string) => {
    setSpeed(value)
    if (video.current) video.current.playbackRate = Number(value)
  }
  return <div className="native-video-player">
    <video ref={video} controls playsInline preload="metadata" aria-label={title} onError={onError}>
      <source src={source.url} type={source.contentType} />
      Your browser does not support this video format.
    </video>
    <label className="playback-speed">Playback speed
      <select value={speed} onChange={event => changeSpeed(event.target.value)} aria-label="Playback speed">
        <option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option>
      </select>
    </label>
  </div>
}
