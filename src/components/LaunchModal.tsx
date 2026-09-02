import { useState } from 'react'
import { availableCrew, berthedShips } from '../game/engine.ts'
import {
  missionDef,
  shipCargo,
  shipDef,
  shipHull,
  shipSpeed,
  successOdds,
  teamSize,
} from '../game/fleet.ts'
import { effectiveness } from '../game/crew.ts'
import { STAT_INFO, type GameState } from '../game/types.ts'
import { CrewAvatar } from './CrewAvatar.tsx'
import { Modal } from './Modal.tsx'

interface Props {
  state: GameState
  missionId: string
  onClose: () => void
  onLaunch: (shipId: string, crewIds: string[]) => void
}

export const LaunchModal = ({ state, missionId, onClose, onLaunch }: Props) => {
  const m = state.missions.find((x) => x.id === missionId)
  const free = berthedShips(state)
  const [shipId, setShipId] = useState(free[0]?.id ?? '')
  const [picked, setPicked] = useState<string[]>([])
  if (!m) return null

  const ship = state.ships.find((x) => x.id === shipId) ?? null
  const size = teamSize(m)
  const roster = [...availableCrew(state)].sort(
    (a, b) => effectiveness(b, m.stat) - effectiveness(a, m.stat),
  )
  const team = picked
    .map((id) => state.crew.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
  const odds = team.length ? successOdds(team, m, ship) : 0
  const trip = ship ? Math.round(m.seconds / shipSpeed(ship)) : m.seconds

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length < size ? [...p, id] : p))

  return (
    <Modal wide title={<span className="modal__title">Mission briefing</span>} onClose={onClose}>
      <h3 className="dossier__name">{m.name}</h3>
      <p className="panel-note">{missionDef(m.kind).blurb}</p>

      <dl className="kv">
        <div>
          <dt>Judged on</dt>
          <dd>{STAT_INFO[m.stat].name}</dd>
        </div>
        <div>
          <dt>Danger</dt>
          <dd>{Math.round(m.danger * 100)}%</dd>
        </div>
        <div>
          <dt>Round trip</dt>
          <dd>{Math.floor(trip / 60)}m {trip % 60}s</dd>
        </div>
        <div>
          <dt>Pays</dt>
          <dd>{m.payout.credits}c + cargo</dd>
        </div>
      </dl>

      <h3 className="modal__sub">Ship</h3>
      <div className="posting__list">
        {free.length === 0 && <p className="panel-note">Every hull is out or wrecked.</p>}
        {free.map((s) => {
          const d = shipDef(s.cls)
          return (
            <button
              key={s.id}
              className={`posting__opt${s.id === shipId ? ' is-current' : ''}`}
              onClick={() => setShipId(s.id)}
            >
              <i>{d.glyph}</i>
              <span>
                {s.name}
                <em>
                  {d.name} mk{s.level} · hull {s.hull}/{shipHull(s)} · {shipSpeed(s).toFixed(2)}× ·
                  cargo {shipCargo(s).toFixed(1)}×
                </em>
              </span>
            </button>
          )
        })}
      </div>

      <h3 className="modal__sub">
        Away team ({picked.length}/{size})
      </h3>
      <div className="staff-grid">
        {roster.length === 0 && <p className="panel-note">Nobody is free to fly.</p>}
        {roster.slice(0, 14).map((c) => (
          <button
            key={c.id}
            className={`staff-chip${picked.includes(c.id) ? ' is-picked' : ''}`}
            onClick={() => toggle(c.id)}
          >
            <CrewAvatar who={c} size={30} />
            <span>
              {c.name}
              <em>
                {m.stat} {c.stats[m.stat]} · eff {effectiveness(c, m.stat).toFixed(1)} · hp{' '}
                {Math.round(c.hp)}
              </em>
            </span>
            <i>{picked.includes(c.id) ? '✓' : '＋'}</i>
          </button>
        ))}
      </div>

      <div className="interest">
        <span className="interest__label">Odds</span>
        <span className="interest__track">
          <i style={{ width: `${odds}%` }} />
        </span>
        <b>{odds}%</b>
      </div>
      <p className="panel-note">
        A setback costs you cargo, hull and skin. Only a disaster can lose the ship or the people.
      </p>

      <div className="modal__actions">
        <button
          className="btn btn--primary"
          disabled={!ship || picked.length === 0}
          onClick={() => onLaunch(shipId, picked)}
        >
          Launch
        </button>
        <button className="btn" onClick={onClose}>
          Not yet
        </button>
      </div>
    </Modal>
  )
}
