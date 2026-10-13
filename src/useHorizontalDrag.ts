import { useEffect, useRef } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'

/** Adds mouse-only drag scrolling while leaving native touch scrolling intact. */
export function useHorizontalDrag<T extends HTMLElement>() {
  const drag = useRef<{ element: T; startX: number; startScroll: number; moved: boolean; cleanup: () => void } | null>(null)
  const suppressClick = useRef(false)

  const finishDrag = () => {
    const active = drag.current
    if (!active) return
    active.cleanup()
    active.element.classList.remove('is-dragging')
    suppressClick.current = active.moved
    drag.current = null
    if (active.moved) window.setTimeout(() => { suppressClick.current = false }, 0)
  }
  const onMouseDown = (event: ReactMouseEvent<T>) => {
    if (event.button !== 0) return
    finishDrag()
    const element = event.currentTarget
    const active = { element, startX: event.clientX, startScroll: element.scrollLeft, moved: false, cleanup: () => {} }
    const onMove = (moveEvent: MouseEvent) => {
      if (moveEvent.buttons !== 1) { finishDrag(); return }
      const delta = moveEvent.clientX - active.startX
      if (Math.abs(delta) > 5) active.moved = true
      if (!active.moved) return
      moveEvent.preventDefault()
      active.element.scrollLeft = active.startScroll - delta
    }
    const onUp = () => finishDrag()
    active.cleanup = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    drag.current = active
    element.classList.add('is-dragging')
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
  const onClickCapture = (event: ReactMouseEvent<T>) => {
    if (!suppressClick.current) return
    event.preventDefault()
    event.stopPropagation()
    suppressClick.current = false
  }
  useEffect(() => () => {
    drag.current?.cleanup()
    drag.current?.element.classList.remove('is-dragging')
  }, [])
  return { onMouseDown, onClickCapture }
}
