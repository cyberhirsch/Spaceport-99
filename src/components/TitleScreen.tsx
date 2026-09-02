import type { Derived } from '../game/engine.ts'
import type { GameState } from '../game/types.ts'
import type { SlotInfo } from '../game/save.ts'
import { spanOf } from './saveText.ts'

interface Props {
  state: GameState
  derived: Derived
  slot: SlotInfo | null
  onResume: () => void
  onLoad: () => void
  onScuttle: () => void
}

/**
 * Where "exit" goes in a game that lives in a browser tab: the station is
 * saved and set down, and nothing is asking anything of you.
 */
export const TitleScreen = ({ state, derived, slot, onResume, onLoad, onScuttle }: Props) => (
  <div className="title">
    <div className="title__card">
      <h1 className="title__mark">SPACEPORT&#8209;99</h1>
      <p className="title__sub">Station set down and saved.</p>
      {/* The wordmark already says it when the station is unnamed. */}
      {state.name !== 'Spaceport-99' && <p className="title__station">{state.name}</p>}
      <dl className="title__stats">
        <div>
          <dt>Crew</dt>
          <dd>{derived.crewAlive.length}</dd>
        </div>
        <div>
          <dt>Rooms</dt>
          <dd>{state.modules.length}</dd>
        </div>
        <div>
          <dt>Credits</dt>
          <dd>{Math.round(state.credits).toLocaleString()}</dd>
        </div>
        <div>
          <dt>On station</dt>
          <dd>{spanOf(state.elapsed)}</dd>
        </div>
      </dl>
      <p className="panel-note">
        Saved to this device. The station keeps running while you are away — up to four hours of it
        is credited when you come back.
      </p>
      <div className="title__actions">
        <button className="btn btn--primary" onClick={onResume}>
          Resume
        </button>
        <button className="btn" disabled={!slot} onClick={onLoad}>
          {slot ? `Load save — ${slot.crew} crew, ${slot.rooms} rooms` : 'No manual save'}
        </button>
        <button className="btn btn--danger" onClick={onScuttle}>
          Scuttle and restart
        </button>
      </div>
    </div>
  </div>
)
