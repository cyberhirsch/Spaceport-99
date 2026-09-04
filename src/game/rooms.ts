import {
  cycleYield,
  def,
  mergeBonus,
  berths,
  moduleGuns,
  moduleShield,
  shipBerths,
  cellCount,
  lotCount,
} from './modules.ts'
import { ITEM_SPEC, MODULE_SPEC, SPEC_IDS } from './specs.ts'
import { shipHull, shipTeeth } from './fleet.ts'
import { SELL_MARGIN, visitorDef } from './visitors.ts'
import type {
  Crew,
  ItemId,
  SpecId,
  GameState,
  ModuleKind,
  ResourceKey,
  Visitor,
  StationModule,
} from './types.ts'
import { clamp } from './core.ts'
import { crewGuard, workRate, awayCrewIds } from './staffing.ts'

// What the rooms add up to: defence, tankage, cells, commerce, reach.

/**
 * Passing traffic pays to dock. A bigger, better-crewed port draws more of it,
 * and a staffed docking port is the berth they actually pay to use — which is
 * what funds the recruiting the same room exists to do.
 */
export const dockingFees = (s: GameState): number => {
  const alive = s.crew.filter((c) => !c.dead).length
  let fees = 0.1 + alive * 0.035 + s.modules.length * 0.02
  for (const m of s.modules) {
    // The port's own take needs somebody on the desk to collect it. An empty
    // one is a row of clamps nothing is tied to.
    if (m.kind === 'dock' && !m.standby && m.staff.length > 0) {
      fees += 0.3 * m.width * m.level
    }
  }
  return fees
}

export const rateOf = (
  m: StationModule,
  crewById: Map<string, Crew>,
  resource: ResourceKey,
): number => {
  const d = def(m.kind)
  if (d.produces !== resource || !d.cycleSeconds) return 0
  return (cycleYield(m) * workRate(m, crewById)) / d.cycleSeconds
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

/**
 * The point at which a station's guns are worth talking behind. Below it, a
 * hard word is a bluff; above it, it is a fact.
 */
export const ARMED_ENOUGH = 8

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

/** Cells across every staffed, powered Brig. Unstaffed, they do not hold. */
export const cellsAboard = (s: GameState): number => {
  const crewById = new Map(s.crew.map((c) => [c.id, c]))
  let n = 0
  for (const m of s.modules) {
    if (m.kind !== 'brig' || m.standby) continue
    if (workRate(m, crewById) <= 0) continue
    n += cellCount(m)
  }
  return n
}

/** Bonded lots the cage can hold. */
export const lotsAboard = (s: GameState): number => {
  let n = 0
  for (const m of s.modules) {
    if (m.kind !== 'market' || m.standby) continue
    n += lotCount(m)
  }
  return n
}

/**
 * What a Trading Hub is worth, 0 upwards. It pulls traffic in and narrows the
 * gap between what a hull charges you and what it will pay you.
 */
export const commerce = (s: GameState): number => {
  const crewById = new Map(s.crew.map((c) => [c.id, c]))
  let n = 0
  for (const m of s.modules) {
    if (m.kind !== 'market' || m.standby) continue
    n += (def(m.kind).commerce ?? 0) * m.width * m.level * mergeBonus(m) * workRate(m, crewById)
  }
  return n
}

/** How much of what the crew burn is recovered, capped short of free. */
export const recycled = (s: GameState): number => {
  const crewById = new Map(s.crew.map((c) => [c.id, c]))
  let n = 0
  for (const m of s.modules) {
    if (m.kind !== 'reclaimer' || m.standby) continue
    n += (def(m.kind).recycles ?? 0) * m.width * m.level * mergeBonus(m) * workRate(m, crewById)
  }
  return Math.min(0.55, n)
}

/** How much of the scan's uncertainty a Sensor Array resolves, 0..0.9. */
export const sensorEdge = (s: GameState): number => {
  const crewById = new Map(s.crew.map((c) => [c.id, c]))
  let n = 0
  for (const m of s.modules) {
    if (m.kind !== 'sensor' || m.standby) continue
    n += (def(m.kind).sensors ?? 0) * m.width * m.level * mergeBonus(m) * workRate(m, crewById)
  }
  return Math.min(0.9, n)
}

/**
 * How well the station can keep an arrangement off the record.
 *
 * Without a Covert Ops room you are conducting your private business on the
 * open channel and hoping, which is roughly as safe as it sounds. With one, it
 * is a manageable risk — never a safe one. Nothing here reaches certainty.
 */
export const discretion = (s: GameState): number => {
  const crewById = new Map(s.crew.map((c) => [c.id, c]))
  let n = 0
  for (const m of s.modules) {
    if (m.kind !== 'covertops' || m.standby) continue
    n += (def(m.kind).discretion ?? 0) * m.width * m.level * mergeBonus(m) * workRate(m, crewById)
  }
  return Math.min(0.75, n)
}

/** The odds a quiet arrangement comes out, if you take one right now. */
export const exposureRisk = (s: GameState): number =>
  Math.max(0.06, 0.6 - discretion(s) - Math.min(0.1, s.modules.length * 0.004))

/** Whether the station can send teams past the comms envelope, and how far. */
export const reach = (s: GameState): number => {
  const crewById = new Map(s.crew.map((c) => [c.id, c]))
  let n = 0
  for (const m of s.modules) {
    if (m.kind !== 'dso' || m.standby) continue
    n += (def(m.kind).reach ?? 0) * m.width * m.level * mergeBonus(m) * workRate(m, crewById)
  }
  return n
}

/**
 * What a hull will pay for your surplus, as a fraction of what it charges.
 * Without a floor to trade on you take what you are given; a Trading Hub
 * closes most of that gap, and never all of it.
 */
export const sellMargin = (s: GameState): number =>
  Math.min(0.92, SELL_MARGIN + commerce(s) * 0.14)

/**
 * The suspicion figure the desk actually sees.
 *
 * The raw number is deliberately unreliable — trouble mostly scans dirty and
 * honest ships mostly scan clean, and the overlap in the middle is the point of
 * the docking desk. A Sensor Array pulls the reading towards the truth of what
 * the hull *is*, without ever making it certain.
 */
export const scanOf = (s: GameState, v: Visitor): number => {
  const edge = sensorEdge(s)
  if (edge <= 0) return v.suspicion
  const truth = visitorDef(v.kind).trouble ? 1 : 0
  return clamp(v.suspicion + (truth - v.suspicion) * edge, 0, 1)
}

/**
 * How attractive the station looks to someone deciding whether to move here:
 * its size, whether it runs a genuine surplus, how the crew are holding up, and
 * whether there is money in the account. HQ will not send its best people to a
 * dark, hungry outpost, which is why the strongest applicants only turn up once
 * the place is worth joining.
 */
/** A spec is known once the Research Lab has finished working it out. */
export const knows = (s: GameState, id: SpecId): boolean => (s.specs[id] ?? 0) >= 1

/** Specs found but not yet finished, oldest first. */
export const openSpecs = (s: GameState): SpecId[] =>
  SPEC_IDS.filter((id) => s.specs[id] !== undefined && !knows(s, id))

/**
 * Whether a room can be built at all. Most are gated only on how many people
 * are aboard; a couple need a drawing somebody else made first.
 */
export const moduleLocked = (s: GameState, kind: ModuleKind): SpecId | null => {
  const spec = MODULE_SPEC[kind]
  return spec && !knows(s, spec) ? spec : null
}

/** How many pieces of kit are racked in the hold right now. */
export const heldItems = (s: GameState): number =>
  Object.values(s.stores).reduce((n, count) => n + (count ?? 0), 0)

/** Kit the Fab Shop could run off right now. */
export const fabricable = (s: GameState): ItemId[] =>
  (Object.keys(ITEM_SPEC) as ItemId[]).filter((item) => {
    const spec = ITEM_SPEC[item]
    return spec !== undefined && knows(s, spec)
  })

/** How fast the Research Lab works: its crew's Intellect, its size and its grid. */
export const researchRate = (s: GameState, crewById: Map<string, Crew>): number => {
  let rate = 0
  for (const m of s.modules) {
    if (m.kind !== 'library' || m.standby) continue
    rate += workRate(m, crewById) * m.width * m.level * mergeBonus(m) * 1.6
  }
  return rate
}

/** How fast the Fab Shop turns a known pattern into a thing. */
export const fabRate = (s: GameState, crewById: Map<string, Crew>): number => {
  let rate = 0
  for (const m of s.modules) {
    if (m.kind !== 'fabricator' || m.standby) continue
    rate += workRate(m, crewById) * m.width * m.level * mergeBonus(m)
  }
  return rate
}

export const visitorBerths = (s: GameState): number =>
  s.modules.filter((m) => m.kind === 'dock' && !m.standby).length * 2

/**
 * Bodies on the docking desk. Clamps do not close themselves: somebody has to
 * read the scan, talk the hull in and work the gangway, so an empty port takes
 * no traffic however many berths it has.
 */
export const dockOfficers = (s: GameState): number =>
  s.modules
    .filter((m) => m.kind === 'dock' && !m.standby)
    .reduce((n, m) => n + m.staff.length, 0)

/**
 * True when a docking port is set to wave arrivals straight in. It is still a
 * standing order to the person on the desk, not an unmanned system — the
 * setting decides whether the commander is asked, not whether anyone is there.
 */
export const autoAccepting = (s: GameState): boolean =>
  dockOfficers(s) > 0 && s.modules.some((m) => m.kind === 'dock' && m.autoAccept && !m.standby)

/** Hull berths across every hangar bay. */
export const fleetCapacity = (s: GameState): number =>
  s.modules.reduce((n, m) => n + shipBerths(m), 0)

/** Applicant berths across every docking port. */
export const dockBerths = (s: GameState): number =>
  s.modules.filter((m) => m.kind === 'dock').reduce((n, m) => n + berths(m), 0)
