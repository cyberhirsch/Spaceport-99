import { SAVE_VERSION, newGame } from './engine.ts'
import type { GameState } from './types.ts'

const KEY = 'spaceport99.save'
/** Pre-lift-shaft saves used a different key and an incompatible deck layout. */
const LEGACY_KEYS = ['spaceport99.save.v1']

export const saveGame = (state: GameState): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, lastTick: Date.now() }))
  } catch {
    // Private browsing or a full quota — the session simply won't persist.
  }
}

export const loadGame = (): GameState | null => {
  try {
    for (const key of LEGACY_KEYS) localStorage.removeItem(key)
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as GameState
    if (parsed.version !== SAVE_VERSION) return null
    // Guard against a hand-edited or truncated save.
    if (!Array.isArray(parsed.modules) || !Array.isArray(parsed.crew)) return null
    return { ...newGame(parsed.name), ...parsed }
  } catch {
    return null
  }
}

export const clearSave = (): void => {
  try {
    localStorage.removeItem(KEY)
    for (const key of LEGACY_KEYS) localStorage.removeItem(key)
  } catch {
    // Nothing to do — the next save will overwrite it anyway.
  }
}
