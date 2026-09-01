import { MAX_LEVEL, def, staffSlots, upgradeCost, workRate } from '../game/engine'
import { effectiveness } from '../game/crew'
import { cycleCredits, cycleYield, powerDraw } from '../game/modules'
import { incidentDef } from '../game/incidents'
import { RESOURCE_INFO, STAT_INFO, type Crew, type GameState } from '../game/types'
import type { DragState } from '../hooks/useDragAssign'
import { CrewAvatar } from './CrewAvatar'
import { Modal } from './Modal'

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
}: Props) => {
  const m = state.modules.find((x) => x.id === moduleId)
  if (!m) return null
  const d = def(m.kind)
  const crewById = new Map(state.crew.map((c) => [c.id, c]))
  const slots = staffSlots(m)
  const rate = workRate(m, crewById)
  const incident = state.incidents.find((i) => i.moduleId === m.id)
  const upCost = upgradeCost(m)
  const staffed: Crew[] = m.staff.map((id) => crewById.get(id)).filter(Boolean) as Crew[]
  const bench = state.crew
    .filter((c) => !c.dead && c.assignment !== m.id)
    .sort((a, b) => effectiveness(b, d.stat) - effectiveness(a, d.stat))

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

      {incident && (
        <div className="alarm-box">
          <strong>
            {incidentDef(incident.kind).glyph} {incidentDef(incident.kind).name}
          </strong>
          <span>
            Crew here fight it with <b>{incidentDef(incident.kind).counter}</b> ·{' '}
            {STAT_INFO[incidentDef(incident.kind).counter].name}. Send your best.
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
          <dd>{powerDraw(m).toFixed(1)} /s</dd>
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
              <CrewAvatar seed={c.seed} size={30} dead={c.dead} />
            </span>
            <span>
              {c.name}
              <em>
                {d.stat} {c.stats[d.stat]} · eff {effectiveness(c, d.stat).toFixed(1)}
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
          <h3 className="modal__sub">Assign someone</h3>
          <div className="staff-grid">
            {bench.slice(0, 12).map((c) => (
              <button
                key={c.id}
                className="staff-chip staff-chip--add"
                onClick={() => onAssign(c.id, m.id)}
              >
                <CrewAvatar seed={c.seed} size={30} />
                <span>
                  {c.name}
                  <em>
                    {d.stat} {c.stats[d.stat]} · eff {effectiveness(c, d.stat).toFixed(1)}
                    {c.assignment ? ' · reassign' : ''}
                  </em>
                </span>
                <i>＋</i>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="modal__actions">
        {cycle && (
          <button
            className="btn"
            disabled={m.staff.length === 0 || Boolean(incident)}
            onClick={onRush}
            title="Finish this cycle instantly — but something might go badly wrong"
          >
            Rush · {Math.round(m.rushRisk * 100)}% risk
          </button>
        )}
        <button className="btn" disabled={m.level >= MAX_LEVEL || state.credits < upCost} onClick={onUpgrade}>
          {m.level >= MAX_LEVEL ? 'Max level' : `Upgrade — ${upCost}c`}
        </button>
        <button className="btn btn--danger" disabled={Boolean(incident)} onClick={onDemolish}>
          Scrap
        </button>
      </div>
    </Modal>
  )
}
