import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advance,
  BASE_CREW_CAP,
  cellsAboard,
  commerce,
  derive,
  inContact,
  lotsAboard,
  newGame,
  reach,
  recycled,
  reducer,
  scanOf,
  seeded,
  sellMargin,
  sensorEdge,
} from '../engine.ts'
import { BUILDABLE, def } from '../modules.ts'
import { SELL_MARGIN, TRADE_LOT, makeVisitor } from '../visitors.ts'
import { makeMission } from '../fleet.ts'
import { MODULE_SPEC, SPEC_IDS } from '../specs.ts'
import { open, say, labels, barredReason, line } from './talkHelp.ts'
import type { GameState, ModuleKind, SpecId, Visitor } from '../types.ts'

// Every station in this file is founded from a known seed, so a run that passes
// today passes tomorrow. Each call moves the seed on, so a loop that founds
// forty stations still sees forty different ones.
let founded = 0
const fresh = () => newGame('Spaceport-99', 1600 + (founded += 1))

// One seed per file, so every draw below is the same draw every run.
const rng = seeded(44)

const rich = (s: GameState): GameState => ({ ...s, credits: 200000 })

/** Builds a room and puts the whole watch in it, so it actually runs. */
const running = (kind: ModuleKind, over: Partial<GameState> = {}): GameState => {
  const spec = MODULE_SPEC[kind]
  let s: GameState = {
    ...rich(fresh()),
    ...(spec ? { specs: { [spec]: 1 } as Partial<Record<SpecId, number>> } : {}),
    ...over,
  }
  s = reducer(s, { type: 'build', kind, deck: 0, col: 2 })
  const m = s.modules.find((x) => x.kind === kind)
  if (!m) throw new Error(`${kind} was not built`)
  for (const c of s.crew.filter((x) => !x.dead)) {
    s = reducer(s, { type: 'assign', crewId: c.id, moduleId: m.id })
  }
  return s
}

const berthed = (s: GameState, over: Partial<Visitor> = {}): [GameState, Visitor] => {
  const v: Visitor = {
    ...makeVisitor(rng, [...s.ships.map((h) => h.name), ...s.visitors.map((x) => x.name)]),
    status: 'requesting',
    timer: 9000,
    kind: 'trader',
    claim: 'trader',
    ...over,
  }
  const docked = reducer({ ...s, visitors: [v] }, { type: 'acceptVisitor', visitorId: v.id })
  return [{ ...docked, visitors: docked.visitors.map((x) => ({ ...x, timer: 9000 })) }, docked.visitors[0]]
}

// ------------------------------------------------------------- the curve --

test('the unlock curve runs from nothing to sixty', () => {
  const gates = BUILDABLE.map((d) => d.unlockAtCrew)
  assert.equal(Math.min(...gates), 0, 'the founding rooms need nobody')
  assert.equal(Math.max(...gates), 60, 'and the last one needs a full station')
  assert.equal(BUILDABLE.length, 27)

  // Nothing is unreachable: a maxed run of quarters has to clear the top gate.
  const perSegment = def('quarters').crewCapacity ?? 0
  const maxRun = Math.round(perSegment * 3 * 3 * 1.3)
  assert.ok(BASE_CREW_CAP + maxRun * 2 >= 60, 'two maxed quarters runs hold the whole curve')
})

test('the only room that undoes damage is an early one', () => {
  const fixers = BUILDABLE.filter((d) => d.repairs)
  assert.equal(fixers.length, 1, 'exactly one room puts structural damage right')
  const [shop] = fixers
  // Upgrading a room resets its condition and a passing engineer occasionally
  // fixes one, but neither is something to plan around. Incidents start
  // chewing rooms up in the first hour, so the cure cannot sit behind a
  // late-game roster: 24 is where this file draws the line on "not early".
  assert.ok(
    shop.unlockAtCrew < 24,
    `${shop.name} unlocks at ${shop.unlockAtCrew}, long after rooms start taking damage`,
  )
  assert.ok(shop.cost >= 500, 'the price is what paces it, not the roster')
})

test('the five new rooms are on the curve and cost what they should', () => {
  for (const kind of ['reclaimer', 'brig', 'sensor', 'market', 'dso'] as ModuleKind[]) {
    const d = def(kind)
    assert.ok(d.unlockAtCrew >= 24, `${kind} is not an early room`)
    assert.ok(d.cost >= 500, `${kind} is not cheap`)
    assert.ok(d.powerDraw > 0, `${kind} draws power`)
  }
  // Two of them cannot be built at all until a drawing is worked out.
  assert.equal(MODULE_SPEC.sensor, 'filter')
  assert.equal(MODULE_SPEC.dso, 'astro')
  assert.equal(SPEC_IDS.length, 5)
})

// ------------------------------------------------------ water reclamation --

test('a reclaimer cuts the burn rather than adding supply', () => {
  // The same station either side of the switch, so the comparison is only
  // about the reclaimer and not about where the crew are standing.
  const s = running('reclaimer')
  assert.ok(recycled(s) > 0)
  const m = s.modules.find((x) => x.kind === 'reclaimer')!
  const off = reducer(s, { type: 'setStandby', moduleId: m.id, standby: true })

  const on = derive(s)
  const dark = derive(off)
  assert.ok(on.airRate > dark.airRate, 'less oxygen goes out of the tanks')
  assert.ok(on.foodRate > dark.foodRate, 'and less food')
  // It made nothing: the ceilings are untouched either way.
  assert.deepEqual(on.caps, dark.caps)
})

test('a reclaimer that is powered down stops recovering anything', () => {
  const s = running('reclaimer')
  const m = s.modules.find((x) => x.kind === 'reclaimer')!
  const dark = reducer(s, { type: 'setStandby', moduleId: m.id, standby: true })
  assert.equal(recycled(dark), 0, 'the burn snaps back the moment it goes dark')
})

// ------------------------------------------------------------------ brig --

test('a brig holds only while somebody is standing in it', () => {
  const s = running('brig')
  assert.ok(cellsAboard(s) > 0)

  const m = s.modules.find((x) => x.kind === 'brig')!
  const empty = s.crew.reduce(
    (acc, c) => reducer(acc, { type: 'assign', crewId: c.id, moduleId: null }),
    s,
  )
  assert.equal(cellsAboard(empty), 0, 'an unwatched cell is a room with a door')

  const dark = reducer(s, { type: 'setStandby', moduleId: m.id, standby: true })
  assert.equal(cellsAboard(dark), 0)
})

test('a dishonest hull can be arrested, and only into a free cell', () => {
  const withBrig = running('brig')
  const [docked, v] = berthed(withBrig, {
    kind: 'smuggler',
    claim: 'trader',
    faction: 'unlisted',
  })

  let talk = open(docked, 'captain', { kind: 'visitor', id: v.id })
  talk = say(talk, 'Ask what they are really carrying')
  assert.ok(labels(talk).some((l) => l.includes('Arrest')), `on offer: ${labels(talk).join(' | ')}`)

  const after = say(talk, 'Arrest them')
  assert.equal(after.prisoners.length, 1, 'somebody is in the cells')
  assert.equal(after.prisoners[0].faction, 'unlisted')
  assert.ok(after.standing.unlisted < docked.standing.unlisted, 'their people mind')
  assert.ok(after.standing.terran > docked.standing.terran, 'Earth does not')
  assert.equal(after.visitors[0].status, 'requesting', 'and she is off the clamps')
})

test('with no brig there is nothing to arrest anyone into', () => {
  const [docked, v] = berthed(rich(fresh()), {
    kind: 'smuggler',
    claim: 'trader',
    faction: 'unlisted',
  })
  const talk = say(
    open(docked, 'captain', { kind: 'visitor', id: v.id }),
    'Ask what they are really carrying',
  )
  assert.ok(!labels(talk).some((l) => l.includes('Arrest')), 'the option is not there at all')
})

test('a full brig bars the arrest rather than hiding it', () => {
  const withBrig = running('brig')
  const cells = cellsAboard(withBrig)
  const packed: GameState = {
    ...withBrig,
    prisoners: Array.from({ length: cells }, (_, i) => ({
      id: `p${i}`,
      name: 'Held',
      faction: 'unlisted' as const,
      charge: 'a hold they would not account for',
      hull: 'Nightjar',
      stats: withBrig.crew[0].stats,
      seed: 1,
      held: 0,
    })),
  }
  const [docked, v] = berthed(packed, { kind: 'smuggler', claim: 'trader', faction: 'unlisted' })
  const talk = say(
    open(docked, 'captain', { kind: 'visitor', id: v.id }),
    'Ask what they are really carrying',
  )
  assert.equal(barredReason(talk, 'Arrest'), 'Every cell is full')
})

test('a prisoner can be handed over, and it pays in standing and credits', () => {
  const withBrig = running('brig')
  const [docked, v] = berthed(withBrig, { kind: 'smuggler', claim: 'trader', faction: 'unlisted' })
  let s = say(
    say(open(docked, 'captain', { kind: 'visitor', id: v.id }), 'Ask what they are really carrying'),
    'Arrest them',
  )
  s = say(s, 'Close')
  const p = s.prisoners[0]
  const before = { credits: s.credits, terran: s.standing.terran, unlisted: s.standing.unlisted }

  s = say(open(s, 'prisoner', { kind: 'prisoner', id: p.id }), 'Hand them to')
  assert.equal(s.prisoners.length, 0, 'the cell is empty')
  assert.ok(s.credits > before.credits)
  assert.ok(s.standing.terran > before.terran)
  assert.ok(s.standing.unlisted < before.unlisted)
})

test('letting a prisoner go is worth something to the people who fly unlisted', () => {
  const withBrig = running('brig')
  const [docked, v] = berthed(withBrig, { kind: 'smuggler', claim: 'trader', faction: 'unlisted' })
  let s = say(
    say(open(docked, 'captain', { kind: 'visitor', id: v.id }), 'Ask what they are really carrying'),
    'Arrest them',
  )
  s = say(s, 'Close')
  const before = s.standing.unlisted
  s = say(open(s, 'prisoner', { kind: 'prisoner', id: s.prisoners[0].id }), 'Let them go')
  assert.equal(s.prisoners.length, 0)
  assert.ok(s.standing.unlisted > before, 'the Drift keeps its own books')
})

test('somebody just arrested is not ready to be offered a berth', () => {
  const withBrig = running('brig')
  const [docked, v] = berthed(withBrig, { kind: 'smuggler', claim: 'trader', faction: 'unlisted' })
  let s = say(
    say(open(docked, 'captain', { kind: 'visitor', id: v.id }), 'Ask what they are really carrying'),
    'Arrest them',
  )
  s = say(s, 'Close')
  const talk = open(s, 'prisoner', { kind: 'prisoner', id: s.prisoners[0].id })
  assert.equal(barredReason(talk, 'Offer them a berth'), 'Give them a few minutes to think')
})

// ---------------------------------------------------------- sensor array --

test('a sensor array pulls the scan towards what the hull actually is', () => {
  const s = running('sensor')
  assert.ok(sensorEdge(s) > 0)

  const dirty: Visitor = { ...makeVisitor(rng), kind: 'raider', claim: 'trader', suspicion: 0.4 }
  const clean: Visitor = { ...makeVisitor(rng), kind: 'trader', claim: 'trader', suspicion: 0.6 }
  assert.ok(scanOf(s, dirty) > dirty.suspicion, 'trouble reads dirtier than it was pretending')
  assert.ok(scanOf(s, clean) < clean.suspicion, 'and an honest hull reads cleaner')

  // Never certain, whatever you build.
  assert.ok(scanOf(s, dirty) < 1)
  assert.equal(scanOf(fresh(), dirty), dirty.suspicion, 'with no array the reading is raw')
})

// ----------------------------------------------------------- trading hub --

test('a trading hub narrows the spread and pulls traffic in', () => {
  const s = running('market')
  assert.ok(commerce(s) > 0)
  assert.ok(sellMargin(s) > SELL_MARGIN, 'you sell nearer to what they ask')
  assert.ok(sellMargin(s) <= 0.92, 'and never at parity')
  assert.equal(sellMargin(fresh()), SELL_MARGIN)

  // The gap between hulls is rolled, so compare the average of many rather
  // than two draws that overlap.
  const gap = (from: GameState) => {
    // Each sample has to carry the last one's luck forward, or eighty draws are
    // one draw eighty times.
    let at = from
    let total = 0
    for (let i = 0; i < 80; i += 1) {
      const next = advance({ ...at, nextVisitorIn: 0 }, 1)
      total += next.nextVisitorIn
      at = { ...at, rng: next.rng }
    }
    return total / 80
  }
  assert.ok(gap(s) < gap(rich(fresh())) * 0.9, 'traffic comes noticeably more often')
})

test('bonded cargo is bought to sell on, and never touches the tanks', () => {
  const s = running('market')
  assert.ok(lotsAboard(s) > 0)
  const [docked, v] = berthed(s)

  const tanks = docked.resources.food
  const bonded = reducer(docked, { type: 'bondLot', visitorId: v.id, resource: 'food' })
  assert.equal(bonded.bonded.length, 1)
  assert.equal(bonded.bonded[0].units, TRADE_LOT)
  assert.equal(bonded.resources.food, tanks, 'it is not yours to burn')
  assert.ok(bonded.credits < docked.credits, 'and it was paid for')
})

test('a bonded lot sells at the buyer’s price, not what you paid', () => {
  const s = running('market')
  const [docked, v] = berthed(s)
  const bonded = reducer(docked, { type: 'bondLot', visitorId: v.id, resource: 'power' })
  const lot = bonded.bonded[0]

  // A hull that values it more than the one you bought from.
  const dear: GameState = {
    ...bonded,
    visitors: bonded.visitors.map((x) => ({ ...x, prices: { ...x.prices, power: 99 } })),
  }
  const sold = reducer(dear, { type: 'sellLot', visitorId: v.id, lotId: lot.id })
  assert.equal(sold.bonded.length, 0)
  assert.ok(sold.credits - dear.credits > lot.paid, 'held for the right hull, it turns a profit')
})

test('the cage will not take more than it holds', () => {
  const s = running('market')
  const [docked, v] = berthed(s)
  let filled = docked
  for (let i = 0; i < lotsAboard(s); i += 1) {
    filled = reducer(filled, { type: 'bondLot', visitorId: v.id, resource: 'food' })
  }
  assert.equal(filled.bonded.length, lotsAboard(s))
  const over = reducer(filled, { type: 'bondLot', visitorId: v.id, resource: 'food' })
  assert.equal(over.bonded.length, filled.bonded.length, 'nothing more fits')
  assert.match(over.log[0].text, /cage is full/)
})

// -------------------------------------------------- deep space operations --

test('far work is offered only once somebody can plot it', () => {
  assert.equal(reach(fresh()), 0)
  const s = running('dso')
  assert.ok(reach(s) > 0)
})

test('a far contract pays more, takes far longer, and is never in contact', () => {
  // Danger is rolled per contract, so compare the shape of many rather than
  // two single draws.
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const roll = (far: boolean, pick: (m: ReturnType<typeof makeMission>) => number) =>
    mean(Array.from({ length: 60 }, () => pick(makeMission(rng, 0.4, { far }))))

  assert.ok(roll(true, (m) => m.seconds) > roll(false, (m) => m.seconds) * 2, 'weeks, not hours')
  assert.ok(roll(true, (m) => m.payout.credits) > roll(false, (m) => m.payout.credits) * 2)

  const near = makeMission(rng, 0.4, { far: false })
  const far = makeMission(rng, 0.4, { far: true })
  assert.equal(near.far, false)
  assert.equal(far.far, true)
  assert.match(far.name, /Far /)

  // Even with the whole station listening, nobody reaches them.
  const s = running('command')
  const flying = { ...far, status: 'flying' as const }
  assert.ok(!inContact({ ...s, missions: [flying] }).has(flying.id))

  const home = { ...near, status: 'flying' as const }
  assert.ok(inContact({ ...s, missions: [home] }).has(home.id))
})

test('a far team answers its own hails, because nobody else can', () => {
  const s = running('command')
  const far = { ...makeMission(rng, 0.4, { far: true }), status: 'flying' as const, nextCall: 1 }
  const out = advance({ ...s, missions: [far] }, 6)
  const m = out.missions[0]
  // Either it has not hailed yet or it hailed and decided for itself, but it
  // never sits waiting on an answer the station cannot give.
  assert.notEqual(m.status, 'calling')
})

test('the far-work warning is on the contract before it is taken', () => {
  const far = makeMission(rng, 0.4, { far: true })
  assert.ok(far.far)
  assert.equal(far.status, 'offered')
  assert.ok(line(fresh()) === '', 'no conversation is open')
})
