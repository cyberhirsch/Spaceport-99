import { useState } from 'react'
import {
  SIGN_THRESHOLD,
  bonusOffer,
  def,
  fleetCapacity,
  recruiterSkill,
  staffSlots,
  tacticEffect,
} from '../game/engine.ts'
import { visitorDef } from '../game/visitors.ts'
import { shipDef } from '../game/fleet.ts'
import { STAT_INFO, STAT_KEYS, type GameState, type Tactic } from '../game/types.ts'
import { CrewAvatar } from './CrewAvatar.tsx'
import { Modal } from './Modal.tsx'
import { StatBars } from './StatBars.tsx'

interface Props {
  state: GameState
  guestId: string
  crewRoom: number
  onClose: () => void
  onAnswer: (yes: boolean) => void
  onTactic: (tactic: Tactic, moduleId?: string) => void
  onSign: () => void
  onOpenShip: (visitorId: string) => void
}

/**
 * Someone off a berthed hull. They may have business to raise, and they can
 * always be asked to stay — the ship's master hardest of all, because talking
 * one round means talking them off their own bridge.
 */
export const GuestModal = ({
  state,
  guestId,
  crewRoom,
  onClose,
  onAnswer,
  onTactic,
  onSign,
  onOpenShip,
}: Props) => {
  const [pickingPost, setPickingPost] = useState(false)
  const ship = state.visitors.find((v) => v.aboard.some((x) => x.id === guestId))
  const g = ship?.aboard.find((x) => x.id === guestId)
  if (!ship || !g) return null

  const hull = shipDef(ship.cls)
  const spent = (t: Tactic) => g.used.includes(t)
  const openings = state.modules.filter((m) => staffSlots(m) > 0 && m.staff.length < staffSlots(m))
  const best = STAT_KEYS.reduce((a, k) => (g.stats[k] > g.stats[a] ? k : a), STAT_KEYS[0])
  const promised = g.promised ? state.modules.find((m) => m.id === g.promised) : null
  const odds = Math.round(g.interest)
  const berthFree = state.ships.length < fleetCapacity(state)

  return (
    <Modal wide onClose={onClose} title={<span className="modal__title">{g.name}</span>}>
      <div className="hail">
        <CrewAvatar who={g} size={56} />
        <span>
          <b>
            {g.role}
            {/* "ship's master · master" reads badly; a courier or a lane
                officer is one without the word being in their job title. */}
            {g.captain && !g.role.includes('master') ? ' · master' : ''}
          </b>
          <em>
            off the {ship.name} · {hull.name} · {visitorDef(ship.kind).label.toLowerCase()} ·{' '}
            {Math.ceil(ship.timer)}s to undock
          </em>
        </span>
      </div>

      {g.offer && (
        <div className="offer">
          <strong>{g.offer.title}</strong>
          <p>{g.offer.prompt}</p>
          <div className="modal__actions">
            <button className="btn btn--primary" onClick={() => onAnswer(true)}>
              {g.offer.yes ?? 'Take it'}
            </button>
            <button className="btn" onClick={() => onAnswer(false)}>
              {g.offer.no ?? 'Leave it'}
            </button>
          </div>
        </div>
      )}

      <h3 className="modal__sub">Talk them into staying</h3>
      <p className="panel-note">
        {g.captain
          ? `A ship's master does not sign off a bridge for money. Only a station worth moving to will do it — and the ${ship.name} comes with them${
              berthFree ? '.' : ', but every hangar berth is full, so she would be sold dockside.'
            }`
          : `They have a berth already, which is the whole difficulty. Asking is a one-shot: they answer, and either way they go back up the gangway.`}
      </p>

      <div className="interest">
        <span className="interest__label">Interest</span>
        <span className="interest__track">
          <i style={{ width: `${(g.interest / SIGN_THRESHOLD) * 100}%` }} />
        </span>
        <b>{odds}%</b>
      </div>

      <StatBars stats={g.stats} highlight={best} />
      <p className="panel-note">
        Strongest in {best} · {STAT_INFO[best].name}. Asking {g.askingBonus}c to walk away.
      </p>

      <h3 className="modal__sub">Tactics · one shot each</h3>
      {pickingPost ? (
        <>
          <p className="panel-note">
            Offer them the job they are built for and they will bite; offer their worst and they
            will hold it against you.
          </p>
          <div className="posting__list">
            {openings.length === 0 && <p className="panel-note">No free posts to offer.</p>}
            {openings.map((m) => {
              const d = def(m.kind)
              const swing = tacticEffect(state, g, 'posting', m.id)
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
                      deck {m.deck + 1} · needs {d.stat} · they have {g.stats[d.stat]}
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
            disabled={spent('bonus') || bonusOffer(state, g) <= 0}
            onClick={() => onTactic('bonus')}
          >
            <span className="tactic__name">Signing bonus</span>
            <span className="tactic__note">
              {spent('bonus')
                ? 'Paid'
                : bonusOffer(state, g) < g.askingBonus
                  ? `All you have — ${bonusOffer(state, g)}c of their ${g.askingBonus}c ask`
                  : `Pay their ${g.askingBonus}c asking price`}
            </span>
            <b>+{tacticEffect(state, g, 'bonus')}</b>
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
            <b>+{tacticEffect(state, g, 'pitch')}</b>
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
        <button
          className="btn btn--primary"
          disabled={crewRoom <= 0}
          onClick={onSign}
          title={crewRoom <= 0 ? 'No free bunk — build Crew Quarters' : undefined}
        >
          {crewRoom <= 0 ? 'No bunk free' : `Ask them to stay — ${odds}%`}
        </button>
        <button className="btn" onClick={() => onOpenShip(ship.id)}>
          Their ship — {ship.name}
        </button>
      </div>
    </Modal>
  )
}
