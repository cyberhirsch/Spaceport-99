import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advance,
  deliverLetter,
  newGame,
  questBeat,
  questBearing,
  recordFinding,
  reducer,
  seeded,
} from '../engine.ts'
import { makeCrew } from '../crew.ts'
import { LOST, ENOUGH_TO_KNOW, SIEGE_AT, WATCHED_AT, knowsEnough, openBearings } from '../quest.ts'
import { makeMission, makeShip } from '../fleet.ts'
import { makeVisitor } from '../visitors.ts'
import { labels, line, say } from './talkHelp.ts'
import type { GameState, Mission, ModuleKind, Visitor } from '../types.ts'

// One seed per file, so every draw below is the same draw every run.
const rng = seeded(6100)

let founded = 0
const fresh = () => newGame('Spaceport-99', 6100 + (founded += 1))

const rich = (s: GameState): GameState => ({ ...s, credits: 120000 })

const place = (s: GameState, kind: ModuleKind): GameState => {
  for (let deck = 0; deck < Math.max(1, s.decks); deck += 1) {
    for (let col = 0; col < 12; col += 1) {
      const next = reducer(s, { type: 'build', kind, deck, col })
      if (next.modules.length > s.modules.length) return next
    }
  }
  throw new Error(`could not place ${kind}`)
}

/** A station with enough people to build anything and staff it. */
const big = (over: Partial<GameState> = {}): GameState => {
  const base = rich(fresh())
  let s: GameState = {
    ...base,
    decks: 4,
    crew: [...base.crew, ...Array.from({ length: 60 }, () => makeCrew(rng))],
    resources: { power: 500, air: 500, food: 500 },
  }
  return { ...s, ...over }
}

test('the letter reaches a station three different ways', () => {
  // Through the array, when there is one and somebody is in it.
  let viaArray = place(big(), 'comms')
  const array = viaArray.modules.find((m) => m.kind === 'comms')!
  viaArray = reducer(viaArray, { type: 'assign', crewId: viaArray.crew[0].id, moduleId: array.id })
  const a = structuredClone(viaArray)
  assert.equal(deliverLetter(a), true)
  assert.equal(a.talk?.script, 'letter')
  assert.ok(a.talk?.flags.includes('from:comms'))
  assert.equal(a.talk?.with.kind, 'crew')

  // Off a hull, when there is no array.
  const hull: Visitor = { ...makeVisitor(rng), status: 'docked', timer: 900 }
  const b = structuredClone({ ...big(), visitors: [hull] })
  assert.equal(deliverLetter(b), true)
  assert.ok(b.talk?.flags.includes('from:hull'))
  assert.equal(b.talk?.with.kind, 'visitor')

  // And failing both, from somebody aboard.
  const c = structuredClone(big())
  assert.equal(deliverLetter(c), true)
  assert.ok(c.talk?.flags.includes('from:crew'))
  assert.equal(c.talk?.with.kind, 'crew')
})

test('a station with nobody left aboard is told nothing', () => {
  const empty: GameState = { ...big(), crew: [] }
  const s = structuredClone(empty)
  assert.equal(deliverLetter(s), false)
  assert.equal(s.talk, null)
})

test('the letter lists seven names and one instruction', () => {
  const s = structuredClone(big())
  deliverLetter(s)
  const read = say(s, 'Read it')
  const text = line(read)
  for (const h of LOST) assert.ok(text.includes(h.name), `${h.name} is on the list`)
  assert.match(text, /None of these were lost where the record says/)
})

test('what happened to the last commander is only askable once you have been there', () => {
  const s = structuredClone(big())
  deliverLetter(s)
  let read = say(s, 'Read it')
  assert.ok(!labels(read).some((l) => l.includes('commander before me')))

  const knowing = structuredClone({ ...s, quest: { ...s.quest, checked: ['Corbel Nine'] } })
  deliverLetter(knowing)
  read = say(knowing, 'Read it')
  assert.ok(labels(read).some((l) => l.includes('commander before me')))
  const answer = say(read, 'commander before me')
  assert.match(line(answer), /requisition is still open/)
})

test('a bearing is an ordinary far contract with a hull name on it', () => {
  // No reach, no bearings: you cannot check what you cannot get to.
  const near: GameState = { ...big(), quest: { ...big().quest, stage: 'letter' as const } }
  assert.equal(questBearing(near), undefined)

  // With Deep Space Ops running, the first unchecked name comes up.
  let far = place(big({ specs: { astro: 1 } }), 'dso')
  const dso = far.modules.find((m) => m.kind === 'dso')!
  for (const c of far.crew.slice(0, 2)) {
    far = reducer(far, { type: 'assign', crewId: c.id, moduleId: dso.id })
  }
  far = { ...far, quest: { ...far.quest, stage: 'letter' as const } }
  const offered = new Set<string | undefined>()
  for (let i = 0; i < 40; i += 1) offered.add(questBearing({ ...far, rng: far.rng + i }))
  assert.ok(offered.has(LOST[0].name), 'the first unchecked name gets offered')
})

test('never two bearings on the board at once', () => {
  const board = big()
  const s: GameState = {
    ...board,
    quest: { ...board.quest, stage: 'checking' as const },
    missions: [{ ...board.missions[0], bearing: LOST[0].name, status: 'flying' } as Mission],
  }
  assert.equal(questBearing(s), undefined)
})

test('checking a bearing brings something home and costs attention', () => {
  const s = structuredClone({ ...big(), quest: { ...big().quest, stage: 'letter' as const } })
  recordFinding(s, LOST[0].name)
  assert.deepEqual(s.quest.checked, [LOST[0].name])
  assert.equal(s.quest.stage, 'checking', 'the business is under way now')
  assert.equal(s.quest.attention, LOST[0].weight)
  assert.ok(s.log.some((l) => l.text.includes('not where the record says')))

  // And it does not happen twice.
  recordFinding(s, LOST[0].name)
  assert.equal(s.quest.checked.length, 1)
})

test('attention only ever goes up, and never past the end', () => {
  const s = structuredClone({ ...big(), quest: { ...big().quest, stage: 'checking' as const } })
  for (const h of LOST) recordFinding(s, h.name)
  assert.equal(s.quest.checked.length, 7)
  assert.equal(s.quest.attention, 1, 'capped at the point it arrives')
})

test('three bearings is the point at which it is an argument rather than a list', () => {
  const q = { ...big().quest }
  assert.equal(knowsEnough(q), false)
  q.checked = LOST.slice(0, ENOUGH_TO_KNOW).map((h) => h.name)
  assert.equal(knowsEnough(q), true)
  assert.equal(openBearings(q).length, LOST.length - ENOUGH_TO_KNOW)
})

test('a resolved run out to a bearing records what it found', () => {
  const s = big({ quest: { stage: 'letter' as const, checked: [], attention: 0, ending: null } })
  const bearing = LOST[2].name
  const m: Mission = {
    ...makeMission(rng, 0.4, { far: true, bearing, shape: 'contract', name: `Bearing — the ${bearing}` }),
    status: 'flying',
    remaining: 1,
  }
  const done = advance({ ...s, missions: [m] }, 4)
  assert.ok(done.quest.checked.includes(bearing), 'the file has it now')
  assert.ok(done.quest.attention > 0, 'and it cost something to know')
})

test('the station is watched before it is visited', () => {
  const s: GameState = structuredClone({
    ...big(),
    quest: { stage: 'checking' as const, checked: ['x'], attention: WATCHED_AT, ending: null },
    talk: null,
    nextQuestIn: 0,
  })
  questBeat(s)
  assert.equal(s.quest.stage, 'watched')
  assert.ok(s.log.some((l) => l.text.includes('asking about this station')))
})

test('and at full attention it turns up', () => {
  const s: GameState = structuredClone({
    ...big(),
    quest: { stage: 'watched' as const, checked: ['x'], attention: SIEGE_AT, ending: null },
    talk: null,
    nextQuestIn: 0,
  })
  questBeat(s)
  assert.equal(s.quest.stage, 'siege')
  assert.equal(s.talk?.script, 'siege')
  assert.ok(s.log.some((l) => l.text.includes('none of them are answering')))
})

test('the siege cannot be paid, reported or reasoned with', () => {
  const s: GameState = structuredClone({
    ...big(),
    quest: { stage: 'watched' as const, checked: ['x'], attention: SIEGE_AT, ending: null },
    talk: null,
    nextQuestIn: 0,
  })
  questBeat(s)
  const asks = labels(s)
  assert.ok(!asks.some((l) => /Pay|Report|arrangement|Call /.test(l)), `offered: ${asks.join(' | ')}`)
  assert.equal(asks.length, 3, 'three answers, all of them about your own station')
})

test('the station comes through it, one way or the other', () => {
  const s: GameState = structuredClone({
    ...big(),
    quest: { stage: 'watched' as const, checked: ['x'], attention: SIEGE_AT, ending: null },
    talk: null,
    nextQuestIn: 0,
  })
  questBeat(s)
  const after = say(s, 'Shield up')
  assert.equal(after.quest.stage, 'over')
  assert.ok(after.quest.ending === 'met' || after.quest.ending === 'lost')
  assert.equal(after.quest.attention, 0, 'whatever it was, it is not here now')
  assert.ok(after.crew.some((c) => !c.dead), 'somebody is always left')
})

/** A station that has been out to look, ready to decide. */
const informed = (over: Partial<GameState> = {}): GameState => {
  const base = big()
  return {
    ...base,
    quest: {
      stage: 'watched' as const,
      checked: LOST.slice(0, 4).map((h) => h.name),
      attention: 0.8,
      ending: null,
    },
    ...over,
  }
}

test('publishing it costs you every friend in an office', () => {
  const s = informed()
  let talk = reducer(s, {
    type: 'talk',
    script: 'letter',
    with: { kind: 'crew', id: s.crew[0].id },
    node: 'decide',
  })
  talk = say(talk, 'open channel')
  assert.equal(talk.quest.ending, 'published')
  assert.equal(talk.quest.stage, 'over')
  assert.ok(talk.standing.terran < s.standing.terran)
  assert.ok(talk.standing.unlisted > s.standing.unlisted)
})

test('selling it pays, and buries it', () => {
  const s = informed()
  let talk = reducer(s, {
    type: 'talk',
    script: 'letter',
    with: { kind: 'crew', id: s.crew[0].id },
    node: 'decide',
  })
  talk = say(talk, 'Sell it')
  assert.equal(talk.quest.ending, 'sold')
  assert.ok(talk.credits > s.credits)
})

test('burning it stops anything ever coming of it', () => {
  const s = informed()
  let talk = reducer(s, {
    type: 'talk',
    script: 'letter',
    with: { kind: 'crew', id: s.crew[0].id },
    node: 'decide',
  })
  talk = say(talk, 'Burn it')
  assert.equal(talk.quest.ending, 'buried')
  assert.equal(talk.quest.attention, 0, 'nothing is asking about it any more')
  assert.equal(talk.credits, s.credits, 'and nobody paid you for it')
})

test('going to look needs a hull, and costs it', () => {
  const noShip = informed({ ships: [] })
  let talk = reducer(noShip, {
    type: 'talk',
    script: 'letter',
    with: { kind: 'crew', id: noShip.crew[0].id },
    node: 'decide',
  })
  assert.ok(labels(talk).some((l) => l.includes('seventh name')), 'it is offered')
  const withShip = informed({ ships: [makeShip(rng, 'shuttle')] })
  assert.ok(withShip.ships.length > 0, 'there is a hull to send')
  talk = reducer(withShip, {
    type: 'talk',
    script: 'letter',
    with: { kind: 'crew', id: withShip.crew[0].id },
    node: 'decide',
  })
  talk = say(talk, 'seventh name')
  assert.equal(talk.quest.ending, 'met')
  assert.equal(talk.ships.length, withShip.ships.length - 1, 'the hull did not come back')
  assert.match(line(talk), /wrong in the same direction/)
})

test('a closed file stays closed', () => {
  const s: GameState = structuredClone({
    ...informed(),
    quest: { stage: 'over' as const, checked: [], attention: 0, ending: 'buried' as const },
    nextQuestIn: 0,
    talk: null,
  })
  questBeat(s)
  assert.equal(s.talk, null, 'nothing more happens')
  assert.ok(s.nextQuestIn > 1000, 'and it is not asked again')
})
