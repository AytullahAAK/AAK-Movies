import { useEffect, useRef, useState } from 'react'
import { Play } from 'lucide-react'

type Player = {
  destroy: () => void
  mute: () => void
  unMute: () => void
  playVideo: () => void
  pauseVideo: () => void
  getPlayerState: () => number
  getIframe: () => HTMLIFrameElement
}
type PlayerEvent = { data: number; target: Player }
type PlayerOptions = {
  events: {
    onReady: (event: { target: Player }) => void
    onStateChange: (event: PlayerEvent) => void
    onError: () => void
    onAutoplayBlocked: () => void
  }
}
type YouTubeApi = {
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number; BUFFERING: number; CUED: number }
  Player: new (element: HTMLIFrameElement | HTMLElement, options: PlayerOptions) => Player
}

declare global {
  interface Window {
    YT?: YouTubeApi
    onYouTubeIframeAPIReady?: () => void
  }
}

type TrailerPhase = 'loading' | 'ready' | 'playing' | 'buffering' | 'paused' | 'blocked' | 'ended' | 'error'
let apiPromise: Promise<YouTubeApi> | null = null

function loadYouTubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (apiPromise) return apiPromise
  apiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    let settled = false
    let priorReady: (() => void) | undefined
    let handler: (() => void) | undefined
    const script = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]')
    const timeout = window.setTimeout(() => finish(new Error('YouTube player API did not become ready.')), 12000)
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeout)
      if (handler && window.onYouTubeIframeAPIReady === handler) window.onYouTubeIframeAPIReady = priorReady
      if (error) reject(error)
      else if (window.YT?.Player) resolve(window.YT)
      else reject(new Error('YouTube player API is unavailable.'))
    }
    priorReady = window.onYouTubeIframeAPIReady
    handler = () => {
      try { priorReady?.() } catch (error) { console.warn('[Hero trailer] Existing YouTube API callback failed.', error) }
      finish()
    }
    window.onYouTubeIframeAPIReady = handler
    if (!script) {
      const nextScript = document.createElement('script')
      nextScript.src = 'https://www.youtube.com/iframe_api'
      nextScript.async = true
      nextScript.onerror = () => finish(new Error('YouTube player API could not be loaded.'))
      document.head.append(nextScript)
    } else {
      script.addEventListener('error', () => finish(new Error('YouTube player API could not be loaded.')), { once: true })
    }
  }).catch(error => {
    apiPromise = null
    throw error
  })
  return apiPromise
}

export function HeroTrailerPlayer({
  mediaKey,
  videoKey,
  muted,
  onEnded,
  onError,
  onPlayingChange,
  onRetry,
  onRegisterToggle,
}: {
  mediaKey: string
  videoKey: string
  muted: boolean
  onEnded: (mediaKey: string) => void
  onError: (mediaKey: string, error: unknown) => void
  onPlayingChange: (mediaKey: string, playing: boolean) => void
  onRetry: (mediaKey: string) => void
  onRegisterToggle: (toggle: (() => void) | null) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const player = useRef<Player | null>(null)
  const apiRef = useRef<YouTubeApi | null>(null)
  const [phase, setPhase] = useState<TrailerPhase>('loading')
  const active = useRef(true)
  const mutedRef = useRef(muted)
  const played = useRef(false)
  const ended = useRef(false)
  const failed = useRef(false)
  mutedRef.current = muted

  useEffect(() => {
    const togglePlayback = () => {
      const current = player.current
      const states = apiRef.current?.PlayerState
      if (!current || !states) return
      try {
        const state = current.getPlayerState()
        if (state === states.PLAYING || state === states.BUFFERING) current.pauseVideo()
        else current.playVideo()
      } catch (cause) {
        console.warn('[Hero trailer] Playback toggle failed.', { mediaKey, cause })
      }
    }
    onRegisterToggle(togglePlayback)
    return () => onRegisterToggle(null)
  }, [mediaKey, onRegisterToggle])

  useEffect(() => {
    active.current = true
    let instance: Player | null = null
    let cancelled = false
    let startTimer: number | undefined
    const fail = (cause: unknown) => {
      if (cancelled || failed.current) return
      failed.current = true
      setPhase('error')
      const current = player.current ?? instance
      if (player.current === current) player.current = null
      try { current?.destroy() } catch (cleanupCause) { console.warn('[Hero trailer] Failed player cleanup.', cleanupCause) }
      host.current?.replaceChildren()
      onPlayingChange(mediaKey, false)
      onError(mediaKey, cause)
      console.warn('[Hero trailer] Preview could not start.', { mediaKey, cause })
    }

    void loadYouTubeApi().then(api => {
      if (cancelled || !host.current) return
      startTimer = window.setTimeout(() => {
        if (cancelled || !host.current) return
        try {
          apiRef.current = api
          const frame = document.createElement('iframe')
          frame.title = `Featured trailer for ${mediaKey.replace(':', ' ')}`
          frame.tabIndex = -1
          frame.allow = 'autoplay; encrypted-media; picture-in-picture'
          frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoKey)}?autoplay=1&mute=${mutedRef.current ? 1 : 0}&controls=0&playsinline=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`
          host.current.replaceChildren(frame)
          instance = new api.Player(frame, {
            events: {
              onReady: ({ target }) => {
                if (cancelled || failed.current) return
                player.current = target
                target.getIframe().title = frame.title
                target.getIframe().tabIndex = -1
                if (mutedRef.current) target.mute()
                else target.unMute()
                setPhase('ready')
                target.playVideo()
              },
              onStateChange: event => {
                if (cancelled || failed.current || !active.current) return
                if (event.data === api.PlayerState.PLAYING) {
                  played.current = true
                  setPhase('playing')
                  onPlayingChange(mediaKey, true)
                } else if (event.data === api.PlayerState.BUFFERING) {
                  setPhase(played.current ? 'buffering' : 'loading')
                } else if (event.data === api.PlayerState.PAUSED || event.data === api.PlayerState.CUED) {
                  setPhase(played.current ? 'paused' : 'ready')
                  onPlayingChange(mediaKey, false)
                } else if (event.data === api.PlayerState.ENDED) {
                  setPhase('ended')
                  onPlayingChange(mediaKey, false)
                  if (!ended.current) {
                    ended.current = true
                    onEnded(mediaKey)
                  }
                }
              },
              onError: () => fail(new Error('YouTube rejected this trailer or it is unavailable for embedding.')),
              onAutoplayBlocked: () => {
                if (cancelled || failed.current) return
                setPhase('blocked')
                onPlayingChange(mediaKey, false)
              },
            },
          })
          player.current = instance
        } catch (cause) { fail(cause) }
      }, 0)
    }).catch(fail)

    return () => {
      cancelled = true
      active.current = false
      if (startTimer !== undefined) window.clearTimeout(startTimer)
      apiRef.current = null
      const current = instance
      if (player.current === current) player.current = null
      try { current?.destroy() } catch (cause) { console.warn('[Hero trailer] Player cleanup failed.', cause) }
    }
    // The player instance is tied to this specific banner and trailer.
    // Mute changes are applied through the small effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaKey, videoKey])

  useEffect(() => {
    if (!player.current) return
    if (muted) player.current.mute()
    else player.current.unMute()
  }, [muted])

  const canStart = phase === 'ready' || phase === 'blocked' || phase === 'paused' || phase === 'error'
  const playLabel = phase === 'error' ? 'Retry featured trailer' : phase === 'paused' ? 'Resume featured trailer' : 'Play featured trailer'
  return <>
    <div className="hero-preview-layer" aria-hidden="true"><div className="hero-youtube-host" ref={host} /></div>
    {canStart && <button className="hero-trailer-play" type="button" onClick={event => {
      event.stopPropagation()
      if (phase === 'error') { onRetry(mediaKey); return }
      try { player.current?.playVideo() } catch (cause) {
        if (!failed.current) {
          failed.current = true
          setPhase('error')
          onError(mediaKey, cause)
          console.warn('[Hero trailer] User playback request failed.', { mediaKey, cause })
        }
      }
    }} aria-label={playLabel}><Play size={24} fill="currentColor" aria-hidden="true" /></button>}
    {phase === 'loading' && <span className="sr-only" role="status">Loading featured trailer.</span>}
  </>
}
