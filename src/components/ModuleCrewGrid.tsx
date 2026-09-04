import { effectiveness } from '../game/crew.ts'
import type { IncidentDef } from '../game/incidents.ts'
import type { Crew, StatKey, StationModule } from '../game/types.ts'
import type { DragState } from '../hooks/useDragAssign.ts'
import { CrewAvatar } from './CrewAvatar.tsx'

interface Props {
  m: StationModule
  slots: number
  staffed: Crew[]
  bench: Crew[]
  focus: StatKey
  idef: IncidentDef | null
  drag: DragState | null
  onDragStart: (crewId: string, e: React.PointerEvent) => void
  onAssign: (crewId: string, moduleId: string | null) => void
}

/** Who is working the room, and who is free to be sent in. */
export const ModuleCrewGrid = ({
  m,
  slots,
  staffed,
  bench,
  focus,
  idef,
  drag,
  onDragStart,
  onAssign,
}: Props) => (
  <>
    <h3 className="modal__sub">
      Crew ({staffed.length}/{slots})
    </h3>
    <div className="staff-grid">
      {staffed.map((c) => (
        <div key={c.id} className={`staff-chip${drag?.crewId === c.id ? ' is-lifted' : ''}`}>
          <span className="grip" onPointerDown={(e) => onDragStart(c.id, e)} title="Drag to another room">
            <CrewAvatar who={c} size={30} dead={c.dead} />
          </span>
          <span>
            {c.name}
            <em>
              {focus} {c.stats[focus]} · eff {effectiveness(c, focus).toFixed(1)}
            </em>
          </span>
          <button className="staff-chip__act" onClick={() => onAssign(c.id, null)} title="Send off duty">
            ✕
          </button>
        </div>
      ))}
      {staffed.length === 0 && <p className="panel-note">Empty. Nothing gets made without hands.</p>}
    </div>

    {slots > staffed.length && bench.length > 0 && (
      <>
        <h3 className="modal__sub">{idef ? `Send someone — best ${idef.counter} first` : 'Assign someone'}</h3>
        <div className="staff-grid">
          {bench.slice(0, 12).map((c) => (
            <button key={c.id} className="staff-chip staff-chip--add" onClick={() => onAssign(c.id, m.id)}>
              <CrewAvatar who={c} size={30} />
              <span>
                {c.name}
                <em>
                  {focus} {c.stats[focus]} · eff {effectiveness(c, focus).toFixed(1)}
                  {c.assignment ? ' · reassign' : ''}
                </em>
              </span>
              <i>＋</i>
            </button>
          ))}
        </div>
      </>
    )}
  </>
)
