import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advance,
  allocatePortrait,
  appeal,
  dockBerths,
  newGame,
  PATIENCE_SECONDS,
  reducer,
  REQUEST_COST,
  seeded,
  WING,
} from '../engine.ts'
import { PORTRAIT_COUNT, crewPortrait, makeCrew } from '../crew.ts'
import { labels, open, say } from './talkHelp.ts'
import { STAT_KEYS } from '../types.ts'
import type { GameState, ModuleKind, Stats } from '../types.ts'

// Every station in this file is founded from a known seed, so a run that passes
// today passes tomorrow. Each call moves the seed on, so a loop that founds
// forty stations still sees forty different ones.
let founded = 0
const fresh = () => newGame('Spaceport-99', 1800 + (founded += 1))

// One seed per file, so every draw below is the same draw every run.
const rng = seeded(66)

const rich = (s: GameState): GameState => ({ ...s, credits: 50000 })
const build = (s: GameState, kind: ModuleKind, col: number) =>
  reducer(rich(s), { type: 'build', kind, deck: 0, col })

/** A station with a staffed comms desk and a docking port, ready to recruit. */
const staffed = (): GameState => {
  let s = build(fresh(), 'comms', WING + 2)
  s = build(s, 'dock', WING + 3)
  // The founders are all posted already, so move two of them across; assign
  // pulls them off their previous station.
  for (const [i, kind] of (['comms', 'dock'] as ModuleKind[]).entries()) {
    const m = s.modules.find((x) => x.kind === kind)!
    s = reducer(s, { type: 'assign', crewId: s.crew[i].id, moduleId: m.id })
  }
  return rich(s)
}

/** Interview an applicant the whole way through, then ask for their answer. */
const interview = (s: GameState, id: string, ...moves: string[]): GameState => {
  let out = open(s, 'hire', { kind: 'candidate', id })
  out = say(out, 'What brought you out this far')
  out = say(out, 'what would it take')
  out = say(out, 'Make them an offer')
  for (const m of moves) {
    out = say(out, m)
    out = say(out, 'Keep going')
  }
  out = say(out, 'Put it to them')
  return say(out, 'Ask for their answer')
}

test('HQ will not send anyone without a staffed comms desk', () => {
  const bare = rich(fresh())
  assert.ok(dockBerths(bare) > 0, 'the founding station already has its port')
  assert.equal(
    reducer(bare, { type: 'requestCrew' }).candidates.length,
    0,
    'but with nobody on comms to make the call, the request is refused',
  )

  const ready = staffed()
  assert.ok(dockBerths(ready) > 0)
  const asked = reducer(ready, { type: 'requestCrew' })
  assert.equal(asked.candidates.length, 1, 'HQ dispatches someone')
  assert.equal(asked.credits, ready.credits - REQUEST_COST, 'and charges for it')
  assert.ok(asked.candidates[0].arrivesIn > 0, 'they start in transit, not at the door')
})

test('a request is refused while HQ is still busy', () => {
  const once = reducer(staffed(), { type: 'requestCrew' })
  assert.equal(reducer(once, { type: 'requestCrew' }).candidates.length, 1, 'no double-dipping')
})

test('applicants fly out, then wait, then give up', () => {
  let s = reducer(staffed(), { type: 'requestCrew' })
  s = advance(s, 60)
  assert.equal(s.candidates.length, 1)
  assert.equal(s.candidates[0].arrivesIn, 0, 'transit finished')
  assert.ok(s.candidates[0].patience > 0, 'and the clock has started')

  s = advance(s, PATIENCE_SECONDS + 5)
  assert.equal(s.candidates.length, 0, 'nobody waits forever')
})

test('a promised posting swings on whether it suits them', () => {
  let s = reducer(staffed(), { type: 'requestCrew' })
  s = advance(s, 60)
  const cand = s.candidates[0]
  // Force a known shape so the best and worst posts are unambiguous.
  const stats = Object.fromEntries(STAT_KEYS.map((k) => [k, 2])) as Stats
  stats.T = 8
  stats.B = 1
  s = { ...s, candidates: [{ ...cand, stats }] }

  // The conversation offers the room that fits them, and it is the reactor —
  // the only Tech room the founding station has with a slot free.
  let talking = open(s, 'hire', { kind: 'candidate', id: cand.id })
  talking = say(talking, 'Make them an offer')
  assert.ok(
    labels(talking).some((l) => l.includes('Fusion Reactor')),
    `their strongest suit is what gets offered: ${labels(talking).join(' | ')}`,
  )

  const after = say(talking, 'Fusion Reactor')
  const promised = after.candidates[0]?.promised
  assert.equal(promised, s.modules.find((m) => m.kind === 'reactor')!.id)
  assert.ok(
    (after.candidates[0]?.interest ?? 0) > cand.interest,
    'and a posting that suits them moves them',
  )
})

test('the bonus costs its asking price, and can only be offered once', () => {
  let s = reducer(staffed(), { type: 'requestCrew' })
  s = advance(s, 60)
  const id = s.candidates[0].id
  const ask = s.candidates[0].askingBonus
  const before = s.credits

  s = open(s, 'hire', { kind: 'candidate', id })
  s = say(s, 'Make them an offer')
  s = say(s, 'up front')
  assert.equal(s.credits, before - ask, 'the bonus is actually paid')

  s = say(s, 'Keep going')
  assert.ok(
    !labels(s).some((l) => l.includes('up front')),
    `and cannot be offered twice: ${labels(s).join(' | ')}`,
  )
})

test('a fully convinced applicant signs, and joins the post they were promised', () => {
  let s = reducer(staffed(), { type: 'requestCrew' })
  s = advance(s, 60)
  s = build(s, 'gym', WING - 3)
  const gym = s.modules.find((m) => m.kind === 'gym')!
  const cand = { ...s.candidates[0], interest: 100, promised: gym.id }
  s = { ...s, candidates: [cand] }
  const crewBefore = s.crew.length

  s = interview(s, cand.id)
  assert.equal(s.candidates.length, 0, 'they leave the dock either way')
  assert.equal(s.crew.length, crewBefore + 1, 'certain interest means a certain signature')
  const hired = s.crew.at(-1)!
  assert.equal(hired.name, cand.name)
  assert.equal(hired.seed, cand.seed, 'they keep the face from their interview')
  assert.equal(hired.assignment, gym.id, 'and the job they were promised')
})

test('an unconvinced applicant always walks', () => {
  let s = reducer(staffed(), { type: 'requestCrew' })
  s = advance(s, 60)
  const cand = { ...s.candidates[0], interest: 0 }
  s = { ...s, candidates: [cand] }
  const crewBefore = s.crew.length
  s = interview(s, cand.id)
  assert.equal(s.crew.length, crewBefore, 'nobody signs at zero interest')
  assert.equal(s.candidates.length, 0)
})

test('a better station attracts better people', () => {
  const humble = appeal(fresh())
  let grand = rich(fresh())
  for (const [kind, col] of [
    ['quarters', WING - 2], ['storage', WING + 2], ['reactor', WING + 3],
    ['medbay', WING - 3], ['fabricator', WING + 4], ['comms', WING - 4],
  ] as [ModuleKind, number][]) {
    grand = build(grand, kind, col)
  }
  grand = { ...grand, decks: 4, credits: 5000 }
  assert.ok(appeal(grand) > humble, 'a bigger, richer, better-run station rates higher')
  assert.ok(appeal(grand) <= 1 && humble >= 0, 'appeal stays on its scale')
})

test('portraits are dealt out, not guessed, so a small crew has no twins', () => {
  const s = fresh()
  const faces = s.crew.map((c) => crewPortrait(c))
  assert.equal(new Set(faces).size, faces.length, 'the founding five all look different')
})

test('every portrait is used before any of them repeats', () => {
  let s = rich(fresh())
  // Fill the roster well past the portrait count, one hire at a time.
  while (s.crew.length < PORTRAIT_COUNT) {
    s = { ...s, crew: [...s.crew, makeCrew(rng, { portrait: allocatePortrait(s) })] }
  }
  const faces = s.crew.map((c) => crewPortrait(c))
  assert.equal(s.crew.length, PORTRAIT_COUNT)
  assert.equal(new Set(faces).size, PORTRAIT_COUNT, 'all of them, each exactly once')

  // Only now does anyone wear a face twice, and the pool stays even.
  s = { ...s, crew: [...s.crew, makeCrew(rng, { portrait: allocatePortrait(s) })] }
  const after = s.crew.map((c) => crewPortrait(c))
  assert.equal(new Set(after).size, PORTRAIT_COUNT, 'the 25th has to reuse one')
  const counts = new Map<number, number>()
  for (const f of after) counts.set(f, (counts.get(f) ?? 0) + 1)
  assert.equal(Math.max(...counts.values()), 2, 'and only one face is doubled up')
})

test('an applicant keeps the face you interviewed when they sign', () => {
  let s = reducer(staffed(), { type: 'requestCrew' })
  s = advance(s, 60)
  const cand = { ...s.candidates[0], interest: 100 }
  s = { ...s, candidates: [cand] }
  assert.ok(cand.portrait, 'applicants are dealt a face on dispatch')
  assert.ok(
    !s.crew.some((c) => crewPortrait(c) === cand.portrait),
    'and it is not one already aboard',
  )

  s = interview(s, cand.id)
  const hired = s.crew.at(-1)!
  assert.equal(crewPortrait(hired), cand.portrait, 'the face follows them onto the roster')
})
