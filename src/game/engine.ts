import {
  BUILDABLE,
  DECK_WIDTH,
  MAX_LEVEL,
  MAX_MERGE,
  buildCost,
  capacityBonus,
  cycleCredits,
  cycleYield,
  deckCost,
  def,
  powerDraw,
  staffSlots,
  storageBonus,
  upgradeCost,
} from './modules'
import { MAX_STAT, effectiveness, grantXp, makeCrew, rollStats, uid } from './crew'
import { incidentDef } from './incidents'
import { RESOURCE_INFO } from './types'
import type {
  Crew,
  ModuleDef,
  GameState,
  IncidentKind,
  LogEntry,
  ModuleKind,
  ResourceKey,
  StatKey,
  StationModule,
} from './types'

export const SAVE_VERSION = 1

export const BASE_CREW_CAP = 8
export const BASE_STORAGE = 220
export const AIR_PER_CREW = 0.06
export const FOOD_PER_CREW = 0.05
export const MAX_LOG = 60

/** Passing traffic pays to dock. A bigger, better-crewed port draws more of it. */
export const dockingFees = (crewCount: number, roomCount: number): number =>
  0.1 + crewCount * 0.035 + roomCount * 0.02
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

/** How fast a room runs, 0 when unstaffed and up to ~1.6 with an elite crew. */
export const workRate = (m: StationModule, crewById: Map<string, Crew>): number => {
  const d = def(m.kind)
  const slots = staffSlots(m)
  if (slots === 0) return 0
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
  creditRate += dockingFees(crewAlive.length, s.modules.length)

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
})

export const newGame = (name = 'Spaceport-99'): GameState => {
  const state: GameState = {
    version: SAVE_VERSION,
    name,
    credits: 500,
    resources: { power: 140, air: 140, food: 140 },
    modules: [
      makeModule('reactor', 0, 0),
      makeModule('atmospherics', 0, 1),
      makeModule('hydroponics', 0, 2),
    ],
    crew: [],
    incidents: [],
    log: [],
    decks: 2,
    lastTick: Date.now(),
    elapsed: 0,
    nextIncidentIn: 150,
    broadcastCooldown: 0,
    nextArrivalIn: 120,
    seenIntro: false,
    gameOver: false,
  }
  // The founders are hand-picked: one specialist per critical system, plus two
  // generalists, so a new station is never dead on arrival through bad luck.
  const founders: (StatKey | undefined)[] = ['T', 'O', 'B', undefined, undefined]
  for (const focus of founders) state.crew.push(makeCrew({ stats: rollStats(6, focus) }))
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
  // Rooms must touch the docking spine or an existing room on the same deck.
  if (col === 0) return true
  return Boolean(moduleAt(s, deck, col - 1)) || Boolean(moduleAt(s, deck, col + 1))
}

export const countOfKind = (s: GameState, kind: ModuleKind): number =>
  s.modules.filter((m) => m.kind === kind).length

/** Fold a freshly built room into identical neighbours, Fallout-Shelter style. */
const mergeNeighbours = (s: GameState, m: StationModule): StationModule => {
  let current = m
  for (let pass = 0; pass < 2; pass += 1) {
    const left = s.modules.find(
      (o) =>
        o.id !== current.id &&
        o.deck === current.deck &&
        o.col + o.width === current.col &&
        o.kind === current.kind &&
        o.level === current.level,
    )
    const right = s.modules.find(
      (o) =>
        o.id !== current.id &&
        o.deck === current.deck &&
        o.col === current.col + current.width &&
        o.kind === current.kind &&
        o.level === current.level,
    )
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
  c.returnTo = remember ? c.assignment : null
  c.assignment = null
}

const assign = (s: GameState, crewId: string, moduleId: string): boolean => {
  const c = s.crew.find((x) => x.id === crewId)
  const m = s.modules.find((x) => x.id === moduleId)
  if (!c || !m || c.dead) return false
  if (m.staff.length >= staffSlots(m) && !m.staff.includes(crewId)) return false
  unassign(s, crewId)
  m.staff.push(crewId)
  c.assignment = m.id
  c.returnTo = null
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
    .filter((m) => staffSlots(m) > 0 && !s.incidents.some((i) => i.moduleId === m.id))
    .sort((a, b) => jobPriority(a) - jobPriority(b))
  const free = new Set(s.crew.filter((c) => !c.dead && !c.assignment).map((c) => c.id))
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
  return 9
}

// ------------------------------------------------------------------- tick --

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

const adjacentModules = (s: GameState, m: StationModule): StationModule[] =>
  s.modules.filter(
    (o) =>
      o.id !== m.id &&
      ((o.deck === m.deck && (o.col + o.width === m.col || o.col === m.col + m.width)) ||
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
    healRate += md.heals * m.width * m.level * workRate(m, crewById) * Math.max(0.6, grid)
  }
  if (!starving && !suffocating) healRate += 0.15

  // --- incidents ------------------------------------------------------
  for (const inc of [...s.incidents]) {
    const idef = incidentDef(inc.kind)
    const m = s.modules.find((x) => x.id === inc.moduleId)
    if (!m) {
      s.incidents = s.incidents.filter((x) => x.id !== inc.id)
      continue
    }
    // Automated suppression works alone, just far too slowly to rely on.
    let firepower = 0.3
    for (const id of m.staff) {
      const c = crewById.get(id)
      if (c && !c.dead) firepower += effectiveness(c, idef.counter) * 0.55
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
    if (inc.kind === 'breach') s.resources.air = Math.max(0, s.resources.air - 0.9 * dt)
    if (inc.kind === 'fire') s.resources.power = Math.max(0, s.resources.power - 0.8 * dt)
    if (inc.kind === 'vermin') s.resources.food = Math.max(0, s.resources.food - 0.7 * dt)
    if (inc.kind === 'pirates') s.credits = Math.max(0, s.credits - 1.5 * dt)

    if (inc.hp <= 0) {
      s.incidents = s.incidents.filter((x) => x.id !== inc.id)
      const reward = Math.round(idef.bounty * (1 + s.modules.length * 0.05))
      s.credits += reward
      awardXp(s, m, 22)
      log(s, `${idef.name} contained in ${def(m.kind).name}. +${reward}c salvage.`, 'good')
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
      unassign(s, c.id)
      log(s, `${c.name} has died. The station observes a minute of silence.`, 'bad')
    }
  }

  s.credits += dockingFees(alive.length, s.modules.length) * dt

  // --- random events --------------------------------------------------
  s.broadcastCooldown = Math.max(0, s.broadcastCooldown - dt)
  s.nextArrivalIn -= dt
  if (s.nextArrivalIn <= 0) {
    s.nextArrivalIn = 140 + Math.random() * 160
    // Word gets around. A station with a spare bunk, calm decks and a genuine
    // surplus attracts drifters — one that cannot feed itself does not.
    const roomy = alive.length < d.crewCap
    const comfortable =
      s.resources.air > 25 &&
      s.resources.food > 25 &&
      d.airRate > AIR_PER_CREW &&
      d.foodRate > FOOD_PER_CREW &&
      s.incidents.length === 0
    if (roomy && comfortable) {
      const arrival = makeCrew()
      s.crew.push(arrival)
      log(s, `${arrival.name} docked looking for work.`, 'good')
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

const trainingSeconds = (m: StationModule, crewById: Map<string, Crew>): number => {
  const stat = def(m.kind).trains
  if (!stat) return 0
  let worst = 1
  for (const id of m.staff) {
    const c = crewById.get(id)
    if (c) worst = Math.max(worst, c.stats[stat])
  }
  // Each point of a stat takes noticeably longer than the last.
  return (26 + worst * 16) / m.level
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
  | { type: 'upgrade'; moduleId: string }
  | { type: 'assign'; crewId: string; moduleId: string | null }
  | { type: 'autoAssign' }
  | { type: 'rush'; moduleId: string }
  | { type: 'buyDeck' }
  | { type: 'resupply'; resource: ResourceKey }
  | { type: 'broadcast' }
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

export const BROADCAST_COST = 150
export const BROADCAST_SECONDS = 45
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
      s.modules.push(placed)
      const final = mergeNeighbours(s, placed)
      log(s, `${def(final.kind).name} online — deck ${action.deck + 1}.`, 'good')
      break
    }
    case 'demolish': {
      const m = s.modules.find((x) => x.id === action.moduleId)
      if (!m) return state
      if (s.incidents.some((i) => i.moduleId === m.id)) return state
      for (const id of [...m.staff]) unassign(s, id)
      s.modules = s.modules.filter((x) => x.id !== m.id)
      const refund = Math.round(buildCost(m.kind, Math.max(0, countOfKind(s, m.kind))) * 0.5 * m.width)
      s.credits += refund
      log(s, `${def(m.kind).name} scrapped. +${refund}c reclaimed.`, 'info')
      break
    }
    case 'upgrade': {
      const m = s.modules.find((x) => x.id === action.moduleId)
      if (!m || m.level >= MAX_LEVEL) return state
      const cost = upgradeCost(m)
      if (s.credits < cost) return state
      s.credits -= cost
      m.level += 1
      m.condition = 1
      log(s, `${def(m.kind).name} upgraded to level ${m.level}.`, 'good')
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
    case 'broadcast': {
      if (s.broadcastCooldown > 0) return state
      if (s.credits < BROADCAST_COST) return state
      const commsOnline = s.modules.some((m) => m.kind === 'comms' && m.staff.length > 0)
      if (!commsOnline) return state
      const cap = derive(s).crewCap
      if (s.crew.filter((c) => !c.dead).length >= cap) return state
      s.credits -= BROADCAST_COST
      s.broadcastCooldown = BROADCAST_SECONDS
      // A staffed, high-Luck comms array pulls in better people.
      let luck = 0
      for (const m of s.modules.filter((x) => x.kind === 'comms')) {
        for (const id of m.staff) {
          const c = s.crew.find((x) => x.id === id)
          if (c) luck += c.stats.L
        }
      }
      const recruit = makeCrew({ level: 1 })
      const bonus = Math.min(6, Math.floor(luck / 3))
      const keys = Object.keys(recruit.stats) as (keyof typeof recruit.stats)[]
      for (let i = 0; i < bonus; i += 1) {
        const k = keys[Math.floor(Math.random() * keys.length)]
        if (recruit.stats[k] < MAX_STAT) recruit.stats[k] += 1
      }
      s.crew.push(recruit)
      log(s, `${recruit.name} answered the beacon and docked.`, 'good')
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

export { BUILDABLE, DECK_WIDTH, MAX_LEVEL, buildCost, deckCost, def, staffSlots, upgradeCost }
