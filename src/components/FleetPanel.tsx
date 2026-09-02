import {
  availableCrew,
  berthedShips,
  fleetCapacity,
  missionCapacity,
} from '../game/engine.ts'
import {
  OUTCOME_INFO,
  missionDef,
  refitCost,
  shipCargo,
  SHIP_DEFS,
  shipDef,
  shipHull,
  shipSpeed,
  successOdds,
  teamSize,
  tradeInValue,
} from '../game/fleet.ts'
import { STAT_INFO, type GameState, type Ship, type ShipClass } from '../game/types.ts'
import { EditableName } from './EditableName.tsx'
import { hpStyle } from './meters.ts'

interface Props {
  state: GameState
  onOpenMission: (id: string) => void
  onDecline: (id: string) => void
  onFileReport: (id: string) => void
  onBuy: (cls: ShipClass) => void
  onRefit: (id: string) => void
  onRepair: (id: string) => void
  onTradeIn: (id: string) => void
  onRenameShip: (id: string, name: string) => void
}

const clock = (s: number) => {
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${Math.floor(s % 60)}s` : `${Math.ceil(s)}s`
}

const ShipCard = ({
  ship,
  state,
  onRefit,
  onRepair,
  onTradeIn,
  onRenameShip,
}: {
  ship: Ship
  state: GameState
  onRefit: (id: string) => void
  onRepair: (id: string) => void
  onTradeIn: (id: string) => void
  onRenameShip: (id: string, name: string) => void
}) => {
  const d = shipDef(ship.cls)
  const full = shipHull(ship)
  const hurt = ship.hull < full
  const repair = Math.round((full - ship.hull) * 2.4)
  const flying = Boolean(ship.missionId)
  const refit = refitCost(ship)
  return (
    <li className={`ship${flying ? ' ship--out' : ''}`}>
      <span className="ship__glyph">{d.glyph}</span>
      <span className="ship__body">
        <span className="ship__name">
          <EditableName
            value={ship.name}
            onChange={(name) => onRenameShip(ship.id, name)}
            label="Rename this ship"
          />{' '}
          <em>
            {d.name} mk{ship.level}
          </em>
        </span>
        <span className="ship__stats">
          <i>hull {ship.hull}/{full}</i>
          <i>speed {shipSpeed(ship).toFixed(2)}×</i>
          <i>cargo {shipCargo(ship).toFixed(1)}×</i>
        </span>
        <span className="minibar minibar--hp">
          <i style={hpStyle(ship.hull / full)} />
        </span>
        {flying ? (
          <span className="ship__note">Out on a job</span>
        ) : (
          <span className="ship__acts">
            {hurt && (
              <button className="btn btn--tiny" disabled={state.credits < repair} onClick={() => onRepair(ship.id)}>
                Repair {repair}c
              </button>
            )}
            <button
              className="btn btn--tiny"
              disabled={ship.level >= 3 || state.credits < refit}
              onClick={() => onRefit(ship.id)}
            >
              {ship.level >= 3 ? 'Fully refitted' : `Refit ${refit}c`}
            </button>
            <button className="btn btn--tiny" onClick={() => onTradeIn(ship.id)}>
              Trade in {tradeInValue(ship)}c
            </button>
          </span>
        )}
      </span>
    </li>
  )
}

export const FleetPanel = ({
  state,
  onOpenMission,
  onDecline,
  onFileReport,
  onBuy,
  onRefit,
  onRepair,
  onTradeIn,
  onRenameShip,
}: Props) => {
  const capacity = fleetCapacity(state)
  const slots = missionCapacity(state)
  const flying = state.missions.filter((m) => m.status === 'flying')
  const offers = state.missions.filter((m) => m.status === 'offered')
  const reports = state.missions.filter((m) => m.status === 'report')
  const free = berthedShips(state)
  const crewFree = availableCrew(state)

  const commandRooms = state.modules.filter((m) => m.kind === 'command')
  const listening = commandRooms.some((m) => m.staff.length > 0)

  // Getting a mission off the ground has three prerequisites, and being told
  // which one is missing beats staring at an empty board.
  if (capacity === 0 || slots === 0 || !listening) {
    const steps = [
      { done: capacity > 0, text: 'Build a Hangar Bay — HQ issues a shuttle with your first one.' },
      { done: slots > 0, text: 'Build a Command Module to pull contracts off the wire.' },
      { done: listening, text: 'Post a crew member to the Command Module — an empty room hears nothing.' },
    ]
    return (
      <div className="panel-body">
        <p className="panel-note">Before anything can launch:</p>
        <ul className="checklist">
          {steps.map((step) => (
            <li key={step.text} className={step.done ? 'is-done' : ''}>
              <i>{step.done ? '✓' : '○'}</i>
              {step.text}
            </li>
          ))}
        </ul>
        <p className="panel-note">
          Contracts then appear here on their own. Pick one, choose a ship and an away team, and
          launch.
        </p>
        {state.ships.length > 0 && (
          <>
            <h3 className="modal__sub">Hangar ({state.ships.length}/{capacity})</h3>
            <ul className="ship-list">
              {state.ships.map((ship) => (
                <ShipCard
                  key={ship.id}
                  ship={ship}
                  state={state}
                  onRefit={onRefit}
                  onRepair={onRepair}
                  onTradeIn={onTradeIn}
                  onRenameShip={onRenameShip}
                />
              ))}
            </ul>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="panel-body">
      {reports.map((m) => (
        <div key={m.id} className={`report report--${OUTCOME_INFO[m.outcome!].tone}`}>
          <strong>{OUTCOME_INFO[m.outcome!].label}</strong>
          <span>{m.name}</span>
          <span className="report__body">{m.report}</span>
          {m.find && <span className="report__find">◈ {m.find.detail}</span>}
          <button className="btn btn--tiny" onClick={() => onFileReport(m.id)}>
            File it
          </button>
        </div>
      ))}

      {flying.length > 0 && (
        <>
          <h3 className="modal__sub">
            In flight ({flying.length}/{slots})
          </h3>
          <ul className="mission-list">
            {flying.map((m) => (
              <li key={m.id} className="mission mission--flying">
                <span className="mission__name">{m.name}</span>
                <span className="mission__meta">
                  {state.ships.find((x) => x.id === m.shipId)?.name ?? 'ship lost'} ·{' '}
                  {m.crewIds.length} aboard · {clock(m.remaining)} out
                </span>
                <span className="mission__bar">
                  <i style={{ width: `${(1 - m.remaining / m.seconds) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="modal__sub">Contracts ({offers.length})</h3>
      {offers.length === 0 && (
        <p className="panel-note">
          {slots === 0
            ? 'Build a Command Module to start taking contracts.'
            : 'Nothing on the wire. Something will come in.'}
        </p>
      )}
      <ul className="mission-list">
        {offers.map((m) => {
          const d = missionDef(m.kind)
          const best = [...crewFree]
            .sort((a, b) => b.stats[m.stat] - a.stats[m.stat])
            .slice(0, teamSize(m))
          const odds = free.length ? successOdds(best, m, free[0]) : 0
          return (
            <li key={m.id} className="mission">
              <span className="mission__name">{m.name}</span>
              <span className="mission__meta">
                {STAT_INFO[m.stat].name} · {teamSize(m)} crew · {clock(m.seconds)} ·{' '}
                <b className={m.danger > 0.6 ? 'is-hot' : ''}>
                  danger {Math.round(m.danger * 100)}%
                </b>
              </span>
              <span className="mission__blurb">{d.blurb}</span>
              <span className="mission__pay">
                ◈ {m.payout.credits}c
                {m.payout.power > 0 && ` · ⚡ ${m.payout.power}`}
                {m.payout.air > 0 && ` · ◌ ${m.payout.air}`}
                {m.payout.food > 0 && ` · ▲ ${m.payout.food}`}
                <i> · expires {clock(m.expiresIn)}</i>
              </span>
              <span className="mission__acts">
                <button
                  className="btn btn--tiny btn--primary"
                  disabled={free.length === 0 || crewFree.length === 0 || flying.length >= slots}
                  onClick={() => onOpenMission(m.id)}
                >
                  {free.length === 0
                    ? 'No ship free'
                    : flying.length >= slots
                      ? 'No mission slot'
                      : `Brief the team — ~${odds}%`}
                </button>
                <button className="btn btn--tiny" onClick={() => onDecline(m.id)}>
                  Pass
                </button>
              </span>
            </li>
          )
        })}
      </ul>

      <h3 className="modal__sub">
        Hangar ({state.ships.length}/{capacity})
      </h3>
      <ul className="ship-list">
        {state.ships.map((ship) => (
          <ShipCard
            key={ship.id}
            ship={ship}
            state={state}
            onRefit={onRefit}
            onRepair={onRepair}
            onTradeIn={onTradeIn}
            onRenameShip={onRenameShip}
          />
        ))}
      </ul>

      {state.ships.length < capacity && (
        <>
          <h3 className="modal__sub">Buy from HQ</h3>
          <ul className="ship-list">
            {(Object.keys(SHIP_DEFS) as ShipClass[]).map((cls) => {
              const d = shipDef(cls)
              return (
                <li key={cls} className="ship ship--offer">
                  <span className="ship__glyph">{d.glyph}</span>
                  <span className="ship__body">
                    <span className="ship__name">{d.name}</span>
                    <span className="ship__note">{d.blurb}</span>
                    <span className="ship__stats">
                      <i>hull {d.hull}</i>
                      <i>speed {d.speed}×</i>
                      <i>cargo {d.cargo}×</i>
                      {d.teeth > 0 && <i>armed</i>}
                    </span>
                  </span>
                  <button
                    className="btn btn--tiny"
                    disabled={state.credits < d.price}
                    onClick={() => onBuy(cls)}
                  >
                    {d.price}c
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
