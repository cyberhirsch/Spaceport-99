/** Core data model for Spaceport-99. */

import type { Talk } from './talk.ts'

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
  | 'covertops'
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
  | 'brig'
  | 'reclaimer'
  | 'sensor'
  | 'market'
  | 'dso'

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
  /**
   * How much more of its own resource the station can bank because this room
   * exists. A reactor buys capacitor space, an air plant buys tankage. Only
   * meaningful on a room that produces something.
   */
  storageBonus?: number
  /** Racking for kit, in items. The Cargo Hold is the only room with any. */
  holdBonus?: number
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
  /** Holding cells per segment per level, for the brig. */
  cells?: number
  /** Fraction cut off what the crew burn, per segment per level. */
  recycles?: number
  /** How much of the scan's uncertainty this resolves, per segment per level. */
  sensors?: number
  /** Bonded cargo lots the station may hold, per segment per level. */
  lots?: number
  /**
   * Pull on passing traffic and the margin you trade at, per segment per level.
   * The Trading Hub is the only room with any.
   */
  commerce?: number
  /** Reach for far contracts, per segment per level. Deep Space Operations only. */
  reach?: number
  /**
   * How much of a quiet arrangement this room can keep quiet, per segment per
   * level. Covert Ops only. It never reaches certainty.
   */
  discretion?: number
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

export type ItemId = 'sidearm' | 'lance' | 'torch' | 'plate'

/** Things that have to be found and worked out before they exist for you. */
export type SpecId = 'shield' | 'vault' | 'torch' | 'astro' | 'filter'

/** The powers whose space the traffic comes from, plus everyone off their books. */
export type FactionId = 'terran' | 'concern' | 'compact' | 'unlisted'

/**
 * What a power asks for when it would rather deal with you than take you.
 *
 * Every one of them is something you could refuse without consequence and
 * accept without anybody finding out — which is the whole trouble with them.
 */
export type CovertAsk =
  /** Move something through the station without it appearing on a manifest. */
  | 'cargo'
  /** Say who has been alongside lately, and what they were carrying. */
  | 'names'
  /** Have nobody watching the clamps for an hour. */
  | 'window'
  /** Go on talking to the power whose flag you no longer fly. */
  | 'turn'

/** One power's quiet approach, carried by a hull that is not obviously theirs. */
export interface CovertOffer {
  from: FactionId
  ask: CovertAsk
  /** Credits on the table. */
  pays: number
}

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
 * Somebody in the cells. They arrived off a hull you would not clear, or out of
 * a boarding action that went your way, and they are now a decision rather than
 * a number: hand them over, let them go, or talk to them.
 */
export interface Prisoner {
  id: string
  name: string
  /** Whose paper they were flying when you took them. */
  faction: FactionId
  /** What they were taken for, in words. */
  charge: string
  /** The hull they came off, for the record. */
  hull: string
  stats: Stats
  seed: number
  portrait?: number
  /** Seconds they have been aboard. Long stays are noticed. */
  held: number
}

/**
 * A lot of cargo the station bought to sell on rather than to use. It is not
 * yours until somebody pays for it, which is the whole risk.
 */
export interface BondedLot {
  id: string
  resource: ResourceKey
  units: number
  /** What it cost, so the readout can show whether you are up or down. */
  paid: number
  /** Who sold it to you. */
  from: FactionId
}

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
  /** Seed, so what they want is fixed without being stored. */
  seed: number
  /** Room they were promised, honoured when they sign. */
  promised: string | null
  /** Attachment to a ship they would have to leave. Absent for HQ applicants. */
  grip?: number
  /** True for a ship's master. They want different things. */
  captain?: boolean
}

export interface Visitor {
  id: string
  /** Ship name on the transponder. */
  name: string
  cls: ShipClass
  /** The truth, revealed only once they are alongside. */
  kind: VisitorKind
  /** What they say they are. Honest ships tell the truth. */
  claim: VisitorKind
  /** 0..1 scan reading. Trouble usually scans dirty, but not always. */
  suspicion: number
  /** Whose paper the hull is flying. Raiders are always Unlisted. */
  faction: FactionId
  /**
   * On approach, hailing for a berth, clamped on — or standing off, which is a
   * hull that has arrived, not asked for anything, and not left either.
   */
  status: 'inbound' | 'requesting' | 'holding' | 'docked'
  /**
   * Why they are here, when it is not trade.
   *
   * `conquest` is alongside by the time you read the hail. The other three are
   * one escalation: a hull `loiter`s two kilometres out, and if nothing is done
   * about it, it `demand`s, and if that is refused it comes in as a `raid`.
   * Every raid is therefore something you watched arrive.
   */
  intent?: 'conquest' | 'loiter' | 'demand' | 'raid'
  /** What a hull with an intent brought with it, against the station's guns. */
  force?: number
  /**
   * What they will take to be somewhere else, fixed when they arrive. Quoted
   * rather than recomputed: a price that drifts while you read it is not a
   * price, and this one is quoted twice on the same screen.
   */
  asking?: number
  /** The prisoner this hull has come to collect, if that is why it is here. */
  claiming?: string
  /**
   * A quiet word somebody asked them to have with you. The hull carrying it is
   * rarely flying the paper of the power that sent it — that is the point.
   */
  covert?: CovertOffer
  /** Who came aboard off this hull. Empty until she is cleared to dock. */
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
  kind: 'survivor' | 'ship' | 'cache' | 'spec'
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
  /**
   * Work past the comms envelope. It pays far better and takes far longer, and
   * nobody at the station can reach the team while they are out there — so
   * every hail on the way is answered by the crew, not by you.
   */
  far: boolean
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

/**
 * A source of luck. Everything that rolls takes one of these rather than
 * reaching for Math.random(), so a roll can be replayed.
 */
export type Rng = () => number

export interface GameState {
  version: number
  /**
   * The station's luck, as a number you can save. Every roll advances it, so
   * reloading cannot reroll a death and the reducer answers the same twice.
   */
  rng: number
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
  /**
   * Specs recovered so far, and how far the Research Lab has got with each. A key
   * only exists once a fragment has been found; 1 means it is worked out.
   */
  specs: Partial<Record<SpecId, number>>
  /** The spec the Research Lab is currently working on, if any. */
  researching: SpecId | null
  /** What the Fab Shop is running off, and how far through it is. */
  fabricating: { item: ItemId; progress: number } | null
  /**
   * The conversation on screen, if any. Only the pointer is kept — which
   * script, which line, and what has been established — because the scripts
   * themselves live in code and would not survive a round trip through JSON.
   */
  talk: Talk | null
  /** People in the cells, and how they got there. */
  prisoners: Prisoner[]
  /** Cargo bought to sell on, sitting in the bonded cage. */
  bonded: BondedLot[]
  /** Seconds until somebody might come for the station. */
  nextTakeoverIn: number
  /** Ids of crew that arrived but have not been greeted yet (for the toast). */
  /**
   * What each power thinks of the station off the record — the arrangements
   * nobody has filed. Kept apart from `standing` on purpose: a station can be
   * a model Confederation post on paper and be answering three other people's
   * questions at night.
   */
  covert: Record<FactionId, number>
  /** Seconds until somebody tries a quiet word. */
  nextApproachIn: number
  /** Seconds until a hull turns up and does not ask for anything. */
  nextLoiterIn: number
  /**
   * Seconds until whoever took the station makes their first demand of it. Set
   * only when the flag changes by force; zero the rest of the time.
   */
  nextLevyIn: number
  /** How long a prisoner may sit before their people come asking. */
  nextClaimIn: number
  /** How many arrangements have come out. Nobody forgets the second one. */
  burned: number
  seenIntro: boolean
  gameOver: boolean
}
