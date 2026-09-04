import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advance,
  candidateFaction,
  commsReach,
  dockBerths,
  makeCandidate,
  makeModule,
  makeWalkIn,
  newGame,
  reducer,
  requestCandidates,
  requestCooldown,
  REQUEST_COOLDOWN,
  seeded,
  stationRecord,
} from '../engine.ts'
import { makeCrew } from '../crew.ts'
import { STAT_KEYS } from '../types.ts'
import type { GameState, ModuleKind, StationModule, Stats } from '../types.ts'

/**
 * Four levers ought to move the roster besides Crew Quarters: how many
 * candidates one request turns up, who they fly for, how good they are, and
 * whether anybody turns up unasked at all. One seed per file.
 */
const rng = seeded(8800)

let founded = 0
const fresh = () => newGame('Spaceport-99', 8800 + (founded += 1))

const rich = (s: GameState): GameState => ({ ...s, credits: 90000 })

const place = (s: GameState, kind: ModuleKind): GameState => {
  for (let deck = 0; deck < Math.max(1, s.decks); deck += 1) {
    for (let col = 0; col < 12; col += 1) {
      const next = reducer(s, { type: 'build', kind, deck, col })
      if (next.modules.length > s.modules.length) return next
    }
  }
  throw new Error(`could not place ${kind}`)
}

const flatStats = (focus: Partial<Stats> = {}): Stats => {
  const base = Object.fromEntries(STAT_KEYS.map((k) => [k, 2])) as Stats
  return { ...base, ...focus }
}

/** A comms array built up wide and level, staffed with sharp operators. */
const wideComms = (s: GameState): GameState => {
  const m: StationModule = { ...makeModule('comms', 0, 0), width: 3, level: 2 }
  const crew = Array.from({ length: 4 }, () => makeCrew(rng, { stats: flatStats({ A: 9 }) }))
  m.staff = crew.map((c) => c.id)
  return { ...s, crew: [...s.crew, ...crew], modules: [...s.modules, m] }
}

/** The comms array a founding station actually has: one segment, one hand. */
const bareComms = (s: GameState): GameState => {
  const m = makeModule('comms', 0, 0)
  const c = makeCrew(rng, { stats: flatStats({ A: 2 }) })
  m.staff = [c.id]
  return { ...s, crew: [...s.crew, c], modules: [...s.modules, m] }
}

// ------------------------------------------------------------- how many --

test('a wider, better-run array calls in more people than a bare one', () => {
  const bare = bareComms(fresh())
  const wide = wideComms(fresh())
  assert.ok(commsReach(wide) > commsReach(bare), 'the array itself reads bigger')
  assert.equal(requestCandidates(bare), 1, 'a founding array is the floor, not a bonus')
  assert.ok(requestCandidates(wide) > 1, 'and a built-up one calls more than one over')
})

test('one request never turns up nobody, however weak the array', () => {
  const empty: GameState = { ...fresh(), modules: fresh().modules.map((m) => ({ ...m })) }
  assert.equal(requestCandidates(empty), 1, 'the floor holds even off a bare comms reading')
})

test('a bigger array also shortens the wait for the next request', () => {
  const bare = bareComms(fresh())
  const wide = wideComms(fresh())
  assert.equal(requestCooldown(bare), REQUEST_COOLDOWN, 'a founding array changes nothing')
  assert.ok(requestCooldown(wide) < REQUEST_COOLDOWN, 'a built-up one answers sooner')
  assert.ok(requestCooldown(wide) >= 20, 'and never instantly')
})

test('the reducer actually sends as many as the array calls in', () => {
  let s = wideComms(rich(fresh()))
  s = place(s, 'quarters') // bunks, so the new hands have somewhere to sleep
  // A wide dock, spliced in directly so it does not weld onto the founding
  // one and throw place()'s module-count check — more berths than the array
  // could possibly ask for, so the dock itself is not the limit here.
  const wideDock: StationModule = { ...makeModule('dock', 1, 0), width: 3, level: 2 }
  s = { ...s, decks: 2, modules: [...s.modules, wideDock] }
  const expected = requestCandidates(s)
  assert.ok(expected > 1, `the array itself should be asking for more than one: ${expected}`)
  const before = s.candidates.length
  const asked = reducer(s, { type: 'requestCrew' })
  const sent = asked.candidates.length - before
  assert.equal(sent, expected, 'the reducer sends exactly what the array reads')
})

test('however many the array calls in, the dock never receives more than it can hold', () => {
  // A single unmerged docking port has two berths. A wider array asking for
  // more than that is still capped at what the dock can actually take.
  let s = wideComms(rich(fresh()))
  s = place(s, 'quarters')
  assert.ok(requestCandidates(s) > dockBerths(s), 'the array asks for more than the port can hold')
  const asked = reducer(s, { type: 'requestCrew' })
  assert.equal(asked.candidates.length, dockBerths(s), 'so only that many actually turn up')
})

// ------------------------------------------------------------ who answers --

test('a patron in good standing sends its own people far more often', () => {
  const warm: GameState = { ...fresh(), patron: 'terran', standing: { ...fresh().standing, terran: 0.19 } }
  const cold: GameState = { ...fresh(), patron: 'terran', standing: { ...fresh().standing, terran: -0.19 } }
  const none: GameState = { ...fresh(), patron: null }

  const share = (s: GameState, id: 'terran'): number => {
    let hits = 0
    for (let i = 0; i < 400; i += 1) if (candidateFaction(s, rng) === id) hits += 1
    return hits / 400
  }

  const warmShare = share(warm, 'terran')
  const coldShare = share(cold, 'terran')
  const noneShare = share(none, 'terran')
  assert.ok(warmShare > coldShare + 0.15, `warm ${warmShare} vs cold ${coldShare}`)
  assert.ok(warmShare > noneShare, `a flag you fly for still sends more than nobody asking`)
})

test('the faction rides along on the candidate itself', () => {
  const warm: GameState = { ...fresh(), patron: 'terran', standing: { ...fresh().standing, terran: 0.19 } }
  let terranCount = 0
  for (let i = 0; i < 200; i += 1) {
    const c = makeCandidate({ ...warm, rng: warm.rng + i }, 0)
    if (c.faction === 'terran') terranCount += 1
  }
  assert.ok(terranCount > 100, 'most of them fly the flag you are warm with')
})

// ---------------------------------------------------------- how good they are --

test('deaths, live trouble and empty tanks read the same to a recruit as to anybody else', () => {
  const clean = rich(fresh())
  const troubled: GameState = {
    ...clean,
    crew: [
      ...clean.crew.map((c) => ({ ...c })),
      { ...clean.crew[0], id: 'c_dead1', dead: true, hp: 0 },
      { ...clean.crew[0], id: 'c_dead2', dead: true, hp: 0 },
      { ...clean.crew[0], id: 'c_dead3', dead: true, hp: 0 },
    ],
    incidents: [
      {
        id: 'i_test',
        kind: 'fire',
        moduleId: clean.modules[0].id,
        hp: 40,
        maxHp: 40,
        spreadIn: 30,
        startedAt: 0,
      },
    ],
    resources: { power: 5, air: 2, food: 1 },
  }
  assert.ok(
    stationRecord(clean) > stationRecord(troubled) + 0.2,
    `clean ${stationRecord(clean)} vs troubled ${stationRecord(troubled)}`,
  )
})

test('a Lounge and a Gym running lift the record; standby ones do not', () => {
  const bare = rich(fresh())
  let comfortable = bare
  for (const kind of ['lounge', 'gym'] as ModuleKind[]) {
    const m: StationModule = { ...makeModule(kind, 0, 0), col: kind === 'gym' ? 1 : 0 }
    const c = makeCrew(rng, { stats: flatStats() })
    m.staff = [c.id]
    comfortable = { ...comfortable, crew: [...comfortable.crew, c], modules: [...comfortable.modules, m] }
  }
  assert.ok(stationRecord(comfortable) > stationRecord(bare), 'a place worth being off duty in shows')

  const idle: GameState = {
    ...comfortable,
    modules: comfortable.modules.map((m) =>
      m.kind === 'lounge' || m.kind === 'gym' ? { ...m, standby: true } : m,
    ),
  }
  assert.ok(idle.crew.length === comfortable.crew.length)
  assert.ok(
    stationRecord(idle) < stationRecord(comfortable),
    'a Lounge with the lights off does not count',
  )
})

test('the record measurably moves the stats a candidate actually rolls', () => {
  const meanReach = (s: GameState): number => {
    let total = 0
    for (let i = 0; i < 150; i += 1) total += makeCandidate({ ...s, rng: s.rng + i }, 0).tier
    return total / 150
  }
  const clean = rich(fresh())
  const troubled: GameState = {
    ...clean,
    crew: clean.crew.map((c, i) => (i < 3 ? { ...c, dead: true, hp: 0 } : c)),
    resources: { power: 2, air: 1, food: 1 },
  }
  assert.ok(meanReach(clean) > meanReach(troubled), 'a station with a record earns better applicants')
})

// -------------------------------------------------------- unasked arrivals --

test('a busy Trading Hub occasionally lands somebody nobody called for', () => {
  let s = rich(fresh())
  s = place(s, 'quarters') // room for the crew the hub itself needs
  s = place(s, 'quarters')
  const m: StationModule = { ...makeModule('market', 0, 0), width: 2, level: 2 }
  const crew = Array.from({ length: 3 }, () => makeCrew(rng, { stats: flatStats({ L: 8 }) }))
  m.staff = crew.map((c) => c.id)
  s = { ...s, crew: [...s.crew, ...crew], modules: [...s.modules, m] }

  let sawWalkIn = false
  for (let i = 0; i < 60; i += 1) {
    s = advance(s, 200)
    if (s.candidates.length > 0) {
      sawWalkIn = true
      break
    }
  }
  assert.ok(sawWalkIn, 'nobody ever asked, and somebody turned up anyway')
})

test('with no Trading Hub running, nobody walks in on their own', () => {
  let s = rich(fresh())
  for (let i = 0; i < 30; i += 1) s = advance(s, 200)
  assert.equal(s.candidates.length, 0, 'a founding station has no hub and no walk-ins')
})

test('a walk-in is already on the deck, not in transit', () => {
  const w = makeWalkIn(rich(fresh()))
  assert.equal(w.arrivesIn, 0)
})

// ----------------------------------------------------- quarters is still the ceiling --

test('every lever together still cannot get past a full roster', () => {
  let s = wideComms(rich(fresh()))
  s = { ...s, patron: 'terran', standing: { ...s.standing, terran: 0.19 } }
  // Pack the roster well past what a station with no Crew Quarters can hold.
  s = {
    ...s,
    crew: [
      ...s.crew,
      ...Array.from({ length: 20 }, (_, i) => ({ ...s.crew[0], id: `c_full_${i}`, dead: false })),
    ],
  }
  const before = s.candidates.length
  const asked = reducer(s, { type: 'requestCrew' })
  assert.equal(asked.candidates.length, before, 'HQ will not staff a station with no bunks left')
})
