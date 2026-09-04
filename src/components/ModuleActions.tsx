import { useState } from 'react'
import { moveCost } from '../game/engine.ts'
import type { Incident, ModuleDef, StationModule } from '../game/types.ts'
import { ConfirmModal } from './ConfirmModal.tsx'

interface Props {
  m: StationModule
  d: ModuleDef
  credits: number
  top: number
  upCost: number
  refund: number
  scrappable: boolean
  staffedCount: number
  incident?: Incident
  cycle?: number
  canMove: boolean
  onMove: () => void
  onStandby: (standby: boolean) => void
  onRush: () => void
  onUpgrade: () => void
  onDemolish: () => void
}

/** Move, power, rush, upgrade, scrap — and the "are you sure" on the way out. */
export const ModuleActions = ({
  m,
  d,
  credits,
  top,
  upCost,
  refund,
  scrappable,
  staffedCount,
  incident,
  cycle,
  canMove,
  onMove,
  onStandby,
  onRush,
  onUpgrade,
  onDemolish,
}: Props) => {
  const [scrapping, setScrapping] = useState(false)

  return (
    <>
      <div className="modal__actions">
        <button
          className="btn"
          disabled={!canMove || credits < moveCost(m)}
          onClick={onMove}
          title={
            canMove
              ? 'Cut it loose and set it down somewhere else'
              : 'Nowhere to put it — free a slot at the end of a wing first'
          }
        >
          Move — {moveCost(m)}c
        </button>
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
          disabled={m.level >= top || credits < upCost || m.standby}
          onClick={onUpgrade}
          title={m.level >= top && m.width === 1 ? 'Merge it into a run to go further' : undefined}
        >
          {m.level >= top ? (m.width === 1 ? 'Max — merge to go on' : 'Max level') : `Upgrade — ${upCost}c`}
        </button>
        <button
          className="btn btn--danger"
          disabled={!scrappable}
          onClick={() => setScrapping(true)}
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

      {scrapping && (
        <ConfirmModal
          title={`Scrap the ${d.name}?`}
          confirmLabel={`Scrap it — +${refund}c`}
          onCancel={() => setScrapping(false)}
          onConfirm={() => {
            setScrapping(false)
            onDemolish()
          }}
        >
          It comes apart for <b>{refund}c</b>, half what it cost to put up.
          {staffedCount > 0 && (
            <>
              {' '}
              The {staffedCount === 1 ? 'one person' : `${staffedCount} people`} working it{' '}
              {staffedCount === 1 ? 'goes' : 'go'} off duty.
            </>
          )}{' '}
          There is no putting it back without paying for it again.
        </ConfirmModal>
      )}
    </>
  )
}
