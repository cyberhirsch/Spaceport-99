import {
  autoAccepting,
  def,
  defence,
  derive,
  dockOfficers,
  heldItems,
  lotsAboard,
  PHASE_LABEL,
  scanOf,
  sellMargin,
  visitorPhase,
} from '../game/engine.ts'
import { shipDef } from '../game/fleet.ts'
import { TRADE_LOT, scanReading, visitorDef } from '../game/visitors.ts'
import { factionDef } from '../game/factions.ts'
import { itemDef, stock } from '../game/gear.ts'
import { RESOURCE_INFO, type GameState, type ItemId, type ResourceKey } from '../game/types.ts'
import { CrewAvatar } from './CrewAvatar.tsx'
import { Modal } from './Modal.tsx'

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
  const claimed = visitorDef(v.claim)
  const dock = state.modules.find((m) => m.kind === 'dock' && !m.standby)
  const auto = autoAccepting(state)
  const officers = dockOfficers(state)
  const phase = visitorPhase(v)

  // A hull that is standing off is not here to trade and there is nothing to
  // buy from it. There is one thing to do, and this is where you do it.
  if (v.status === 'holding') {
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
          away someone who really is in trouble gets remembered — by the power whose paper they
          fly, which here is {factionDef(v.faction).name.toLowerCase()}.
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
            The clamps do not close themselves. Post somebody to the {def('dock').name} and they
            can be brought alongside.
          </p>
        )}

        {dock && (
          <label className="toggle">
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => onAutoAccept(e.target.checked)}
            />
            <span>
              Standing order to the desk: clear anything that hails. No more asking, and no more
              scans read before a hull is alongside.
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

      <h3 className="modal__sub">Trade — {TRADE_LOT} at a time</h3>
      <ul className="trade">
        {(['power', 'air', 'food'] as ResourceKey[]).map((key) => {
          const info = RESOURCE_INFO[key]
          const buyCost = Math.round(TRADE_LOT * v.prices[key])
          const sellGain = Math.round(TRADE_LOT * v.prices[key] * sellMargin(state))
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

      {lots > 0 && (
        <>
          <h3 className="modal__sub">
            Bonded cage ({state.bonded.length}/{lots})
          </h3>
          <p className="panel-note">
            Cargo bought to sell on rather than to use. It never touches the station's own tanks,
            and it is worth whatever the next hull to dock will pay — which is the whole risk.
          </p>

          {state.bonded.length > 0 && (
            <ul className="trade trade--bonded">
              {state.bonded.map((lot) => {
                const take = Math.round(lot.units * v.prices[lot.resource] * sellMargin(state))
                const swing = take - lot.paid
                return (
                  <li key={lot.id}>
                    <span className="trade__what">
                      {RESOURCE_INFO[lot.resource].icon} {lot.units}{' '}
                      {RESOURCE_INFO[lot.resource].name}
                      <em>
                        Cost {lot.paid}c off {factionDef(lot.from).short} ·{' '}
                        {swing >= 0 ? `up ${swing}c` : `down ${-swing}c`} at this hull's price
                      </em>
                    </span>
                    <button className="btn btn--tiny" onClick={() => onSellLot(lot.id)}>
                      Sell {take}c
                    </button>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="modal__actions">
            {(['power', 'air', 'food'] as ResourceKey[]).map((key) => {
              const cost = Math.round(TRADE_LOT * v.prices[key])
              const full = state.bonded.length >= lots
              return (
                <button
                  key={key}
                  className="btn btn--tiny"
                  disabled={full || state.credits < cost}
                  onClick={() => onBond(key)}
                  title={full ? 'The cage is full' : undefined}
                >
                  Bond {TRADE_LOT} {RESOURCE_INFO[key].name} — {cost}c
                </button>
              )
            })}
          </div>
        </>
      )}

      {stock(v.faction).length > 0 && (
        <>
          <h3 className="modal__sub">In the hold</h3>
          <ul className="trade trade--gear">
            {stock(v.faction).map(({ id, price }) => {
              const it = itemDef(id)
              return (
                <li key={id}>
                  <span className="trade__what">
                    {it.glyph} {it.name}
                    <em>{it.blurb}</em>
                  </span>
                  <button
                    className="btn btn--tiny"
                    disabled={state.credits < price || room <= 0}
                    onClick={() => onBuyGear(id)}
                    title={room <= 0 ? 'The hold is full — build a Cargo Hold' : undefined}
                  >
                    {room <= 0 ? 'Hold full' : `Buy ${price}c`}
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="panel-note">
            Kit goes into the hold — <b>{held}</b> of <b>{derived.holdCap}</b> racked. Issue it
            from a crew member's file: one sidearm and one layer of armour each.
          </p>
        </>
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
