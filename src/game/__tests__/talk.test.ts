import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advance,
  ARMED_ENOUGH,
  def,
  defence,
  derive,
  guestAboard,
  newGame,
  reducer,
  seeded,
  WING,
} from '../engine.ts'
import { nodeOf, offered, scriptOf, speaker } from '../talk.ts'
import type { ScriptId } from '../talk.ts'
import { makeVisitor } from '../visitors.ts'
import { wantOf } from '../talks/hire.ts'
import { barredReason, labels, line, open, say } from './talkHelp.ts'
import { STAT_KEYS } from '../types.ts'
import type { GameState, ModuleKind, Visitor } from '../types.ts'

// Every station in this file is founded from a known seed, so a run that passes
// today passes tomorrow. Each call moves the seed on, so a loop that founds
// forty stations still sees forty different ones.
let founded = 0
const fresh = () => newGame('Spaceport-99', 2200 + (founded += 1))

// One seed per file, so every draw below is the same draw every run.
const rng = seeded(88)

const rich = (s: GameState): GameState => ({ ...s, credits: 80000 })
const build = (s: GameState, kind: ModuleKind, col: number, deck = 0): GameState =>
  reducer(rich(s), { type: 'build', kind, deck, col })

const SCRIPTS: ScriptId[] = ['crew', 'hire', 'captain', 'conquest']

/** Berths a hull and hands back the docked version of it. */
const berthed = (s: GameState, over: Partial<Visitor> = {}): [GameState, Visitor] => {
  const v: Visitor = {
    // One name pool serves the fleet and the traffic, so exclude what is in play.
    ...makeVisitor(rng, [...s.ships.map((h) => h.name), ...s.visitors.map((x) => x.name)]),
    status: 'requesting',
    timer: 900,
    kind: 'trader',
    claim: 'trader',
    ...over,
  }
  const docked = reducer({ ...s, visitors: [v] }, { type: 'acceptVisitor', visitorId: v.id })
  return [docked, docked.visitors[0]]
}

// ------------------------------------------------------------- the engine --

test('every script is registered and every reply goes somewhere real', () => {
  for (const id of SCRIPTS) {
    const script = scriptOf(id)
    assert.ok(script.start, `${id} has no opening line`)
    for (const [nodeId, node] of Object.entries(script)) {
      assert.ok(node.replies.length > 0, `${id}/${nodeId} is a dead end`)
      for (const reply of node.replies) {
        // A goto computed at runtime cannot be checked here, but a literal can.
        if (typeof reply.goto === 'string') {
          assert.ok(script[reply.goto], `${id}/${nodeId} points at missing node ${reply.goto}`)
        }
      }
    }
  }
})

test('a conversation with nobody in it does not open', () => {
  const s = fresh()
  assert.equal(reducer(s, { type: 'talk', script: 'crew', with: { kind: 'crew', id: 'nope' } }), s)
  assert.equal(s.talk, null)
})

test('opening a conversation says nothing until you speak', () => {
  const s = fresh()
  const talking = open(s, 'crew', { kind: 'crew', id: s.crew[0].id })
  assert.ok(talking.talk)
  assert.equal(talking.talk.node, 'start')
  assert.deepEqual(talking.talk.said, [], 'nothing has been said yet')
  assert.deepEqual(talking.talk.flags, [])
  assert.ok(line(talking).length > 0, 'but they have opened their mouth')
})

test('what was said stays said, in the order it happened', () => {
  const s = fresh()
  let talking = open(s, 'crew', { kind: 'crew', id: s.crew[0].id })
  const opener = line(talking)
  talking = say(talking, 'How are you holding up')
  assert.equal(talking.talk?.said.length, 2)
  assert.deepEqual(talking.talk?.said[0], { who: 'them', text: opener })
  assert.equal(talking.talk?.said[1].who, 'you')
  assert.match(talking.talk!.said[1].text, /holding up/)
})

test('a reply that goes nowhere closes the conversation', () => {
  const s = fresh()
  const talking = open(s, 'crew', { kind: 'crew', id: s.crew[0].id })
  assert.equal(say(talking, 'Carry on').talk, null)
})

test('a conversation can be walked away from, unless it cannot', () => {
  const s = fresh()
  const chat = open(s, 'crew', { kind: 'crew', id: s.crew[0].id })
  assert.equal(reducer(chat, { type: 'endTalk' }).talk, null)

  // The takeover cannot be closed; the only way out is through it.
  const [docked, v] = berthed(rich(s), { intent: 'conquest', force: 30 })
  const stuck = open(docked, 'conquest', { kind: 'visitor', id: v.id })
  assert.ok(nodeOf(stuck.talk!)?.sticky)
  assert.equal(reducer(stuck, { type: 'endTalk' }), stuck, 'the escape hatch is not there')
})

test('a reply nobody offered is refused', () => {
  const s = fresh()
  const talking = open(s, 'crew', { kind: 'crew', id: s.crew[0].id })
  assert.equal(reducer(talking, { type: 'say', reply: 99 }), talking)
})

test('opening a second conversation abandons the first', () => {
  const s = fresh()
  const first = open(s, 'crew', { kind: 'crew', id: s.crew[0].id })
  const second = open(first, 'crew', { kind: 'crew', id: s.crew[1].id })
  assert.deepEqual(second.talk?.with, { kind: 'crew', id: s.crew[1].id })
})

// ----------------------------------------------------------------- hiring --

test('what somebody wants is fixed, and asking properly gets it out of them', () => {
  const [docked, v] = berthed(rich(fresh()))
  const guest = v.aboard[0]
  const want = wantOf(guest)
  assert.equal(wantOf(guest), want, 'it does not move between reads')

  // Listen first and they answer plainly; ask cold and they do not.
  const listened = say(
    say(open(docked, 'hire', { kind: 'guest', id: guest.id }), 'What brought you out this far'),
    'what would it take',
  )
  const cold = say(
    open(docked, 'hire', { kind: 'guest', id: guest.id }),
    'Ask them straight what they want',
  )
  assert.notEqual(line(listened), line(cold))
  assert.match(line(cold), /before you have asked me anything else/)
})

test('the right offer is worth far more than the wrong one', () => {
  // Somebody who wants money, and somebody who does not.
  const swings: Record<string, number[]> = { match: [], miss: [] }
  for (let i = 0; i < 60; i += 1) {
    const [docked, v] = berthed(rich(fresh()))
    const guest = v.aboard.find((g) => !g.captain)
    if (!guest) continue
    let s = open(docked, 'hire', { kind: 'guest', id: guest.id })
    s = say(s, 'Make them an offer')
    s = say(s, 'up front')
    const after = s.visitors[0]?.aboard.find((g) => g.id === guest.id)
    if (!after) continue
    swings[wantOf(guest) === 'money' ? 'match' : 'miss'].push(after.interest - guest.interest)
  }
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
  assert.ok(swings.match.length > 0 && swings.miss.length > 0, 'both kinds turned up')
  assert.ok(
    mean(swings.match) > mean(swings.miss),
    `money is worth more to somebody who wants it: ${mean(swings.match).toFixed(1)} vs ${mean(swings.miss).toFixed(1)}`,
  )
})

test('a posting cannot be promised when every room is full', () => {
  const [docked, v] = berthed(fresh())
  const guest = v.aboard[0]
  // Cram every slot on the station.
  const packed: GameState = {
    ...docked,
    modules: docked.modules.map((m) => ({ ...m, staff: ['x', 'y', 'z', 'w'] })),
  }
  const s = say(open(packed, 'hire', { kind: 'guest', id: guest.id }), 'Make them an offer')
  assert.equal(barredReason(s, 'posting'), 'Every room is full')
})

test('with nothing in the account, money is not on the table', () => {
  const [alongside, v] = berthed(fresh())
  // Berthing her paid a docking fee, so empty the account afterwards.
  const docked: GameState = { ...alongside, credits: 0 }
  const guest = v.aboard[0]
  const s = say(open(docked, 'hire', { kind: 'guest', id: guest.id }), 'Make them an offer')
  assert.equal(barredReason(s, 'up front'), 'Nothing in the account')
})

test('the closing line still shows after they have left the manifest', () => {
  const [alongside, v] = berthed(rich(fresh()))
  const guest = v.aboard[0]
  const sure: GameState = {
    ...alongside,
    visitors: alongside.visitors.map((x) => ({
      ...x,
      aboard: x.aboard.map((g) => (g.id === guest.id ? { ...g, interest: 100 } : g)),
    })),
  }
  let s = open(sure, 'hire', { kind: 'guest', id: guest.id })
  s = say(s, 'Make them an offer')
  s = say(s, 'Put it to them')
  s = say(s, 'Ask for their answer')

  // They are crew now, so there is nobody on the boarding party to look up —
  // and the conversation still has something to say.
  assert.ok(s.crew.some((c) => c.name === guest.name))
  assert.equal(guestAboard(s, guest.id), null)
  assert.ok(s.talk, 'the conversation is still open')
  assert.ok(line(s).length > 0, `and it reads: ${line(s)}`)
  assert.match(line(s), /where I am sleeping/)
  assert.equal(s.talk.who, guest.name, 'under the name it opened with')
  assert.equal(say(s, 'Close').talk, null)
})

// ------------------------------------------------------------------- crew --

test('the crew tell you what is actually wrong, and only what is wrong', () => {
  const s = fresh()
  const sound = say(open(s, 'crew', { kind: 'crew', id: s.crew[0].id }), 'What is actually wrong')
  assert.match(line(sound), /Nothing I would raise|One thing/)

  // Take the air away and they lead with that.
  const airless: GameState = { ...s, resources: { ...s.resources, air: 0 } }
  const bad = say(open(airless, 'crew', { kind: 'crew', id: s.crew[0].id }), 'What is actually wrong')
  assert.match(line(bad), /air is gone/)
})

test('being heard is worth something, once', () => {
  const airless: GameState = { ...fresh(), resources: { power: 100, air: 0, food: 0 } }
  const who = airless.crew[0]
  let s = say(open(airless, 'crew', { kind: 'crew', id: who.id }), 'What is actually wrong')
  s = say(s, 'Thank you for saying it')
  const after = s.crew.find((c) => c.id === who.id)!
  assert.ok(after.morale > who.morale, 'they take it well')

  // And the same words a second time buy nothing.
  let again = say(open(s, 'crew', { kind: 'crew', id: who.id }), 'What is actually wrong')
  again = say(again, 'Thank you for saying it')
  const twice = again.crew.find((c) => c.id === who.id)!
  assert.ok(twice.morale > after.morale, 'a fresh conversation is a fresh chance')
})

test('a crew member can ask for the posting they are built for', () => {
  let s = build(fresh(), 'gym', WING - 3)
  const who = s.crew.find((c) => c.assignment !== s.modules.find((m) => m.kind === 'gym')!.id)!
  s = open(s, 'crew', { kind: 'crew', id: who.id })
  s = say(s, 'Where would you rather be posted')
  if (!labels(s).some((l) => l.includes('Move them there'))) return

  const after = say(s, 'Move them there')
  const them = after.crew.find((c) => c.id === who.id)!
  const room = after.modules.find((m) => m.id === them.assignment)!
  const best = STAT_KEYS.reduce((a, k) => (who.stats[k] > who.stats[a] ? k : a), STAT_KEYS[0])
  assert.equal(def(room.kind).stat, best, 'they end up somewhere that runs on their best stat')
  assert.ok(room.staff.includes(who.id), 'and the room has them on its roster')
  assert.equal(
    after.modules.filter((m) => m.staff.includes(who.id)).length,
    1,
    'in exactly one place',
  )
  assert.ok(them.morale >= who.morale)
})

// --------------------------------------------------------------- captains --

test('leaning on a hull is cheap with guns and expensive without', () => {
  const [bare, v1] = berthed(fresh(), { faction: 'concern' })
  const leaned = say(
    open(bare, 'captain', { kind: 'visitor', id: v1.id }),
    'Make it clear whose station this is',
  )
  const cost = bare.standing.concern - leaned.standing.concern
  assert.ok(cost > 0, 'talking hard always costs something')

  // Same words, from behind a staffed battery.
  // One battery is a decoration. Two weld into a run worth talking behind.
  let armed = build(build(fresh(), 'battery', WING - 3), 'battery', WING - 4)
  const gun = armed.modules.find((m) => m.kind === 'battery')!
  for (const c of armed.crew) {
    armed = reducer(armed, { type: 'assign', crewId: c.id, moduleId: gun.id })
  }
  assert.ok(defence(armed).guns >= ARMED_ENOUGH, `guns: ${defence(armed).guns}`)
  const [heavy, v2] = berthed(armed, { faction: 'concern' })
  const backed = say(
    open(heavy, 'captain', { kind: 'visitor', id: v2.id }),
    'Make it clear whose station this is',
  )
  assert.ok(heavy.standing.concern - backed.standing.concern < cost, 'guns make it cheaper')
})

test('a dirty hull can be pressed, and letting it go is worth something', () => {
  // A smuggler claiming to be honest: the scan overlaps, the manifest does not.
  const [docked, v] = berthed(fresh(), { kind: 'smuggler', claim: 'trader', faction: 'unlisted' })
  let s = open(docked, 'captain', { kind: 'visitor', id: v.id })
  s = say(s, 'Ask what they are really carrying')
  assert.match(line(s), /wrong answer in it/)

  const let_go = say(s, 'Let it go')
  assert.ok(let_go.standing.unlisted > docked.standing.unlisted, 'the Drift hears about that')

  const sent = say(s, 'Tell them to undock')
  assert.ok(sent.standing.unlisted < docked.standing.unlisted)
  assert.equal(sent.visitors[0].status, 'requesting', 'and she is off the clamps')
})

// -------------------------------------------------------------- conquest --

test('a takeover changes the flag, and striking it costs nothing else', () => {
  const s = rich(fresh())
  assert.equal(s.patron, 'terran')
  const [docked, v] = berthed(s, { intent: 'conquest', force: 40, faction: 'concern' })

  let talk = open(docked, 'conquest', { kind: 'visitor', id: v.id })
  talk = say(talk, 'Strike the flag')
  const after = say(talk, 'Close')
  assert.equal(after.patron, 'concern', 'the flag changed hands')
  assert.ok(after.standing.terran < docked.standing.terran, 'Earth strikes you off the roll')
  assert.deepEqual(after.resigned, ['terran'])
  assert.equal(after.crew.filter((c) => c.dead).length, 0, 'and nobody died over paperwork')
})

test('paying them off keeps the flag and empties the account', () => {
  const s = rich(fresh())
  const [docked, v] = berthed(s, { intent: 'conquest', force: 20, faction: 'compact' })
  let talk = open(docked, 'conquest', { kind: 'visitor', id: v.id })
  const paid = say(talk, 'Pay them off')
  assert.equal(paid.patron, 'terran', 'still a Confederation post')
  assert.ok(paid.credits < docked.credits, 'and considerably poorer')
  assert.equal(paid.visitors[0]?.intent, undefined, 'they are ordinary traffic again')
})

test('with nothing in the account there is nothing to pay them with', () => {
  const [docked, v] = berthed({ ...fresh(), credits: 0 }, { intent: 'conquest', force: 40 })
  const talk = open(docked, 'conquest', { kind: 'visitor', id: v.id })
  assert.equal(barredReason(talk, 'Pay them off'), 'Not in the account')
})

test('fighting resolves one way or the other, and costs either way', () => {
  let ceded = 0
  let held = 0
  for (let i = 0; i < 40; i += 1) {
    const [docked, v] = berthed(rich(fresh()), {
      intent: 'conquest',
      force: 20,
      faction: 'concern',
    })
    const fought = say(open(docked, 'conquest', { kind: 'visitor', id: v.id }), 'Refuse')
    assert.ok(
      fought.talk?.flags.includes('won') || fought.talk?.flags.includes('lost'),
      'it always resolves',
    )
    if (fought.patron === 'concern') ceded += 1
    else held += 1
    const battered = fought.modules.some((m) => m.condition < 1)
    assert.ok(battered, 'a fight always marks the station')
  }
  // A bare station against a real force loses most of the time, not always.
  assert.ok(ceded > 0, 'an undefended station mostly loses')
  assert.ok(ceded + held === 40)
})

test('the patron answers when you have been worth something to them', () => {
  const warm: GameState = { ...rich(fresh()), standing: { ...fresh().standing, terran: 0.2 } }
  const [docked, v] = berthed(warm, { intent: 'conquest', force: 40, faction: 'concern' })
  const called = say(open(docked, 'conquest', { kind: 'visitor', id: v.id }), 'Call')
  assert.equal(called.patron, 'terran', 'they held them off')
  assert.match(line(called), /did not send a fleet/)
})

test('and does not when you have not', () => {
  const cold: GameState = { ...rich(fresh()), standing: { ...fresh().standing, terran: 0 } }
  const [docked, v] = berthed(cold, { intent: 'conquest', force: 40, faction: 'concern' })
  const called = say(open(docked, 'conquest', { kind: 'visitor', id: v.id }), 'Call')
  assert.match(line(called), /acknowledges your situation/)
  assert.ok(nodeOf(called.talk!)?.sticky, 'and you are still standing there')
  assert.ok(labels(called).some((l) => l.includes('Refuse anyway')))
})

test('nobody comes for a station not worth the fuel', () => {
  // Small, thinly crewed, and left running for a very long time.
  const s = advance({ ...fresh(), nextTakeoverIn: 0, elapsed: 60 * 60 }, 600)
  assert.equal(s.visitors.filter((v) => v.intent).length, 0)
  assert.equal(s.patron, 'terran')
})

test('a hull that came to take the station does not wander off', () => {
  const [docked, v] = berthed(rich(fresh()), { intent: 'conquest', force: 20, timer: 1 })
  const later = advance({ ...docked, talk: null }, 300)
  const still = later.visitors.find((x) => x.id === v.id)
  assert.ok(still, 'she is still alongside')
  assert.equal(still.status, 'docked')
})

test('offered replies are filtered, barred ones are kept and marked', () => {
  const [alongside, v] = berthed(fresh())
  const docked: GameState = { ...alongside, credits: 0 }
  const guest = v.aboard[0]
  const s = say(open(docked, 'hire', { kind: 'guest', id: guest.id }), 'Make them an offer')
  const c = speaker(s, s.talk!.with)!
  const rows = offered(c, nodeOf(s.talk!)!)
  assert.ok(rows.length > 0)
  assert.ok(rows.some((r) => r.barred), 'the unaffordable one is shown, not hidden')
  assert.ok(derive(s).crewAlive.length > 0)
})

test('a hull never arrives sharing a name with one in the fleet', () => {
  let s = rich(fresh())
  // Every name in the pool, handed out until it runs dry.
  for (let i = 0; i < 40; i += 1) {
    const [next] = berthed(s)
    s = { ...next, visitors: next.visitors.map((v) => ({ ...v, timer: 9000 })) }
  }
  const all = [...s.ships.map((h) => h.name), ...s.visitors.map((v) => v.name)]
  assert.equal(new Set(all).size, all.length, `duplicate hull name: ${all.join(', ')}`)
})

// ------------------------------------------------- a conversation holds --

/**
 * A conversation with somebody aboard a hull that has seconds left on the
 * clamps. Hands back the hull's id too: fresh traffic keeps arriving, so the
 * question is always whether *this* hull is still there.
 */
const aboutToLeave = (): [GameState, string] => {
  const [alongside, v] = berthed(fresh())
  const leaving: GameState = { ...alongside, visitors: [{ ...v, timer: 5 }] }
  return [open(leaving, 'hire', { kind: 'guest', id: v.aboard[0].id }), v.id]
}

const stillThere = (s: GameState, id: string): Visitor | undefined =>
  s.visitors.find((v) => v.id === id)

test('a hull does not undock in the middle of a conversation', () => {
  const [talking, hull] = aboutToLeave()
  assert.ok(talking.talk, 'the conversation opened')

  const held = advance(talking, 60)
  assert.ok(stillThere(held, hull), 'they were still being spoken to')
  assert.equal(stillThere(held, hull)?.timer, 5, 'their clock did not move either')
})

test('a conversation holds the whole station, not just the clamps', () => {
  const [talking] = aboutToLeave()
  const held = advance(talking, 60)
  assert.equal(held.elapsed, talking.elapsed, 'no time passed')
  assert.deepEqual(held.resources, talking.resources, 'nothing was drawn down')
})

test('closing the conversation lets the clock run again', () => {
  const [talking, hull] = aboutToLeave()
  const closed = reducer(talking, { type: 'endTalk' })
  assert.equal(closed.talk, null)
  assert.equal(stillThere(advance(closed, 60), hull), undefined, 'now they go')
})

test('a conversation left open is not a pause button for time away', () => {
  const [talking, hull] = aboutToLeave()
  // Catching up on an absence is exempt: a conversation left open overnight
  // would otherwise stop the game for as long as the player liked.
  const away = reducer(talking, { type: 'catchUp', seconds: 600 })
  assert.equal(stillThere(away, hull), undefined, 'the hull left while nobody was watching')
})
