import {
  MAX_LEVEL,
  availableCrew,
  canDemolish,
  def,
  staffSlots,
  upgradeCost,
  workRate,
} from '../game/engine.ts'
import { effectiveness } from '../game/crew.ts'
import { cycleCredits, cycleYield, powerDraw } from '../game/modules.ts'
import { incidentDef } from '../game/incidents.ts'
import { RESOURCE_INFO, STAT_INFO, type Crew, type GameState } from '../game/types.ts'
import type { DragState } from '../hooks/useDragAssign.ts'
import { CrewAvatar } from './CrewAvatar.tsx'
import { Modal } from './Modal.tsx'

interface Props {
  state: GameState
  moduleId: string
  drag: DragState | null
  onDragStart: (crewId: string, e: React.PointerEvent) => void
  onClose: () => void
  onAssign: (crewId: string, moduleId: string | null) => void
  onUpgrade: () => void
  onRush: () => void
  onDemolish: () => void
  onStandby: (standby: boolean) => void
  onAutoAccept: (on: boolean) => void
}

export const ModuleModal = ({
  state,
  moduleId,
  drag,
  onDragStart,
  onClose,
  onAssign,
  onUpgrade,
  onRush,
  onDemolish,
  onStandby,
  onAutoAccept,
}: Props) => {
  const m = state.modules.find((x) => x.id === moduleId)
  if (!m) return null
  const d = def(m.kind)
  const crewById = new Map(state.crew.map((c) => [c.id, c]))
  const slots = staffSlots(m)
  const rate = workRate(m, crewById)
  const incident = state.incidents.find((i) => i.moduleId === m.id)
  const idef = incident ? incidentDef(incident.kind) : null
  // While a room is burning, what matters is who can put it out — not who is
  // good at the job the room normally does.
  const focus = idef ? idef.counter : d.stat
  const scrappable = canDemolish(state, m)
  const upCost = upgradeCost(m)
  const staffed: Crew[] = m.staff.map((id) => crewById.get(id)).filter(Boolean) as Crew[]
  const bench = availableCrew(state)
    .filter((c) => c.assignment !== m.id)
    .sort((a, b) => effectiveness(b, focus) - effectiveness(a, focus))

  const cycle = d.cycleSeconds
  const secondsLeft = cycle && rate > 0 ? ((1 - m.progress) * cycle) / rate : null

  return (
    <Modal
      wide
      onClose={onClose}
      title={
        <span className="modal__title" style={{ ['--room-hue' as string]: String(d.hue) }}>
          <i className="modal__glyph">{d.glyph}</i>
          {d.name}
          <em>
            Lv{m.level} · deck {m.deck + 1} · {m.width}×
          </em>
        </span>
      }
    >
      <p className="panel-note">{d.blurb}</p>

      {incident && idef && (
        <div className="alarm-box">
          <strong>
            {idef.glyph} {idef.name}
          </strong>
          <span>
            Crew here fight it with <b>{idef.counter}</b> · {STAT_INFO[idef.counter].name}. The
            roster below is ranked on that, not on the room's usual work. Anyone you send back
            returns to their own station once it is out.
          </span>
          <span className="alarm-box__bar">
            <i style={{ width: `${(incident.hp / incident.maxHp) * 100}%` }} />
          </span>
        </div>
      )}

      <dl className="kv">
        <div>
          <dt>Driven by</dt>
          <dd>
            {d.stat} · {STAT_INFO[d.stat].name}
          </dd>
        </div>
        <div>
          <dt>Output</dt>
          <dd>
            {d.produces
              ? `${Math.round(cycleYield(m))} ${RESOURCE_INFO[d.produces].name} / cycle`
              : d.credits
                ? `${Math.round(cycleCredits(m))}c / cycle`
                : d.trains
                  ? `+1 ${d.trains} per cycle`
                  : d.heals
                    ? 'Heals crew station-wide'
                    : '—'}
          </dd>
        </div>
        <div>
          <dt>Speed</dt>
          <dd>{rate <= 0 ? 'stalled' : `${Math.round(rate * 100)}%`}</dd>
        </div>
        <div>
          <dt>Power draw</dt>
          <dd>
            {powerDraw(m).toFixed(1)} /s{m.standby ? ' · standby' : ''}
          </dd>
        </div>
        <div>
          <dt>Condition</dt>
          <dd>{Math.round(m.condition * 100)}%</dd>
        </div>
        <div>
          <dt>Cycle</dt>
          <dd>{secondsLeft === null ? '—' : `${secondsLeft.toFixed(0)}s left`}</dd>
        </div>
      </dl>

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
              <button
                key={c.id}
                className="staff-chip staff-chip--add"
                onClick={() => onAssign(c.id, m.id)}
              >
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

      {d.repairs && (
        <p className="panel-note">
          While staffed, its damage-control party works the station's worst-damaged rooms back
          towards sound. It will not touch a room that is currently on fire.
        </p>
      )}

      {m.kind === 'dock' && (
        <label className="toggle">
          <input
            type="checkbox"
            checked={Boolean(m.autoAccept)}
            onChange={(e) => onAutoAccept(e.target.checked)}
          />
          <span>
            Clear traffic automatically. Ships dock without asking — convenient, and nobody reads
            the scan before the clamps open.
          </span>
        </label>
      )}

      {m.standby && (
        <p className="panel-note">
          Powered down. It draws a tenth of its usual load and does nothing at all until you bring
          it back.
        </p>
      )}

      <div className="modal__actions">
        <button className="btn" onClick={() => onStandby(!m.standby)} disabled={Boolean(incident)}>
          {m.standby ? 'Bring online' : 'Power down'}
        </button>
        {cycle && (
          <button
            className="btn"
            disabled={m.staff.length === 0 || Boolean(incident) || m.standby}
            onClick={onRush}
            title="Finish this cycle instantly — but something might go badly wrong"
          >
            Rush · {Math.round(m.rushRisk * 100)}% risk
          </button>
        )}
        <button
          className="btn"
          disabled={m.level >= MAX_LEVEL || state.credits < upCost || m.standby}
          onClick={onUpgrade}
        >
          {m.level >= MAX_LEVEL ? 'Max level' : `Upgrade — ${upCost}c`}
        </button>
        <button
          className="btn btn--danger"
          disabled={!scrappable}
          onClick={onDemolish}
          title={
            incident
              ? 'Deal with the emergency first'
              : scrappable
                ? 'Reclaim half the build cost'
                : 'Scrap the room at the end of this wing first'
          }
        >
          Scrap
        </button>
      </div>
    </Modal>
  )
}
