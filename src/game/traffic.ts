import { randomName, rollStats, uid } from './crew.ts'
import { beginTalk } from './talk.ts'
import { PATRONS, factionDef } from './factions.ts'
import { makeMission } from './fleet.ts'
import { makeGuests, makeVisitor } from './visitors.ts'
import type { FactionId, Prisoner, GameState, Guest, Visitor } from './types.ts'
import { log, clamp, namesInPlay } from './core.ts'
import { allocatePortrait } from './staffing.ts'
import { defence, cellsAboard } from './rooms.ts'
import { derive } from './state.ts'
import { startIncident } from './hazards.ts'
import { shift, appeal } from './standing.ts'
import { rollFar } from './missions.ts'

// Hulls at the clamps: admitting them, arresting off them, and the one that is not asking.

/**
 * Take somebody off a hull and put them in the cells.
 *
 * They keep their name, their face and whose paper they were flying, because
 * all three matter later: a prisoner is somebody you hand over, let go, or talk
 * into staying, and every one of those is a different conversation.
 */
export const arrest = (s: GameState, v: Visitor, charge: string): boolean => {
  if (s.prisoners.length >= cellsAboard(s)) {
    log(s, `Nowhere to put them. Every cell is full.`, 'warn')
    return false
  }
  // Whoever came down the gangway first is who your people get hold of.
  const taken = v.aboard[0]
  const seed = taken?.seed ?? Math.floor(Math.random() * 1e9)
  s.prisoners.push({
    id: uid('p'),
    name: taken?.name ?? randomName(),
    faction: v.faction,
    charge,
    hull: v.name,
    stats: taken?.stats ?? rollStats(6),
    seed,
    portrait: taken?.portrait ?? allocatePortrait(s),
    held: 0,
  })
  if (taken) v.aboard = v.aboard.filter((g) => g.id !== taken.id)
  return true
}

/** Somebody in the cells, or null if they are no longer there. */
export const prisonerById = (s: GameState, id: string): Prisoner | null =>
  s.prisoners.find((p) => p.id === id) ?? null

/** Brings a hull alongside and finds out what was actually aboard. */
export const admitVisitor = (s: GameState, v: Visitor): void => {
  const caps = derive(s).caps
  v.status = 'docked'
  v.timer = 45 + Math.random() * 60
  // The hull stays at the clamps; the people walk onto your decks. Whatever
  // the ship was carrying to raise with you, one of them now raises it. A
  // smuggler's crew still come ashore — being dodgy is not being hostile — but
  // a raider sends no one friendly. It sends a fight.
  if (v.kind !== 'raider') {
    const dealt: number[] = []
    v.aboard = makeGuests(v, () => {
      const face = allocatePortrait(s, dealt)
      dealt.push(face)
      return face
    })
  }
  v.offer = null
  const dock = s.modules.find((m) => m.kind === 'dock' && !m.standby)

  switch (v.kind) {
    case 'trader': {
      const paid = Math.round(60 + Math.random() * 140)
      s.credits += paid
      for (const key of ['power', 'air', 'food'] as const) {
        s.resources[key] = clamp(s.resources[key] + Math.round(20 + Math.random() * 50), 0, caps[key])
      }
      log(s, `${v.name} berthed and sold off a hold. +${paid}c and cargo.`, 'good')
      break
    }
    case 'courier': {
      const paid = Math.round(90 + Math.random() * 120)
      s.credits += paid
      // Couriers carry paper, which sometimes means work.
      if (s.missions.filter((m) => m.status === 'offered').length < 3) {
        s.missions.push(makeMission(appeal(s), { far: rollFar(s) }))
        log(s, `${v.name} dropped a contract and a bill. +${paid}c.`, 'good')
      } else {
        log(s, `${v.name} dropped the mail. +${paid}c.`, 'good')
      }
      break
    }
    case 'patrol': {
      const paid = Math.round(50 + Math.random() * 90)
      s.credits += paid
      shift(s, v.faction, 0.01)
      log(s, `${v.name} took a berth and left the lane a little safer. +${paid}c.`, 'good')
      break
    }
    case 'drifter': {
      // Helping costs supplies now and buys goodwill that pays later.
      const given = Math.round(30 + Math.random() * 40)
      for (const key of ['air', 'food'] as const) {
        s.resources[key] = Math.max(0, s.resources[key] - given)
      }
      shift(s, v.faction, 0.04)
      // Sheltering a hull with no registration is not a crime. The
      // Confederation still minutes it.
      if (v.faction === 'unlisted') shift(s, 'terran', -0.01)
      log(s, `${v.name} was taken in and resupplied. Word gets around.`, 'good')
      break
    }
    case 'smuggler': {
      const stolen = Math.round(Math.min(s.credits, 40 + Math.random() * 120))
      s.credits -= stolen
      if (dock) startIncident(s, 'vermin', dock)
      log(s, `${v.name} was not carrying what the manifest said. -${stolen}c.`, 'bad')
      break
    }
    case 'raider': {
      if (dock) startIncident(s, 'pirates', dock)
      log(s, `${v.name} opened fire the moment the clamps had her.`, 'bad')
      break
    }
  }
}

/** How many ships can be at the clamps at once, waiting or berthed. */
/** Where a hull is in its visit, for the traffic board. */
export const visitorPhase = (v: Visitor): 'inbound' | 'hailing' | 'docked' | 'departing' =>
  v.status === 'inbound'
    ? 'inbound'
    : v.status === 'requesting'
      ? 'hailing'
      : v.timer <= 15
        ? 'departing'
        : 'docked'

export const PHASE_LABEL: Record<ReturnType<typeof visitorPhase>, string> = {
  inbound: 'inbound',
  hailing: 'asking',
  docked: 'docked',
  departing: 'leaving',
}

/** Everyone currently walking the station off a berthed hull. */
export const guestsAboard = (s: GameState): { guest: Guest; ship: Visitor }[] =>
  s.visitors.flatMap((v) => v.aboard.map((guest) => ({ guest, ship: v })))

/** The guest, and the hull they came in on. */
export const guestAboard = (
  s: GameState,
  guestId: string,
): { guest: Guest; ship: Visitor } | null => {
  const ship = s.visitors.find((v) => v.aboard.some((g) => g.id === guestId))
  const guest = ship?.aboard.find((g) => g.id === guestId)
  return ship && guest ? { guest, ship } : null
}

/**
 * How long a station gets to be its own before somebody comes for it. There is
 * no warning bar and no diplomacy that heads this off: a place worth taking
 * eventually gets taken, and the only question is what you do when the hull is
 * already alongside.
 *
 * It cannot happen to a station too small to be worth the fuel, and it will
 * not happen twice in a row without a long quiet stretch in between.
 */
export const CONQUEST_EARLIEST = 45 * 60

export const CONQUEST_GAP = 40 * 60

/** Whether the station is worth somebody's trouble yet. */
export const worthTaking = (s: GameState): boolean => {
  const d = derive(s)
  return s.modules.length >= 10 && d.crewAlive.length >= 8
}

/**
 * Who would come. The powers whose paper you do not fly, weighted towards
 * whoever likes you least — being disliked is what makes a station a target.
 */
export const wouldCome = (s: GameState): FactionId | null => {
  const pool = PATRONS.filter((id) => id !== s.patron)
  if (pool.length === 0) return null
  const weights = pool.map((id) => Math.max(0.05, 0.25 - s.standing[id]))
  const total = weights.reduce((a, b) => a + b, 0)
  let roll = Math.random() * total
  for (let i = 0; i < pool.length; i += 1) {
    roll -= weights[i]
    if (roll <= 0) return pool[i]
  }
  return pool[0]
}

/** A hull that is not asking. It is alongside by the time you read the hail. */
export const sendConqueror = (s: GameState, who: FactionId): void => {
  const d = defence(s)
  const hull = makeVisitor(namesInPlay(s))
  hull.kind = 'patrol'
  hull.claim = 'patrol'
  hull.faction = who
  hull.suspicion = 1
  hull.cls = 'cutter'
  hull.status = 'docked'
  hull.aboard = []
  hull.offer = null
  hull.intent = 'conquest'
  // What they brought scales with what they can see you have, so a well-armed
  // station is threatened by something that can plausibly beat it.
  hull.force = Math.round(14 + (d.guns + d.shield * 0.7) * (0.75 + Math.random() * 0.6))
  hull.timer = 600
  s.visitors.push(hull)
  s.talk = beginTalk('conquest', { kind: 'visitor', id: hull.id }, hull.name)
  log(
    s,
    `${hull.name} is alongside without asking. ${factionDef(who).name} colours.`,
    'bad',
  )
}
