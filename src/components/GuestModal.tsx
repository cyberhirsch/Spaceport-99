import { visitorDef } from '../game/visitors.ts'
import { shipDef } from '../game/fleet.ts'
import type { GameState } from '../game/types.ts'
import { CrewAvatar } from './CrewAvatar.tsx'
import { Modal } from './Modal.tsx'

interface Props {
  state: GameState
  guestId: string
  onClose: () => void
  onAnswer: (yes: boolean) => void
  onOpenShip: (visitorId: string) => void
}

/** Someone off a berthed hull, standing in front of you with something to say. */
export const GuestModal = ({ state, guestId, onClose, onAnswer, onOpenShip }: Props) => {
  const ship = state.visitors.find((v) => v.aboard.some((g) => g.id === guestId))
  const g = ship?.aboard.find((x) => x.id === guestId)
  if (!ship || !g) return null
  const hull = shipDef(ship.cls)

  return (
    <Modal onClose={onClose} title={<span className="modal__title">{g.name}</span>}>
      <div className="hail">
        <CrewAvatar who={g} size={56} />
        <span>
          <b>{g.role}</b>
          <em>
            off the {ship.name} · {hull.name} · {visitorDef(ship.kind).label.toLowerCase()}
          </em>
        </span>
      </div>

      {g.offer ? (
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
      ) : (
        <p className="panel-note">
          Nothing to raise — they are stretching their legs, looking at your decks, and will be
          back aboard in {Math.ceil(ship.timer)}s.
        </p>
      )}

      <div className="modal__actions">
        <button className="btn" onClick={() => onOpenShip(ship.id)}>
          Their ship — {ship.name}
        </button>
      </div>
    </Modal>
  )
}
