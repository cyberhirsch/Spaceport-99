import { defence } from '../../game/engine.ts'
import { shipDef } from '../../game/fleet.ts'
import { factionDef } from '../../game/factions.ts'
import type { GameState, Visitor } from '../../game/types.ts'
import { Modal } from '../Modal.tsx'

interface Props {
  state: GameState
  v: Visitor
  onClose: () => void
  onTalkQuiet: () => void
}

/**
 * A hull standing off is not here to trade and there is nothing to buy from
 * it. There is one thing to do, and this is where you do it.
 */
export const HoldingPanel = ({ state, v, onClose, onTalkQuiet }: Props) => {
  const hull = shipDef(v.cls)
  const them = defence(state)

  return (
    <Modal onClose={onClose} title={<span className="modal__title">{v.name}</span>}>
      <div className="hail">
        <span className="hail__glyph">{hull.glyph}</span>
        <span>
          <b>Standing off</b>
          <em>
            {hull.name} · {factionDef(v.faction).short} paper · not asking for anything
          </em>
        </span>
      </div>
      <p className="panel-note">
        They arrived, they did not request a berth, and they have not left. Your batteries read{' '}
        <b>{Math.round(them.guns)}</b> against the <b>{v.force ?? '?'}</b> they appear to be
        carrying. Whatever this becomes, it is cheapest to deal with now.
      </p>
      <div className="modal__actions">
        <button className="btn btn--primary" onClick={onTalkQuiet}>
          Open a channel
        </button>
      </div>
    </Modal>
  )
}
