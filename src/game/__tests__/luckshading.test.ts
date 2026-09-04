import assert from 'node:assert/strict'
import test from 'node:test'
import { newGame, reducer, resolveMission, roller, rollIncident, seeded } from '../engine.ts'
import { makeMission, rollOutcome } from '../fleet.ts'
import { exposureOdds } from '../talks/covert.ts'
import { makeCrew } from '../crew.ts'
import { STAT_KEYS } from '../types.ts'
import type { GameState, Stats, Visitor } from '../types.ts'
import type { TalkCtx } from '../talk.ts'

/**
 * Luck runs three rooms — the Comms Array, the Trading Hub and the
 * Reclamation Bay — the same as any other stat runs a room it is staffed in.
 * What it never had was a job in the systemic rolls the other six each get
 * somewhere: a mission's outcome, an incident's target, an arrangement
 * coming out. Now it does, in all three, and always the luckiest one on hand
 * rather than an average — the same shape everywhere it applies.
 */

let founded = 0
const fresh = () => newGame('Spaceport-99', 61000 + (founded += 1))

const flatStats = (focus: Partial<Stats> = {}): Stats => {
  const base = Object.fromEntries(STAT_KEYS.map((k) => [k, 2])) as Stats
  return { ...base, ...focus }
}

// -------------------------------------------------------------- missions --

test('the luckiest one aboard measurably improves a mission’s odds', () => {
  const m = makeMission(roller(fresh()), 0.3, { shape: 'contract' })
  m.danger = 0.4 // pinned, so only the crew changes between the two runs
  const tierScore: Record<string, number> = { disaster: 0, setback: 1, success: 2, triumph: 3 }

  const meanTier = (luck: number): number => {
    const trials = 1500
    let total = 0
    for (let i = 0; i < trials; i += 1) {
      const crew = [makeCrew(seeded(9000 + i), { stats: flatStats({ [m.stat]: 3, L: luck }) })]
      total += tierScore[rollOutcome(seeded(70000 + i), crew, m, null)]
    }
    return total / trials
  }

  const unlucky = meanTier(1)
  const lucky = meanTier(10)
  assert.ok(lucky > unlucky + 0.15, `unlucky ${unlucky} vs lucky ${lucky}`)
})

test('and it finds measurably more out there, caches included', () => {
  const run = (luck: number): { finds: number; caches: number } => {
    const trials = 1500
    let finds = 0
    let caches = 0
    for (let i = 0; i < trials; i += 1) {
      const s: GameState = { ...newGame('Spaceport-99', 62000 + i), credits: 50000 }
      // Strong at whatever the job needs, whichever kind it turns out to be —
      // this isolates Luck's own effect from just being bad at the job.
      const crew = [makeCrew(roller(s), { stats: flatStats({ T: 9, O: 9, I: 9, R: 9, B: 9, L: luck }) })]
      s.crew = crew
      const m = makeMission(roller(s), 0.3, { shape: 'contract' })
      m.danger = 0.3
      m.crewIds = [crew[0].id]
      resolveMission(s, m)
      if (m.find) finds += 1
      if (m.find?.kind === 'cache') caches += 1
    }
    return { finds, caches }
  }

  const unlucky = run(1)
  const lucky = run(10)
  assert.ok(lucky.finds > unlucky.finds * 1.15, `finds: unlucky ${unlucky.finds} vs lucky ${lucky.finds}`)
  assert.ok(
    lucky.caches > unlucky.caches * 1.4,
    `caches: unlucky ${unlucky.caches} vs lucky ${lucky.caches}`,
  )
})

// ------------------------------------------------------------- incidents --

test('the luckiest one on watch measurably cuts an emergency down there', () => {
  const rate = (luck: number): number => {
    const trials = 3000
    let incidents = 0
    for (let i = 0; i < trials; i += 1) {
      const s: GameState = { ...newGame('Spaceport-99', 63000 + i) }
      const crew = [makeCrew(roller(s), { stats: flatStats({ L: luck }) })]
      s.crew = crew
      // Every candidate room staffed the same, so wherever the roll lands the
      // effect is live rather than diluted by an empty room next door.
      s.modules = s.modules.map((mod) => (mod.kind === 'spine' ? mod : { ...mod, staff: [crew[0].id] }))
      const before = s.incidents.length
      rollIncident(s)
      if (s.incidents.length > before) incidents += 1
    }
    return incidents / trials
  }

  const unlucky = rate(1)
  const lucky = rate(10)
  assert.ok(lucky < unlucky * 0.75, `unlucky ${unlucky} vs lucky ${lucky}`)
})

// -------------------------------------------------------- covert exposure --

test('the luckiest one on the Covert Ops watch shaves the odds it comes out', () => {
  const withRoom = (luck: number): GameState => {
    let s: GameState = { ...fresh(), credits: 60000 }
    s = reducer(s, { type: 'build', kind: 'covertops', deck: 0, col: 2 })
    const m = s.modules.find((x) => x.kind === 'covertops')
    if (!m) throw new Error('Covert Ops was not built')
    const crew = [makeCrew(roller(s), { stats: flatStats({ A: 6, L: luck }) })]
    s = { ...s, crew: [...s.crew, ...crew] }
    return reducer(s, { type: 'assign', crewId: crew[0].id, moduleId: m.id })
  }
  // exposureOdds only reads c.s and c.ship.covert — a minimal stand-in for
  // the rest of a TalkCtx is enough to exercise it directly.
  const ctx = (s: GameState): TalkCtx =>
    ({ s, ship: { covert: { from: 'concern', ask: 'cargo', pays: 100 } } as Visitor }) as unknown as TalkCtx

  const unlucky = exposureOdds(ctx(withRoom(1)))
  const lucky = exposureOdds(ctx(withRoom(10)))
  assert.ok(lucky < unlucky - 0.05, `unlucky ${unlucky} vs lucky ${lucky}`)
})
