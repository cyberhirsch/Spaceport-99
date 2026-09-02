import { useCallback, useEffect, useRef, useState } from 'react'

/** What is currently in hand: a crew member off to a post, or a whole room. */
export type DragSubject =
  | { type: 'crew'; id: string }
  | { type: 'room'; id: string }

export interface DragCell {
  deck: number
  col: number
}

export interface DragState {
  subject: DragSubject
  /** Convenience views of `subject` — null when something else is in hand. */
  crewId: string | null
  roomId: string | null
  /** Viewport coordinates of the pointer, for positioning the drag ghost. */
  x: number
  y: number
  /** Module currently under the pointer, if any. */
  overModule: string | null
  /** Grid slot currently under the pointer, if any. */
  overCell: DragCell | null
  /** True while the pointer is over the off-duty dock. */
  overDock: boolean
  /** Whether releasing here would actually work. */
  valid: boolean
}

interface Options {
  /** Crew drop resolved: a module id, or null for "send off duty". */
  onDropCrew: (crewId: string, moduleId: string | null) => void
  /** Room drop resolved onto a grid slot. */
  onDropRoom: (roomId: string, cell: DragCell) => void
  /** Pressed and released without dragging anywhere. */
  onTap: (subject: DragSubject) => void
  canDropCrew: (crewId: string, moduleId: string) => boolean
  canDropRoom: (roomId: string, cell: DragCell) => boolean
}

/** Hold this long without moving and whatever is under the finger is picked up. */
const HOLD_MS = 150
/** Movement under this is a tap, not a drag. */
const SLOP = 10

interface Gesture {
  subject: DragSubject
  pointerId: number
  x0: number
  y0: number
  timer: number
  active: boolean
  moved: boolean
  state: DragState | null
}

const readCell = (el: Element | null | undefined): DragCell | null => {
  const raw = el?.closest('[data-drop-cell]')?.getAttribute('data-drop-cell')
  if (!raw) return null
  const [deck, col] = raw.split(':').map(Number)
  return Number.isFinite(deck) && Number.isFinite(col) ? { deck, col } : null
}

/**
 * Pointer-event drag and drop for the station: crew onto posts, and whole
 * rooms onto empty slots. One implementation covers touch and mouse; drag
 * handles opt out of browser scrolling with `touch-action: none` so a swipe
 * on a portrait never fights the page.
 */
export const useDragAssign = ({
  onDropCrew,
  onDropRoom,
  onTap,
  canDropCrew,
  canDropRoom,
}: Options) => {
  const [drag, setDrag] = useState<DragState | null>(null)
  const api = useRef({ onDropCrew, onDropRoom, onTap, canDropCrew, canDropRoom })
  const gesture = useRef<Gesture | null>(null)

  // Kept fresh in an effect rather than during render; drags only ever start
  // after the commit that set these.
  useEffect(() => {
    api.current = { onDropCrew, onDropRoom, onTap, canDropCrew, canDropRoom }
  })

  const finish = useCallback((commit: boolean) => {
    const g = gesture.current
    if (!g) return
    window.clearTimeout(g.timer)
    gesture.current = null
    setDrag(null)
    // A long press that never went anywhere is still just a tap.
    if (!g.active || !g.moved) {
      if (commit) api.current.onTap(g.subject)
      return
    }
    if (!commit || !g.state) return
    const st = g.state
    if (g.subject.type === 'room') {
      if (st.overCell && st.valid) api.current.onDropRoom(g.subject.id, st.overCell)
      return
    }
    if (st.overDock) api.current.onDropCrew(g.subject.id, null)
    else if (st.overModule && st.valid) api.current.onDropCrew(g.subject.id, st.overModule)
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
      const cell = readCell(el)
      const room = g.subject.type === 'room'
      const next: DragState = {
        subject: g.subject,
        crewId: room ? null : g.subject.id,
        roomId: room ? g.subject.id : null,
        x: e.clientX,
        y: e.clientY,
        overModule: moduleId,
        overCell: cell,
        overDock: Boolean(el?.closest('[data-drop-dock]')),
        valid: room
          ? Boolean(cell && api.current.canDropRoom(g.subject.id, cell))
          : Boolean(moduleId && api.current.canDropCrew(g.subject.id, moduleId)),
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

  const start = useCallback((subject: DragSubject, e: React.PointerEvent) => {
    if (gesture.current || e.button > 0) return
    const room = subject.type === 'room'
    const g: Gesture = {
      subject,
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
      g.state = {
        subject,
        crewId: room ? null : subject.id,
        roomId: room ? subject.id : null,
        x: g.x0,
        y: g.y0,
        overModule: null,
        overCell: null,
        overDock: false,
        valid: false,
      }
      setDrag(g.state)
    }, HOLD_MS)
    gesture.current = g
  }, [])

  const startCrew = useCallback(
    (id: string, e: React.PointerEvent) => start({ type: 'crew', id }, e),
    [start],
  )
  const startRoom = useCallback(
    (id: string, e: React.PointerEvent) => start({ type: 'room', id }, e),
    [start],
  )

  return { drag, start: startCrew, startRoom }
}
