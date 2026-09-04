import { itemDef, stock } from '../../game/gear.ts'
import type { GameState, ItemId, Visitor } from '../../game/types.ts'

interface Props {
  state: GameState
  v: Visitor
  /** Kit already racked in the hold. */
  held: number
  /** Free space left in the hold. */
  room: number
  holdCap: number
  onBuyGear: (item: ItemId) => void
}

/** Whatever weapons and armour this hull's faction carries, for sale by the piece. */
export const KitPanel = ({ state, v, held, room, holdCap, onBuyGear }: Props) => (
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
      Kit goes into the hold — <b>{held}</b> of <b>{holdCap}</b> racked. Issue it from a crew
      member's file: one sidearm and one layer of armour each.
    </p>
  </>
)
