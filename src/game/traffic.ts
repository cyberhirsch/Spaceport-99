import { randomName, rollStats, uid } from './crew.ts'
import { beginTalk, type SpeakerRef } from './talk.ts'
import { PATRONS, factionDef } from './factions.ts'
import { makeMission } from './fleet.ts'
import { makeGuests, makeVisitor } from './visitors.ts'
import type { CovertAsk, FactionId, Prisoner, GameState, Guest, Visitor } from './types.ts'
import { clamp, log, namesInPlay, pickOne, roll, roller, spread } from './core.ts'
import { allocatePortrait, isAway, unassign } from './staffing.ts'
import { defence, cellsAboard } from './rooms.ts'
import { derive } from './state.ts'
import { startIncident } from './hazards.ts'
import { shift, appeal, covertShift } from './standing.ts'
import { rollFar } from './missions.ts'
import { LOST, SIEGE_AT, WATCHED_AT } from './quest.ts'

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
  const seed = taken?.seed ?? Math.floor(roll(s) * 1e9)
  s.prisoners.push({
    id: uid('p'),
    name: taken?.name ?? randomName(roller(s)),
    faction: v.faction,
    charge,
    hull: v.name,
    stats: taken?.stats ?? rollStats(roller(s), 6),
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
  v.timer = 45 + roll(s) * 60
  // The hull stays at the clamps; the people walk onto your decks. Whatever
  // the ship was carrying to raise with you, one of them now raises it. A
  // smuggler's crew still come ashore — being dodgy is not being hostile — but
  // a raider sends no one friendly. It sends a fight.
  if (v.kind !== 'raider') {
    const dealt: number[] = []
    v.aboard = makeGuests(roller(s), v, () => {
      const face = allocatePortrait(s, dealt)
      dealt.push(face)
      return face
    })
  }
  v.offer = null
  const dock = s.modules.find((m) => m.kind === 'dock' && !m.standby)

  switch (v.kind) {
    case 'trader': {
      const paid = Math.round(60 + roll(s) * 140)
      s.credits += paid
      for (const key of ['power', 'air', 'food'] as const) {
        s.resources[key] = clamp(s.resources[key] + Math.round(20 + roll(s) * 50), 0, caps[key])
      }
      log(s, `${v.name} berthed and sold off a hold. +${paid}c and cargo.`, 'good')
      break
    }
    case 'courier': {
      const paid = Math.round(90 + roll(s) * 120)
      s.credits += paid
      // Couriers carry paper, which sometimes means work.
      if (s.missions.filter((m) => m.status === 'offered').length < 3) {
        s.missions.push(makeMission(roller(s), appeal(s), { far: rollFar(s) }))
        log(s, `${v.name} dropped a contract and a bill. +${paid}c.`, 'good')
      } else {
        log(s, `${v.name} dropped the mail. +${paid}c.`, 'good')
      }
      break
    }
    case 'patrol': {
      const paid = Math.round(50 + roll(s) * 90)
      s.credits += paid
      shift(s, v.faction, 0.01)
      log(s, `${v.name} took a berth and left the lane a little safer. +${paid}c.`, 'good')
      break
    }
    case 'drifter': {
      // Helping costs supplies now and buys goodwill that pays later.
      const given = Math.round(30 + roll(s) * 40)
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
      const stolen = Math.round(Math.min(s.credits, 40 + roll(s) * 120))
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
export const visitorPhase = (
  v: Visitor,
): 'inbound' | 'hailing' | 'holding' | 'docked' | 'departing' =>
  v.status === 'inbound'
    ? 'inbound'
    : v.status === 'holding'
      ? 'holding'
      : v.status === 'requesting'
        ? 'hailing'
        : v.timer <= 15
          ? 'departing'
          : 'docked'

export const PHASE_LABEL: Record<ReturnType<typeof visitorPhase>, string> = {
  inbound: 'inbound',
  hailing: 'asking',
  holding: 'standing off',
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
// -------------------------------------------------------------- quiet words --

/**
 * Nobody sounds out a station with nothing on it. Once there is, somebody
 * always does, and it is never the power whose flag is over the door.
 */
export const worthSounding = (s: GameState): boolean =>
  s.modules.length >= 6 && derive(s).crewAlive.length >= 5

/**
 * Who tries you.
 *
 * Everybody, eventually. Soonest the powers whose paper you do not fly, and
 * soonest of those the ones you have already said yes to once — an arrangement
 * that worked is an arrangement worth extending.
 */
export const wouldSound = (s: GameState): FactionId | null => {
  const pool = PATRONS.filter((id) => id !== s.patron)
  if (pool.length === 0) return null
  const weights = pool.map((id) => Math.max(0.05, 0.2 + s.covert[id] * 2 - s.standing[id] * 0.5))
  const total = weights.reduce((a, b) => a + b, 0)
  let r = roll(s) * total
  for (let i = 0; i < pool.length; i += 1) {
    r -= weights[i]
    if (r <= 0) return pool[i]
  }
  return pool[0]
}

/** What each ask is worth, before the station's size is taken into account. */
const ASK_PAYS: Record<CovertAsk, [number, number]> = {
  cargo: [240, 420],
  names: [150, 290],
  window: [430, 700],
  turn: [520, 900],
}

/**
 * How much harder each ask is to keep off the record. Naming who docked is
 * barely anything; standing your watch down for an hour is the sort of thing
 * people notice afterwards and work backwards from.
 */
export const ASK_RISK: Record<CovertAsk, number> = {
  cargo: 1,
  names: 0.7,
  window: 1.3,
  turn: 1.45,
}

/** What they would ask this station for, given who they are to it. */
const askFor = (s: GameState, from: FactionId): CovertAsk => {
  // A power that used to hold this station wants one thing above all others.
  if (s.resigned.includes(from) && s.patron !== null && s.patron !== from) return 'turn'
  const r = roll(s)
  if (r < 0.4) return 'cargo'
  if (r < 0.75) return 'names'
  return 'window'
}

/**
 * A quiet word, carried by whoever happens to be alongside.
 *
 * It never arrives on a hull flying the sender's own paper — the whole value of
 * the arrangement is that neither of you has to admit it exists. If nothing
 * suitable is at the clamps, nobody says anything today.
 */
export const sendApproach = (s: GameState): boolean => {
  const from = wouldSound(s)
  if (!from) return false
  const carriers = s.visitors.filter(
    (v) => v.status === 'docked' && !v.covert && !v.intent && v.faction !== from,
  )
  if (carriers.length === 0) return false
  const hull = pickOne(roller(s), carriers)
  const ask = askFor(s, from)
  const [lo, hi] = ASK_PAYS[ask]
  const size = 1 + Math.min(0.8, s.modules.length * 0.035)
  hull.covert = { from, ask, pays: Math.round(spread(roller(s), lo, hi) * size) }
  log(s, `Somebody aboard the ${hull.name} would like a word off the log.`, 'warn')
  return true
}

/**
 * An arrangement comes out.
 *
 * Whoever holds the station takes it personally, and takes it worse each time.
 * Two of these and somebody starts making the case that this post needs new
 * management.
 */
export const expose = (s: GameState, from: FactionId, ask: CovertAsk): void => {
  s.burned += 1
  const patron = s.patron
  const bite = 0.06 + s.burned * 0.02 + (ask === 'turn' ? 0.06 : 0)
  if (patron) {
    shift(s, patron, -bite)
    log(
      s,
      `It came out. ${factionDef(patron).short} know you have been talking to ${factionDef(from).short}.`,
      'bad',
    )
  } else {
    log(s, `It came out. Everybody knows who you have been talking to.`, 'bad')
  }
  // The power you dealt with is not embarrassed. It is inconvenienced.
  covertShift(s, from, -0.03)
  if (s.burned >= 2 && patron) {
    // Twice is a pattern, and a pattern is an argument for replacing you.
    s.nextTakeoverIn = Math.min(s.nextTakeoverIn, 300 + roll(s) * 300)
  }
}

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
  // An arrangement is worth more to them than a station is: they already have
  // what taking it would get them, and none of the trouble.
  const weights = pool.map((id) => Math.max(0.05, 0.25 - s.standing[id] - s.covert[id] * 1.2))
  const total = weights.reduce((a, b) => a + b, 0)
  let r = roll(s) * total
  for (let i = 0; i < pool.length; i += 1) {
    r -= weights[i]
    if (r <= 0) return pool[i]
  }
  return pool[0]
}

// ---------------------------------------------------------- seven hulls --

/**
 * The questline, one beat at a time.
 *
 * Everything it does, it does through machinery that already exists: a
 * conversation with somebody who is already aboard, a contract on the board, a
 * Sensor Array reading something wrong. The only thing it adds is a reason.
 */
export const questBeat = (s: GameState): void => {
  const q = s.quest
  if (q.stage === 'over') {
    s.nextQuestIn = Number.MAX_SAFE_INTEGER
    return
  }

  // Nobody has told this station anything yet.
  if (q.stage === 'none') {
    if (!deliverLetter(s)) {
      s.nextQuestIn = 60
      return
    }
    q.stage = 'letter'
    s.nextQuestIn = 3 * 60
    return
  }

  // It arrives, then it is watched, then it is here. Attention only ever rises,
  // and only checking a bearing raises it.
  if (q.attention >= SIEGE_AT && q.stage !== 'siege') {
    q.stage = 'siege'
    const watch = derive(s).crewAlive[0]
    if (watch) {
      s.talk = beginTalk('siege', { kind: 'crew', id: watch.id }, watch.name)
      log(s, `Four returns on the board and none of them are answering.`, 'bad')
    }
    s.nextQuestIn = 5 * 60
    return
  }
  if (q.attention >= WATCHED_AT && q.stage === 'checking') {
    q.stage = 'watched'
    log(
      s,
      `Traffic is down and the array is busy. Something is asking about this station now.`,
      'warn',
    )
  }

  // The Sensor Array is the first thing to notice, because it is the only thing
  // aboard precise enough to be wrong in an interesting way.
  const array = s.modules.find((m) => m.kind === 'sensor' && !m.standby && m.staff.length > 0)
  if (array && q.checked.length > 0 && roll(s) < 0.5) {
    const hull = pickOne(roller(s), LOST.slice(0, 6))
    log(
      s,
      `The array logged a contact and resolved it as the ${hull.name}, silent since ${hull.silent}. It held the reading for nine seconds.`,
      'warn',
    )
  } else if (q.stage === 'watched' && roll(s) < 0.5) {
    log(s, `Every fix taken this watch is out by the same amount, in the same direction.`, 'warn')
  }
  s.nextQuestIn = 3 * 60 + roll(s) * 4 * 60
}

/**
 * How the letter reaches you: the array picks it up, a hull hands it over, or
 * somebody aboard has been carrying it around deciding whether to.
 */
export const deliverLetter = (s: GameState): boolean => {
  const crew = derive(s).crewAlive
  if (crew.length === 0) return false
  const array = s.modules.find((m) => m.kind === 'comms' && !m.standby && m.staff.length > 0)
  const hull = s.visitors.find((v) => v.status === 'docked' && !v.intent && !v.covert)

  let ref: SpeakerRef
  let who: string
  let from: string
  if (array) {
    const onDuty = crew.find((c) => c.assignment === array.id) ?? crew[0]
    ref = { kind: 'crew', id: onDuty.id }
    who = onDuty.name
    from = 'from:comms'
  } else if (hull) {
    ref = { kind: 'visitor', id: hull.id }
    who = hull.name
    from = 'from:hull'
  } else {
    const bearer = pickOne(roller(s), crew)
    ref = { kind: 'crew', id: bearer.id }
    who = bearer.name
    from = 'from:crew'
  }

  const talk = beginTalk('letter', ref, who, 'arrived')
  talk.flags.push(from)
  s.talk = talk
  log(s, `A list of seven ship names reached the station. Nobody will say from where.`, 'warn')
  return true
}

// --------------------------------------------------------- second acts --

/**
 * Somebody comes for the person in your cells.
 *
 * Holding somebody used to be the end of the story: one conversation, three
 * doors, done. It is not, because people have people. A hull turns up flying
 * their paper and asks for them back, and now what you did in the Brig is a
 * thing other powers have an opinion about.
 */
export const sendClaimant = (s: GameState, prisonerId: string): void => {
  const held = s.prisoners.find((p) => p.id === prisonerId)
  if (!held) return
  const hull = makeVisitor(roller(s), namesInPlay(s))
  hull.faction = held.faction
  hull.kind = held.faction === 'unlisted' ? 'drifter' : 'patrol'
  hull.claim = hull.kind
  hull.suspicion = 0.2
  hull.status = 'docked'
  hull.aboard = []
  hull.offer = null
  hull.claiming = prisonerId
  hull.timer = 300
  hull.asking = Math.round(280 + held.stats.B * 40 + s.modules.length * 30)
  s.visitors.push(hull)
  log(s, `${hull.name} is alongside asking after ${held.name}, by name.`, 'warn')
  s.talk = beginTalk('claim', { kind: 'visitor', id: hull.id }, hull.name)
}

/**
 * The first bill from whoever took the station.
 *
 * A takeover used to be an ending: the flag changed and nothing followed. This
 * is what follows. They do not want the station destroyed, they want it useful,
 * and being useful turns out to have a price list.
 */
export const sendLevy = (s: GameState): void => {
  const patron = s.patron
  if (!patron) return
  const hull = makeVisitor(roller(s), namesInPlay(s))
  hull.faction = patron
  hull.kind = 'patrol'
  hull.claim = 'patrol'
  hull.suspicion = 0
  hull.status = 'docked'
  hull.aboard = []
  hull.offer = null
  hull.timer = 400
  hull.asking = Math.round((320 + s.modules.length * 60) * (1 + appeal(s) * 0.4))
  s.visitors.push(hull)
  log(s, `${factionDef(patron).name} have sent somebody to inspect their new station.`, 'warn')
  s.talk = beginTalk('levy', { kind: 'visitor', id: hull.id }, hull.name)
}

// -------------------------------------------------------- hulls that wait --

/**
 * Not every ship comes to trade.
 *
 * Some arrive, do not ask for a berth, and do not leave. A hull standing off is
 * the opening move of the only sequence in the game that can hurt the station
 * from outside: it loiters, then it demands, then it comes in. Each step is
 * visible on the board before the next one happens, which is the point — a raid
 * here is always something you watched arrive and chose how to answer.
 */
/** How much they brought, measured against what they can see you have. */
const forceFor = (s: GameState): number => {
  const d = defence(s)
  return Math.round(10 + (d.guns + d.shield * 0.6) * spread(roller(s), 0.7, 1.25))
}

/**
 * What they will take to be somewhere else.
 *
 * It scales with what the station is plainly worth, because they can see the
 * same thing you can — and it is quoted once, when they arrive, and never
 * recomputed. A figure that drifts while you are reading it is not a price, and
 * this one appears twice on the same screen. The loiterer takes 55% of it; by
 * the time they are demanding, it is the whole number.
 */
export const tribute = (s: GameState, v: Visitor): number =>
  v.asking ??
  Math.round((260 + s.modules.length * 55 + (v.force ?? 10) * 14) * (1 + appeal(s) * 0.5))

/** Whether there is anything here worth standing off for. */
export const worthLeaningOn = (s: GameState): boolean =>
  s.modules.length >= 8 && derive(s).crewAlive.length >= 6

/**
 * A hull arrives and does not ask for anything.
 *
 * Mostly the Drift — nobody with paper to lose leans on a station in daylight —
 * but a power that dislikes you will do it too, deniably, and a power you have
 * an arrangement with will quietly tell you it is coming.
 */
export const sendLoiter = (s: GameState): void => {
  const hull = makeVisitor(roller(s), namesInPlay(s))
  const grudge = PATRONS.filter((id) => id !== s.patron && s.standing[id] < -0.05)
  hull.faction = grudge.length > 0 && roll(s) < 0.35 ? pickOne(roller(s), grudge) : 'unlisted'
  hull.kind = 'raider'
  hull.claim = 'trader'
  hull.suspicion = 0.85
  hull.status = 'holding'
  hull.aboard = []
  hull.offer = null
  hull.intent = 'loiter'
  hull.force = forceFor(s)
  // Quoted on arrival and not recomputed afterwards.
  hull.asking = tribute(s, hull)
  // Long enough to notice it, decide, and act. Ignoring it is also a decision.
  hull.timer = 200 + roll(s) * 160
  s.visitors.push(hull)
  log(s, `${hull.name} is holding station two kilometres out and not answering.`, 'warn')
  // Somebody you deal with off the record hears things first.
  const friend = PATRONS.find((id) => s.covert[id] > 0.06)
  if (friend) {
    log(
      s,
      `A channel that does not exist says ${factionDef(friend).short} know who that is. It is not them.`,
      'info',
    )
  }
}

/** They stop waiting and start asking. */
export const raiseDemand = (s: GameState, v: Visitor): void => {
  v.intent = 'demand'
  v.timer = 150 + roll(s) * 120
  log(s, `${v.name} has opened a channel, and it is not a request for a berth.`, 'bad')
  s.talk = beginTalk('demand', { kind: 'visitor', id: v.id }, v.name)
}

/**
 * They come in.
 *
 * A raid costs rooms, cargo and blood, and it is survivable: crew are hurt
 * rather than killed unless the station had nothing to fight with and ignored
 * every step that led here. Nobody dies to a hull they were warned about twice
 * and could have paid, fought or reported.
 */
export const resolveRaid = (s: GameState, v: Visitor): void => {
  const d = defence(s)
  const force = v.force ?? 12
  const held = d.guns + d.shield * 0.7 + d.smallArms * 0.35
  // How much of what they brought gets through.
  const through = clamp(1 - held / (held + force), 0.12, 1)
  const beaten = held > force * 1.35

  for (const m of s.modules) {
    if (m.kind === 'spine') continue
    if (roll(s) >= through * 0.55) continue
    m.condition = clamp(m.condition - spread(roller(s), 0.12, 0.34) * through, 0.15, 1)
  }
  const taken = Math.round(Math.min(s.credits, (140 + force * 26) * through))
  s.credits -= taken

  let hurt = 0
  let killed = 0
  const alive = s.crew.filter((c) => !c.dead && !isAway(s, c.id))
  for (const c of alive) {
    if (roll(s) >= through * 0.4) continue
    const damage = Math.round(c.maxHp * spread(roller(s), 0.25, 0.6) * through)
    // Defenceless and forewarned is the only way this kills anybody.
    if (held < 1 && damage >= c.hp && alive.length > 1) {
      c.dead = true
      c.hp = 0
      unassign(s, c.id)
      killed += 1
    } else {
      c.hp = Math.max(1, c.hp - damage)
      hurt += 1
    }
  }

  shift(s, v.faction, -0.06)
  v.intent = undefined
  v.status = 'requesting'
  v.timer = 0
  log(
    s,
    beaten
      ? `The ${v.name} came in and did not get far. −${taken}c, ${hurt} hurt.`
      : `The ${v.name} came in. −${taken}c, ${hurt} hurt${killed ? `, ${killed} dead` : ''}.`,
    killed ? 'bad' : 'warn',
  )
  if (killed === 0 && hurt === 0 && taken === 0) {
    log(s, `They looked at what the station had and thought better of it.`, 'good')
  }
}

/** They decide it is not worth it after all. */
export const standDown = (s: GameState, v: Visitor, why: string): void => {
  v.intent = undefined
  v.status = 'requesting'
  v.timer = 0
  log(s, `${v.name} broke off. ${why}`, 'good')
}

/** A hull that is not asking. It is alongside by the time you read the hail. */
export const sendConqueror = (s: GameState, who: FactionId): void => {
  const d = defence(s)
  const hull = makeVisitor(roller(s), namesInPlay(s))
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
  hull.force = Math.round(14 + (d.guns + d.shield * 0.7) * (0.75 + roll(s) * 0.6))
  hull.timer = 600
  s.visitors.push(hull)
  s.talk = beginTalk('conquest', { kind: 'visitor', id: hull.id }, hull.name)
  log(
    s,
    `${hull.name} is alongside without asking. ${factionDef(who).name} colours.`,
    'bad',
  )
}
