import { DECK_WIDTH, canBuildAt, deckCost, def, moduleAt, staffSlots, workRate } from '../game/engine'
import { incidentDef } from '../game/incidents'
import type { Crew, GameState, ModuleKind, StationModule } from '../game/types'
import { CrewAvatar } from './CrewAvatar'

interface Props {
  state: GameState
  placing: ModuleKind | null
  onPlace: (deck: number, col: number) => void
  onCancelPlacing: () => void
  onSelectModule: (id: string) => void
  onSelectCrew: (id: string) => void
  onEmptyCell: () => void
  onBuyDeck: () => void
}

const Room = ({
  module,
  crewById,
  incident,
  onClick,
}: {
  module: StationModule
  crewById: Map<string, Crew>
  incident: GameState['incidents'][number] | undefined
  onClick: () => void
}) => {
  const d = def(module.kind)
  const slots = staffSlots(module)
  const rate = workRate(module, crewById)
  const powered = rate > 0
  const showProgress = Boolean(d.cycleSeconds || d.trains)
  return (
    <button
      className={`room${incident ? ' room--alarm' : ''}${powered ? '' : ' room--idle'}`}
      style={{
        gridColumn: `span ${module.width}`,
        // Each module kind gets its own accent, mixed into the panel background.
        ['--room-hue' as string]: String(d.hue),
      }}
      onClick={onClick}
      title={`${d.name} — level ${module.level}`}
    >
      <span className="room__glyph">{d.glyph}</span>
      <span className="room__title">
        <span className="room__name">{d.name}</span>
        <span className="room__pips">
          {Array.from({ length: 3 }, (_, i) => (
            <i key={i} className={i < module.level ? 'is-on' : ''} />
          ))}
        </span>
      </span>

      <span className="room__staff">
        {module.staff.map((id) => {
          const c = crewById.get(id)
          return c ? <CrewAvatar key={id} seed={c.seed} size={20} dead={c.dead} /> : null
        })}
        {Array.from({ length: Math.max(0, slots - module.staff.length) }, (_, i) => (
          <span key={`e${i}`} className="room__slot" />
        ))}
      </span>

      {showProgress && (
        <span className="room__bar">
          <span className="room__bar-fill" style={{ width: `${module.progress * 100}%` }} />
        </span>
      )}

      {module.condition < 0.999 && (
        <span className="room__condition" title={`Condition ${Math.round(module.condition * 100)}%`}>
          <span style={{ width: `${module.condition * 100}%` }} />
        </span>
      )}

      {incident && (
        <span className="room__incident" title={incidentDef(incident.kind).name}>
          {incidentDef(incident.kind).glyph}
          <span className="room__incident-bar">
            <span style={{ width: `${(incident.hp / incident.maxHp) * 100}%` }} />
          </span>
        </span>
      )}
    </button>
  )
}

export const StationView = ({
  state,
  placing,
  onPlace,
  onCancelPlacing,
  onSelectModule,
  onSelectCrew,
  onEmptyCell,
  onBuyDeck,
}: Props) => {
  const crewById = new Map(state.crew.map((c) => [c.id, c]))
  const idle = state.crew.filter((c) => !c.dead && !c.assignment)
  const nextDeck = deckCost(state.decks)

  return (
    <section className="station" onContextMenu={(e) => { if (placing) { e.preventDefault(); onCancelPlacing() } }}>
      {placing && (
        <div className="station__hint">
          Placing <strong>{def(placing).name}</strong> — pick a highlighted slot.
          <button className="btn btn--tiny" onClick={onCancelPlacing}>
            Cancel
          </button>
        </div>
      )}

      <div className="station__hull">
        {Array.from({ length: state.decks }, (_, deck) => (
          <div className="deck" key={deck}>
            <div className="deck__spine">
              <span className="deck__num">{deck + 1}</span>
            </div>
            <div className="deck__cells">
              {(() => {
                const cells: React.ReactNode[] = []
                for (let col = 0; col < DECK_WIDTH; ) {
                  const m = moduleAt(state, deck, col)
                  if (m && m.col === col) {
                    cells.push(
                      <Room
                        key={m.id}
                        module={m}
                        crewById={crewById}
                        incident={state.incidents.find((i) => i.moduleId === m.id)}
                        onClick={() => onSelectModule(m.id)}
                      />,
                    )
                    col += m.width
                    continue
                  }
                  // `col` advances below, so bind this cell's column first —
                  // the click handler must not read the loop's later value.
                  const at = col
                  const buildable = canBuildAt(state, deck, at)
                  cells.push(
                    <button
                      key={`${deck}-${at}`}
                      className={`cell${buildable ? ' cell--open' : ''}${
                        placing && buildable ? ' cell--target' : ''
                      }`}
                      disabled={!buildable && !placing}
                      onClick={() => (placing && buildable ? onPlace(deck, at) : onEmptyCell())}
                      title={buildable ? 'Empty slot' : 'Unreachable — build outward from the spine'}
                    >
                      {buildable ? '+' : ''}
                    </button>,
                  )
                  col += 1
                }
                return cells
              })()}
            </div>
          </div>
        ))}

        <div className="deck deck--new">
          <div className="deck__spine deck__spine--cap" />
          <button className="deck__buy" onClick={onBuyDeck} disabled={state.credits < nextDeck}>
            ＋ Pressurise deck {state.decks + 1} — {nextDeck}c
          </button>
        </div>
      </div>

      <div className="offduty">
        <span className="offduty__label">Off duty</span>
        <div className="offduty__list">
          {idle.length === 0 && <span className="offduty__empty">Everyone is at their post.</span>}
          {idle.map((c) => (
            <button key={c.id} className="offduty__crew" onClick={() => onSelectCrew(c.id)} title={c.name}>
              <CrewAvatar seed={c.seed} size={30} />
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
