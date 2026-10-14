import { useEffect, useRef, useState, type ReactElement } from 'react'
import { syncVideoAudioPreference } from './audioPreference'
import { FullscreenButton } from './FullscreenButton'

/** A direct browser media URL; the caller is responsible for confirming its rights. */
export type DirectMediaSource = {
  url: string
  contentType: 'video/mp4' | 'video/webm' | 'video/ogg'
}

/** Kept separate from external iframe providers. Never pass an embed page URL here. */
export function NativeVideoPlayer({ source, title, onError, resumeAtSeconds = 0, onProgress, onComplete }: { source: DirectMediaSource; title: string; onError: () => void; resumeAtSeconds?: number; onProgress?: (position: number, duration: number) => void; onComplete?: () => void }): ReactElement | null {
  let parsed: URL
  try { parsed = new URL(source.url) } catch { return null }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null
  const extension = parsed.pathname.toLowerCase().split('.').pop()
  const matchesType = source.contentType === 'video/mp4' ? extension === 'mp4' : source.contentType === 'video/webm' ? extension === 'webm' : extension === 'ogg'
  if (!matchesType) return null
  return <NativeVideoElement source={source} title={title} onError={onError} resumeAtSeconds={resumeAtSeconds} onProgress={onProgress} onComplete={onComplete} />
}

function NativeVideoElement({ source, title, onError, resumeAtSeconds, onProgress, onComplete }: { source: DirectMediaSource; title: string; onError: () => void; resumeAtSeconds: number; onProgress?: (position: number, duration: number) => void; onComplete?: () => void }): ReactElement {
  const video = useRef<HTMLVideoElement>(null)
  const playerShell = useRef<HTMLDivElement>(null)
  const [speed, setSpeed] = useState('1')
  const lastWrite = useRef(0)
  const latestPosition = useRef({ position: 0, duration: 0 })
  useEffect(() => {
    const element = video.current
    return element ? syncVideoAudioPreference(element) : undefined
  }, [source.url])
  useEffect(() => {
    const saveOnExit = () => {
      const { position, duration } = latestPosition.current
      if (position > 0 && duration > 0) onProgress?.(position, duration)
    }
    window.addEventListener('pagehide', saveOnExit)
    const onVisibilityChange = () => { if (document.visibilityState === 'hidden') saveOnExit() }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => { saveOnExit(); window.removeEventListener('pagehide', saveOnExit); document.removeEventListener('visibilitychange', onVisibilityChange) }
  }, [onProgress])
  const recordProgress = (force = false) => {
    const element = video.current
    if (!element || !Number.isFinite(element.currentTime) || !Number.isFinite(element.duration) || element.duration <= 0) return
    latestPosition.current = { position: element.currentTime, duration: element.duration }
    if (!force && Date.now() - lastWrite.current < 12000) return
    lastWrite.current = Date.now()
    onProgress?.(element.currentTime, element.duration)
  }
  const resume = () => {
    const element = video.current
    if (!element || resumeAtSeconds <= 0 || !Number.isFinite(element.duration) || element.duration <= 0) return
    if (element.currentTime < 1) element.currentTime = Math.min(resumeAtSeconds, Math.max(0, element.duration * .95 - 1))
    latestPosition.current = { position: element.currentTime, duration: element.duration }
  }
  const changeSpeed = (value: string) => {
    setSpeed(value)
    if (video.current) video.current.playbackRate = Number(value)
  }
  return <div className="native-video-player" ref={playerShell}>
    <div className="native-video-frame">
      <video ref={video} controls playsInline preload="metadata" aria-label={title} onLoadedMetadata={resume} onTimeUpdate={() => recordProgress()} onPause={() => recordProgress(true)} onEnded={() => { onComplete?.(); latestPosition.current = { position: 0, duration: 0 } }} onError={onError}>
        <source src={source.url} type={source.contentType} />
        Your browser does not support this video format.
      </video>
    </div>
    <div className="native-player-toolbar" role="group" aria-label="Video player controls">
      <FullscreenButton targetRef={playerShell} />
      <label className="playback-speed">Playback speed
        <select value={speed} onChange={event => changeSpeed(event.target.value)} aria-label="Playback speed">
          <option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1">1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option>
        </select>
      </label>
    </div>
  </div>
}
