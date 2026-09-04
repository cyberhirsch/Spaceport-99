import assert from 'node:assert/strict'
import test from 'node:test'
import {
  fleetCapacity,
  guestAboard,
  holdOut,
  newGame,
  reducer,
  seeded,
  SIGN_THRESHOLD,
  WING,
} from '../engine.ts'
import { wantOf } from '../talks/hire.ts'
import { makeVisitor } from '../visitors.ts'
import { labels, open, say } from './talkHelp.ts'
import type { GameState, Guest, ModuleKind, Visitor } from '../types.ts'

// Every station in this file is founded from a known seed, so a run that passes
// today passes tomorrow. Each call moves the seed on, so a loop that founds
// forty stations still sees forty different ones.
let founded = 0
const fresh = () => newGame('Spaceport-99', 1700 + (founded += 1))

// One seed per file, so every draw below is the same draw every run.
const rng = seeded(55)

/** Talk a guest round the whole way, from the greeting to the answer. */
const talkRound = (s: GameState, guestId: string, ...moves: string[]): GameState => {
  let out = open(s, 'hire', { kind: 'guest', id: guestId })
  out = say(out, 'What brought you out this far')
  out = say(out, 'what would it take')
  out = say(out, 'Make them an offer')
  for (const m of moves) {
    out = say(out, m)
    out = say(out, 'Keep going')
  }
  out = say(out, 'Put it to them')
  return say(out, 'Ask for their answer')
}

const rich = (s: GameState): GameState => ({ ...s, credits: 50000 })
const build = (s: GameState, kind: ModuleKind, col: number, deck = 0) =>
  reducer(s, { type: 'build', kind, deck, col })

/** Berths a ship and hands back the state with its boarding party aboard. */
const berthed = (s: GameState, over: Partial<Visitor> = {}): [GameState, Visitor] => {
  // Pass the names already in play, or a visitor can turn up sharing a name
  // with a hull in the fleet — one pool serves both.
  const taken = [...s.ships.map((h) => h.name), ...s.visitors.map((x) => x.name)]
  const v: Visitor = {
    ...makeVisitor(rng, taken),
    status: 'requesting',
    timer: 900,
    kind: 'trader',
    claim: 'trader',
    ...over,
  }
  const docked = reducer({ ...s, visitors: [...s.visitors, v] }, {
    type: 'acceptVisitor',
    visitorId: v.id,
  })
  return [docked, docked.visitors.find((x) => x.id === v.id) as Visitor]
}

/** Keeps rolling boarding parties until one throws up the role we need. */
const partyWith = (s: GameState, captain: boolean): [GameState, Guest, Visitor] => {
  // Rolls come out of the state now, so a retry has to start from a state whose
  // luck has moved on. Deal from the same one twice and you get the same party.
  let from = s
  for (let i = 0; i < 200; i += 1) {
    const [next, v] = berthed(from)
    const found = v.aboard.find((g) => g.captain === captain)
    if (found) return [next, found, v]
    from = { ...from, rng: next.rng }
  }
  throw new Error('no such role turned up')
}

test('everyone who comes aboard can be asked to stay', () => {
  const [, , v] = partyWith(rich(fresh()), false)
  assert.ok(v.aboard.length > 0)
  for (const g of v.aboard) {
    assert.ok(g.stats && g.tier > 0, 'they are a real person, not scenery')
    assert.ok(g.askingBonus > 0, 'and they have a price')
    assert.ok(g.interest > 0 && g.interest < SIGN_THRESHOLD, `interest: ${g.interest}`)
  }
})

test('a master is harder to move than a hand, on the same station', () => {
  const [withMaster, master] = partyWith(rich(fresh()), true)
  const [, hand] = partyWith(rich(fresh()), false)

  assert.ok(master.interest < hand.interest, 'they start far less interested')
  assert.ok(master.grip > hand.grip)

  // A master wants to be believed in, and cannot be bought at any price.
  assert.equal(wantOf(master), 'belief')
  const paid = say(
    say(open(withMaster, 'hire', { kind: 'guest', id: master.id }), 'Make them an offer'),
    'up front',
  )
  const moved = (guestAboard(paid, master.id)?.guest.interest ?? 0) - master.interest
  assert.ok(moved < 0, `offering a captain money is an insult: ${moved}`)

  // And whatever does work on them works less than it would on a deckhand,
  // because they have a berth already.
  assert.ok(holdOut(master) < holdOut(hand))
})

test('what talks a master round is the station, not the chequebook', () => {
  const [poor, master] = partyWith(rich(fresh()), true)
  // A station worth moving to: room, surplus, a full account and a staffed dock.
  let good = poor
  for (const col of [WING - 3, WING - 4, WING + 2, WING + 3]) {
    good = build(good, 'quarters', col)
  }
  good = {
    ...good,
    standing: { ...good.standing, terran: 0.2 },
    patron: 'terran',
    credits: 50000,
  }
  const here = guestAboard(good, master.id)
  assert.ok(here, 'the same person, on the better station')

  // Telling them what the station is, on each version of it.
  const pitched = (g: GameState, id: string): number => {
    const was = guestAboard(g, id)?.guest.interest ?? 0
    const after = say(say(open(g, 'hire', { kind: 'guest', id }), 'Make them an offer'), 'what the station is')
    return (guestAboard(after, id)?.guest.interest ?? 0) - was
  }
  const before = pitched(poor, master.id)
  const after = pitched(good, here.guest.id)
  assert.ok(after > before, `the pitch has to carry it: ${before} -> ${after}`)
})

test('each thing you can say lands once, and costs what it costs', () => {
  const [s0, guest] = partyWith(rich(fresh()), false)
  let s = open(s0, 'hire', { kind: 'guest', id: guest.id })
  s = say(s, 'Make them an offer')
  s = say(s, 'up front')
  assert.ok(s.credits < s0.credits, 'the money was actually paid')

  // Back at the offers, the same move is no longer on the table.
  s = say(s, 'Keep going')
  assert.ok(
    !labels(s).some((l) => l.includes('up front')),
    `money cannot be offered twice: ${labels(s).join(' | ')}`,
  )
})

test('a hand who says yes joins the crew and leaves the manifest', () => {
  const [s0, guest, v] = partyWith(rich(fresh()), false)
  const sure = {
    ...s0,
    visitors: s0.visitors.map((x) =>
      x.id !== v.id
        ? x
        : { ...x, aboard: x.aboard.map((g) => (g.id === guest.id ? { ...g, interest: SIGN_THRESHOLD } : g)) },
    ),
  }
  const s = talkRound(sure, guest.id)
  assert.ok(s.crew.some((c) => c.name === guest.name), 'they are crew now')
  assert.equal(guestAboard(s, guest.id), null, 'and off the boarding party')
  const theirs = v.faction
  assert.ok(s.standing[theirs] < sure.standing[theirs], 'poaching is noticed by their own people')
})

test('a master brings the hull with them when a berth is free', () => {
  let base = rich(fresh())
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
  const s = talkRound(sure, master.id)
  assert.ok(s.crew.some((c) => c.name === master.name))
  assert.equal(s.ships.length, 2, 'the hull came with them')
  const taken = s.ships.find((x) => x.name === v.name)
  assert.ok(taken, 'under the name on her transponder')
  assert.equal(taken.cls, v.cls)
  assert.ok(taken.hull < taken.maxHull, 'and she has been flown')
  assert.equal(s.visitors.find((x) => x.id === v.id), undefined, 'she is no longer traffic')
})

test('with no berth for her, the hull is sold on the dock instead', () => {
  const [s0, master, v] = partyWith(rich(fresh()), true)
  assert.equal(fleetCapacity(s0), 0, 'the founding station has no hangar')

  const sure = {
    ...s0,
    visitors: s0.visitors.map((x) =>
      x.id !== v.id
        ? x
        : { ...x, aboard: x.aboard.map((g) => (g.id === master.id ? { ...g, interest: SIGN_THRESHOLD } : g)) },
    ),
  }
  const s = talkRound(sure, master.id)
  assert.ok(s.crew.some((c) => c.name === master.name), 'you still get the captain')
  assert.equal(s.ships.length, 0, 'but not the ship')
  assert.ok(s.credits > sure.credits, 'she went dockside for what she was worth')
})

test('nobody comes aboard a station with no bunk for them', () => {
  const [s0, guest] = partyWith(rich(fresh()), false)
  // Fill every bunk the founding station has.
  const packed = { ...s0, crew: [...s0.crew, ...Array.from({ length: 20 }, () => s0.crew[0])] }
  const s = talkRound(packed, guest.id)
  assert.ok(guestAboard(s, guest.id), 'the asking never happened')
  assert.equal(s.crew.length, packed.crew.length)
})
