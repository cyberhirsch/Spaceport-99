import { useState } from 'react'
import { SLOT_LABEL, itemDef } from '../game/gear.ts'
import type { ItemId, ItemSlot } from '../game/types.ts'

/**
 * Where a piece of kit's art lives, alongside the portraits. `BASE_URL`
 * matters: GitHub Pages serves the game from /<repo>/, so a bare "/gear/..."
 * would 404 there. Every file here is optional.
 */
const gearUrl = (item: ItemId): string => `${import.meta.env.BASE_URL}gear/${item}.webp`

interface Props {
  slot: ItemSlot
  /** What is in the slot, or undefined for an empty one. */
  item?: ItemId
  /** Frame edge in px. The dossier runs two of these across one column. */
  size?: number
}

/**
 * One equipment slot on the dossier: what is issued, or an empty frame.
 *
 * The art is optional. Until a render exists for a piece of kit the frame
 * falls back to its glyph, so the dossier reads correctly either way rather
 * than showing a broken image.
 */
export const GearSlot = ({ slot, item, size = 64 }: Props) => {
  const [missing, setMissing] = useState(false)
  const def = item ? itemDef(item) : null

  return (
    <div className={`kit${def ? '' : ' kit--empty'}`}>
      <span
        className="kit__frame"
        style={{ width: size, height: size }}
        title={
          def ? `${def.name} — ${def.blurb}` : `No ${SLOT_LABEL[slot].toLowerCase()} issued`
        }
      >
        {def && !missing ? (
          <img
            className="kit__art"
            src={gearUrl(def.id)}
            width={size}
            height={size}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setMissing(true)}
          />
        ) : (
          <i className="kit__glyph">{def ? def.glyph : '·'}</i>
        )}
      </span>
      <span className="kit__label">
        <em>{SLOT_LABEL[slot]}</em>
        <b>{def ? def.name : 'Empty'}</b>
      </span>
    </div>
  )
}
