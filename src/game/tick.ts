import { cycleCredits, cycleYield, def, mergeBonus, staffSlots } from './modules.ts'
import { MAX_STAT, effectiveness } from './crew.ts'
import { incidentDef } from './incidents.ts'
import { SLOTS, itemDef } from './gear.ts'
import { rollCall, unattended } from './calls.ts'
import { ITEM_SPEC, specDef } from './specs.ts'
import { factionDef } from './factions.ts'
import { makeMission, type MissionOpts, OPEN_HAUL_PER_MINUTE, OPEN_STRAIN_PER_MINUTE } from './fleet.ts'
import { makeVisitor } from './visitors.ts'
import { makeWalkIn } from './recruit.ts'
import { lostHull } from './quest.ts'
import type { Crew, ModuleDef, GameState, ResourceKey, StationModule } from './types.ts'
import {
  AIR_PER_CREW,
  APPROACH_GAP,
  CLAIM_AFTER,
  clamp,
  FOOD_PER_CREW,
  log,
  LOITER_GAP,
  MAX_CATCHUP_SECONDS,
  namesInPlay,
  pickOne,
  roll,
  roller,
} from './core.ts'
import {
  autoAssignInto,
  crewGuard,
  workRate,
  unassign,
  assign,
  trainingSeconds,
  awardXp,
} from './staffing.ts'
import {
  dockingFees,
  cellsAboard,
  commerce,
  dockBerths,
  recycled,
  openSpecs,
  researchRate,
  fabRate,
  visitorBerths,
  autoAccepting,
} from './rooms.ts'
import { derive, type Derived } from './state.ts'
import { adjacentModules, incidentCap, startIncident, rollIncident } from './hazards.ts'
import { shift, appeal } from './standing.ts'
import { answerCall, inContact, questBearing, resolveMission, rollFar } from './missions.ts'
import {
  admitVisitor,
  CONQUEST_EARLIEST,
  CONQUEST_GAP,
  questBeat,
  raiseDemand,
  resolveRaid,
  sendApproach,
  sendClaimant,
  sendConqueror,
  sendLevy,
  sendLoiter,
  worthLeaningOn,
  worthSounding,
  worthTaking,
  wouldCome,
} from './traffic.ts'

// One second of the station, and the loop that runs many of them.

/**
 * How much of a room keeps running during a brownout. Reactors are self-powered,
 * life support falls back to emergency cells, and everything else limps along —
 * a dark station should be recoverable, not an automatic wipe.
 */
export const gridFactorFor = (md: ModuleDef, grid: number): number => {
  if (md.produces === 'power') return 1
  if (md.produces === 'air' || md.produces === 'food' || md.heals) return Math.max(0.6, grid)
  return Math.max(0.35, grid)
}

/**
 * Values several sections of the tick share: who is aboard, what the station
 * can support this second, and what state life support is in. Built once at
 * the top of `step` and filled in as the sections that own each figure run.
 */
interface TickCtx {
  crewById: Map<string, Crew>
  derived: Derived
  alive: Crew[]
  /** Fraction of demand the reactor could actually cover this tick. */
  grid: number
  brownout: boolean
  starving: boolean
  suffocating: boolean
  healRate: number
}

/** Power grid: draws the tick's demand from storage, or brings on a brownout. */
const stepPowerGrid = (s: GameState, dt: number, ctx: TickCtx): void => {
  const demand = ctx.derived.draw * dt
  if (demand > 0) {
    if (s.resources.power >= demand) {
      s.resources.power -= demand
    } else {
      ctx.grid = s.resources.power / demand
      s.resources.power = 0
    }
  }
  ctx.brownout = ctx.grid < 0.999
}

/** Production: every room with a cycle advances it, and pays out on completion. */
const stepProduction = (s: GameState, dt: number, ctx: TickCtx): void => {
  const d = ctx.derived
  for (const m of s.modules) {
    const md = def(m.kind)
    const cycle = md.cycleSeconds ?? (md.trains ? trainingSeconds(m, ctx.crewById) : 0)
    if (!cycle) {
      // Passive rooms (quarters, cargo) still earn their crew a little xp.
      if (m.staff.length > 0) awardXp(s, m, 0.25 * dt)
      continue
    }
    const rate = workRate(m, ctx.crewById) * gridFactorFor(md, ctx.grid)
    if (rate <= 0) continue
    m.progress += (dt / cycle) * rate
    m.rushRisk = Math.max(0.15, m.rushRisk - dt * 0.004)
    while (m.progress >= 1) {
      m.progress -= 1
      completeCycle(s, m, d.caps)
    }
  }
}

/** Life support: air and food drain with the crew, clamped to what the station can hold. */
const stepLifeSupport = (s: GameState, dt: number, ctx: TickCtx): void => {
  const d = ctx.derived
  s.resources.power = clamp(s.resources.power, 0, d.caps.power)
  const kept = 1 - recycled(s)
  s.resources.air = clamp(
    s.resources.air - ctx.alive.length * AIR_PER_CREW * kept * dt,
    0,
    d.caps.air,
  )
  s.resources.food = clamp(
    s.resources.food - ctx.alive.length * FOOD_PER_CREW * kept * dt,
    0,
    d.caps.food,
  )
  ctx.starving = s.resources.food <= 0
  ctx.suffocating = s.resources.air <= 0
}

/** Med bay: a staffed autodoc heals everyone aboard, and idle air/food gives a trickle for free. */
const stepMedBay = (s: GameState, ctx: TickCtx): void => {
  let healRate = 0
  for (const m of s.modules) {
    const md = def(m.kind)
    if (!md.heals) continue
    healRate +=
      md.heals *
      m.width *
      m.level *
      mergeBonus(m) *
      workRate(m, ctx.crewById) *
      Math.max(0.6, ctx.grid)
  }
  if (!ctx.starving && !ctx.suffocating) healRate += 0.15
  ctx.healRate = healRate
}

/**
 * The engineering bay: works the worst room on the station back towards sound.
 * It is one party, so its attention goes where the damage is deepest — which
 * means equally battered rooms come up together.
 */
const stepEngineeringBay = (s: GameState, dt: number, ctx: TickCtx): void => {
  let repairRate = 0
  for (const m of s.modules) {
    const md = def(m.kind)
    if (!md.repairs || m.standby) continue
    repairRate +=
      md.repairs *
      m.width *
      m.level *
      mergeBonus(m) *
      workRate(m, ctx.crewById) *
      Math.max(0.6, ctx.grid)
  }
  if (repairRate <= 0) return
  const worst = s.modules
    .filter((m) => m.condition < 1 && !s.incidents.some((i) => i.moduleId === m.id))
    .sort((a, b) => a.condition - b.condition)[0]
  if (!worst) return
  const was = worst.condition
  worst.condition = clamp(worst.condition + repairRate * dt, 0.2, 1)
  if (was < 1 && worst.condition >= 1) {
    log(s, `${def(worst.kind).name} repaired to sound.`, 'good')
  }
}

/**
 * The research lab: a recovered spec is a stack of somebody else's paper. The
 * lab turns it into something the station can actually build. Nothing else
 * does, and it only works on one at a time.
 */
const stepResearchLab = (s: GameState, dt: number, ctx: TickCtx): void => {
  if (!s.researching) return
  const id = s.researching
  if ((s.specs[id] ?? 0) >= 1) {
    s.researching = null
    return
  }
  const rate = researchRate(s, ctx.crewById) * Math.max(0.6, ctx.grid)
  if (rate <= 0) return
  const sd = specDef(id)
  s.specs[id] = Math.min(1, (s.specs[id] ?? 0) + (rate / sd.effort) * dt)
  if (s.specs[id]! < 1) return
  s.researching = null
  const what =
    sd.unlocks.kind === 'module'
      ? `${def(sd.unlocks.module).name} can be built.`
      : `${itemDef(sd.unlocks.item).name} can be run off in the Fab Shop.`
  log(s, `${sd.name} worked out. ${what}`, 'good')
  const next = openSpecs(s)[0]
  if (next) {
    s.researching = next
    log(s, `The lab moved on to ${specDef(next).name}.`, 'info')
  }
}

/** The Fab Shop: runs one item off at a time from whatever spec unlocked it. */
const stepFabShop = (s: GameState, dt: number, ctx: TickCtx): void => {
  if (!s.fabricating) return
  const spec = ITEM_SPEC[s.fabricating.item]
  const build = spec ? specDef(spec).build : undefined
  if (!build) {
    s.fabricating = null
    return
  }
  const rate = fabRate(s, ctx.crewById) * Math.max(0.6, ctx.grid)
  s.fabricating.progress += (rate / build.seconds) * dt
  if (s.fabricating.progress >= 1) {
    const item = s.fabricating.item
    s.stores[item] = (s.stores[item] ?? 0) + 1
    s.fabricating = null
    log(s, `The Fab Shop finished a ${itemDef(item).name}. It is in the hold.`, 'good')
  }
}

/** Incidents: fire, vermin, breach and pirates burn down, spread, and get fought. */
const stepIncidents = (s: GameState, dt: number, ctx: TickCtx): void => {
  // Whether anything got contained this tick — and so whether it is worth
  // checking that the room it happened in got its operator back.
  let cleared = false
  for (const inc of [...s.incidents]) {
    const idef = incidentDef(inc.kind)
    const m = s.modules.find((x) => x.id === inc.moduleId)
    if (!m) {
      s.incidents = s.incidents.filter((x) => x.id !== inc.id)
      continue
    }
    // Automated suppression works alone, just far too slowly to rely on.
    let firepower = 0.45
    for (const id of m.staff) {
      const c = ctx.crewById.get(id)
      if (!c || c.dead) continue
      firepower += effectiveness(c, idef.counter) * 0.55
      // Kit tells most against people. A hull breach does not care what you
      // are carrying; a boarding party very much does.
      if (inc.kind === 'pirates') firepower += crewGuard(c) * 0.18
    }
    inc.hp -= firepower * dt
    m.condition = clamp(m.condition - idef.structureDps * dt, 0.2, 1)
    for (const id of [...m.staff]) {
      const c = ctx.crewById.get(id)
      if (!c || c.dead) continue
      c.hp -= idef.crewDps * dt
      // Nobody dies holding a fire hose. Badly hurt crew fall back to the spine.
      if (c.hp < c.maxHp * 0.25) {
        unassign(s, c.id, true)
        log(s, `${c.name} fell back from the ${idef.name.toLowerCase()}.`, 'warn')
      }
    }
    // Each disaster gnaws at a different supply while it burns.
    if (inc.kind === 'breach') s.resources.air = Math.max(0, s.resources.air - 0.55 * dt)
    if (inc.kind === 'fire') s.resources.power = Math.max(0, s.resources.power - 0.8 * dt)
    if (inc.kind === 'vermin') s.resources.food = Math.max(0, s.resources.food - 0.7 * dt)
    if (inc.kind === 'pirates') s.credits = Math.max(0, s.credits - 1.5 * dt)

    if (inc.hp <= 0) {
      cleared = true
      s.incidents = s.incidents.filter((x) => x.id !== inc.id)
      const reward = Math.round(idef.bounty * (1 + s.modules.length * 0.05))
      s.credits += reward
      awardXp(s, m, 22)
      log(s, `${idef.name} contained in ${def(m.kind).name}. +${reward}c salvage.`, 'good')
      // The emergency detail stands down: anyone drafted in walks back to the
      // station they left. If that post is gone, full, powered down or itself
      // burning, they simply stay put.
      for (const id of [...m.staff]) {
        const c = ctx.crewById.get(id)
        if (!c || c.dead || !c.returnTo || c.returnTo === m.id) continue
        const post = s.modules.find((x) => x.id === c.returnTo)
        const free =
          post &&
          !post.standby &&
          post.staff.length < staffSlots(post) &&
          !s.incidents.some((i) => i.moduleId === post.id)
        if (post && free) {
          assign(s, c.id, post.id)
          log(s, `${c.name} returned to the ${def(post.kind).name}.`, 'info')
        } else {
          c.returnTo = null
        }
      }
      continue
    }
    inc.spreadIn -= dt
    if (inc.spreadIn <= 0) {
      inc.spreadIn = idef.spreadSeconds
      // Something the crew is already beating back does not get to jump rooms.
      if (inc.hp > inc.maxHp * 0.6 && s.incidents.length < incidentCap(s)) {
        const targets = adjacentModules(s, m).filter(
          (o) => !s.incidents.some((i) => i.moduleId === o.id),
        )
        if (targets.length > 0) {
          startIncident(s, inc.kind, pickOne(roller(s), targets))
        }
      }
    }
  }

  // A room that was on fire is a room the greedy pass skipped over while it
  // burned. The operator who fell back from it may since have been posted
  // somewhere else entirely — nobody was going to send them back to a fire —
  // so the moment it is out, give the roster one more pass rather than
  // leaving an essential post to sit empty until a player happens to notice.
  if (cleared) autoAssignInto(s)
}

/**
 * Crew wellbeing: hp and morale drift towards what the station can support,
 * the dead are dead, and anyone patched up heads back to their post. Nobody
 * dies while the station is catching up offline — it comes back to a crisis,
 * not a tomb it had no chance to prevent.
 */
const stepCrewWellbeing = (s: GameState, dt: number, ctx: TickCtx, offline: boolean): void => {
  const d = ctx.derived
  const bunkPressure = ctx.alive.length > d.crewCap ? 0.2 : 0
  const moraleTarget = clamp(
    0.55 +
      (s.resources.air > 20 ? 0.15 : -0.35) +
      (s.resources.food > 20 ? 0.15 : -0.35) +
      (ctx.brownout ? -0.2 : 0.05) +
      (s.incidents.length > 0 ? -0.15 : 0.05) -
      bunkPressure,
    0.15,
    1,
  )
  for (const c of s.crew) {
    if (c.dead) continue
    if (ctx.suffocating) c.hp -= 0.8 * dt
    if (ctx.starving) c.hp -= 0.4 * dt
    if (ctx.healRate > 0 && c.hp < c.maxHp) c.hp = Math.min(c.maxHp, c.hp + ctx.healRate * dt)
    c.morale = clamp(c.morale + (moraleTarget - c.morale) * dt * 0.06, 0, 1)
    // Once patched up, crew head back to the post they retreated from — and
    // immediately, injuries and all, if the station is out of air or food.
    const allHands = ctx.suffocating || ctx.starving
    if (c.returnTo && !c.assignment && (allHands || c.hp > c.maxHp * 0.4)) {
      const post = s.modules.find((m) => m.id === c.returnTo)
      const safe = post && !s.incidents.some((i) => i.moduleId === post.id)
      if (!post) c.returnTo = null
      else if (safe && post.staff.length < staffSlots(post)) {
        assign(s, c.id, post.id)
        log(s, `${c.name} returned to the ${def(post.kind).name}.`, 'info')
      }
    }
    if (c.hp <= 0) {
      if (offline) {
        c.hp = 1
        continue
      }
      c.hp = 0
      c.dead = true
      c.returnTo = null
      // Their kit goes back in the hold. Somebody else will need it.
      for (const slot of SLOTS) {
        const worn = c.gear?.[slot]
        if (worn) s.stores[worn] = (s.stores[worn] ?? 0) + 1
      }
      c.gear = {}
      unassign(s, c.id)
      log(s, `${c.name} has died. The station observes a minute of silence.`, 'bad')
    }
  }
}

/** Docking fees: berthed traffic pays for the privilege, every tick it stays. */
const stepDockingFees = (s: GameState, dt: number): void => {
  s.credits += dockingFees(s) * dt
}

/** Cooldowns that just count down on their own. */
const stepCooldowns = (s: GameState, dt: number): void => {
  s.broadcastCooldown = Math.max(0, s.broadcastCooldown - dt)
}

/**
 * The cells: a brig that is dark, or that nobody is standing in, does not hold
 * anybody. Hold somebody long enough and their people come asking.
 */
const stepCells = (s: GameState, dt: number): void => {
  if (s.prisoners.length === 0) return
  for (const p of s.prisoners) p.held += dt
  const cells = cellsAboard(s)
  while (s.prisoners.length > cells) {
    const gone = s.prisoners.pop()
    if (!gone) break
    log(s, `${gone.name} is out of the cells and off the station.`, 'bad')
    shift(s, gone.faction, 0.02)
  }
  // Hold somebody long enough and you find out who their people are. One
  // hull at a time, and never while one is already alongside asking.
  s.nextClaimIn -= dt
  if (s.nextClaimIn <= 0) {
    const ripe = s.prisoners.find((p) => p.held >= CLAIM_AFTER)
    if (ripe && !s.visitors.some((v) => v.claiming) && !s.talk) {
      sendClaimant(s, ripe.id)
      s.nextClaimIn = 6 * 60
    } else {
      s.nextClaimIn = 30
    }
  }
}

/**
 * Somebody coming for the station. Only while nothing else is being said, and
 * never to a station nobody would bother with.
 */
const stepTakeover = (s: GameState, dt: number, offline: boolean): void => {
  if (offline || s.talk || s.elapsed <= CONQUEST_EARLIEST || !worthTaking(s)) return
  s.nextTakeoverIn -= dt
  if (s.nextTakeoverIn <= 0) {
    s.nextTakeoverIn = CONQUEST_GAP + roll(s) * CONQUEST_GAP
    const who = wouldCome(s)
    if (who) sendConqueror(s, who)
  }
}

/**
 * The seven hulls. Only while nothing else is being said: none of this is
 * urgent enough to interrupt a conversation already on screen.
 */
const stepQuestline = (s: GameState, dt: number): void => {
  if (s.talk) return
  s.nextQuestIn -= dt
  if (s.nextQuestIn <= 0) questBeat(s)
}

/** What follows a takeover: the new owner's first assessment. */
const stepLevy = (s: GameState, dt: number): void => {
  if (s.nextLevyIn <= 0) return
  s.nextLevyIn -= dt
  if (s.nextLevyIn <= 0) {
    s.nextLevyIn = 0
    sendLevy(s)
  }
}

/**
 * Hulls that wait. One at a time. This is a sequence with three visible
 * steps, not a swarm.
 */
const stepLoiterers = (s: GameState, dt: number): void => {
  if (!worthLeaningOn(s)) return
  s.nextLoiterIn -= dt
  if (s.nextLoiterIn <= 0) {
    s.nextLoiterIn = LOITER_GAP + roll(s) * LOITER_GAP
    if (!s.visitors.some((v) => v.intent && v.intent !== 'conquest')) sendLoiter(s)
  }
}

/**
 * The quiet word: somebody sounds the station out from time to time. It rides
 * in on ordinary traffic, so if nothing suitable is alongside it simply waits
 * for a hull.
 */
const stepApproaches = (s: GameState, dt: number): void => {
  if (!worthSounding(s)) return
  s.nextApproachIn -= dt
  if (s.nextApproachIn <= 0) {
    s.nextApproachIn = sendApproach(s) ? APPROACH_GAP + roll(s) * APPROACH_GAP : 45
  }
}

/**
 * The clamps: new traffic arrives, and every hull already on the board moves
 * through inbound, hailing, docked and departing — or, for the ones with an
 * intent, through the loiter/demand/raid sequence.
 */
const stepTraffic = (s: GameState, dt: number): void => {
  s.nextVisitorIn -= dt
  if (s.nextVisitorIn <= 0) {
    // A hub is a reason to stop here rather than pass by.
    const pull = 1 / (1 + commerce(s) * 0.55)
    s.nextVisitorIn = (80 + roll(s) * 120) * pull
    if (s.visitors.length < visitorBerths(s)) {
      const hail = makeVisitor(roller(s), namesInPlay(s))
      s.visitors.push(hail)
      log(s, `${hail.name} is on approach.`, 'info')
    }
    // A busy Trading Hub occasionally lands somebody nobody called for — off a
    // hull already at the clamps, deciding to stay rather than fly on.
    const hub = commerce(s)
    const d = derive(s)
    if (
      hub > 0 &&
      roll(s) < Math.min(0.35, hub * 0.12) &&
      s.candidates.length < dockBerths(s) &&
      d.crewAlive.length < d.crewCap
    ) {
      const walker = makeWalkIn(s)
      s.candidates.push(walker)
      log(s, `${walker.name} came off a hull at the Trading Hub, asking about a berth.`, 'good')
    }
  }

  for (const v of [...s.visitors]) {
    // A hull that came to take the station waits as long as it likes.
    if (v.intent === 'conquest') continue
    // The three-step sequence runs on its own clock, and every step of it has
    // already been on the board long enough to answer.
    if (v.intent) {
      v.timer -= dt
      if (v.timer > 0) continue
      if (v.intent === 'loiter') {
        raiseDemand(s, v)
      } else if (v.intent === 'demand') {
        // Ignoring a demand is an answer, and they heard it.
        v.intent = 'raid'
        v.timer = 8
      } else {
        resolveRaid(s, v)
        // Whatever was on screen about it is finished now.
        if (s.talk && s.talk.with.kind === 'visitor' && s.talk.with.id === v.id) s.talk = null
      }
      continue
    }
    v.timer -= dt
    if (v.status === 'inbound') {
      if (v.timer <= 0) {
        v.status = 'requesting'
        v.timer = 60 + roll(s) * 40
        log(s, `${v.name} is requesting permission to dock.`, 'info')
      }
      continue
    }
    if (v.status === 'requesting') {
      if (autoAccepting(s)) {
        admitVisitor(s, v)
        continue
      }
      if (v.timer <= 0) {
        s.visitors = s.visitors.filter((x) => x.id !== v.id)
        log(s, `${v.name} gave up waiting and moved on.`, 'info')
      }
      continue
    }
    s.credits += v.fee * dt
    if (v.timer <= 0) {
      s.visitors = s.visitors.filter((x) => x.id !== v.id)
    }
  }
}

/**
 * The fleet: contracts spawn on the board, and every launched mission moves —
 * open jobs accrue haul and strain, unfolding jobs hail partway through, and
 * anything whose clock ran out gets resolved.
 */
const stepFleet = (s: GameState, dt: number): void => {
  s.nextContractIn -= dt
  if (s.nextContractIn <= 0) {
    s.nextContractIn = 70 + roll(s) * 80
    // A command module has to be crewed for anyone to be listening to the wire.
    const listening = s.modules.some((m) => m.kind === 'command' && m.staff.length > 0)
    const offers = s.missions.filter((m) => m.status === 'offered').length
    // A run out to one of the letter's seven is an ordinary far contract with a
    // hull name on it, offered among the ordinary work.
    const bearingOpts = (): MissionOpts => {
      const bearing = questBearing(s)
      // A run out to a filed position is a fixed job with a fixed clock. It is
      // not open-ended work: there is one place to go and one thing to look at.
      return bearing
        ? {
            far: lostHull(bearing)?.far ?? true,
            bearing,
            shape: 'contract',
            name: `Bearing — the ${bearing}`,
          }
        : { far: rollFar(s) }
    }
    if (listening && offers < 3) {
      // A power you fly for does not only offer work. Sometimes it assigns it,
      // and the only reward is not being the station that said no.
      const patron = s.patron
      const duty = patron !== null && roll(s) < 0.22
      s.missions.push(
        patron && duty
          ? makeMission(roller(s), appeal(s), {
              far: rollFar(s),
              obligation: true,
              standing: [patron, 0.05],
              name: `${factionDef(patron).short} tasking`,
            })
          : makeMission(roller(s), appeal(s), bearingOpts()),
      )
      if (patron && duty) log(s, `${factionDef(patron).name} has tasked the station.`, 'warn')
    }
  }

  const reachable = inContact(s)
  for (const m of [...s.missions]) {
    if (m.status === 'offered') {
      m.expiresIn -= dt
      if (m.expiresIn <= 0) s.missions = s.missions.filter((x) => x.id !== m.id)
      continue
    }
    // A job waiting on an answer is not counting down. Nothing happens out
    // there until somebody says something.
    if (m.status === 'calling') {
      if (!reachable.has(m.id) && m.call) {
        // Out of contact, the team stops waiting and decides for themselves.
        answerCall(s, m, unattended(m.call), true)
      }
      continue
    }
    if (m.status !== 'flying') continue
    m.aloft += dt

    if (m.shape === 'open') {
      // No clock but the one the commander is watching. Every minute out is
      // more in the hold and more wear on the people carrying it.
      if (m.recalled) {
        m.remaining -= dt
        if (m.remaining <= 0) resolveMission(s, m)
        continue
      }
      m.haul += (OPEN_HAUL_PER_MINUTE / 60) * dt
      m.strain += (OPEN_STRAIN_PER_MINUTE / 60) * dt * (0.6 + m.danger)
      // Strain is not a timer. It is the odds getting worse while you decide:
      // a per-second chance that grows once the team is past what they can
      // comfortably carry.
      if (m.strain > 1 && roll(s) < (m.strain - 1) * 0.004 * dt) {
        log(s, `${m.name} is in trouble and nobody called them home.`, 'bad')
        m.odds -= 0.3
        m.recalled = true
        m.remaining = m.seconds
      }
      continue
    }

    m.remaining -= dt

    if (m.shape === 'unfolding' && m.nextCall > 0) {
      m.nextCall -= dt
      if (m.nextCall <= 0) {
        const call = rollCall(roller(s), m)
        if (call) {
          // Past the envelope nobody is waiting on you. What arrives is a
          // report of a decision already taken, hours after the fact — which
          // is what makes far work a different kind of job rather than the
          // same one with a bigger number on it.
          if (m.far && !inContact(s).has(m.id)) {
            const chose = call.options[unattended(call)]
            m.odds += chose.odds ?? 0
            m.haul *= chose.haul ?? 1
            m.strain += chose.strain ?? 0
            m.nextCall = m.remaining > 90 ? Math.round(m.remaining * (0.4 + roll(s) * 0.3)) : 0
            log(s, `${m.name}, relayed and late: ${chose.note ?? chose.detail}`, 'info')
            continue
          }
          m.call = call
          m.status = 'calling'
          log(s, `${m.name} is hailing. They want an answer.`, 'warn')
          continue
        }
      }
    }

    if (m.remaining <= 0) resolveMission(s, m)
  }
}

/**
 * Applicants HQ has dispatched: first they fly out, then they wait — and they
 * do not wait forever.
 */
const stepCandidates = (s: GameState, dt: number): void => {
  for (const cand of [...s.candidates]) {
    if (cand.arrivesIn > 0) {
      cand.arrivesIn -= dt
      if (cand.arrivesIn <= 0) {
        cand.arrivesIn = 0
        log(s, `${cand.name} docked for an interview.`, 'info')
      }
      continue
    }
    cand.patience -= dt
    if (cand.patience <= 0) {
      s.candidates = s.candidates.filter((x) => x.id !== cand.id)
      log(s, `${cand.name} got tired of waiting and undocked.`, 'warn')
    }
  }
}

/** Random incidents: fire, vermin, breach and pirates start somewhere new. */
const stepIncidentSchedule = (s: GameState, dt: number): void => {
  s.nextIncidentIn -= dt
  if (s.nextIncidentIn <= 0) {
    s.nextIncidentIn = 90 + roll(s) * 150
    rollIncident(s)
  }
}

/** The end of the run: nobody left aboard to run it. */
const checkGameOver = (s: GameState): void => {
  if (s.crew.length > 0 && s.crew.every((c) => c.dead) && !s.gameOver) {
    s.gameOver = true
    log(s, 'The last of the crew is gone. Spaceport-99 drifts dark and silent.', 'bad')
  }
}

/**
 * Advances the simulation by `dt` seconds. `dt` should stay at or below 1.
 * While catching up on offline time nobody dies — the player comes back to a
 * station in crisis rather than to a tomb they had no chance to prevent.
 */
export const step = (s: GameState, dt: number, offline: boolean): void => {
  const ctx: TickCtx = {
    crewById: new Map(s.crew.map((c) => [c.id, c])),
    derived: derive(s),
    alive: s.crew.filter((c) => !c.dead),
    grid: 1,
    brownout: false,
    starving: false,
    suffocating: false,
    healRate: 0,
  }
  s.elapsed += dt

  stepPowerGrid(s, dt, ctx)
  stepProduction(s, dt, ctx)
  stepLifeSupport(s, dt, ctx)
  stepMedBay(s, ctx)
  stepEngineeringBay(s, dt, ctx)
  stepResearchLab(s, dt, ctx)
  stepFabShop(s, dt, ctx)
  stepIncidents(s, dt, ctx)
  stepCrewWellbeing(s, dt, ctx, offline)
  stepDockingFees(s, dt)
  stepCooldowns(s, dt)
  stepCells(s, dt)
  stepTakeover(s, dt, offline)
  stepQuestline(s, dt)
  stepLevy(s, dt)
  stepLoiterers(s, dt)
  stepApproaches(s, dt)
  stepTraffic(s, dt)
  stepFleet(s, dt)
  stepCandidates(s, dt)
  stepIncidentSchedule(s, dt)
  checkGameOver(s)
}

export const completeCycle = (
  s: GameState,
  m: StationModule,
  caps: Record<ResourceKey, number>,
): void => {
  const md = def(m.kind)
  if (md.produces) {
    const amount = cycleYield(m)
    s.resources[md.produces] = clamp(s.resources[md.produces] + amount, 0, caps[md.produces])
  }
  if (md.credits) s.credits += Math.round(cycleCredits(m))
  if (md.trains) {
    const stat = md.trains
    for (const id of m.staff) {
      const idx = s.crew.findIndex((c) => c.id === id)
      if (idx < 0) continue
      const c = s.crew[idx]
      if (c.stats[stat] >= MAX_STAT) continue
      s.crew[idx] = { ...c, stats: { ...c.stats, [stat]: c.stats[stat] + 1 } }
      log(s, `${c.name} trained ${stat} to ${c.stats[stat] + 1}.`, 'good')
    }
  }
  awardXp(s, m, 6 + m.width * 2)
}

/**
 * Public tick: splits an arbitrary elapsed span into stable sub-steps.
 *
 * A conversation holds the station still. Nothing departs, spawns, burns down
 * or starves while the commander is reading a line they cannot act around —
 * and a hull that undocked mid-sentence is the worst of those. Catching up is
 * exempt: a conversation left open overnight would otherwise be a pause button
 * for the entire game.
 */
export const advance = (state: GameState, seconds: number, offline = false): GameState => {
  const s: GameState = structuredClone(state)
  let remaining = Math.min(seconds, MAX_CATCHUP_SECONDS)
  while (remaining > 0) {
    if (s.talk && !offline) break
    const dt = Math.min(1, remaining)
    step(s, dt, offline)
    remaining -= dt
    if (s.gameOver) break
  }
  s.lastTick = Date.now()
  return s
}
