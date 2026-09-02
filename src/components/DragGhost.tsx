import type { DragState } from '../hooks/useDragAssign.ts'
import type { GameState } from '../game/types.ts'
import { def, moveCost } from '../game/engine.ts'
import { CrewAvatar } from './CrewAvatar.tsx'

/** The portrait that follows your finger, plus what dropping here would do. */
export const DragGhost = ({ drag, state }: { drag: DragState | null; state: GameState }) => {
  if (!drag) return null
  if (drag.roomId) {
    const room = state.modules.find((m) => m.id === drag.roomId)
    if (!room) return null
    const d = def(room.kind)
    return (
      <div
        className={`ghost ghost--room${drag.valid ? ' ghost--ok' : ''}${
          drag.overCell && !drag.valid ? ' ghost--no' : ''
        }`}
        style={{ transform: `translate3d(${drag.x}px, ${drag.y}px, 0)`, ['--room-hue' as string]: String(d.hue) }}
        aria-hidden="true"
      >
        <i className="ghost__glyph">{d.glyph}</i>
        <span>
          {d.short}
          {drag.valid ? ` — ${moveCost(room)}c` : ''}
        </span>
      </div>
    )
  }
  const crew = state.crew.find((c) => c.id === drag.crewId)
  if (!crew) return null
  const target = drag.overModule ? state.modules.find((m) => m.id === drag.overModule) : null
  const label = drag.overDock
    ? 'Off duty'
    : target
      ? `${def(target.kind).name}${drag.valid ? '' : ' — full'}`
      : crew.name

  return (
    <div
      className={`ghost${drag.overDock || drag.valid ? ' ghost--ok' : ''}${
        target && !drag.valid ? ' ghost--no' : ''
      }`}
      style={{ transform: `translate3d(${drag.x}px, ${drag.y}px, 0)` }}
      aria-hidden="true"
    >
      <CrewAvatar who={crew} size={44} />
      <span>{label}</span>
    </div>
  )
}
