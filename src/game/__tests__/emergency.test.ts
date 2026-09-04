import assert from 'node:assert/strict'
import test from 'node:test'
import { WING, advance, newGame, reducer } from '../engine.ts'
import { incidentDef } from '../incidents.ts'
import type { GameState, Incident, IncidentKind, StationModule } from '../types.ts'

// Every station in this file is founded from a known seed, so a run that passes
// today passes tomorrow. Each call moves the seed on, so a loop that founds
// forty stations still sees forty different ones.
let founded = 0
const fresh = () => newGame('Spaceport-99', 1100 + (founded += 1))

const roomAt = (s: GameState, col: number, deck = 0): StationModule =>
  s.modules.find((m) => m.deck === deck && col >= m.col && col < m.col + m.width) as StationModule

/** Light a fire (or worse) in a room without waiting for the RNG to do it. */
const ignite = (s: GameState, module: StationModule, kind: IncidentKind = 'fire', hp = 40): GameState => {
  const inc: Incident = {
    id: `i-${module.id}`,
    kind,
    moduleId: module.id,
    hp,
    maxHp: hp,
    spreadIn: incidentDef(kind).spreadSeconds,
    startedAt: s.elapsed,
  }
  return { ...s, incidents: [...s.incidents, inc] }
}

const assign = (s: GameState, crewId: string, moduleId: string | null) =>
  reducer(s, { type: 'assign', crewId, moduleId })

/** The founding rooms come pre-staffed; empty one so a test can post to it. */
const clear = (s: GameState, module: StationModule): GameState => {
  let out = s
  for (const id of [...(out.modules.find((m) => m.id === module.id)?.staff ?? [])]) {
    out = assign(out, id, null)
  }
  return out
}

test('drafting crew into an emergency remembers the station they left', () => {
  let s = fresh()
  const reactor = roomAt(s, WING)
  const air = roomAt(s, WING - 1)
  const hand = s.crew[0]
  s = clear(s, reactor)
  s = clear(s, air)
  s = assign(s, hand.id, reactor.id)
  assert.equal(s.crew.find((c) => c.id === hand.id)?.returnTo, null, 'a normal posting is permanent')

  s = ignite(s, air)
  s = assign(s, hand.id, air.id)
  const drafted = s.crew.find((c) => c.id === hand.id)
  assert.equal(drafted?.assignment, air.id, 'they are fighting the fire')
  assert.equal(drafted?.returnTo, reactor.id, 'and the reactor is still theirs')
})

test('crew walk back to their own station once the emergency is out', () => {
  let s = fresh()
  const reactor = roomAt(s, WING)
  const air = roomAt(s, WING - 1)
  const hand = s.crew[0]
  s = clear(s, reactor)
  s = clear(s, air)
  s = assign(s, hand.id, reactor.id)
  s = ignite(s, air, 'fire', 3)
  s = assign(s, hand.id, air.id)

  // Three seconds of hoses against three hit points settles it.
  s = advance(s, 6)
  assert.equal(s.incidents.length, 0, 'the fire is out')
  const back = s.crew.find((c) => c.id === hand.id)
  assert.equal(back?.assignment, reactor.id, 'and they are back on the reactor')
  assert.equal(back?.returnTo, null, 'with nothing left owing')
})

test('a drafted hand who is beaten back still remembers their real post', () => {
  let s = fresh()
  const reactor = roomAt(s, WING)
  const air = roomAt(s, WING - 1)
  const hand = s.crew[0]
  s = clear(s, reactor)
  s = clear(s, air)
  s = assign(s, hand.id, reactor.id)
  // A long fire, and a body already close to giving out.
  s = ignite(s, air, 'fire', 4000)
  s = {
    ...s,
    crew: s.crew.map((c) => (c.id === hand.id ? { ...c, hp: c.maxHp * 0.26 } : c)),
  }
  s = assign(s, hand.id, air.id)
  s = advance(s, 4)

  const fled = s.crew.find((c) => c.id === hand.id)
  assert.equal(fled?.assignment, null, 'they fell back from the fire')
  assert.equal(fled?.returnTo, reactor.id, 'to the reactor, not back into the flames')
})

test('crew with nowhere to return to just stay where they fought', () => {
  let s = fresh()
  const air = roomAt(s, WING - 1)
  const hand = s.crew[0]
  s = clear(s, air)
  s = assign(s, hand.id, null)
  s = ignite(s, air, 'fire', 3)
  s = assign(s, hand.id, air.id)
  s = advance(s, 6)

  assert.equal(s.incidents.length, 0)
  const after = s.crew.find((c) => c.id === hand.id)
  assert.equal(after?.assignment, air.id, 'an off-duty hand holds the room they saved')
  assert.equal(after?.returnTo, null)
})
