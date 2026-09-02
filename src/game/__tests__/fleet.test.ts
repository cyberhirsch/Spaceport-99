import assert from 'node:assert/strict'
import test from 'node:test'
import {
  WING,
  advance,
  availableCrew,
  berthedShips,
  fleetCapacity,
  missionBerths,
  missionCapacity,
  derive,
  newGame,
  reducer,
  workRate,
} from '../engine.ts'
import { powerDraw } from '../modules.ts'
import { makeMission, shipHull, teamSize } from '../fleet.ts'
import type { GameState, Mission, ModuleKind } from '../types.ts'

const rich = (s: GameState): GameState => ({ ...s, credits: 50000 })
const build = (s: GameState, kind: ModuleKind, col: number, deck = 0) =>
  reducer(rich(s), { type: 'build', kind, deck, col })

/** A station with somewhere to keep a ship and someone to take contracts. */
const flightReady = (): GameState => {
  let s = build(newGame(), 'hangar', WING + 2)
  s = build(s, 'command', WING + 3)
  const command = s.modules.find((m) => m.kind === 'command')!
  s = reducer(s, { type: 'assign', crewId: s.crew[0].id, moduleId: command.id })
  return rich(s)
}

/** Drops a contract straight onto the board so tests do not wait for the wire. */
// These tests are about the fixed-clock job. Shapes with their own rules get
// their own tests below.
const withOffer = (s: GameState, over: Partial<Mission> = {}): [GameState, Mission] => {
  const m = { ...makeMission(0.4, { shape: 'contract' }), ...over }
  return [{ ...s, missions: [...s.missions, m] }, m]
}

test('nothing flies before there is a hangar', () => {
  const bare = newGame()
  assert.equal(fleetCapacity(bare), 0)
  assert.equal(missionCapacity(bare), 0)
  assert.equal(bare.ships.length, 0, 'and no ship to fly')
})

test('the first hangar bay comes with a shuttle, the second does not', () => {
  const one = build(newGame(), 'hangar', WING + 2)
  assert.equal(one.ships.length, 1, 'HQ issues a hull with the first bay')
  assert.equal(one.ships[0].cls, 'shuttle')
  assert.equal(fleetCapacity(one), 1, 'one ship per bay')

  const two = build(one, 'hangar', WING + 3)
  assert.equal(two.ships.length, 1, 'the freebie is a one-off')
  assert.equal(fleetCapacity(two), 2)
})

test('a launch takes the ship and the crew off the station', () => {
  const [ready, offer] = withOffer(flightReady())
  const ship = ready.ships[0]
  const crew = availableCrew(ready).slice(0, teamSize(offer))
  const s = reducer(ready, {
    type: 'launch',
    missionId: offer.id,
    shipId: ship.id,
    crewIds: crew.map((c) => c.id),
  })

  const flown = s.missions.find((m) => m.id === offer.id)!
  assert.equal(flown.status, 'flying')
  assert.equal(s.ships[0].missionId, offer.id, 'the hull is spoken for')
  assert.equal(berthedShips(s).length, 0, 'and no longer in the bay')
  assert.equal(availableCrew(s).length, ready.crew.length - crew.length, 'the team is away')
  for (const c of crew) {
    assert.equal(s.crew.find((x) => x.id === c.id)!.assignment, null, 'and off the duty roster')
  }
})

test('a ship already out cannot be launched again', () => {
  const [ready, first] = withOffer(flightReady())
  const [twoOffers, second] = withOffer(ready)
  const ship = twoOffers.ships[0]
  const crew = availableCrew(twoOffers)
  let s = reducer(twoOffers, {
    type: 'launch',
    missionId: first.id,
    shipId: ship.id,
    crewIds: [crew[0].id],
  })
  s = reducer(s, { type: 'launch', missionId: second.id, shipId: ship.id, crewIds: [crew[1].id] })
  assert.equal(s.missions.find((m) => m.id === second.id)!.status, 'offered', 'the second is refused')
})

test('a mission comes home and files a report', () => {
  const [ready, offer] = withOffer(flightReady(), { seconds: 20, remaining: 20 })
  const crew = availableCrew(ready).slice(0, 2)
  let s = reducer(ready, {
    type: 'launch',
    missionId: offer.id,
    shipId: ready.ships[0].id,
    crewIds: crew.map((c) => c.id),
  })
  s = advance(s, 90)

  const done = s.missions.find((m) => m.id === offer.id)
  assert.ok(done, 'the mission is still on the board as a report')
  assert.equal(done.status, 'report')
  assert.ok(done.outcome, 'with an outcome')
  assert.ok(done.report, 'and something to read')
  const ship = s.ships.find((x) => x.id === ready.ships[0].id)
  if (ship) assert.equal(ship.missionId, null, 'a surviving ship is back in the bay')
  assert.equal(availableCrew(s).length >= crew.length, true, 'survivors are available again')

  const filed = reducer(s, { type: 'fileReport', missionId: offer.id })
  assert.equal(filed.missions.length, 0, 'filing it clears the board')
})

test('a hopeless team gets hurt, a strong one does not', () => {
  // Same contract, same ship, opposite ends of the competence scale.
  const run = (statValue: number) => {
    const [ready, offer] = withOffer(flightReady(), {
      seconds: 10,
      remaining: 10,
      danger: 0.9,
      stat: 'T',
    })
    let s = ready
    s = {
      ...s,
      crew: s.crew.map((c) => ({ ...c, stats: { ...c.stats, T: statValue }, level: statValue })),
    }
    const crew = availableCrew(s).slice(0, 3)
    s = reducer(s, {
      type: 'launch',
      missionId: offer.id,
      shipId: s.ships[0].id,
      crewIds: crew.map((c) => c.id),
    })
    return advance(s, 40)
  }

  let weakBad = 0
  let strongBad = 0
  for (let i = 0; i < 40; i += 1) {
    const weak = run(1).missions[0]
    const strong = run(10).missions[0]
    if (weak.outcome === 'setback' || weak.outcome === 'disaster') weakBad += 1
    if (strong.outcome === 'setback' || strong.outcome === 'disaster') strongBad += 1
  }
  assert.ok(weakBad > strongBad, `competence should show: weak ${weakBad} bad vs strong ${strongBad}`)
  assert.ok(strongBad < 10, 'a strong team on a hard job should mostly be fine')
})

test('refitting raises the hull and costs credits, and only in the bay', () => {
  const ready = flightReady()
  const ship = ready.ships[0]
  const before = shipHull(ship)
  const s = reducer(ready, { type: 'refitShip', shipId: ship.id })
  assert.equal(s.ships[0].level, 2)
  assert.ok(shipHull(s.ships[0]) > before, 'a mark 2 is a tougher hull')
  assert.ok(s.credits < ready.credits, 'and it is not free')

  const [flying, offer] = withOffer(ready)
  const out = reducer(flying, {
    type: 'launch',
    missionId: offer.id,
    shipId: ship.id,
    crewIds: [availableCrew(flying)[0].id],
  })
  assert.equal(
    reducer(out, { type: 'refitShip', shipId: ship.id }).ships[0].level,
    1,
    'you cannot refit a ship that is not here',
  )
})

test('contracts expire if nobody takes them', () => {
  const [ready] = withOffer(flightReady(), { expiresIn: 15 })
  const s = advance(ready, 40)
  assert.equal(s.missions.filter((m) => m.status === 'offered').length, 0, 'the wire moves on')
})

test('a room on standby costs a tenth of the power and produces nothing', () => {
  const s = newGame()
  const farm = s.modules.find((m) => m.kind === 'hydroponics')!
  const crewById = new Map(s.crew.map((c) => [c.id, c]))
  const runningDraw = powerDraw(farm)
  assert.ok(runningDraw > 0)
  assert.ok(workRate(farm, crewById) > 0, 'it is working to begin with')

  const off = reducer(s, { type: 'setStandby', moduleId: farm.id, standby: true })
  const dark = off.modules.find((m) => m.id === farm.id)!
  assert.equal(dark.standby, true)
  assert.ok(
    Math.abs(powerDraw(dark) - runningDraw * 0.1) < 1e-9,
    'standby draw is exactly a tenth',
  )
  assert.equal(workRate(dark, new Map(off.crew.map((c) => [c.id, c]))), 0, 'and it makes nothing')
  assert.equal(dark.staff.length, 0, 'the shift is stood down')
  for (const id of farm.staff) {
    assert.equal(off.crew.find((c) => c.id === id)!.assignment, null)
  }

  const back = reducer(off, { type: 'setStandby', moduleId: farm.id, standby: false })
  assert.equal(powerDraw(back.modules.find((m) => m.id === farm.id)!), runningDraw, 'and back again')
})

test('auto-assign leaves powered-down rooms dark', () => {
  let s = newGame()
  const farm = s.modules.find((m) => m.kind === 'hydroponics')!
  s = reducer(s, { type: 'setStandby', moduleId: farm.id, standby: true })
  s = reducer(s, { type: 'autoAssign' })
  assert.equal(
    s.modules.find((m) => m.id === farm.id)!.staff.length,
    0,
    'nobody is sent to work in the dark',
  )
})

test('powering down a room actually relieves the grid', () => {
  const s = newGame()
  const before = derive(s).powerRate
  const farm = s.modules.find((m) => m.kind === 'hydroponics')!
  const after = derive(reducer(s, { type: 'setStandby', moduleId: farm.id, standby: true })).powerRate
  assert.ok(after > before, `switching a room off should free power: ${before} -> ${after}`)
})

test('crew on a mission are not on the station to be assigned', () => {
  const [ready, offer] = withOffer(flightReady())
  const flying = availableCrew(ready).slice(0, 2)
  const flyingIds = flying.map((c) => c.id)
  let s = reducer(ready, {
    type: 'launch',
    missionId: offer.id,
    shipId: ready.ships[0].id,
    crewIds: flyingIds,
  })

  // Launching clears their posting, which is exactly what made them look free.
  for (const id of flyingIds) {
    assert.equal(s.crew.find((c) => c.id === id)!.assignment, null)
  }

  s = reducer(s, { type: 'autoAssign' })
  for (const id of flyingIds) {
    assert.equal(
      s.crew.find((c) => c.id === id)!.assignment,
      null,
      'auto-assign must not post someone who is light-minutes away',
    )
  }

  // Nor should assigning them by hand work.
  const room = s.modules.find((m) => m.kind === 'reactor')!
  const forced = reducer(s, { type: 'assign', crewId: flyingIds[0], moduleId: room.id })
  assert.equal(
    forced.crew.find((c) => c.id === flyingIds[0])!.assignment,
    null,
    'and neither should dragging them onto a room',
  )
  assert.ok(!forced.modules.some((m) => m.staff.includes(flyingIds[0])), 'no phantom staff')
})

test('an away team comes back assignable', () => {
  const [ready, offer] = withOffer(flightReady(), { seconds: 15, remaining: 15 })
  const flyingIds = availableCrew(ready).slice(0, 2).map((c) => c.id)
  let s = reducer(ready, {
    type: 'launch',
    missionId: offer.id,
    shipId: ready.ships[0].id,
    crewIds: flyingIds,
  })
  s = advance(s, 60)
  const survivors = flyingIds.filter((id) => !s.crew.find((c) => c.id === id)!.dead)
  const back = availableCrew(s).map((c) => c.id)
  for (const id of survivors) {
    assert.ok(back.includes(id), 'once home they are available again')
  }
})

test('a command module is worth what is sitting in it', () => {
  let s = rich(newGame())
  s = reducer(s, { type: 'build', kind: 'command', deck: 0, col: WING - 3 })
  const room = s.modules.find((m) => m.kind === 'command')!
  assert.ok(missionBerths(s) > 0, 'the berths exist')
  assert.equal(missionCapacity(s), 0, 'but nobody is holding a channel open')

  s = reducer(s, { type: 'assign', crewId: s.crew[0].id, moduleId: room.id })
  assert.equal(missionCapacity(s), 1, 'one controller, one mission')

  // A second body cannot beat the berths the room actually has.
  s = reducer(s, { type: 'assign', crewId: s.crew[1].id, moduleId: room.id })
  assert.equal(missionCapacity(s), Math.min(2, missionBerths(s)))

  const dark = reducer(s, { type: 'setStandby', moduleId: room.id, standby: true })
  assert.equal(missionCapacity(dark), 0, 'and a powered-down room flies nothing')
})
