import { FACTION_IDS, STANDING_CEILING, STANDING_FLOOR } from './factions.ts'
import type { FactionId, GameState } from './types.ts'
import { clamp } from './core.ts'
import { derive } from './state.ts'

// The powers' opinion of the station, and what that opinion is worth.

/** Nudge one power's opinion of the station, inside the range it can move in. */
export const shift = (s: GameState, id: FactionId, amount: number): void => {
  s.standing[id] = clamp(s.standing[id] + amount, STANDING_FLOOR, STANDING_CEILING)
}

/**
 * The standing that actually counts. Flying a flag means that power's opinion
 * is the one deciding who HQ sends you and how nasty the contracts are; with
 * no flag you trade on your general name instead, for better and worse.
 */
export const patronStanding = (s: GameState): number =>
  s.patron
    ? s.standing[s.patron]
    : FACTION_IDS.reduce((n, id) => n + s.standing[id], 0) / FACTION_IDS.length

export const appeal = (s: GameState): number => {
  const d = derive(s)
  const size = Math.min(1, s.modules.length / 14) * 0.25
  const room = Math.min(1, s.decks / 4) * 0.1
  const surplus =
    (d.powerRate > 0 ? 0.1 : 0) + (d.airRate > 0 ? 0.1 : 0) + (d.foodRate > 0 ? 0.1 : 0)
  const spirit = d.crewAlive.length
    ? (d.crewAlive.reduce((sum, c) => sum + c.morale, 0) / d.crewAlive.length) * 0.2
    : 0
  const funds = Math.min(1, s.credits / 2500) * 0.15
  // Goodwill: how the station treats people who turn up needing something.
  return clamp(size + room + surplus + spirit + funds + patronStanding(s), 0, 1)
}
