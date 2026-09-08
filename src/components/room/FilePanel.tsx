import { LOST, knowsEnough, questSummary } from '../../game/quest.ts'
import type { RoomPanelProps } from './types.ts'

/**
 * The file.
 *
 * Seven names, seven dates, and whatever the teams have brought back. It lives
 * in the Comms Array because that is where the letter was logged as traffic
 * before anybody read it properly, and it is the only place in the game that
 * shows the questline as a whole.
 */
export const FilePanel = ({ state, onReadFile, onDecideFile }: RoomPanelProps) => {
  const q = state.quest
  if (q.stage === 'none') {
    return (
      <p className="panel-note">
        The array logs everything that comes in on the open channel, most of which is weather and
        beacon traffic. Somebody reads it once a shift. Nothing has needed reading twice.
      </p>
    )
  }

  return (
    <>
      <h3 className="modal__sub">The file ({q.checked.length}/7 checked)</h3>
      <ul className="specs">
        {LOST.map((h) => {
          const done = q.checked.includes(h.name)
          return (
            <li key={h.name} className={`spec${done ? ' spec--known' : ''}`}>
              <span className="spec__head">
                <b>{h.name}</b>
                <em>{h.silent}</em>
              </span>
              <span className="spec__blurb">{done ? h.found : `Filed: ${h.filed}`}</span>
              {!done && (
                <span className="spec__foot">
                  <em>
                    {h.far
                      ? 'not checked — past the envelope, it takes Deep Space Operations to reach'
                      : 'not checked — a mission out to look, for any hull with a crew'}
                  </em>
                </span>
              )}
            </li>
          )
        })}
      </ul>
      <p className="panel-note">{questSummary(state)}</p>
      <div className="modal__actions">
        <button className="btn" onClick={onReadFile}>
          Read the letter again
        </button>
        {knowsEnough(q) && q.stage !== 'over' && (
          <button className="btn btn--primary" onClick={onDecideFile}>
            Decide what to do with it
          </button>
        )}
      </div>
      {q.ending && (
        <p className="panel-note">
          <b>The file is closed.</b> Nothing further will come of it, which is either a relief or
          the worst thing in the log, depending on which way you closed it.
        </p>
      )}
    </>
  )
}
