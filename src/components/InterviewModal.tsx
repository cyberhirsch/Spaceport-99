import { useState } from 'react'
import {
  PATIENCE_SECONDS,
  SIGN_THRESHOLD,
  bonusOffer,
  def,
  recruiterSkill,
  staffSlots,
  tacticEffect,
} from '../game/engine.ts'
import { STAT_INFO, STAT_KEYS, type GameState, type Tactic } from '../game/types.ts'
import { CrewAvatar } from './CrewAvatar.tsx'
import { Modal } from './Modal.tsx'
import { StatBars } from './StatBars.tsx'

interface Props {
  state: GameState
  candidateId: string
  onClose: () => void
  onTactic: (tactic: Tactic, moduleId?: string) => void
  onOffer: () => void
  onTurnAway: () => void
}

const RANK = ['drifter', 'deckhand', 'rated spacer', 'specialist', 'sought after']

export const InterviewModal = ({
  state,
  candidateId,
  onClose,
  onTactic,
  onOffer,
  onTurnAway,
}: Props) => {
  const [pickingPost, setPickingPost] = useState(false)
  const c = state.candidates.find((x) => x.id === candidateId)
  if (!c) return null

  const spent = (t: Tactic) => c.used.includes(t)
  const openings = state.modules.filter((m) => staffSlots(m) > 0 && m.staff.length < staffSlots(m))
  const best = STAT_KEYS.reduce((a, k) => (c.stats[k] > c.stats[a] ? k : a), STAT_KEYS[0])
  const odds = Math.round(c.interest)
  const promised = c.promised ? state.modules.find((m) => m.id === c.promised) : null

  if (c.arrivesIn > 0) {
    return (
      <Modal title="Inbound applicant" onClose={onClose}>
        <p className="panel-note">
          {c.name} is in transit from HQ — {Math.ceil(c.arrivesIn)}s out. The interview starts when
          they dock.
        </p>
      </Modal>
    )
  }

  return (
    <Modal
      wide
      onClose={onClose}
      title={<span className="modal__title">Interview · {c.name}</span>}
    >
      <div className="dossier">
        <div className="dossier__portrait">
          <CrewAvatar who={c} size={168} dossier />
        </div>
        <div className="dossier__id">
          <h3 className="dossier__name">{c.name}</h3>
          <dl className="dossier__facts">
            <div>
              <dt>Reputation</dt>
              <dd>{RANK[Math.min(RANK.length - 1, Math.floor(c.tier * RANK.length))]}</dd>
            </div>
            <div>
              <dt>Strongest</dt>
              <dd>
                {best} · {STAT_INFO[best].name}
              </dd>
            </div>
            <div>
              <dt>Asking</dt>
              <dd>{c.askingBonus}c</dd>
            </div>
            <div>
              <dt>Patience</dt>
              <dd>{Math.ceil(c.patience)}s</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="interest">
        <span className="interest__label">Interest</span>
        <span className="interest__track">
          <i style={{ width: `${(c.interest / SIGN_THRESHOLD) * 100}%` }} />
        </span>
        <b>{odds}%</b>
      </div>
      <span className="interest__patience">
        <i style={{ width: `${(c.patience / PATIENCE_SECONDS) * 100}%` }} />
      </span>

      <StatBars stats={c.stats} highlight={best} />

      <h3 className="modal__sub">Tactics · one shot each</h3>
      {pickingPost ? (
        <>
          <p className="panel-note">
            Promise them a post. Offer the job they are built for and they will bite; offer their
            worst and they will hold it against you.
          </p>
          <div className="posting__list">
            {openings.length === 0 && <p className="panel-note">No free posts to offer.</p>}
            {openings.map((m) => {
              const d = def(m.kind)
              const swing = tacticEffect(state, c, 'posting', m.id)
              return (
                <button
                  key={m.id}
                  className="posting__opt"
                  style={{ ['--room-hue' as string]: String(d.hue) }}
                  onClick={() => {
                    onTactic('posting', m.id)
                    setPickingPost(false)
                  }}
                >
                  <i>{d.glyph}</i>
                  <span>
                    {d.name}
                    <em>
                      deck {m.deck + 1} · needs {d.stat} · they have {c.stats[d.stat]}
                    </em>
                  </span>
                  <b className={swing >= 0 ? 'swing swing--up' : 'swing swing--down'}>
                    {swing >= 0 ? '+' : ''}
                    {swing}
                  </b>
                </button>
              )
            })}
          </div>
          <div className="modal__actions">
            <button className="btn" onClick={() => setPickingPost(false)}>
              Back
            </button>
          </div>
        </>
      ) : (
        <div className="tactics">
          <button
            className="tactic"
            disabled={spent('bonus') || bonusOffer(state, c) <= 0}
            onClick={() => onTactic('bonus')}
          >
            <span className="tactic__name">Signing bonus</span>
            <span className="tactic__note">
              {spent('bonus')
                ? 'Paid'
                : bonusOffer(state, c) < c.askingBonus
                  ? `All you have — ${bonusOffer(state, c)}c of their ${c.askingBonus}c ask`
                  : `Pay their ${c.askingBonus}c asking price`}
            </span>
            <b>+{tacticEffect(state, c, 'bonus')}</b>
          </button>

          <button className="tactic" disabled={spent('pitch')} onClick={() => onTactic('pitch')}>
            <span className="tactic__name">Pitch the station</span>
            <span className="tactic__note">
              {spent('pitch')
                ? 'Already made your case'
                : recruiterSkill(state) <= 0
                  ? 'Free — but nobody is staffing the dock to make the case'
                  : `Free — your liaison talks at ${recruiterSkill(state).toFixed(1)} Adaptability`}
            </span>
            <b>+{tacticEffect(state, c, 'pitch')}</b>
          </button>

          <button
            className="tactic"
            disabled={spent('posting') || openings.length === 0}
            onClick={() => setPickingPost(true)}
          >
            <span className="tactic__name">Promise a posting</span>
            <span className="tactic__note">
              {spent('posting')
                ? `Promised the ${promised ? def(promised.kind).name : 'post'}`
                : openings.length === 0
                  ? 'No free posts to offer'
                  : 'Match their strength and they will bite'}
            </span>
            <b>±</b>
          </button>
        </div>
      )}

      <div className="modal__actions">
        <button className="btn btn--primary" onClick={onOffer}>
          Offer the contract — {odds}% they sign
        </button>
        <button className="btn btn--danger" onClick={onTurnAway}>
          Send them back
        </button>
      </div>
    </Modal>
  )
}
