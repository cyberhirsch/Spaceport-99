import {
  WING,
  capacityBonus,
  cycleCredits,
  def,
  powerDraw,
  holdBonus,
  storageBonus,
} from './modules.ts'
import { effectiveness, makeCrew, rollStats, uid } from './crew.ts'
import { blankStanding } from './factions.ts'
import { blankQuest } from './quest.ts'
import type { Crew, GameState, ModuleKind, ResourceKey, StatKey, StationModule } from './types.ts'
import {
  AIR_PER_CREW,
  APPROACH_EARLIEST,
  APPROACH_GAP,
  BASE_CREW_CAP,
  BASE_HOLD,
  BASE_STORAGE,
  FOOD_PER_CREW,
  LETTER_EARLIEST,
  log,
  LOITER_EARLIEST,
  LOITER_GAP,
  newSeed,
  roll,
  roller,
  SAVE_VERSION,
} from './core.ts'
import { workRate, assign, autoAssignInto, allocatePortrait } from './staffing.ts'
import { dockingFees, rateOf, recycled, heldItems } from './rooms.ts'

// The shape of a game, a fresh one, and the derived readout of one.

export interface Derived {
  crewAlive: Crew[]
  crewCap: number
  /**
   * How much of each resource the station can bank. A room that makes
   * something also buys the tankage to keep it, so a second reactor raises
   * the power ceiling as well as the rate.
   */
  caps: Record<ResourceKey, number>
  /** How many pieces of kit the hold can rack. */
  holdCap: number
  /** Power drawn per second by every online module. */
  draw: number
  /** Power produced per second, averaged over module cycles. */
  powerRate: number
  airRate: number
  foodRate: number
  creditRate: number
  brownout: boolean
}

export const derive = (s: GameState): Derived => {
  const crewAlive = s.crew.filter((c) => !c.dead)
  const crewById = new Map(s.crew.map((c) => [c.id, c]))
  let crewCap = BASE_CREW_CAP
  const caps: Record<ResourceKey, number> = {
    power: BASE_STORAGE,
    air: BASE_STORAGE,
    food: BASE_STORAGE,
  }
  let holdCap = BASE_HOLD
  let draw = 0
  let powerRate = 0
  let airRate = 0
  let foodRate = 0
  let creditRate = 0

  for (const m of s.modules) {
    crewCap += capacityBonus(m)
    holdCap += holdBonus(m)
    draw += powerDraw(m)
    powerRate += rateOf(m, crewById, 'power')
    airRate += rateOf(m, crewById, 'air')
    foodRate += rateOf(m, crewById, 'food')
    const d = def(m.kind)
    // Tankage follows what the room makes: a reactor banks power and nothing else.
    if (d.produces) caps[d.produces] += storageBonus(m)
    if (d.credits && d.cycleSeconds) {
      creditRate += (cycleCredits(m) * workRate(m, crewById)) / d.cycleSeconds
    }
  }

  // A reclaimer does not make anything; it stops the crew getting through as
  // much, which on a big roster is worth more than another farm.
  const kept = 1 - recycled(s)
  airRate -= crewAlive.length * AIR_PER_CREW * kept
  foodRate -= crewAlive.length * FOOD_PER_CREW * kept
  creditRate += dockingFees(s)

  return {
    crewAlive,
    crewCap,
    caps,
    holdCap,
    draw,
    powerRate: powerRate - draw,
    airRate,
    foodRate,
    creditRate,
    brownout: s.resources.power <= 0 && draw > 0,
  }
}

export const makeModule = (kind: ModuleKind, deck: number, col: number): StationModule => ({
  id: uid('m'),
  kind,
  deck,
  col,
  width: 1,
  level: 1,
  staff: [],
  progress: 0,
  condition: 1,
  rushRisk: 0.15,
  standby: false,
})

/**
 * A station nobody has founded yet. `seed` is the one unrepeatable roll in the
 * game — pass one to found the same station twice.
 */
export const newGame = (name = 'Spaceport-99', seed = newSeed()): GameState => {
  const state: GameState = {
    version: SAVE_VERSION,
    rng: seed,
    name,
    credits: 500,
    resources: { power: 140, air: 140, food: 140 },
    modules: [
      makeModule('dock', 0, WING - 2),
      makeModule('atmospherics', 0, WING - 1),
      makeModule('reactor', 0, WING),
      makeModule('hydroponics', 0, WING + 1),
    ],
    crew: [],
    incidents: [],
    boarding: null,
    log: [],
    decks: 1,
    lastTick: Date.now(),
    elapsed: 0,
    nextIncidentIn: 150,
    broadcastCooldown: 0,
    candidates: [],
    ships: [],
    missions: [],
    nextContractIn: 45,
    visitors: [],
    nextVisitorIn: 60,
    standing: blankStanding(),
    // Spaceport-99 is a Confederation post. It was never asked, and it has
    // never been worth anybody's while to change that. Yet.
    patron: 'terran',
    resigned: [],
    stores: {},
    specs: {},
    researching: null,
    fabricating: null,
    talk: null,
    prisoners: [],
    bonded: [],
    nextTakeoverIn: 0,
    covert: blankStanding(),
    nextApproachIn: 0,
    nextLoiterIn: 0,
    nextLevyIn: 0,
    nextClaimIn: 0,
    quest: blankQuest(),
    nextQuestIn: 0,
    burned: 0,
    seenIntro: false,
    gameOver: false,
  }
  // Nothing has been rolled yet, so this is the station's first draw: how long
  // it gets before anybody comes for it.
  state.nextTakeoverIn = 20 * 60 + roll(state) * 20 * 60
  // Nobody has any reason to sound the station out yet, so the first quiet word
  // is a long way off. It comes sooner once there is something here worth one.
  state.nextApproachIn = APPROACH_EARLIEST + roll(state) * APPROACH_GAP
  // And nothing worth leaning on, so nobody leans. Yet.
  state.nextLoiterIn = LOITER_EARLIEST + roll(state) * LOITER_GAP
  // And nobody has thought to tell it anything.
  state.nextQuestIn = LETTER_EARLIEST + roll(state) * LETTER_EARLIEST
  // The founders are hand-picked: one specialist per critical system, a port
  // officer, and two generalists, so a new station is never dead on arrival
  // through bad luck. Six, not five, because the station has seven posts and
  // life support cannot be robbed to man the desk.
  const founders: (StatKey | undefined)[] = ['T', 'O', 'B', 'A', undefined, undefined]
  for (const focus of founders) {
    state.crew.push(
      makeCrew(roller(state), {
        stats: rollStats(roller(state), 6, focus),
        portrait: allocatePortrait(state),
      }),
    )
  }
  // Put the founding crew straight to work so the station is not dead on
  // arrival, then make sure somebody is on the docking desk: the founders
  // arrived through it, and nothing comes alongside a port nobody is working.
  autoAssignInto(state)
  const port = state.modules.find((m) => m.kind === 'dock')
  if (port && port.staff.length === 0) {
    const spare = [...state.crew]
      .filter((c) => {
        const post = state.modules.find((m) => m.id === c.assignment)
        // Take from the fullest room, never from one running on a single pair
        // of hands.
        return !post || post.staff.length > 1
      })
      .sort((a, b) => effectiveness(b, 'A') - effectiveness(a, 'A'))[0]
    if (spare) assign(state, spare.id, port.id)
  }
  log(state, 'Station commissioned. Docking clamps released.', 'good')
  return state
}

/** Whether there is racking free for one more. Kit already issued does not count. */
export const holdRoom = (s: GameState): number => derive(s).holdCap - heldItems(s)
