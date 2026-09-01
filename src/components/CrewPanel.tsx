import { BROADCAST_COST, def } from '../game/engine.ts'
import type { Derived } from '../game/engine.ts'
import { xpForLevel } from '../game/crew.ts'
import type { Crew, GameState } from '../game/types.ts'
import type { DragState } from '../hooks/useDragAssign.ts'
import { CrewAvatar } from './CrewAvatar.tsx'
import { hpStyle } from './meters.ts'

interface Props {
  state: GameState
  derived: Derived
  drag: DragState | null
  onDragStart: (crewId: string, e: React.PointerEvent) => void
  onSelect: (id: string) => void
  onAutoAssign: () => void
  onBroadcast: () => void
}

const bestStat = (c: Crew) =>
  (Object.entries(c.stats) as [keyof Crew['stats'], number][]).reduce((a, b) => (b[1] > a[1] ? b : a))

export const CrewPanel = ({ state, derived, drag, onDragStart, onSelect, onAutoAssign, onBroadcast }: Props) => {
  const commsStaffed = state.modules.some((m) => m.kind === 'comms' && m.staff.length > 0)
  const full = derived.crewAlive.length >= derived.crewCap
  const roster = [...state.crew].sort(
    (a, b) => Number(a.dead) - Number(b.dead) || b.level - a.level || a.name.localeCompare(b.name),
  )

  const broadcastLabel = !commsStaffed
    ? 'Comms Array needs staff'
    : full
      ? 'No free bunks'
      : state.broadcastCooldown > 0
        ? `Beacon cooling ${Math.ceil(state.broadcastCooldown)}s`
        : `Broadcast beacon — ${BROADCAST_COST}c`

  return (
    <div className="panel-body">
      <div className="crew-actions">
        <button className="btn btn--small" onClick={onAutoAssign} title="Send everyone to the job they are best at">
          Auto-assign roster
        </button>
        <button
          className="btn btn--small"
          onClick={onBroadcast}
          disabled={!commsStaffed || full || state.broadcastCooldown > 0 || state.credits < BROADCAST_COST}
        >
          {broadcastLabel}
        </button>
      </div>

      <ul className="crew-list">
        {roster.map((c) => {
          const job = c.assignment ? state.modules.find((m) => m.id === c.assignment) : null
          const [statKey, statValue] = bestStat(c)
          return (
            <li key={c.id}>
              <div className={`crew-row${c.dead ? ' is-dead' : ''}${drag?.crewId === c.id ? ' is-lifted' : ''}`}>
                <span
                  className="grip"
                  onPointerDown={(e) => (c.dead ? undefined : onDragStart(c.id, e))}
                  title={c.dead ? c.name : `${c.name} — drag to a room`}
                >
                  <CrewAvatar seed={c.seed} size={38} dead={c.dead} />
                </span>
                <button className="crew-row__text" onClick={() => onSelect(c.id)}>
                  <span className="crew-row__name">
                    {c.name} <em>Lv{c.level}</em>
                  </span>
                  <span className="crew-row__job">
                    {c.dead ? 'Deceased' : job ? def(job.kind).name : 'Off duty'}
                    <i> · best {statKey} {statValue}</i>
                  </span>
                  <span className="crew-row__bars">
                    <span className="minibar minibar--hp" title={`${Math.round(c.hp)}/${c.maxHp} hp`}>
                      <i style={hpStyle(c.hp / c.maxHp)} />
                    </span>
                    <span className="minibar minibar--xp" title={`${Math.round(c.xp)}/${xpForLevel(c.level)} xp`}>
                      <i style={{ width: `${(c.xp / xpForLevel(c.level)) * 100}%` }} />
                    </span>
                    <span className="minibar minibar--mood" title={`Morale ${Math.round(c.morale * 100)}%`}>
                      <i style={{ width: `${c.morale * 100}%` }} />
                    </span>
                  </span>
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
