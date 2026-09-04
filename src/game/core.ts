import { uid } from './crew.ts'
import type { GameState, LogEntry } from './types.ts'

// Constants and the two helpers everything else leans on.

export const SAVE_VERSION = 7

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

export const REVIVE_COST_PER_LEVEL = 90
