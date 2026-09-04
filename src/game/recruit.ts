import { crewPortrait, effectiveness, makeCrew, rollStats, uid } from './crew.ts'
import { makeShip, tradeInValue } from './fleet.ts'
import type { Talk, TalkCtx } from './talk.ts'
import type { Candidate, Prospect, GameState, Visitor } from './types.ts'
import { log, clamp, namesInPlay, PATIENCE_SECONDS, SIGN_THRESHOLD } from './core.ts'
import { assign, allocatePortrait } from './staffing.ts'
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

/** Someone HQ has picked out, as good as the station deserves. */
export const makeCandidate = (s: GameState, luck: number): Candidate => {
  const reach = clamp(appeal(s) + luck * 0.02 + (Math.random() * 0.3 - 0.15), 0, 1)
  const stats = rollStats(6 + Math.round(reach * 8))
  const crew = makeCrew({ stats })
  return {
    id: uid('a'),
    name: crew.name,
    seed: crew.seed,
    portrait: allocatePortrait(s),
    stats,
    tier: reach,
    // Someone HQ rates highly knows it, and starts colder on a modest station.
    interest: Math.round(clamp(appeal(s) * 70 - reach * 25, 5, 60)),
    askingBonus: Math.round(60 + reach * 260),
    patience: PATIENCE_SECONDS,
    promised: null,
    arrivesIn: 25 + Math.random() * 30,
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
  const hull = makeShip(ship.cls, clash ? undefined : ship.name, namesInPlay(s))
  hull.hull = Math.round(hull.maxHull * (0.6 + Math.random() * 0.25))
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
  if (Math.random() * SIGN_THRESHOLD >= p.interest) {
    log(
      s,
      c.guest && c.ship
        ? `${c.name} thought about it and stayed with the ${c.ship.name}.`
        : `${c.name} turned the contract down and undocked.`,
      'warn',
    )
    return
  }

  const hire = makeCrew({
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
