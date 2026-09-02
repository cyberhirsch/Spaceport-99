import assert from 'node:assert/strict'
import test from 'node:test'
import { WING, canBuildAt, canDemolish, newGame, reducer } from '../engine.ts'
import type { GameState, ModuleKind } from '../types.ts'

const rich = (s: GameState): GameState => ({ ...s, credits: 999999 })
const build = (s: GameState, kind: ModuleKind, col: number, deck = 0) =>
  reducer(rich(s), { type: 'build', kind, deck, col })
const at = (s: GameState, col: number, deck = 0) =>
  s.modules.find((m) => m.deck === deck && col >= m.col && col < m.col + m.width)

test('the founding station straddles the lift shaft', () => {
  const g = newGame()
  assert.equal(g.modules.length, 4)
  assert.equal(g.decks, 1)
  assert.equal(at(g, WING - 2)?.kind, 'dock', 'the port the founders arrived through')
  assert.equal(at(g, WING - 1)?.kind, 'atmospherics', 'air plant sits port of the shaft')
  assert.equal(at(g, WING)?.kind, 'reactor', 'reactor sits starboard of it')
  assert.equal(at(g, WING + 1)?.kind, 'hydroponics')
})

test('wings only grow outward from the shaft', () => {
  const g = newGame()
  assert.equal(canBuildAt(g, 0, WING - 2), false, 'the dock already holds that slot')
  assert.equal(canBuildAt(g, 0, WING - 3), true, 'next to the last port room')
  assert.equal(canBuildAt(g, 0, WING - 4), false, 'but not with a gap between')
  assert.equal(canBuildAt(g, 0, 0), false, 'and never at the far end first')
  assert.equal(canBuildAt(g, 0, WING + 2), true, 'next to the last starboard room')
  assert.equal(canBuildAt(g, 0, WING + 3), false)
  assert.equal(canBuildAt(g, 0, WING), false, 'an occupied slot is not buildable')
  assert.equal(canBuildAt(g, 1, WING), false, 'nor is a deck that is not pressurised')
})

test('a wing fills to exactly five slots', () => {
  let s = newGame()
  for (let col = WING - 2; col >= 0; col -= 1) s = build(s, 'quarters', col)
  assert.ok(
    [0, 1, 2, 3, 4].every((col) => at(s, col)),
    'every port slot is occupied',
  )
  assert.ok(
    [0, 1, 2, 3, 4].every((col) => !canBuildAt(s, 0, col)),
    'and none of them is buildable any more',
  )
})

test('rooms never merge across the shaft', () => {
  const s = build(newGame(), 'reactor', WING - 1)
  const port = at(s, WING - 1)
  const starboard = at(s, WING)
  assert.notEqual(port?.id, starboard?.id, 'the two reactors stay separate rooms')
  assert.equal(port?.width, 1)
  assert.equal(starboard?.width, 1)
})

test('rooms do merge within a wing', () => {
  let s = build(newGame(), 'reactor', WING + 2)
  s = build(s, 'reactor', WING + 3)
  const merged = s.modules.filter((m) => m.kind === 'reactor' && m.col > WING)
  assert.equal(merged.length, 1, 'the pair became one room')
  assert.equal(merged[0].width, 2)
  assert.equal(merged[0].col, WING + 2)
  assert.equal(at(s, WING)?.width, 1, 'the shaft-side reactor is untouched')
})

test('only the outer end of a run can be scrapped', () => {
  let s = build(newGame(), 'quarters', WING + 2)
  s = build(s, 'gym', WING + 3)
  assert.equal(canDemolish(s, at(s, WING + 2)!), false, 'a room with one beyond it is stuck')
  assert.equal(canDemolish(s, at(s, WING + 3)!), true, 'the end of the run is free')
  assert.equal(canDemolish(s, at(s, WING)!), false, 'the innermost starboard room is stuck')
  assert.equal(canDemolish(s, at(s, WING - 1)!), false, 'the air plant has the dock outboard of it')
  assert.equal(canDemolish(s, at(s, WING - 2)!), true, 'the dock is the end of the port run')

  const before = s.modules.length
  assert.equal(
    reducer(s, { type: 'demolish', moduleId: at(s, WING + 2)!.id }).modules.length,
    before,
    'the action refuses a middle room',
  )
  assert.equal(
    reducer(s, { type: 'demolish', moduleId: at(s, WING + 3)!.id }).modules.length,
    before - 1,
    'and allows the end room',
  )
})

test('an emergency cannot spread across the shaft', () => {
  // Port and starboard rooms on the same deck are not neighbours, so a fire in
  // one wing has to burn out rather than jump the lift.
  let s = build(newGame(), 'quarters', WING - 2)
  s = { ...s, nextIncidentIn: 0 }
  const portRooms = s.modules.filter((m) => m.col < WING).map((m) => m.id)
  assert.ok(portRooms.length >= 2)
  assert.equal(canBuildAt(s, 0, WING - 3), true, 'the port wing can still grow outward')
})
