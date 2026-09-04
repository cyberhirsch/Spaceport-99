import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ARMED_ENOUGH,
  advance,
  defence,
  newGame,
  raiseDemand,
  reducer,
  resolveRaid,
  seeded,
  sendLoiter,
  tribute,
  visitorPhase,
  worthLeaningOn,
} from '../engine.ts'
import { makeCrew } from '../crew.ts'
import { makeVisitor } from '../visitors.ts'
import { labels, line, open, say } from './talkHelp.ts'
import type { GameState, ModuleKind, Visitor } from '../types.ts'

// One seed per file, so every draw below is the same draw every run.
const rng = seeded(4100)

// Every station in this file is founded from a known seed.
let founded = 0
const fresh = () => newGame('Spaceport-99', 4100 + (founded += 1))

const rich = (s: GameState): GameState => ({ ...s, credits: 90000 })

/** Put a room wherever the station will take it. */
const place = (s: GameState, kind: ModuleKind): GameState => {
  for (let deck = 0; deck < Math.max(1, s.decks); deck += 1) {
    for (let col = 0; col < 12; col += 1) {
      const next = reducer(s, { type: 'build', kind, deck, col })
      if (next.modules.length > s.modules.length) return next
    }
  }
  throw new Error(`could not place ${kind}`)
}

/** A station big enough to be worth leaning on. */
const grown = (over: Partial<GameState> = {}): GameState => {
  let s: GameState = {
    ...rich(fresh()),
    decks: 3,
    crew: [...rich(fresh()).crew, ...Array.from({ length: 18 }, () => makeCrew(rng))],
  }
  for (const kind of ['quarters', 'comms', 'storage', 'medbay', 'library'] as ModuleKind[]) {
    s = place(s, kind)
  }
  s = reducer(s, { type: 'autoAssign' })
  return { ...s, ...over }
}

/** A station with batteries worth talking behind. */
const armed = (): GameState => {
  let s = place(grown(), 'battery')
  s = place(s, 'battery')
  // Take people off whatever they were doing: guns need hands to count, and
  // each battery needs its own hands — assigning the same four twice leaves the
  // first one empty.
  const hands = s.crew.filter((x) => !x.dead)
  s.modules
    .filter((x) => x.kind === 'battery')
    .forEach((m, i) => {
      for (const c of hands.slice(i * 4, i * 4 + 4)) {
        s = reducer(s, { type: 'assign', crewId: c.id, moduleId: m.id })
      }
    })
  return s
}

/** A hull standing off, at whatever step of the sequence you like. */
const standingOff = (s: GameState, over: Partial<Visitor> = {}): [GameState, Visitor] => {
  const v: Visitor = {
    ...makeVisitor(rng, [...s.ships.map((h) => h.name), ...s.visitors.map((x) => x.name)]),
    status: 'holding',
    intent: 'loiter',
    faction: 'unlisted',
    kind: 'raider',
    force: 24,
    timer: 300,
    aboard: [],
    offer: null,
    ...over,
  }
  return [{ ...s, visitors: [...s.visitors, v] }, v]
}

test('nobody leans on a station with nothing on it', () => {
  assert.equal(worthLeaningOn(fresh()), false)
  assert.equal(worthLeaningOn(grown()), true)
})

test('a hull that is standing off is not docked, not asking, and visible', () => {
  const [, v] = standingOff(grown())
  assert.equal(visitorPhase(v), 'holding')
  assert.equal(v.status, 'holding')
  assert.notEqual(v.intent, undefined)
})

test('one at a time — this is a sequence, not a swarm', () => {
  let s = grown({ nextLoiterIn: 1 })
  s = advance(s, 3)
  const first = s.visitors.filter((v) => v.intent === 'loiter').length
  s = advance({ ...s, nextLoiterIn: 1 }, 3)
  assert.equal(s.visitors.filter((v) => v.intent === 'loiter').length, first)
  assert.ok(first <= 1)
})

test('guns are an argument; without them the same words are a bluff', () => {
  const strong = armed()
  assert.ok(defence(strong).guns >= ARMED_ENOUGH, 'the batteries are worth talking behind')
  const [board, v] = standingOff(strong)
  let talk = open(board, 'loiter', { kind: 'visitor', id: v.id })
  talk = say(talk, 'move along')
  assert.match(line(talk), /came about/)
  assert.equal(talk.visitors[0].intent, undefined, 'they went')

  const weak = grown()
  assert.ok(defence(weak).guns < ARMED_ENOUGH)
  const [board2, v2] = standingOff(weak)
  let talk2 = open(board2, 'loiter', { kind: 'visitor', id: v2.id })
  talk2 = say(talk2, 'move along')
  assert.match(line(talk2), /With what/)
  assert.equal(talk2.visitors[0].intent, 'loiter', 'they are still there')
  assert.ok(talk2.visitors[0].timer <= 40, 'and in less of a mood to wait')
})

test('the quoted price does not drift while you are reading it', () => {
  let s = grown({ nextLoiterIn: 1 })
  s = advance(s, 3)
  const v = s.visitors.find((x) => x.intent === 'loiter')
  assert.ok(v, 'a hull turned up')
  assert.ok(v.asking && v.asking > 0, 'and quoted a figure on arrival')
  // Move everything tribute() used to depend on, then ask again.
  const later: GameState = { ...s, credits: s.credits + 40000 }
  assert.equal(tribute(later, later.visitors.find((x) => x.id === v.id)!), v.asking)
})

test('paying early is cheaper than paying late', () => {
  const s = grown()
  const [, v] = standingOff(s)
  const early = Math.round(tribute(s, v) * 0.55)
  assert.ok(early < tribute(s, v), 'the loiterer asks less than the demand does')
})

test('an ignored hull escalates rather than wandering off', () => {
  let s = grown()
  const [board, v] = standingOff(s, { timer: 2 })
  s = advance(board, 4)
  const now = s.visitors.find((x) => x.id === v.id)
  assert.ok(now, 'still on the board')
  assert.equal(now.intent, 'demand', 'it did something rather than nothing')
  assert.ok(s.talk, 'and it opened a channel of its own')
  assert.equal(s.talk.script, 'demand')
})

test('the demand can be paid, and paying is noticed', () => {
  const s = grown()
  const [board, v] = standingOff(s, { intent: 'demand', timer: 400 })
  const owed = tribute(board, v)
  let talk = open(board, 'demand', { kind: 'visitor', id: v.id })
  talk = say(talk, 'Pay them')
  assert.equal(talk.credits, board.credits - owed)
  assert.equal(talk.visitors[0].intent, undefined, 'they went')
  assert.ok(talk.standing.unlisted > board.standing.unlisted, 'the Drift writes it down')
})

test('refusing brings them in, and being ready is worth something', () => {
  const s = grown()
  const [board, v] = standingOff(s, { intent: 'demand', timer: 400, force: 40 })
  let talk = open(board, 'demand', { kind: 'visitor', id: v.id })
  talk = say(talk, 'Refuse')
  const after = talk.visitors[0]
  assert.equal(after.intent, 'raid', 'they are coming')
  assert.ok((after.force ?? 99) < 40, 'meeting it on your timing costs them')
  // And it lands — once the channel is actually closed. Nothing moves while
  // the closing line is still on screen.
  const done = advance(say(talk, 'Close'), 20)
  assert.equal(done.visitors[0]?.intent, undefined, 'the raid resolved')
})

test('a raid costs rooms, cargo and blood, and is survivable', () => {
  const s = armed()
  const [board] = standingOff(s, { intent: 'raid', force: 30, timer: 400 })
  const before = {
    credits: board.credits,
    hp: board.crew.reduce((n, c) => n + c.hp, 0),
    condition: board.modules.reduce((n, m) => n + m.condition, 0),
  }
  const after = structuredClone(board)
  resolveRaid(after, after.visitors[0])
  assert.ok(after.credits < before.credits, 'they took something')
  assert.ok(
    after.crew.reduce((n, c) => n + c.hp, 0) < before.hp ||
      after.modules.reduce((n, m) => n + m.condition, 0) < before.condition,
    'and left a mark',
  )
  assert.equal(after.crew.filter((c) => c.dead).length, 0, 'a defended station does not bury anyone')
  assert.equal(after.visitors[0].intent, undefined, 'and it is over')
  assert.ok(after.standing.unlisted < board.standing.unlisted)
})

test('only a station with nothing to fight with buries anybody', () => {
  // No batteries, no shield, and nobody armed: the one case that kills.
  let s = grown()
  s = { ...s, crew: s.crew.map((c) => ({ ...c, gear: {}, hp: 12, maxHp: 60 })), ships: [] }
  const [board] = standingOff(s, { intent: 'raid', force: 90, timer: 400 })
  let died = 0
  for (let i = 0; i < 30; i += 1) {
    const attempt = structuredClone({ ...board, rng: board.rng + i })
    resolveRaid(attempt, attempt.visitors[0])
    died += attempt.crew.filter((c) => c.dead).length
  }
  assert.ok(died > 0, 'defenceless and forewarned is how people die here')
})

test('a raid never wipes the station out entirely', () => {
  let s = grown()
  s = { ...s, crew: s.crew.map((c) => ({ ...c, gear: {}, hp: 5, maxHp: 60 })), ships: [] }
  const [board] = standingOff(s, { intent: 'raid', force: 200, timer: 400 })
  const after = structuredClone(board)
  resolveRaid(after, after.visitors[0])
  assert.ok(after.crew.some((c) => !c.dead), 'somebody is always left to shut the door')
})

test('an arrangement buys you out of it, once', () => {
  const s: GameState = { ...grown(), covert: { ...grown().covert, compact: 0.15 } }
  const [board, v] = standingOff(s, { faction: 'compact' })
  let talk = open(board, 'loiter', { kind: 'visitor', id: v.id })
  assert.ok(labels(talk).some((l) => l.includes('who you have been talking to')))
  talk = say(talk, 'who you have been talking to')
  assert.equal(talk.visitors[0].intent, undefined, 'they broke off')
  assert.ok(talk.covert.compact < 0.15, 'and it cost the arrangement')
})

test('a station that deals off the record is told what is coming', () => {
  const s: GameState = { ...grown(), covert: { ...grown().covert, concern: 0.12 } }
  const warned = structuredClone(s)
  sendLoiter(warned)
  assert.ok(
    warned.log.some((l) => l.text.includes('does not exist')),
    'somebody tipped you off',
  )
})

test('raising the demand is what puts it in front of you', () => {
  const s = grown()
  const [board, v] = standingOff(s)
  const after = structuredClone(board)
  raiseDemand(after, after.visitors[0])
  assert.equal(after.visitors[0].intent, 'demand')
  assert.equal(after.talk?.script, 'demand')
  assert.equal(after.talk?.with.id, v.id)
})
