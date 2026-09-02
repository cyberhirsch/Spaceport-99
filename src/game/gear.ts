import type { FactionId, ItemId, ItemSlot, StatKey } from './types.ts'

/**
 * What a crew member can be issued. Two slots, because a station is not an army
 * and nobody out here is carrying a locker's worth of kit to a shift.
 *
 * `guard` is what the item is worth when the station has to defend itself —
 * against boarders in a corridor, or against a hull at the clamps deciding
 * whether your crew look like a fight worth having.
 */
export interface ItemDef {
  id: ItemId
  name: string
  short: string
  slot: ItemSlot
  glyph: string
  blurb: string
  /** What one costs at a berthed ship that deals in them. */
  price: number
  /** Contribution to station defence while it is on somebody. */
  guard: number
  /** Stat nudge while worn, applied on top of the crew member's own. */
  bonus?: Partial<Record<StatKey, number>>
  /** Who will sell it, and at what markup. Nobody else carries it at all. */
  sellers: Partial<Record<FactionId, number>>
}

export const ITEM_DEFS: Record<ItemId, ItemDef> = {
  cutter: {
    id: 'cutter',
    name: 'Rigging Cutter',
    short: 'Cutter',
    slot: 'sidearm',
    glyph: '⌇',
    blurb: 'A cargo tool with a bad reputation. Everyone has one; nobody calls it a weapon.',
    price: 90,
    guard: 1,
    bonus: { B: 1 },
    sellers: { unlisted: 0.85, concern: 1, terran: 1.1 },
  },
  sidearm: {
    id: 'sidearm',
    name: 'Deck Sidearm',
    short: 'Sidearm',
    slot: 'sidearm',
    glyph: '⌐',
    blurb: 'Low-velocity, hull-safe, and the reason most boarding parties reconsider.',
    price: 260,
    guard: 3,
    bonus: { R: 1 },
    sellers: { concern: 1, terran: 1.15, unlisted: 0.9 },
  },
  lance: {
    id: 'lance',
    name: 'Vantric Lance',
    short: 'Lance',
    slot: 'sidearm',
    glyph: '⟊',
    blurb: 'Compact issue. Quiet, precise, and unavailable to anybody they do not like.',
    price: 720,
    guard: 7,
    bonus: { R: 2, T: 1 },
    sellers: { compact: 1 },
  },
  vest: {
    id: 'vest',
    name: 'Work Vest',
    short: 'Vest',
    slot: 'armour',
    glyph: '▤',
    blurb: 'Padding, a beacon and a patch kit. Rated for falling crates, not for gunfire.',
    price: 110,
    guard: 1,
    bonus: { B: 1 },
    sellers: { terran: 0.9, concern: 1, unlisted: 0.95 },
  },
  plate: {
    id: 'plate',
    name: 'Boarding Plate',
    short: 'Plate',
    slot: 'armour',
    glyph: '▩',
    blurb: 'Hard shell over a sealed liner. Heavy, hot, and worth every gram once.',
    price: 340,
    guard: 4,
    bonus: { B: 2 },
    sellers: { concern: 1, terran: 1.1, unlisted: 1.05 },
  },
  carapace: {
    id: 'carapace',
    name: 'Compact Carapace',
    short: 'Carapace',
    slot: 'armour',
    glyph: '⬢',
    blurb: 'Grown rather than made. Holds pressure, holds heat, and holds a grudge.',
    price: 880,
    guard: 8,
    bonus: { B: 2, O: 1 },
    sellers: { compact: 1 },
  },
}

export const ITEM_IDS = Object.keys(ITEM_DEFS) as ItemId[]

export const itemDef = (id: ItemId): ItemDef => ITEM_DEFS[id]

export const SLOTS: ItemSlot[] = ['sidearm', 'armour']

export const SLOT_LABEL: Record<ItemSlot, string> = {
  sidearm: 'Sidearm',
  armour: 'Armour',
}

/** What a berthed hull of this faction has in its hold, and what they want for it. */
export const stock = (faction: FactionId): { id: ItemId; price: number }[] =>
  ITEM_IDS.filter((id) => ITEM_DEFS[id].sellers[faction] !== undefined).map((id) => ({
    id,
    price: Math.round(ITEM_DEFS[id].price * (ITEM_DEFS[id].sellers[faction] ?? 1)),
  }))
