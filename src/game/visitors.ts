import { uid } from './crew.ts'
import type { ShipClass, Visitor, VisitorKind, VisitorOffer } from './types.ts'

/** How many units a single trade moves. */
export const TRADE_LOT = 50
/** What a visitor will pay for your surplus, against what they charge for theirs. */
export const SELL_MARGIN = 0.55

interface VisitorDef {
  kind: VisitorKind
  label: string
  /** What the hail says they want. */
  hail: string
  /** True when opening the clamps for them is a mistake. */
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

const HAILS = [
  'Cormorant', 'Blue Marlin', 'Ten of Cups', 'Ashgrove', 'Penny Dreadful', 'Sunken Bell',
  'Marigold', 'Iron Sparrow', 'Last Tuesday', 'Grey Vector', 'Wandering Albatross', 'Copper Kettle',
  'Nightjar', 'Bad Weather', 'Fair Warning', 'Old Habit',
]

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

/** Rolls a ship at the clamps. Trouble usually scans dirty — usually. */
export const makeVisitor = (): Visitor => {
  const pool = Object.values(VISITOR_DEFS)
  const total = pool.reduce((n, d) => n + d.weight, 0)
  let roll = Math.random() * total
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
    ? Math.min(1, 0.35 + Math.random() * 0.65)
    : Math.min(1, Math.random() * 0.6)

  // Trouble hides behind an honest-looking hail.
  const claim: VisitorKind = def.trouble
    ? (['trader', 'courier', 'patrol'] as VisitorKind[])[Math.floor(Math.random() * 3)]
    : def.kind

  // Roughly half of honest ships want to raise something once berthed.
  let offer: VisitorOffer | null = null
  if (!def.trouble) {
    const roll = Math.random()
    if (def.kind === 'courier' || roll < 0.2) offer = { ...MISSION_HANDOFF }
    else if (roll < 0.55) offer = { ...DIALOGUES[Math.floor(Math.random() * DIALOGUES.length)] }
  }

  const scarcity = 0.8 + Math.random() * 0.9
  return {
    id: uid('v'),
    name: HAILS[Math.floor(Math.random() * HAILS.length)],
    cls: HULLS[Math.floor(Math.random() * HULLS.length)],
    kind: def.kind,
    claim,
    suspicion,
    status: 'requesting',
    timer: 60 + Math.random() * 40,
    fee: 0.4 + Math.random() * 0.8,
    prices: {
      power: Math.round(1.4 * scarcity * 10) / 10,
      air: Math.round(1.7 * scarcity * 10) / 10,
      food: Math.round(1.6 * scarcity * 10) / 10,
    },
    offer,
  }
}
