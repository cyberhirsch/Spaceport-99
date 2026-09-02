import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_MERGE,
  WING,
  canMove,
  canRelocate,
  maxLevel,
  mergeBonus,
  moveCost,
  newGame,
  reducer,
  relocateAnchor,
  staffSlots,
} from '../engine.ts'
import { cycleYield } from '../modules.ts'
import type { GameState, ModuleKind, StationModule } from '../types.ts'

const rich = (s: GameState): GameState => ({ ...s, credits: 999999 })
const build = (s: GameState, kind: ModuleKind, col: number, deck = 0) =>
  reducer(rich(s), { type: 'build', kind, deck, col })
const at = (s: GameState, col: number, deck = 0): StationModule =>
  s.modules.find((m) => m.deck === deck && col >= m.col && col < m.col + m.width) as StationModule
const upgrade = (s: GameState, m: StationModule) =>
  reducer(rich(s), { type: 'upgrade', moduleId: m.id })

test('a room on its own takes one upgrade; a merged run takes two', () => {
  let s = newGame()
  s = build(s, 'quarters', WING - 3)
  const lone = at(s, WING - 3)
  assert.equal(maxLevel(lone), 2, 'sealed at level 2 while it stands alone')
  assert.equal(staffSlots(lone), 2, 'two workstations to start')

  s = upgrade(s, lone)
  assert.equal(at(s, WING - 3).level, 2)
  assert.equal(staffSlots(at(s, WING - 3)), 3, 'the last fit-out finds room for one more')

  s = upgrade(s, at(s, WING - 3))
  assert.equal(at(s, WING - 3).level, 2, 'and there is no third level for a single room')
})

test('a fully merged, fully upgraded Crew Quarters works seven', () => {
  let s = newGame()
  for (const col of [WING - 3, WING - 4, WING - 5]) s = build(s, 'quarters', col)
  let block = at(s, WING - 3)
  assert.equal(block.width, MAX_MERGE, 'three shells welded into one run')
  assert.equal(staffSlots(block), 6)
  assert.equal(maxLevel(block), 3, 'merging buys the second upgrade')

  s = upgrade(s, block)
  block = at(s, WING - 3)
  s = upgrade(s, block)
  block = at(s, WING - 3)
  assert.equal(block.level, 3)
  assert.equal(staffSlots(block), 7)
})

test('shells weld together, fitted-out rooms do not', () => {
  let s = newGame()
  s = build(s, 'quarters', WING - 3)
  s = upgrade(s, at(s, WING - 3))
  s = build(s, 'quarters', WING - 4)
  assert.equal(at(s, WING - 3).width, 1, 'the upgraded room stays as it is')
  assert.equal(at(s, WING - 4).width, 1, 'and the new shell sits beside it')
})

test('a welded run out-produces the same floor area apart', () => {
  let s = newGame()
  s = build(s, 'hydroponics', WING + 2)
  const pair = at(s, WING + 1)
  assert.equal(pair.width, 2, 'it merged with the founding farm')
  assert.ok(Math.abs(mergeBonus(pair) - 1.15) < 1e-9)

  const single: StationModule = { ...pair, width: 1 }
  assert.ok(
    cycleYield(pair) > cycleYield(single) * 2,
    'two segments welded beat two segments apart',
  )
})

test('only a room at the end of a run can be cut loose', () => {
  const s = newGame()
  const farm = at(s, WING + 1)
  const reactor = at(s, WING)
  assert.equal(canRelocate(s, farm, 0, WING - 3), true, 'the outermost room comes free')
  assert.equal(
    canRelocate(s, reactor, 0, WING - 3),
    false,
    'pulling one out of the middle would strand the farm',
  )
  assert.equal(canMove(s, farm), true)
  assert.equal(canMove(s, reactor), false)
})

test('a room will not be set down across the lift shaft or off the end', () => {
  const s = newGame()
  const farm = at(s, WING + 1)
  assert.equal(canRelocate(s, farm, 0, WING - 1), false, 'that slot is taken')
  assert.equal(canRelocate(s, farm, 0, 0), false, 'and this one is not reachable from the lift')
  assert.equal(canRelocate(s, farm, 1, WING), false, 'deck 2 is not pressurised yet')
})

test('relocating charges for it and leaves both wings sound', () => {
  const before = rich(newGame())
  const farm = at(before, WING + 1)
  const cost = moveCost(farm)
  const s = reducer(before, { type: 'relocate', moduleId: farm.id, deck: 0, col: WING - 3 })

  assert.equal(s.credits, before.credits - cost, 'cutting it loose is not free')
  assert.equal(at(s, WING - 3).kind, 'hydroponics', 'and it is now port of the lift')
  assert.equal(s.modules.find((m) => m.id === farm.id)?.col, WING - 3)
  assert.equal(at(s, WING + 1), undefined, 'nothing left stranded starboard')
  assert.equal(at(s, WING).kind, 'reactor', 'which still ends at the reactor')
})

test('a wide run dropped on one cell slides until its footprint fits', () => {
  let s = newGame()
  s = build(s, 'hydroponics', WING + 2)
  const farm = at(s, WING + 1)
  assert.equal(farm.width, 2)
  // Port has the dock and the air plant; a 2-wide run has to sit on 1 and 2.
  assert.equal(canRelocate(s, farm, 0, WING - 3), false, 'anchored there it would overrun the dock')
  assert.equal(relocateAnchor(s, farm, 0, WING - 3), WING - 4, 'so it slides one outward')

  const moved = reducer(rich(s), { type: 'relocate', moduleId: farm.id, deck: 0, col: WING - 3 })
  assert.equal(moved.modules.find((m) => m.id === farm.id)?.col, WING - 4)
})

test('a moved room welds into whatever it lands against', () => {
  let s = newGame()
  // Shift the dock out of the way so the air plant sits at the end of the port
  // wing, then bring a second air plant round to meet it.
  const dock = at(s, WING - 2)
  s = reducer(rich(s), { type: 'relocate', moduleId: dock.id, deck: 0, col: WING + 2 })
  s = build(s, 'atmospherics', WING + 3)
  const stray = at(s, WING + 3)
  assert.equal(stray.width, 1, 'it landed against the dock, not another air plant')

  const moved = reducer(rich(s), { type: 'relocate', moduleId: stray.id, deck: 0, col: WING - 2 })
  const run = moved.modules.find((m) => m.kind === 'atmospherics') as StationModule
  assert.equal(run.width, 2, 'set down against the founding air plant, they weld')
  assert.equal(run.col, WING - 2, 'and the run starts at the outer segment')
})

test('a room on fire is bolted down until the emergency is over', () => {
  const s = newGame()
  const farm = at(s, WING + 1)
  const burning: GameState = {
    ...s,
    incidents: [
      {
        id: 'i1',
        kind: 'fire',
        moduleId: farm.id,
        hp: 40,
        maxHp: 40,
        spreadIn: 30,
        startedAt: 0,
      },
    ],
  }
  assert.equal(canMove(burning, farm), false)
  assert.equal(canRelocate(burning, farm, 0, WING - 4), false)
})
