import { effectiveness, uid } from './crew.ts'
import { pickHullName } from './hulls.ts'
import { STAT_INFO, STAT_KEYS } from './types.ts'
import type {
  Crew,
  FactionId,
  Mission,
  MissionKind,
  MissionShape,
  MissionOutcome,
  Rng,
  Ship,
  ShipClass,
  ShipDef,
  StatKey,
} from './types.ts'

// ------------------------------------------------------------------ hulls --

export const SHIP_DEFS: Record<ShipClass, ShipDef> = {
  shuttle: {
    cls: 'shuttle',
    name: 'Shuttle',
    blurb: 'Unremarkable, reliable, and already paid for. Every station has one.',
    glyph: '▸',
    hull: 60,
    speed: 1,
    cargo: 1,
    teeth: 0,
    price: 420,
  },
  scout: {
    cls: 'scout',
    name: 'Scout',
    blurb: 'Fast and thin-skinned. Gets there first and should not linger.',
    glyph: '➤',
    hull: 45,
    speed: 1.6,
    cargo: 0.7,
    teeth: 1,
    price: 700,
  },
  hauler: {
    cls: 'hauler',
    name: 'Hauler',
    blurb: 'A flying cargo bay with engines bolted on. Slow, but it brings it all back.',
    glyph: '▄',
    hull: 95,
    speed: 0.75,
    cargo: 2.1,
    teeth: 0,
    price: 900,
  },
  cutter: {
    cls: 'cutter',
    name: 'Cutter',
    blurb: 'Armed, armoured, and the only thing here that can take a boarding party.',
    glyph: '◤',
    hull: 120,
    speed: 1.1,
    cargo: 1.1,
    teeth: 5,
    price: 1400,
  },
}

export const shipDef = (cls: ShipClass): ShipDef => SHIP_DEFS[cls]

/** A refit raises everything a little; the class still decides the character. */
export const shipHull = (s: Ship): number =>
  Math.round(shipDef(s.cls).hull * (1 + (s.level - 1) * 0.35))
export const shipSpeed = (s: Ship): number => shipDef(s.cls).speed * (1 + (s.level - 1) * 0.15)
export const shipCargo = (s: Ship): number => shipDef(s.cls).cargo * (1 + (s.level - 1) * 0.25)
export const shipTeeth = (s: Ship): number => shipDef(s.cls).teeth * s.level

export const refitCost = (s: Ship): number => Math.round(shipDef(s.cls).price * 0.6 * s.level)
/** What HQ will pay to take a hull off your hands. */
export const tradeInValue = (s: Ship): number =>
  Math.round(shipDef(s.cls).price * 0.4 * (1 + (s.level - 1) * 0.3) * (s.hull / shipHull(s)))


export const makeShip = (
  rng: Rng,
  cls: ShipClass,
  name?: string,
  taken: Iterable<string> = [],
): Ship => {
  const hull = Math.round(shipDef(cls).hull)
  return {
    id: uid('s'),
    name: name ?? pickHullName(rng, taken),
    cls,
    hull,
    maxHull: hull,
    level: 1,
    missionId: null,
  }
}

// --------------------------------------------------------------- contracts --

interface KindDef {
  kind: MissionKind
  label: string
  stat: StatKey
  blurb: string
  /** Weighting of the payout across credits and the three resources. */
  pays: { credits: number; power: number; air: number; food: number }
}

export const MISSION_KINDS: Record<MissionKind, KindDef> = {
  salvage: {
    kind: 'salvage',
    label: 'Salvage run',
    stat: 'T',
    blurb: 'A dead hull on a slow tumble. Strip what is worth stripping.',
    pays: { credits: 1, power: 0.6, air: 0.2, food: 0.2 },
  },
  survey: {
    kind: 'survey',
    label: 'Survey sweep',
    stat: 'I',
    blurb: 'Chart a rock nobody has bothered with. HQ pays for the data.',
    pays: { credits: 1.2, power: 0.2, air: 0.4, food: 0.2 },
  },
  rescue: {
    kind: 'rescue',
    label: 'Rescue call',
    stat: 'O',
    blurb: 'A distress beacon, still transmitting. Somebody is having a worse day.',
    pays: { credits: 0.7, power: 0.2, air: 0.6, food: 0.5 },
  },
  patrol: {
    kind: 'patrol',
    label: 'Escort patrol',
    stat: 'R',
    blurb: 'Ride shotgun on a freight lane that has been losing freighters.',
    pays: { credits: 1.4, power: 0.1, air: 0.1, food: 0.1 },
  },
  tow: {
    kind: 'tow',
    label: 'Recovery tow',
    stat: 'B',
    blurb: 'Something big is adrift and someone wants it somewhere else.',
    pays: { credits: 1, power: 0.4, air: 0.2, food: 0.7 },
  },
}

export const missionDef = (kind: MissionKind): KindDef => MISSION_KINDS[kind]

const PLACES = [
  'the Ossuary Drift', 'Tannhauser Shoal', 'the Verge', 'Cold Harbour', 'the Pale Reach',
  'Mendel Station', 'the Scrapline', 'Kessler Deep', 'Barrow Point', 'the Long Dark',
]

/**
 * Where far work goes. Nothing here has a berth, a beacon or a name anybody
 * agrees on — they are bearings that somebody wrote down once.
 */
const FAR_PLACES = [
  'the Sable Gap', 'Bearing 4-1-9', 'the Quiet Shelf', 'Halloran Deep',
  'the Unlit Chain', 'Nine Bells', 'the Coldest Bearing', 'Marrow Reach',
  'the Silent Fifty', 'past the last beacon',
]

/** Which shapes each kind of work naturally comes in. */
const SHAPES: Record<MissionKind, MissionShape[]> = {
  // A dead hull can be stripped for as long as you dare stay alongside it.
  salvage: ['contract', 'open', 'open', 'unfolding'],
  // Charting is open-ended by nature; you stop when you stop.
  survey: ['open', 'open', 'contract', 'unfolding'],
  // Somebody is either brought back or not. It is never a standing job.
  rescue: ['unfolding', 'unfolding', 'contract'],
  // A lane is patrolled until you call the ship home.
  patrol: ['open', 'open', 'contract'],
  // A tow is a fixed job with a hull on the end of it.
  tow: ['contract', 'contract', 'unfolding'],
}

/** How long an open job waits between hails, and how fast its strain climbs. */
export const OPEN_HAUL_PER_MINUTE = 0.55
export const OPEN_STRAIN_PER_MINUTE = 0.4

export interface MissionOpts {
  /** Force a shape, for obligations and questline work. */
  shape?: MissionShape
  /** A power's standing this job pays, or costs to refuse. */
  standing?: [FactionId, number]
  obligation?: boolean
  name?: string
  /** Offer work past the comms envelope, which only Deep Space Ops unlocks. */
  far?: boolean
  /** Name a lost hull and the contract becomes a run out to look at it. */
  bearing?: string
}

export const makeMission = (rng: Rng, standing: number, opts: MissionOpts = {}): Mission => {
  const kinds = Object.keys(MISSION_KINDS) as MissionKind[]
  const kind = kinds[Math.floor(rng() * kinds.length)]
  const d = missionDef(kind)
  const pool = SHAPES[kind]
  const shape = opts.shape ?? pool[Math.floor(rng() * pool.length)]
  // A better-run station gets offered better, nastier work.
  const danger = Math.min(1, Math.max(0.1, standing * 0.8 + rng() * 0.35 - 0.1))
  // An open job has no clock of its own; `seconds` is only its trip home.
  // Far work is a different order of job: weeks out instead of hours, paid to
  // match, and out of reach the whole time.
  const far = Boolean(opts.far)
  const trip = far ? 3.2 : 1
  const seconds = Math.round(
    (shape === 'open' ? 40 + danger * 60 : 90 + danger * 240) * trip,
  )
  const scale = (90 + danger * 420) * (far ? 3.4 : 1)
  return {
    id: uid('m'),
    name:
      opts.name ??
      `${far ? 'Far ' : ''}${d.label} — ${(far ? FAR_PLACES : PLACES)[Math.floor(rng() * (far ? FAR_PLACES : PLACES).length)]}`,
    kind,
    shape,
    danger,
    stat: d.stat,
    seconds,
    remaining: seconds,
    expiresIn: 180 + rng() * 120,
    status: 'offered',
    shipId: null,
    crewIds: [],
    payout: {
      credits: Math.round(scale * d.pays.credits),
      power: Math.round(scale * d.pays.power * 0.5),
      air: Math.round(scale * d.pays.air * 0.5),
      food: Math.round(scale * d.pays.food * 0.5),
    },
    // An open job starts with nothing gathered. Everything else is paid on the
    // strength of the work, not the length of it.
    haul: shape === 'open' ? 0 : 1,
    strain: 0,
    aloft: 0,
    recalled: false,
    odds: 0,
    choices: [],
    call: null,
    nextCall: shape === 'unfolding' ? Math.round(seconds * (0.25 + rng() * 0.2)) : 0,
    standing: opts.standing ?? null,
    obligation: Boolean(opts.obligation),
    far,
    bearing: opts.bearing,
    outcome: null,
    report: null,
    find: null,
  }
}

/** Crew slots on a mission, and the score the away team needs to clear it. */
export const teamSize = (m: Mission): number => (m.danger > 0.6 ? 3 : 2)
export const missionTarget = (m: Mission): number => 4 + m.danger * 16

/** What the away team and their ship bring to the job. */
export const teamScore = (crew: Crew[], m: Mission, ship: Ship | null): number => {
  let score = crew.reduce((sum, c) => sum + effectiveness(c, m.stat), 0)
  if (ship) score += shipTeeth(ship) + (ship.hull / shipHull(ship)) * 3
  return score
}

/** Rough odds of at least a clean success, for the launch screen. */
export const successOdds = (crew: Crew[], m: Mission, ship: Ship | null): number => {
  const margin = teamScore(crew, m, ship) - missionTarget(m)
  return Math.round(Math.min(0.97, Math.max(0.05, 0.5 + margin * 0.06)) * 100)
}

export const rollOutcome = (
  rng: Rng,
  crew: Crew[],
  m: Mission,
  ship: Ship | null,
): MissionOutcome => {
  // Choices already made shift the margin, and an open job that stayed out too
  // long is carrying its own weight into the roll.
  const margin =
    teamScore(crew, m, ship) - missionTarget(m) + m.odds * 30 - Math.max(0, m.strain - 1) * 9
  const roll = margin + (rng() * 20 - 10)
  if (roll > 12) return 'triumph'
  if (roll > 0) return 'success'
  if (roll > -12) return 'setback'
  return 'disaster'
}

export const OUTCOME_INFO: Record<MissionOutcome, { label: string; tone: 'good' | 'warn' | 'bad' }> = {
  triumph: { label: 'Exceptional', tone: 'good' },
  success: { label: 'Successful', tone: 'good' },
  setback: { label: 'Setback', tone: 'warn' },
  disaster: { label: 'Disaster', tone: 'bad' },
}

export const statLabel = (k: StatKey): string => `${k} · ${STAT_INFO[k].name}`
export const allStats = STAT_KEYS
