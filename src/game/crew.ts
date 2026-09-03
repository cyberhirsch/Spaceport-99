import { ITEM_DEFS } from './gear.ts'
import { STAT_KEYS, type Crew, type StatKey, type Stats } from './types.ts'

const FIRST = [
  'Ada', 'Bex', 'Cyrus', 'Dara', 'Emil', 'Fenn', 'Greer', 'Halcyon', 'Ilse', 'Juno',
  'Kestrel', 'Lior', 'Mira', 'Nkechi', 'Osip', 'Perrin', 'Quill', 'Rook', 'Sable', 'Tovah',
  'Umi', 'Vasco', 'Wren', 'Xanthe', 'Yusuf', 'Zeph', 'Bo', 'Calla', 'Dmitri', 'Etta',
  'Fitz', 'Gale', 'Hux', 'Ines', 'Jax', 'Kip', 'Lark', 'Moss', 'Nadia', 'Oona',
]

const LAST = [
  'Okonkwo', 'Vance', 'Ashgrove', 'Petrov', 'Nakamura', 'Silva', 'Halloran', 'Bright',
  'Odell', 'Marsh', 'Kaur', 'Ferro', 'Lindqvist', 'Abara', 'Voss', 'Chen', 'Reyes',
  'Mbeki', 'Sorrel', 'Quint', 'Vaughn', 'Ostrova', 'Danner', 'Ilves', 'Farrow',
  'Zhu', 'Bellamy', 'Nwosu', 'Kaspar', 'Trent', 'Solano', 'Weatherly', 'Bright-Ito',
]

let counter = 0
export const uid = (prefix: string): string => {
  counter += 1
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`
}

const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]

export const randomName = (): string => `${pick(FIRST)} ${pick(LAST)}`

/**
 * New recruits start at 1 in everything with a handful of points sprinkled on
 * top. Pass a `focus` stat to guarantee a specialist — used for the founders so
 * the opening station is never staffed entirely by people who can't run it.
 */
export const rollStats = (points = 6, focus?: StatKey): Stats => {
  const stats = Object.fromEntries(STAT_KEYS.map((k) => [k, 1])) as Stats
  if (focus) {
    stats[focus] = 4
    points = Math.max(0, points - 3)
  }
  for (let i = 0; i < points; i += 1) {
    const k = pick(STAT_KEYS)
    if (stats[k] < 6) stats[k] += 1
    else i -= 1
  }
  return stats
}

export const MAX_STAT = 10

export const maxHpFor = (level: number, stats: Stats): number =>
  Math.round(45 + (level - 1) * 9 + stats.B * 5)

export const xpForLevel = (level: number): number => Math.round(55 * Math.pow(level, 1.55))

export const makeCrew = (overrides: Partial<Crew> = {}): Crew => {
  const stats = overrides.stats ?? rollStats()
  const level = overrides.level ?? 1
  const maxHp = maxHpFor(level, stats)
  return {
    id: uid('c'),
    name: randomName(),
    gear: {},
    stats,
    level,
    xp: 0,
    hp: maxHp,
    maxHp,
    morale: 0.8,
    assignment: null,
    returnTo: null,
    seed: Math.floor(Math.random() * 1e9),
    dead: false,
    ...overrides,
    // Keep derived values consistent even when overrides set stats/level.
    ...(overrides.maxHp === undefined ? { maxHp } : {}),
    ...(overrides.hp === undefined ? { hp: overrides.maxHp ?? maxHp } : {}),
  }
}

/** Grants xp, applying as many level-ups as the total earns. Mutates a copy. */
export const grantXp = (c: Crew, amount: number): { crew: Crew; levelled: boolean } => {
  let xp = c.xp + amount
  let level = c.level
  let levelled = false
  while (level < 50 && xp >= xpForLevel(level)) {
    xp -= xpForLevel(level)
    level += 1
    levelled = true
  }
  const maxHp = maxHpFor(level, c.stats)
  return {
    crew: { ...c, xp, level, maxHp, hp: levelled ? maxHp : Math.min(c.hp, maxHp) },
    levelled,
  }
}

export const statTotal = (c: Crew): number =>
  STAT_KEYS.reduce((sum, k) => sum + c.stats[k], 0)

/**
 * How good this crew member is at a given job, folding in level, injuries and
 * mood. Both penalties have generous floors — an unhappy, battered station
 * should be slow and miserable, never mathematically doomed.
 */
export const effectiveness = (c: Crew, stat: StatKey): number => {
  // Kit counts. Boarding plate is worth two points of Brawn to whoever is
  // wearing it, whether they are fighting boarders or shifting cargo.
  let issued = 0
  for (const slot of ['sidearm', 'armour'] as const) {
    const id = c.gear?.[slot]
    if (id) issued += ITEM_DEFS[id].bonus?.[stat] ?? 0
  }
  const base = c.stats[stat] + issued + (c.level - 1) * 0.35
  const health = 0.5 + 0.5 * (c.hp / c.maxHp)
  const mood = 0.75 + 0.25 * c.morale
  return base * health * mood
}

/** How many portrait images live in `public/crew`. */
export const PORTRAIT_COUNT = 24

/**
 * Fallback portrait derived from a crew member's seed, for saves written before
 * portraits were dealt out from a pool.
 */
export const portraitIndex = (seed: number): number =>
  (Math.abs(Math.trunc(seed)) % PORTRAIT_COUNT) + 1

/** The portrait someone actually wears: the one they were dealt, or the fallback. */
export const crewPortrait = (who: { portrait?: number; seed: number }): number =>
  who.portrait ?? portraitIndex(who.seed)
