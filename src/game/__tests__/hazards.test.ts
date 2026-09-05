import assert from 'node:assert/strict'
import test from 'node:test'
import { newGame } from '../engine.ts'
import { startIncident, incidentCap } from '../hazards.ts'
import type { IncidentKind } from '../types.ts'

let founded = 0
const fresh = () => newGame('Spaceport-99', 8800 + (founded += 1))

test('startIncident refuses a module that already has an incident', () => {
  const s = fresh()
  const module = s.modules[0]
  startIncident(s, 'fire', module)
  assert.ok(s.incidents.some((i) => i.moduleId === module.id), 'incident started')

  const before = s.incidents.length
  startIncident(s, 'fire', module)
  assert.equal(s.incidents.length, before, 'a second incident was refused')
})

test('startIncident refuses to start an incident when the cap is reached', () => {
  const s = fresh()
  const cap = incidentCap(s)
  const kinds: IncidentKind[] = ['fire', 'breach', 'vermin']
  for (let i = 0; i < cap; i += 1) {
    const module = s.modules[i % s.modules.length]
    const kind = kinds[i % kinds.length]
    startIncident(s, kind, module)
  }
  assert.equal(s.incidents.length, cap, 'incidents reached the cap')

  const other = s.modules.find((m) => !s.incidents.some((i) => i.moduleId === m.id))!
  startIncident(s, 'fire', other)
  assert.equal(s.incidents.length, cap, 'no more incidents were added over the cap')
})
