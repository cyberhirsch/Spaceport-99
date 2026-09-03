import {
  availableCrew,
  berthedShips,
  fleetCapacity,
  defence,
  inContact,
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
import { factionDef } from '../game/factions.ts'
import { STAT_INFO, type GameState, type Ship, type ShipClass } from '../game/types.ts'
import { EditableName } from './EditableName.tsx'
import { hpStyle } from './meters.ts'

interface Props {
  state: GameState
  onOpenMission: (id: string) => void
  onDecline: (id: string) => void
  onRecall: (id: string) => void
  onAnswer: (id: string, choice: number) => void
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

/**
 * What the station could bring to a fight. It belongs above the fleet rather
 * than inside it: a battery matters from the day it is built, long before
 * there is a hangar to put a hull in.
 */
const Guard = ({ state }: { state: GameState }) => {
  const g = defence(state)
  return (
    <dl className="guard">
      <div>
        <dt>Guns</dt>
        <dd>{g.guns.toFixed(1)}</dd>
        <span>batteries and berthed hulls</span>
      </div>
      <div>
        <dt>Shield</dt>
        <dd>{g.shield.toFixed(1)}</dd>
        <span>soaked before the hull feels it</span>
      </div>
      <div>
        <dt>Small arms</dt>
        <dd>{g.smallArms}</dd>
        <span>what the crew are carrying</span>
      </div>
    </dl>
  )
}

export const FleetPanel = ({
  state,
  onOpenMission,
  onDecline,
  onRecall,
  onAnswer,
  onFileReport,
  onBuy,
  onRefit,
  onRepair,
  onTradeIn,
  onRenameShip,
}: Props) => {
  const capacity = fleetCapacity(state)
  const slots = missionCapacity(state)
  const flying = state.missions.filter((m) => m.status === 'flying' || m.status === 'calling')
  const reachable = inContact(state)
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
      {
        done: listening,
        text: 'Post crew to the Command Module — one controller holds one mission open, so the room is only worth what is sitting in it.',
      },
    ]
    return (
      <div className="panel-body">
        <Guard state={state} />
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
      <Guard state={state} />

      {reports.map((m) => (
        <div key={m.id} className={`report report--${OUTCOME_INFO[m.outcome!].tone}`}>
          <strong>{OUTCOME_INFO[m.outcome!].label}</strong>
          <span>{m.name}</span>
          <span className="report__body">{m.report}</span>
          {m.find && (
            <span className={`report__find${m.find.kind === 'spec' ? ' report__find--spec' : ''}`}>
              {m.find.kind === 'spec' ? '❑' : '◈'} {m.find.detail}
            </span>
          )}
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
            {flying.map((m) => {
              const heard = reachable.has(m.id)
              const open = m.shape === 'open' && !m.recalled
              return (
                <li
                  key={m.id}
                  className={`mission mission--flying${m.status === 'calling' ? ' mission--calling' : ''}${
                    heard ? '' : ' mission--silent'
                  }`}
                >
                  <span className="mission__name">
                    {m.name}
                    {!heard && <em className="mission__silent">out of contact</em>}
                  </span>
                  <span className="mission__meta">
                    {state.ships.find((x) => x.id === m.shipId)?.name ?? 'ship lost'} ·{' '}
                    {m.crewIds.length} aboard ·{' '}
                    {open
                      ? `${clock(m.aloft)} out, no end time`
                      : m.recalled
                        ? `${clock(m.remaining)} from home`
                        : `${clock(m.remaining)} out`}
                  </span>

                  {open ? (
                    <>
                      <span className="mission__meta">
                        hold ×{m.haul.toFixed(2)} · strain{' '}
                        <b className={m.strain > 1 ? 'is-hot' : ''}>{m.strain.toFixed(2)}</b>
                        {m.strain > 1 ? ' — every minute now is a gamble' : ''}
                      </span>
                      <span className="mission__bar">
                        <i
                          className={m.strain > 1 ? 'is-hot' : ''}
                          style={{ width: `${Math.min(100, m.strain * 50)}%` }}
                        />
                      </span>
                      <span className="mission__acts">
                        <button
                          className="btn btn--tiny"
                          disabled={!heard}
                          onClick={() => onRecall(m.id)}
                          title={heard ? undefined : 'No controller is holding their channel'}
                        >
                          {heard ? 'Order them home' : 'No channel'}
                        </button>
                      </span>
                    </>
                  ) : (
                    <span className="mission__bar">
                      <i style={{ width: `${(1 - m.remaining / m.seconds) * 100}%` }} />
                    </span>
                  )}

                  {m.status === 'calling' && m.call && (
                    <span className="hail">
                      <b>They are asking.</b>
                      <span className="hail__text">{m.call.text}</span>
                      {heard ? (
                        m.call.options.map((o, i) => {
                          const short = o.cost !== undefined && state.credits < o.cost
                          return (
                            <button
                              key={o.label}
                              className="hail__opt"
                              disabled={short}
                              onClick={() => onAnswer(m.id, i)}
                            >
                              <b>{o.label}</b>
                              <em>
                                {o.detail}
                                {o.cost ? ` — ${o.cost}c` : ''}
                                {short ? ' · not in the account' : ''}
                              </em>
                            </button>
                          )
                        })
                      ) : (
                        <span className="hail__text">
                          Nobody is on the channel. They will stop waiting and decide for
                          themselves.
                        </span>
                      )}
                    </span>
                  )}

                  {m.choices.length > 0 && (
                    <span className="mission__blurb">{m.choices[m.choices.length - 1]}</span>
                  )}
                </li>
              )
            })}
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
                {STAT_INFO[m.stat].name} · {teamSize(m)} crew ·{' '}
                {m.shape === 'open' ? 'no end time' : clock(m.seconds)} ·{' '}
                <b className={m.danger > 0.6 ? 'is-hot' : ''}>
                  danger {Math.round(m.danger * 100)}%
                </b>
              </span>
              <span className="mission__blurb">
                {d.blurb}
                {m.shape === 'open' &&
                  ' They stay out until you call them home, and the longer they stay the more they bring and the worse the odds.'}
                {m.shape === 'unfolding' && ' Expect them to hail before it is over.'}
              </span>
              {m.obligation && m.standing && (
                <span className="mission__duty">
                  Tasked by {factionDef(m.standing[0]).name}. There is no fee — passing it is what
                  costs.
                </span>
              )}
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
