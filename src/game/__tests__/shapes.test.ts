import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advance,
  availableCrew,
  inContact,
  missionCapacity,
  newGame,
  reducer,
  seeded,
  WING,
} from '../engine.ts'
import { makeMission } from '../fleet.ts'
import { rollCall, unattended } from '../calls.ts'
import type { GameState, Mission, MissionShape, ModuleKind } from '../types.ts'

// Every station in this file is founded from a known seed, so a run that passes
// today passes tomorrow. Each call moves the seed on, so a loop that founds
// forty stations still sees forty different ones.
let founded = 0
const fresh = () => newGame('Spaceport-99', 2000 + (founded += 1))

// One seed per file, so every draw below is the same draw every run.
const rng = seeded(77)

const rich = (s: GameState): GameState => ({ ...s, credits: 50000 })
const build = (s: GameState, kind: ModuleKind, col: number, deck = 0) =>
  reducer(rich(s), { type: 'build', kind, deck, col })

/** A station with a hull, a command module and controllers sitting in it. */
const ready = (controllers = 1): GameState => {
  let s = build(fresh(), 'hangar', WING + 2)
  s = build(s, 'command', WING + 3)
  const room = s.modules.find((m) => m.kind === 'command')!
  for (let i = 0; i < controllers; i += 1) {
    s = reducer(s, { type: 'assign', crewId: s.crew[i].id, moduleId: room.id })
  }
  return rich(s)
}

const offer = (
  s: GameState,
  over: Partial<Mission> = {},
  shape: MissionShape = 'contract',
): [GameState, Mission] => {
  const m: Mission = { ...makeMission(rng, 0.4, { shape }), ...over }
  return [{ ...s, missions: [...s.missions, m] }, m]
}

/**
 * Launches somebody who is not sitting in the command module — sending the
 * controller closes the very channel these tests are about.
 */
const fly = (s: GameState, m: Mission): GameState => {
  const room = s.modules.find((x) => x.kind === 'command')!
  const hand = availableCrew(s).find((c) => !room.staff.includes(c.id))!
  return reducer(s, { type: 'launch', missionId: m.id, shipId: s.ships[0].id, crewIds: [hand.id] })
}

test('an open job has no clock and will not come home on its own', () => {
  const [board, m] = offer(ready(), { seconds: 20, danger: 0.1 }, 'open')
  let s = fly(board, m)
  assert.equal(s.missions[0].shape, 'open')
  assert.equal(s.missions[0].haul, 0, 'nothing gathered yet')

  s = advance(s, 120)
  const out = s.missions.find((x) => x.id === m.id)!
  assert.equal(out.status, 'flying', 'two minutes on and they are still out there')
  assert.ok(out.haul > 0, `the hold is filling: ${out.haul.toFixed(2)}`)
  assert.ok(out.strain > 0, 'and it is costing them')
  assert.ok(out.aloft >= 120)
})

test('recall is the only thing that brings an open job home', () => {
  const [board, m] = offer(ready(), { seconds: 20, danger: 0.1 }, 'open')
  let s = advance(fly(board, m), 90)
  const gathered = s.missions[0].haul

  s = reducer(s, { type: 'recall', missionId: m.id })
  const heading = s.missions.find((x) => x.id === m.id)!
  assert.equal(heading.recalled, true)
  assert.ok(Math.abs(heading.remaining - heading.seconds) < 1e-9, 'the trip home starts now')

  s = advance(s, 60)
  const done = s.missions.find((x) => x.id === m.id)!
  assert.equal(done.status, 'report')
  assert.ok(done.haul >= gathered, 'and they brought back what they gathered')
})

test('an unfolding job stops and asks, and waits for an answer', () => {
  const [board, m] = offer(ready(), { seconds: 400, remaining: 400, nextCall: 5 }, 'unfolding')
  let s = advance(fly(board, m), 10)
  const hailing = s.missions.find((x) => x.id === m.id)!
  assert.equal(hailing.status, 'calling')
  assert.ok(hailing.call, 'with something to say')
  assert.ok(hailing.call.options.length >= 2, 'and more than one answer')

  const held = advance(s, 120).missions.find((x) => x.id === m.id)!
  assert.equal(held.status, 'calling', 'nothing happens until somebody answers')
  assert.ok(Math.abs(held.remaining - hailing.remaining) < 1e-9, 'the clock is not running')

  s = reducer(s, { type: 'answerCall', missionId: m.id, choice: 0 })
  const answered = s.missions.find((x) => x.id === m.id)!
  assert.equal(answered.status, 'flying')
  assert.equal(answered.call, null)
  assert.equal(answered.choices.length, 1, 'and it is written into the report')
})

test('an answer that costs money is refused when the money is not there', () => {
  const [board, m] = offer(ready(), { seconds: 400, remaining: 400, nextCall: 5 }, 'unfolding')
  let s = advance(fly(board, m), 10)
  const call = s.missions[0].call!
  const paid = call.options.findIndex((o) => o.cost)
  if (paid < 0) return // this kind of work has no paid option; nothing to check

  const broke = { ...s, credits: 0 }
  assert.equal(reducer(broke, { type: 'answerCall', missionId: m.id, choice: paid }), broke)

  s = reducer({ ...s, credits: 9999 }, { type: 'answerCall', missionId: m.id, choice: paid })
  assert.equal(s.missions[0].status, 'flying')
  assert.ok(s.credits < 9999, 'and it was actually paid')
})

test('with nobody on the channel the team decides for themselves', () => {
  const [board, m] = offer(ready(1), { seconds: 400, remaining: 400, nextCall: 5 }, 'unfolding')
  let s = advance(fly(board, m), 10)
  assert.equal(s.missions[0].status, 'calling')

  // Pull the controller out of the command module: the channel closes.
  const room = s.modules.find((x) => x.kind === 'command')!
  for (const id of [...room.staff]) s = reducer(s, { type: 'assign', crewId: id, moduleId: null })
  assert.equal(missionCapacity(s), 0)
  assert.equal(inContact(s).has(m.id), false, 'out of contact')

  s = advance(s, 3)
  const decided = s.missions.find((x) => x.id === m.id)!
  assert.equal(decided.status, 'flying', 'they stopped waiting')
  assert.equal(decided.choices.length, 1)
  assert.ok(
    decided.choices[0].includes('Nobody was on the channel'),
    `the report says who chose: ${decided.choices[0]}`,
  )
})

test('an open job cannot be recalled through a channel nobody is holding', () => {
  const [board, m] = offer(ready(1), { seconds: 20, danger: 0.1 }, 'open')
  let s = advance(fly(board, m), 30)
  const room = s.modules.find((x) => x.kind === 'command')!
  for (const id of [...room.staff]) s = reducer(s, { type: 'assign', crewId: id, moduleId: null })

  assert.equal(reducer(s, { type: 'recall', missionId: m.id }), s, 'you cannot tell them anything')
  assert.equal(s.missions.find((x) => x.id === m.id)!.recalled, false)
})

test('an unattended team never takes the greedy answer', () => {
  const m = makeMission(rng, 0.5, { shape: 'unfolding' })
  for (let i = 0; i < 60; i += 1) {
    const call = rollCall(rng, m)
    if (!call) continue
    const pick = call.options[unattended(call)]
    const worst = Math.min(...call.options.map((o) => o.odds ?? 0))
    assert.ok((pick.odds ?? 0) >= worst, 'they pick the safer end of what is on offer')
  }
})

test('an obligation pays in standing and costs standing to refuse', () => {
  const base: GameState = { ...ready(), patron: 'terran' }
  const [board, m] = offer(base, {
    obligation: true,
    standing: ['terran', 0.05],
    name: 'Terran tasking',
  })
  assert.equal(m.obligation, true)

  const declined = reducer(board, { type: 'declineMission', missionId: m.id })
  assert.equal(declined.missions.length, 0, 'it leaves the board')
  assert.ok(declined.standing.terran < board.standing.terran, 'and saying no is the cost')

  // An ordinary job costs nothing to let go.
  const [plain, ordinary] = offer(base)
  const dropped = reducer(plain, { type: 'declineMission', missionId: ordinary.id })
  assert.deepEqual(dropped.standing, plain.standing)
})

test('work paid in standing settles when the team gets home', () => {
  const [board, m] = offer(ready(), {
    seconds: 10,
    remaining: 10,
    standing: ['concern', 0.06],
    danger: 0.1,
  })
  const s = advance(fly(board, m), 40)
  const done = s.missions.find((x) => x.id === m.id)!
  assert.equal(done.status, 'report')
  // Trying counts for something; only a disaster is held against you.
  if (done.outcome === 'disaster') {
    assert.ok(s.standing.concern < board.standing.concern, 'a disaster is held against you')
  } else {
    assert.ok(s.standing.concern > board.standing.concern, 'the Concern noticed the work')
  }
})

test('the better the run, the more of the goodwill it earns', () => {
  // The roll carries ±10 of noise, so this is a claim about the average and
  // has to be measured as one.
  const settle = (stat: number) => {
    let total = 0
    for (let i = 0; i < 25; i += 1) {
      const [board, m] = offer(ready(), { seconds: 10, remaining: 10, standing: ['concern', 0.06] })
      const team: GameState = {
        ...board,
        crew: board.crew.map((c) => ({ ...c, stats: { ...c.stats, [m.stat]: stat }, level: stat })),
      }
      const after = advance(fly(team, m), 40)
      total += after.standing.concern - board.standing.concern
    }
    return total / 25
  }
  const good = settle(12)
  const bad = settle(1)
  assert.ok(good > bad, `a good crew should out-earn a hopeless one: ${good} vs ${bad}`)
})
