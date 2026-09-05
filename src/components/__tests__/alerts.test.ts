import assert from 'node:assert/strict'
import test from 'node:test'
import { derive, newGame, reducer } from '../../game/engine.ts'
import { incidentCap, startIncident } from '../../game/hazards.ts'
import { makeModule } from '../../game/state.ts'
import { alertsFor } from '../alerts.ts'
import type { Derived } from '../../game/state.ts'
import type { GameState, ModuleKind } from '../../game/types.ts'

let founded = 0
const fresh = () => newGame('Spaceport-99', 7700 + (founded += 1))

const rich = (s: GameState): GameState => ({ ...s, credits: 90000 })
const build = (s: GameState, kind: ModuleKind, col: number): GameState =>
  reducer(rich(s), { type: 'build', kind, deck: 0, col })

/**
 * The station's own figures, with the ones under test forced. `alertsFor` is a
 * pure read of the two, so a shortfall can be stated rather than engineered.
 */
const rates = (s: GameState, over: Partial<Derived>): Derived => ({ ...derive(s), ...over })

/**
 * A station with incidents burning in rooms we can name. The cap on how many
 * can run at once scales with the station, so this grows one big enough to
 * hold however many the test is about.
 */
const onFire = (kinds: ('fire' | 'breach' | 'vermin')[]): GameState => {
  const s = structuredClone(fresh())
  let col = 7
  while (incidentCap(s) < kinds.length) s.modules.push(makeModule('storage', 0, (col += 1)))
  const rooms = s.modules.filter((m) => m.kind !== 'spine').slice(0, kinds.length)
  kinds.forEach((kind, i) => startIncident(s, kind, rooms[i]))
  return s
}

test('an emergency says which room, not how many there are', () => {
  const s = onFire(['fire'])
  const said = alertsFor(s, derive(s))
  const alarm = said.find((a) => a.includes('Fire'))
  assert.ok(alarm, `no fire in: ${said.join(' | ')}`)
  assert.match(alarm, /Fire in the /, 'it names the room it is in')
  assert.ok(!said.some((a) => /emergency in progress/.test(a)), 'and does not just count them')
})

test('two emergencies name both, and a crowd is summarised', () => {
  const pair = onFire(['fire', 'breach'])
  const both = alertsFor(pair, derive(pair)).find((a) => a.includes('Fire'))!
  assert.match(both, /Fire in the .*, and Hull Breach in the /)

  const crowd = onFire(['fire', 'breach', 'vermin'])
  const many = alertsFor(crowd, derive(crowd)).find((a) => a.includes('Fire'))!
  assert.match(many, /and 2 more emergencies$/, 'past two it stops listing')
})

test('a power shortfall tells you to build the reactor you have not got', () => {
  const s = fresh()
  const bare: GameState = { ...s, modules: s.modules.filter((m) => m.kind !== 'reactor') }
  const said = alertsFor(bare, rates(bare, { powerRate: -12.6, brownout: false }))
  const power = said.find((a) => a.startsWith('Power deficit'))!
  assert.match(power, /12\.6\/s short/, 'it says how short')
  assert.match(power, /Add a Fusion Reactor\.$/, 'and what closes the gap')
})

test('a shortfall on a station that already has one asks for another', () => {
  const s = build(fresh(), 'reactor', 3)
  const said = alertsFor(s, rates(s, { powerRate: -12.6, brownout: false }))
  const power = said.find((a) => a.startsWith('Power deficit'))!
  assert.match(power, /Add another Fusion Reactor\.$/, 'not "add a" at somebody who did')
})

test('a brownout carries the remedy and does not print the deficit twice', () => {
  // The state from the screenshot: reactor built and staffed, grid at zero.
  const s = build(fresh(), 'reactor', 3)
  const said = alertsFor(s, rates(s, { powerRate: -12.6, brownout: true }))
  const brownout = said.find((a) => a.startsWith('Grid brownout'))!
  assert.match(brownout, /12\.6\/s short\. Add another Fusion Reactor\.$/, 'one line says it all')
  assert.equal(
    said.filter((a) => a.startsWith('Power deficit')).length,
    0,
    'the deficit line stands down rather than saying the same thing again',
  )
})

test('a healthy station raises nothing about power at all', () => {
  const s = fresh()
  const said = alertsFor(s, rates(s, { powerRate: 4, brownout: false }))
  assert.ok(!said.some((a) => /brownout|Power deficit/.test(a)), said.join(' | '))
})

test('the room it names gets the article it deserves', () => {
  const s = fresh()
  const bare: GameState = { ...s, modules: s.modules.filter((m) => m.kind !== 'atmospherics') }
  const said = alertsFor(bare, rates(bare, { airRate: -2 }))
  const air = said.find((a) => a.startsWith('Oxygen deficit'))!
  assert.match(air, /Add an Atmospherics Plant\.$/, 'not "a Atmospherics Plant"')
})
