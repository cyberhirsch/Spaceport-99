import { crewPortrait, effectiveness, makeCrew, rollStats, uid } from './crew.ts'
import { makeShip, tradeInValue } from './fleet.ts'
import { FACTION_IDS, STANDING_CEILING, STANDING_FLOOR } from './factions.ts'
import type { Talk, TalkCtx } from './talk.ts'
import type {
  Candidate,
  CandidateOrigin,
  FactionId,
  Prospect,
  GameState,
  Rng,
  Visitor,
} from './types.ts'
import { clamp, log, namesInPlay, PATIENCE_SECONDS, pickOne, roll, roller, SIGN_THRESHOLD } from './core.ts'
import { assign, allocatePortrait, workRate } from './staffing.ts'
import { fleetCapacity } from './rooms.ts'
import { derive } from './state.ts'
import { shift, appeal } from './standing.ts'

// Applicants, faces, offers, and the moment somebody signs on.

/** The best Adaptability among crew staffing a docking port — your recruiter. */
export const recruiterSkill = (s: GameState): number => {
  let best = 0
  for (const m of s.modules.filter((x) => x.kind === 'dock')) {
    for (const id of m.staff) {
      const c = s.crew.find((x) => x.id === id)
      if (c && !c.dead) best = Math.max(best, effectiveness(c, 'A'))
    }
  }
  return best
}

/**
 * What the station looks like to somebody thinking about signing on — not the
 * pitch (that is `appeal`), but the state of the place. A death nobody
 * mentions, an emergency still burning and empty tanks read the same to a
 * recruit as to anybody sizing up a new posting; a clean log, a Lounge and a
 * Gym running, and full stores read the other way. Centred on 0.5 so a
 * perfectly ordinary station leaves the usual numbers alone.
 */
export const stationRecord = (s: GameState): number => {
  const crewById = new Map(s.crew.map((c) => [c.id, c]))
  const deathToll = Math.min(0.35, s.crew.filter((c) => c.dead).length * 0.05)
  const trouble = Math.min(0.3, s.incidents.length * 0.12)
  const d = derive(s)
  const larder =
    (d.caps.food > 0 ? clamp(s.resources.food / d.caps.food, 0, 1) : 0) * 0.5 +
    (d.caps.air > 0 ? clamp(s.resources.air / d.caps.air, 0, 1) : 0) * 0.5
  let comfort = 0
  for (const m of s.modules) {
    if (m.kind !== 'lounge' && m.kind !== 'gym') continue
    if (!m.standby && workRate(m, crewById) > 0) comfort += 0.1
  }
  return clamp(0.5 - deathToll - trouble + larder * 0.2 + Math.min(0.2, comfort), 0, 1)
}

/**
 * Who HQ is likely to send. A patron in good standing sends its own; a cold
 * one, or none, leaves you with whoever is passing.
 */
export const candidateFaction = (s: GameState, rng: Rng): FactionId => {
  const patron = s.patron
  if (!patron) return pickOne(rng, FACTION_IDS)
  const warmth = (s.standing[patron] - STANDING_FLOOR) / (STANDING_CEILING - STANDING_FLOOR)
  const sendsOwn = clamp(0.15 + warmth * 0.7, 0.15, 0.85)
  return rng() < sendsOwn ? patron : pickOne(rng, FACTION_IDS)
}

/**
 * Whether HQ found somebody who wanted the berth or simply filled the slot. A
 * patron that thinks well of the station has people asking to be sent to it; a
 * cold one, or none at all, posts whoever came up next on the list. The
 * difference is the whole conversation: one of them already wants to be here.
 */
export const candidateOrigin = (s: GameState, rng: Rng): CandidateOrigin => {
  const patron = s.patron
  const warmth = patron
    ? (s.standing[patron] - STANDING_FLOOR) / (STANDING_CEILING - STANDING_FLOOR)
    : 0.25
  return rng() < clamp(0.2 + warmth * 0.55, 0.2, 0.75) ? 'applied' : 'posted'
}

/** The stats and standing an applicant is built from — shared by a request and a walk-in. */
const rolledApplicant = (
  s: GameState,
  rng: Rng,
  luck: number,
): { stats: ReturnType<typeof rollStats>; reach: number; faction: FactionId } => {
  const record = stationRecord(s)
  const reach = clamp(
    appeal(s) + (record - 0.5) * 0.3 + luck * 0.02 + (rng() * 0.3 - 0.15),
    0,
    1,
  )
  const stats = rollStats(rng, 6 + Math.round(reach * 8))
  const faction = candidateFaction(s, rng)
  return { stats, reach, faction }
}

/** Someone HQ has picked out, as good as the station deserves. */
export const makeCandidate = (s: GameState, luck: number): Candidate => {
  const rng = roller(s)
  const { stats, reach, faction } = rolledApplicant(s, rng, luck)
  const crew = makeCrew(rng, { stats })
  const origin = candidateOrigin(s, rng)
  return {
    id: uid('a'),
    name: crew.name,
    seed: crew.seed,
    portrait: allocatePortrait(s),
    stats,
    tier: reach,
    faction,
    origin,
    // Someone HQ rates highly knows it, and starts colder on a modest station.
    // Somebody who put in for the berth arrives already wanting it. A posted
    // recruit never negotiates at all, so this figure is only ever read for
    // the ones who asked to come.
    interest: Math.round(clamp(appeal(s) * 70 - reach * 25 + (origin === 'applied' ? 18 : 0), 5, 72)),
    askingBonus: Math.round(60 + reach * 260),
    patience: PATIENCE_SECONDS,
    promised: null,
    arrivesIn: 25 + rng() * 30,
  }
}

/**
 * Somebody off a hull at the Trading Hub who decided to stay rather than fly
 * on. Already aboard, so there is no transit to wait through.
 */
export const makeWalkIn = (s: GameState): Candidate => {
  const rng = roller(s)
  const { stats, reach, faction } = rolledApplicant(s, rng, 0)
  const crew = makeCrew(rng, { stats })
  return {
    id: uid('a'),
    name: crew.name,
    seed: crew.seed,
    portrait: allocatePortrait(s),
    stats,
    tier: reach,
    faction,
    origin: 'walkIn',
    // Already standing on your deck rather than weighing an offer from afar —
    // a walk-in has made most of the decision before you ever meet them.
    interest: Math.round(clamp(appeal(s) * 90 - reach * 15, 20, 85)),
    askingBonus: Math.round(50 + reach * 220),
    patience: PATIENCE_SECONDS,
    promised: null,
    arrivesIn: 0,
  }
}

/** What the player can actually put on the table right now. */
export const bonusOffer = (s: GameState, p: Prospect): number =>
  Math.min(Math.floor(s.credits), p.askingBonus)

/**
 * Money and a promised post move someone who is already looking for a berth.
 * Someone who has one is that much harder to shift — a deckhand can be bought,
 * a ship's master mostly cannot, and only the pitch works on them at full
 * strength. Which is to say: a captain comes down to whether the station is
 * genuinely worth moving to.
 */
export const holdOut = (p: Prospect): number => 1 - (p.grip ?? 0) * 0.55

/**
 * A master does not leave the hull behind. It comes with them if there is a
 * berth for it, and is sold on the dock if there is not.
 */
export const claimHull = (s: GameState, ship: Visitor): void => {
  // She keeps her transponder name, unless something in the fleet already
  // answers to it — one pool serves every hull in the game.
  const clash = s.ships.some((h) => h.name === ship.name)
  const hull = makeShip(roller(s), ship.cls, clash ? undefined : ship.name, namesInPlay(s))
  hull.hull = Math.round(hull.maxHull * (0.6 + roll(s) * 0.25))
  s.visitors = s.visitors.filter((v) => v.id !== ship.id)
  if (s.ships.length < fleetCapacity(s)) {
    s.ships.push(hull)
    log(s, `The ${hull.name} came with them. She is yours.`, 'good')
  } else {
    const paid = tradeInValue(hull)
    s.credits += paid
    log(s, `No berth for the ${hull.name}, so she went dockside. +${paid}c.`, 'info')
  }
}

/**
 * A posted recruit reporting aboard. They are not being hired: the transfer
 * went through before anybody put them on a courier, so nothing said in the
 * conversation decides whether they stay. All that is left is a bunk and a
 * name on the roster — and if the station has not got the bunk, they wait on
 * the dock like anybody else.
 */
export const reportAboard = (s: GameState, talk: Talk, c: TalkCtx): void => {
  const cand = c.candidate
  if (!cand) return
  const d = derive(s)
  if (d.crewAlive.length >= d.crewCap) {
    log(s, `${c.name} is aboard with nowhere to sleep, and waiting on the dock.`, 'warn')
    return
  }
  s.candidates = s.candidates.filter((x) => x.id !== cand.id)
  s.crew.push(
    makeCrew(roller(s), {
      name: c.name,
      stats: cand.stats,
      seed: cand.seed,
      portrait: crewPortrait(cand),
    }),
  )
  talk.flags.push('signed')
  log(s, `${c.name} reported aboard.`, 'good')
}

/**
 * The end of a hiring conversation. Interest is a probability, so a
 * half-convinced spacer is a coin toss — and either way the asking is over.
 * Writes `signed` into the conversation so the closing line can read it back.
 */
export const closeHire = (s: GameState, talk: Talk, c: TalkCtx): void => {
  const p = c.prospect
  if (!p) return
  const d = derive(s)

  // You cannot offer a berth you have not got, so the asking never happens and
  // they stay where they are.
  if (d.crewAlive.length >= d.crewCap) {
    log(s, `${c.name} would come aboard, but there is no bunk free.`, 'warn')
    return
  }

  // Otherwise take them off the list either way: nobody stands there being
  // asked twice.
  if (c.candidate) s.candidates = s.candidates.filter((x) => x.id !== c.candidate!.id)
  if (c.guest && c.ship) c.ship.aboard = c.ship.aboard.filter((g) => g.id !== c.guest!.id)
  if (roll(s) * SIGN_THRESHOLD >= p.interest) {
    log(
      s,
      c.guest && c.ship
        ? `${c.name} thought about it and stayed with the ${c.ship.name}.`
        : `${c.name} turned the contract down and undocked.`,
      'warn',
    )
    return
  }

  const hire = makeCrew(roller(s), {
    name: c.name,
    stats: p.stats,
    seed: p.seed,
    portrait: crewPortrait(c.candidate ?? c.guest ?? { seed: p.seed }),
  })
  s.crew.push(hire)
  if (p.promised) assign(s, hire.id, p.promised)
  talk.flags.push('signed')

  if (c.guest && c.ship) {
    log(s, `${c.name} signed off the ${c.ship.name} and onto the station.`, 'good')
    // Taking someone under contract is noticed. Taking their master is noticed
    // considerably more — and a captain brings the hull with them.
    shift(s, c.ship.faction, c.guest.captain ? -0.05 : -0.015)
    if (c.guest.captain) claimHull(s, c.ship)
  } else {
    log(s, `${c.name} signed on.`, 'good')
  }
}
