import { missionSlots } from './modules.ts'
import { makeCrew } from './crew.ts'
import { SPEC_IDS, specDef } from './specs.ts'
import { OUTCOME_INFO, makeShip, rollOutcome, shipCargo, shipHull } from './fleet.ts'
import type { Crew, Mission, Ship, GameState } from './types.ts'
import { clamp, log, namesInPlay, pickOne, roll, roller } from './core.ts'
import { unassign, awardXpTo, allocatePortrait } from './staffing.ts'
import { reach, fleetCapacity } from './rooms.ts'
import { derive } from './state.ts'
import { shift } from './standing.ts'

// Contracts in flight: capacity, contact, hails, and what came home.

/**
 * Whether the next contract on the wire is far work. Nothing offers it until
 * somebody aboard can plot a fix without a beacon, and even then it stays the
 * minority of what comes in.
 */
export const rollFar = (s: GameState): boolean => {
  const r = reach(s)
  return r > 0 && roll(s) < Math.min(0.45, 0.18 + r * 0.12)
}

/**
 * Brings a mission home and applies what happened. Injuries and hull damage are
 * the common cost of a bad run; losing the ship takes a disaster, and losing
 * people takes a disaster that goes badly on top of that.
 */
/**
 * Answers a hail. `theirs` marks a decision the away team made themselves
 * because nobody at the station was listening, which reads differently in the
 * report and is never the greedy option.
 */
export const answerCall = (s: GameState, m: Mission, index: number, theirs = false): void => {
  const call = m.call
  const choice = call?.options[index]
  if (!call || !choice) return
  if (choice.cost && s.credits < choice.cost) return
  if (choice.cost) s.credits -= choice.cost
  m.odds += choice.odds ?? 0
  m.haul *= choice.haul ?? 1
  m.strain += choice.strain ?? 0
  if (choice.standing) shift(s, choice.standing[0], choice.standing[1])
  m.choices.push(theirs ? `${choice.note} Nobody was on the channel to say otherwise.` : choice.note)
  m.call = null
  m.status = 'flying'
  // One hail is rarely the end of it.
  m.nextCall = m.remaining > 90 ? Math.round(m.remaining * (0.4 + roll(s) * 0.3)) : 0
  if (theirs) log(s, `${m.name} stopped waiting for an answer and made the call themselves.`, 'warn')
}

export const resolveMission = (s: GameState, m: Mission): void => {
  const ship = s.ships.find((x) => x.id === m.shipId) ?? null
  const team = m.crewIds
    .map((id) => s.crew.find((c) => c.id === id))
    .filter((c): c is Crew => c !== undefined && !c.dead)
  const outcome = rollOutcome(roller(s), team, m, ship)
  m.status = 'report'
  m.outcome = outcome
  m.remaining = 0

  // An open job brings home what it gathered; everything else is judged on
  // the work rather than the hours.
  const yieldOf =
    { triumph: 1.5, success: 1, setback: 0.35, disaster: 0 }[outcome] * Math.max(0, m.haul)
  const cargo = ship ? shipCargo(ship) : 1
  const caps = derive(s).caps
  let credits = 0
  if (yieldOf > 0) {
    credits = Math.round(m.payout.credits * yieldOf * cargo)
    s.credits += credits
    for (const key of ['power', 'air', 'food'] as const) {
      const amount = Math.round(m.payout[key] * yieldOf * cargo)
      s.resources[key] = clamp(s.resources[key] + amount, 0, caps[key])
    }
  }

  // Some work is paid in somebody's opinion rather than in credits.
  if (m.standing) {
    const [who, amount] = m.standing
    const earned = { triumph: 1.2, success: 1, setback: 0.2, disaster: -0.6 }[outcome]
    shift(s, who, Math.abs(amount) * earned)
  }

  // Damage: the ship takes it first, the crew take what is left.
  const harm = { triumph: 0, success: 0.08, setback: 0.3, disaster: 0.65 }[outcome]
  if (ship && harm > 0) {
    ship.hull = Math.max(0, Math.round(ship.hull - shipHull(ship) * harm))
  }
  for (const c of team) {
    const idx = s.crew.findIndex((x) => x.id === c.id)
    if (idx < 0) continue
    const hurt = Math.round(s.crew[idx].maxHp * harm * (0.6 + roll(s) * 0.8))
    s.crew[idx] = { ...s.crew[idx], hp: Math.max(1, s.crew[idx].hp - hurt) }
  }

  // Only a disaster can cost you the hull or the people, and even then not always.
  let lostShip = false
  if (outcome === 'disaster' && ship) {
    if (ship.hull <= 0 || roll(s) < 0.35) {
      s.ships = s.ships.filter((x) => x.id !== ship.id)
      lostShip = true
    }
  }
  let lostCrew = 0
  if (outcome === 'disaster') {
    for (const c of team) {
      if (roll(s) >= 0.18) continue
      const idx = s.crew.findIndex((x) => x.id === c.id)
      if (idx < 0) continue
      s.crew[idx] = { ...s.crew[idx], dead: true, hp: 0, returnTo: null }
      unassign(s, c.id)
      lostCrew += 1
    }
  }

  // Working drawings are the one find that is not a lottery. They come off
  // dangerous jobs, because that is where nobody is left to keep their papers,
  // and there are only ever four of them to bring home.
  const fresh = SPEC_IDS.filter((id) => s.specs[id] === undefined)
  if (
    fresh.length > 0 &&
    outcome !== 'disaster' &&
    roll(s) < (outcome === 'triumph' ? 0.24 : 0.1) + m.danger * 0.22
  ) {
    const id = pickOne(roller(s), fresh)
    s.specs[id] = 0
    if (!s.researching) s.researching = id
    const sd = specDef(id)
    m.find = { kind: 'spec', detail: `${sd.name}, off ${sd.found}.` }
    log(s, `${m.name} came back with a spec: ${sd.name}.`, 'good')
  }

  // Rare finds, and never on a run that went wrong.
  if (!m.find && (outcome === 'triumph' || (outcome === 'success' && roll(s) < 0.15))) {
    const r = roll(s)
    if (r < 0.4 && s.crew.filter((c) => !c.dead).length < derive(s).crewCap) {
      const survivor = makeCrew(roller(s), { portrait: allocatePortrait(s) })
      s.crew.push(survivor)
      m.find = { kind: 'survivor', detail: `${survivor.name} came back with them and stayed.` }
    } else if (r < 0.65 && s.ships.length < fleetCapacity(s)) {
      const hull = makeShip(roller(s), 'shuttle', undefined, namesInPlay(s))
      hull.hull = Math.round(hull.maxHull * 0.5)
      s.ships.push(hull)
      m.find = { kind: 'ship', detail: `They towed home a derelict — the ${hull.name}, half-dead.` }
    } else {
      const bump = Math.round(80 + m.danger * 200)
      for (const key of ['power', 'air', 'food'] as const) {
        s.resources[key] = clamp(s.resources[key] + bump, 0, caps[key])
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

/** Missions that can be in flight at once. */
/**
 * Missions in flight at once. A command module provides the berths; somebody
 * has to sit in it to hold each channel open, so capacity is whichever of the
 * two runs out first. A room nobody is in hears nothing off the wire and
 * cannot fly anything either.
 */
export const missionCapacity = (s: GameState): number => {
  let berths = 0
  let controllers = 0
  for (const m of s.modules) {
    if (missionSlots(m) <= 0 || m.standby) continue
    berths += missionSlots(m)
    controllers += m.staff.length
  }
  return Math.min(berths, controllers)
}

/** Berths the command module could hold open if it were fully crewed. */
export const missionBerths = (s: GameState): number =>
  s.modules.reduce((n, m) => n + (m.standby ? 0 : missionSlots(m)), 0)

/**
 * Jobs the station still has a channel open to, oldest first. Capacity is the
 * number of controllers, so pulling people out of the command module does not
 * bring anybody home — it just stops you being able to tell them anything.
 */
export const inContact = (s: GameState): Set<string> => {
  const flying = s.missions.filter(
    (m) => (m.status === 'flying' || m.status === 'calling') && !m.far,
  )
  return new Set(flying.slice(0, missionCapacity(s)).map((m) => m.id))
}

/** Ships sitting in a hangar rather than out on a job. */
export const berthedShips = (s: GameState): Ship[] => s.ships.filter((x) => !x.missionId)
