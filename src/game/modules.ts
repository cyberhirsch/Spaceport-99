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
    unlockAtCrew: 4,
    slotsPerSegment: 2,
    stat: 'A',
    crewCapacity: 4,
    powerDraw: 1,
  },
  storage: {
    kind: 'storage',
    name: 'Cargo Hold',
    short: 'Cargo',
    blurb: 'Pressurised racking. Raises the cap on every stored resource.',
    glyph: '▦',
    hue: 35,
    cost: 300,
    unlockAtCrew: 5,
    slotsPerSegment: 2,
    stat: 'B',
    storageBonus: 90,
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
    unlockAtCrew: 6,
    slotsPerSegment: 2,
    stat: 'I',
    heals: 0.35,
    powerDraw: 3,
  },
  fabricator: {
    kind: 'fabricator',
    name: 'Fabricator',
    short: 'Fab Shop',
    blurb: 'Prints parts from feedstock and sells the surplus dockside.',
    glyph: '⚒',
    hue: 25,
    cost: 480,
    unlockAtCrew: 7,
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
    unlockAtCrew: 5,
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
    unlockAtCrew: 5,
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
    unlockAtCrew: 8,
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
    unlockAtCrew: 9,
    slotsPerSegment: 2,
    stat: 'R',
    trains: 'R',
    powerDraw: 3,
  },
  library: {
    kind: 'library',
    name: 'Archive',
    short: 'Archive',
    blurb: 'Every manual ever written, and a coffee machine. Trains Intellect.',
    glyph: '❑',
    hue: 215,
    cost: 600,
    unlockAtCrew: 10,
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
    unlockAtCrew: 11,
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
    unlockAtCrew: 12,
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
    unlockAtCrew: 13,
    slotsPerSegment: 2,
    stat: 'A',
    trains: 'A',
    powerDraw: 2,
  },
  vault: {
    kind: 'vault',
    name: 'Reclamation Bay',
    short: 'Reclaim',
    blurb: 'Sorting other people’s misfortune into value. Trains Luck.',
    glyph: '◈',
    hue: 55,
    cost: 900,
    unlockAtCrew: 15,
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
 * Hands on shift. Every segment brings its own workstations, and the final
 * fit-out repacks the run to find room for one more — a fully merged, fully
 * upgraded Crew Quarters works seven.
 */
export const staffSlots = (m: StationModule): number => {
  const per = def(m.kind).slotsPerSegment
  if (per === 0) return 0
  return per * m.width + (m.level >= maxLevel(m) ? 1 : 0)
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

/** How many applicants the station can have waiting at once. */
export const berths = (m: StationModule): number =>
  (def(m.kind).berths ?? 0) * m.width * m.level

/** Hulls a hangar can hold: one per bay, more once it is merged or refitted. */
export const shipBerths = (m: StationModule): number =>
  (def(m.kind).ships ?? 0) * m.width * m.level

/** Missions a command module can run at once. */
export const missionSlots = (m: StationModule): number =>
  (def(m.kind).missions ?? 0) * m.width * m.level

export const moduleLabel = (m: StationModule): string => def(m.kind).name
