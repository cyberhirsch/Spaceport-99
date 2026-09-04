import { def, scanOf } from '../../game/engine.ts'
import { shipDef } from '../../game/fleet.ts'
import { scanReading, visitorDef } from '../../game/visitors.ts'
import { factionDef } from '../../game/factions.ts'
import type { GameState, StationModule, Visitor } from '../../game/types.ts'
import { Modal } from '../Modal.tsx'

interface Props {
  state: GameState
  v: Visitor
  dock?: StationModule
  auto: boolean
  officers: number
  onClose: () => void
  onAccept: () => void
  onRefuse: () => void
  onTalk: () => void
  onAutoAccept: (on: boolean) => void
}

/** A hull hailing for a berth: the claim, the scan, and the desk's decision. */
export const HailPanel = ({
  state,
  v,
  dock,
  auto,
  officers,
  onClose,
  onAccept,
  onRefuse,
  onTalk,
  onAutoAccept,
}: Props) => {
  const hull = shipDef(v.cls)
  const claimed = visitorDef(v.claim)

  return (
    <Modal onClose={onClose} title={<span className="modal__title">Permission to dock</span>}>
      <div className="hail">
        <span className="hail__glyph">{hull.glyph}</span>
        <span>
          <b>{v.name}</b>
          <em>
            {hull.name} · {factionDef(v.faction).short} paper · claims to be a{' '}
            {claimed.label.toLowerCase()}
          </em>
        </span>
      </div>
      <p className="panel-note">{claimed.hail}</p>

      <div className={`scan scan--${v.suspicion > 0.6 ? 'bad' : v.suspicion > 0.35 ? 'warn' : 'ok'}`}>
        <span>Scan</span>
        <b>{scanReading(scanOf(state, v))}</b>
      </div>
      <p className="panel-note">
        They will hold for {Math.ceil(v.timer)}s. A clean manifest is not a promise, and turning
        away someone who really is in trouble gets remembered — by the power whose paper they fly,
        which here is {factionDef(v.faction).name.toLowerCase()}.
        {v.faction === state.patron ? ' That is your own flag.' : ''}
      </p>

      <div className="modal__actions">
        <button
          className="btn btn--primary"
          disabled={officers === 0}
          onClick={onAccept}
          title={officers === 0 ? 'Nobody is working the docking desk' : undefined}
        >
          {officers === 0 ? 'Nobody on the desk' : 'Clear them to dock'}
        </button>
        <button className="btn" onClick={onTalk}>
          Open a channel
        </button>
        <button className="btn btn--danger" onClick={onRefuse}>
          Wave them off
        </button>
      </div>

      {officers === 0 && (
        <p className="panel-note">
          The clamps do not close themselves. Post somebody to the {def('dock').name} and they can
          be brought alongside.
        </p>
      )}

      {dock && (
        <label className="toggle">
          <input type="checkbox" checked={auto} onChange={(e) => onAutoAccept(e.target.checked)} />
          <span>
            Standing order to the desk: clear anything that hails. No more asking, and no more
            scans read before a hull is alongside.
          </span>
        </label>
      )}
    </Modal>
  )
}
