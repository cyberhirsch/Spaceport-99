import {
  autoAccepting,
  def,
  derive,
  dockOfficers,
  heldItems,
  lotsAboard,
  PHASE_LABEL,
  visitorPhase,
} from '../game/engine.ts'
import { shipDef } from '../game/fleet.ts'
import { visitorDef } from '../game/visitors.ts'
import { factionDef } from '../game/factions.ts'
import { stock } from '../game/gear.ts'
import { type GameState, type ItemId, type ResourceKey } from '../game/types.ts'
import { CrewAvatar } from './CrewAvatar.tsx'
import { Modal } from './Modal.tsx'
import { TradePanel } from './visitor/TradePanel.tsx'
import { CagePanel } from './visitor/CagePanel.tsx'
import { KitPanel } from './visitor/KitPanel.tsx'
import { HailPanel } from './visitor/HailPanel.tsx'
import { HoldingPanel } from './visitor/HoldingPanel.tsx'

interface Props {
  state: GameState
  visitorId: string
  onClose: () => void
  onAccept: () => void
  onRefuse: () => void
  onTrade: (resource: ResourceKey, buy: boolean) => void
  onBuyGear: (item: ItemId) => void
  onBond: (resource: ResourceKey) => void
  onSellLot: (lotId: string) => void
  onSelectGuest: (guestId: string) => void
  onAutoAccept: (on: boolean) => void
  onTalk: () => void
  /** Opens the approach a passenger is carrying, when there is one. */
  onTalkQuiet: () => void
}

export const VisitorModal = ({
  state,
  visitorId,
  onClose,
  onAccept,
  onRefuse,
  onTrade,
  onBuyGear,
  onBond,
  onSellLot,
  onSelectGuest,
  onAutoAccept,
  onTalk,
  onTalkQuiet,
}: Props) => {
  const v = state.visitors.find((x) => x.id === visitorId)
  const derived = derive(state)
  const lots = lotsAboard(state)
  const held = heldItems(state)
  const room = derived.holdCap - held
  if (!v) return null
  const hull = shipDef(v.cls)
  const dock = state.modules.find((m) => m.kind === 'dock' && !m.standby)
  const auto = autoAccepting(state)
  const officers = dockOfficers(state)
  const phase = visitorPhase(v)

  // A hull that is standing off is not here to trade and there is nothing to
  // buy from it. There is one thing to do, and this is where you do it.
  if (v.status === 'holding') {
    return <HoldingPanel state={state} v={v} onClose={onClose} onTalkQuiet={onTalkQuiet} />
  }

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
      <HailPanel
        state={state}
        v={v}
        dock={dock}
        auto={auto}
        officers={officers}
        onClose={onClose}
        onAccept={onAccept}
        onRefuse={onRefuse}
        onTalk={onTalk}
        onAutoAccept={onAutoAccept}
      />
    )
  }

  return (
    <Modal onClose={onClose} title={<span className="modal__title">{v.name}</span>}>
      <div className="hail">
        <span className="hail__glyph">{hull.glyph}</span>
        <span>
          <b>{visitorDef(v.kind).label}</b>
          <em>
            {hull.name} · {factionDef(v.faction).short} paper · {PHASE_LABEL[phase]}, leaving in{' '}
            {Math.ceil(v.timer)}s
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

      <TradePanel state={state} v={v} onTrade={onTrade} />

      {lots > 0 && (
        <CagePanel state={state} v={v} lots={lots} onBond={onBond} onSellLot={onSellLot} />
      )}

      {stock(v.faction).length > 0 && (
        <KitPanel
          state={state}
          v={v}
          held={held}
          room={room}
          holdCap={derived.holdCap}
          onBuyGear={onBuyGear}
        />
      )}

      <div className="modal__actions">
        <button className="btn btn--primary" onClick={onTalk}>
          Talk to the master
        </button>
        {v.covert && (
          <button className="btn btn--quiet" onClick={onTalkQuiet}>
            Somebody wants a word
          </button>
        )}
        {v.claiming && (
          <button className="btn btn--quiet" onClick={onTalkQuiet}>
            They are asking after your prisoner
          </button>
        )}
      </div>

      {dock && (
        <label className="toggle">
          <input type="checkbox" checked={auto} onChange={(e) => onAutoAccept(e.target.checked)} />
          <span>Clear all traffic automatically at the {def(dock.kind).name}.</span>
        </label>
      )}
    </Modal>
  )
}
