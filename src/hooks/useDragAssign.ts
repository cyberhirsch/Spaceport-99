import { useCallback, useEffect, useRef, useState } from 'react'

export interface DragState {
  crewId: string
  /** Viewport coordinates of the pointer, for positioning the drag ghost. */
  x: number
  y: number
  /** Module currently under the pointer, if any. */
  overModule: string | null
  /** True while the pointer is over the off-duty dock. */
  overDock: boolean
  /** Whether dropping on `overModule` would actually work. */
  valid: boolean
}

interface Options {
  /** Drop resolved: a module id, or null for "send off duty". */
  onDrop: (crewId: string, moduleId: string | null) => void
  /** Pressed and released without dragging anywhere. */
  onTap: (crewId: string) => void
  canDrop: (crewId: string, moduleId: string) => boolean
}

/** Hold this long without moving and the crew member is picked up anyway. */
const HOLD_MS = 150
/** Movement under this is a tap, not a drag. */
const SLOP = 10

interface Gesture {
  crewId: string
  pointerId: number
  x0: number
  y0: number
  timer: number
  active: boolean
  moved: boolean
  state: DragState | null
}

/**
 * Pointer-event drag and drop for crew assignment. One implementation covers
 * touch and mouse; drag handles opt out of browser scrolling with
 * `touch-action: none` so a swipe on a portrait never fights the page.
 */
export const useDragAssign = ({ onDrop, onTap, canDrop }: Options) => {
  const [drag, setDrag] = useState<DragState | null>(null)
  const api = useRef({ onDrop, onTap, canDrop })
  const gesture = useRef<Gesture | null>(null)

  // Kept fresh in an effect rather than during render; drags only ever start
  // after the commit that set these.
  useEffect(() => {
    api.current = { onDrop, onTap, canDrop }
  })

  const finish = useCallback((commit: boolean) => {
    const g = gesture.current
    if (!g) return
    window.clearTimeout(g.timer)
    gesture.current = null
    setDrag(null)
    // A long press that never went anywhere is still just a tap.
    if (!g.active || !g.moved) {
      if (commit) api.current.onTap(g.crewId)
      return
    }
    if (!commit || !g.state) return
    if (g.state.overDock) api.current.onDrop(g.crewId, null)
    else if (g.state.overModule && g.state.valid) api.current.onDrop(g.crewId, g.state.overModule)
  }, [])

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const g = gesture.current
      if (!g || e.pointerId !== g.pointerId) return
      const far = Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > SLOP
      if (far) g.moved = true
      if (!g.active) {
        if (!far) return
        g.active = true
        navigator.vibrate?.(8)
      }
      e.preventDefault()
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const moduleId = el?.closest('[data-drop-module]')?.getAttribute('data-drop-module') ?? null
      const next: DragState = {
        crewId: g.crewId,
        x: e.clientX,
        y: e.clientY,
        overModule: moduleId,
        overDock: Boolean(el?.closest('[data-drop-dock]')),
        valid: moduleId ? api.current.canDrop(g.crewId, moduleId) : false,
      }
      g.state = next
      setDrag(next)
    }
    const up = (e: PointerEvent) => {
      if (gesture.current?.pointerId === e.pointerId) finish(true)
    }
    const cancel = (e: PointerEvent) => {
      if (gesture.current?.pointerId === e.pointerId) finish(false)
    }
    window.addEventListener('pointermove', move, { passive: false })
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [finish])

  const start = useCallback((crewId: string, e: React.PointerEvent) => {
    if (gesture.current || e.button > 0) return
    const g: Gesture = {
      crewId,
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      timer: 0,
      active: false,
      moved: false,
      state: null,
    }
    // Picking up on a short hold too, so a slow, deliberate drag also works.
    g.timer = window.setTimeout(() => {
      if (gesture.current !== g || g.active) return
      g.active = true
      navigator.vibrate?.(8)
      g.state = { crewId, x: g.x0, y: g.y0, overModule: null, overDock: false, valid: false }
      setDrag(g.state)
    }, HOLD_MS)
    gesture.current = g
  }, [])

  return { drag, start }
}
