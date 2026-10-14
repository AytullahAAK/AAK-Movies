import { useEffect, useRef, useState, type RefObject } from 'react'
import { Maximize, Minimize } from 'lucide-react'
import { shouldLockLandscapeOnPhone } from './mobileOrientation'

/** Explicit, accessible fullscreen action for a player stage/container. */
export function FullscreenButton({ targetRef, className = '', hideWhenActive = false, lockLandscapeOnPhone = false }: { targetRef: RefObject<HTMLElement | null>; className?: string; hideWhenActive?: boolean; lockLandscapeOnPhone?: boolean }) {
  const [active, setActive] = useState(false)
  const [message, setMessage] = useState('')
  const hasLandscapeLock = useRef(false)
  const fullscreenSession = useRef(0)

  const releaseOrientationLock = () => {
    if (!hasLandscapeLock.current) return
    hasLandscapeLock.current = false
    try { screen.orientation.unlock() } catch (cause) { console.info('[Player] Could not release the fullscreen orientation lock.', cause) }
  }

  useEffect(() => {
    const sync = () => {
      const target = targetRef.current
      const fullscreenElement = document.fullscreenElement
      const targetIsFullscreen = Boolean(target && fullscreenElement && (fullscreenElement === target || target.contains(fullscreenElement)))
      setActive(targetIsFullscreen)
      if (!targetIsFullscreen) {
        fullscreenSession.current += 1
        releaseOrientationLock()
      }
    }
    document.addEventListener('fullscreenchange', sync)
    const video = targetRef.current?.querySelector('video') as (HTMLVideoElement & { webkitDisplayingFullscreen?: boolean }) | null
    const syncVideo = () => setActive(Boolean(video?.webkitDisplayingFullscreen))
    video?.addEventListener('webkitbeginfullscreen', syncVideo)
    video?.addEventListener('webkitendfullscreen', syncVideo)
    return () => {
      document.removeEventListener('fullscreenchange', sync)
      video?.removeEventListener('webkitbeginfullscreen', syncVideo)
      video?.removeEventListener('webkitendfullscreen', syncVideo)
      fullscreenSession.current += 1
      releaseOrientationLock()
    }
  }, [targetRef])

  const toggle = async () => {
    const target = targetRef.current
    if (!target) return
    setMessage('')
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
        return
      }
      if (typeof target.requestFullscreen === 'function') {
        const session = ++fullscreenSession.current
        await target.requestFullscreen()
        if (!lockLandscapeOnPhone) return
        const fullscreenElement = document.fullscreenElement
        const targetIsFullscreen = Boolean(fullscreenElement && (fullscreenElement === target || target.contains(fullscreenElement)))
        if (!targetIsFullscreen) return

        const mobileNavigator = navigator as Navigator & { userAgentData?: { mobile?: boolean } }
        const mobileUserAgent = mobileNavigator.userAgentData?.mobile ?? /iPhone|iPod|Android.*Mobile|Windows Phone|\bMobile\b/i.test(navigator.userAgent)
        const coarsePointer = window.matchMedia('(pointer: coarse)').matches
        if (!shouldLockLandscapeOnPhone(mobileUserAgent, coarsePointer, window.innerWidth)) return

        const orientation = screen.orientation as ScreenOrientation & { lock?: (orientation: 'landscape') => Promise<void> }
        if (typeof orientation?.lock !== 'function') return
        try {
          await orientation.lock('landscape')
          const activeFullscreenElement = document.fullscreenElement
          const stillTargetFullscreen = Boolean(activeFullscreenElement && (activeFullscreenElement === target || target.contains(activeFullscreenElement)))
          if (session !== fullscreenSession.current || !stillTargetFullscreen) {
            try { orientation.unlock() } catch (cause) { console.info('[Player] Could not release a stale fullscreen orientation lock.', cause) }
            return
          }
          hasLandscapeLock.current = true
        } catch (cause) {
          console.info('[Player] Landscape orientation is unavailable for this fullscreen session.', cause)
        }
        return
      }
      const video = target.querySelector('video') as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
      if (typeof video?.webkitEnterFullscreen === 'function') {
        video.webkitEnterFullscreen()
        return
      }
      setMessage('Fullscreen is not supported by this browser.')
    } catch (cause) {
      console.warn('[Player] Fullscreen request was not accepted.', cause)
      setMessage('Fullscreen is not available for this player in the current browser.')
    }
  }

  if (hideWhenActive && active) return null
  return <span className={`fullscreen-control-wrap ${className}`}>
    <button className="fullscreen-control" type="button" aria-label={active ? 'Exit fullscreen' : 'Enter fullscreen'} aria-pressed={active} onClick={() => void toggle()}>
      {active ? <Minimize size={16} aria-hidden="true" /> : <Maximize size={16} aria-hidden="true" />}
      <span>{active ? 'Exit fullscreen' : 'Fullscreen'}</span>
    </button>
    {message && <span className="fullscreen-message" role="status">{message}</span>}
  </span>
}
