import assert from 'node:assert/strict'
import test from 'node:test'
import { advance, appeal, autoAccepting, derive, newGame, reducer, visitorBerths } from '../engine.ts'
import { TRADE_LOT, makeVisitor } from '../visitors.ts'
import type { GameState, Visitor } from '../types.ts'

const rich = (s: GameState): GameState => ({ ...s, credits: 50000 })

/** Puts a ship at the clamps without waiting for one to wander by. */
const hailing = (s: GameState, over: Partial<Visitor> = {}): [GameState, Visitor] => {
  const v = { ...makeVisitor(), ...over }
  return [{ ...s, visitors: [...s.visitors, v] }, v]
}

test('the founding station can take visitors, and only so many at once', () => {
  const s = newGame()
  assert.ok(visitorBerths(s) > 0, 'it starts with a docking port')
  assert.equal(autoAccepting(s), false, 'and asks before opening the clamps')
})

test('a ship that is waved off leaves, and an honest one leaves a mark', () => {
  const [withTrader, trader] = hailing(newGame(), { kind: 'trader', claim: 'trader' })
  const waved = reducer(withTrader, { type: 'refuseVisitor', visitorId: trader.id })
  assert.equal(waved.visitors.length, 0)
  assert.equal(waved.standing, withTrader.standing, 'waving off a trader costs nothing')

  const [withDrifter, drifter] = hailing(newGame(), { kind: 'drifter', claim: 'drifter' })
  const turned = reducer(withDrifter, { type: 'refuseVisitor', visitorId: drifter.id })
  assert.ok(turned.standing < withDrifter.standing, 'turning away real trouble is remembered')
  assert.ok(appeal(turned) < appeal(withDrifter), 'and it shows in the station standing')
})

test('taking in a drifter costs supplies and buys goodwill', () => {
  const [ready, drifter] = hailing(newGame(), { kind: 'drifter', claim: 'drifter' })
  const s = reducer(ready, { type: 'acceptVisitor', visitorId: drifter.id })
  assert.equal(s.visitors[0].status, 'docked')
  assert.ok(s.standing > ready.standing, 'word gets around')
  assert.ok(s.resources.food < ready.resources.food, 'and it comes out of the stores')
})

test('a raider is trouble the moment the clamps close', () => {
  const [ready, raider] = hailing(newGame(), { kind: 'raider', claim: 'patrol' })
  assert.equal(ready.incidents.length, 0)
  const s = reducer(ready, { type: 'acceptVisitor', visitorId: raider.id })
  assert.equal(s.incidents.length, 1, 'they board')
  assert.equal(s.incidents[0].kind, 'pirates')
})

test('auto-accept opens the clamps without asking', () => {
  let s = newGame()
  const dock = s.modules.find((m) => m.kind === 'dock')!
  s = reducer(s, { type: 'setAutoAccept', moduleId: dock.id, autoAccept: true })
  assert.equal(autoAccepting(s), true)

  const [ready, v] = hailing(s, { kind: 'trader', claim: 'trader' })
  const after = advance(ready, 2)
  assert.equal(after.visitors.find((x) => x.id === v.id)?.status, 'docked', 'waved straight in')
})

test('a ship nobody answers gives up and moves on', () => {
  const [ready, v] = hailing(newGame(), { timer: 10 })
  const s = advance(ready, 30)
  assert.equal(s.visitors.find((x) => x.id === v.id), undefined)
})

test('you can only trade with a ship that is actually berthed', () => {
  const [ready, v] = hailing(rich(newGame()), { kind: 'trader', claim: 'trader' })
  const early = reducer(ready, { type: 'tradeVisitor', visitorId: v.id, resource: 'food', buy: true })
  assert.equal(early.resources.food, ready.resources.food, 'not while they are still outside')

  let s = reducer(ready, { type: 'acceptVisitor', visitorId: v.id })
  // Leave room in the hold, or the cap trims the lot and the sums move.
  s = { ...s, resources: { ...s.resources, food: 20 } }
  const stock = s.resources.food
  const purse = s.credits
  s = reducer(s, { type: 'tradeVisitor', visitorId: v.id, resource: 'food', buy: true })
  assert.equal(s.resources.food, stock + TRADE_LOT, 'a lot arrives')
  assert.ok(s.credits < purse, 'and it is paid for')

  const before = s.resources.food
  s = reducer(s, { type: 'tradeVisitor', visitorId: v.id, resource: 'food', buy: false })
  assert.equal(s.resources.food, before - TRADE_LOT, 'and surplus goes the other way')
})

test('a purchase is trimmed to the room in the hold, and priced to match', () => {
  const [ready, v] = hailing(rich(newGame()), { kind: 'trader', claim: 'trader' })
  let s = reducer(ready, { type: 'acceptVisitor', visitorId: v.id })
  const cap = derive(s).storageCap
  s = { ...s, resources: { ...s.resources, food: cap - 10 } }
  const purse = s.credits
  s = reducer(s, { type: 'tradeVisitor', visitorId: v.id, resource: 'food', buy: true })
  assert.equal(s.resources.food, cap, 'the hold fills, no further')
  assert.ok(purse - s.credits < Math.round(TRADE_LOT * v.prices.food), 'and you pay for ten, not fifty')
})

test('a visitor with business raises it once, and only once', () => {
  const [ready, v] = hailing(rich(newGame()), {
    kind: 'trader',
    claim: 'trader',
    offer: { kind: 'mission', title: 'Paper', prompt: 'A contract.' },
  })
  let s = reducer(ready, { type: 'acceptVisitor', visitorId: v.id })
  assert.ok(s.visitors[0].offer, 'the exclamation is there once they are in')

  s = reducer(s, { type: 'answerVisitor', visitorId: v.id, yes: true })
  assert.equal(s.missions.length, 1, 'the contract lands on the board')
  assert.equal(s.visitors[0].offer, null, 'and the business is settled')

  const again = reducer(s, { type: 'answerVisitor', visitorId: v.id, yes: true })
  assert.equal(again.missions.length, 1, 'asking twice changes nothing')
})

test('trouble mostly scans dirty, and honest ships mostly do not', () => {
  let dirtyTrouble = 0
  let trouble = 0
  let dirtyHonest = 0
  let honest = 0
  for (let i = 0; i < 400; i += 1) {
    const v = makeVisitor()
    const bad = v.kind === 'raider' || v.kind === 'smuggler'
    if (bad) {
      trouble += 1
      if (v.suspicion > 0.5) dirtyTrouble += 1
    } else {
      honest += 1
      if (v.suspicion > 0.5) dirtyHonest += 1
    }
    if (bad) assert.notEqual(v.claim, v.kind, 'trouble never announces itself')
  }
  assert.ok(trouble > 0 && honest > 0)
  assert.ok(
    dirtyTrouble / trouble > dirtyHonest / honest,
    'the scan has to be worth reading',
  )
  assert.ok(dirtyHonest / honest > 0, 'but a dirty scan is not proof')
})
