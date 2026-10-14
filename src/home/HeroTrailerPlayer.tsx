import { useEffect, useRef, useState } from 'react'
import { Play } from 'lucide-react'
import { loadYouTubeApi, makeYouTubeEmbedUrl, type YouTubeApi, type YouTubePlayer as Player } from '../playback/youtube'

type TrailerPhase = 'loading' | 'ready' | 'playing' | 'buffering' | 'paused' | 'blocked' | 'ended' | 'error'
export function HeroTrailerPlayer({
  mediaKey,
  videoKey,
  muted,
  onEnded,
  onError,
  onPlayingChange,
  onRetry,
  onRegisterToggle,
  onMutedChange,
  onRegisterSetMuted,
}: {
  mediaKey: string
  videoKey: string
  muted: boolean
  onEnded: (mediaKey: string) => void
  onError: (mediaKey: string, error: unknown) => void
  onPlayingChange: (mediaKey: string, playing: boolean) => void
  onRetry: (mediaKey: string) => void
  onRegisterToggle: (toggle: (() => void) | null) => void
  onMutedChange: (mediaKey: string, muted: boolean) => void
  onRegisterSetMuted: (setMuted: ((muted: boolean) => void) | null) => void
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
  const onMutedChangeRef = useRef(onMutedChange)
  onMutedChangeRef.current = onMutedChange

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
    const setPlayerMuted = (nextMuted: boolean) => {
      const current = player.current
      if (!current) return
      try {
        if (nextMuted) current.mute()
        else current.unMute()
        window.setTimeout(() => {
          if (player.current !== current) return
          try { onMutedChangeRef.current(mediaKey, current.isMuted()) } catch (cause) { console.warn('[Hero trailer] Could not read player audio state.', cause) }
        }, 180)
      } catch (cause) { console.warn('[Hero trailer] Audio preference update failed.', { mediaKey, cause }) }
    }
    onRegisterSetMuted(setPlayerMuted)
    return () => { onRegisterToggle(null); onRegisterSetMuted(null) }
  }, [mediaKey, onRegisterToggle, onRegisterSetMuted])

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
          frame.src = makeYouTubeEmbedUrl(videoKey, { autoplay: true, muted: true, controls: false })
          host.current.replaceChildren(frame)
          instance = new api.Player(frame, {
            events: {
              onReady: ({ target }) => {
                if (cancelled || failed.current) return
                player.current = target
                target.getIframe().title = frame.title
                target.getIframe().tabIndex = -1
                target.mute()
                try { onMutedChangeRef.current(mediaKey, target.isMuted()) } catch (cause) { console.warn('[Hero trailer] Could not read initial player audio state.', cause) }
                setPhase('ready')
                target.playVideo()
              },
              onStateChange: event => {
                if (cancelled || failed.current || !active.current) return
                if (event.data === api.PlayerState.PLAYING) {
                  played.current = true
                  try {
                    if (mutedRef.current) event.target.mute()
                    else event.target.unMute()
                    const target = event.target
                    window.setTimeout(() => {
                      if (!cancelled && player.current === target) {
                        try { onMutedChangeRef.current(mediaKey, target.isMuted()) } catch (cause) { console.warn('[Hero trailer] Could not read player audio state.', cause) }
                      }
                    }, 180)
                  } catch (cause) { console.warn('[Hero trailer] Could not apply saved audio preference.', { mediaKey, cause }) }
                  setPhase('playing')
                  onPlayingChange(mediaKey, true)
                } else if (event.data === api.PlayerState.BUFFERING) {
                  setPhase(played.current ? 'buffering' : 'loading')
                } else if (event.data === api.PlayerState.PAUSED || event.data === api.PlayerState.CUED) {
                  setPhase(played.current ? 'paused' : 'ready')
                  onPlayingChange(mediaKey, false)
                  try { onMutedChangeRef.current(mediaKey, event.target.isMuted()) } catch { /* Player may be tearing down. */ }
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
    try {
      if (muted) player.current.mute()
      else player.current.unMute()
      const current = player.current
      window.setTimeout(() => {
        if (player.current !== current) return
        try { onMutedChangeRef.current(mediaKey, current.isMuted()) } catch { /* Player may be tearing down. */ }
      }, 180)
    } catch (cause) { console.warn('[Hero trailer] Audio preference update failed.', { mediaKey, cause }) }
  }, [mediaKey, muted])

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
