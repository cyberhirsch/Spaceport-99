import { SAVE_VERSION, newGame, newSeed } from './engine.ts'
import type { GameState } from './types.ts'

const KEY = 'spaceport99.save'
/** A bookmark the player writes by hand, separate from the rolling autosave. */
const SLOT = 'spaceport99.slot'
/** Pre-lift-shaft saves used a different key and an incompatible deck layout. */
const LEGACY_KEYS = ['spaceport99.save.v1']

/**
 * Bringing an older save forward.
 *
 * One step per version bump, in order. A save older than the first step has no
 * path to the present and is refused; everything else arrives at the current
 * shape. The chain starts at 7 — before that, saves were disposable and nobody
 * was playing.
 */
const STEPS: { from: number; up: (raw: Record<string, unknown>) => void }[] = [
  // 7 → 8: rolls moved into the state. A save from before this has no luck of
  // its own, so deal it some. What it would have rolled was never written down.
  { from: 7, up: (raw) => { raw.rng = newSeed() } },
]

export const migrate = (raw: GameState): GameState | null => {
  let at = raw.version
  // A save from a build newer than this one is not ours to guess at.
  if (typeof at !== 'number' || at > SAVE_VERSION) return null
  const box = raw as unknown as Record<string, unknown>
  while (at < SAVE_VERSION) {
    const step = STEPS.find((s) => s.from === at)
    if (!step) return null
    step.up(box)
    at += 1
    box.version = at
  }
  return raw
}

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
    const parsed = migrate(JSON.parse(raw) as GameState)
    if (!parsed) return null
    // Guard against a hand-edited or truncated save.
    if (!Array.isArray(parsed.modules) || !Array.isArray(parsed.crew)) return null
    return { ...newGame(parsed.name, parsed.rng), ...parsed }
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

export interface SlotInfo {
  name: string
  savedAt: number
  crew: number
  rooms: number
  credits: number
  elapsed: number
}

/** Writes the manual save slot. The autosave keeps rolling either way. */
export const writeSlot = (state: GameState): void => {
  try {
    localStorage.setItem(SLOT, JSON.stringify({ ...state, lastTick: Date.now() }))
  } catch {
    // Private browsing or a full quota — nothing to save into.
  }
}

export const readSlot = (): GameState | null => {
  try {
    const raw = localStorage.getItem(SLOT)
    if (!raw) return null
    const parsed = migrate(JSON.parse(raw) as GameState)
    if (!parsed) return null
    if (!Array.isArray(parsed.modules) || !Array.isArray(parsed.crew)) return null
    return { ...newGame(parsed.name, parsed.rng), ...parsed }
  } catch {
    return null
  }
}

/** What is in the slot, for the menu to describe without loading it. */
export const slotInfo = (): SlotInfo | null => {
  const s = readSlot()
  if (!s) return null
  return {
    name: s.name,
    savedAt: s.lastTick,
    crew: s.crew.filter((c) => !c.dead).length,
    rooms: s.modules.length,
    credits: Math.round(s.credits),
    elapsed: s.elapsed,
  }
}

export const clearSlot = (): void => {
  try {
    localStorage.removeItem(SLOT)
  } catch {
    // Nothing to remove.
  }
}
