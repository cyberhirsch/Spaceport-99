import type { ModuleDef, ModuleKind, StationModule } from './types.ts'

/** Room slots in each wing, either side of the lift shaft. */
export const WING = 5
export const DECK_WIDTH = WING * 2
export const MAX_MERGE = 3
/** Ceiling on room level. Only a merged run ever reaches it. */
export const MAX_LEVEL = 3

export type Wing = 'port' | 'starboard'

/** Which side of the lift a column sits on. */
export const wingOf = (col: number): Wing => (col < WING ? 'port' : 'starboard')

/** The two columns that touch the lift shaft — where every wing starts. */
export const touchesLift = (col: number): boolean => col === WING - 1 || col === WING

export const MODULE_DEFS: Record<ModuleKind, ModuleDef> = {
  spine: {
    kind: 'spine',
    name: 'Docking Spine',
    short: 'Spine',
    blurb: 'The station backbone. Crew loiter here when unassigned.',
    glyph: '║',
    hue: 200,
    cost: 0,
    unlockAtCrew: 0,
    slotsPerSegment: 0,
    stat: 'O',
    powerDraw: 0,
  },
  reactor: {
    kind: 'reactor',
    name: 'Fusion Reactor',
    short: 'Reactor',
    blurb: 'Bottles a small star. Everything else on the station runs off it.',
    glyph: '☢',
    hue: 45,
    cost: 180,
    unlockAtCrew: 0,
    slotsPerSegment: 2,
    stat: 'T',
    produces: 'power',
    baseYield: 42,
    storageBonus: 120,
    cycleSeconds: 10,
    powerDraw: 0,
  },
  atmospherics: {
    kind: 'atmospherics',
    name: 'Atmospherics Plant',
    short: 'Air Plant',
    blurb: 'Scrubs CO₂ and cracks ice into breathable air.',
    glyph: '◌',
    hue: 190,
    cost: 180,
    unlockAtCrew: 0,
    slotsPerSegment: 2,
    stat: 'O',
    produces: 'air',
    baseYield: 22,
    storageBonus: 90,
    cycleSeconds: 14,
    powerDraw: 1.2,
  },
  hydroponics: {
    kind: 'hydroponics',
    name: 'Hydroponics Bay',
    short: 'Farm',
    blurb: 'Racks of algae and beans under grow lamps. Smells green.',
    glyph: '❦',
    hue: 110,
    cost: 180,
    unlockAtCrew: 0,
    slotsPerSegment: 2,
    stat: 'B',
    produces: 'food',
    baseYield: 22,
    storageBonus: 90,
    cycleSeconds: 16,
    powerDraw: 1.2,
  },
  quarters: {
    kind: 'quarters',
    name: 'Crew Quarters',
    short: 'Quarters',
    blurb: 'Bunks, lockers and a little privacy. Raises crew capacity.',
    glyph: '⌂',
    hue: 280,
    cost: 260,
    unlockAtCrew: 5,
    slotsPerSegment: 2,
    stat: 'A',
    crewCapacity: 4,
    powerDraw: 1,
  },
  storage: {
    kind: 'storage',
    name: 'Cargo Hold',
    short: 'Cargo',
    blurb: 'Pressurised racking for kit — sidearms, armour, and whatever else comes off a hull.',
    glyph: '▦',
    hue: 35,
    cost: 300,
    unlockAtCrew: 8,
    slotsPerSegment: 2,
    stat: 'B',
    holdBonus: 14,
    powerDraw: 1,
  },
  medbay: {
    kind: 'medbay',
    name: 'Med Bay',
    short: 'Med Bay',
    blurb: 'Autodocs and a very tired nurse. Heals injured crew station-wide.',
    glyph: '✚',
    hue: 0,
    cost: 400,
    unlockAtCrew: 15,
    slotsPerSegment: 2,
    stat: 'I',
    heals: 0.35,
    powerDraw: 3,
  },
  fabricator: {
    kind: 'fabricator',
    name: 'Fabricator',
    short: 'Fab Shop',
    blurb:
      'Prints parts from feedstock and sells the surplus dockside. Runs off kit the lab has worked out.',
    glyph: '⚒',
    hue: 25,
    cost: 480,
    unlockAtCrew: 21,
    slotsPerSegment: 2,
    stat: 'T',
    credits: 30,
    cycleSeconds: 20,
    powerDraw: 4,
  },
  comms: {
    kind: 'comms',
    name: 'Comms Array',
    short: 'Comms',
    blurb: 'Puts a crew request through to HQ, and sells the spare bandwidth.',
    glyph: '((·))',
    hue: 320,
    cost: 420,
    unlockAtCrew: 3,
    slotsPerSegment: 1,
    stat: 'L',
    credits: 12,
    cycleSeconds: 24,
    powerDraw: 3,
    calls: 1,
  },
  dock: {
    kind: 'dock',
    name: 'Docking Port',
    short: 'Dock',
    blurb: 'Berths for visiting traffic, and where you talk applicants into staying.',
    glyph: '⚓',
    hue: 205,
    cost: 340,
    unlockAtCrew: 0,
    slotsPerSegment: 1,
    stat: 'A',
    berths: 2,
    powerDraw: 0.6,
  },
  hangar: {
    kind: 'hangar',
    name: 'Hangar Bay',
    short: 'Hangar',
    blurb: 'Pressurised berth, fuel lines and a deck crew. One hull per bay.',
    glyph: '⬢',
    hue: 30,
    cost: 520,
    unlockAtCrew: 10,
    slotsPerSegment: 1,
    stat: 'T',
    ships: 1,
    powerDraw: 2,
  },
  command: {
    kind: 'command',
    name: 'Command Module',
    short: 'Command',
    blurb: 'Takes contracts off the wire and sends people out to fly them.',
    glyph: '✦',
    hue: 260,
    cost: 560,
    unlockAtCrew: 12,
    slotsPerSegment: 2,
    stat: 'O',
    missions: 1,
    powerDraw: 2.5,
  },
  gym: {
    kind: 'gym',
    name: 'Centrifuge Gym',
    short: 'Gym',
    blurb: 'Spin gravity and heavy iron. Trains Brawn.',
    glyph: '⊕',
    hue: 15,
    cost: 500,
    unlockAtCrew: 26,
    slotsPerSegment: 2,
    stat: 'B',
    trains: 'B',
    powerDraw: 2,
  },
  range: {
    kind: 'range',
    name: 'Combat Sim',
    short: 'Combat Sim',
    blurb: 'Holographic boarders that shoot back. Trains Reflex.',
    glyph: '✜',
    hue: 350,
    cost: 560,
    unlockAtCrew: 33,
    slotsPerSegment: 2,
    stat: 'R',
    trains: 'R',
    powerDraw: 3,
  },
  library: {
    kind: 'library',
    name: 'Research Lab',
    short: 'Research',
    blurb:
      'Reference stacks, a drawing board and a coffee machine. Trains Intellect, and the only place a recovered spec gets worked out.',
    glyph: '❑',
    hue: 215,
    cost: 600,
    unlockAtCrew: 30,
    slotsPerSegment: 2,
    stat: 'I',
    trains: 'I',
    powerDraw: 2,
  },
  workshop: {
    kind: 'workshop',
    name: 'Engineering Bay',
    short: 'Eng Bay',
    blurb: 'Trains Tech, and puts damaged rooms back together one at a time.',
    glyph: '⚙',
    hue: 45,
    cost: 640,
    unlockAtCrew: 42,
    slotsPerSegment: 2,
    stat: 'T',
    trains: 'T',
    repairs: 0.01,
    powerDraw: 3,
  },
  observatory: {
    kind: 'observatory',
    name: 'Observation Deck',
    short: 'Obs Deck',
    blurb: 'Charts, traffic control and a very big window. Trains Operations.',
    glyph: '◉',
    hue: 195,
    cost: 700,
    unlockAtCrew: 45,
    slotsPerSegment: 2,
    stat: 'O',
    trains: 'O',
    powerDraw: 3,
  },
  lounge: {
    kind: 'lounge',
    name: 'Crew Lounge',
    short: 'Lounge',
    blurb: 'Cards, bad music, worse synth-beer. Trains Adaptability.',
    glyph: '☕',
    hue: 300,
    cost: 760,
    unlockAtCrew: 48,
    slotsPerSegment: 2,
    stat: 'A',
    trains: 'A',
    powerDraw: 2,
  },
  battery: {
    kind: 'battery',
    name: 'Defence Battery',
    short: 'Battery',
    blurb: 'Two hardpoints and a firing solution. Nothing docks that the crew here dislike.',
    glyph: '⁜',
    hue: 5,
    cost: 680,
    unlockAtCrew: 18,
    slotsPerSegment: 2,
    stat: 'R',
    guns: 6,
    powerDraw: 3.5,
  },
  shield: {
    kind: 'shield',
    name: 'Shield Projector',
    short: 'Shield',
    blurb: 'Holds a field across the hull. Drinks power and gives nothing back until it has to.',
    glyph: '◌',
    hue: 210,
    cost: 820,
    unlockAtCrew: 35,
    slotsPerSegment: 1,
    stat: 'T',
    shield: 5,
    powerDraw: 6,
  },
  reclaimer: {
    kind: 'reclaimer',
    name: 'Water Reclamation',
    short: 'Reclaim',
    blurb:
      'Condensers, filter beds and a smell nobody mentions twice. Cuts what the crew burn instead of making more.',
    glyph: '♺',
    hue: 170,
    cost: 560,
    unlockAtCrew: 24,
    slotsPerSegment: 2,
    stat: 'O',
    recycles: 0.14,
    powerDraw: 5,
  },
  brig: {
    kind: 'brig',
    name: 'Brig',
    short: 'Brig',
    blurb:
      'Four cells and somebody watching them. Somewhere to put a person, which the station has never had.',
    glyph: '⌸',
    hue: 355,
    cost: 520,
    unlockAtCrew: 28,
    slotsPerSegment: 2,
    stat: 'A',
    cells: 2,
    powerDraw: 2,
  },
  sensor: {
    kind: 'sensor',
    name: 'Sensor Array',
    short: 'Sensors',
    blurb:
      'Phased returns and a long baseline. Narrows what the scan cannot tell you about an inbound hull.',
    glyph: '◎',
    hue: 195,
    cost: 740,
    unlockAtCrew: 39,
    slotsPerSegment: 1,
    stat: 'I',
    sensors: 0.34,
    powerDraw: 3.5,
  },
  market: {
    kind: 'market',
    name: 'Trading Hub',
    short: 'Market',
    blurb:
      'A floor, a bonded cage and a reason to stop here. Traffic comes more often and pays closer to what it asks.',
    glyph: '⇄',
    hue: 40,
    cost: 820,
    unlockAtCrew: 52,
    slotsPerSegment: 2,
    stat: 'L',
    commerce: 1,
    lots: 2,
    powerDraw: 2.5,
  },
  covertops: {
    kind: 'covertops',
    name: 'Covert Ops',
    short: 'Covert',
    blurb:
      'A room with no window on the deck plan and a channel that is not in the register. Every power would rather deal with a station than take one; this is where you find out what they are offering.',
    glyph: '◑',
    hue: 285,
    cost: 1040,
    unlockAtCrew: 50,
    slotsPerSegment: 2,
    stat: 'A',
    discretion: 0.3,
    powerDraw: 3.5,
  },
  dso: {
    kind: 'dso',
    name: 'Deep Space Operations',
    short: 'Deep Ops',
    blurb:
      'A plot table and a long-baseline fix. Sends teams past the edge of the comms envelope, where they answer to nobody.',
    glyph: '✧',
    hue: 265,
    cost: 880,
    unlockAtCrew: 60,
    slotsPerSegment: 2,
    stat: 'O',
    reach: 1,
    powerDraw: 4.5,
  },
  vault: {
    kind: 'vault',
    name: 'Reclamation Bay',
    short: 'Reclaim',
    blurb: 'Sorting other people’s misfortune into value. Trains Luck.',
    glyph: '◈',
    hue: 55,
    cost: 900,
    unlockAtCrew: 56,
    slotsPerSegment: 2,
    stat: 'L',
    trains: 'L',
    powerDraw: 4,
  },
}

/** Every module the player can actually place, in build-menu order. */
export const BUILDABLE: ModuleDef[] = Object.values(MODULE_DEFS)
  .filter((d) => d.kind !== 'spine')
  .sort((a, b) => a.unlockAtCrew - b.unlockAtCrew || a.cost - b.cost)

export const def = (kind: ModuleKind): ModuleDef => MODULE_DEFS[kind]

/** Building a room costs more per copy already on the station. */
export const buildCost = (kind: ModuleKind, existing: number): number =>
  Math.round(def(kind).cost * (1 + existing * 0.35))

/** Upgrading scales with room size and the level being bought. */
export const upgradeCost = (m: StationModule): number =>
  Math.round(def(m.kind).cost * 0.8 * m.width * m.level * 1.4)

/** Each new deck is markedly pricier than the last. */
export const deckCost = (decks: number): number => Math.round(260 * Math.pow(decks, 1.5))

/**
 * A room standing on its own takes a single upgrade. Weld it into a run of its
 * own kind and the extra volume buys a second — so width is not just more of
 * the same room, it is a deeper one.
 */
export const maxLevel = (m: StationModule): number => (m.width > 1 ? MAX_LEVEL : 2)

/**
 * Rooms of a kind welded together share plant, power and hands, so a run puts
 * out more than the segments would apart. 15% per extra segment.
 */
export const mergeBonus = (m: StationModule): number => 1 + (m.width - 1) * 0.15

/**
 * Hands on shift. Each segment brings two workstations, and each upgrade adds
 * one more to every segment — so Crew Quarters work 2 alone and 3 upgraded;
 * 4, 6, 8 across two welded together; 6, 9, 12 across three.
 *
 * Deliberately additive: two level-2 rooms hold three each, and the run they
 * weld into holds six. Anything else would quietly turn a merge into a
 * demotion for somebody's shift, and rooms of the same level are exactly what
 * merges.
 */
export const staffSlots = (m: StationModule): number => {
  const per = def(m.kind).slotsPerSegment
  if (per === 0) return 0
  return m.width * (per + m.level - 1)
}

/**
 * Cutting a room loose from its mounts and re-welding it elsewhere. Far
 * cheaper than building fresh, and it keeps the crew and the fit-out.
 */
export const moveCost = (m: StationModule): number =>
  Math.round(def(m.kind).cost * 0.3 * m.width * m.level)

/** Yield of one completed production cycle at full effectiveness. */
export const cycleYield = (m: StationModule): number => {
  const d = def(m.kind)
  if (!d.baseYield) return 0
  return d.baseYield * m.width * (1 + (m.level - 1) * 0.6) * mergeBonus(m)
}

export const cycleCredits = (m: StationModule): number => {
  const d = def(m.kind)
  if (!d.credits) return 0
  return d.credits * m.width * (1 + (m.level - 1) * 0.6) * mergeBonus(m)
}

/** What a room on standby still costs: heaters, sensors, and the lights. */
export const STANDBY_DRAW = 0.1

export const powerDraw = (m: StationModule): number =>
  def(m.kind).powerDraw *
  m.width *
  (1 + (m.level - 1) * 0.4) *
  (m.standby ? STANDBY_DRAW : 1)

export const capacityBonus = (m: StationModule): number =>
  Math.round((def(m.kind).crewCapacity ?? 0) * m.width * m.level * mergeBonus(m))

export const storageBonus = (m: StationModule): number =>
  Math.round((def(m.kind).storageBonus ?? 0) * m.width * m.level * mergeBonus(m))

/** Holding cells. Only the Brig has any. */
export const cellCount = (m: StationModule): number =>
  Math.round((def(m.kind).cells ?? 0) * m.width * m.level * mergeBonus(m))

/** Bonded cargo lots the station may hold. Only the Trading Hub has any. */
export const lotCount = (m: StationModule): number =>
  Math.round((def(m.kind).lots ?? 0) * m.width * m.level * mergeBonus(m))

/** Racking for kit. Only the Cargo Hold has any. */
export const holdBonus = (m: StationModule): number =>
  Math.round((def(m.kind).holdBonus ?? 0) * m.width * m.level * mergeBonus(m))

/** How many applicants the station can have waiting at once. */
export const berths = (m: StationModule): number =>
  (def(m.kind).berths ?? 0) * m.width * m.level

/** Hulls a hangar can hold: one per bay, more once it is merged or refitted. */
export const shipBerths = (m: StationModule): number =>
  (def(m.kind).ships ?? 0) * m.width * m.level

/** Missions a command module can run at once. */
export const missionSlots = (m: StationModule): number =>
  (def(m.kind).missions ?? 0) * m.width * m.level

/** What a defence battery brings to a fight, when it is staffed and lit. */
export const moduleGuns = (m: StationModule): number =>
  (def(m.kind).guns ?? 0) * m.width * m.level * mergeBonus(m)

/** Damage a shield projector soaks before the hull sees any of it. */
export const moduleShield = (m: StationModule): number =>
  (def(m.kind).shield ?? 0) * m.width * m.level * mergeBonus(m)

export const moduleLabel = (m: StationModule): string => def(m.kind).name
