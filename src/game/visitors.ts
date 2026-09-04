import { randomName, rollStats, uid } from './crew.ts'
import { rollOwner } from './factions.ts'
import { pickHullName } from './hulls.ts'
import type { Guest, Rng, ShipClass, Visitor, VisitorKind, VisitorOffer } from './types.ts'

/** How many units a single trade moves. */
export const TRADE_LOT = 50
/** What a visitor will pay for your surplus, against what they charge for theirs. */
export const SELL_MARGIN = 0.55

interface VisitorDef {
  kind: VisitorKind
  label: string
  /** What the hail says they want. */
  hail: string
  /** True when clearing them to dock is a mistake. */
  trouble: boolean
  /** How often this shows up, relative to the others. */
  weight: number
}

export const VISITOR_DEFS: Record<VisitorKind, VisitorDef> = {
  trader: {
    kind: 'trader',
    label: 'Trader',
    hail: 'Independent hauler with cargo to shift and no particular hurry.',
    trouble: false,
    weight: 34,
  },
  courier: {
    kind: 'courier',
    label: 'Courier',
    hail: 'Courier on a schedule, carrying paper for whoever runs this place.',
    trouble: false,
    weight: 20,
  },
  patrol: {
    kind: 'patrol',
    label: 'Patrol',
    hail: 'Lane patrol asking for a berth and a cup of something hot.',
    trouble: false,
    weight: 16,
  },
  drifter: {
    kind: 'drifter',
    label: 'Distress',
    hail: 'Running on reserves and asking for air, food, and somewhere to sit down.',
    trouble: false,
    weight: 16,
  },
  smuggler: {
    kind: 'smuggler',
    label: 'Smuggler',
    hail: 'Cargo manifest is short a page and the master will not say why.',
    trouble: true,
    weight: 8,
  },
  raider: {
    kind: 'raider',
    label: 'Raider',
    hail: 'Hull scarred, transponder borrowed, and far too many people aboard.',
    trouble: true,
    weight: 6,
  },
}

export const visitorDef = (kind: VisitorKind): VisitorDef => VISITOR_DEFS[kind]


const HULLS: ShipClass[] = ['shuttle', 'hauler', 'scout', 'cutter']

/** How the scan reads, in words rather than a number. */
export const scanReading = (suspicion: number): string => {
  if (suspicion < 0.25) return 'Manifest checks out'
  if (suspicion < 0.5) return 'Manifest is thin but plausible'
  if (suspicion < 0.75) return 'Transponder does not match the hull'
  return 'Will not answer hails'
}

/** Conversations a berthed ship might want to have. */
const DIALOGUES: VisitorOffer[] = [
  {
    kind: 'dialogue',
    title: 'A passenger who would rather stay',
    prompt:
      'Their passenger has been eyeing your decks since the clamps closed. Says they can work, and that they are done travelling.',
    yes: 'Find them a bunk',
    no: 'Not this trip',
    effect: { type: 'passenger' },
  },
  {
    kind: 'dialogue',
    title: 'A hull going cheap',
    prompt:
      'They are selling a hull below the yard price and would rather you did not ask which yard.',
    yes: 'Buy it',
    no: 'Pass',
    effect: { type: 'cheapShip', cls: 'shuttle', price: 190 },
  },
  {
    kind: 'dialogue',
    title: 'An inspection that need not happen',
    prompt:
      'Two crates on the manifest do not match the hold. They would consider it a kindness if the paperwork stayed simple.',
    yes: 'Look the other way',
    no: 'Log it properly',
    effect: { type: 'credits', amount: 240, standing: -0.04 },
  },
  {
    kind: 'dialogue',
    title: 'Their engineer is bored',
    prompt:
      'Their engineer has been listening to your station hum and says she can hear something you cannot. Offers an afternoon of her time.',
    yes: 'Let her work',
    no: 'We manage',
    effect: { type: 'repair' },
  },
  {
    kind: 'dialogue',
    title: 'A lead worth flying',
    prompt:
      'The master says she passed something out past the shipping lane that nobody has stripped yet. She will sell you the coordinates.',
    yes: 'Buy the coordinates',
    no: 'Everybody has a story',
    effect: { type: 'leadMission' },
  },
]

const MISSION_HANDOFF: VisitorOffer = {
  kind: 'mission',
  title: 'Paper for the commander',
  prompt: 'A contract, sealed, addressed to whoever is running this station.',
}

/**
 * Who you actually meet when a hull comes alongside. `grip` is how tightly they are
 * bound to the hull they came in on: a passenger is already looking for a way
 * off, a ship's master has to be prised loose, and only a station worth moving
 * to will manage it. `points` is the stat budget they were built with, which is
 * also the reason you would want them.
 */
interface RoleDef {
  label: string
  grip: number
  points: number
  captain?: boolean
}

const CREW_ROLES: Record<VisitorKind, RoleDef[]> = {
  trader: [
    { label: 'ship’s master', grip: 1, points: 16, captain: true },
    { label: 'supercargo', grip: 0.55, points: 11 },
    { label: 'deckhand', grip: 0.3, points: 7 },
    { label: 'cook', grip: 0.25, points: 6 },
  ],
  courier: [
    { label: 'courier', grip: 1, points: 14, captain: true },
    { label: 'pilot', grip: 0.6, points: 12 },
    { label: 'signals clerk', grip: 0.4, points: 9 },
  ],
  patrol: [
    { label: 'lane officer', grip: 1, points: 17, captain: true },
    { label: 'rating', grip: 0.45, points: 9 },
    { label: 'flight surgeon', grip: 0.6, points: 13 },
  ],
  drifter: [
    { label: 'ship’s master', grip: 0.85, points: 12, captain: true },
    { label: 'passenger', grip: 0.1, points: 6 },
    { label: 'engineer', grip: 0.4, points: 11 },
    { label: 'deckhand', grip: 0.25, points: 7 },
  ],
  smuggler: [
    { label: 'ship’s master', grip: 1, points: 15, captain: true },
    { label: 'deckhand', grip: 0.3, points: 8 },
    { label: 'quartermaster', grip: 0.6, points: 12 },
  ],
  raider: [
    { label: 'boarding officer', grip: 1, points: 16, captain: true },
    { label: 'gunner', grip: 0.5, points: 11 },
    { label: 'deckhand', grip: 0.3, points: 8 },
  ],
}

/**
 * The party that comes aboard off a berthed hull. Small ships send one or two
 * people; the business the ship was carrying is now something a person says to
 * your face.
 */
export const makeGuests = (rng: Rng, v: Visitor, deal: () => number): Guest[] => {
  const roles = [...CREW_ROLES[v.kind]]
  const count = 1 + Math.floor(rng() * 3)
  const out: Guest[] = []
  for (let i = 0; i < count; i += 1) {
    const role = roles.splice(Math.floor(rng() * roles.length), 1)[0] ?? {
      label: 'deckhand',
      grip: 0.3,
      points: 7,
    }
    const tier = Math.min(1, Math.max(0.15, role.points / 18))
    out.push({
      id: uid('g'),
      name: randomName(rng),
      role: role.label,
      captain: Boolean(role.captain),
      grip: role.grip,
      stats: rollStats(rng, role.points),
      tier,
      // Someone with a berth already has less reason to listen than someone HQ
      // sent looking for one.
      interest: Math.round(Math.max(2, 55 - role.grip * 52)),
      askingBonus: Math.round(60 + role.points * 22 + role.grip * 120),
      promised: null,
      portrait: deal(),
      seed: Math.floor(rng() * 1e9),
      offer: null,
    })
  }
  // Whatever the ship wanted to raise, one of them is the one who raises it.
  if (v.offer && out.length > 0) out[Math.floor(rng() * out.length)].offer = v.offer
  return out
}

/** Rolls a ship at the clamps. Trouble usually scans dirty — usually. */
/**
 * A hull on the board. `taken` is every name already in play, so the same
 * ship never arrives twice while the first one is still at the clamps.
 */
export const makeVisitor = (rng: Rng, taken: Iterable<string> = []): Visitor => {
  const pool = Object.values(VISITOR_DEFS)
  const total = pool.reduce((n, d) => n + d.weight, 0)
  let roll = rng() * total
  let def = pool[0]
  for (const d of pool) {
    roll -= d.weight
    if (roll <= 0) {
      def = d
      break
    }
  }

  // Honest ships mostly scan clean; trouble mostly scans dirty. The overlap in
  // the middle is the whole point — a clean reading is not a guarantee.
  const suspicion = def.trouble
    ? Math.min(1, 0.35 + rng() * 0.65)
    : Math.min(1, rng() * 0.6)

  // Trouble hides behind an honest-looking hail.
  const claim: VisitorKind = def.trouble
    ? (['trader', 'courier', 'patrol'] as VisitorKind[])[Math.floor(rng() * 3)]
    : def.kind

  // Roughly half of honest ships want to raise something once berthed.
  let offer: VisitorOffer | null = null
  if (!def.trouble) {
    const roll = rng()
    if (def.kind === 'courier' || roll < 0.2) offer = { ...MISSION_HANDOFF }
    else if (roll < 0.55) offer = { ...DIALOGUES[Math.floor(rng() * DIALOGUES.length)] }
  }

  const scarcity = 0.8 + rng() * 0.9
  return {
    id: uid('v'),
    name: pickHullName(rng, taken),
    cls: HULLS[Math.floor(rng() * HULLS.length)],
    kind: def.kind,
    claim,
    faction: rollOwner(rng, def.kind),
    suspicion,
    // Traffic shows on the board well before anyone hails for a berth.
    status: 'inbound',
    aboard: [],
    timer: 40 + rng() * 60,
    fee: 0.4 + rng() * 0.8,
    prices: {
      power: Math.round(1.4 * scarcity * 10) / 10,
      air: Math.round(1.7 * scarcity * 10) / 10,
      food: Math.round(1.6 * scarcity * 10) / 10,
    },
    offer,
  }
}
