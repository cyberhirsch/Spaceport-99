import { discretion, exposureRisk } from '../../game/engine.ts'
import { FACTION_IDS, factionDef, standingWord } from '../../game/factions.ts'
import type { RoomPanelProps } from './types.ts'

/**
 * The channels ledger.
 *
 * Two numbers per power: what they say about the station, and what they would
 * say if nobody were listening. Building the room is what lets you read the
 * second column at all — without it you are dealing blind and hoping.
 */
export const CovertPanel = ({ state }: RoomPanelProps) => {
  const risk = Math.round(exposureRisk(state) * 100)
  const hidden = Math.round(discretion(state) * 100)

  return (
    <>
      <h3 className="modal__sub">Channels</h3>
      <ul className="specs">
        {FACTION_IDS.map((id) => {
          const d = factionDef(id)
          const open = state.covert[id]
          return (
            <li key={id} className="spec">
              <span className="spec__head">
                <b>
                  {d.glyph} {d.short}
                </b>
                <em>{state.patron === id ? 'your flag' : standingWord(state.standing[id])}</em>
              </span>
              <span className="spec__blurb">
                {open > 0.02
                  ? `Off the record, they would take your call — and they would expect you to take theirs.`
                  : open < -0.02
                    ? `Off the record, they have stopped asking.`
                    : `Nothing off the record either way. Yet.`}
              </span>
              <span className="spec__foot">
                <em>on paper {Math.round(state.standing[id] * 100)}</em>
                <em>off it {Math.round(open * 100)}</em>
              </span>
            </li>
          )
        })}
      </ul>
      <p className="panel-note">
        This room keeps <b>{hidden}%</b> of an arrangement off the record, so the next one you take
        has roughly a <b>{risk}%</b> chance of coming out — more for the bigger asks. Take the watch
        off it and that figure is what it was before you built the place.
        {state.burned > 0 && (
          <>
            {' '}
            <b>
              {state.burned} {state.burned === 1 ? 'arrangement has' : 'arrangements have'} already
              come out.
            </b>{' '}
            Nobody forgets the second one.
          </>
        )}
      </p>
    </>
  )
}
