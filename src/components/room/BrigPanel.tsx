import { cellsAboard } from '../../game/engine.ts'
import { factionDef } from '../../game/factions.ts'
import type { RoomPanelProps } from './types.ts'

/**
 * The Brig's own panel: who is in the cells, what for, and how long they have
 * been there. Everything you can do about it is a conversation.
 */
export const BrigPanel = ({ state, onTalkPrisoner }: RoomPanelProps) => {
  const cells = cellsAboard(state)
  const held = state.prisoners

  return (
    <>
      <h3 className="modal__sub">
        Cells ({held.length}/{cells})
      </h3>
      {held.length === 0 ? (
        <p className="panel-note">
          Empty. People end up in here off a hull that would not account for its hold, and what
          happens to them after that is a conversation rather than a timer.
        </p>
      ) : (
        <ul className="specs">
          {held.map((p) => (
            <li key={p.id} className="spec">
              <span className="spec__head">
                <b>{p.name}</b>
                <em>{factionDef(p.faction).short}</em>
              </span>
              <span className="spec__blurb">
                Off the {p.hull} — {p.charge}.
              </span>
              <span className="spec__foot">
                <em>{Math.floor(p.held / 60)} min in the cells</em>
                <button className="btn btn--tiny" onClick={() => onTalkPrisoner(p.id)}>
                  Talk to them
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="panel-note">
        Cells only hold while somebody is standing in the room and the power is on. Take the watch
        off and whoever is in here is gone by the next shift.
      </p>
    </>
  )
}
