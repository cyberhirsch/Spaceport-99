/** Core data model for Spaceport-99. */

export const STAT_KEYS = ['O', 'R', 'B', 'I', 'T', 'A', 'L'] as const
export type StatKey = (typeof STAT_KEYS)[number]

export const STAT_INFO: Record<StatKey, { name: string; blurb: string }> = {
  O: { name: 'Operations', blurb: 'Running life support and keeping the schedule.' },
  R: { name: 'Reflex', blurb: 'Reaction speed in a firefight or a decompression.' },
  B: { name: 'Brawn', blurb: 'Hauling cargo, wrestling hydroponics, punching pirates.' },
  I: { name: 'Intellect', blurb: 'Medicine, chemistry, and reading the manual.' },
  T: { name: 'Tech', blurb: 'Reactors, fabricators and anything with a cooling fan.' },
  A: { name: 'Adaptability', blurb: 'Morale, diplomacy, and not losing it out here.' },
  L: { name: 'Luck', blurb: 'The difference between salvage and a hull breach.' },
}

export type Stats = Record<StatKey, number>

export type ResourceKey = 'power' | 'air' | 'food'

export const RESOURCE_INFO: Record<ResourceKey, { name: string; short: string; icon: string }> = {
  power: { name: 'Power', short: 'PWR', icon: '⚡' },
  air: { name: 'Oxygen', short: 'O₂', icon: '◌' },
  food: { name: 'Rations', short: 'RAT', icon: '▲' },
}

export type ModuleKind =
  | 'spine'
  | 'reactor'
  | 'atmospherics'
  | 'hydroponics'
  | 'quarters'
  | 'medbay'
  | 'fabricator'
  | 'comms'
  | 'dock'
  | 'hangar'
  | 'command'
  | 'storage'
  | 'gym'
  | 'range'
  | 'library'
  | 'workshop'
  | 'observatory'
  | 'lounge'
  | 'vault'

/** Static definition of a buildable module. */
export interface ModuleDef {
  kind: ModuleKind
  name: string
  /** One-word label for the station card, where space is tight. */
  short: string
  blurb: string
  glyph: string
  /** Hue used for the module's accent colour. */
  hue: number
  cost: number
  /** Minimum crew on the station before this unlocks in the build menu. */
  unlockAtCrew: number
  /** Staff slots per merged segment. */
  slotsPerSegment: number
  /** Crew stat that drives this module's output. */
  stat: StatKey
  /** Resource produced per production cycle, if any. */
  produces?: ResourceKey
  /** Base yield of `produces` at level 1 for a single fully staffed segment. */
  baseYield?: number
  /** Base seconds for one production cycle. */
  cycleSeconds?: number
  /** Power drawn each second while online (spine and storage draw nothing). */
  powerDraw: number
  /** Extra crew capacity granted per segment per level. */
  crewCapacity?: number
  /** Extra storage cap granted per segment per level, applied to every resource. */
  storageBonus?: number
  /** Stat this module trains for assigned crew, if it is a training module. */
  trains?: StatKey
  /** Credits produced per cycle instead of a resource. */
  credits?: number
  /** Heals assigned-deck crew; hp per second per level. */
  heals?: number
  /** Applicant berths per segment per level, for the docking port. */
  berths?: number
  /** Ship berths per segment per level, for the hangar bay. */
  ships?: number
  /** Concurrent missions per segment per level, for the command module. */
  missions?: number
}

/** A built (possibly merged) room occupying contiguous slots on one deck. */
export interface StationModule {
  id: string
  kind: ModuleKind
  deck: number
  /** Leftmost column index. */
  col: number
  /** How many slots wide (1-3). Merging same-kind, same-level neighbours grows this. */
  width: number
  level: number
  /** Crew ids currently assigned. */
  staff: string[]
  /** 0..1 progress through the current production cycle. */
  progress: number
  /** Structural condition, 0..1. Below 1 the module produces less. */
  condition: number
  /** Chance the next rush goes wrong, 0..1. Climbs per rush, decays over time. */
  rushRisk: number
}

export type CrewState = 'idle' | 'working' | 'training' | 'fighting' | 'dead'

export interface Crew {
  id: string
  name: string
  stats: Stats
  level: number
  xp: number
  hp: number
  maxHp: number
  morale: number
  /** Module id the crew member is assigned to, or null when idle in the spine. */
  assignment: string | null
  /** Post this crew member retreated from; they head back once patched up. */
  returnTo: string | null
  /** Seed for the procedural portrait. */
  seed: number
  dead: boolean
}

export type IncidentKind = 'fire' | 'breach' | 'pirates' | 'vermin'

export interface Incident {
  id: string
  kind: IncidentKind
  moduleId: string
  /** Remaining enemy health; crew whittle this down. */
  hp: number
  maxHp: number
  /** Seconds until the incident spreads to a neighbouring module. */
  spreadIn: number
  startedAt: number
}

export interface LogEntry {
  id: string
  at: number
  text: string
  tone: 'info' | 'good' | 'warn' | 'bad'
}

/** A tactic the player can use once per interview. */
export type Tactic = 'bonus' | 'pitch' | 'posting'

/**
 * Someone HQ has sent over, waiting at the docking port. They are not crew yet
 * and cost nothing until they sign.
 */
export interface Candidate {
  id: string
  name: string
  seed: number
  stats: Stats
  /** 0..1 — how sought-after they are. Drives their stats and their standards. */
  tier: number
  /** 0..100. Cross their threshold and they will sign. */
  interest: number
  /** Credits they want up front. */
  askingBonus: number
  /** Seconds left before they give up and undock. */
  patience: number
  /** Tactics already spent on them. */
  used: Tactic[]
  /** Module they were promised, honoured when they sign. */
  promised: string | null
  /** Seconds until they finish transit and appear at the dock. */
  arrivesIn: number
}

// ------------------------------------------------------------------ fleet --

export type ShipClass = 'shuttle' | 'hauler' | 'scout' | 'cutter'

export interface ShipDef {
  cls: ShipClass
  name: string
  blurb: string
  glyph: string
  hull: number
  /** Multiplier on mission duration — above 1 is faster. */
  speed: number
  /** Multiplier on what the ship can bring home. */
  cargo: number
  /** Added to the away team's score. A cutter can handle itself. */
  teeth: number
  /** Price from HQ. Building one in the Fabricator costs less but takes time. */
  price: number
}

export interface Ship {
  id: string
  name: string
  cls: ShipClass
  hull: number
  maxHull: number
  /** Refits raise hull, speed and cargo. */
  level: number
  /** Mission it is flying, or null when berthed. */
  missionId: string | null
}

export type MissionKind = 'salvage' | 'survey' | 'rescue' | 'patrol' | 'tow'

export type MissionOutcome = 'triumph' | 'success' | 'setback' | 'disaster'

/** Something brought home that is not simply credits or cargo. */
export interface MissionFind {
  kind: 'survivor' | 'ship' | 'cache'
  detail: string
}

export interface Mission {
  id: string
  name: string
  kind: MissionKind
  /** 0..1. Drives the difficulty, the payout and how badly it can go. */
  danger: number
  /** The stat the away team is judged on. */
  stat: StatKey
  /** Seconds the round trip takes in an unmodified ship. */
  seconds: number
  /** Counts down once launched. */
  remaining: number
  /** Seconds before an unclaimed offer expires. */
  expiresIn: number
  status: 'offered' | 'flying' | 'report'
  shipId: string | null
  crewIds: string[]
  payout: { credits: number; power: number; air: number; food: number }
  outcome: MissionOutcome | null
  /** Written when the mission resolves, read in the after-action report. */
  report: string | null
  find: MissionFind | null
}

export interface Resources {
  power: number
  air: number
  food: number
}

export interface GameState {
  version: number
  /** Station name, editable by the player. */
  name: string
  credits: number
  resources: Resources
  modules: StationModule[]
  crew: Crew[]
  incidents: Incident[]
  log: LogEntry[]
  /** Decks unlocked so far (deck 0 is always unlocked). */
  decks: number
  /** Wall-clock ms of the last processed tick, used for offline progress. */
  lastTick: number
  /** Total seconds the station has been running. */
  elapsed: number
  /** Seconds until the next random incident roll. */
  nextIncidentIn: number
  /** Seconds until HQ will take another crew request. */
  broadcastCooldown: number
  /** People HQ has dispatched: in transit, or waiting at the dock. */
  candidates: Candidate[]
  /** Everything berthed in the hangars, or out on a job. */
  ships: Ship[]
  /** Contracts on offer, in flight, and awaiting an after-action report. */
  missions: Mission[]
  /** Seconds until the command module posts another contract. */
  nextContractIn: number
  /** Ids of crew that arrived but have not been greeted yet (for the toast). */
  seenIntro: boolean
  gameOver: boolean
}
