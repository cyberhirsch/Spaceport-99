import { PHASE_LABEL, autoAccepting, def, visitorPhase } from '../game/engine.ts'
import { shipDef } from '../game/fleet.ts'
import { SELL_MARGIN, TRADE_LOT, scanReading, visitorDef } from '../game/visitors.ts'
import { RESOURCE_INFO, type GameState, type ResourceKey } from '../game/types.ts'
import { CrewAvatar } from './CrewAvatar.tsx'
import { Modal } from './Modal.tsx'

interface Props {
  state: GameState
  visitorId: string
  onClose: () => void
  onAccept: () => void
  onRefuse: () => void
  onTrade: (resource: ResourceKey, buy: boolean) => void
  onSelectGuest: (guestId: string) => void
  onAutoAccept: (on: boolean) => void
}

export const VisitorModal = ({
  state,
  visitorId,
  onClose,
  onAccept,
  onRefuse,
  onTrade,
  onSelectGuest,
  onAutoAccept,
}: Props) => {
  const v = state.visitors.find((x) => x.id === visitorId)
  if (!v) return null
  const hull = shipDef(v.cls)
  const claimed = visitorDef(v.claim)
  const dock = state.modules.find((m) => m.kind === 'dock' && !m.standby)
  const auto = autoAccepting(state)
  const phase = visitorPhase(v)

  if (v.status === 'inbound') {
    return (
      <Modal onClose={onClose} title={<span className="modal__title">Traffic</span>}>
        <div className="hail">
          <span className="hail__glyph">{hull.glyph}</span>
          <span>
            <b>{v.name}</b>
            <em>
              {hull.name} · on approach, hailing in {Math.ceil(v.timer)}s
            </em>
          </span>
        </div>
        <p className="panel-note">
          Still just a return on the board. Whatever they are, you will not know until they call
          for a berth — and the scan will not be certain even then.
        </p>
      </Modal>
    )
  }

  if (v.status === 'requesting') {
    return (
      <Modal
        onClose={onClose}
        title={<span className="modal__title">Permission to dock</span>}
      >
        <div className="hail">
          <span className="hail__glyph">{hull.glyph}</span>
          <span>
            <b>{v.name}</b>
            <em>
              {hull.name} · claims to be a {claimed.label.toLowerCase()}
            </em>
          </span>
        </div>
        <p className="panel-note">{claimed.hail}</p>

        <div className={`scan scan--${v.suspicion > 0.6 ? 'bad' : v.suspicion > 0.35 ? 'warn' : 'ok'}`}>
          <span>Scan</span>
          <b>{scanReading(v.suspicion)}</b>
        </div>
        <p className="panel-note">
          They will hold for {Math.ceil(v.timer)}s. A clean manifest is not a promise, and turning
          away someone who really is in trouble gets remembered.
        </p>

        <div className="modal__actions">
          <button className="btn btn--primary" onClick={onAccept}>
            Open the clamps
          </button>
          <button className="btn btn--danger" onClick={onRefuse}>
            Wave them off
          </button>
        </div>

        {dock && (
          <label className="toggle">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => onAutoAccept(e.target.checked)}
            />
            <span>
              Clear all traffic automatically — no more asking, and no more scans read before the
              clamps open.
            </span>
          </label>
        )}
      </Modal>
    )
  }

  return (
    <Modal onClose={onClose} title={<span className="modal__title">{v.name}</span>}>
      <div className="hail">
        <span className="hail__glyph">{hull.glyph}</span>
        <span>
          <b>{visitorDef(v.kind).label}</b>
          <em>
            {hull.name} · {PHASE_LABEL[phase]}, leaving in {Math.ceil(v.timer)}s
          </em>
        </span>
      </div>

      {v.aboard.length > 0 && (
        <>
          <h3 className="modal__sub">Came aboard</h3>
          <div className="staff-grid">
            {v.aboard.map((g) => (
              <button
                key={g.id}
                className={`staff-chip staff-chip--add${g.offer ? ' staff-chip--offer' : ''}`}
                onClick={() => onSelectGuest(g.id)}
              >
                <CrewAvatar who={g} size={30} />
                <span>
                  {g.name}
                  <em>
                    {g.role}
                    {g.offer ? ' · wants a word' : ''}
                  </em>
                </span>
                <i>{g.offer ? '!' : '›'}</i>
              </button>
            ))}
          </div>
        </>
      )}

      <h3 className="modal__sub">Trade — {TRADE_LOT} at a time</h3>
      <ul className="trade">
        {(['power', 'air', 'food'] as ResourceKey[]).map((key) => {
          const info = RESOURCE_INFO[key]
          const buyCost = Math.round(TRADE_LOT * v.prices[key])
          const sellGain = Math.round(TRADE_LOT * v.prices[key] * SELL_MARGIN)
          return (
            <li key={key}>
              <span className="trade__what">
                {info.icon} {info.name}
                <em>{v.prices[key].toFixed(1)}c a unit</em>
              </span>
              <button
                className="btn btn--tiny"
                disabled={state.credits < buyCost}
                onClick={() => onTrade(key, true)}
              >
                Buy {buyCost}c
              </button>
              <button
                className="btn btn--tiny"
                disabled={state.resources[key] < TRADE_LOT}
                onClick={() => onTrade(key, false)}
              >
                Sell {sellGain}c
              </button>
            </li>
          )
        })}
      </ul>

      {dock && (
        <label className="toggle">
          <input type="checkbox" checked={auto} onChange={(e) => onAutoAccept(e.target.checked)} />
          <span>Clear all traffic automatically at the {def(dock.kind).name}.</span>
        </label>
      )}
    </Modal>
  )
}
