import { useEffect, useState, type RefObject } from 'react'
import { Maximize, Minimize } from 'lucide-react'

/** Explicit, accessible fullscreen action for a player stage/container. */
export function FullscreenButton({ targetRef, className = '', hideWhenActive = false }: { targetRef: RefObject<HTMLElement | null>; className?: string; hideWhenActive?: boolean }) {
  const [active, setActive] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const sync = () => {
      const target = targetRef.current
      const fullscreenElement = document.fullscreenElement
      setActive(Boolean(target && fullscreenElement && (fullscreenElement === target || target.contains(fullscreenElement))))
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
        await target.requestFullscreen()
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
