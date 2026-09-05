import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BOARDING_PATIENCE,
  beginBoarding,
  defendersOf,
  ARMED_ENOUGH,
  advance,
  defence,
  newGame,
  raiseDemand,
  reducer,
  seeded,
  sendLoiter,
  tribute,
  visitorPhase,
  worthLeaningOn,
} from '../engine.ts'
import { makeCrew } from '../crew.ts'
import { def } from '../modules.ts'
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
  // And they come in — once the channel is actually closed. Nothing moves
  // while the closing line is still on screen.
  const done = advance(say(talk, 'Close'), 20)
  assert.equal(done.visitors[0]?.intent, 'boarding', 'they came through the lock')
  assert.ok(done.boarding, 'and are standing in one of your rooms')
})

/** A boarding that runs until it is over, or for `limit` seconds. */
const fightItOut = (s: GameState, limit = 400): GameState => {
  let out = s
  for (let t = 0; t < limit && out.boarding; t += 5) out = advance(out, 5)
  return out
}

test('the battery decides how many come through the lock', () => {
  const [bare] = standingOff(grown(), { intent: 'raid', force: 30, timer: 400 })
  const open = structuredClone(bare)
  beginBoarding(open, open.visitors[0])
  const [guns] = standingOff(armed(), { intent: 'raid', force: 30, timer: 400 })
  const held = structuredClone(guns)
  beginBoarding(held, held.visitors[0])
  assert.ok(open.boarding && held.boarding, 'both stations are boarded')
  assert.ok(held.boarding!.boarders.length < open.boarding!.boarders.length, 'fewer make it past guns')
  assert.equal(held.visitors[0].intent, 'boarding')
  assert.equal(held.visitors[0].status, 'docked', 'their hull is on the clamps for the duration')
})

test('a station that plainly outguns them is not boarded at all', () => {
  const [board] = standingOff(armed(), { intent: 'raid', force: 4, timer: 400 })
  const s = structuredClone(board)
  beginBoarding(s, s.visitors[0])
  assert.equal(s.boarding, null)
  assert.equal(s.visitors[0].intent, undefined, 'they thought better of it')
})

test('boarders left alone loot the station and then leave with it', () => {
  let s = grown()
  // Nobody at the port: the party has the run of the place.
  const dock = s.modules.find((m) => m.kind === 'dock')!
  s = {
    ...s,
    crew: s.crew.map((c) => (c.assignment === dock.id ? { ...c, assignment: null } : c)),
    modules: s.modules.map((m) => (m.id === dock.id ? { ...m, staff: [] } : m)),
  }
  const [board] = standingOff(s, { intent: 'raid', force: 20, timer: 400 })
  const start = structuredClone(board)
  beginBoarding(start, start.visitors[0])
  const before = start.credits
  const after = fightItOut(start, BOARDING_PATIENCE + 20)
  assert.equal(after.boarding, null, 'they are gone')
  assert.ok(after.credits < before, 'and so is some of the money')
  assert.ok(after.log.some((l) => /went back up the lock/.test(l.text)))
  assert.ok(after.standing.unlisted < board.standing.unlisted, 'the Drift is not thanked for it')
})

test('a defended door kills boarders, and the dead leave their kit behind', () => {
  const [board] = standingOff(armed(), { intent: 'raid', force: 18, timer: 400 })
  const s = structuredClone(board)
  // Put the batteries' hands on the door instead, with sidearms.
  const dock = s.modules.find((m) => m.kind === 'dock')!
  s.stores = { sidearm: 4 }
  s.credits = 5000
  let posted = s as GameState
  for (const c of s.crew.filter((x) => !x.dead).slice(0, 4)) {
    posted = reducer(posted, { type: 'assign', crewId: c.id, moduleId: dock.id })
    posted = reducer(posted, { type: 'issueGear', crewId: c.id, item: 'sidearm' })
  }
  const start = structuredClone(posted)
  beginBoarding(start, start.visitors[0])
  const size = start.boarding!.boarders.length
  const after = fightItOut(start)
  assert.equal(after.boarding, null, 'it ends')
  assert.ok(after.log.some((l) => /is down\./.test(l.text)), 'boarders died')
  assert.ok(
    after.log.some((l) => /off the body/.test(l.text)),
    'and what they carried came off them',
  )
  assert.ok(after.credits >= 5000 - 1, 'a held door is not looted')
  assert.ok(after.visitors.every((v) => v.intent !== 'boarding'), 'the hull is no longer theirs')
  void size
})

test('a wiped party leaves its hull on the clamps, and the hull is yours', () => {
  // Built by hand rather than rolled: two boarders on their last legs in a
  // room with three lances waiting, and their hull on the clamps.
  let s = place(grown(), 'hangar')
  const [board, hull] = standingOff(s, {
    intent: 'boarding',
    status: 'docked',
    name: 'Glass Verdict',
    timer: 0,
  })
  const room = board.modules.find((m) => m.kind === 'quarters')!
  const hands = board.crew.filter((c) => !c.dead).slice(0, 3)
  const armedUp: GameState = {
    ...board,
    crew: board.crew.map((c) =>
      hands.some((h) => h.id === c.id)
        ? { ...c, assignment: room.id, gear: { sidearm: 'lance' as const } }
        : { ...c, assignment: c.assignment === room.id ? null : c.assignment },
    ),
    modules: board.modules.map((m) => (m.id === room.id ? { ...m, staff: hands.map((h) => h.id) } : m)),
    boarding: {
      shipId: hull.id,
      moduleId: room.id,
      boarders: [
        { id: 'b1', name: 'Oona Odell', hp: 4, maxHp: 20, kit: 'sidearm' },
        { id: 'b2', name: 'Halcyon Quint', hp: 4, maxHp: 20, kit: null },
      ],
      responders: [],
      size: 3,
      moveIn: 40,
      looted: 0,
      killed: 1,
      lost: 0,
      startedAt: board.elapsed,
    },
  }
  const fleetBefore = armedUp.ships.length
  const after = advance(armedUp, 15)
  assert.equal(after.boarding, null, 'it is over')
  assert.ok(!after.visitors.some((v) => v.id === hull.id), 'she is off the traffic board')
  assert.ok(
    after.ships.length > fleetBefore || after.log.some((l) => /went dockside/.test(l.text)),
    'and in the hangar, or sold if there was no berth',
  )
  assert.ok(after.log.some((l) => /nobody left aboard/.test(l.text)))
  assert.ok((after.stores.sidearm ?? 0) >= 1, 'and the sidearm came off the body')
})

test('what is left of a beaten party gives up if there is a cell to put them in', () => {
  let s = place(armed(), 'brig')
  const brig = s.modules.find((m) => m.kind === 'brig')!
  s = reducer(s, { type: 'assign', crewId: s.crew.filter((c) => !c.dead).at(-1)!.id, moduleId: brig.id })
  const [board] = standingOff(s, { intent: 'raid', force: 24, timer: 400 })
  const dock = board.modules.find((m) => m.kind === 'dock')!
  let posted = { ...board, stores: { lance: 4 } } as GameState
  for (const c of posted.crew.filter((x) => !x.dead && x.assignment !== brig.id).slice(0, 4)) {
    posted = reducer(posted, { type: 'assign', crewId: c.id, moduleId: dock.id })
    posted = reducer(posted, { type: 'issueGear', crewId: c.id, item: 'lance' })
  }
  const start = structuredClone(posted)
  beginBoarding(start, start.visitors[0])
  const after = fightItOut(start)
  assert.equal(after.boarding, null)
  assert.ok(after.prisoners.length > 0, 'somebody threw down a weapon')
  assert.match(after.prisoners[0].charge, /boarding the station/)
})

test('a defender who keeps the door alone can die on it', () => {
  let s = grown()
  const dock = s.modules.find((m) => m.kind === 'dock')!
  const hand = s.crew.find((c) => !c.dead)!
  s = {
    ...s,
    crew: s.crew.map((c) =>
      c.id === hand.id ? { ...c, assignment: dock.id, hp: 6, maxHp: 60, gear: {} } : { ...c, assignment: null },
    ),
    modules: s.modules.map((m) => (m.id === dock.id ? { ...m, staff: [hand.id] } : { ...m, staff: [] })),
    ships: [],
  }
  const [board] = standingOff(s, { intent: 'raid', force: 60, timer: 400 })
  const start = structuredClone(board)
  beginBoarding(start, start.visitors[0])
  const after = advance(start, 30)
  assert.ok(after.crew.find((c) => c.id === hand.id)?.dead, 'nobody pulled them out')
  assert.ok(after.log.some((l) => /went down on the door/.test(l.text)))
})

test('a boarding never wipes the station out entirely', () => {
  // Six founders on a balanced station: the only thing that can kill anyone in
  // the next four hundred seconds is the party in the port.
  let s = rich(fresh())
  s = { ...s, crew: s.crew.map((c) => ({ ...c, gear: {}, hp: 5, maxHp: 60 })), ships: [] }
  const [board] = standingOff(s, { intent: 'raid', force: 200, timer: 400 })
  const start = structuredClone(board)
  beginBoarding(start, start.visitors[0])
  const after = fightItOut(start)
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

// ------------------------------------------------------------ the watch --

/** A boarding built by hand: `n` boarders of a given hp in `room`, off a hull on the clamps. */
const boarded = (s: GameState, room: string, n: number, hp: number): GameState => {
  const [board, hull] = standingOff(s, { intent: 'boarding', status: 'docked', timer: 0 })
  return {
    ...board,
    boarding: {
      shipId: hull.id,
      moduleId: room,
      boarders: Array.from({ length: n }, (_, i) => ({
        id: `b${i}`,
        name: `Boarder ${i}`,
        hp,
        maxHp: hp,
        kit: null,
      })),
      responders: [],
      size: n,
      moveIn: 40,
      looted: 0,
      killed: 0,
      lost: 0,
      startedAt: board.elapsed,
    },
  }
}

/** A station with a Security Office and two people on watch in it. */
const watched = (): [GameState, string[]] => {
  let s = place(grown(), 'security')
  const office = s.modules.find((m) => m.kind === 'security')!
  const watch = s.crew.filter((c) => !c.dead).slice(-2)
  for (const c of watch) s = reducer(s, { type: 'assign', crewId: c.id, moduleId: office.id })
  return [s, watch.map((c) => c.id)]
}

test('the security watch turns out to wherever the boarders are', () => {
  const [s, watch] = watched()
  // An empty storage room: nobody in it but the party.
  const store = s.modules.find((m) => m.kind === 'storage')!
  const quiet: GameState = {
    ...s,
    modules: s.modules.map((m) => (m.id === store.id ? { ...m, staff: [] } : m)),
    crew: s.crew.map((c) => (c.assignment === store.id ? { ...c, assignment: null } : c)),
  }
  const start = boarded(quiet, store.id, 2, 30)
  const after = advance(start, 2)
  assert.deepEqual([...after.boarding!.responders].sort(), [...watch].sort(), 'both went')
  assert.ok(
    after.log.some((l) => /from Security/.test(l.text)),
    'and the log says so',
  )
  // They fight it without being posted to it: the storeroom still has nobody on its roster.
  const room = after.modules.find((m) => m.id === store.id)!
  assert.equal(room.staff.length, 0)
  assert.equal(defendersOf(after, room).length, 2)
  const hurt = after.boarding!.boarders.some((b) => b.hp < 30)
  assert.ok(hurt, 'and the boarders felt it')
  for (const id of watch) {
    assert.equal(after.crew.find((c) => c.id === id)?.assignment, s.modules.find((m) => m.kind === 'security')!.id, 'still posted to the office')
  }
})

test('the watch stands down when it is over, without anybody moving them', () => {
  const [s, watch] = watched()
  const store = s.modules.find((m) => m.kind === 'storage')!
  const start = boarded(s, store.id, 1, 3)
  const after = advance(start, 20)
  assert.equal(after.boarding, null, 'a boarder on 3 hp does not last')
  const office = s.modules.find((m) => m.kind === 'security')!
  for (const id of watch) {
    assert.equal(after.crew.find((c) => c.id === id)?.assignment, office.id)
  }
})

test('a hurt watch officer falls back to the office and rejoins once patched up', () => {
  const [s, watch] = watched()
  const store = s.modules.find((m) => m.kind === 'storage')!
  const [first] = watch
  // One of them arrives already bleeding, the other is fine.
  const bleeding: GameState = {
    ...s,
    crew: s.crew.map((c) => (c.id === first ? { ...c, hp: c.maxHp * 0.15 } : c)),
  }
  const start = boarded(bleeding, store.id, 3, 400)
  const after = advance(start, 3)
  assert.ok(!after.boarding!.responders.includes(first), 'too hurt to turn out')
  assert.ok(after.boarding!.responders.includes(watch[1]), 'the other one did')
  // Patched up, they go.
  const healed: GameState = {
    ...after,
    crew: after.crew.map((c) => (c.id === first ? { ...c, hp: c.maxHp } : c)),
  }
  const back = advance(healed, 1)
  assert.ok(back.boarding!.responders.includes(first), 'fit again, and at the fight')
})

test('the office unlocks when boardings are a thing, and turns out nobody when dark', () => {
  const [s] = watched()
  const office = s.modules.find((m) => m.kind === 'security')!
  assert.equal(def('security').unlockAtCrew, 20)
  const dark: GameState = {
    ...s,
    modules: s.modules.map((m) => (m.id === office.id ? { ...m, standby: true } : m)),
  }
  const store = s.modules.find((m) => m.kind === 'storage')!
  const after = advance(boarded(dark, store.id, 2, 400), 2)
  assert.deepEqual(after.boarding!.responders, [], 'a powered-down office is nobody on watch')
})
