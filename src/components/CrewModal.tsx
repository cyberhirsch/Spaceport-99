import { REVIVE_COST_PER_LEVEL, def, staffSlots } from '../game/engine.ts'
import { effectiveness, xpForLevel } from '../game/crew.ts'
import type { GameState } from '../game/types.ts'
import { CrewAvatar } from './CrewAvatar.tsx'
import { hpStyle } from './meters.ts'
import { Modal } from './Modal.tsx'
import { StatBars } from './StatBars.tsx'

interface Props {
  state: GameState
  crewId: string
  onClose: () => void
  onAssign: (crewId: string, moduleId: string | null) => void
  onRevive: () => void
  onDismiss: () => void
}

export const CrewModal = ({ state, crewId, onClose, onAssign, onRevive, onDismiss }: Props) => {
  const c = state.crew.find((x) => x.id === crewId)
  if (!c) return null
  const job = c.assignment ? state.modules.find((m) => m.id === c.assignment) : null
  const openings = state.modules
    .filter((m) => staffSlots(m) > 0 && m.id !== c.assignment && m.staff.length < staffSlots(m))
    .sort((a, b) => effectiveness(c, def(b.kind).stat) - effectiveness(c, def(a.kind).stat))
  const reviveCost = REVIVE_COST_PER_LEVEL * c.level

  return (
    <Modal
      onClose={onClose}
      title={
        <span className="modal__title">
          <CrewAvatar seed={c.seed} size={34} dead={c.dead} />
          {c.name}
          <em>Level {c.level}</em>
        </span>
      }
    >
      <div className="crew-meters">
        <label>
          <span>Health</span>
          <span className="minibar minibar--hp">
            <i style={hpStyle(c.hp / c.maxHp)} />
          </span>
          <b>
            {Math.round(c.hp)}/{c.maxHp}
          </b>
        </label>
        <label>
          <span>Experience</span>
          <span className="minibar minibar--xp">
            <i style={{ width: `${(c.xp / xpForLevel(c.level)) * 100}%` }} />
          </span>
          <b>
            {Math.round(c.xp)}/{xpForLevel(c.level)}
          </b>
        </label>
        <label>
          <span>Morale</span>
          <span className="minibar minibar--mood">
            <i style={{ width: `${c.morale * 100}%` }} />
          </span>
          <b>{Math.round(c.morale * 100)}%</b>
        </label>
      </div>

      <h3 className="modal__sub">O.R.B.I.T.A.L.</h3>
      <StatBars stats={c.stats} highlight={job ? def(job.kind).stat : undefined} />

      {c.dead ? (
        <div className="modal__actions">
          <button className="btn" disabled={state.credits < reviveCost} onClick={onRevive}>
            Revive — {reviveCost}c
          </button>
          <button className="btn btn--danger" onClick={onDismiss}>
            Commit to the void
          </button>
        </div>
      ) : (
        <>
          <h3 className="modal__sub">Posting</h3>
          <div className="posting">
            <button
              className={`posting__opt${!job ? ' is-current' : ''}`}
              onClick={() => onAssign(c.id, null)}
              disabled={!job}
            >
              Off duty
            </button>
            {job && (
              <span className="posting__current">
                Currently: <strong>{def(job.kind).name}</strong> (deck {job.deck + 1})
              </span>
            )}
          </div>
          <div className="posting__list">
            {openings.length === 0 && <p className="panel-note">No free posts. Build or upgrade a room.</p>}
            {openings.map((m) => {
              const d = def(m.kind)
              return (
                <button
                  key={m.id}
                  className="posting__opt"
                  style={{ ['--room-hue' as string]: String(d.hue) }}
                  onClick={() => onAssign(c.id, m.id)}
                >
                  <i>{d.glyph}</i>
                  <span>
                    {d.name}
                    <em>
                      deck {m.deck + 1} · {d.stat} {c.stats[d.stat]} · eff{' '}
                      {effectiveness(c, d.stat).toFixed(1)}
                    </em>
                  </span>
                </button>
              )
            })}
          </div>
          <div className="modal__actions">
            <button className="btn btn--danger" onClick={onDismiss}>
              Dismiss from station
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}
