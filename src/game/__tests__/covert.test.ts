import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ASK_RISK,
  advance,
  covertShift,
  discretion,
  exposureRisk,
  expose,
  newGame,
  reducer,
  seeded,
  sendApproach,
  wouldCome,
  worthSounding,
} from '../engine.ts'
import { def } from '../modules.ts'
import { makeVisitor } from '../visitors.ts'
import { labels, line, open, say } from './talkHelp.ts'
import type { GameState, Visitor } from '../types.ts'

// One seed per file, so every draw below is the same draw every run.
const rng = seeded(3300)

// Every station in this file is founded from a known seed.
let founded = 0
const fresh = () => newGame('Spaceport-99', 3300 + (founded += 1))

const rich = (s: GameState): GameState => ({ ...s, credits: 60000 })

/** A station with a staffed, powered Covert Ops room. */
const withRoom = (over: Partial<GameState> = {}): GameState => {
  let s: GameState = { ...rich(fresh()), ...over }
  s = reducer(s, { type: 'build', kind: 'covertops', deck: 0, col: 2 })
  const m = s.modules.find((x) => x.kind === 'covertops')
  if (!m) throw new Error('Covert Ops was not built')
  for (const c of s.crew.filter((x) => !x.dead)) {
    s = reducer(s, { type: 'assign', crewId: c.id, moduleId: m.id })
  }
  return s
}

/** A hull alongside, carrying somebody's quiet word. */
const carrying = (s: GameState, over: Partial<Visitor> = {}): [GameState, Visitor] => {
  const v: Visitor = {
    ...makeVisitor(rng, [...s.ships.map((h) => h.name), ...s.visitors.map((x) => x.name)]),
    status: 'docked',
    timer: 9000,
    kind: 'trader',
    claim: 'trader',
    faction: 'terran',
    covert: { from: 'concern', ask: 'cargo', pays: 300 },
    ...over,
  }
  return [{ ...s, visitors: [...s.visitors, v] }, v]
}

test('the room is late, expensive, and run by people who read a room', () => {
  const d = def('covertops')
  assert.equal(d.stat, 'A', 'Adaptability — reading people and keeping your mouth shut')
  assert.ok(d.unlockAtCrew >= 45, 'nobody runs one of these off a founding crew')
  assert.ok(d.cost >= 900)
  assert.ok((d.discretion ?? 0) > 0)
})

test('without the room you are dealing on the open channel and hoping', () => {
  const bare = rich(fresh())
  assert.equal(discretion(bare), 0)
  assert.ok(exposureRisk(bare) > 0.4, 'and it shows in the odds')
})

test('the room hides a great deal and never everything', () => {
  const s = withRoom()
  assert.ok(discretion(s) > 0, 'it does something')
  assert.ok(discretion(s) < 0.8, 'and never reaches certainty')
  assert.ok(exposureRisk(s) < exposureRisk(rich(fresh())), 'the odds improve')
  assert.ok(exposureRisk(s) >= 0.06, 'but never to nothing')

  // Take the watch off it and you are back where you started.
  const m = s.modules.find((x) => x.kind === 'covertops')!
  const idle = { ...s, modules: s.modules.map((x) => (x.id === m.id ? { ...x, staff: [] } : x)) }
  assert.equal(discretion(idle), 0, 'an empty room keeps nobody quiet')
})

test('the bigger the ask, the harder it is to keep quiet', () => {
  assert.ok(ASK_RISK.window > ASK_RISK.cargo)
  assert.ok(ASK_RISK.turn > ASK_RISK.window)
  assert.ok(ASK_RISK.names < ASK_RISK.cargo, 'reading somebody your own log is nothing')
})

test('nobody sounds out a station with nothing on it', () => {
  assert.equal(worthSounding(fresh()), false)
})

test('an approach never arrives on a hull flying the sender’s own paper', () => {
  let s = rich(fresh())
  // Fill the board with hulls, all flying different paper.
  for (const faction of ['terran', 'compact', 'unlisted'] as const) {
    const [next] = carrying(s, { faction, covert: undefined })
    s = next
  }
  let found = 0
  for (let i = 0; i < 40; i += 1) {
    const attempt: GameState = { ...s, rng: s.rng + i, visitors: s.visitors.map((v) => ({ ...v })) }
    if (!sendApproach(attempt)) continue
    const hull = attempt.visitors.find((v) => v.covert)
    assert.ok(hull, 'somebody is carrying it')
    assert.notEqual(hull.faction, hull.covert!.from, 'and it is not their own hull')
    found += 1
  }
  assert.ok(found > 0, 'approaches do arrive')
})

test('taking the quiet word pays, and opens a channel that was not there', () => {
  const [s, v] = carrying(withRoom())
  const before = s.credits
  let talk = open(s, 'covert', { kind: 'visitor', id: v.id })
  talk = say(talk, 'Go on')
  talk = say(talk, 'All right')
  assert.equal(talk.credits, before + 300, 'they pay what they said')
  assert.ok(talk.covert.concern > 0, 'and now they are owed a favour, or owe you one')
  assert.equal(talk.visitors[0].covert, undefined, 'the offer is spent')
})

test('refusing costs nothing, which is what makes taking it a choice', () => {
  const [s, v] = carrying(withRoom())
  let talk = open(s, 'covert', { kind: 'visitor', id: v.id })
  talk = say(talk, 'Go on')
  talk = say(talk, 'No.')
  assert.equal(talk.credits, s.credits, 'no money changes hands')
  assert.equal(talk.standing.terran, s.standing.terran, 'and your flag never hears of it')
  assert.equal(talk.burned, 0)
  assert.equal(talk.visitors[0].covert, undefined)
})

test('reporting it is picking a side out loud', () => {
  const [s, v] = carrying(withRoom())
  let talk = open(s, 'covert', { kind: 'visitor', id: v.id })
  talk = say(talk, 'Go on')
  assert.ok(labels(talk).some((l) => l.includes('Report it')), 'the option is there')
  talk = say(talk, 'Report it')
  assert.ok(talk.standing.terran > s.standing.terran, 'your flag is pleased')
  assert.ok(talk.standing.concern < s.standing.concern, 'theirs is not')
  assert.ok(talk.covert.concern < 0, 'and that channel is shut')
})

test('there is nobody to report to when you fly nobody’s flag', () => {
  const [s, v] = carrying({ ...withRoom(), patron: null })
  let talk = open(s, 'covert', { kind: 'visitor', id: v.id })
  talk = say(talk, 'Go on')
  assert.ok(!labels(talk).some((l) => l.includes('Report it')))
})

test('an arrangement that comes out is worse the second time', () => {
  // Deep copies: the standing ledger is a shared object otherwise, and this
  // test is entirely about comparing before with after.
  const copy = (s: GameState): GameState => structuredClone(s)
  const one = rich(fresh())
  const first = copy(one)
  expose(first, 'concern', 'cargo')
  assert.equal(first.burned, 1)
  assert.ok(first.standing.terran < one.standing.terran, 'your flag takes it personally')

  const second = copy(first)
  expose(second, 'concern', 'cargo')
  assert.equal(second.burned, 2)
  assert.ok(
    second.standing.terran - first.standing.terran < first.standing.terran - one.standing.terran,
    'and worse the second time',
  )
  assert.ok(second.nextTakeoverIn <= 600, 'somebody is now on their way to discuss it')
})

test('a power you deal with has less reason to come and take the place', () => {
  const base: GameState = { ...rich(fresh()), patron: 'terran' }
  const tally = (s: GameState) => {
    const seen: Record<string, number> = {}
    let at = s
    for (let i = 0; i < 200; i += 1) {
      const who = wouldCome(at)
      if (who) seen[who] = (seen[who] ?? 0) + 1
      at = { ...at, rng: at.rng + 1 }
    }
    return seen
  }
  const before = tally(base)
  const dealt = { ...base, covert: { ...base.covert, concern: 0.15 } }
  const after = tally(dealt)
  assert.ok(
    (after.concern ?? 0) < (before.concern ?? 0),
    `an arrangement should keep them away: ${before.concern} then ${after.concern}`,
  )
})

test('the arrangement is a door out of a takeover, and it only opens once', () => {
  let s: GameState = { ...rich(fresh()), patron: 'terran' }
  const [board, v] = carrying(s, { intent: 'conquest', force: 20, faction: 'concern', covert: undefined })
  s = board

  // With nothing off the record, that door is not there.
  const cold = open(s, 'conquest', { kind: 'visitor', id: v.id })
  assert.ok(!labels(cold).some((l) => l.includes('what you have been doing')))

  // With an arrangement, it is.
  const warm = { ...s, covert: { ...s.covert, concern: 0.15 } }
  let talk = open(warm, 'conquest', { kind: 'visitor', id: v.id })
  assert.ok(labels(talk).some((l) => l.includes('what you have been doing')))
  talk = say(talk, 'what you have been doing')
  assert.match(line(talk), /untidy to take a station we are already talking to/)
  talk = say(talk, 'take the clamps off')
  assert.equal(talk.visitors[0].intent, undefined, 'they withdrew')
  assert.ok(talk.patron === 'terran', 'and the flag did not change')
  assert.ok(talk.covert.concern < 0.15, 'the arrangement was spent doing it')
})

test('the quiet word rides in on ordinary traffic, given time', () => {
  // A station worth sounding out, with hulls alongside and the clock run down.
  let s: GameState = { ...rich(fresh()), nextApproachIn: 1 }
  for (let i = 0; i < 8; i += 1) s = reducer(s, { type: 'build', kind: 'quarters', deck: 0, col: i })
  const [board] = carrying(s, { faction: 'unlisted', covert: undefined })
  assert.ok(worthSounding(board), 'there is something here now')
  const after = advance({ ...board, nextApproachIn: 1 }, 4)
  assert.ok(
    after.visitors.some((v) => v.covert) || after.nextApproachIn > 0,
    'either somebody asked, or the clock is waiting on a hull',
  )
})

test('a channel opened stays open across a save', () => {
  const s = { ...fresh() }
  covertShift(s, 'compact', 0.1)
  const reloaded = JSON.parse(JSON.stringify(s)) as GameState
  assert.equal(reloaded.covert.compact, s.covert.compact)
})
