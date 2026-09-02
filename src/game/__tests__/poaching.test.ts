import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SIGN_THRESHOLD,
  WING,
  fleetCapacity,
  guestAboard,
  newGame,
  reducer,
  tacticEffect,
} from '../engine.ts'
import { makeVisitor } from '../visitors.ts'
import type { GameState, Guest, ModuleKind, Visitor } from '../types.ts'

const rich = (s: GameState): GameState => ({ ...s, credits: 50000 })
const build = (s: GameState, kind: ModuleKind, col: number, deck = 0) =>
  reducer(s, { type: 'build', kind, deck, col })

/** Berths a ship and hands back the state with its boarding party aboard. */
const berthed = (s: GameState, over: Partial<Visitor> = {}): [GameState, Visitor] => {
  const v: Visitor = { ...makeVisitor(), status: 'requesting', timer: 900, kind: 'trader', claim: 'trader', ...over }
  const docked = reducer({ ...s, visitors: [...s.visitors, v] }, {
    type: 'acceptVisitor',
    visitorId: v.id,
  })
  return [docked, docked.visitors.find((x) => x.id === v.id) as Visitor]
}

/** Keeps rolling boarding parties until one throws up the role we need. */
const partyWith = (s: GameState, captain: boolean): [GameState, Guest, Visitor] => {
  for (let i = 0; i < 200; i += 1) {
    const [next, v] = berthed(s)
    const found = v.aboard.find((g) => g.captain === captain)
    if (found) return [next, found, v]
  }
  throw new Error('no such role turned up')
}

test('everyone who comes aboard can be asked to stay', () => {
  const [, , v] = partyWith(rich(newGame()), false)
  assert.ok(v.aboard.length > 0)
  for (const g of v.aboard) {
    assert.ok(g.stats && g.tier > 0, 'they are a real person, not scenery')
    assert.ok(g.askingBonus > 0, 'and they have a price')
    assert.equal(g.used.length, 0, 'with every tactic still to play')
    assert.ok(g.interest > 0 && g.interest < SIGN_THRESHOLD, `interest: ${g.interest}`)
  }
})

test('a master is harder to move than a hand, on the same station', () => {
  const [withMaster, master] = partyWith(rich(newGame()), true)
  const [withHand, hand] = partyWith(rich(newGame()), false)

  assert.ok(master.interest < hand.interest, 'they start far less interested')
  assert.ok(master.grip > hand.grip)
  assert.ok(
    tacticEffect(withMaster, master, 'bonus') < tacticEffect(withHand, hand, 'bonus'),
    'and money moves them less',
  )
})

test('what talks a master round is the station, not the chequebook', () => {
  const [poor, master] = partyWith(rich(newGame()), true)
  // A station worth moving to: room, surplus, a full account and a staffed dock.
  let good = poor
  for (const col of [WING - 3, WING - 4, WING + 2, WING + 3]) {
    good = build(good, 'quarters', col)
  }
  good = { ...good, standing: 0.2, credits: 50000 }
  const here = guestAboard(good, master.id)
  assert.ok(here, 'the same person, on the better station')

  const before = tacticEffect(poor, master, 'pitch')
  const after = tacticEffect(good, here.guest, 'pitch')
  assert.ok(after > before, `the pitch has to carry it: ${before} -> ${after}`)
})

test('tactics land once each, and cost what they cost', () => {
  const [s0, guest] = partyWith(rich(newGame()), false)
  const s1 = reducer(s0, { type: 'persuadeGuest', guestId: guest.id, tactic: 'bonus' })
  const after = guestAboard(s1, guest.id)
  assert.ok(after)
  assert.ok(after.guest.interest > guest.interest, 'money moved them')
  assert.ok(s1.credits < s0.credits, 'and it was actually paid')

  const s2 = reducer(s1, { type: 'persuadeGuest', guestId: guest.id, tactic: 'bonus' })
  assert.equal(s2, s1, 'the same tactic twice changes nothing')
})

test('a hand who says yes joins the crew and leaves the manifest', () => {
  const [s0, guest, v] = partyWith(rich(newGame()), false)
  const sure = {
    ...s0,
    visitors: s0.visitors.map((x) =>
      x.id !== v.id
        ? x
        : { ...x, aboard: x.aboard.map((g) => (g.id === guest.id ? { ...g, interest: SIGN_THRESHOLD } : g)) },
    ),
  }
  const s = reducer(sure, { type: 'signGuest', guestId: guest.id })
  assert.ok(s.crew.some((c) => c.name === guest.name), 'they are crew now')
  assert.equal(guestAboard(s, guest.id), null, 'and off the boarding party')
  assert.ok(s.standing < sure.standing, 'poaching is noticed')
})

test('a master brings the hull with them when a berth is free', () => {
  let base = rich(newGame())
  // Two bays weld into one two-berth run; HQ issues a shuttle with the first,
  // which leaves exactly one berth standing empty.
  base = build(base, 'hangar', WING - 3)
  base = build(base, 'hangar', WING - 4)
  const [s0, master, v] = partyWith(base, true)
  assert.equal(fleetCapacity(s0), 2)
  assert.equal(s0.ships.length, 1, 'the shuttle HQ issued with the bay')

  const sure = {
    ...s0,
    visitors: s0.visitors.map((x) =>
      x.id !== v.id
        ? x
        : { ...x, aboard: x.aboard.map((g) => (g.id === master.id ? { ...g, interest: SIGN_THRESHOLD } : g)) },
    ),
  }
  const s = reducer(sure, { type: 'signGuest', guestId: master.id })
  assert.ok(s.crew.some((c) => c.name === master.name))
  assert.equal(s.ships.length, 2, 'the hull came with them')
  const taken = s.ships.find((x) => x.name === v.name)
  assert.ok(taken, 'under the name on her transponder')
  assert.equal(taken.cls, v.cls)
  assert.ok(taken.hull < taken.maxHull, 'and she has been flown')
  assert.equal(s.visitors.find((x) => x.id === v.id), undefined, 'she is no longer traffic')
})

test('with no berth for her, the hull is sold on the dock instead', () => {
  const [s0, master, v] = partyWith(rich(newGame()), true)
  assert.equal(fleetCapacity(s0), 0, 'the founding station has no hangar')

  const sure = {
    ...s0,
    visitors: s0.visitors.map((x) =>
      x.id !== v.id
        ? x
        : { ...x, aboard: x.aboard.map((g) => (g.id === master.id ? { ...g, interest: SIGN_THRESHOLD } : g)) },
    ),
  }
  const s = reducer(sure, { type: 'signGuest', guestId: master.id })
  assert.ok(s.crew.some((c) => c.name === master.name), 'you still get the captain')
  assert.equal(s.ships.length, 0, 'but not the ship')
  assert.ok(s.credits > sure.credits, 'she went dockside for what she was worth')
})

test('nobody comes aboard a station with no bunk for them', () => {
  const [s0, guest] = partyWith(rich(newGame()), false)
  // Fill every bunk the founding station has.
  const packed = { ...s0, crew: [...s0.crew, ...Array.from({ length: 20 }, () => s0.crew[0])] }
  const s = reducer(packed, { type: 'signGuest', guestId: guest.id })
  assert.ok(guestAboard(s, guest.id), 'the asking never happened')
  assert.equal(s.crew.length, packed.crew.length)
})
