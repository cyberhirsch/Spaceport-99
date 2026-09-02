import assert from 'node:assert/strict'
import test from 'node:test'
import { DECLARE_AT, appeal, declineReason, newGame, patronStanding, reducer } from '../engine.ts'
import { FACTION_IDS, PATRONS, factionDef, rollOwner, standingWord } from '../factions.ts'
import { makeVisitor } from '../visitors.ts'
import type { FactionId, GameState } from '../types.ts'

const warm = (s: GameState, id: FactionId, n = 0.1): GameState => ({
  ...s,
  standing: { ...s.standing, [id]: n },
})

test('a new station owes nobody anything and flies no flag', () => {
  const s = newGame()
  assert.deepEqual(Object.keys(s.standing).sort(), [...FACTION_IDS].sort())
  assert.ok(FACTION_IDS.every((id) => s.standing[id] === 0))
  assert.equal(s.patron, null)
  assert.deepEqual(s.resigned, [])
  assert.equal(standingWord(0), 'neutral')
})

test('the Unlisted are a filing status, not a flag', () => {
  const s = warm(newGame(), 'unlisted', 0.2)
  assert.equal(factionDef('unlisted').patronable, false)
  assert.ok(!PATRONS.includes('unlisted'))
  assert.ok(declineReason(s, 'unlisted'))
  assert.equal(reducer(s, { type: 'declare', faction: 'unlisted' }), s, 'and cannot be declared for')
})

test('a power will not take a station that has been no use to it', () => {
  const cold = newGame()
  assert.ok(declineReason(cold, 'terran')?.includes('no use'))
  assert.equal(reducer(cold, { type: 'declare', faction: 'terran' }), cold)

  const useful = warm(cold, 'terran', DECLARE_AT)
  assert.equal(declineReason(useful, 'terran'), null)
  assert.equal(reducer(useful, { type: 'declare', faction: 'terran' }).patron, 'terran')
})

test('the flag you fly is the opinion that counts', () => {
  let s = warm(warm(newGame(), 'terran', 0.2), 'concern', -0.2)
  assert.ok(Math.abs(patronStanding(s) - 0) < 0.01, 'unaligned, you trade on your general name')

  s = reducer(s, { type: 'declare', faction: 'terran' })
  assert.equal(patronStanding(s), 0.2, 'Confederation paper means Earth is the one grading you')
  const asTerran = appeal(s)

  const flipped = reducer({ ...s, patron: 'concern' }, { type: 'tick', seconds: 0 })
  assert.ok(appeal(flipped) < asTerran, 'flying paper from people who dislike you costs')
})

test('changing sides costs you with the people you walked out on', () => {
  // The Concern starts below its ceiling, or the credit for defecting has
  // nowhere to go.
  let s = warm(warm(newGame(), 'terran', 0.2), 'concern', 0.1)
  s = reducer(s, { type: 'declare', faction: 'terran' })
  const before = s.standing

  s = reducer(s, { type: 'declare', faction: 'concern' })
  assert.equal(s.patron, 'concern')
  assert.ok(s.standing.terran < before.terran, 'Earth strikes the station from the roll')
  assert.ok(s.standing.concern > before.concern, 'though nobody minds a defector coming to them')
  assert.deepEqual(s.resigned, ['terran'], 'and it is on the record')
})

test('striking the flag leaves you unaligned, and it still costs', () => {
  let s = reducer(warm(newGame(), 'concern', 0.2), { type: 'declare', faction: 'concern' })
  const before = s.standing.concern
  s = reducer(s, { type: 'resign' })
  assert.equal(s.patron, null)
  assert.ok(s.standing.concern < before)
  assert.deepEqual(s.resigned, ['concern'])
  assert.equal(reducer(s, { type: 'resign' }), s, 'and there is nothing left to resign')
})

test('Compact enrolment is the one door that only opens inward', () => {
  let s = warm(warm(newGame(), 'compact', 0.2), 'terran', 0.2)
  s = reducer(s, { type: 'declare', faction: 'compact' })
  assert.equal(s.patron, 'compact')
  assert.equal(factionDef('compact').exit, '', 'there is no exit clause to quote')

  assert.equal(reducer(s, { type: 'resign' }), s, 'you cannot strike the flag')
  assert.ok(declineReason(s, 'terran')?.includes('no exit clause'))
  assert.equal(reducer(s, { type: 'declare', faction: 'terran' }), s, 'nor swap it')
})

test('every hull flies for somebody, and raiders are never anything but Unlisted', () => {
  for (let i = 0; i < 200; i += 1) {
    const v = makeVisitor()
    assert.ok(FACTION_IDS.includes(v.faction), `${v.kind} flew for ${v.faction}`)
    if (v.kind === 'raider' || v.kind === 'smuggler') assert.equal(v.faction, 'unlisted')
  }
  // Couriers carry Confederation writs more often than not.
  const couriers = Array.from({ length: 300 }, () => rollOwner('courier'))
  assert.ok(couriers.filter((f) => f === 'terran').length > 150)
})

test('standing reads as an opinion rather than a number', () => {
  assert.equal(standingWord(-0.2), 'hostile')
  assert.equal(standingWord(-0.08), 'cold')
  assert.equal(standingWord(0.09), 'warm')
  assert.equal(standingWord(0.2), 'trusted')
})
