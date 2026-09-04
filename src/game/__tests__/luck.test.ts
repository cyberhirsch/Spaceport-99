import assert from 'node:assert/strict'
import test from 'node:test'
import { SAVE_VERSION, advance, newGame, reducer, roll, seeded } from '../engine.ts'
import { migrate } from '../save.ts'
import type { GameState } from '../types.ts'

/**
 * Everything about a station except the id strings.
 *
 * Ids carry the wall clock and a per-process counter on purpose — two stations
 * founded from the same seed play out identically, they just do not share id
 * strings. So compare everything else, which is everything a player sees.
 */
const shape = (s: GameState): string =>
  JSON.stringify(s, (key, value) =>
    key === 'id' ||
    key === 'lastTick' ||
    key === 'staff' ||
    key === 'assignment' ||
    key === 'returnTo' ||
    key.endsWith('Id') ||
    key.endsWith('Ids')
      ? undefined
      : value,
  )

test('a roller from a given seed always deals the same hand', () => {
  const first = seeded(7)
  const second = seeded(7)
  const drawn: number[] = []
  for (let i = 0; i < 40; i += 1) {
    const n = first()
    assert.equal(n, second(), 'the same seed, the same number')
    assert.ok(n >= 0 && n < 1, `in range: ${n}`)
    drawn.push(n)
  }
  assert.ok(new Set(drawn).size > 35, 'and it is not the same number forty times')
})

test('rolling moves the state on, so the next roll is a different one', () => {
  const s = { rng: 12345 }
  const a = roll(s)
  const before = s.rng
  const b = roll(s)
  assert.notEqual(before, s.rng, 'the state carries the sequence')
  assert.notEqual(a, b)
})

test('the same seed founds the same station', () => {
  assert.equal(shape(newGame('Spaceport-99', 4242)), shape(newGame('Spaceport-99', 4242)))
  assert.notEqual(shape(newGame('Spaceport-99', 4242)), shape(newGame('Spaceport-99', 4243)))
})

test('and it runs the same way afterwards', () => {
  // Ten minutes is long enough for traffic, contracts and an incident or two.
  const a = advance(newGame('Spaceport-99', 88), 600)
  const b = advance(newGame('Spaceport-99', 88), 600)
  assert.equal(shape(a), shape(b))
  assert.ok(a.log.length > 1, 'something actually happened')
})

test('the reducer answers the same way twice, which is what React expects of it', () => {
  // React calls a reducer twice with the same input in development. Before the
  // luck lived in the state, the second answer could differ from the first —
  // and the interface would show one and save the other.
  const s: GameState = { ...newGame('Spaceport-99', 606), credits: 9000 }
  assert.equal(
    shape(reducer(s, { type: 'requestCrew' })),
    shape(reducer(s, { type: 'requestCrew' })),
  )
})

test('reloading a save cannot reroll what was about to happen', () => {
  let s = advance(newGame('Spaceport-99', 31337), 300)
  s = { ...s, credits: 9000 }
  // A save is a round trip through JSON and nothing else.
  const reloaded = JSON.parse(JSON.stringify(s)) as GameState
  assert.equal(shape(advance(s, 900)), shape(advance(reloaded, 900)))
})

test('a save from the version before the luck existed is brought forward', () => {
  const old = { ...newGame('Spaceport-99', 5), version: 7 } as unknown as Record<string, unknown>
  delete old.rng
  delete old.covert
  const brought = migrate(old as unknown as GameState)
  assert.ok(brought, 'it loads rather than being thrown away')
  assert.equal(brought.version, SAVE_VERSION, 'walked all the way to the present')
  assert.equal(typeof brought.rng, 'number', 'and it is dealt luck of its own')
  assert.ok(brought.covert, 'and a ledger for what it has not filed')
})

test('a save with no path forward is refused rather than guessed at', () => {
  assert.equal(migrate({ ...newGame('Spaceport-99', 5), version: 3 }), null, 'too old')
  assert.equal(migrate({ ...newGame('Spaceport-99', 5), version: 99 }), null, 'from the future')
})
