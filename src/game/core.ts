import { uid } from './crew.ts'
import type { GameState, LogEntry, Rng } from './types.ts'

// Constants and the two helpers everything else leans on.

export const SAVE_VERSION = 16

/**
 * The station's luck.
 *
 * Every roll in the game comes from here rather than from Math.random(), which
 * buys three things: a reducer that answers the same way twice for the same
 * input (React calls it twice on purpose in development), a save that cannot be
 * reloaded to reroll a death, and tests that can pin a seed instead of
 * averaging over sixty draws.
 *
 * The generator is mulberry32 — one multiply-and-shift round over a 32-bit
 * word. It is not cryptographic and does not need to be. It needs to be small,
 * fast, and to have a period no station will outlive, and it is all three.
 */
export interface Luck {
  rng: number
}

/** Advance the luck and hand back the next number in [0, 1). */
export const roll = (s: Luck): number => {
  s.rng = (s.rng + 0x6d2b79f5) | 0
  let t = s.rng
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** A roller bound to one state, for handing to the generators. */
export const roller = (s: Luck): Rng => () => roll(s)

/** A standalone roller from a fixed seed, for tests and for founding a game. */
export const seeded = (seed: number): Rng => {
  const box: Luck = { rng: seed | 0 }
  return () => roll(box)
}

/** One of them, uniformly. */
export const pickOne = <T,>(rng: Rng, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]

/** A number in [lo, hi). */
export const spread = (rng: Rng, lo: number, hi: number): number => lo + rng() * (hi - lo)

/** A seed for a station nobody has founded yet. The one unrepeatable roll. */
export const newSeed = (): number => (Date.now() ^ (performance.now() * 1e6)) | 0

export const BASE_CREW_CAP = 8

/**
 * What the bare spine can hold before anything is built. Deliberately thin:
 * capacity is meant to come from the rooms that make the stuff, so a founding
 * station sits about where it always did and every reactor after that is felt.
 */
export const BASE_STORAGE = 120

/** Kit a station can rack before it needs a Cargo Hold. */
export const BASE_HOLD = 6

export const AIR_PER_CREW = 0.06

export const FOOD_PER_CREW = 0.05

export const MAX_LOG = 60

/** Longest stretch of offline time we will simulate on load. */
export const MAX_CATCHUP_SECONDS = 4 * 60 * 60

export const log = (s: GameState, text: string, tone: LogEntry['tone'] = 'info'): void => {
  s.log = [{ id: uid('l'), at: s.elapsed, text, tone }, ...s.log].slice(0, MAX_LOG)
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** Every hull name currently in play, so a new one never collides. */
export const namesInPlay = (s: GameState): string[] => [
  ...s.ships.map((h) => h.name),
  ...s.visitors.map((v) => v.name),
]

/** Emergency resupply: buy a barge-load of one resource, at a stiff markup. */
export const RESUPPLY_FRACTION = 0.3

export const RESUPPLY_PRICE_PER_UNIT = 1.8

export const resupplyAmount = (storageCap: number): number => Math.round(storageCap * RESUPPLY_FRACTION)

export const resupplyCost = (storageCap: number): number =>
  Math.round(resupplyAmount(storageCap) * RESUPPLY_PRICE_PER_UNIT)

export const REQUEST_COST = 70

export const REQUEST_COOLDOWN = 70

/** How long an applicant waits at the dock before giving up. */
export const PATIENCE_SECONDS = 110

/** Interest needed for a certainty; below it, an offer is a gamble. */
export const SIGN_THRESHOLD = 100

/**
 * Timings for the two things that happen *to* a station rather than at it.
 *
 * They live here rather than with the code that uses them because founding a
 * station has to set both clocks, and `state.ts` sits below `traffic.ts`.
 */
export const APPROACH_EARLIEST = 11 * 60

export const APPROACH_GAP = 8 * 60

export const LOITER_EARLIEST = 16 * 60

export const LOITER_GAP = 13 * 60

/** How long somebody sits in the cells before their people come asking. */
export const CLAIM_AFTER = 7 * 60

/**
 * How long a station runs before anybody thinks to tell it about the seven
 * hulls. Long enough to have a station worth telling.
 */
export const LETTER_EARLIEST = 9 * 60

export const REVIVE_COST_PER_LEVEL = 90
