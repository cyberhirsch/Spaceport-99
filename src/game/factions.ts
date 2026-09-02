import type { FactionId, VisitorKind } from './types.ts'

/**
 * The powers with a claim on the Verge, and the people who fell off their
 * books. Three of them can be flown as a flag; the Unlisted are a filing
 * status rather than a patron, so you can only ever stand well or badly with
 * them.
 */
export interface FactionDef {
  id: FactionId
  /** How the station's own paperwork refers to them. */
  name: string
  short: string
  glyph: string
  /** Room-accent hue, so the interface can colour a hull by who sent it. */
  hue: number
  claim: string
  /** What flying their flag is worth. */
  offer: string
  /** What resigning it costs. Empty when there is no resigning. */
  exit: string
  /** Whether a station can declare for them at all. */
  patronable: boolean
}

export const FACTION_DEFS: Record<FactionId, FactionDef> = {
  registry: {
    id: 'registry',
    name: 'The Terran Registry',
    short: 'Registry',
    glyph: '§',
    hue: 42,
    claim: 'Precedent. Earth chartered the first survey out here and never stopped filing.',
    offer: 'Applicants dispatched on their tab, contracts on a schedule, and a serial other powers still grudgingly honour.',
    exit: 'They cancel the serial. You keep the station and lose the only paper that said it was yours.',
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
 * always Registry paper; a raider is never anything but Unlisted. The rest is
 * weighted, because the point of the dock is that you cannot be sure.
 */
const OWNERS: Record<VisitorKind, [FactionId, number][]> = {
  trader: [
    ['concern', 45],
    ['unlisted', 30],
    ['registry', 15],
    ['compact', 10],
  ],
  courier: [
    ['registry', 65],
    ['concern', 25],
    ['compact', 10],
  ],
  patrol: [
    ['registry', 40],
    ['concern', 35],
    ['compact', 25],
  ],
  drifter: [
    ['unlisted', 75],
    ['registry', 25],
  ],
  smuggler: [['unlisted', 100]],
  raider: [['unlisted', 100]],
}

export const rollOwner = (kind: VisitorKind): FactionId => {
  const table = OWNERS[kind]
  const total = table.reduce((n, [, w]) => n + w, 0)
  let roll = Math.random() * total
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
