import { sellMargin } from '../../game/engine.ts'
import { TRADE_LOT } from '../../game/visitors.ts'
import { factionDef } from '../../game/factions.ts'
import { RESOURCE_INFO, type GameState, type ResourceKey, type Visitor } from '../../game/types.ts'

interface Props {
  state: GameState
  v: Visitor
  lots: number
  onBond: (resource: ResourceKey) => void
  onSellLot: (lotId: string) => void
}

/**
 * Cargo bought to sell on rather than to use. It never touches the station's
 * own tanks, and it is worth whatever the next hull to dock will pay — which
 * is the whole risk.
 */
export const CagePanel = ({ state, v, lots, onBond, onSellLot }: Props) => (
  <>
    <h3 className="modal__sub">
      Bonded cage ({state.bonded.length}/{lots})
    </h3>
    <p className="panel-note">
      Cargo bought to sell on rather than to use. It never touches the station's own tanks, and it
      is worth whatever the next hull to dock will pay — which is the whole risk.
    </p>

    {state.bonded.length > 0 && (
      <ul className="trade trade--bonded">
        {state.bonded.map((lot) => {
          const take = Math.round(lot.units * v.prices[lot.resource] * sellMargin(state))
          const swing = take - lot.paid
          return (
            <li key={lot.id}>
              <span className="trade__what">
                {RESOURCE_INFO[lot.resource].icon} {lot.units} {RESOURCE_INFO[lot.resource].name}
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
)
