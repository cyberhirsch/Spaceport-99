import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ESSENTIAL,
  advance,
  derive,
  idleCrew,
  jobPriority,
  newGame,
  reducer,
} from '../engine.ts'
import { staffSlots } from '../modules.ts'
import { unassign } from '../staffing.ts'
import type { GameState, ModuleKind } from '../types.ts'

let founded = 0
const fresh = () => newGame('Spaceport-99', 7700 + (founded += 1))

const place = (s: GameState, kind: ModuleKind): GameState => {
  for (let deck = 0; deck < Math.max(1, s.decks); deck += 1) {
    for (let col = 0; col < 12; col += 1) {
      const next = reducer(s, { type: 'build', kind, deck, col })
      if (next.modules.length > s.modules.length) return next
    }
  }
  throw new Error(`could not place ${kind}`)
}

test('a founding station has exactly enough people for the rooms it comes with', () => {
  const s = fresh()
  assert.equal(idleCrew(s).length, 0, 'nobody is spare')
  for (const m of s.modules) {
    if (staffSlots(m) === 0) continue
    assert.ok(m.staff.length > 0, `${m.kind} is manned`)
  }
})

test('the comms desk gets manned even when nobody is spare', () => {
  // This is the dead end the whole early game used to have in it. Asking HQ
  // for crew needs somebody on the comms desk; a founding station has nobody
  // spare to put there; and auto-assign only ever filled from the idle pool.
  // So the first station anybody built could never grow.
  let s = place({ ...fresh(), credits: 5000 }, 'comms')
  const comms = s.modules.find((m) => m.kind === 'comms')!
  assert.equal(comms.staff.length, 0, 'it starts empty, because everyone is busy')
  assert.equal(idleCrew(s).length, 0, 'and nobody is idle to fill it')

  s = reducer(s, { type: 'autoAssign' })
  const after = s.modules.find((m) => m.kind === 'comms')!
  assert.ok(after.staff.length > 0, 'somebody was moved onto the desk')

  // And nothing was stripped to nobody in the process.
  for (const m of s.modules) {
    if (staffSlots(m) === 0) continue
    assert.ok(m.staff.length > 0, `${m.kind} still has somebody in it`)
  }
})

test('and the station can then actually ask for people', () => {
  let s = place({ ...fresh(), credits: 5000 }, 'comms')
  s = reducer(s, { type: 'autoAssign' })
  const asked = reducer(s, { type: 'requestCrew' })
  assert.notEqual(asked, s, 'the request went out')
  assert.ok(asked.candidates.length > 0, 'and somebody is on their way')
})

test('a room nobody needs does not get to rob life support', () => {
  // The reshuffle is for the posts that decide whether the station has a
  // future. An Observation Deck is not one of them.
  let s: GameState = { ...fresh(), credits: 90000, decks: 2 }
  s = place(s, 'quarters')
  const before = s.modules.find((m) => m.kind === 'atmospherics')!.staff.length
  s = place(s, 'observatory')
  s = reducer(s, { type: 'autoAssign' })
  const after = s.modules.find((m) => m.kind === 'atmospherics')!.staff.length
  assert.equal(after, before, 'life support was left alone')
})

test('the comms desk stops being special once there are bunks to spare', () => {
  const s = place({ ...fresh(), credits: 5000 }, 'comms')
  const comms = s.modules.find((m) => m.kind === 'comms')!
  assert.ok(jobPriority(s, comms) <= ESSENTIAL, 'urgent while the station is short')

  const full: GameState = { ...s, crew: s.crew.map((c) => ({ ...c })) }
  // Pretend every bunk is taken: the desk is now just another earner.
  const packed: GameState = {
    ...full,
    crew: [...full.crew, ...Array.from({ length: 40 }, (_, i) => ({ ...full.crew[0], id: `c_${i}` }))],
  }
  assert.ok(jobPriority(packed, comms) > ESSENTIAL, 'ordinary once the bunks are full')
})

test('a station that is left alone grows rather than standing still', () => {
  // The regression this guards: a five-hour run that never gained a crew member.
  let s: GameState = { ...fresh(), credits: 5000 }
  s = place(s, 'comms')
  s = place(s, 'quarters')
  s = reducer(s, { type: 'autoAssign' })
  const start = derive(s).crewAlive.length
  for (let i = 0; i < 40; i += 1) {
    s = advance(s, 30)
    if (idleCrew(s).length > 0) s = reducer(s, { type: 'autoAssign' })
    const asked = reducer(s, { type: 'requestCrew' })
    if (asked !== s) s = asked
  }
  assert.ok(s.candidates.length > 0 || derive(s).crewAlive.length > start, 'people are arriving')
})

test('unassign clears a crew member from their station', () => {
  let s = fresh()
  const assigned = s.crew.find((c) => c.assignment)!
  assert.ok(assigned, 'a crew member is assigned at startup')
  const moduleId = assigned.assignment
  const module = s.modules.find((m) => m.id === moduleId)!
  unassign(s, assigned.id)
  assert.equal(assigned.assignment, null, 'they are no longer assigned')
  assert.equal(module.staff.some((id) => id === assigned.id), false, 'they are off the staff list')
})

test('unassign remembers returnTo when asked', () => {
  let s = fresh()
  const assigned = s.crew.find((c) => c.assignment)!
  const moduleId = assigned.assignment
  unassign(s, assigned.id, true)
  assert.ok(assigned.returnTo === moduleId, 'returnTo is set to the original assignment')
})
