import {
  DECK_WIDTH,
  WING,
  MAX_MERGE,
  buildCost,
  staffSlots,
  touchesLift,
  wingOf,
} from './modules.ts'
import type { Wing } from './modules.ts'
import type { GameState, ModuleKind, StationModule } from './types.ts'

// Floor plan: where a room can go, how runs weld, what scrapping pays.

export const moduleAt = (s: GameState, deck: number, col: number): StationModule | undefined =>
  s.modules.find((m) => m.deck === deck && col >= m.col && col < m.col + m.width)

export const canBuildAt = (s: GameState, deck: number, col: number): boolean => {
  if (deck < 0 || deck >= s.decks) return false
  if (col < 0 || col >= DECK_WIDTH) return false
  if (moduleAt(s, deck, col)) return false
  // Every wing hangs off the lift shaft and grows outward from it.
  if (touchesLift(col)) return true
  return wingOf(col) === 'port'
    ? Boolean(moduleAt(s, deck, col + 1))
    : Boolean(moduleAt(s, deck, col - 1))
}

/**
 * Only the room at the outer end of a run can be scrapped. Cutting one out of
 * the middle would strand everything beyond it with no corridor to the lift.
 */
export const canDemolish = (s: GameState, m: StationModule): boolean => {
  if (s.incidents.some((i) => i.moduleId === m.id)) return false
  return wingOf(m.col) === 'port'
    ? !moduleAt(s, m.deck, m.col - 1)
    : !moduleAt(s, m.deck, m.col + m.width)
}

/** The columns of a wing, ordered outward from the lift shaft. */
const wingColumns = (wing: Wing): number[] =>
  wing === 'port'
    ? Array.from({ length: WING }, (_, i) => WING - 1 - i)
    : Array.from({ length: WING }, (_, i) => WING + i)

/**
 * A wing is one unbroken run hanging off the lift. Any arrangement that would
 * strand a room behind a gap — or leave one straddling the shaft — is illegal,
 * however it came about.
 */
const wingIsSound = (mods: StationModule[], deck: number, wing: Wing): boolean => {
  const filled = new Set<number>()
  for (const m of mods) {
    if (m.deck !== deck) continue
    for (let c = m.col; c < m.col + m.width; c += 1) if (wingOf(c) === wing) filled.add(c)
  }
  const order = wingColumns(wing)
  for (let i = 0; i < order.length; i += 1) {
    if (!filled.has(order[i])) return order.slice(i).every((c) => !filled.has(c))
  }
  return true
}

/**
 * Whether a built room could be cut loose and set down at `col` on `deck`. The
 * footprint must be clear, must stay on one side of the lift, and both the
 * wing it leaves and the wing it lands in must still read as a single run.
 */
export const canRelocate = (
  s: GameState,
  m: StationModule,
  deck: number,
  col: number,
): boolean => {
  if (s.incidents.some((i) => i.moduleId === m.id)) return false
  if (deck < 0 || deck >= s.decks) return false
  if (col < 0 || col + m.width > DECK_WIDTH) return false
  if (wingOf(col) !== wingOf(col + m.width - 1)) return false
  if (deck === m.deck && col === m.col) return false
  const others = s.modules.filter((o) => o.id !== m.id)
  for (let c = col; c < col + m.width; c += 1) {
    if (others.some((o) => o.deck === deck && c >= o.col && c < o.col + o.width)) return false
  }
  const after = [...others, { ...m, deck, col }]
  for (let d = 0; d < s.decks; d += 1) {
    if (!wingIsSound(after, d, 'port') || !wingIsSound(after, d, 'starboard')) return false
  }
  return true
}

/**
 * Where a room dropped on one cell should actually come to rest. A wide run
 * covers several columns, so slide it left until its whole footprint fits.
 */
export const relocateAnchor = (
  s: GameState,
  m: StationModule,
  deck: number,
  col: number,
): number | null => {
  for (let anchor = col; anchor > col - m.width; anchor -= 1) {
    if (canRelocate(s, m, deck, anchor)) return anchor
  }
  return null
}

/** Whether a room can be picked up at all, wherever it might end up. */
export const canMove = (s: GameState, m: StationModule): boolean => {
  if (s.incidents.some((i) => i.moduleId === m.id)) return false
  for (let d = 0; d < s.decks; d += 1) {
    for (let c = 0; c < DECK_WIDTH; c += 1) if (canRelocate(s, m, d, c)) return true
  }
  return false
}

export const countOfKind = (s: GameState, kind: ModuleKind): number =>
  s.modules.filter((m) => m.kind === kind).length

/** Fold a freshly built room into identical neighbours to form one larger room. */
export const mergeNeighbours = (s: GameState, m: StationModule): StationModule => {
  let current = m
  for (let pass = 0; pass < 2; pass += 1) {
    // Rooms only merge with their own wing; the lift shaft is a hard divide.
    const twin = (o: StationModule) =>
      o.id !== current.id &&
      o.deck === current.deck &&
      o.kind === current.kind &&
      o.level === current.level &&
      wingOf(o.col) === wingOf(current.col)
    const left = s.modules.find((o) => twin(o) && o.col + o.width === current.col)
    const right = s.modules.find((o) => twin(o) && o.col === current.col + current.width)
    const other = left ?? right
    if (!other || other.width + current.width > MAX_MERGE) break
    const merged: StationModule = {
      ...current,
      col: Math.min(current.col, other.col),
      width: current.width + other.width,
      staff: [...current.staff, ...other.staff],
      progress: Math.max(current.progress, other.progress),
      condition: Math.min(current.condition, other.condition),
      rushRisk: Math.max(current.rushRisk, other.rushRisk),
    }
    merged.staff = merged.staff.slice(0, staffSlots(merged))
    s.modules = s.modules.filter((o) => o.id !== current.id && o.id !== other.id)
    s.modules.push(merged)
    // Any crew that lost their seat in the merge go back to the spine.
    for (const c of s.crew) {
      if ((c.assignment === current.id || c.assignment === other.id) && !merged.staff.includes(c.id)) {
        c.assignment = null
      } else if (c.assignment === current.id || c.assignment === other.id) {
        c.assignment = merged.id
      }
    }
    for (const inc of s.incidents) {
      if (inc.moduleId === current.id || inc.moduleId === other.id) inc.moduleId = merged.id
    }
    current = merged
  }
  return current
}

/**
 * What scrapping a room hands back: half what the *next* one of its kind would
 * cost, per segment. Exported so the button that quotes the figure and the
 * reducer that pays it cannot drift apart.
 */
export const scrapValue = (s: GameState, m: StationModule): number =>
  Math.round(buildCost(m.kind, Math.max(0, countOfKind(s, m.kind) - 1)) * 0.5 * m.width)
