import { useEffect, useRef } from 'react'
import { DECK_WIDTH, canBuildAt, deckCost, def, moduleAt, staffSlots, workRate } from '../game/engine'
import { incidentDef } from '../game/incidents'
import type { DragState } from '../hooks/useDragAssign'
import type { Crew, GameState, ModuleKind, StationModule } from '../game/types'
import { CrewAvatar } from './CrewAvatar'

interface Props {
  state: GameState
  placing: ModuleKind | null
  drag: DragState | null
  onDragStart: (crewId: string, e: React.PointerEvent) => void
  onPlace: (deck: number, col: number) => void
  onCancelPlacing: () => void
  onSelectModule: (id: string) => void
  onEmptyCell: () => void
  onBuyDeck: () => void
}

/** How close to an edge the pointer must get before the station scrolls itself. */
const EDGE = 64
const EDGE_SPEED = 14

const Room = ({
  module,
  crewById,
  incident,
  drag,
  onOpen,
  onDragStart,
}: {
  module: StationModule
  crewById: Map<string, Crew>
  incident: GameState['incidents'][number] | undefined
  drag: DragState | null
  onOpen: () => void
  onDragStart: (crewId: string, e: React.PointerEvent) => void
}) => {
  const d = def(module.kind)
  const slots = staffSlots(module)
  const running = workRate(module, crewById) > 0
  const showProgress = Boolean(d.cycleSeconds || d.trains)
  const room = drag && slots > 0
  const full = module.staff.length >= slots && !module.staff.includes(drag?.crewId ?? '')

  return (
    <div
      className={[
        'room',
        incident ? 'room--alarm' : '',
        running ? '' : 'room--idle',
        room ? (full ? 'room--dropno' : 'room--dropok') : '',
        drag?.overModule === module.id ? 'is-over' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        gridColumn: `span ${module.width}`,
        // Each module kind gets its own accent, mixed into the panel background.
        ['--room-hue' as string]: String(d.hue),
      }}
      data-drop-module={module.id}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      title={`${d.name} — level ${module.level}`}
    >
      <span className="room__glyph">{d.glyph}</span>
      <span className="room__title">
        <span className="room__name">{d.short}</span>
        <span className="room__pips">
          {Array.from({ length: 3 }, (_, i) => (
            <i key={i} className={i < module.level ? 'is-on' : ''} />
          ))}
        </span>
      </span>

      <span className="room__staff">
        {module.staff.map((id) => {
          const c = crewById.get(id)
          if (!c) return null
          return (
            <span
              key={id}
              className={`grip${drag?.crewId === id ? ' is-lifted' : ''}`}
              onPointerDown={(e) => {
                e.stopPropagation()
                onDragStart(id, e)
              }}
              onClick={(e) => e.stopPropagation()}
              title={`${c.name} — drag to move`}
            >
              <CrewAvatar seed={c.seed} size={26} dead={c.dead} />
            </span>
          )
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
    </div>
  )
}

export const StationView = ({
  state,
  placing,
  drag,
  onDragStart,
  onPlace,
  onCancelPlacing,
  onSelectModule,
  onEmptyCell,
  onBuyDeck,
}: Props) => {
  const scroller = useRef<HTMLDivElement>(null)
  const crewById = new Map(state.crew.map((c) => [c.id, c]))
  const idle = state.crew.filter((c) => !c.dead && !c.assignment)
  const nextDeck = deckCost(state.decks)

  // Drag a crew member towards an edge and the station pans that way, so decks
  // off-screen are still reachable on a phone.
  useEffect(() => {
    if (!drag) return
    let frame = 0
    const tick = () => {
      const el = scroller.current
      if (el) {
        const r = el.getBoundingClientRect()
        if (drag.x < r.left + EDGE) el.scrollLeft -= EDGE_SPEED
        else if (drag.x > r.right - EDGE) el.scrollLeft += EDGE_SPEED
        if (drag.y < r.top + EDGE) el.scrollTop -= EDGE_SPEED
        else if (drag.y > r.bottom - EDGE) el.scrollTop += EDGE_SPEED
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [drag])

  return (
    <div className="stage">
      {placing && (
        <div className="station__hint">
          Placing <strong>{def(placing).name}</strong> — pick a highlighted slot.
          <button className="btn btn--tiny" onClick={onCancelPlacing}>
            Cancel
          </button>
        </div>
      )}

      <section
        className="station"
        ref={scroller}
        onContextMenu={(e) => {
          if (placing) {
            e.preventDefault()
            onCancelPlacing()
          }
        }}
      >
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
                          drag={drag}
                          onOpen={() => onSelectModule(m.id)}
                          onDragStart={onDragStart}
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

        </div>

        <div className="deck deck--new">
          <div className="deck__spine deck__spine--cap" />
          <button className="deck__buy" onClick={onBuyDeck} disabled={state.credits < nextDeck}>
            ＋ Pressurise deck {state.decks + 1} — {nextDeck}c
          </button>
        </div>
      </section>

      <div className={`dock${drag ? ' is-armed' : ''}${drag?.overDock ? ' is-over' : ''}`} data-drop-dock>
        <span className="dock__label">
          Off duty <i>{idle.length}</i>
        </span>
        <div className="dock__list">
          {idle.length === 0 && (
            <span className="dock__empty">
              {drag ? 'Drop here to stand down' : 'Everyone is at their post.'}
            </span>
          )}
          {idle.map((c) => (
            <span
              key={c.id}
              className={`grip dock__crew${drag?.crewId === c.id ? ' is-lifted' : ''}`}
              onPointerDown={(e) => onDragStart(c.id, e)}
              title={`${c.name} — drag to a room`}
            >
              <CrewAvatar seed={c.seed} size={38} />
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
