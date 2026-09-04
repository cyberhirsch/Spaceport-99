import assert from 'node:assert/strict'
import test from 'node:test'
import { newGame } from '../engine.ts'
import { clearSave, clearSlot, loadGame, saveGame, slotInfo, writeSlot, readSlot } from '../save.ts'
import type { GameState } from '../types.ts'

/**
 * A localStorage the tests can see inside.
 *
 * `save.ts` calls the browser global directly — there is no seam to inject a
 * fake through, and Node does not define `localStorage` at all. So the stub
 * goes on `globalThis` for the life of this file, which is safe because
 * `node --test` runs each test file in its own process.
 */
class FakeStorage {
  private store = new Map<string, string>()
  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
  clear(): void {
    this.store.clear()
  }
}

const storage = new FakeStorage()
;(globalThis as unknown as { localStorage: FakeStorage }).localStorage = storage

test.beforeEach(() => storage.clear())

/** Everything about a station except the id strings, which carry the clock. */
const shape = (s: GameState): string =>
  JSON.stringify(s, (key, value) => (key === 'lastTick' ? undefined : value))

test('a save round-trips through loadGame unchanged', () => {
  const founded = newGame('Spaceport-99', 909)
  saveGame(founded)
  const loaded = loadGame()
  assert.ok(loaded, 'the save was read back')
  assert.equal(loaded.rng, founded.rng)
  assert.equal(loaded.name, founded.name)
  assert.deepEqual(loaded.modules, founded.modules)
  assert.deepEqual(loaded.crew.map((c) => c.id), founded.crew.map((c) => c.id))
})

test('with nothing saved, loadGame says so rather than guessing', () => {
  assert.equal(loadGame(), null)
})

test('an old save is migrated on the way in, not refused', () => {
  // A version-7 station: everything the 7 -> 12 chain adds, stripped back out.
  const s = newGame('Old Station', 42) as unknown as Record<string, unknown>
  s.version = 7
  delete s.rng
  delete s.covert
  delete s.nextApproachIn
  delete s.burned
  delete s.nextLoiterIn
  delete s.nextLevyIn
  delete s.nextClaimIn
  delete s.quest
  delete s.nextQuestIn
  storage.setItem('spaceport99.save', JSON.stringify(s))

  const loaded = loadGame()
  assert.ok(loaded, 'it loads rather than being thrown away')
  assert.equal(loaded.name, 'Old Station')
  assert.equal(typeof loaded.rng, 'number', 'and it is dealt luck of its own')
  assert.ok(loaded.covert, 'and a channels ledger')
  assert.ok(loaded.quest, 'and a quest')
})

test('a save with no path forward is refused rather than guessed at', () => {
  const tooOld = newGame('x', 1) as unknown as Record<string, unknown>
  tooOld.version = 3
  storage.setItem('spaceport99.save', JSON.stringify(tooOld))
  assert.equal(loadGame(), null)

  const fromTheFuture = newGame('x', 1) as unknown as Record<string, unknown>
  fromTheFuture.version = 9999
  storage.setItem('spaceport99.save', JSON.stringify(fromTheFuture))
  assert.equal(loadGame(), null)
})

test('a hand-edited or truncated save is refused, not half-loaded', () => {
  const broken = { ...newGame('x', 1), modules: 'not an array' }
  storage.setItem('spaceport99.save', JSON.stringify(broken))
  assert.equal(loadGame(), null)

  storage.setItem('spaceport99.save', 'this is not json at all {')
  assert.equal(loadGame(), null)
})

test('a private-browsing quota does not crash the game, it just does not persist', () => {
  const angry = {
    getItem: () => {
      throw new Error('quota exceeded')
    },
    setItem: () => {
      throw new Error('quota exceeded')
    },
    removeItem: () => {},
  }
  const real = (globalThis as unknown as { localStorage: unknown }).localStorage
  ;(globalThis as unknown as { localStorage: unknown }).localStorage = angry
  try {
    saveGame(newGame('x', 1))
    assert.equal(loadGame(), null)
  } finally {
    ;(globalThis as unknown as { localStorage: unknown }).localStorage = real
  }
})

test('the manual slot is separate from the autosave, and survives it', () => {
  saveGame(newGame('Autosaved', 1))
  writeSlot(newGame('Bookmarked', 2))
  const auto = loadGame()
  const slot = readSlot()
  assert.equal(auto?.name, 'Autosaved')
  assert.equal(slot?.name, 'Bookmarked')

  saveGame(newGame('Autosaved again', 3))
  assert.equal(readSlot()?.name, 'Bookmarked', 'the bookmark does not move on its own')
})

test('the slot also migrates an old save', () => {
  const old = newGame('Old Bookmark', 5) as unknown as Record<string, unknown>
  old.version = 7
  delete old.covert
  storage.setItem('spaceport99.slot', JSON.stringify(old))
  const loaded = readSlot()
  assert.ok(loaded)
  assert.ok(loaded.covert)
})

test('slotInfo describes the bookmark without fully loading it into play', () => {
  assert.equal(slotInfo(), null, 'nothing there yet')
  const s = { ...newGame('Reported', 9), credits: 1234.6, elapsed: 500 }
  writeSlot(s)
  const info = slotInfo()
  assert.ok(info)
  assert.equal(info.name, 'Reported')
  assert.equal(info.credits, 1235, 'rounded for the menu')
  assert.equal(info.crew, s.crew.filter((c) => !c.dead).length)
  assert.equal(info.rooms, s.modules.length)
})

test('clearSave and clearSlot each remove only their own key', () => {
  saveGame(newGame('a', 1))
  writeSlot(newGame('b', 2))

  clearSave()
  assert.equal(loadGame(), null)
  assert.ok(readSlot(), 'the slot is untouched')

  clearSlot()
  assert.equal(readSlot(), null)
})

test('two rounds through save and load produce the same station', () => {
  const founded = newGame('Spaceport-99', 606)
  saveGame(founded)
  const once = loadGame()!
  saveGame(once)
  const twice = loadGame()!
  assert.equal(shape(once), shape(twice))
})

test('a save without portraits gets all crew dealt distinct faces on load', () => {
  const old = newGame('No Portraits', 707) as unknown as Record<string, unknown>
  old.version = 12
  // Strip portraits from crew so they fall back to seed derivation.
  const crew = old.crew as unknown as Array<{ portrait?: number }>
  for (const c of crew) delete c.portrait
  storage.setItem('spaceport99.save', JSON.stringify(old))

  const loaded = loadGame()
  assert.ok(loaded, 'an old save without portraits loads')
  const portraits = loaded.crew.map((c) => c.portrait).filter((p) => p !== undefined)
  assert.equal(portraits.length, loaded.crew.length, 'all crew got a portrait')
  const unique = new Set(portraits)
  assert.equal(unique.size, portraits.length, 'all portraits are distinct where the pool allows')
})

test('a save from before recruits had a reason for being here reads them as posted', () => {
  const old = newGame('No Reasons', 909) as unknown as Record<string, unknown>
  old.version = 13
  // A candidate as an older build wrote them: no story about how they got here.
  old.candidates = [
    {
      id: 'a_old',
      name: 'Wren Halloway',
      seed: 12,
      stats: { O: 4, R: 4, B: 4, I: 4, T: 4, A: 4, L: 4 },
      tier: 0.4,
      interest: 30,
      askingBonus: 150,
      patience: 240,
      promised: null,
      arrivesIn: 0,
      faction: 'concern',
    },
  ]
  storage.setItem('spaceport99.save', JSON.stringify(old))

  const loaded = loadGame()
  assert.ok(loaded, 'the old save loads')
  assert.equal(loaded.candidates.length, 1, 'the applicant survived the migration')
  assert.equal(
    loaded.candidates[0].origin,
    'posted',
    'which is what the one line they used to share always said about them',
  )
})
