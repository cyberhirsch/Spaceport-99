import { effectiveness, randomName, uid } from './crew.ts'
import { itemDef } from './gear.ts'
import { adjacentModules } from './hazards.ts'
import { def } from './modules.ts'
import { claimHull } from './recruit.ts'
import { cellsAboard, defence } from './rooms.ts'
import { assign, awardXp, crewGuard, isAway, killCrew, unassign } from './staffing.ts'
import { shift } from './standing.ts'
import { holdRoom } from './state.ts'
import type { Boarder, GameState, ItemId, StationModule, Visitor } from './types.ts'
import { clamp, log, pickOne, roll, roller, spread } from './core.ts'

/**
 * Pirates.
 *
 * They are not weather. They come on a hull, they come through the lock, and
 * then they are people standing in one of your rooms with a reason to be there
 * — which means they can be fought, and fought people die, run, or give up.
 *
 * The battery and the shield decide how many make it aboard. Whoever is
 * standing in the room they land in decides what happens next, with a
 * sidearm counting for as much as a good Reflex score. Nobody is pulled out
 * for you: a defender who keeps the door at low hp can die on it, which is the
 * one thing a fire never did. What is left when the party is finished is
 * theirs — the kit off the dead, the credits in their pockets, the survivors in
 * your cells if you have any, and the hull on the clamps with nobody left to
 * fly her.
 */

/** How long a party will keep looting an empty station before it leaves with what it has. */
export const BOARDING_PATIENCE = 180
/** Seconds a party spends in a room nobody is defending before it pushes on. */
const PUSH_ON_AFTER = 40
/** A defender this hurt steps back — if somebody else is still on the door. */
const FALL_BACK_AT = 0.2

/** What they brought, and so what they leave behind. */
const armedWith = (s: GameState): ItemId | null => {
  const r = roll(s)
  if (r < 0.5) return 'sidearm'
  if (r < 0.62) return 'lance'
  if (r < 0.72) return 'torch'
  return null
}

/** Somewhere for them to be: the port they came through, or failing that any room. */
const landing = (s: GameState): StationModule | undefined =>
  s.modules.find((m) => m.kind === 'dock' && !m.standby) ??
  s.modules.find((m) => m.kind === 'dock') ??
  s.modules.find((m) => m.kind !== 'spine')

/**
 * They come through the lock — or do not. Guns and shields work here, before
 * anybody is aboard; small arms work in the room afterwards. A station that
 * plainly outguns them is not boarded at all.
 */
export const beginBoarding = (s: GameState, v: Visitor): void => {
  const d = defence(s)
  const force = v.force ?? 12
  const held = d.guns + d.shield * 0.7
  const room = landing(s)
  if (held > force * 1.6 || !room) {
    v.intent = undefined
    v.status = 'requesting'
    v.timer = 0
    log(s, `${v.name} looked at the station's guns and thought better of it.`, 'good')
    return
  }
  const through = clamp(1 - held / (held + force), 0.15, 1)
  const count = Math.max(1, Math.round((2 + force / 8) * through))
  const brought = Math.max(count, Math.round(2 + force / 8))
  const boarders: Boarder[] = []
  for (let i = 0; i < count; i += 1) {
    const maxHp = Math.round(spread(roller(s), 14, 24) * (1 + force / 40))
    boarders.push({ id: uid('b'), name: randomName(roller(s)), hp: maxHp, maxHp, kit: armedWith(s) })
  }
  v.intent = 'boarding'
  v.status = 'docked'
  v.timer = 0
  s.boarding = {
    shipId: v.id,
    moduleId: room.id,
    boarders,
    size: count,
    moveIn: PUSH_ON_AFTER,
    looted: 0,
    killed: 0,
    lost: 0,
    startedAt: s.elapsed,
  }
  log(
    s,
    brought > count
      ? `${v.name} put a party through the lock. The battery cut it to ${count} before it was aboard — they are in the ${def(room.kind).name}.`
      : `${v.name} put ${count} through the lock unopposed. They are in the ${def(room.kind).name}.`,
    'bad',
  )
}

/** Whoever is standing in the room, alive, and not on a hull somewhere else. */
const defendersOf = (s: GameState, room: StationModule) =>
  s.crew.filter((c) => !c.dead && c.assignment === room.id && !isAway(s, c.id))

/** How it finished, in the log, and what it left behind. */
const endBoarding = (s: GameState, how: 'wiped' | 'escaped'): void => {
  const b = s.boarding
  if (!b) return
  const hull = s.visitors.find((v) => v.id === b.shipId)
  s.boarding = null
  if (how === 'escaped') {
    if (hull) {
      hull.intent = undefined
      hull.status = 'requesting'
      hull.timer = 0
      shift(s, hull.faction, -0.06)
    }
    log(
      s,
      `The boarders went back up the lock with ${Math.round(b.looted)}c and left. ${b.killed} of them did not.`,
      'warn',
    )
    return
  }
  log(
    s,
    b.lost > 0
      ? `The boarding party is finished. ${b.killed} dead, and ${b.lost} of ours with them.`
      : `The boarding party is finished. ${b.killed} dead and nobody of ours.`,
    b.lost > 0 ? 'warn' : 'good',
  )
  // The hull is still on the clamps and nobody is coming back to fly her.
  if (hull) {
    shift(s, hull.faction, -0.06)
    log(s, `${hull.name} is still on the clamps with nobody left aboard.`, 'info')
    claimHull(s, hull)
  }
}

/** A boarder goes down, and what they were carrying goes on the deck. */
const boarderDown = (s: GameState, room: StationModule, dead: Boarder): void => {
  const b = s.boarding!
  b.boarders = b.boarders.filter((x) => x.id !== dead.id)
  b.killed += 1
  const pocket = Math.round(spread(roller(s), 8, 30))
  s.credits += pocket
  awardXp(s, room, 6)
  if (dead.kit && holdRoom(s) > 0) {
    s.stores[dead.kit] = (s.stores[dead.kit] ?? 0) + 1
    log(s, `${dead.name} is down. A ${itemDef(dead.kit).name} and ${pocket}c off the body.`, 'good')
  } else {
    log(s, `${dead.name} is down. ${pocket}c off the body.`, 'good')
  }
}

/**
 * What is left of a beaten party gives up, if there is anywhere to put them.
 * Otherwise they fight it out, and the cells are the reason to build a Brig.
 */
const surrender = (s: GameState, room: StationModule): boolean => {
  const b = s.boarding!
  const free = cellsAboard(s) - s.prisoners.length
  if (free <= 0) return false
  const hull = s.visitors.find((v) => v.id === b.shipId)
  const taken = b.boarders.slice(0, free)
  for (const p of taken) {
    s.prisoners.push({
      id: uid('p'),
      name: p.name,
      faction: hull?.faction ?? 'unlisted',
      charge: 'boarding the station under arms',
      hull: hull?.name ?? 'an unlisted hull',
      stats: { O: 2, R: 5, B: 4, I: 2, T: 3, A: 1, L: 3 },
      seed: Math.floor(roll(s) * 1e9),
      held: 0,
    })
    if (p.kit) {
      if (holdRoom(s) > 0) s.stores[p.kit] = (s.stores[p.kit] ?? 0) + 1
    }
  }
  b.boarders = b.boarders.filter((x) => !taken.includes(x))
  awardXp(s, room, 10 * taken.length)
  log(
    s,
    `${taken.length === 1 ? `${taken[0].name} threw down a weapon` : `${taken.length} of them threw down their weapons`}. Into the cells.`,
    'good',
  )
  return b.boarders.length === 0
}

/** One second of a boarding. */
export const stepBoarding = (s: GameState, dt: number, offline = false): void => {
  const b = s.boarding
  if (!b) return
  let room = s.modules.find((m) => m.id === b.moduleId)
  if (!room) {
    room = landing(s)
    if (!room) return endBoarding(s, 'escaped')
    b.moduleId = room.id
  }
  const defenders = defendersOf(s, room)

  if (defenders.length === 0) {
    // Nobody in their way: they take what they can carry and wreck what they cannot.
    const n = b.boarders.length
    const take = Math.min(s.credits, 2.2 * n * dt)
    s.credits -= take
    b.looted += take
    room.condition = clamp(room.condition - 0.01 * n * dt, 0.15, 1)
    b.moveIn -= dt
    if (b.moveIn <= 0) {
      b.moveIn = PUSH_ON_AFTER
      const next = adjacentModules(s, room)
      if (next.length > 0) {
        const to = pickOne(roller(s), next)
        b.moduleId = to.id
        log(s, `The boarders moved on to the ${def(to.kind).name}. Nobody was in their way.`, 'bad')
      }
    }
    if (s.elapsed - b.startedAt >= BOARDING_PATIENCE) endBoarding(s, 'escaped')
    return
  }

  // A fight. Defenders concentrate on whoever is closest to going down;
  // boarders spread themselves across whoever is standing in front of them.
  const target = [...b.boarders].sort((x, y) => x.hp - y.hp)[0]
  let hit = 0
  for (const c of defenders) {
    hit += (0.35 + effectiveness(c, 'R') * 0.9 + crewGuard(c) * 0.12) * dt
  }
  target.hp -= hit
  room.condition = clamp(room.condition - 0.004 * dt, 0.15, 1)

  const dealt = b.boarders.reduce((n, x) => n + 0.9 + (x.kit ? itemDef(x.kit).guard * 0.15 : 0), 0)
  const each = (dealt / defenders.length) * dt
  for (const c of defenders) {
    // Kit takes the edge off. Plate is worth wearing on the door.
    c.hp -= Math.max(0.2, each - crewGuard(c) * 0.08 * dt)
    if (c.hp <= 0) {
      // A boarding is a setback, never the end of the run: the last living
      // crew member is dragged clear of the door rather than killed on it. And
      // nobody dies while the station is catching up on time away, same as
      // anywhere else — they come back to a wounded defender, not a grave.
      if (offline || s.crew.filter((x) => !x.dead).length <= 1) {
        c.hp = 1
        unassign(s, c.id, true)
        log(s, `${c.name} was dragged clear of the ${def(room.kind).name}.`, 'bad')
        continue
      }
      // Otherwise not pulled out for them: the door was theirs and they kept it.
      b.lost += 1
      log(s, `${c.name} went down on the door of the ${def(room.kind).name}.`, 'bad')
      killCrew(s, c)
      continue
    }
    // Hurt enough to step back — if somebody else is still standing there.
    if (c.hp < c.maxHp * FALL_BACK_AT && defenders.filter((x) => x.hp > 0).length > 1) {
      unassign(s, c.id, true)
      log(s, `${c.name} fell back from the ${def(room.kind).name}, bleeding.`, 'warn')
    }
  }

  if (target.hp <= 0) {
    boarderDown(s, room, target)
    if (b.boarders.length === 0) return endBoarding(s, 'wiped')
    // Down to a third and losing: what is left gives up, if there is a cell.
    if (b.boarders.length <= Math.ceil(b.size / 3) && surrender(s, room)) {
      return endBoarding(s, 'wiped')
    }
  }
}

/** Anyone who fell back and has patched up walks back to the fight. */
export const rejoinBoarding = (s: GameState): void => {
  const b = s.boarding
  if (!b) return
  for (const c of s.crew) {
    if (c.dead || c.assignment || c.returnTo !== b.moduleId || c.hp < c.maxHp * 0.5) continue
    assign(s, c.id, b.moduleId)
  }
}
