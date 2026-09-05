import { bearingPrerequisites, openThreads, questStageLabel } from '../game/engine.ts'
import { LOST, WATCHED_AT, knowsEnough, questSummary } from '../game/quest.ts'
import { OUTCOME_INFO, missionDef } from '../game/fleet.ts'
import type { GameState, Mission } from '../game/types.ts'
import { spanOf } from './saveText.ts'

/**
 * The board.
 *
 * Every mission in one place, in three kinds: the questline, the contracts,
 * and everything else with a clock on it. A contract is a mission; a bearing
 * is a mission that is not a contract; a hull standing off is not a mission
 * at all, but it is going to become one of your problems on a schedule, and
 * this is where the schedule is.
 */

interface Props {
  state: GameState
  onOpenMission: (id: string) => void
}

const Meter = ({ label, value, hot }: { label: string; value: number; hot?: boolean }) => (
  <span className="quest-meter">
    <em>{label}</em>
    <span className={`spec__bar${hot ? ' is-hot' : ''}`}>
      <i style={{ width: `${Math.round(Math.min(1, value) * 100)}%` }} />
    </span>
    <b>{Math.round(Math.min(1, value) * 100)}%</b>
  </span>
)

const ContractRow = ({ m, onOpen }: { m: Mission; onOpen: (id: string) => void }) => {
  const clock =
    m.status === 'offered'
      ? `expires in ${spanOf(m.expiresIn)}`
      : m.status === 'report'
        ? OUTCOME_INFO[m.outcome!].label
        : m.shape === 'open' && !m.recalled
          ? `${spanOf(m.aloft)} out`
          : `${spanOf(m.remaining)} to go`
  return (
    <li className={`mission${m.status === 'calling' ? ' mission--calling' : ''}`}>
      <span className="mission__name">
        {m.name}
        {m.far && <em className="mission__silent">far</em>}
        {m.obligation && <em className="mission__silent">tasked</em>}
      </span>
      <span className="mission__meta">
        {missionDef(m.kind).label} · {clock}
      </span>
      <span className="mission__acts">
        <button className="btn btn--ghost" onClick={() => onOpen(m.id)}>
          Details
        </button>
      </span>
    </li>
  )
}

export const MissionsPanel = ({ state, onOpenMission }: Props) => {
  const q = state.quest
  const onBoard = state.missions.find((m) => m.bearing && m.status !== 'report')
  const next = LOST.find((h) => !q.checked.includes(h.name))
  const steps = bearingPrerequisites(state)
  const contracts = state.missions.filter((m) => !m.bearing)
  const offered = contracts.filter((m) => m.status === 'offered')
  const flying = contracts.filter((m) => m.status === 'flying' || m.status === 'calling')
  const reports = contracts.filter((m) => m.status === 'report')
  const threads = openThreads(state)

  return (
    <div className="panel-body">
      <h3 className="modal__sub">The seven hulls</h3>
      <p className="panel-note">
        <b>{questStageLabel(q)}.</b>{' '}
        {q.stage !== 'none' && q.stage !== 'over' && questSummary(state)}
      </p>
      {q.stage !== 'none' && (
        <div className="quest-meters">
          <Meter label="checked" value={q.checked.length / LOST.length} />
          <Meter label="attention" value={q.attention} hot={q.attention >= WATCHED_AT} />
        </div>
      )}
      {q.stage !== 'none' && (
        <ul className="specs">
          {LOST.map((h, i) => {
            const done = q.checked.includes(h.name)
            const live = onBoard?.bearing === h.name
            const isNext = !done && !live && next?.name === h.name
            return (
              <li key={h.name} className={`spec${done ? ' spec--known' : ''}${live ? ' spec--live' : ''}`}>
                <span className="spec__head">
                  <b>
                    {i + 1}. {h.name}
                  </b>
                  <em>
                    {done
                      ? 'checked'
                      : live
                        ? onBoard!.status === 'offered'
                          ? 'on the board'
                          : `out — ${spanOf(onBoard!.remaining)}`
                        : h.far
                          ? 'past the envelope'
                          : 'near'}
                  </em>
                </span>
                <span className="spec__blurb">{done ? h.found : `Filed: ${h.filed}`}</span>
                {isNext && q.stage !== 'over' && steps.length > 0 && (
                  <ul className="checklist checklist--tight">
                    {steps.map((step) => (
                      <li key={step.text} className={step.done ? 'is-done' : ''}>
                        <i>{step.done ? '✓' : '○'}</i>
                        {step.text}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {q.stage !== 'none' && q.stage !== 'over' && (
        <p className="panel-note">
          {knowsEnough(q)
            ? 'Enough is known to decide. The file is in the Comms Array.'
            : `${Math.max(0, 3 - q.checked.length)} more to check before the file can be closed. Read it in the Comms Array.`}
        </p>
      )}

      <h3 className="modal__sub">Contracts ({contracts.filter((m) => m.status !== 'report').length})</h3>
      {contracts.length === 0 ? (
        <p className="panel-note">
          Nothing on the wire. Contracts come in through a staffed Command Module and launch from
          the Fleet tab.
        </p>
      ) : (
        <ul className="mission-list">
          {flying.map((m) => (
            <ContractRow key={m.id} m={m} onOpen={onOpenMission} />
          ))}
          {offered.map((m) => (
            <ContractRow key={m.id} m={m} onOpen={onOpenMission} />
          ))}
          {reports.map((m) => (
            <ContractRow key={m.id} m={m} onOpen={onOpenMission} />
          ))}
        </ul>
      )}

      <h3 className="modal__sub">Side quests ({threads.length})</h3>
      {threads.length === 0 ? (
        <p className="panel-note">Nothing is standing off, waiting, or counting down. Enjoy it.</p>
      ) : (
        <ul className="thread-list">
          {threads.map((t) => (
            <li key={t.id} className={`thread thread--${t.tone}`}>
              <span className="thread__head">
                <b>{t.title}</b>
                {t.clock !== undefined && <em className="thread__clock">{spanOf(t.clock)}</em>}
              </span>
              <span className="thread__detail">{t.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
