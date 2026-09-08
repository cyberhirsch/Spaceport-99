import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advance,
  appeal,
  autoAccepting,
  derive,
  dockOfficers,
  guestsAboard,
  newGame,
  reducer,
  seeded,
  visitorBerths,
  visitorPhase,
  WING,
} from '../engine.ts'
import { TRADE_LOT, makeVisitor } from '../visitors.ts'
import type { GameState, Visitor } from '../types.ts'

// Every station in this file is founded from a known seed, so a run that passes
// today passes tomorrow. Each call moves the seed on, so a loop that founds
// forty stations still sees forty different ones.
let founded = 0
const fresh = () => newGame('Spaceport-99', 2300 + (founded += 1))

// One seed per file, so every draw below is the same draw every run.
const rng = seeded(99)

const rich = (s: GameState): GameState => ({ ...s, credits: 50000 })

/** Puts a ship at the clamps without waiting for one to fly in and hail. */
const hailing = (s: GameState, over: Partial<Visitor> = {}): [GameState, Visitor] => {
  const v: Visitor = { ...makeVisitor(rng), status: 'requesting', timer: 90, ...over }
  return [{ ...s, visitors: [...s.visitors, v] }, v]
}

test('the founding station can take visitors, and only so many at once', () => {
  const s = fresh()
  assert.ok(visitorBerths(s) > 0, 'it starts with a docking port')
  assert.equal(autoAccepting(s), false, 'and asks before clearing anyone in')
})

test('a ship that is waved off leaves, and an honest one leaves a mark', () => {
  // Not the station's own flag — turning that away has its own cost, below.
  const [withTrader, trader] = hailing(fresh(), {
    kind: 'trader',
    claim: 'trader',
    faction: 'concern',
  })
  const waved = reducer(withTrader, { type: 'refuseVisitor', visitorId: trader.id })
  assert.equal(waved.visitors.length, 0)
  assert.deepEqual(waved.standing, withTrader.standing, 'waving off a trader costs nothing')

  const [withDrifter, drifter] = hailing(fresh(), {
    kind: 'drifter',
    claim: 'drifter',
    faction: 'unlisted',
  })
  const turned = reducer(withDrifter, { type: 'refuseVisitor', visitorId: drifter.id })
  const theirs = drifter.faction
  assert.ok(
    turned.standing[theirs] < withDrifter.standing[theirs],
    'turning away real trouble is remembered by their own people',
  )
  // A Confederation post is graded by the Confederation, so a drifter's
  // opinion only reaches the station's name when it is Confederation paper
  // being turned away.
  const [withTerran, terran] = hailing(fresh(), {
    kind: 'drifter',
    claim: 'drifter',
    faction: 'terran',
  })
  const snubbed = reducer(withTerran, { type: 'refuseVisitor', visitorId: terran.id })
  assert.ok(appeal(snubbed) < appeal(withTerran), 'and it shows in what the station is worth')
})

test('turning away the flag you fly is noticed by the people who issued it', () => {
  const base: GameState = { ...fresh(), patron: 'terran' }
  const [ready, v] = hailing(base, { kind: 'trader', claim: 'trader', faction: 'terran' })
  const waved = reducer(ready, { type: 'refuseVisitor', visitorId: v.id })
  assert.ok(waved.standing.terran < ready.standing.terran)
})

test('taking in a drifter costs supplies and buys goodwill', () => {
  const [ready, drifter] = hailing(fresh(), { kind: 'drifter', claim: 'drifter' })
  const s = reducer(ready, { type: 'acceptVisitor', visitorId: drifter.id })
  assert.equal(s.visitors[0].status, 'docked')
  const theirs = drifter.faction
  assert.ok(s.standing[theirs] > ready.standing[theirs], 'word gets around their own people')
  assert.ok(s.resources.food < ready.resources.food, 'and it comes out of the stores')
  if (theirs === 'unlisted') {
    assert.ok(s.standing.terran < ready.standing.terran, 'and Earth writes it down')
  }
})

test('a raider is trouble the moment the clamps close', () => {
  const [ready, raider] = hailing(fresh(), { kind: 'raider', claim: 'patrol' })
  assert.equal(ready.incidents.length, 0)
  const s = reducer(ready, { type: 'acceptVisitor', visitorId: raider.id })
  assert.equal(s.incidents.length, 0, 'pirates are not weather')
  assert.ok(s.boarding, 'they board')
  assert.equal(s.visitors.find((v) => v.id === raider.id)?.intent, 'boarding')
  const dock = s.modules.find((m) => m.kind === 'dock')!
  assert.equal(s.boarding?.moduleId, dock.id, 'through the port they were let into')
})

test('auto-accept clears traffic without asking', () => {
  let s = fresh()
  const dock = s.modules.find((m) => m.kind === 'dock')!
  s = reducer(s, { type: 'setAutoAccept', moduleId: dock.id, autoAccept: true })
  assert.equal(autoAccepting(s), true)

  const [ready, v] = hailing(s, { kind: 'trader', claim: 'trader' })
  const after = advance(ready, 2)
  assert.equal(after.visitors.find((x) => x.id === v.id)?.status, 'docked', 'waved straight in')
})

test('a ship nobody answers gives up and moves on', () => {
  const [ready, v] = hailing(fresh(), { timer: 10 })
  const s = advance(ready, 30)
  assert.equal(s.visitors.find((x) => x.id === v.id), undefined)
})

test('you can only trade with a ship that is actually berthed', () => {
  const [ready, v] = hailing(rich(fresh()), { kind: 'trader', claim: 'trader' })
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
  const [ready, v] = hailing(rich(fresh()), { kind: 'trader', claim: 'trader' })
  let s = reducer(ready, { type: 'acceptVisitor', visitorId: v.id })
  const cap = derive(s).caps.food
  s = { ...s, resources: { ...s.resources, food: cap - 10 } }
  const purse = s.credits
  s = reducer(s, { type: 'tradeVisitor', visitorId: v.id, resource: 'food', buy: true })
  assert.equal(s.resources.food, cap, 'the tanks fill, no further')
  assert.ok(purse - s.credits < Math.round(TRADE_LOT * v.prices.food), 'and you pay for ten, not fifty')
})

test('a ship shows on the board before it ever asks for a berth', () => {
  const arriving = makeVisitor(rng)
  assert.equal(arriving.status, 'inbound', 'it is a return on the scope first')

  const ready: GameState = { ...fresh(), visitors: [{ ...arriving, timer: 5 }] }
  assert.equal(visitorPhase(ready.visitors[0]), 'inbound')
  const s = advance(ready, 8)
  assert.equal(s.visitors[0].status, 'requesting', 'and only then does it hail')
  assert.equal(visitorPhase(s.visitors[0]), 'hailing')
})

test('a berthed hull sends people onto the station', () => {
  const [ready, v] = hailing(fresh(), { kind: 'trader', claim: 'trader' })
  assert.equal(ready.visitors[0].aboard.length, 0, 'nobody is aboard while they are outside')

  const s = reducer(ready, { type: 'acceptVisitor', visitorId: v.id })
  const aboard = s.visitors[0].aboard
  assert.ok(aboard.length >= 1 && aboard.length <= 3, `a small party came off: ${aboard.length}`)
  assert.ok(
    aboard.every((g) => g.name && g.role && g.portrait),
    'each with a name, a job and a face',
  )
  assert.equal(new Set(aboard.map((g) => g.portrait)).size, aboard.length, 'and no two alike')
  assert.deepEqual(
    guestsAboard(s).map((x) => x.guest.id),
    aboard.map((g) => g.id),
  )
})

test('business is raised by a person, once, and leaves with them', () => {
  const [ready, v] = hailing(rich(fresh()), {
    kind: 'trader',
    claim: 'trader',
    offer: { kind: 'mission', title: 'Paper', prompt: 'A contract.' },
  })
  let s = reducer(ready, { type: 'acceptVisitor', visitorId: v.id })
  assert.equal(s.visitors[0].offer, null, 'the ship is no longer the one with something to say')
  const speaker = s.visitors[0].aboard.find((g) => g.offer)
  assert.ok(speaker, 'one of the party carries it instead')
  assert.equal(s.visitors[0].aboard.filter((g) => g.offer).length, 1, 'and only one of them')

  s = reducer(s, { type: 'answerGuest', guestId: speaker.id, yes: true })
  assert.equal(s.missions.length, 1, 'the contract lands on the board')
  assert.equal(s.visitors[0].aboard.find((g) => g.id === speaker.id)?.offer, null, 'settled')

  const again = reducer(s, { type: 'answerGuest', guestId: speaker.id, yes: true })
  assert.equal(again.missions.length, 1, 'asking twice changes nothing')
})

test('when the hull undocks, everyone who came off it goes with it', () => {
  const [ready, v] = hailing(fresh(), { kind: 'trader', claim: 'trader' })
  const docked = reducer(ready, { type: 'acceptVisitor', visitorId: v.id })
  assert.ok(guestsAboard(docked).length > 0)

  const later = advance({ ...docked, visitors: [{ ...docked.visitors[0], timer: 2 }] }, 5)
  assert.equal(later.visitors.length, 0, 'the ship is gone')
  assert.equal(guestsAboard(later).length, 0, 'and so is the boarding party')
})

test('trouble mostly scans dirty, and honest ships mostly do not', () => {
  let dirtyTrouble = 0
  let trouble = 0
  let dirtyHonest = 0
  let honest = 0
  for (let i = 0; i < 400; i += 1) {
    const v = makeVisitor(rng)
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

test('a staffed engineering bay puts the station back together', () => {
  let s = rich(fresh())
  // Build a bay and post the whole founding crew's best hands to it.
  s = reducer(s, { type: 'build', kind: 'workshop', deck: 0, col: WING + 2 })
  const bay = s.modules.find((m) => m.kind === 'workshop')!
  s = reducer(s, { type: 'assign', crewId: s.crew[0].id, moduleId: bay.id })
  s = reducer(s, { type: 'assign', crewId: s.crew[1].id, moduleId: bay.id })

  // Batter the reactor and give the bay time to work.
  const reactor = s.modules.find((m) => m.kind === 'reactor')!
  s = {
    ...s,
    modules: s.modules.map((m) => (m.id === reactor.id ? { ...m, condition: 0.4 } : m)),
  }
  const before = s.modules.find((m) => m.id === reactor.id)!.condition
  s = advance(s, 60)
  const after = s.modules.find((m) => m.id === reactor.id)!.condition
  assert.ok(after > before, `condition should recover: ${before} -> ${after}`)
})

test('an unstaffed or powered-down bay repairs nothing', () => {
  const damage = (s: GameState): GameState => {
    const reactor = s.modules.find((m) => m.kind === 'reactor')!
    return {
      ...s,
      modules: s.modules.map((m) => (m.id === reactor.id ? { ...m, condition: 0.4 } : m)),
    }
  }
  const condition = (s: GameState) => s.modules.find((m) => m.kind === 'reactor')!.condition

  // A bay with nobody in it.
  let empty = reducer(rich(fresh()), { type: 'build', kind: 'workshop', deck: 0, col: WING + 2 })
  empty = damage(empty)
  assert.equal(condition(advance(empty, 60)), 0.4, 'nobody is holding the spanner')

  // A staffed bay that has been switched off.
  let dark = reducer(rich(fresh()), { type: 'build', kind: 'workshop', deck: 0, col: WING + 2 })
  const bay = dark.modules.find((m) => m.kind === 'workshop')!
  dark = reducer(dark, { type: 'assign', crewId: dark.crew[0].id, moduleId: bay.id })
  dark = reducer(dark, { type: 'setStandby', moduleId: bay.id, standby: true })
  dark = damage(dark)
  assert.equal(condition(advance(dark, 60)), 0.4, 'and a dark bay fixes nothing')
})

test('the bay leaves a room that is currently on fire alone', () => {
  let s = rich(fresh())
  s = reducer(s, { type: 'build', kind: 'workshop', deck: 0, col: WING + 2 })
  const bay = s.modules.find((m) => m.kind === 'workshop')!
  s = reducer(s, { type: 'assign', crewId: s.crew[0].id, moduleId: bay.id })
  s = reducer(s, { type: 'assign', crewId: s.crew[1].id, moduleId: bay.id })

  const farm = s.modules.find((m) => m.kind === 'hydroponics')!
  s = {
    ...s,
    modules: s.modules.map((m) => (m.id === farm.id ? { ...m, condition: 0.5 } : m)),
    incidents: [
      {
        id: 'burning',
        kind: 'fire',
        moduleId: farm.id,
        hp: 9999,
        maxHp: 9999,
        spreadIn: 9999,
        startedAt: 0,
      },
    ],
  }
  const after = advance(s, 30).modules.find((m) => m.id === farm.id)!
  assert.ok(after.condition <= 0.5, 'you cannot patch a room while it is burning')
})

test('a raider sends nobody friendly onto the decks', () => {
  const [ready, raider] = hailing(fresh(), { kind: 'raider', claim: 'patrol' })
  const s = reducer(ready, { type: 'acceptVisitor', visitorId: raider.id })
  assert.equal(guestsAboard(s).length, 0, 'what came off that hull is a boarding party, not a guest')
  assert.ok(s.boarding, 'and it is standing in the port')
})

test('nothing comes alongside a docking port nobody is working', () => {
  const manned = fresh()
  assert.ok(dockOfficers(manned) > 0, 'the founders arrived through it and one of them stayed')

  // Stand the port officer down.
  const port = manned.modules.find((m) => m.kind === 'dock')!
  let s = manned
  for (const id of [...port.staff]) s = reducer(s, { type: 'assign', crewId: id, moduleId: null })
  assert.equal(dockOfficers(s), 0)

  const [ready, v] = hailing(s, { kind: 'trader', claim: 'trader' })
  assert.equal(reducer(ready, { type: 'acceptVisitor', visitorId: v.id }), ready, 'the clamps stay open')
  assert.equal(autoAccepting(s), false, 'and a standing order needs somebody to stand there')

  // Put anybody back on the desk and it works again.
  const back = reducer(ready, { type: 'assign', crewId: ready.crew[0].id, moduleId: port.id })
  const docked = reducer(back, { type: 'acceptVisitor', visitorId: v.id })
  assert.equal(docked.visitors.find((x) => x.id === v.id)?.status, 'docked')
})

test('a powered-down docking port has nobody on the desk either', () => {
  const s = fresh()
  const port = s.modules.find((m) => m.kind === 'dock')!
  const dark = reducer(s, { type: 'setStandby', moduleId: port.id, standby: true })
  assert.equal(dockOfficers(dark), 0, 'standby stands the shift down')
})
