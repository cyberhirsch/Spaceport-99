import assert from 'node:assert/strict'
import test from 'node:test'
import { CLAIM_AFTER, makeWalkIn, newGame, openThreads, questStageLabel, seeded } from '../engine.ts'
import { blankQuest } from '../quest.ts'
import { makeMission } from '../fleet.ts'
import { makeVisitor } from '../visitors.ts'
import type { GameState, Prisoner, Visitor } from '../types.ts'

const rng = seeded(8800)
let founded = 0
const fresh = () => newGame('Spaceport-99', 8800 + (founded += 1))

const hull = (over: Partial<Visitor>): Visitor => ({
  ...makeVisitor(rng),
  status: 'holding',
  timer: 300,
  ...over,
})

const jailed = (held: number): Prisoner => ({
  id: 'p1',
  name: 'Iolo Vance',
  faction: 'concern',
  charge: 'running cargo without a manifest',
  hull: 'Coldharbour',
  stats: { O: 3, R: 3, B: 3, I: 3, T: 3, A: 3, L: 3 },
  seed: 41,
  held,
})

test('a quiet station has nothing on the board', () => {
  assert.deepEqual(openThreads(fresh()), [])
})

test('a hull standing off is a thread with a clock, and it gets worse', () => {
  const s = fresh()
  const loiter = openThreads({ ...s, visitors: [hull({ intent: 'loiter', timer: 200 })] })[0]
  assert.match(loiter.title, /standing off/)
  assert.equal(loiter.clock, 200)

  const demand = openThreads({ ...s, visitors: [hull({ intent: 'demand', asking: 900, timer: 60 })] })[0]
  assert.match(demand.title, /wants 900c/)
  assert.equal(demand.tone, 'bad')

  const raid = openThreads({ ...s, visitors: [hull({ intent: 'raid', timer: 8 })] })[0]
  assert.match(raid.title, /coming in/)

  const conquest = openThreads({ ...s, visitors: [hull({ intent: 'conquest' })] })[0]
  assert.equal(conquest.clock, undefined, 'a conqueror waits as long as it likes')
})

test('somebody in the cells counts down to their people arriving', () => {
  const s = fresh()
  const early = openThreads({ ...s, prisoners: [jailed(60)] })[0]
  assert.match(early.title, /in the cells/)
  assert.equal(early.clock, CLAIM_AFTER - 60)

  const late = openThreads({ ...s, prisoners: [jailed(CLAIM_AFTER + 5)], nextClaimIn: 20 })[0]
  assert.match(late.title, /coming for Iolo Vance/)
  assert.equal(late.clock, 20)

  // Once their hull is alongside, the cell line gives way to the claim.
  const alongside = openThreads({
    ...s,
    prisoners: [jailed(CLAIM_AFTER + 5)],
    visitors: [hull({ status: 'docked', claiming: 'p1', name: 'Glass Verdict' })],
  })
  assert.equal(alongside.length, 1)
  assert.match(alongside[0].title, /Iolo Vance's people are alongside/)
})

test('an applicant on the dock says what to do with them', () => {
  const s = fresh()
  const walk = { ...makeWalkIn(s), name: 'Wren Halloway' }
  const posted = openThreads({ ...s, candidates: [{ ...walk, origin: 'posted' as const }] })[0]
  assert.match(posted.detail, /Welcome them aboard/)
  const asked = openThreads({ ...s, candidates: [{ ...walk, origin: 'applied' as const }] })[0]
  assert.match(asked.detail, /Interview them/)
  const enRoute = openThreads({ ...s, candidates: [{ ...walk, arrivesIn: 40 }] })[0]
  assert.match(enRoute.title, /on a courier/)
  assert.equal(enRoute.clock, 40)
})

test('a hail waiting on an answer has no clock, and sorts after everything that does', () => {
  const s = fresh()
  const calling = { ...makeMission(rng, 0.5), status: 'calling' as const }
  const threads = openThreads({
    ...s,
    missions: [calling],
    visitors: [hull({ intent: 'loiter', timer: 500 })],
    prisoners: [jailed(10)],
  })
  assert.equal(threads.at(-1)?.title, `${calling.name} is hailing`)
  const clocks = threads.slice(0, -1).map((t) => t.clock!)
  assert.deepEqual(clocks, [...clocks].sort((a, b) => a - b), 'soonest first')
})

test('the file has a line for every stage and every ending', () => {
  const q = blankQuest()
  const stages = ['none', 'letter', 'checking', 'watched', 'siege'] as const
  const seen = new Set(stages.map((stage) => questStageLabel({ ...q, stage })))
  assert.equal(seen.size, stages.length)
  for (const ending of ['published', 'sold', 'buried', 'met', 'lost'] as const) {
    assert.match(questStageLabel({ ...q, stage: 'over', ending }), /^Closed/)
  }
  const s: GameState = { ...fresh(), quest: { ...q, stage: 'watched' } }
  assert.ok(openThreads(s).some((t) => /asking about this station/.test(t.title)))
})
