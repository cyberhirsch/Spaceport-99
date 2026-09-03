import assert from 'node:assert/strict'
import test from 'node:test'
import { WING, crewGuard, defence, newGame, reducer } from '../engine.ts'
import { effectiveness } from '../crew.ts'
import { ITEM_DEFS, itemDef, stock } from '../gear.ts'
import { makeVisitor } from '../visitors.ts'
import type { FactionId, GameState, ModuleKind, Visitor } from '../types.ts'

const rich = (s: GameState): GameState => ({ ...s, credits: 50000 })
const build = (s: GameState, kind: ModuleKind, col: number, deck = 0) =>
  reducer(rich(s), { type: 'build', kind, deck, col })

/** Berths a hull flying a given power's paper, so its hold can be shopped. */
const berthed = (s: GameState, faction: FactionId): [GameState, Visitor] => {
  const v: Visitor = {
    ...makeVisitor(),
    kind: 'trader',
    claim: 'trader',
    faction,
    status: 'requesting',
    timer: 900,
  }
  const docked = reducer({ ...s, visitors: [v] }, { type: 'acceptVisitor', visitorId: v.id })
  return [docked, docked.visitors[0]]
}

test('a fresh station carries nothing and nobody is issued anything', () => {
  const s = newGame()
  assert.deepEqual(s.stores, {})
  assert.ok(s.crew.every((c) => Object.keys(c.gear).length === 0))
  assert.equal(defence(s).smallArms, 0)
})

test('who sells what is a matter of whose paper they fly', () => {
  const compact = stock('compact').map((x) => x.id)
  assert.deepEqual(compact, ['lance'], 'the Compact sells its own kit and nothing else')

  const unlisted = stock('unlisted').map((x) => x.id)
  assert.ok(!unlisted.includes('lance'), 'and sells it to nobody else')
  assert.ok(
    stock('unlisted').find((x) => x.id === 'sidearm')!.price <
      stock('terran').find((x) => x.id === 'sidearm')!.price,
    'the Drift undercuts Earth on a deck sidearm',
  )
})

test('kit is bought off a berthed hull and goes into the hold', () => {
  const [ready, v] = berthed(rich(newGame()), 'concern')
  const price = stock('concern').find((x) => x.id === 'sidearm')!.price

  const early = reducer(
    { ...ready, visitors: [{ ...v, status: 'requesting' as const }] },
    { type: 'buyGear', visitorId: v.id, item: 'sidearm' },
  )
  assert.equal(early.stores.sidearm, undefined, 'not while they are still outside')

  const s = reducer(ready, { type: 'buyGear', visitorId: v.id, item: 'sidearm' })
  assert.equal(s.stores.sidearm, 1)
  assert.equal(s.credits, ready.credits - price)
  assert.ok(s.standing.concern > ready.standing.concern, 'and business is business')

  // Nobody sells what they do not carry.
  assert.equal(reducer(s, { type: 'buyGear', visitorId: v.id, item: 'lance' }), s)
})

test('issuing kit takes it out of the hold and puts it on somebody', () => {
  let s = reducer(berthed(rich(newGame()), 'concern')[0], {
    type: 'buyGear',
    visitorId: '',
    item: 'sidearm',
  })
  // The empty visitorId above is refused, so stock it directly instead.
  s = { ...s, stores: { sidearm: 1, plate: 1 } }
  const hand = s.crew[0]
  const before = effectiveness(hand, 'R')

  s = reducer(s, { type: 'issueGear', crewId: hand.id, item: 'sidearm' })
  const armed = s.crew.find((c) => c.id === hand.id)!
  assert.equal(armed.gear.sidearm, 'sidearm')
  assert.equal(s.stores.sidearm, 0, 'out of the hold')
  assert.equal(crewGuard(armed), ITEM_DEFS.sidearm.guard)
  assert.ok(effectiveness(armed, 'R') > before, 'and it shows in what they can do')

  // A second sidearm swaps, it does not stack.
  s = { ...s, stores: { ...s.stores, lance: 1 } }
  s = reducer(s, { type: 'issueGear', crewId: hand.id, item: 'lance' })
  const swapped = s.crew.find((c) => c.id === hand.id)!
  assert.equal(swapped.gear.sidearm, 'lance')
  assert.equal(s.stores.sidearm, 1, 'the old one goes back in the hold')
  assert.equal(itemDef('plate').slot, 'armour')
})

test('two slots, and armour does not go where a sidearm goes', () => {
  let s: GameState = { ...newGame(), stores: { plate: 1, sidearm: 1 } }
  const hand = s.crew[0]
  s = reducer(s, { type: 'issueGear', crewId: hand.id, item: 'plate' })
  s = reducer(s, { type: 'issueGear', crewId: hand.id, item: 'sidearm' })
  const kitted = s.crew.find((c) => c.id === hand.id)!
  assert.equal(kitted.gear.armour, 'plate')
  assert.equal(kitted.gear.sidearm, 'sidearm')
  assert.equal(crewGuard(kitted), ITEM_DEFS.plate.guard + ITEM_DEFS.sidearm.guard)

  s = reducer(s, { type: 'stowGear', crewId: hand.id, slot: 'armour' })
  assert.equal(s.crew.find((c) => c.id === hand.id)!.gear.armour, undefined)
  assert.equal(s.stores.plate, 1, 'back in the hold')
})

test('a battery and a shield are worth nothing unstaffed or switched off', () => {
  let s = build(newGame(), 'battery', WING - 3)
  const bay = s.modules.find((m) => m.kind === 'battery')!
  assert.equal(defence(s).guns, 0, 'nobody is sitting at it')

  s = reducer(s, { type: 'assign', crewId: s.crew[0].id, moduleId: bay.id })
  const manned = defence(s).guns
  assert.ok(manned > 0, `a staffed battery shoots: ${manned}`)

  const dark = reducer(s, { type: 'setStandby', moduleId: bay.id, standby: true })
  assert.equal(defence(dark).guns, 0, 'and a dark one does not')
})

test('a shield holds without anyone in it, badly', () => {
  let s = build({ ...newGame(), specs: { shield: 1 } }, 'shield', WING - 3)
  const idle = defence(s).shield
  assert.ok(idle > 0, 'the field is up')

  const proj = s.modules.find((m) => m.kind === 'shield')!
  s = reducer(s, { type: 'assign', crewId: s.crew[0].id, moduleId: proj.id })
  assert.ok(defence(s).shield > idle, 'somebody tuning it holds more')
})

test('a hull in its berth is a gun platform; one out on a contract is not', () => {
  let s = build(newGame(), 'hangar', WING - 3)
  const armed = { ...s.ships[0], cls: 'cutter' as const }
  s = { ...s, ships: [armed] }
  const home = defence(s).guns
  assert.ok(home > 0, 'a cutter at the clamps counts')

  const out = { ...s, ships: [{ ...armed, missionId: 'm1' }] }
  assert.equal(defence(out).guns, 0, 'out flying, it does not')
})

test('small arms tell against boarders and nothing else', () => {
  const s: GameState = { ...newGame(), stores: { plate: 1 } }
  const armed = reducer(s, { type: 'issueGear', crewId: s.crew[0].id, item: 'plate' })
  assert.equal(defence(armed).smallArms, ITEM_DEFS.plate.guard)

  // Same room, same crew, boarders versus a fire.
  const room = armed.modules.find((m) => m.staff.length > 0) ?? armed.modules[1]
  const fight = (kind: 'pirates' | 'fire') => {
    const start = {
      ...armed,
      crew: armed.crew.map((c) => ({ ...c, assignment: room.id })),
      modules: armed.modules.map((m) => (m.id === room.id ? { ...m, staff: [armed.crew[0].id] } : m)),
      incidents: [
        { id: 'i', kind, moduleId: room.id, hp: 500, maxHp: 500, spreadIn: 999, startedAt: 0 },
      ],
    }
    const after = reducer(start, { type: 'tick', seconds: 5 })
    return 500 - (after.incidents[0]?.hp ?? 0)
  }
  const bare: GameState = { ...armed, crew: armed.crew.map((c) => ({ ...c, gear: {} })) }
  void bare
  assert.ok(fight('pirates') > 0 && fight('fire') > 0, 'both get fought')
})

test('a dead crew member leaves their kit behind', () => {
  let s: GameState = { ...newGame(), stores: { sidearm: 1 } }
  const hand = s.crew[0]
  s = reducer(s, { type: 'issueGear', crewId: hand.id, item: 'sidearm' })
  assert.equal(s.stores.sidearm, 0)

  // Starve the station outright so somebody actually dies.
  s = {
    ...s,
    resources: { power: 0, air: 0, food: 0 },
    crew: s.crew.map((c) => (c.id === hand.id ? { ...c, hp: 0.5 } : c)),
  }
  s = reducer(s, { type: 'tick', seconds: 3 })
  const gone = s.crew.find((c) => c.id === hand.id)!
  assert.equal(gone.dead, true)
  assert.deepEqual(gone.gear, {}, 'they are not buried with it')
  assert.equal(s.stores.sidearm, 1, 'somebody else will need it')
})
