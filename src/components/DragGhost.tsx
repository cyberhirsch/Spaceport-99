import type { DragState } from '../hooks/useDragAssign.ts'
import type { GameState } from '../game/types.ts'
import { def } from '../game/engine.ts'
import { CrewAvatar } from './CrewAvatar.tsx'

/** The portrait that follows your finger, plus what dropping here would do. */
export const DragGhost = ({ drag, state }: { drag: DragState | null; state: GameState }) => {
  if (!drag) return null
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
