import { REQUEST_COST, appeal, awayCrewIds, dockBerths, def } from '../game/engine.ts'
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
  onSelectCandidate: (id: string) => void
  onAutoAssign: () => void
  onRequestCrew: () => void
}

const bestStat = (c: Crew) =>
  (Object.entries(c.stats) as [keyof Crew['stats'], number][]).reduce((a, b) => (b[1] > a[1] ? b : a))

export const CrewPanel = ({
  state,
  derived,
  drag,
  onDragStart,
  onSelect,
  onSelectCandidate,
  onAutoAssign,
  onRequestCrew,
}: Props) => {
  const commsStaffed = state.modules.some((m) => m.kind === 'comms' && m.staff.length > 0)
  const full = derived.crewAlive.length >= derived.crewCap
  const roster = [...state.crew].sort(
    (a, b) => Number(a.dead) - Number(b.dead) || b.level - a.level || a.name.localeCompare(b.name),
  )
  const away = awayCrewIds(state)
  const berths = dockBerths(state)
  const waiting = state.candidates.length
  const standing = Math.round(appeal(state) * 100)

  const requestLabel = !berths
    ? 'Build a Docking Port'
    : !commsStaffed
      ? 'Comms Array needs staff'
      : full
        ? 'No free bunks'
        : waiting >= berths
          ? 'Every berth is occupied'
          : state.broadcastCooldown > 0
            ? `HQ busy — ${Math.ceil(state.broadcastCooldown)}s`
            : `Request crew from HQ — ${REQUEST_COST}c`

  const canRequest =
    Boolean(berths) &&
    commsStaffed &&
    !full &&
    waiting < berths &&
    state.broadcastCooldown <= 0 &&
    state.credits >= REQUEST_COST

  return (
    <div className="panel-body">
      <div className="crew-actions">
        <button className="btn btn--small" onClick={onAutoAssign} title="Send everyone to the job they are best at">
          Auto-assign roster
        </button>
        <button className="btn btn--small" onClick={onRequestCrew} disabled={!canRequest}>
          {requestLabel}
        </button>
      </div>

      <p className="panel-note">
        Station standing <b>{standing}%</b> — HQ sends people worth the posting, so the better this
        reads, the better the applicants.
      </p>

      {waiting > 0 && (
        <>
          <h3 className="modal__sub">
            Applicants ({waiting}/{berths})
          </h3>
          <ul className="crew-list crew-list--applicants">
            {state.candidates.map((cand) => (
              <li key={cand.id}>
                <button className="crew-row" onClick={() => onSelectCandidate(cand.id)}>
                  <CrewAvatar who={cand} size={38} />
                  <span className="crew-row__text">
                    <span className="crew-row__name">{cand.name}</span>
                    <span className="crew-row__job">
                      {cand.arrivesIn > 0
                        ? `In transit — ${Math.ceil(cand.arrivesIn)}s out`
                        : `Waiting · ${Math.round(cand.interest)}% interested · ${Math.ceil(
                            cand.patience,
                          )}s`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <h3 className="modal__sub">Crew</h3>
        </>
      )}

      <ul className="crew-list">
        {roster.map((c) => {
          const job = c.assignment ? state.modules.find((m) => m.id === c.assignment) : null
          const [statKey, statValue] = bestStat(c)
          return (
            <li key={c.id}>
              <div
                className={`crew-row${c.dead ? ' is-dead' : ''}${
                  away.has(c.id) ? ' is-away' : ''
                }${drag?.crewId === c.id ? ' is-lifted' : ''}`}
              >
                <span
                  className="grip"
                  onPointerDown={(e) => (c.dead || away.has(c.id) ? undefined : onDragStart(c.id, e))}
                  title={
                    c.dead || away.has(c.id) ? c.name : `${c.name} — drag to a room`
                  }
                >
                  <CrewAvatar who={c} size={38} dead={c.dead} />
                </span>
                <button className="crew-row__text" onClick={() => onSelect(c.id)}>
                  <span className="crew-row__name">
                    {c.name} <em>Lv{c.level}</em>
                  </span>
                  <span className="crew-row__job">
                    {c.dead
                      ? 'Deceased'
                      : away.has(c.id)
                        ? 'Away on a mission'
                        : job
                          ? def(job.kind).name
                          : 'Off duty'}
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
