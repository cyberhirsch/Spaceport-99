import {
  BUILDABLE,
  DECK_WIDTH,
  WING,
  MAX_LEVEL,
  MAX_MERGE,
  buildCost,
  capacityBonus,
  cycleCredits,
  cycleYield,
  deckCost,
  def,
  maxLevel,
  mergeBonus,
  moveCost,
  powerDraw,
  berths,
  missionSlots,
  moduleGuns,
  moduleShield,
  shipBerths,
  staffSlots,
  storageBonus,
  touchesLift,
  upgradeCost,
  wingOf,
  type Wing,
} from './modules.ts'
import {
  MAX_STAT,
  PORTRAIT_COUNT,
  crewPortrait,
  effectiveness,
  grantXp,
  makeCrew,
  rollStats,
  uid,
} from './crew.ts'
import { incidentDef } from './incidents.ts'
import { SLOTS, itemDef, stock } from './gear.ts'
import {
  DEFECTION_COST,
  DEFECTION_CREDIT,
  FACTION_IDS,
  STANDING_CEILING,
  STANDING_FLOOR,
  blankStanding,
  factionDef,
} from './factions.ts'
import { RESOURCE_INFO } from './types.ts'
import { STAT_KEYS } from './types.ts'
import {
  OUTCOME_INFO,
  makeMission,
  makeShip,
  refitCost,
  rollOutcome,
  shipCargo,
  shipDef,
  shipHull,
  shipSpeed,
  shipTeeth,
  teamSize,
  tradeInValue,
} from './fleet.ts'
import { SELL_MARGIN, TRADE_LOT, makeGuests, makeVisitor } from './visitors.ts'
import type {
  Candidate,
  Crew,
  FactionId,
  ItemId,
  ItemSlot,
  Prospect,
  Mission,
  Ship,
  ShipClass,
  ModuleDef,
  GameState,
  IncidentKind,
  LogEntry,
  ModuleKind,
  ResourceKey,
  StatKey,
  Tactic,
  Guest,
  Visitor,
  StationModule,
} from './types.ts'

export const SAVE_VERSION = 4

export const BASE_CREW_CAP = 8
export const BASE_STORAGE = 220
export const AIR_PER_CREW = 0.06
export const FOOD_PER_CREW = 0.05
export const MAX_LOG = 60

/**
 * Passing traffic pays to dock. A bigger, better-crewed port draws more of it,
 * and a staffed docking port is the berth they actually pay to use — which is
 * what funds the recruiting the same room exists to do.
 */
export const dockingFees = (s: GameState): number => {
  const alive = s.crew.filter((c) => !c.dead).length
  let fees = 0.1 + alive * 0.035 + s.modules.length * 0.02
  for (const m of s.modules) {
    if (m.kind === 'dock') fees += 0.3 * m.width * m.level
  }
  return fees
}
/** Longest stretch of offline time we will simulate on load. */
export const MAX_CATCHUP_SECONDS = 4 * 60 * 60

// ---------------------------------------------------------------- derived --

export interface Derived {
  crewAlive: Crew[]
  crewCap: number
  storageCap: number
  /** Power drawn per second by every online module. */
  draw: number
  /** Power produced per second, averaged over module cycles. */
  powerRate: number
  airRate: number
  foodRate: number
  creditRate: number
  brownout: boolean
}

const rateOf = (m: StationModule, crewById: Map<string, Crew>, resource: ResourceKey): number => {
  const d = def(m.kind)
  if (d.produces !== resource || !d.cycleSeconds) return 0
  return (cycleYield(m) * workRate(m, crewById)) / d.cycleSeconds
}

/** Stat points a crew member's kit adds on top of their own. */
export const gearBonus = (c: Crew, stat: StatKey): number => {
  let n = 0
  for (const slot of SLOTS) {
    const id = c.gear?.[slot]
    if (id) n += itemDef(id).bonus?.[stat] ?? 0
  }
  return n
}

/** What one crew member's kit is worth when the station has to defend itself. */
export const crewGuard = (c: Crew): number => {
  let n = 0
  for (const slot of SLOTS) {
    const id = c.gear?.[slot]
    if (id) n += itemDef(id).guard
  }
  return n
}

/**
 * What the station can bring to a fight: batteries and berthed hulls that can
 * shoot, a field to soak what gets through, and whatever the crew are carrying
 * when somebody comes down a corridor.
 */
export interface Defence {
  guns: number
  shield: number
  smallArms: number
}

export const defence = (s: GameState): Defence => {
  const crewById = new Map(s.crew.map((c) => [c.id, c]))
  let guns = 0
  let shield = 0
  for (const m of s.modules) {
    if (m.standby) continue
    // An unstaffed battery is a decoration. A shield holds without anyone in it,
    // badly.
    const rate = workRate(m, crewById)
    guns += moduleGuns(m) * rate
    shield += moduleShield(m) * Math.max(0.35, rate)
  }
  // A hull in its berth is a gun platform. One out on a contract is not.
  for (const ship of s.ships) {
    if (!ship.missionId) guns += shipTeeth(ship) * (ship.hull / shipHull(ship))
  }
  let smallArms = 0
  for (const c of s.crew) {
    if (!c.dead && !awayCrewIds(s).has(c.id)) smallArms += crewGuard(c)
  }
  return { guns, shield, smallArms }
}

/** How fast a room runs, 0 when unstaffed and up to ~1.6 with an elite crew. */
export const workRate = (m: StationModule, crewById: Map<string, Crew>): number => {
  const d = def(m.kind)
  const slots = staffSlots(m)
  if (slots === 0 || m.standby) return 0
  let sum = 0
  for (const id of m.staff) {
    const c = crewById.get(id)
    if (c && !c.dead) sum += effectiveness(c, d.stat)
  }
  if (sum <= 0) return 0
  // A full crew of rookies runs a room at about 100%; veterans push it towards 180%.
  return Math.min(1.8, (0.3 + sum / (slots * 3)) * m.condition)
}

export const derive = (s: GameState): Derived => {
  const crewAlive = s.crew.filter((c) => !c.dead)
  const crewById = new Map(s.crew.map((c) => [c.id, c]))
  let crewCap = BASE_CREW_CAP
  let storageCap = BASE_STORAGE
  let draw = 0
  let powerRate = 0
  let airRate = 0
  let foodRate = 0
  let creditRate = 0

  for (const m of s.modules) {
    crewCap += capacityBonus(m)
    storageCap += storageBonus(m)
    draw += powerDraw(m)
    powerRate += rateOf(m, crewById, 'power')
    airRate += rateOf(m, crewById, 'air')
    foodRate += rateOf(m, crewById, 'food')
    const d = def(m.kind)
    if (d.credits && d.cycleSeconds) {
      creditRate += (cycleCredits(m) * workRate(m, crewById)) / d.cycleSeconds
    }
  }

  airRate -= crewAlive.length * AIR_PER_CREW
  foodRate -= crewAlive.length * FOOD_PER_CREW
  creditRate += dockingFees(s)

  return {
    crewAlive,
    crewCap,
    storageCap,
    draw,
    powerRate: powerRate - draw,
    airRate,
    foodRate,
    creditRate,
    brownout: s.resources.power <= 0 && draw > 0,
  }
}

// ------------------------------------------------------------------ setup --

const log = (s: GameState, text: string, tone: LogEntry['tone'] = 'info'): void => {
  s.log = [{ id: uid('l'), at: s.elapsed, text, tone }, ...s.log].slice(0, MAX_LOG)
}

const makeModule = (kind: ModuleKind, deck: number, col: number): StationModule => ({
  id: uid('m'),
  kind,
  deck,
  col,
  width: 1,
  level: 1,
  staff: [],
  progress: 0,
  condition: 1,
  rushRisk: 0.15,
  standby: false,
})

export const newGame = (name = 'Spaceport-99'): GameState => {
  const state: GameState = {
    version: SAVE_VERSION,
    name,
    credits: 500,
    resources: { power: 140, air: 140, food: 140 },
    modules: [
      makeModule('dock', 0, WING - 2),
      makeModule('atmospherics', 0, WING - 1),
      makeModule('reactor', 0, WING),
      makeModule('hydroponics', 0, WING + 1),
    ],
    crew: [],
    incidents: [],
    log: [],
    decks: 1,
    lastTick: Date.now(),
    elapsed: 0,
    nextIncidentIn: 150,
    broadcastCooldown: 0,
    candidates: [],
    ships: [],
    missions: [],
    nextContractIn: 45,
    visitors: [],
    nextVisitorIn: 60,
    standing: blankStanding(),
    patron: null,
    resigned: [],
    stores: {},
    seenIntro: false,
    gameOver: false,
  }
  // The founders are hand-picked: one specialist per critical system, plus two
  // generalists, so a new station is never dead on arrival through bad luck.
  const founders: (StatKey | undefined)[] = ['T', 'O', 'B', undefined, undefined]
  for (const focus of founders) {
    state.crew.push(makeCrew({ stats: rollStats(6, focus), portrait: allocatePortrait(state) }))
  }
  // Put the founding crew straight to work so the station is not dead on arrival.
  autoAssignInto(state)
  log(state, 'Station commissioned. Docking clamps released.', 'good')
  return state
}

// -------------------------------------------------------------- geometry --

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
const mergeNeighbours = (s: GameState, m: StationModule): StationModule => {
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

// --------------------------------------------------------------- staffing --

const unassign = (s: GameState, crewId: string, remember = false): void => {
  const c = s.crew.find((x) => x.id === crewId)
  if (!c || !c.assignment) return
  const m = s.modules.find((x) => x.id === c.assignment)
  if (m) m.staff = m.staff.filter((id) => id !== crewId)
  // A drafted hand keeps pointing at their *original* station, not at the
  // room they were pulled into.
  c.returnTo = remember ? (c.returnTo ?? c.assignment) : null
  c.assignment = null
}

const assign = (s: GameState, crewId: string, moduleId: string): boolean => {
  const c = s.crew.find((x) => x.id === crewId)
  const m = s.modules.find((x) => x.id === moduleId)
  if (!c || !m || c.dead) return false
  // Someone light-minutes away cannot take a shift here.
  if (awayCrewIds(s).has(crewId)) return false
  if (m.staff.length >= staffSlots(m) && !m.staff.includes(crewId)) return false
  // Sending someone into a room that is on fire is a temporary posting. Note
  // the station they walked away from so they can walk back to it afterwards.
  const emergency = s.incidents.some((i) => i.moduleId === m.id)
  const previous = emergency ? (c.returnTo ?? (c.assignment === m.id ? null : c.assignment)) : null
  unassign(s, crewId)
  m.staff.push(crewId)
  c.assignment = m.id
  c.returnTo = previous
  return true
}

/**
 * Greedy best-fit: every open slot goes to whoever is strongest for that job.
 * Rooms with an emergency in them are skipped — feeding fresh crew into a fire
 * is a decision for the player to make deliberately, not a default.
 */
export const autoAssignInto = (s: GameState): number => {
  let moved = 0
  const jobs = s.modules
    .filter(
      (m) => staffSlots(m) > 0 && !m.standby && !s.incidents.some((i) => i.moduleId === m.id),
    )
    .sort((a, b) => jobPriority(a) - jobPriority(b))
  const free = new Set(idleCrew(s).map((c) => c.id))
  for (const m of jobs) {
    const stat = def(m.kind).stat
    while (m.staff.length < staffSlots(m) && free.size > 0) {
      let best: Crew | null = null
      for (const id of free) {
        const c = s.crew.find((x) => x.id === id)
        if (!c) continue
        if (!best || effectiveness(c, stat) > effectiveness(best, stat)) best = c
      }
      if (!best) break
      free.delete(best.id)
      if (assign(s, best.id, m.id)) moved += 1
    }
  }
  return moved
}

/** Life support first, then money, then training. */
const jobPriority = (m: StationModule): number => {
  const d = def(m.kind)
  if (d.produces === 'power') return 0
  if (d.produces === 'air') return 1
  if (d.produces === 'food') return 2
  if (d.heals) return 3
  if (d.credits) return 4
  if (d.berths) return 5
  return 9
}

// ------------------------------------------------------------------- tick --

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/**
 * Neighbours an emergency can spread into: along the same wing, or straight up
 * and down through the deck. The lift shaft acts as a fire break.
 */
const adjacentModules = (s: GameState, m: StationModule): StationModule[] =>
  s.modules.filter(
    (o) =>
      o.id !== m.id &&
      ((o.deck === m.deck &&
        wingOf(o.col) === wingOf(m.col) &&
        (o.col + o.width === m.col || o.col === m.col + m.width)) ||
        (Math.abs(o.deck - m.deck) === 1 && o.col < m.col + m.width && o.col + o.width > m.col)),
  )

/** Emergencies never pile up past this — a station under siege stays playable. */
export const incidentCap = (s: GameState): number => 2 + Math.floor(s.modules.length / 5)

const startIncident = (s: GameState, kind: IncidentKind, module: StationModule): void => {
  if (s.incidents.some((i) => i.moduleId === module.id)) return
  if (s.incidents.length >= incidentCap(s)) return
  const d = incidentDef(kind)
  const threat = 1 + s.modules.length * 0.06 + s.crew.filter((c) => !c.dead).length * 0.04
  const hp = Math.round(d.hp * threat)
  s.incidents.push({
    id: uid('i'),
    kind,
    moduleId: module.id,
    hp,
    maxHp: hp,
    spreadIn: d.spreadSeconds,
    startedAt: s.elapsed,
  })
  log(s, `${d.onset} ${def(module.kind).name}!`, 'bad')
}

/**
 * How much of a room keeps running during a brownout. Reactors are self-powered,
 * life support falls back to emergency cells, and everything else limps along —
 * a dark station should be recoverable, not an automatic wipe.
 */
const gridFactorFor = (md: ModuleDef, grid: number): number => {
  if (md.produces === 'power') return 1
  if (md.produces === 'air' || md.produces === 'food' || md.heals) return Math.max(0.6, grid)
  return Math.max(0.35, grid)
}

/**
 * Advances the simulation by `dt` seconds. `dt` should stay at or below 1.
 * While catching up on offline time nobody dies — the player comes back to a
 * station in crisis rather than to a tomb they had no chance to prevent.
 */
const step = (s: GameState, dt: number, offline: boolean): void => {
  const crewById = new Map(s.crew.map((c) => [c.id, c]))
  const alive = s.crew.filter((c) => !c.dead)
  const d = derive(s)
  s.elapsed += dt

  // --- power grid -----------------------------------------------------
  const demand = d.draw * dt
  let grid = 1
  if (demand > 0) {
    if (s.resources.power >= demand) {
      s.resources.power -= demand
    } else {
      grid = s.resources.power / demand
      s.resources.power = 0
    }
  }
  const brownout = grid < 0.999

  // --- production -----------------------------------------------------
  for (const m of s.modules) {
    const md = def(m.kind)
    const cycle = md.cycleSeconds ?? (md.trains ? trainingSeconds(m, crewById) : 0)
    if (!cycle) {
      // Passive rooms (quarters, cargo) still earn their crew a little xp.
      if (m.staff.length > 0) awardXp(s, m, 0.25 * dt)
      continue
    }
    const rate = workRate(m, crewById) * gridFactorFor(md, grid)
    if (rate <= 0) continue
    m.progress += (dt / cycle) * rate
    m.rushRisk = Math.max(0.15, m.rushRisk - dt * 0.004)
    while (m.progress >= 1) {
      m.progress -= 1
      completeCycle(s, m, d.storageCap)
    }
  }

  // --- life support ---------------------------------------------------
  const cap = d.storageCap
  s.resources.power = clamp(s.resources.power, 0, cap)
  s.resources.air = clamp(s.resources.air - alive.length * AIR_PER_CREW * dt, 0, cap)
  s.resources.food = clamp(s.resources.food - alive.length * FOOD_PER_CREW * dt, 0, cap)

  const starving = s.resources.food <= 0
  const suffocating = s.resources.air <= 0

  // --- med bay --------------------------------------------------------
  let healRate = 0
  for (const m of s.modules) {
    const md = def(m.kind)
    if (!md.heals) continue
    healRate +=
      md.heals * m.width * m.level * mergeBonus(m) * workRate(m, crewById) * Math.max(0.6, grid)
  }
  if (!starving && !suffocating) healRate += 0.15

  // --- the engineering bay ---------------------------------------------
  // A staffed bay works the worst room on the station back towards sound. It is
  // one party, so its attention goes where the damage is deepest — which means
  // equally battered rooms come up together.
  let repairRate = 0
  for (const m of s.modules) {
    const md = def(m.kind)
    if (!md.repairs || m.standby) continue
    repairRate +=
      md.repairs * m.width * m.level * mergeBonus(m) * workRate(m, crewById) * Math.max(0.6, grid)
  }
  if (repairRate > 0) {
    const worst = s.modules
      .filter((m) => m.condition < 1 && !s.incidents.some((i) => i.moduleId === m.id))
      .sort((a, b) => a.condition - b.condition)[0]
    if (worst) {
      const was = worst.condition
      worst.condition = clamp(worst.condition + repairRate * dt, 0.2, 1)
      if (was < 1 && worst.condition >= 1) {
        log(s, `${def(worst.kind).name} repaired to sound.`, 'good')
      }
    }
  }

  // --- incidents ------------------------------------------------------
  for (const inc of [...s.incidents]) {
    const idef = incidentDef(inc.kind)
    const m = s.modules.find((x) => x.id === inc.moduleId)
    if (!m) {
      s.incidents = s.incidents.filter((x) => x.id !== inc.id)
      continue
    }
    // Automated suppression works alone, just far too slowly to rely on.
    let firepower = 0.45
    for (const id of m.staff) {
      const c = crewById.get(id)
      if (!c || c.dead) continue
      firepower += effectiveness(c, idef.counter) * 0.55
      // Kit tells most against people. A hull breach does not care what you
      // are carrying; a boarding party very much does.
      if (inc.kind === 'pirates') firepower += crewGuard(c) * 0.18
    }
    inc.hp -= firepower * dt
    m.condition = clamp(m.condition - idef.structureDps * dt, 0.2, 1)
    for (const id of [...m.staff]) {
      const c = crewById.get(id)
      if (!c || c.dead) continue
      c.hp -= idef.crewDps * dt
      // Nobody dies holding a fire hose. Badly hurt crew fall back to the spine.
      if (c.hp < c.maxHp * 0.25) {
        unassign(s, c.id, true)
        log(s, `${c.name} fell back from the ${idef.name.toLowerCase()}.`, 'warn')
      }
    }
    // Each disaster gnaws at a different supply while it burns.
    if (inc.kind === 'breach') s.resources.air = Math.max(0, s.resources.air - 0.55 * dt)
    if (inc.kind === 'fire') s.resources.power = Math.max(0, s.resources.power - 0.8 * dt)
    if (inc.kind === 'vermin') s.resources.food = Math.max(0, s.resources.food - 0.7 * dt)
    if (inc.kind === 'pirates') s.credits = Math.max(0, s.credits - 1.5 * dt)

    if (inc.hp <= 0) {
      s.incidents = s.incidents.filter((x) => x.id !== inc.id)
      const reward = Math.round(idef.bounty * (1 + s.modules.length * 0.05))
      s.credits += reward
      awardXp(s, m, 22)
      log(s, `${idef.name} contained in ${def(m.kind).name}. +${reward}c salvage.`, 'good')
      // The emergency detail stands down: anyone drafted in walks back to the
      // station they left. If that post is gone, full, powered down or itself
      // burning, they simply stay put.
      for (const id of [...m.staff]) {
        const c = crewById.get(id)
        if (!c || c.dead || !c.returnTo || c.returnTo === m.id) continue
        const post = s.modules.find((x) => x.id === c.returnTo)
        const free =
          post &&
          !post.standby &&
          post.staff.length < staffSlots(post) &&
          !s.incidents.some((i) => i.moduleId === post.id)
        if (post && free) {
          assign(s, c.id, post.id)
          log(s, `${c.name} returned to the ${def(post.kind).name}.`, 'info')
        } else {
          c.returnTo = null
        }
      }
      continue
    }
    inc.spreadIn -= dt
    if (inc.spreadIn <= 0) {
      inc.spreadIn = idef.spreadSeconds
      // Something the crew is already beating back does not get to jump rooms.
      if (inc.hp > inc.maxHp * 0.6 && s.incidents.length < incidentCap(s)) {
        const targets = adjacentModules(s, m).filter(
          (o) => !s.incidents.some((i) => i.moduleId === o.id),
        )
        if (targets.length > 0) {
          startIncident(s, inc.kind, targets[Math.floor(Math.random() * targets.length)])
        }
      }
    }
  }

  // --- crew wellbeing -------------------------------------------------
  const bunkPressure = alive.length > d.crewCap ? 0.2 : 0
  const moraleTarget = clamp(
    0.55 +
      (s.resources.air > 20 ? 0.15 : -0.35) +
      (s.resources.food > 20 ? 0.15 : -0.35) +
      (brownout ? -0.2 : 0.05) +
      (s.incidents.length > 0 ? -0.15 : 0.05) -
      bunkPressure,
    0.15,
    1,
  )
  for (const c of s.crew) {
    if (c.dead) continue
    if (suffocating) c.hp -= 0.8 * dt
    if (starving) c.hp -= 0.4 * dt
    if (healRate > 0 && c.hp < c.maxHp) c.hp = Math.min(c.maxHp, c.hp + healRate * dt)
    c.morale = clamp(c.morale + (moraleTarget - c.morale) * dt * 0.06, 0, 1)
    // Once patched up, crew head back to the post they retreated from — and
    // immediately, injuries and all, if the station is out of air or food.
    const allHands = suffocating || starving
    if (c.returnTo && !c.assignment && (allHands || c.hp > c.maxHp * 0.4)) {
      const post = s.modules.find((m) => m.id === c.returnTo)
      const safe = post && !s.incidents.some((i) => i.moduleId === post.id)
      if (!post) c.returnTo = null
      else if (safe && post.staff.length < staffSlots(post)) {
        assign(s, c.id, post.id)
        log(s, `${c.name} returned to the ${def(post.kind).name}.`, 'info')
      }
    }
    if (c.hp <= 0) {
      if (offline) {
        c.hp = 1
        continue
      }
      c.hp = 0
      c.dead = true
      c.returnTo = null
      // Their kit goes back in the hold. Somebody else will need it.
      for (const slot of SLOTS) {
        const worn = c.gear?.[slot]
        if (worn) s.stores[worn] = (s.stores[worn] ?? 0) + 1
      }
      c.gear = {}
      unassign(s, c.id)
      log(s, `${c.name} has died. The station observes a minute of silence.`, 'bad')
    }
  }

  s.credits += dockingFees(s) * dt

  // --- random events --------------------------------------------------
  s.broadcastCooldown = Math.max(0, s.broadcastCooldown - dt)
  // --- the clamps -----------------------------------------------------
  s.nextVisitorIn -= dt
  if (s.nextVisitorIn <= 0) {
    s.nextVisitorIn = 80 + Math.random() * 120
    if (s.visitors.length < visitorBerths(s)) {
      const hail = makeVisitor()
      s.visitors.push(hail)
      log(s, `${hail.name} is on approach.`, 'info')
    }
  }

  for (const v of [...s.visitors]) {
    v.timer -= dt
    if (v.status === 'inbound') {
      if (v.timer <= 0) {
        v.status = 'requesting'
        v.timer = 60 + Math.random() * 40
        log(s, `${v.name} is requesting permission to dock.`, 'info')
      }
      continue
    }
    if (v.status === 'requesting') {
      if (autoAccepting(s)) {
        admitVisitor(s, v)
        continue
      }
      if (v.timer <= 0) {
        s.visitors = s.visitors.filter((x) => x.id !== v.id)
        log(s, `${v.name} gave up waiting and moved on.`, 'info')
      }
      continue
    }
    s.credits += v.fee * dt
    if (v.timer <= 0) {
      s.visitors = s.visitors.filter((x) => x.id !== v.id)
    }
  }

  // --- the fleet ------------------------------------------------------
  s.nextContractIn -= dt
  if (s.nextContractIn <= 0) {
    s.nextContractIn = 70 + Math.random() * 80
    // A command module has to be crewed for anyone to be listening to the wire.
    const listening = s.modules.some((m) => m.kind === 'command' && m.staff.length > 0)
    const offers = s.missions.filter((m) => m.status === 'offered').length
    if (listening && offers < 3) s.missions.push(makeMission(appeal(s)))
  }

  for (const m of [...s.missions]) {
    if (m.status === 'offered') {
      m.expiresIn -= dt
      if (m.expiresIn <= 0) s.missions = s.missions.filter((x) => x.id !== m.id)
      continue
    }
    if (m.status !== 'flying') continue
    m.remaining -= dt
    if (m.remaining <= 0) resolveMission(s, m)
  }

  // Applicants HQ has dispatched: first they fly out, then they wait — and
  // they do not wait forever.
  for (const cand of [...s.candidates]) {
    if (cand.arrivesIn > 0) {
      cand.arrivesIn -= dt
      if (cand.arrivesIn <= 0) {
        cand.arrivesIn = 0
        log(s, `${cand.name} docked for an interview.`, 'info')
      }
      continue
    }
    cand.patience -= dt
    if (cand.patience <= 0) {
      s.candidates = s.candidates.filter((x) => x.id !== cand.id)
      log(s, `${cand.name} got tired of waiting and undocked.`, 'warn')
    }
  }
  s.nextIncidentIn -= dt
  if (s.nextIncidentIn <= 0) {
    s.nextIncidentIn = 90 + Math.random() * 150
    rollIncident(s)
  }

  if (s.crew.length > 0 && s.crew.every((c) => c.dead) && !s.gameOver) {
    s.gameOver = true
    log(s, 'The last of the crew is gone. Spaceport-99 drifts dark and silent.', 'bad')
  }
}

/** Opens the clamps and finds out what was actually aboard. */
const admitVisitor = (s: GameState, v: Visitor): void => {
  const cap = derive(s).storageCap
  v.status = 'docked'
  v.timer = 45 + Math.random() * 60
  // The hull stays at the clamps; the people walk onto your decks. Whatever
  // the ship was carrying to raise with you, one of them now raises it. A
  // smuggler's crew still come ashore — being dodgy is not being hostile — but
  // a raider sends no one friendly. It sends a fight.
  if (v.kind !== 'raider') {
    const dealt: number[] = []
    v.aboard = makeGuests(v, () => {
      const face = allocatePortrait(s, dealt)
      dealt.push(face)
      return face
    })
  }
  v.offer = null
  const dock = s.modules.find((m) => m.kind === 'dock' && !m.standby)

  switch (v.kind) {
    case 'trader': {
      const paid = Math.round(60 + Math.random() * 140)
      s.credits += paid
      for (const key of ['power', 'air', 'food'] as const) {
        s.resources[key] = clamp(s.resources[key] + Math.round(20 + Math.random() * 50), 0, cap)
      }
      log(s, `${v.name} berthed and sold off a hold. +${paid}c and cargo.`, 'good')
      break
    }
    case 'courier': {
      const paid = Math.round(90 + Math.random() * 120)
      s.credits += paid
      // Couriers carry paper, which sometimes means work.
      if (s.missions.filter((m) => m.status === 'offered').length < 3) {
        s.missions.push(makeMission(appeal(s)))
        log(s, `${v.name} dropped a contract and a bill. +${paid}c.`, 'good')
      } else {
        log(s, `${v.name} dropped the mail. +${paid}c.`, 'good')
      }
      break
    }
    case 'patrol': {
      const paid = Math.round(50 + Math.random() * 90)
      s.credits += paid
      shift(s, v.faction, 0.01)
      log(s, `${v.name} took a berth and left the lane a little safer. +${paid}c.`, 'good')
      break
    }
    case 'drifter': {
      // Helping costs supplies now and buys goodwill that pays later.
      const given = Math.round(30 + Math.random() * 40)
      for (const key of ['air', 'food'] as const) {
        s.resources[key] = Math.max(0, s.resources[key] - given)
      }
      shift(s, v.faction, 0.04)
      // Sheltering a hull with no registration is not a crime. The
      // Confederation still minutes it.
      if (v.faction === 'unlisted') shift(s, 'terran', -0.01)
      log(s, `${v.name} was taken in and resupplied. Word gets around.`, 'good')
      break
    }
    case 'smuggler': {
      const stolen = Math.round(Math.min(s.credits, 40 + Math.random() * 120))
      s.credits -= stolen
      if (dock) startIncident(s, 'vermin', dock)
      log(s, `${v.name} was not carrying what the manifest said. -${stolen}c.`, 'bad')
      break
    }
    case 'raider': {
      if (dock) startIncident(s, 'pirates', dock)
      log(s, `${v.name} opened fire the moment the clamps closed.`, 'bad')
      break
    }
  }
}

/**
 * Brings a mission home and applies what happened. Injuries and hull damage are
 * the common cost of a bad run; losing the ship takes a disaster, and losing
 * people takes a disaster that goes badly on top of that.
 */
const resolveMission = (s: GameState, m: Mission): void => {
  const ship = s.ships.find((x) => x.id === m.shipId) ?? null
  const team = m.crewIds
    .map((id) => s.crew.find((c) => c.id === id))
    .filter((c): c is Crew => c !== undefined && !c.dead)
  const outcome = rollOutcome(team, m, ship)
  m.status = 'report'
  m.outcome = outcome
  m.remaining = 0

  const yieldOf = { triumph: 1.5, success: 1, setback: 0.35, disaster: 0 }[outcome]
  const cargo = ship ? shipCargo(ship) : 1
  const cap = derive(s).storageCap
  let credits = 0
  if (yieldOf > 0) {
    credits = Math.round(m.payout.credits * yieldOf * cargo)
    s.credits += credits
    for (const key of ['power', 'air', 'food'] as const) {
      const amount = Math.round(m.payout[key] * yieldOf * cargo)
      s.resources[key] = clamp(s.resources[key] + amount, 0, cap)
    }
  }

  // Damage: the ship takes it first, the crew take what is left.
  const harm = { triumph: 0, success: 0.08, setback: 0.3, disaster: 0.65 }[outcome]
  if (ship && harm > 0) {
    ship.hull = Math.max(0, Math.round(ship.hull - shipHull(ship) * harm))
  }
  for (const c of team) {
    const idx = s.crew.findIndex((x) => x.id === c.id)
    if (idx < 0) continue
    const hurt = Math.round(s.crew[idx].maxHp * harm * (0.6 + Math.random() * 0.8))
    s.crew[idx] = { ...s.crew[idx], hp: Math.max(1, s.crew[idx].hp - hurt) }
  }

  // Only a disaster can cost you the hull or the people, and even then not always.
  let lostShip = false
  if (outcome === 'disaster' && ship) {
    if (ship.hull <= 0 || Math.random() < 0.35) {
      s.ships = s.ships.filter((x) => x.id !== ship.id)
      lostShip = true
    }
  }
  let lostCrew = 0
  if (outcome === 'disaster') {
    for (const c of team) {
      if (Math.random() >= 0.18) continue
      const idx = s.crew.findIndex((x) => x.id === c.id)
      if (idx < 0) continue
      s.crew[idx] = { ...s.crew[idx], dead: true, hp: 0, returnTo: null }
      unassign(s, c.id)
      lostCrew += 1
    }
  }

  // Rare finds, and never on a run that went wrong.
  if (outcome === 'triumph' || (outcome === 'success' && Math.random() < 0.15)) {
    const roll = Math.random()
    if (roll < 0.4 && s.crew.filter((c) => !c.dead).length < derive(s).crewCap) {
      const survivor = makeCrew({ portrait: allocatePortrait(s) })
      s.crew.push(survivor)
      m.find = { kind: 'survivor', detail: `${survivor.name} came back with them and stayed.` }
    } else if (roll < 0.65 && s.ships.length < fleetCapacity(s)) {
      const hull = makeShip('shuttle')
      hull.hull = Math.round(hull.maxHull * 0.5)
      s.ships.push(hull)
      m.find = { kind: 'ship', detail: `They towed home a derelict — the ${hull.name}, half-dead.` }
    } else {
      const bump = Math.round(80 + m.danger * 200)
      for (const key of ['power', 'air', 'food'] as const) {
        s.resources[key] = clamp(s.resources[key] + bump, 0, cap)
      }
      m.find = { kind: 'cache', detail: `A sealed cache — ${bump} of everything.` }
    }
  }

  if (ship) ship.missionId = null
  const bits = [`${OUTCOME_INFO[outcome].label}.`]
  if (credits > 0) bits.push(`+${credits}c`)
  if (lostShip) bits.push('The ship did not come back.')
  if (lostCrew > 0) bits.push(`${lostCrew} did not come home.`)
  m.report = bits.join(' ')
  for (const c of team) awardXpTo(s, c.id, outcome === 'disaster' ? 10 : 25 + m.danger * 30)
  log(s, `${m.name}: ${OUTCOME_INFO[outcome].label.toLowerCase()}.`, OUTCOME_INFO[outcome].tone)
}

/** Grants xp to one crew member by id. */
const awardXpTo = (s: GameState, id: string, amount: number): void => {
  const idx = s.crew.findIndex((c) => c.id === id)
  if (idx < 0 || s.crew[idx].dead) return
  const { crew, levelled } = grantXp(s.crew[idx], amount)
  s.crew[idx] = crew
  if (levelled) log(s, `${crew.name} reached level ${crew.level}.`, 'good')
}

const trainingSeconds = (m: StationModule, crewById: Map<string, Crew>): number => {
  const stat = def(m.kind).trains
  if (!stat) return 0
  let worst = 1
  for (const id of m.staff) {
    const c = crewById.get(id)
    if (c) worst = Math.max(worst, c.stats[stat])
  }
  // Each point of a stat takes noticeably longer than the last.
  return (26 + worst * 16) / (m.level * mergeBonus(m))
}

const awardXp = (s: GameState, m: StationModule, amount: number): void => {
  for (const id of m.staff) {
    const idx = s.crew.findIndex((c) => c.id === id)
    if (idx < 0 || s.crew[idx].dead) continue
    const { crew, levelled } = grantXp(s.crew[idx], amount)
    s.crew[idx] = crew
    if (levelled) log(s, `${crew.name} reached level ${crew.level}.`, 'good')
  }
}

const completeCycle = (s: GameState, m: StationModule, cap: number): void => {
  const md = def(m.kind)
  if (md.produces) {
    const amount = cycleYield(m)
    s.resources[md.produces] = clamp(s.resources[md.produces] + amount, 0, cap)
  }
  if (md.credits) s.credits += Math.round(cycleCredits(m))
  if (md.trains) {
    const stat = md.trains
    for (const id of m.staff) {
      const idx = s.crew.findIndex((c) => c.id === id)
      if (idx < 0) continue
      const c = s.crew[idx]
      if (c.stats[stat] >= MAX_STAT) continue
      s.crew[idx] = { ...c, stats: { ...c.stats, [stat]: c.stats[stat] + 1 } }
      log(s, `${c.name} trained ${stat} to ${c.stats[stat] + 1}.`, 'good')
    }
  }
  awardXp(s, m, 6 + m.width * 2)
}

const rollIncident = (s: GameState): void => {
  const candidates = s.modules.filter(
    (m) => m.kind !== 'spine' && !s.incidents.some((i) => i.moduleId === m.id),
  )
  if (candidates.length === 0) return
  // A tidier station is a safer one; damaged, unstaffed rooms invite trouble.
  const target = candidates[Math.floor(Math.random() * candidates.length)]
  const risk = 0.22 + (1 - target.condition) * 0.4 + (target.staff.length === 0 ? 0.1 : 0)
  if (Math.random() > risk) return
  const roll = Math.random()
  const kind: IncidentKind =
    roll < 0.34 ? 'fire' : roll < 0.6 ? 'vermin' : roll < 0.85 ? 'breach' : 'pirates'
  startIncident(s, kind, target)
}

/** Public tick: splits an arbitrary elapsed span into stable sub-steps. */
export const advance = (state: GameState, seconds: number, offline = false): GameState => {
  const s: GameState = structuredClone(state)
  let remaining = Math.min(seconds, MAX_CATCHUP_SECONDS)
  while (remaining > 0) {
    const dt = Math.min(1, remaining)
    step(s, dt, offline)
    remaining -= dt
    if (s.gameOver) break
  }
  s.lastTick = Date.now()
  return s
}

// ---------------------------------------------------------------- actions --

export type Action =
  | { type: 'tick'; seconds: number }
  | { type: 'catchUp'; seconds: number }
  | { type: 'build'; kind: ModuleKind; deck: number; col: number }
  | { type: 'demolish'; moduleId: string }
  | { type: 'relocate'; moduleId: string; deck: number; col: number }
  | { type: 'upgrade'; moduleId: string }
  | { type: 'assign'; crewId: string; moduleId: string | null }
  | { type: 'autoAssign' }
  | { type: 'rush'; moduleId: string }
  | { type: 'buyDeck' }
  | { type: 'resupply'; resource: ResourceKey }
  | { type: 'requestCrew' }
  | { type: 'interview'; candidateId: string; tactic: Tactic; moduleId?: string }
  | { type: 'offerContract'; candidateId: string }
  | { type: 'turnAway'; candidateId: string }
  | { type: 'launch'; missionId: string; shipId: string; crewIds: string[] }
  | { type: 'declineMission'; missionId: string }
  | { type: 'fileReport'; missionId: string }
  | { type: 'buyShip'; cls: ShipClass }
  | { type: 'refitShip'; shipId: string }
  | { type: 'repairShip'; shipId: string }
  | { type: 'tradeInShip'; shipId: string }
  | { type: 'renameShip'; shipId: string; name: string }
  | { type: 'renameCrew'; crewId: string; name: string }
  | { type: 'setStandby'; moduleId: string; standby: boolean }
  | { type: 'acceptVisitor'; visitorId: string }
  | { type: 'refuseVisitor'; visitorId: string }
  | { type: 'setAutoAccept'; moduleId: string; autoAccept: boolean }
  | { type: 'tradeVisitor'; visitorId: string; resource: ResourceKey; buy: boolean }
  | { type: 'answerGuest'; guestId: string; yes: boolean }
  | { type: 'persuadeGuest'; guestId: string; tactic: Tactic; moduleId?: string }
  | { type: 'signGuest'; guestId: string }
  | { type: 'buyGear'; visitorId: string; item: ItemId }
  | { type: 'issueGear'; crewId: string; item: ItemId }
  | { type: 'stowGear'; crewId: string; slot: ItemSlot }
  | { type: 'declare'; faction: FactionId }
  | { type: 'resign' }
  | { type: 'revive'; crewId: string }
  | { type: 'dismiss'; crewId: string }
  | { type: 'rename'; name: string }
  | { type: 'dismissIntro' }
  | { type: 'load'; state: GameState }
  | { type: 'reset' }

/** Emergency resupply: buy a barge-load of one resource, at a stiff markup. */
export const RESUPPLY_FRACTION = 0.3
export const RESUPPLY_PRICE_PER_UNIT = 1.8
export const resupplyAmount = (storageCap: number): number => Math.round(storageCap * RESUPPLY_FRACTION)
export const resupplyCost = (storageCap: number): number =>
  Math.round(resupplyAmount(storageCap) * RESUPPLY_PRICE_PER_UNIT)

export const REQUEST_COST = 70
export const REQUEST_COOLDOWN = 70
/** How long an applicant waits at the dock before giving up. */
export const PATIENCE_SECONDS = 110
/** Interest needed for a certainty; below it, an offer is a gamble. */
export const SIGN_THRESHOLD = 100

/**
 * How attractive the station looks to someone deciding whether to move here:
 * its size, whether it runs a genuine surplus, how the crew are holding up, and
 * whether there is money in the account. HQ will not send its best people to a
 * dark, hungry outpost, which is why the strongest applicants only turn up once
 * the place is worth joining.
 */
/** Nudge one power's opinion of the station, inside the range it can move in. */
const shift = (s: GameState, id: FactionId, amount: number): void => {
  s.standing[id] = clamp(s.standing[id] + amount, STANDING_FLOOR, STANDING_CEILING)
}

/**
 * The standing that actually counts. Flying a flag means that power's opinion
 * is the one deciding who HQ sends you and how nasty the contracts are; with
 * no flag you trade on your general name instead, for better and worse.
 */
export const patronStanding = (s: GameState): number =>
  s.patron
    ? s.standing[s.patron]
    : FACTION_IDS.reduce((n, id) => n + s.standing[id], 0) / FACTION_IDS.length

export const appeal = (s: GameState): number => {
  const d = derive(s)
  const size = Math.min(1, s.modules.length / 14) * 0.25
  const room = Math.min(1, s.decks / 4) * 0.1
  const surplus =
    (d.powerRate > 0 ? 0.1 : 0) + (d.airRate > 0 ? 0.1 : 0) + (d.foodRate > 0 ? 0.1 : 0)
  const spirit = d.crewAlive.length
    ? (d.crewAlive.reduce((sum, c) => sum + c.morale, 0) / d.crewAlive.length) * 0.2
    : 0
  const funds = Math.min(1, s.credits / 2500) * 0.15
  // Goodwill: how the station treats people who turn up needing something.
  return clamp(size + room + surplus + spirit + funds + patronStanding(s), 0, 1)
}

/** How many ships can be at the clamps at once, waiting or berthed. */
/** Where a hull is in its visit, for the traffic board. */
export const visitorPhase = (v: Visitor): 'inbound' | 'hailing' | 'docked' | 'departing' =>
  v.status === 'inbound'
    ? 'inbound'
    : v.status === 'requesting'
      ? 'hailing'
      : v.timer <= 15
        ? 'departing'
        : 'docked'

export const PHASE_LABEL: Record<ReturnType<typeof visitorPhase>, string> = {
  inbound: 'inbound',
  hailing: 'asking',
  docked: 'docked',
  departing: 'leaving',
}

/** Everyone currently walking the station off a berthed hull. */
export const guestsAboard = (s: GameState): { guest: Guest; ship: Visitor }[] =>
  s.visitors.flatMap((v) => v.aboard.map((guest) => ({ guest, ship: v })))

export const visitorBerths = (s: GameState): number =>
  s.modules.filter((m) => m.kind === 'dock' && !m.standby).length * 2

/** True when any docking port is set to wave arrivals straight in. */
export const autoAccepting = (s: GameState): boolean =>
  s.modules.some((m) => m.kind === 'dock' && m.autoAccept && !m.standby)

/** Hull berths across every hangar bay. */
export const fleetCapacity = (s: GameState): number =>
  s.modules.reduce((n, m) => n + shipBerths(m), 0)

/** Missions that can be in flight at once. */
export const missionCapacity = (s: GameState): number =>
  s.modules.reduce((n, m) => n + missionSlots(m), 0)

/** Ships sitting in a hangar rather than out on a job. */
export const berthedShips = (s: GameState): Ship[] => s.ships.filter((x) => !x.missionId)

/**
 * Everyone currently off the station on a job. Launching clears their posting,
 * so without this they look exactly like idle crew to anything that assigns.
 */
export const awayCrewIds = (s: GameState): Set<string> =>
  new Set(s.missions.flatMap((m) => (m.status === 'flying' ? m.crewIds : [])))

export const isAway = (s: GameState, crewId: string): boolean => awayCrewIds(s).has(crewId)

/** Crew not already flying, dead, or otherwise spoken for. */
export const availableCrew = (s: GameState): Crew[] => {
  const away = awayCrewIds(s)
  return s.crew.filter((c) => !c.dead && !away.has(c.id))
}

/** Crew on the station and not posted to a room. */
export const idleCrew = (s: GameState): Crew[] =>
  availableCrew(s).filter((c) => !c.assignment)

/** Applicant berths across every docking port. */
export const dockBerths = (s: GameState): number =>
  s.modules.filter((m) => m.kind === 'dock').reduce((n, m) => n + berths(m), 0)

/** The best Adaptability among crew staffing a docking port — your recruiter. */
export const recruiterSkill = (s: GameState): number => {
  let best = 0
  for (const m of s.modules.filter((x) => x.kind === 'dock')) {
    for (const id of m.staff) {
      const c = s.crew.find((x) => x.id === id)
      if (c && !c.dead) best = Math.max(best, effectiveness(c, 'A'))
    }
  }
  return best
}

/**
 * Deals out a face nobody is wearing. Portraits only start repeating once every
 * one of them is spoken for, and then the least-worn goes next — so a station of
 * six has six distinct faces rather than whatever the dice happened to give.
 */
/**
 * Deals the least-worn face on the station. `alsoWorn` covers faces spoken for
 * but not yet in the state — a boarding party built one guest at a time.
 */
export const allocatePortrait = (s: GameState, alsoWorn: number[] = []): number => {
  const worn = new Map<number, number>()
  for (let i = 1; i <= PORTRAIT_COUNT; i += 1) worn.set(i, 0)
  const tally = (n: number) => worn.set(n, (worn.get(n) ?? 0) + 1)
  for (const c of s.crew) tally(crewPortrait(c))
  for (const cand of s.candidates) tally(crewPortrait(cand))
  for (const v of s.visitors) for (const g of v.aboard) if (g.portrait) tally(g.portrait)
  for (const n of alsoWorn) tally(n)
  const fewest = Math.min(...worn.values())
  const spare = [...worn.entries()].filter(([, n]) => n === fewest).map(([i]) => i)
  return spare[Math.floor(Math.random() * spare.length)]
}

/** Someone HQ has picked out, as good as the station deserves. */
const makeCandidate = (s: GameState, luck: number): Candidate => {
  const reach = clamp(appeal(s) + luck * 0.02 + (Math.random() * 0.3 - 0.15), 0, 1)
  const stats = rollStats(6 + Math.round(reach * 8))
  const crew = makeCrew({ stats })
  return {
    id: uid('a'),
    name: crew.name,
    seed: crew.seed,
    portrait: allocatePortrait(s),
    stats,
    tier: reach,
    // Someone HQ rates highly knows it, and starts colder on a modest station.
    interest: Math.round(clamp(appeal(s) * 70 - reach * 25, 5, 60)),
    askingBonus: Math.round(60 + reach * 260),
    patience: PATIENCE_SECONDS,
    used: [],
    promised: null,
    arrivesIn: 25 + Math.random() * 30,
  }
}

/** What the player can actually put on the table right now. */
export const bonusOffer = (s: GameState, p: Prospect): number =>
  Math.min(Math.floor(s.credits), p.askingBonus)

/**
 * Money and a promised post move someone who is already looking for a berth.
 * Someone who has one is that much harder to shift — a deckhand can be bought,
 * a ship's master mostly cannot, and only the pitch works on them at full
 * strength. Which is to say: a captain comes down to whether the station is
 * genuinely worth moving to.
 */
const holdOut = (p: Prospect): number => 1 - (p.grip ?? 0) * 0.55

/** What a tactic would do to this prospect's interest, right now. */
export const tacticEffect = (
  s: GameState,
  p: Prospect,
  tactic: Tactic,
  moduleId?: string,
): number => {
  // Paying part of what they asked for is worth part of the goodwill. Being
  // broke should make hiring harder, not impossible.
  if (tactic === 'bonus') {
    return Math.round(35 * (bonusOffer(s, p) / Math.max(1, p.askingBonus)) * holdOut(p))
  }
  if (tactic === 'pitch') {
    const standards = 30 + p.tier * 45
    return Math.round(
      clamp(18 + (appeal(s) * 100 - standards) * 0.5 + recruiterSkill(s) * 4, 5, 45),
    )
  }
  const m = s.modules.find((x) => x.id === moduleId)
  if (!m) return 0
  const stat = def(m.kind).stat
  const ranked = STAT_KEYS.map((k) => ({ k, v: p.stats[k] })).sort((a, b) => b.v - a.v)
  if (ranked[0].k === stat) return Math.round(40 * holdOut(p))
  if (ranked[ranked.length - 1].k === stat) return -15
  return Math.round(12 * holdOut(p))
}

/** The guest, and the hull they came in on. */
export const guestAboard = (
  s: GameState,
  guestId: string,
): { guest: Guest; ship: Visitor } | null => {
  const ship = s.visitors.find((v) => v.aboard.some((g) => g.id === guestId))
  const guest = ship?.aboard.find((g) => g.id === guestId)
  return ship && guest ? { guest, ship } : null
}

/** A power will not take a station on that has not been any use to it. */
export const DECLARE_AT = 0.05

/**
 * Whether the station could declare for a power right now, and if not, why
 * not. The panel says the reason rather than greying a button out.
 */
export const declineReason = (s: GameState, id: FactionId): string | null => {
  const def = factionDef(id)
  if (!def.patronable) return `${def.short} is a filing status, not a flag.`
  if (s.patron === id) return `Already flying ${def.short} paper.`
  if (s.patron && !factionDef(s.patron).exit) {
    return `Enrolment in ${factionDef(s.patron).short} has no exit clause.`
  }
  if (s.standing[id] < DECLARE_AT) {
    return `${def.short} will not take a station that has been no use to them.`
  }
  return null
}

export const REVIVE_COST_PER_LEVEL = 90

export const reducer = (state: GameState, action: Action): GameState => {
  switch (action.type) {
    case 'tick':
      return advance(state, action.seconds)
    case 'catchUp': {
      const caught = advance(state, action.seconds, true)
      const minutes = Math.floor(Math.min(action.seconds, MAX_CATCHUP_SECONDS) / 60)
      if (minutes >= 1) {
        log(caught, `You were away ${minutes} minute${minutes === 1 ? '' : 's'}. The crew held on.`, 'info')
      }
      return caught
    }
    case 'load':
      return action.state
    case 'reset':
      return newGame(state.name)
    default:
      break
  }

  const s: GameState = structuredClone(state)

  switch (action.type) {
    case 'build': {
      if (!canBuildAt(s, action.deck, action.col)) return state
      const cost = buildCost(action.kind, countOfKind(s, action.kind))
      if (s.credits < cost) return state
      s.credits -= cost
      const placed = makeModule(action.kind, action.deck, action.col)
      const firstHangar = action.kind === 'hangar' && s.ships.length === 0
      s.modules.push(placed)
      const final = mergeNeighbours(s, placed)
      log(s, `${def(final.kind).name} online — deck ${action.deck + 1}.`, 'good')
      if (firstHangar) {
        const shuttle = makeShip('shuttle')
        s.ships.push(shuttle)
        log(s, `HQ issued a shuttle with the bay — the ${shuttle.name}.`, 'good')
      }
      break
    }
    case 'relocate': {
      const m = s.modules.find((x) => x.id === action.moduleId)
      if (!m) return state
      const anchor = relocateAnchor(s, m, action.deck, action.col)
      if (anchor === null) return state
      const cost = moveCost(m)
      if (s.credits < cost) return state
      s.credits -= cost
      const wasWidth = m.width
      m.deck = action.deck
      m.col = anchor
      const final = mergeNeighbours(s, m)
      log(
        s,
        final.width > wasWidth
          ? `${def(final.kind).name} moved to deck ${action.deck + 1} and welded into a ${final.width}-wide run. −${cost}c.`
          : `${def(final.kind).name} moved to deck ${action.deck + 1}. −${cost}c.`,
        'info',
      )
      break
    }
    case 'demolish': {
      const m = s.modules.find((x) => x.id === action.moduleId)
      if (!m || !canDemolish(s, m)) return state
      for (const id of [...m.staff]) unassign(s, id)
      s.modules = s.modules.filter((x) => x.id !== m.id)
      const refund = Math.round(buildCost(m.kind, Math.max(0, countOfKind(s, m.kind))) * 0.5 * m.width)
      s.credits += refund
      log(s, `${def(m.kind).name} scrapped. +${refund}c reclaimed.`, 'info')
      break
    }
    case 'upgrade': {
      const m = s.modules.find((x) => x.id === action.moduleId)
      if (!m || m.level >= maxLevel(m)) return state
      const cost = upgradeCost(m)
      if (s.credits < cost) return state
      s.credits -= cost
      m.level += 1
      m.condition = 1
      log(s, `${def(m.kind).name} upgraded to level ${m.level}.`, 'good')
      // Rooms weld when they match, and an upgrade is one of the ways they come
      // to match — a neighbour brought up to the same level is now the same
      // room, so the bulkhead between them comes out.
      const run = mergeNeighbours(s, m)
      if (run.width > m.width) {
        log(s, `It welded into the ${def(run.kind).name} beside it — ${run.width} wide now.`, 'good')
      }
      break
    }
    case 'assign': {
      if (action.moduleId === null) unassign(s, action.crewId)
      else if (!assign(s, action.crewId, action.moduleId)) return state
      break
    }
    case 'autoAssign': {
      const moved = autoAssignInto(s)
      if (moved === 0) return state
      log(s, `Duty roster updated — ${moved} reassignment${moved === 1 ? '' : 's'}.`, 'info')
      break
    }
    case 'rush': {
      const m = s.modules.find((x) => x.id === action.moduleId)
      if (!m) return state
      const md = def(m.kind)
      if (!md.cycleSeconds || m.staff.length === 0) return state
      if (s.incidents.some((i) => i.moduleId === m.id)) return state
      if (Math.random() < m.rushRisk) {
        m.rushRisk = 0.15
        m.progress = 0
        const roll = Math.random()
        startIncident(s, roll < 0.55 ? 'fire' : roll < 0.85 ? 'breach' : 'vermin', m)
      } else {
        m.rushRisk = Math.min(0.75, m.rushRisk + 0.13)
        m.progress = 0
        completeCycle(s, m, derive(s).storageCap)
        log(s, `${md.name} rushed successfully.`, 'good')
      }
      break
    }
    case 'buyDeck': {
      const cost = deckCost(s.decks)
      if (s.credits < cost) return state
      s.credits -= cost
      s.decks += 1
      log(s, `Deck ${s.decks} pressurised.`, 'good')
      break
    }
    case 'resupply': {
      const cap = derive(s).storageCap
      const cost = resupplyCost(cap)
      if (s.credits < cost) return state
      if (s.resources[action.resource] >= cap) return state
      s.credits -= cost
      s.resources[action.resource] = Math.min(cap, s.resources[action.resource] + resupplyAmount(cap))
      log(s, `Emergency ${RESOURCE_INFO[action.resource].name} barge docked. -${cost}c.`, 'warn')
      break
    }
    case 'requestCrew': {
      if (s.broadcastCooldown > 0) return state
      if (s.credits < REQUEST_COST) return state
      const commsOnline = s.modules.some((m) => m.kind === 'comms' && m.staff.length > 0)
      if (!commsOnline) return state
      const waiting = s.candidates.length
      if (waiting >= dockBerths(s)) return state
      const d = derive(s)
      if (d.crewAlive.length >= d.crewCap) return state
      s.credits -= REQUEST_COST
      s.broadcastCooldown = REQUEST_COOLDOWN
      // A sharp operator on the comms desk gets HQ to look a little harder.
      let luck = 0
      for (const m of s.modules.filter((x) => x.kind === 'comms')) {
        for (const id of m.staff) {
          const c = s.crew.find((x) => x.id === id)
          if (c) luck = Math.max(luck, c.stats.L)
        }
      }
      const cand = makeCandidate(s, luck)
      s.candidates.push(cand)
      log(s, `HQ is sending ${cand.name} over for an interview.`, 'info')
      break
    }
    case 'interview': {
      const cand = s.candidates.find((x) => x.id === action.candidateId)
      if (!cand || cand.arrivesIn > 0) return state
      if (cand.used.includes(action.tactic)) return state
      let paid = 0
      if (action.tactic === 'bonus') {
        paid = bonusOffer(s, cand)
        if (paid <= 0) return state
      }
      const delta = tacticEffect(s, cand, action.tactic, action.moduleId)
      s.credits -= paid
      if (action.tactic === 'posting') {
        const m = s.modules.find((x) => x.id === action.moduleId)
        if (!m || m.staff.length >= staffSlots(m)) return state
        cand.promised = m.id
      }
      cand.interest = Math.round(clamp(cand.interest + delta, 0, SIGN_THRESHOLD))
      cand.used.push(action.tactic)
      break
    }
    case 'offerContract': {
      const cand = s.candidates.find((x) => x.id === action.candidateId)
      if (!cand || cand.arrivesIn > 0) return state
      s.candidates = s.candidates.filter((x) => x.id !== cand.id)
      const d = derive(s)
      if (d.crewAlive.length >= d.crewCap) {
        log(s, `${cand.name} was offered a berth the station does not have.`, 'warn')
        break
      }
      // Interest is a probability, so a half-convinced applicant is a coin toss.
      if (Math.random() * SIGN_THRESHOLD >= cand.interest) {
        log(s, `${cand.name} turned the contract down and undocked.`, 'warn')
        break
      }
      // They keep the face you interviewed.
      const hire = makeCrew({
        name: cand.name,
        stats: cand.stats,
        seed: cand.seed,
        portrait: crewPortrait(cand),
      })
      s.crew.push(hire)
      if (cand.promised) assign(s, hire.id, cand.promised)
      log(s, `${cand.name} signed on.`, 'good')
      break
    }
    case 'turnAway': {
      const cand = s.candidates.find((x) => x.id === action.candidateId)
      if (!cand) return state
      s.candidates = s.candidates.filter((x) => x.id !== cand.id)
      log(s, `${cand.name} was sent back to HQ.`, 'info')
      break
    }
    case 'launch': {
      const m = s.missions.find((x) => x.id === action.missionId)
      const ship = s.ships.find((x) => x.id === action.shipId)
      if (!m || m.status !== 'offered' || !ship || ship.missionId) return state
      if (s.missions.filter((x) => x.status === 'flying').length >= missionCapacity(s)) return state
      const team = action.crewIds
        .map((id) => s.crew.find((c) => c.id === id))
        .filter((c): c is Crew => c !== undefined && !c.dead)
      if (team.length === 0 || team.length > teamSize(m)) return state
      // A hull with nothing left in it does not leave the bay.
      if (ship.hull <= 0) return state
      m.status = 'flying'
      m.shipId = ship.id
      m.crewIds = team.map((c) => c.id)
      m.remaining = Math.round(m.seconds / shipSpeed(ship))
      ship.missionId = m.id
      // The away team comes off the duty roster while they are gone.
      for (const c of team) unassign(s, c.id)
      log(s, `${ship.name} launched — ${m.name}.`, 'info')
      break
    }
    case 'declineMission': {
      const m = s.missions.find((x) => x.id === action.missionId)
      if (!m || m.status !== 'offered') return state
      s.missions = s.missions.filter((x) => x.id !== m.id)
      break
    }
    case 'fileReport': {
      const m = s.missions.find((x) => x.id === action.missionId)
      if (!m || m.status !== 'report') return state
      s.missions = s.missions.filter((x) => x.id !== m.id)
      break
    }
    case 'buyShip': {
      const price = shipDef(action.cls).price
      if (s.credits < price) return state
      if (s.ships.length >= fleetCapacity(s)) return state
      s.credits -= price
      const bought = makeShip(action.cls)
      s.ships.push(bought)
      log(s, `HQ delivered the ${bought.name}, a ${shipDef(action.cls).name.toLowerCase()}.`, 'good')
      break
    }
    case 'refitShip': {
      const ship = s.ships.find((x) => x.id === action.shipId)
      if (!ship || ship.missionId || ship.level >= 3) return state
      const cost = refitCost(ship)
      if (s.credits < cost) return state
      s.credits -= cost
      ship.level += 1
      ship.maxHull = shipHull(ship)
      ship.hull = ship.maxHull
      log(s, `${ship.name} refitted to mark ${ship.level}.`, 'good')
      break
    }
    case 'repairShip': {
      const ship = s.ships.find((x) => x.id === action.shipId)
      if (!ship || ship.missionId) return state
      const missing = shipHull(ship) - ship.hull
      if (missing <= 0) return state
      const cost = Math.round(missing * 2.4)
      if (s.credits < cost) return state
      s.credits -= cost
      ship.hull = shipHull(ship)
      ship.maxHull = ship.hull
      break
    }
    case 'tradeInShip': {
      const ship = s.ships.find((x) => x.id === action.shipId)
      if (!ship || ship.missionId) return state
      s.credits += tradeInValue(ship)
      s.ships = s.ships.filter((x) => x.id !== ship.id)
      log(s, `${ship.name} was signed over to HQ.`, 'info')
      break
    }
    case 'renameShip': {
      const ship = s.ships.find((x) => x.id === action.shipId)
      if (!ship) return state
      ship.name = action.name.slice(0, 24) || ship.name
      break
    }
    case 'setStandby': {
      const m = s.modules.find((x) => x.id === action.moduleId)
      if (!m) return state
      m.standby = action.standby
      // Nothing useful happens in a dark room, so the shift is stood down.
      if (action.standby) for (const id of [...m.staff]) unassign(s, id)
      log(
        s,
        `${def(m.kind).name} ${action.standby ? 'powered down to standby' : 'brought back online'}.`,
        'info',
      )
      break
    }
    case 'acceptVisitor': {
      const v = s.visitors.find((x) => x.id === action.visitorId)
      if (!v || v.status !== 'requesting') return state
      admitVisitor(s, v)
      break
    }
    case 'refuseVisitor': {
      const v = s.visitors.find((x) => x.id === action.visitorId)
      if (!v || v.status !== 'requesting') return state
      s.visitors = s.visitors.filter((x) => x.id !== v.id)
      // Waving off a trader costs nothing. Turning away someone who is actually
      // in trouble is remembered, whatever their manifest looked like.
      if (v.kind === 'drifter') {
        shift(s, v.faction, -0.03)
        log(s, `${v.name} was refused a berth. They were not lying.`, 'warn')
      } else {
        // Turning away your own flag is noticed by the people who issued it.
        if (v.faction === s.patron) shift(s, v.faction, -0.01)
        log(s, `${v.name} was waved off.`, 'info')
      }
      break
    }
    case 'setAutoAccept': {
      const m = s.modules.find((x) => x.id === action.moduleId)
      if (!m || m.kind !== 'dock') return state
      m.autoAccept = action.autoAccept
      log(
        s,
        `Docking clamps set to ${action.autoAccept ? 'accept all traffic' : 'ask the commander'}.`,
        'info',
      )
      break
    }
    case 'tradeVisitor': {
      const v = s.visitors.find((x) => x.id === action.visitorId)
      if (!v || v.status !== 'docked') return state
      const cap = derive(s).storageCap
      const unit = v.prices[action.resource]
      if (action.buy) {
        const room = cap - s.resources[action.resource]
        const lot = Math.min(TRADE_LOT, Math.floor(room))
        const cost = Math.round(lot * unit)
        if (lot <= 0 || s.credits < cost) return state
        s.credits -= cost
        s.resources[action.resource] += lot
      } else {
        const lot = Math.min(TRADE_LOT, Math.floor(s.resources[action.resource]))
        if (lot <= 0) return state
        s.resources[action.resource] -= lot
        s.credits += Math.round(lot * unit * SELL_MARGIN)
      }
      // Commerce is how a station ends up with friends it did not plan on.
      shift(s, v.faction, 0.002)
      break
    }
    case 'answerGuest': {
      const v = s.visitors.find((x) => x.aboard.some((g) => g.id === action.guestId))
      const g = v?.aboard.find((x) => x.id === action.guestId)
      if (!v || !g || v.status !== 'docked' || !g.offer) return state
      const offer = g.offer
      g.offer = null
      if (!action.yes) break

      if (offer.kind === 'mission') {
        s.missions.push(makeMission(appeal(s)))
        log(s, `${g.name} handed over a contract off ${v.name}.`, 'good')
        break
      }
      const effect = offer.effect
      if (!effect) break
      switch (effect.type) {
        case 'credits':
          s.credits += effect.amount
          if (effect.standing) shift(s, v.faction, effect.standing)
          log(s, `${g.name} settled up quietly. +${effect.amount}c.`, 'warn')
          break
        case 'passenger': {
          if (s.crew.filter((c) => !c.dead).length >= derive(s).crewCap) {
            log(s, `${g.name}'s passenger had nowhere to sleep and stayed aboard.`, 'warn')
            break
          }
          const joiner = makeCrew({ portrait: allocatePortrait(s) })
          s.crew.push(joiner)
          log(s, `${joiner.name} came off ${v.name} and stayed.`, 'good')
          break
        }
        case 'cheapShip': {
          if (s.credits < effect.price || s.ships.length >= fleetCapacity(s)) {
            log(s, `No berth or no money — the hull went back aboard ${v.name}.`, 'warn')
            break
          }
          s.credits -= effect.price
          const hull = makeShip(effect.cls)
          hull.hull = Math.round(hull.maxHull * 0.7)
          s.ships.push(hull)
          log(s, `Bought the ${hull.name} off ${v.name}, no questions asked.`, 'good')
          break
        }
        case 'repair': {
          const worst = [...s.modules].sort((a, b) => a.condition - b.condition)[0]
          if (worst) worst.condition = 1
          log(s, `${g.name} put the ${worst ? def(worst.kind).name : 'station'} right.`, 'good')
          break
        }
        case 'leadMission': {
          const price = 150
          if (s.credits < price) {
            log(s, 'No money for coordinates.', 'warn')
            break
          }
          s.credits -= price
          const lead = makeMission(Math.min(1, appeal(s) + 0.3))
          lead.payout.credits = Math.round(lead.payout.credits * 1.6)
          s.missions.push(lead)
          log(s, `Bought a lead off ${v.name}. It had better be good.`, 'info')
          break
        }
      }
      break
    }
    case 'persuadeGuest': {
      const found = guestAboard(s, action.guestId)
      if (!found || found.ship.status !== 'docked') return state
      const { guest } = found
      if (guest.used.includes(action.tactic)) return state
      let paid = 0
      if (action.tactic === 'bonus') {
        paid = bonusOffer(s, guest)
        if (paid <= 0) return state
      }
      const delta = tacticEffect(s, guest, action.tactic, action.moduleId)
      s.credits -= paid
      if (action.tactic === 'posting') {
        const m = s.modules.find((x) => x.id === action.moduleId)
        if (!m || m.staff.length >= staffSlots(m)) return state
        guest.promised = m.id
      }
      guest.interest = Math.round(clamp(guest.interest + delta, 0, SIGN_THRESHOLD))
      guest.used.push(action.tactic)
      break
    }
    case 'signGuest': {
      const found = guestAboard(s, action.guestId)
      if (!found || found.ship.status !== 'docked') return state
      const { guest, ship } = found
      const d = derive(s)
      if (d.crewAlive.length >= d.crewCap) {
        log(s, `${guest.name} would come aboard, but there is no bunk free.`, 'warn')
        break
      }
      // Interest is a probability, so a half-convinced spacer is a coin toss.
      // Either way the asking is over: they go back up the gangway.
      ship.aboard = ship.aboard.filter((g) => g.id !== guest.id)
      if (Math.random() * SIGN_THRESHOLD >= guest.interest) {
        log(s, `${guest.name} thought about it and stayed with the ${ship.name}.`, 'warn')
        break
      }

      const hire = makeCrew({
        name: guest.name,
        stats: guest.stats,
        seed: guest.seed,
        portrait: crewPortrait(guest),
      })
      s.crew.push(hire)
      if (guest.promised) assign(s, hire.id, guest.promised)
      log(s, `${guest.name} signed off the ${ship.name} and onto the station.`, 'good')

      // Taking someone under contract is noticed. Taking their master is
      // noticed considerably more.
      shift(s, ship.faction, guest.captain ? -0.05 : -0.015)

      if (guest.captain) {
        // A master does not leave the hull behind. It comes with them if there
        // is a berth for it, and is sold on the dock if there is not.
        const hull = makeShip(ship.cls, ship.name)
        hull.hull = Math.round(hull.maxHull * (0.6 + Math.random() * 0.25))
        s.visitors = s.visitors.filter((v) => v.id !== ship.id)
        if (s.ships.length < fleetCapacity(s)) {
          s.ships.push(hull)
          log(s, `The ${hull.name} came with them. She is yours.`, 'good')
        } else {
          const paid = tradeInValue(hull)
          s.credits += paid
          log(s, `No berth for the ${hull.name}, so she went dockside. +${paid}c.`, 'info')
        }
      }
      break
    }
    case 'buyGear': {
      const v = s.visitors.find((x) => x.id === action.visitorId)
      if (!v || v.status !== 'docked') return state
      const line = stock(v.faction).find((x) => x.id === action.item)
      if (!line || s.credits < line.price) return state
      s.credits -= line.price
      s.stores[action.item] = (s.stores[action.item] ?? 0) + 1
      shift(s, v.faction, 0.004)
      log(s, `Bought a ${itemDef(action.item).name.toLowerCase()} off ${v.name}. −${line.price}c.`, 'info')
      break
    }
    case 'issueGear': {
      const c = s.crew.find((x) => x.id === action.crewId)
      const held = s.stores[action.item] ?? 0
      if (!c || c.dead || held <= 0) return state
      const slot = itemDef(action.item).slot
      // Whatever they were carrying in that slot goes back in the hold.
      const worn = c.gear?.[slot]
      if (worn) s.stores[worn] = (s.stores[worn] ?? 0) + 1
      s.stores[action.item] = held - 1
      c.gear = { ...c.gear, [slot]: action.item }
      break
    }
    case 'stowGear': {
      const c = s.crew.find((x) => x.id === action.crewId)
      const worn = c?.gear?.[action.slot]
      if (!c || !worn) return state
      s.stores[worn] = (s.stores[worn] ?? 0) + 1
      const next = { ...c.gear }
      delete next[action.slot]
      c.gear = next
      break
    }
    case 'declare': {
      if (declineReason(s, action.faction)) return state
      const taking = factionDef(action.faction)
      const leaving = s.patron ? factionDef(s.patron) : null
      if (leaving) {
        // Nobody rewards a turncoat as much as they punish one.
        shift(s, leaving.id, -DEFECTION_COST)
        shift(s, action.faction, DEFECTION_CREDIT)
        if (!s.resigned.includes(leaving.id)) s.resigned.push(leaving.id)
        log(s, `${leaving.name} was informed. ${leaving.exit}`, 'warn')
      }
      s.patron = action.faction
      log(s, `The station flies ${taking.name} paper.`, 'good')
      if (!taking.exit) {
        log(s, `Enrolment is permanent. There is no clause for undoing this.`, 'warn')
      }
      break
    }
    case 'resign': {
      if (!s.patron) return state
      const leaving = factionDef(s.patron)
      if (!leaving.exit) return state
      shift(s, leaving.id, -DEFECTION_COST)
      if (!s.resigned.includes(leaving.id)) s.resigned.push(leaving.id)
      s.patron = null
      log(s, `${leaving.name} was informed. ${leaving.exit}`, 'warn')
      log(s, 'The station flies no flag. Nobody taxes you. Nobody comes either.', 'info')
      break
    }
    case 'renameCrew': {
      const c = s.crew.find((x) => x.id === action.crewId)
      if (!c) return state
      c.name = action.name.slice(0, 24) || c.name
      break
    }
    case 'revive': {
      const c = s.crew.find((x) => x.id === action.crewId)
      if (!c || !c.dead) return state
      const cost = REVIVE_COST_PER_LEVEL * c.level
      if (s.credits < cost) return state
      s.credits -= cost
      c.dead = false
      c.hp = Math.max(1, Math.round(c.maxHp * 0.4))
      c.morale = 0.5
      log(s, `${c.name} was pulled back from the brink. -${cost}c.`, 'good')
      break
    }
    case 'dismiss': {
      const c = s.crew.find((x) => x.id === action.crewId)
      if (!c) return state
      unassign(s, c.id)
      s.crew = s.crew.filter((x) => x.id !== c.id)
      log(s, `${c.name} left on the supply barge.`, 'info')
      break
    }
    case 'rename': {
      s.name = action.name.slice(0, 28) || 'Spaceport-99'
      break
    }
    case 'dismissIntro': {
      s.seenIntro = true
      break
    }
    default:
      return state
  }
  return s
}

export {
  BUILDABLE,
  DECK_WIDTH,
  MAX_LEVEL,
  MAX_MERGE,
  WING,
  buildCost,
  deckCost,
  def,
  maxLevel,
  mergeBonus,
  moveCost,
  staffSlots,
  upgradeCost,
  wingOf,
}
