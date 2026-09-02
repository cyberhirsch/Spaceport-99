import { effectiveness, uid } from './crew.ts'
import { STAT_INFO, STAT_KEYS } from './types.ts'
import type {
  Crew,
  Mission,
  MissionKind,
  MissionOutcome,
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

const HULL_NAMES = [
  'Kestrel', 'Long Odds', 'Patient Wolf', 'Cold Start', 'Bright Anomaly', 'Sundog',
  'Tin Halo', 'Second Wind', 'Quiet Margin', 'Salt and Iron', 'Backscatter', 'Slow Tuesday',
  'Half Measure', 'Ninth Life', 'Loose Change', 'Dead Reckoning',
]

export const makeShip = (cls: ShipClass, name?: string): Ship => {
  const hull = Math.round(shipDef(cls).hull)
  return {
    id: uid('s'),
    name: name ?? HULL_NAMES[Math.floor(Math.random() * HULL_NAMES.length)],
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

/** Rolls a contract sized to what the station can plausibly take on. */
export const makeMission = (standing: number): Mission => {
  const kinds = Object.keys(MISSION_KINDS) as MissionKind[]
  const kind = kinds[Math.floor(Math.random() * kinds.length)]
  const d = missionDef(kind)
  // A better-run station gets offered better, nastier work.
  const danger = Math.min(1, Math.max(0.1, standing * 0.8 + Math.random() * 0.35 - 0.1))
  const seconds = Math.round(90 + danger * 240)
  const scale = 90 + danger * 420
  return {
    id: uid('m'),
    name: `${d.label} — ${PLACES[Math.floor(Math.random() * PLACES.length)]}`,
    kind,
    danger,
    stat: d.stat,
    seconds,
    remaining: seconds,
    expiresIn: 180 + Math.random() * 120,
    status: 'offered',
    shipId: null,
    crewIds: [],
    payout: {
      credits: Math.round(scale * d.pays.credits),
      power: Math.round(scale * d.pays.power * 0.5),
      air: Math.round(scale * d.pays.air * 0.5),
      food: Math.round(scale * d.pays.food * 0.5),
    },
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

export const rollOutcome = (crew: Crew[], m: Mission, ship: Ship | null): MissionOutcome => {
  const margin = teamScore(crew, m, ship) - missionTarget(m)
  const roll = margin + (Math.random() * 20 - 10)
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
