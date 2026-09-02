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
  | 'battery'
  | 'shield'
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
  /** Restores structural condition station-wide, per second per segment-level. */
  repairs?: number
  /** Applicant berths per segment per level, for the docking port. */
  berths?: number
  /** Ship berths per segment per level, for the hangar bay. */
  ships?: number
  /** Concurrent missions per segment per level, for the command module. */
  missions?: number
  /** Firepower per segment per level, for the defence battery. */
  guns?: number
  /** Damage absorbed per segment per level, for the shield projector. */
  shield?: number
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
  /** Powered down to standby: no output, a tenth of the draw. */
  standby?: boolean
  /** Docking ports only: wave arrivals in without asking the commander. */
  autoAccept?: boolean
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
  /** Portrait dealt to them, 1..PORTRAIT_COUNT. Absent on pre-portrait saves. */
  portrait?: number
  /** What they are carrying. Drawn from the hold, one item per slot. */
  gear: Partial<Record<ItemSlot, ItemId>>
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
  /** Portrait dealt to them, held from the interview through to signing on. */
  portrait?: number
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

// --------------------------------------------------------------- visitors --

/** What a ship at the clamps actually is, which is not always what it claims. */
export type VisitorKind = 'trader' | 'courier' | 'patrol' | 'drifter' | 'smuggler' | 'raider'

/** Kit a crew member can be issued: one weapon, one layer of protection. */
export type ItemSlot = 'sidearm' | 'armour'

export type ItemId = 'cutter' | 'sidearm' | 'lance' | 'vest' | 'plate' | 'carapace'

/** The powers with a claim on the Verge, plus everyone off their books. */
export type FactionId = 'terran' | 'concern' | 'compact' | 'unlisted'

/** Something a docked ship wants to talk about. Marked with an exclamation. */
export interface VisitorOffer {
  /** A contract they hand over, or a conversation with two ways to answer. */
  kind: 'mission' | 'dialogue'
  title: string
  prompt: string
  /** Dialogue only: the two answers and what each does. */
  yes?: string
  no?: string
  effect?: DialogueEffect
}

export type DialogueEffect =
  | { type: 'credits'; amount: number; standing?: number }
  | { type: 'passenger' }
  | { type: 'cheapShip'; cls: ShipClass; price: number }
  | { type: 'repair' }
  | { type: 'leadMission' }

/**
 * Someone off a berthed ship, walking your decks while their hull is clamped.
 * Business gets raised by people, not by transponders.
 */
export interface Guest {
  id: string
  name: string
  /** Their job aboard the ship they came in on. */
  role: string
  /** True for the ship's master. Talk them round and the hull comes too. */
  captain: boolean
  /** How tightly they are bound to that hull, 0..1. A captain is 1. */
  grip: number
  stats: Stats
  /** 0..1 — how sought-after they are, which sets their standards. */
  tier: number
  /** 0..100. Cross their threshold and they will sign. */
  interest: number
  /** Credits they want up front to walk away from their berth. */
  askingBonus: number
  /** Tactics already spent on them. */
  used: Tactic[]
  /** Module they were promised, honoured when they sign. */
  promised: string | null
  /** Portrait dealt from the same pool the crew draws on. */
  portrait?: number
  seed: number
  /** What they want to talk to the commander about, if anything. */
  offer: VisitorOffer | null
}

/**
 * Anyone you are talking round: an applicant HQ sent, or someone off a hull at
 * your clamps. The tactics work the same on both; only what it takes differs.
 */
export interface Prospect {
  stats: Stats
  tier: number
  interest: number
  askingBonus: number
  used: Tactic[]
  /** Attachment to a ship they would have to leave. Absent for HQ applicants. */
  grip?: number
}

export interface Visitor {
  id: string
  /** Ship name on the transponder. */
  name: string
  cls: ShipClass
  /** The truth, revealed only once the clamps are open. */
  kind: VisitorKind
  /** What they say they are. Honest ships tell the truth. */
  claim: VisitorKind
  /** 0..1 scan reading. Trouble usually scans dirty, but not always. */
  suspicion: number
  /** Whose paper the hull is flying. Raiders are always Unlisted. */
  faction: FactionId
  /** On approach, hailing for a berth, or clamped on. */
  status: 'inbound' | 'requesting' | 'docked'
  /** Who came aboard off this hull. Empty until the clamps open. */
  aboard: Guest[]
  /** Seconds until they stop waiting, or until they undock. */
  timer: number
  /** Berthing fee they pay while docked, per second. */
  fee: number
  /** What they will sell a unit of each resource for while berthed. */
  prices: { power: number; air: number; food: number }
  /** Business they want to raise, if any. Cleared once it is dealt with. */
  offer: VisitorOffer | null
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

/**
 * A hail from the away team, mid-flight. Something happened that is not the
 * commander's to decide from here, except that it is.
 */
export interface MissionCall {
  text: string
  options: MissionChoice[]
}

export interface MissionChoice {
  label: string
  /** What the commander is actually agreeing to. */
  detail: string
  /** Shifts the odds of the final roll, up or down. */
  odds?: number
  /** Multiplies what the run brings home. */
  haul?: number
  /** Costs credits up front; the option is hidden if the station cannot pay. */
  cost?: number
  /** Adds to the strain the team is carrying. */
  strain?: number
  /** Moves a power's opinion of the station. */
  standing?: [FactionId, number]
  /** Line written into the after-action report. */
  note: string
}

/**
 * How a job is shaped, which is not the same as what it is.
 *
 * `contract` runs a fixed clock and settles on return. `open` has no end: it
 * accrues a haul and a strain for as long as the team stays out, and only a
 * recall brings them home. `unfolding` runs a clock but interrupts it — the
 * team hails, and somebody has to answer.
 */
export type MissionShape = 'contract' | 'open' | 'unfolding'

export interface Mission {
  id: string
  name: string
  kind: MissionKind
  shape: MissionShape
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
  /** `calling` is flying, paused on a hail nobody has answered yet. */
  status: 'offered' | 'flying' | 'calling' | 'report'
  shipId: string | null
  crewIds: string[]
  payout: { credits: number; power: number; air: number; food: number }
  /**
   * Open jobs only: what the team has gathered so far, as a multiplier on the
   * payout, and what it is costing them to keep gathering it.
   */
  haul: number
  strain: number
  /** Seconds the team has been out. Open jobs have no other clock. */
  aloft: number
  /** Open jobs only: the commander said come home, and they are on the way. */
  recalled: boolean
  /** Adjustment to the final roll from choices already made. */
  odds: number
  /** Lines the commander's answers wrote into the report. */
  choices: string[]
  /** The hail waiting on an answer, when status is `calling`. */
  call: MissionCall | null
  /** Seconds until the next hail on an unfolding job. */
  nextCall: number
  /** Standing the job pays, or costs if it is declined. */
  standing: [FactionId, number] | null
  /**
   * Handed to the station because of the flag it flies. There is no reward
   * beyond not being the kind of station that says no.
   */
  obligation: boolean
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
  /** Ships at the clamps: waiting on a decision, or berthed. */
  visitors: Visitor[]
  /** Seconds until the next ship hails for permission to dock. */
  nextVisitorIn: number
  /**
   * Goodwill with each power, earned or spent by how the station treats the
   * hulls that turn up. Folded into station appeal alongside the things a
   * visitor can see for themselves.
   */
  standing: Record<FactionId, number>
  /**
   * The flag the station flies. Null is no flag at all — nobody taxes you and
   * nobody comes when the Ossuary Kings do.
   */
  patron: FactionId | null
  /** Powers this station has already walked out on. They remember. */
  resigned: FactionId[]
  /** Kit in the hold, not yet issued to anybody. */
  stores: Partial<Record<ItemId, number>>
  /** Ids of crew that arrived but have not been greeted yet (for the toast). */
  seenIntro: boolean
  gameOver: boolean
}
