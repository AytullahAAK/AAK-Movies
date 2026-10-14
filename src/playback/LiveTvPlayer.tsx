import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { syncVideoAudioPreference } from './audioPreference'
import type { LiveTvChannel } from '../liveTv'
import type HlsInstance from 'hls.js'

type PlaybackStatus = 'loading' | 'playing' | 'paused' | 'blocked' | 'error'
type AvailabilityStatus = 'online' | 'offline' | 'unknown'
type VideoWithFrameCallbacks = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: (now: number, metadata: { presentedFrames: number }) => void) => number
  cancelVideoFrameCallback?: (handle: number) => void
  webkitDecodedFrameCount?: number
}

type LiveTvPlayerProps = {
  channel: LiveTvChannel
  onStatus?: (status: AvailabilityStatus, message?: string) => void
  onPrevious?: () => void
  onNext?: () => void
}

export function LiveTvPlayer({ channel, onStatus, onPrevious, onNext }: LiveTvPlayerProps) {
  const video = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<PlaybackStatus>('loading')
  const statusRef = useRef<PlaybackStatus>('loading')
  statusRef.current = status
  const onStatusRef = useRef(onStatus)
  onStatusRef.current = onStatus

  useEffect(() => {
    const currentElement = video.current
    if (!currentElement) return
    const element: HTMLVideoElement = currentElement
    let active = true
    let didFail = false
    let autoplayAttempted = false
    let instance: HlsInstance | null = null
    let frameConfirmTimer: ReturnType<typeof setTimeout> | undefined
    let frameStartTimer: ReturnType<typeof setTimeout> | undefined
    let frameCallback: number | undefined
    setStatus('loading')
    const stopAudioSync = syncVideoAudioPreference(element)

    const report = (next: PlaybackStatus) => {
      if (!active || didFail && next !== 'error') return
      statusRef.current = next
      setStatus(next)
      if (next === 'playing') onStatusRef.current?.('online', 'Playback started in the browser.')
    }
    const fail = (availability: AvailabilityStatus = 'unknown') => {
      if (didFail) return
      didFail = true
      if (frameConfirmTimer) clearTimeout(frameConfirmTimer)
      if (frameStartTimer) clearTimeout(frameStartTimer)
      frameConfirmTimer = undefined
      frameStartTimer = undefined
      instance?.destroy()
      instance = null
      element.pause()
      element.removeAttribute('src')
      element.load()
      report('error')
      onStatusRef.current?.(availability)
    }
    function confirmVideoFrame() {
      if (!active || didFail || element.paused) return
      const frameVideo = element as VideoWithFrameCallbacks
      const frameCount = element.getVideoPlaybackQuality?.().totalVideoFrames ?? frameVideo.webkitDecodedFrameCount ?? 0
      const frameApiAvailable = typeof frameVideo.requestVideoFrameCallback === 'function'
      const dimensionsFallback = !frameApiAvailable && element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && element.videoWidth > 0 && element.videoHeight > 0
      if (frameCount > 0 || dimensionsFallback) {
        if (frameConfirmTimer) clearTimeout(frameConfirmTimer)
        frameConfirmTimer = undefined
        report('playing')
        return
      }
      if (frameVideo.requestVideoFrameCallback && frameCallback === undefined) {
        frameCallback = frameVideo.requestVideoFrameCallback((_now, metadata) => {
          frameCallback = undefined
          if (metadata.presentedFrames > 0) {
            if (frameConfirmTimer) clearTimeout(frameConfirmTimer)
            frameConfirmTimer = undefined
            report('playing')
          } else confirmVideoFrame()
        })
      }
      if (!frameConfirmTimer) {
        frameConfirmTimer = setTimeout(() => {
          frameConfirmTimer = undefined
          const latestFrameCount = element.getVideoPlaybackQuality?.().totalVideoFrames ?? frameVideo.webkitDecodedFrameCount ?? 0
          const hasDimensions = typeof frameVideo.requestVideoFrameCallback !== 'function' && element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && element.videoWidth > 0 && element.videoHeight > 0
          if (latestFrameCount > 0 || hasDimensions) report('playing')
          else fail()
        }, 12000)
      }
    }
    const attemptAutoplay = () => {
      if (!active || didFail || autoplayAttempted) return
      autoplayAttempted = true
      void element.play().then(() => {
        if (active) confirmVideoFrame()
      }).catch(cause => {
        if (!active) return
        const blocked = cause instanceof DOMException && cause.name === 'NotAllowedError'
        report(blocked ? 'blocked' : 'error')
        if (!blocked) onStatusRef.current?.('unknown')
      })
      frameStartTimer = setTimeout(() => {
        frameStartTimer = undefined
        if (active && !element.paused) confirmVideoFrame()
      }, 250)
    }
    const handleMediaError = () => fail()
    const handlePlaying = () => confirmVideoFrame()
    const handleLoadedData = () => { if (!element.paused) confirmVideoFrame() }
    const handleWaiting = () => report('loading')
    const handlePause = () => { if (active && !element.ended && !element.error && statusRef.current !== 'blocked') report('paused') }
    element.muted = true
    element.addEventListener('error', handleMediaError)
    element.addEventListener('playing', handlePlaying)
    element.addEventListener('loadeddata', handleLoadedData)
    element.addEventListener('waiting', handleWaiting)
    element.addEventListener('pause', handlePause)
    element.addEventListener('canplay', attemptAutoplay, { once: true })

    const start = async () => {
      if (channel.format === 'hls') {
        if (element.canPlayType('application/vnd.apple.mpegurl')) {
          element.src = channel.playbackUrl
          element.load()
        } else {
          const Hls = (await import('hls.js')).default
          if (!active) return
          if (!Hls.isSupported()) {
            fail()
            return
          }
          instance = new Hls({ enableWorker: true, lowLatencyMode: true, maxBufferLength: 30, backBufferLength: 15 })
          instance.on(Hls.Events.MEDIA_ATTACHED, () => instance?.loadSource(channel.playbackUrl))
          instance.on(Hls.Events.MANIFEST_PARSED, () => {
            if (active) attemptAutoplay()
          })
          instance.on(Hls.Events.ERROR, (_event, data) => {
            if (!active || !data.fatal) return
            const responseCode = (data as typeof data & { response?: { code?: number } }).response?.code
            const confirmedOffline = responseCode === 404 || responseCode === 410
            fail(confirmedOffline ? 'offline' : 'unknown')
          })
          instance.attachMedia(element)
        }
      } else {
        element.src = channel.playbackUrl
        element.load()
      }
    }
    void start().catch(() => { if (active) fail() })

    return () => {
      active = false
      element.removeEventListener('error', handleMediaError)
      element.removeEventListener('playing', handlePlaying)
      element.removeEventListener('loadeddata', handleLoadedData)
      element.removeEventListener('waiting', handleWaiting)
      element.removeEventListener('pause', handlePause)
      element.removeEventListener('canplay', attemptAutoplay)
      if (frameConfirmTimer) clearTimeout(frameConfirmTimer)
      if (frameStartTimer) clearTimeout(frameStartTimer)
      if (frameCallback !== undefined) (element as VideoWithFrameCallbacks).cancelVideoFrameCallback?.(frameCallback)
      element.pause()
      element.removeAttribute('src')
      element.load()
      stopAudioSync?.()
      instance?.destroy()
    }
  }, [channel.id, channel.playbackUrl, channel.format])

  return <div className="live-tv-player">
    <div className="live-video-stage">
      <video ref={video} controls playsInline preload="none" aria-label={`${channel.name} live channel`} />
    </div>
    {status === 'loading' && <p className="live-player-status" role="status">Connecting to {channel.name}…</p>}
    <nav className="live-channel-navigation" aria-label="Live TV channel navigation">
      <button type="button" onClick={onPrevious} disabled={!onPrevious} aria-label="Previous channel"><ChevronLeft size={16} aria-hidden="true" /><span>Previous</span></button>
      <button type="button" onClick={onNext} disabled={!onNext} aria-label="Next channel"><span>Next</span><ChevronRight size={16} aria-hidden="true" /></button>
    </nav>
  </div>
}
