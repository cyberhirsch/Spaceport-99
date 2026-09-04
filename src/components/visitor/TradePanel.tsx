import { sellMargin } from '../../game/engine.ts'
import { TRADE_LOT } from '../../game/visitors.ts'
import { RESOURCE_INFO, type GameState, type ResourceKey, type Visitor } from '../../game/types.ts'

interface Props {
  state: GameState
  v: Visitor
  onTrade: (resource: ResourceKey, buy: boolean) => void
}

/** Power, air and food, bought and sold a lot at a time at whatever this hull is asking. */
export const TradePanel = ({ state, v, onTrade }: Props) => (
  <>
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
  </>
)
