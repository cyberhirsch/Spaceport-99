import { fleetCapacity } from '../game/engine.ts'
import { visitorDef } from '../game/visitors.ts'
import { shipDef } from '../game/fleet.ts'
import { STAT_INFO, STAT_KEYS, type GameState } from '../game/types.ts'
import { CrewAvatar } from './CrewAvatar.tsx'
import { Modal } from './Modal.tsx'
import { StatBars } from './StatBars.tsx'

interface Props {
  state: GameState
  guestId: string
  crewRoom: number
  onClose: () => void
  onAnswer: (yes: boolean) => void
  onTalk: () => void
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
  onTalk,
  onOpenShip,
}: Props) => {
  const ship = state.visitors.find((v) => v.aboard.some((x) => x.id === guestId))
  const g = ship?.aboard.find((x) => x.id === guestId)
  if (!ship || !g) return null

  const hull = shipDef(ship.cls)
  const best = STAT_KEYS.reduce((a, k) => (g.stats[k] > g.stats[a] ? k : a), STAT_KEYS[0])
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
          : `They have a berth already, which is the whole difficulty. Find out what they actually want before you spend anything on them — the wrong offer is worse than no offer.`}
      </p>

      <StatBars stats={g.stats} highlight={best} />
      <p className="panel-note">
        Strongest in {best} · {STAT_INFO[best].name}. They would want {g.askingBonus}c to walk away
        from that berth — though money is not what everybody is short of.
      </p>

      <div className="modal__actions">
        <button
          className="btn btn--primary"
          disabled={crewRoom <= 0}
          onClick={onTalk}
          title={crewRoom <= 0 ? 'No free bunk — build Crew Quarters' : undefined}
        >
          {crewRoom <= 0 ? 'No bunk free' : 'Talk to them'}
        </button>
        <button className="btn" onClick={() => onOpenShip(ship.id)}>
          Their ship — {ship.name}
        </button>
      </div>
    </Modal>
  )
}
