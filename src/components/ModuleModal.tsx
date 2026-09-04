import {
  availableCrew,
  canDemolish,
  def,
  maxLevel,
  mergeBonus,
  scrapValue,
  staffSlots,
  upgradeCost,
  workRate,
} from '../game/engine.ts'
import { effectiveness } from '../game/crew.ts'
import { incidentDef } from '../game/incidents.ts'
import { STAT_INFO, type Crew, type GameState, type ItemId, type SpecId } from '../game/types.ts'
import type { DragState } from '../hooks/useDragAssign.ts'
import { ROOM_PANELS } from './room/index.ts'
import { Modal } from './Modal.tsx'
import { ModuleStats } from './ModuleStats.tsx'
import { ModuleCrewGrid } from './ModuleCrewGrid.tsx'
import { ModuleFootnotes } from './ModuleFootnotes.tsx'
import { ModuleActions } from './ModuleActions.tsx'

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
  canMove: boolean
  onMove: () => void
  onResearch: (spec: SpecId | null) => void
  onFabricate: (item: ItemId | null) => void
  onTalkPrisoner: (prisonerId: string) => void
  /** Opens the letter, and the decision about it. */
  onReadFile: () => void
  onDecideFile: () => void
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
  canMove,
  onMove,
  onResearch,
  onFabricate,
  onTalkPrisoner,
  onReadFile,
  onDecideFile,
}: Props) => {
  const m = state.modules.find((x) => x.id === moduleId)
  if (!m) return null
  const d = def(m.kind)
  const RoomPanel = ROOM_PANELS[m.kind]
  const crewById = new Map(state.crew.map((c) => [c.id, c]))
  const slots = staffSlots(m)
  const rate = workRate(m, crewById)
  const incident = state.incidents.find((i) => i.moduleId === m.id)
  const idef = incident ? incidentDef(incident.kind) : null
  // While a room is burning, what matters is who can put it out — not who is
  // good at the job the room normally does.
  const focus = idef ? idef.counter : d.stat
  const scrappable = canDemolish(state, m)
  const refund = scrapValue(state, m)
  const top = maxLevel(m)
  const upCost = upgradeCost(m)
  const bonus = Math.round((mergeBonus(m) - 1) * 100)
  const nextSlots = staffSlots({ ...m, level: m.level + 1 })
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
            Lv{m.level}/{top} · deck {m.deck + 1} · {m.width}×
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

      <ModuleStats m={m} d={d} rate={rate} secondsLeft={secondsLeft} bonus={bonus} />

      <ModuleCrewGrid
        m={m}
        slots={slots}
        staffed={staffed}
        bench={bench}
        focus={focus}
        idef={idef}
        drag={drag}
        onDragStart={onDragStart}
        onAssign={onAssign}
      />

      {RoomPanel && (
        <RoomPanel
          state={state}
          onResearch={onResearch}
          onFabricate={onFabricate}
          onTalkPrisoner={onTalkPrisoner}
          onReadFile={onReadFile}
          onDecideFile={onDecideFile}
        />
      )}

      <ModuleFootnotes
        m={m}
        d={d}
        top={top}
        bonus={bonus}
        nextSlots={nextSlots}
        onAutoAccept={onAutoAccept}
      />

      <ModuleActions
        m={m}
        d={d}
        credits={state.credits}
        top={top}
        upCost={upCost}
        refund={refund}
        scrappable={scrappable}
        staffedCount={staffed.length}
        incident={incident}
        cycle={cycle}
        canMove={canMove}
        onMove={onMove}
        onStandby={onStandby}
        onRush={onRush}
        onUpgrade={onUpgrade}
        onDemolish={onDemolish}
      />
    </Modal>
  )
}
