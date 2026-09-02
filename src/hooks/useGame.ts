import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import { type Action, derive, newGame, reducer } from '../game/engine.ts'
import { clearSave, clearSlot, loadGame, readSlot, saveGame, writeSlot } from '../game/save.ts'
import type { GameState } from '../game/types.ts'

const TICK_MS = 500
const SAVE_EVERY_MS = 5000

const init = (): GameState => {
  const saved = loadGame()
  if (!saved) return newGame()
  // Credit the player for time spent away, capped inside `advance`.
  const away = Math.max(0, (Date.now() - saved.lastTick) / 1000)
  return reducer(saved, { type: 'catchUp', seconds: away })
}

export const useGame = () => {
  const [state, dispatch] = useReducer(reducer, undefined, init)
  // Clocks live in refs but are stamped inside effects, never during render.
  const last = useRef(0)
  const lastSave = useRef(0)

  useEffect(() => {
    last.current = Date.now()
    const id = window.setInterval(() => {
      const now = Date.now()
      const seconds = (now - last.current) / 1000
      last.current = now
      if (seconds > 0) dispatch({ type: 'tick', seconds })
    }, TICK_MS)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const now = Date.now()
    if (now - lastSave.current < SAVE_EVERY_MS) return
    lastSave.current = now
    saveGame(state)
  }, [state])

  useEffect(() => {
    const flush = () => saveGame(state)
    window.addEventListener('beforeunload', flush)
    return () => window.removeEventListener('beforeunload', flush)
  }, [state])

  const derived = useMemo(() => derive(state), [state])

  const act = useCallback((action: Action) => dispatch(action), [])

  /**
   * Scuttles the running station. The manual save is deliberately left alone:
   * it is a bookmark the player made on purpose, and starting over is one of
   * the likeliest reasons to want it back.
   */
  const hardReset = useCallback(() => {
    clearSave()
    dispatch({ type: 'reset' })
  }, [])

  /** Throws the bookmark away, for a player who wants a genuinely clean slate. */
  const discardSlot = useCallback(() => clearSlot(), [])

  /** Flush the rolling autosave right now, so a close is never mid-second. */
  const saveNow = useCallback(() => {
    lastSave.current = Date.now()
    saveGame(state)
  }, [state])

  /** Write the manual slot — a bookmark to come back to later. */
  const bookmark = useCallback(() => {
    writeSlot(state)
    saveGame(state)
  }, [state])

  /** Restore that bookmark, discarding everything since. */
  const restore = useCallback(() => {
    const slot = readSlot()
    if (!slot) return false
    const away = Math.max(0, (Date.now() - slot.lastTick) / 1000)
    dispatch({ type: 'load', state: reducer(slot, { type: 'catchUp', seconds: away }) })
    return true
  }, [])

  return { state, derived, act, hardReset, saveNow, bookmark, restore, discardSlot }
}
