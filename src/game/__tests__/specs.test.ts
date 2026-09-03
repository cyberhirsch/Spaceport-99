import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advance,
  fabricable,
  knows,
  moduleLocked,
  newGame,
  openSpecs,
  reducer,
  researchRate,
} from '../engine.ts'
import { SPEC_IDS, specDef } from '../specs.ts'
import type { GameState, ModuleKind, SpecId } from '../types.ts'

const rich = (s: GameState): GameState => ({ ...s, credits: 80000 })

const build = (s: GameState, kind: ModuleKind, col: number, deck = 0): GameState =>
  reducer(rich(s), { type: 'build', kind, deck, col })

/**
 * Runs the clock without letting the station starve in the dark, so a test
 * about paperwork is not really a test about life support.
 */
const run = (s: GameState, seconds: number): GameState => {
  let out = s
  for (let t = 0; t < seconds; t += 30) {
    out = advance(out, 30)
    out = { ...out, resources: { power: 400, air: 400, food: 400 } }
  }
  return out
}

/** Moves the whole watch into one room, so it actually runs. */
const staff = (s: GameState, kind: ModuleKind): GameState => {
  const m = s.modules.find((x) => x.kind === kind)
  if (!m) throw new Error(`no ${kind}`)
  let out = s
  for (const c of s.crew.filter((c) => !c.dead)) {
    out = reducer(out, { type: 'assign', crewId: c.id, moduleId: m.id })
  }
  return out
}

test('a fresh station has found nothing and knows nothing', () => {
  const s = newGame()
  assert.deepEqual(s.specs, {})
  assert.equal(s.researching, null)
  assert.equal(s.fabricating, null)
  assert.deepEqual(openSpecs(s), [])
  assert.deepEqual(fabricable(s), [])
})

test('the gated rooms cannot be built, and the gate names the spec', () => {
  const s = newGame()
  assert.equal(moduleLocked(s, 'shield'), 'shield')
  assert.equal(moduleLocked(s, 'vault'), 'vault')
  // The defence battery is not gated — a station can always arm itself.
  assert.equal(moduleLocked(s, 'battery'), null)
  assert.equal(moduleLocked(s, 'reactor'), null)
})

test('building a gated room is refused even with the money and the floor', () => {
  const s = newGame()
  const tried = build(s, 'shield', 2)
  assert.equal(tried.modules.length, s.modules.length)
})

test('a found spec is not a known spec', () => {
  const s: GameState = { ...newGame(), specs: { shield: 0 } }
  assert.equal(knows(s, 'shield'), false)
  assert.deepEqual(openSpecs(s), ['shield'])
  assert.equal(moduleLocked(s, 'shield'), 'shield')
})

test('the lab works a spec out, and then the room can be built', () => {
  let s: GameState = { ...newGame(), specs: { shield: 0 }, researching: 'shield' }
  s = build(s, 'library', 2)
  s = staff(s, 'library')
  assert.ok(researchRate(s, new Map(s.crew.map((c) => [c.id, c]))) > 0)

  // Wait on the condition, not the clock: a fire in the lab stalls the work,
  // so the honest bound is generous.
  for (let t = 0; t < specDef('shield').effort * 4 && !knows(s, 'shield'); t += 30) {
    s = run(s, 30)
  }
  assert.equal(knows(s, 'shield'), true)
  assert.equal(moduleLocked(s, 'shield'), null)
  assert.equal(s.researching, null)

  const built = build(s, 'shield', 7)
  assert.equal(built.modules.length, s.modules.length + 1)
})

test('nothing is worked out without a lab, however long you wait', () => {
  const s: GameState = { ...newGame(), specs: { shield: 0 }, researching: 'shield' }
  const later = advance(s, 4000)
  assert.equal(knows(later, 'shield'), false)
  assert.equal(later.specs.shield, 0)
})

test('the lab moves on to the next drawing on its own', () => {
  let s: GameState = { ...newGame(), specs: { torch: 0, rig: 0 }, researching: 'torch' }
  s = build(s, 'library', 2)
  s = staff(s, 'library')
  // Stop the clock the moment the first one lands — the lab trains the very
  // stat it runs on, so left alone it would finish the second one too.
  while (!knows(s, 'torch')) s = run(s, 30)
  assert.equal(s.researching, 'rig')
  assert.equal(knows(s, 'rig'), false)
})

test('setting a drawing aside keeps the work already done on it', () => {
  let s: GameState = { ...newGame(), specs: { torch: 0, rig: 0 }, researching: 'torch' }
  s = build(s, 'library', 2)
  s = staff(s, 'library')
  s = run(s, 60)
  const at = s.specs.torch ?? 0
  assert.ok(at > 0 && at < 1)

  s = reducer(s, { type: 'research', spec: 'rig' })
  assert.equal(s.researching, 'rig')
  s = run(s, 60)
  assert.equal(s.specs.torch, at, 'the shelved drawing did not move')
  assert.ok((s.specs.rig ?? 0) > 0)
})

test('the lab will not take up a drawing nobody has found', () => {
  const s = newGame()
  assert.equal(reducer(s, { type: 'research', spec: 'torch' }), s)
})

test('kit has to be worked out before the shop will run it', () => {
  let s: GameState = { ...newGame(), specs: {}, credits: 80000 }
  s = build(s, 'fabricator', 2)
  s = staff(s, 'fabricator')
  assert.deepEqual(fabricable(s), [])
  assert.equal(reducer(s, { type: 'fabricate', item: 'torch' }), s)

  s = { ...s, specs: { torch: 1 } }
  assert.deepEqual(fabricable(s), ['torch'])
})

test('a fabrication run costs up front and lands one item in the hold', () => {
  let s: GameState = { ...newGame(), specs: { torch: 1 }, credits: 80000 }
  s = build(s, 'fabricator', 2)
  s = staff(s, 'fabricator')

  const before = s.credits
  const build0 = specDef('torch').build!
  s = reducer(s, { type: 'fabricate', item: 'torch' })
  assert.equal(s.credits, before - build0.credits)
  assert.equal(s.fabricating?.item, 'torch')

  // One run at a time.
  assert.equal(reducer(s, { type: 'fabricate', item: 'torch' }), s)

  s = run(s, build0.seconds * 3)
  assert.equal(s.fabricating, null)
  assert.equal(s.stores.torch, 1)
})

test('cancelling a run gives the materials back', () => {
  let s: GameState = { ...newGame(), specs: { torch: 1 }, credits: 80000 }
  s = build(s, 'fabricator', 2)
  s = staff(s, 'fabricator')
  const cost = specDef('torch').build!.credits
  s = reducer(s, { type: 'fabricate', item: 'torch' })
  s = run(s, 10)
  // The station earns while the clock runs, so measure the refund, not the till.
  const held = s.credits
  s = reducer(s, { type: 'fabricate', item: null })
  assert.equal(s.fabricating, null)
  assert.equal(s.credits, held + cost)
  assert.equal(s.stores.torch, undefined)
})

test('a shop with nobody in it makes nothing', () => {
  let s: GameState = { ...newGame(), specs: { torch: 1 }, credits: 80000 }
  s = build(s, 'fabricator', 2)
  s = reducer(s, { type: 'fabricate', item: 'torch' })
  s = advance(s, 2000)
  assert.equal(s.stores.torch, undefined)
  assert.ok((s.fabricating?.progress ?? 0) === 0)
})

test('the fabricate-only kit cannot be bought anywhere', async () => {
  const { ITEM_DEFS } = await import('../gear.ts')
  for (const id of ['torch', 'rig'] as const) {
    assert.equal(ITEM_DEFS[id].price, 0)
    assert.deepEqual(ITEM_DEFS[id].sellers, {})
  }
})

test('every spec unlocks something real, and nothing twice', () => {
  const seen = new Set<string>()
  for (const id of SPEC_IDS) {
    const u = specDef(id).unlocks
    const key = u.kind === 'module' ? `m:${u.module}` : `i:${u.item}`
    assert.ok(!seen.has(key), `${key} is gated twice`)
    seen.add(key)
    // Item specs need a build recipe; module specs must not have one.
    if (u.kind === 'item') assert.ok(specDef(id).build, `${id} has no build`)
    else assert.equal(specDef(id).build, undefined)
  }
  assert.equal(SPEC_IDS.length, (Object.keys({}) as SpecId[]).length + 4)
})
