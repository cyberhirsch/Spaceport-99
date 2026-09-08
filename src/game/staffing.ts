import { def, mergeBonus, staffSlots } from './modules.ts'
import { PORTRAIT_COUNT, crewPortrait, effectiveness, grantXp } from './crew.ts'
import { SLOTS, itemDef } from './gear.ts'
import type { Crew, GameState, StatKey, StationModule } from './types.ts'
import { BASE_CREW_CAP, log, pickOne, roller } from './core.ts'

// Who is standing in which room, who is free, and how well they work.

/** Stat points a crew member's kit adds on top of their own. */
export const gearBonus = (c: Crew, stat: StatKey): number => {
  let n = 0
  for (const slot of SLOTS) {
    const id = c.gear?.[slot]
    if (id) n += itemDef(id).bonus?.[stat] ?? 0
  }
  return n
}

/** What one crew member's kit is worth when the station has to defend itself. */
/**
 * The end of somebody. Their kit goes back in the hold for whoever is next,
 * they come off whatever post they held, and the station notices. Everything
 * that kills anyone goes through here, so nothing can half-kill them.
 */
export const killCrew = (s: GameState, c: Crew): void => {
  c.hp = 0
  c.dead = true
  c.returnTo = null
  for (const slot of SLOTS) {
    const worn = c.gear?.[slot]
    if (worn) s.stores[worn] = (s.stores[worn] ?? 0) + 1
  }
  c.gear = {}
  unassign(s, c.id)
  log(s, `${c.name} has died. The station observes a minute of silence.`, 'bad')
}

export const crewGuard = (c: Crew): number => {
  let n = 0
  for (const slot of SLOTS) {
    const id = c.gear?.[slot]
    if (id) n += itemDef(id).guard
  }
  return n
}

/** How fast a room runs, 0 when unstaffed and up to ~1.6 with an elite crew. */
export const workRate = (m: StationModule, crewById: Map<string, Crew>): number => {
  const d = def(m.kind)
  const slots = staffSlots(m)
  if (slots === 0 || m.standby) return 0
  let sum = 0
  for (const id of m.staff) {
    const c = crewById.get(id)
    if (c && !c.dead) sum += effectiveness(c, d.stat)
  }
  if (sum <= 0) return 0
  // A full crew of rookies runs a room at about 100%; veterans push it towards 180%.
  return Math.min(1.8, (0.3 + sum / (slots * 3)) * m.condition)
}

export const unassign = (s: GameState, crewId: string, remember = false): void => {
  const c = s.crew.find((x) => x.id === crewId)
  if (!c || !c.assignment) return
  const m = s.modules.find((x) => x.id === c.assignment)
  if (m) m.staff = m.staff.filter((id) => id !== crewId)
  // A drafted hand keeps pointing at their *original* station, not at the
  // room they were pulled into.
  c.returnTo = remember ? (c.returnTo ?? c.assignment) : null
  c.assignment = null
}

export const assign = (s: GameState, crewId: string, moduleId: string): boolean => {
  const c = s.crew.find((x) => x.id === crewId)
  const m = s.modules.find((x) => x.id === moduleId)
  if (!c || !m || c.dead) return false
  // Someone light-minutes away cannot take a shift here.
  if (awayCrewIds(s).has(crewId)) return false
  if (m.staff.length >= staffSlots(m) && !m.staff.includes(crewId)) return false
  // Sending someone into a room that is on fire is a temporary posting. Note
  // the station they walked away from so they can walk back to it afterwards.
  const emergency = s.incidents.some((i) => i.moduleId === m.id)
  const previous = emergency ? (c.returnTo ?? (c.assignment === m.id ? null : c.assignment)) : null
  unassign(s, crewId)
  m.staff.push(crewId)
  c.assignment = m.id
  c.returnTo = previous
  return true
}

/**
 * Greedy best-fit: every open slot goes to whoever is strongest for that job.
 * Rooms with an emergency in them are skipped — feeding fresh crew into a fire
 * is a decision for the player to make deliberately, not a default.
 */
export const autoAssignInto = (s: GameState): number => {
  let moved = 0
  const jobs = s.modules
    .filter(
      (m) => staffSlots(m) > 0 && !m.standby && !s.incidents.some((i) => i.moduleId === m.id),
    )
    .sort((a, b) => jobPriority(s, a) - jobPriority(s, b))
  const free = new Set(idleCrew(s).map((c) => c.id))
  for (const m of jobs) {
    const stat = def(m.kind).stat
    while (m.staff.length < staffSlots(m) && free.size > 0) {
      let best: Crew | null = null
      for (const id of free) {
        const c = s.crew.find((x) => x.id === id)
        if (!c) continue
        if (!best || effectiveness(c, stat) > effectiveness(best, stat)) best = c
      }
      if (!best) break
      free.delete(best.id)
      if (assign(s, best.id, m.id)) moved += 1
    }
  }

  // Second pass: a room nobody is standing in is not a room.
  //
  // A founding station has exactly enough people to fill the four rooms it
  // comes with, so the first thing built after that — the Comms Array, usually
  // — is a post nobody will ever take. Left alone that is a dead end: asking
  // HQ for crew needs somebody on that desk, and there is never anybody spare
  // to put there. So an empty room may take the *second* person out of a room
  // that has two. Nothing is ever stripped to nobody, and a donor keeps working
  // at the reduced rate, which is a trade a player would make and could not
  // otherwise ask for.
  for (const m of jobs) {
    if (m.staff.length > 0) continue
    const mine = jobPriority(s, m)
    // Only the posts that decide whether the station has a future are worth
    // taking somebody off another job for. A Lounge can wait for a volunteer.
    if (mine > ESSENTIAL) continue
    const donor = [...jobs]
      .filter((x) => x.id !== m.id && x.staff.length > 1)
      .sort((a, b) => jobPriority(s, b) - jobPriority(s, a))[0]
    if (!donor) continue
    const spare = donor.staff[donor.staff.length - 1]
    if (!spare) continue
    unassign(s, spare)
    if (assign(s, spare, m.id)) moved += 1
  }
  return moved
}

/**
 * Priorities at or below this are worth taking somebody off another job for:
 * the three life-support rooms, and the comms desk while the station is short
 * of its own bunks. Everything else waits for somebody to be free.
 */
export const ESSENTIAL = 3

/**
 * Life support first, then the road out, then money, then training.
 *
 * The Comms Array is the exception that has to be spelled out. It looks like an
 * ordinary earner, so a greedy sort leaves it empty whenever there are more
 * rooms than people — and an empty comms desk is the one thing that cannot be
 * recovered from by waiting, because asking HQ for crew is the only way a
 * station grows and it needs somebody sitting there to do it. A station short
 * of its own bunks staffs that desk before it staffs anything but air.
 */
export const jobPriority = (s: GameState, m: StationModule): number => {
  const d = def(m.kind)
  if (d.produces === 'power') return 0
  if (d.produces === 'air') return 1
  if (d.produces === 'food') return 2
  if (m.kind === 'comms') {
    const alive = s.crew.filter((c) => !c.dead).length
    return alive < crewCapOf(s) ? 3 : 8
  }
  if (d.heals) return 4
  if (d.credits) return 5
  if (d.berths) return 6
  return 9
}

/**
 * Bunks aboard, without going through `derive` — this runs inside the
 * assignment sort, and `derive` is a layer above it.
 */
const crewCapOf = (s: GameState): number =>
  BASE_CREW_CAP +
  s.modules.reduce(
    (n, m) => n + (def(m.kind).crewCapacity ?? 0) * m.width * m.level * mergeBonus(m),
    0,
  )

/** Grants xp to one crew member by id. */
export const awardXpTo = (s: GameState, id: string, amount: number): void => {
  const idx = s.crew.findIndex((c) => c.id === id)
  if (idx < 0 || s.crew[idx].dead) return
  const { crew, levelled } = grantXp(s.crew[idx], amount)
  s.crew[idx] = crew
  if (levelled) log(s, `${crew.name} reached level ${crew.level}.`, 'good')
}

export const trainingSeconds = (m: StationModule, crewById: Map<string, Crew>): number => {
  const stat = def(m.kind).trains
  if (!stat) return 0
  let worst = 1
  for (const id of m.staff) {
    const c = crewById.get(id)
    if (c) worst = Math.max(worst, c.stats[stat])
  }
  // Each point of a stat takes noticeably longer than the last.
  return (26 + worst * 16) / (m.level * mergeBonus(m))
}

export const awardXp = (s: GameState, m: StationModule, amount: number): void => {
  for (const id of m.staff) {
    const idx = s.crew.findIndex((c) => c.id === id)
    if (idx < 0 || s.crew[idx].dead) continue
    const { crew, levelled } = grantXp(s.crew[idx], amount)
    s.crew[idx] = crew
    if (levelled) log(s, `${crew.name} reached level ${crew.level}.`, 'good')
  }
}

/**
 * Everyone currently off the station on a job. Launching clears their posting,
 * so without this they look exactly like idle crew to anything that assigns.
 */
export const awayCrewIds = (s: GameState): Set<string> =>
  new Set(s.missions.flatMap((m) => (m.status === 'flying' ? m.crewIds : [])))

export const isAway = (s: GameState, crewId: string): boolean => awayCrewIds(s).has(crewId)

/** Crew not already flying, dead, or otherwise spoken for. */
export const availableCrew = (s: GameState): Crew[] => {
  const away = awayCrewIds(s)
  return s.crew.filter((c) => !c.dead && !away.has(c.id))
}

/** Crew on the station and not posted to a room. */
export const idleCrew = (s: GameState): Crew[] =>
  availableCrew(s).filter((c) => !c.assignment)

/**
 * Deals out a face nobody is wearing. Portraits only start repeating once every
 * one of them is spoken for, and then the least-worn goes next — so a station of
 * six has six distinct faces rather than whatever the dice happened to give.
 */
/**
 * Deals the least-worn face on the station. `alsoWorn` covers faces spoken for
 * but not yet in the state — a boarding party built one guest at a time.
 */
export const allocatePortrait = (s: GameState, alsoWorn: number[] = []): number => {
  const worn = new Map<number, number>()
  for (let i = 1; i <= PORTRAIT_COUNT; i += 1) worn.set(i, 0)
  const tally = (n: number) => worn.set(n, (worn.get(n) ?? 0) + 1)
  for (const c of s.crew) tally(crewPortrait(c))
  for (const cand of s.candidates) tally(crewPortrait(cand))
  for (const v of s.visitors) for (const g of v.aboard) if (g.portrait) tally(g.portrait)
  for (const n of alsoWorn) tally(n)
  const fewest = Math.min(...worn.values())
  const spare = [...worn.entries()].filter(([, n]) => n === fewest).map(([i]) => i)
  return pickOne(roller(s), spare)
}
