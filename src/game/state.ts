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
import type { Crew, GameState, ModuleKind, ResourceKey, StatKey, StationModule } from './types.ts'
import {
  SAVE_VERSION,
  BASE_CREW_CAP,
  BASE_STORAGE,
  BASE_HOLD,
  AIR_PER_CREW,
  FOOD_PER_CREW,
  log,
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

export const newGame = (name = 'Spaceport-99'): GameState => {
  const state: GameState = {
    version: SAVE_VERSION,
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
    nextTakeoverIn: 20 * 60 + Math.random() * 20 * 60,
    seenIntro: false,
    gameOver: false,
  }
  // The founders are hand-picked: one specialist per critical system, a port
  // officer, and two generalists, so a new station is never dead on arrival
  // through bad luck. Six, not five, because the station has seven posts and
  // life support cannot be robbed to man the desk.
  const founders: (StatKey | undefined)[] = ['T', 'O', 'B', 'A', undefined, undefined]
  for (const focus of founders) {
    state.crew.push(makeCrew({ stats: rollStats(6, focus), portrait: allocatePortrait(state) }))
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
