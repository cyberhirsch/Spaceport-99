import assert from 'node:assert/strict'
import test from 'node:test'
import {
  appeal,
  newGame,
  patronStanding,
  reducer,
  seeded,
} from '../engine.ts'
import { FACTION_IDS, PATRONS, factionDef, rollOwner, standingWord } from '../factions.ts'
import { makeVisitor } from '../visitors.ts'
import type { FactionId, GameState } from '../types.ts'

// Every station in this file is founded from a known seed, so a run that passes
// today passes tomorrow. Each call moves the seed on, so a loop that founds
// forty stations still sees forty different ones.
let founded = 0
const fresh = () => newGame('Spaceport-99', 1200 + (founded += 1))

// One seed per file, so every draw below is the same draw every run.
const rng = seeded(11)

const warm = (s: GameState, id: FactionId, n = 0.1): GameState => ({
  ...s,
  standing: { ...s.standing, [id]: n },
})

test('a new station is a Confederation post and was never asked', () => {
  const s = fresh()
  assert.deepEqual(Object.keys(s.standing).sort(), [...FACTION_IDS].sort())
  assert.ok(FACTION_IDS.every((id) => s.standing[id] === 0))
  assert.equal(s.patron, 'terran')
  assert.deepEqual(s.resigned, [])
  assert.equal(standingWord(0), 'neutral')
})

test('the Unlisted are a filing status, not a flag', () => {
  assert.equal(factionDef('unlisted').patronable, false)
  assert.ok(!PATRONS.includes('unlisted'))
})

test('the flag you fly is the opinion that counts', () => {
  const s = warm(warm(fresh(), 'terran', 0.2), 'concern', -0.2)
  assert.equal(patronStanding(s), 0.2, 'Confederation paper means Earth is the one grading you')
  const asTerran = appeal(s)

  // The only thing that changes the flag is somebody taking it.
  const taken = reducer({ ...s, patron: 'concern' }, { type: 'tick', seconds: 0 })
  assert.ok(appeal(taken) < asTerran, 'flying paper from people who dislike you costs')
})

test('every hull flies for somebody, and raiders are never anything but Unlisted', () => {
  for (let i = 0; i < 200; i += 1) {
    const v = makeVisitor(rng)
    assert.ok(FACTION_IDS.includes(v.faction), `${v.kind} flew for ${v.faction}`)
    if (v.kind === 'raider' || v.kind === 'smuggler') assert.equal(v.faction, 'unlisted')
  }
  // Couriers carry Confederation writs more often than not.
  const couriers = Array.from({ length: 300 }, () => rollOwner(rng, 'courier'))
  assert.ok(couriers.filter((f) => f === 'terran').length > 150)
})

test('standing reads as an opinion rather than a number', () => {
  assert.equal(standingWord(-0.2), 'hostile')
  assert.equal(standingWord(-0.08), 'cold')
  assert.equal(standingWord(0.09), 'warm')
  assert.equal(standingWord(0.2), 'trusted')
})
