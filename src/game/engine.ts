/**
 * The game engine, as one import.
 *
 * Everything the interface, the conversation scripts and the tests need is
 * re-exported from here, so nothing outside src/game has to know how the
 * simulation is split up. The split itself is layered, bottom to top:
 *
 *   core → staffing → rooms → state → hazards → station → standing
 *        → recruit → boarding → missions → traffic → board → tick → reducer
 *
 * A module only ever imports from the layers below it.
 */

// Importing the scripts is what registers them. Nothing else references these.
import './talks/crew.ts'
import './talks/hire.ts'
import './talks/welcome.ts'
import './talks/captain.ts'
import './talks/prisoner.ts'
import './talks/conquest.ts'
import './talks/covert.ts'
import './talks/loiter.ts'
import './talks/demand.ts'
import './talks/claim.ts'
import './talks/levy.ts'
import './talks/letter.ts'
import './talks/siege.ts'

export * from './core.ts'
export * from './staffing.ts'
export * from './rooms.ts'
export * from './state.ts'
export * from './hazards.ts'
export * from './station.ts'
export * from './standing.ts'
export * from './recruit.ts'
export * from './boarding.ts'
export * from './missions.ts'
export * from './traffic.ts'
export * from './board.ts'
export * from './tick.ts'
export * from './reducer.ts'

// The room catalogue, so callers need one import for it too.
export {
  BUILDABLE,
  DECK_WIDTH,
  MAX_LEVEL,
  MAX_MERGE,
  WING,
  buildCost,
  deckCost,
  def,
  maxLevel,
  mergeBonus,
  moveCost,
  staffSlots,
  upgradeCost,
  wingOf,
} from './modules.ts'
