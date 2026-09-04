import type { FactionId, Rng, VisitorKind } from './types.ts'

/**
 * The powers whose space the station's traffic comes from and goes back to,
 * and the people who fell off their books. Three of them can be flown as a
 * flag; the Unlisted are a filing status rather than a patron, so you can only
 * ever stand well or badly with them.
 *
 * None of them is circling this station. It is a small independent post that
 * all three find it convenient to leave alone, which is exactly why it is
 * worth flying somebody's paper.
 */
export interface FactionDef {
  id: FactionId
  /** How the station's own paperwork refers to them. */
  name: string
  short: string
  glyph: string
  /** Room-accent hue, so the interface can colour a hull by who sent it. */
  hue: number
  /** What their authority rests on. */
  claim: string
  /** What flying their flag is worth. */
  offer: string
  /** What resigning it costs. Empty when there is no resigning. */
  exit: string
  /** Whether a station can declare for them at all. */
  patronable: boolean
}

export const FACTION_DEFS: Record<FactionId, FactionDef> = {
  terran: {
    id: 'terran',
    name: 'The Terran Confederation',
    short: 'Terran',
    glyph: '✶',
    hue: 42,
    claim: 'Writ. Confederation charter still covers most of settled space, and no member world has ever voted to give any of it back.',
    offer: 'Applicants on Confederation pay, contracts on a schedule, and a patrol that will answer — eventually.',
    exit: 'They strike the station from the roll. You keep the place and lose the only vote that ever counted it.',
    patronable: true,
  },
  concern: {
    id: 'concern',
    name: 'The Meridian Concern',
    short: 'Concern',
    glyph: '◈',
    hue: 160,
    claim: 'The lanes. Cargo moves on Concern sufferance or it moves the slow way, through the Drift.',
    offer: 'The best prices at your own clamps, and loss prevention on call.',
    exit: 'The account is called in. In full, on the day you resign.',
    patronable: true,
  },
  compact: {
    id: 'compact',
    name: 'The Vantric Compact',
    short: 'Compact',
    glyph: '⬖',
    hue: 272,
    claim: 'Enrolment. They do not take stations. They invite them, once a year, indefinitely.',
    offer: 'Protection that arrives when called, and reactor parts nobody else will sell you.',
    exit: '',
    patronable: true,
  },
  unlisted: {
    id: 'unlisted',
    name: 'The Unlisted',
    short: 'Unlisted',
    glyph: '⌀',
    hue: 350,
    claim: 'None. Being Unlisted is not a nation, it is a filing status.',
    offer: 'Nobody taxes you, audits you or bills you, and every trader in the Drift will deal with you.',
    exit: '',
    patronable: false,
  },
}

export const FACTION_IDS = Object.keys(FACTION_DEFS) as FactionId[]

export const factionDef = (id: FactionId): FactionDef => FACTION_DEFS[id]

/** The three a station can actually declare for. */
export const PATRONS: FactionId[] = FACTION_IDS.filter((id) => FACTION_DEFS[id].patronable)

/** Standing runs between these; it is a nudge on top of what a station can show. */
export const STANDING_FLOOR = -0.2
export const STANDING_CEILING = 0.2

export const blankStanding = (): Record<FactionId, number> =>
  Object.fromEntries(FACTION_IDS.map((id) => [id, 0])) as Record<FactionId, number>

/**
 * Who a hull of each kind is likely to be flying for. A courier is nearly
 * always Confederation paper; a raider is never anything but Unlisted. It is
 * weighted, because the point of the dock is that you cannot be sure.
 */
const OWNERS: Record<VisitorKind, [FactionId, number][]> = {
  trader: [
    ['concern', 45],
    ['unlisted', 30],
    ['terran', 15],
    ['compact', 10],
  ],
  courier: [
    ['terran', 65],
    ['concern', 25],
    ['compact', 10],
  ],
  patrol: [
    ['terran', 40],
    ['concern', 35],
    ['compact', 25],
  ],
  drifter: [
    ['unlisted', 75],
    ['terran', 25],
  ],
  smuggler: [['unlisted', 100]],
  raider: [['unlisted', 100]],
}

export const rollOwner = (rng: Rng, kind: VisitorKind): FactionId => {
  const table = OWNERS[kind]
  const total = table.reduce((n, [, w]) => n + w, 0)
  let roll = rng() * total
  for (const [id, weight] of table) {
    roll -= weight
    if (roll <= 0) return id
  }
  return table[0][0]
}

/** Standing in words, for a readout that is about people rather than numbers. */
export const standingWord = (n: number): string => {
  if (n <= -0.14) return 'hostile'
  if (n <= -0.05) return 'cold'
  if (n < 0.05) return 'neutral'
  if (n < 0.14) return 'warm'
  return 'trusted'
}

/**
 * What resigning a flag costs with the power you are walking out on, and what
 * the power you are walking towards makes of it. Nobody rewards a turncoat as
 * much as they punish one.
 */
export const DEFECTION_COST = 0.16
export const DEFECTION_CREDIT = 0.05
