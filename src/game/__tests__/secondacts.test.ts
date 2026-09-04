import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CLAIM_AFTER,
  advance,
  newGame,
  reducer,
  seeded,
  sendClaimant,
  sendLevy,
} from '../engine.ts'
import { rollCall } from '../calls.ts'
import { makeCrew } from '../crew.ts'
import { makeMission } from '../fleet.ts'
import { labels, line, open, say } from './talkHelp.ts'
import type { GameState, Prisoner } from '../types.ts'

// One seed per file, so every draw below is the same draw every run.
const rng = seeded(5200)

let founded = 0
const fresh = () => newGame('Spaceport-99', 5200 + (founded += 1))

const rich = (s: GameState): GameState => ({ ...s, credits: 90000 })

/**
 * A station that can actually hold somebody. Cells only hold while a Brig is
 * built, powered and staffed — without one the prisoner walks out on the next
 * tick, which is correct behaviour and no use at all for testing what happens
 * to people who stay.
 */
const jailer = (over: Partial<GameState> = {}): GameState => {
  let s: GameState = {
    ...rich(fresh()),
    decks: 3,
    crew: [...rich(fresh()).crew, ...Array.from({ length: 30 }, () => makeCrew(rng))],
  }
  let built = false
  for (let deck = 0; deck < s.decks && !built; deck += 1) {
    for (let col = 0; col < 12 && !built; col += 1) {
      const next = reducer(s, { type: 'build', kind: 'brig', deck, col })
      if (next.modules.length > s.modules.length) {
        s = next
        built = true
      }
    }
  }
  if (!built) throw new Error('no Brig')
  const brig = s.modules.find((m) => m.kind === 'brig')!
  for (const c of s.crew.filter((x) => !x.dead).slice(0, 3)) {
    s = reducer(s, { type: 'assign', crewId: c.id, moduleId: brig.id })
  }
  return { ...s, ...over }
}

const jailed = (over: Partial<Prisoner> = {}): Prisoner => ({
  id: 'p_test',
  name: 'Wren Trent',
  faction: 'unlisted',
  charge: 'a hold they would not account for',
  hull: 'Loose Change',
  stats: { O: 3, R: 3, B: 4, I: 3, T: 3, A: 3, L: 3 },
  seed: 12,
  held: CLAIM_AFTER + 10,
  ...over,
})

/** A station with somebody in the cells and a hull alongside asking for them. */
const asked = (over: Partial<GameState> = {}): GameState => {
  const s: GameState = { ...jailer(), prisoners: [jailed()], ...over }
  const after = structuredClone(s)
  sendClaimant(after, 'p_test')
  return after
}

test('holding somebody long enough brings their people to the clamps', () => {
  const s: GameState = { ...jailer(), prisoners: [jailed({ held: 0 })], nextClaimIn: 0 }
  // Nobody comes for somebody who has just been put in there.
  const early = advance(s, 5)
  assert.equal(early.visitors.some((v) => v.claiming), false)

  // Held past the threshold, somebody does.
  const late = advance({ ...s, prisoners: [jailed()], nextClaimIn: 0 }, 5)
  const hull = late.visitors.find((v) => v.claiming)
  assert.ok(hull, 'a hull turned up asking')
  assert.equal(hull.claiming, 'p_test')
  assert.equal(hull.faction, 'unlisted', 'flying their own paper, for once')
  assert.equal(late.talk?.script, 'claim', 'and it is addressed to you')
})

test('only one hull comes asking at a time', () => {
  let s: GameState = { ...jailer(), prisoners: [jailed()], nextClaimIn: 0 }
  s = advance(s, 5)
  const first = s.visitors.filter((v) => v.claiming).length
  s = advance({ ...s, nextClaimIn: 0, talk: null }, 5)
  assert.equal(s.visitors.filter((v) => v.claiming).length, first)
})

test('handing them over pays, and your own flag notices', () => {
  const s = asked({ patron: 'terran' })
  const hull = s.visitors.find((v) => v.claiming)!
  let talk = open({ ...s, talk: null }, 'claim', { kind: 'visitor', id: hull.id })
  talk = say(talk, 'Hand them over')
  assert.equal(talk.prisoners.length, 0, 'the cell is empty')
  assert.ok(talk.credits > s.credits, 'they paid')
  assert.ok(talk.standing.unlisted > s.standing.unlisted, 'their people are pleased')
  assert.ok(talk.standing.terran < s.standing.terran, 'yours are not')
})

test('giving them up for nothing buys something money cannot', () => {
  const s = asked()
  const hull = s.visitors.find((v) => v.claiming)!
  let talk = open({ ...s, talk: null }, 'claim', { kind: 'visitor', id: hull.id })
  talk = say(talk, 'for nothing')
  assert.equal(talk.credits, s.credits, 'no money changed hands')
  assert.ok(talk.standing.unlisted > s.standing.unlisted)
  assert.ok(talk.covert.unlisted > s.covert.unlisted, 'and a channel opened')
})

test('refusing keeps the prisoner and buys trouble', () => {
  const s = asked()
  const hull = s.visitors.find((v) => v.claiming)!
  let talk = open({ ...s, talk: null }, 'claim', { kind: 'visitor', id: hull.id })
  talk = say(talk, 'They stay where they are')
  assert.equal(talk.prisoners.length, 1, 'still in the cells')
  assert.ok(talk.standing.unlisted < s.standing.unlisted)
  assert.equal(talk.visitors.find((v) => v.id === hull.id)?.claiming, undefined, 'the hull is done')
})

test('they will bid once, and only once', () => {
  const s = asked()
  const hull = s.visitors.find((v) => v.claiming)!
  let talk = open({ ...s, talk: null }, 'claim', { kind: 'visitor', id: hull.id })
  talk = say(talk, 'worth to somebody else')
  assert.match(line(talk), /I will not be asked again/)
  const offered = talk.visitors.find((v) => v.id === hull.id)!.asking!
  talk = say(talk, 'Take it')
  assert.ok(talk.credits >= s.credits + offered, 'more than the first offer')
  assert.equal(talk.prisoners.length, 0)
})

test('a hull that comes for somebody already gone is told so', () => {
  const s = asked()
  const hull = s.visitors.find((v) => v.claiming)!
  const empty: GameState = { ...s, prisoners: [], talk: null }
  const talk = open(empty, 'claim', { kind: 'visitor', id: hull.id })
  assert.match(line(talk), /Told wrong/)
  assert.ok(!labels(talk).some((l) => l.includes('Hand them over')))
})

test('losing the flag is not the end of it — the first bill follows', () => {
  const s: GameState = { ...rich(fresh()), patron: 'concern', resigned: ['terran'] }
  const after = structuredClone(s)
  sendLevy(after)
  const hull = after.visitors[0]
  assert.ok(hull, 'they sent somebody')
  assert.equal(hull.faction, 'concern', 'flying the flag that is now over your door')
  assert.equal(after.talk?.script, 'levy')

  let talk = open({ ...after, talk: null }, 'levy', { kind: 'visitor', id: hull.id })
  const asks = labels(talk)
  assert.ok(asks.some((l) => l.includes('assessment')), 'credits')
  assert.ok(asks.some((l) => l.includes('Second two of the crew')), 'or people')
})

test('paying the assessment settles it; refusing tells everyone who used to own you', () => {
  const s: GameState = { ...rich(fresh()), patron: 'concern', resigned: ['terran'] }
  const after = structuredClone(s)
  sendLevy(after)
  const hull = after.visitors[0]

  let paid = open({ ...structuredClone(after), talk: null }, 'levy', { kind: 'visitor', id: hull.id })
  paid = say(paid, 'Pay the assessment')
  assert.ok(paid.credits < after.credits)
  assert.ok(paid.standing.concern > after.standing.concern)

  let refused = open({ ...structuredClone(after), talk: null }, 'levy', { kind: 'visitor', id: hull.id })
  refused = say(refused, 'Refuse the assessment')
  assert.ok(refused.standing.concern < after.standing.concern, 'they take it badly')
  assert.ok(refused.covert.terran > after.covert.terran, 'the flag you lost takes it well')
  assert.ok(refused.nextApproachIn <= 270, 'and will be in touch shortly')
})

test('seconding crew costs people rather than money', () => {
  const s: GameState = { ...rich(fresh()), patron: 'concern', resigned: ['terran'] }
  const after = structuredClone(s)
  sendLevy(after)
  const hull = after.visitors[0]
  let talk = open({ ...after, talk: null }, 'levy', { kind: 'visitor', id: hull.id })
  const before = talk.crew.length
  talk = say(talk, 'Second two of the crew')
  assert.equal(talk.crew.length, before - 2, 'two of them went')
  assert.equal(talk.credits, after.credits, 'and it cost nothing you can count')
})

test('a takeover schedules its own second act', () => {
  const s: GameState = { ...rich(fresh()), nextLevyIn: 2, patron: 'concern' }
  const after = advance(s, 4)
  assert.ok(after.visitors.some((v) => v.faction === 'concern'), 'somebody came to inspect')
  assert.equal(after.nextLevyIn, 0, 'and the clock is spent')
})

test('there are hails only a far team ever sends', () => {
  const near = makeMission(rng, 0.4, { far: false, shape: 'unfolding' })
  const far = makeMission(rng, 0.4, { far: true, shape: 'unfolding' })
  const textsFor = (m: typeof near) => {
    const seen = new Set<string>()
    for (let i = 0; i < 80; i += 1) {
      const call = rollCall(rng, m)
      if (call) seen.add(call.text.slice(0, 40))
    }
    return seen
  }
  const nearTexts = textsFor(near)
  const farTexts = textsFor(far)
  const onlyFar = [...farTexts].filter((x) => !nearTexts.has(x))
  assert.ok(onlyFar.length > 0, 'far work has troubles of its own')
})

test('a far team out of contact reports rather than asking', () => {
  let s = rich(fresh())
  const far = {
    ...makeMission(rng, 0.4, { far: true, shape: 'unfolding' }),
    status: 'flying' as const,
    nextCall: 1,
    remaining: 400,
  }
  s = advance({ ...s, missions: [far] }, 4)
  const m = s.missions[0]
  assert.notEqual(m.status, 'calling', 'nobody is waiting on an answer you cannot give')
  assert.ok(
    s.log.some((l) => l.text.includes('relayed and late')),
    'what arrives is a report of a decision already taken',
  )
})
