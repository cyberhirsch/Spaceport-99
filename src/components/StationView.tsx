import { useEffect, useLayoutEffect, useRef } from 'react'
import {
  WING,
  canBuildAt,
  deckCost,
  def,
  awayCrewIds,
  idleCrew,
  PHASE_LABEL,
  guestsAboard,
  moduleAt,
  moveCost,
  relocateAnchor,
  staffSlots,
  visitorPhase,
  workRate,
} from '../game/engine.ts'
import { incidentDef } from '../game/incidents.ts'
import type { DragState } from '../hooks/useDragAssign.ts'
import type { Crew, GameState, ModuleKind, StationModule } from '../game/types.ts'
import { shipDef } from '../game/fleet.ts'
import { factionDef } from '../game/factions.ts'
import { CrewAvatar } from './CrewAvatar.tsx'

interface Props {
  /** Hands the scroll box up, so a swipe that began on a room can pan it. */
  onScroller: (el: HTMLElement | null) => void
  state: GameState
  placing: ModuleKind | null
  /** Id of a room picked up for relocation by tapping its Move button. */
  moving: string | null
  drag: DragState | null
  onDragStart: (crewId: string, e: React.PointerEvent) => void
  onRoomDragStart: (roomId: string, e: React.PointerEvent) => void
  onPlace: (deck: number, col: number) => void
  onCancelPlacing: () => void
  onSelectModule: (id: string) => void
  onSelectCrew: (id: string) => void
  onSelectVisitor: (id: string) => void
  onSelectGuest: (id: string) => void
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
  lifted,
  onOpen,
  onDragStart,
  onRoomDragStart,
}: {
  module: StationModule
  crewById: Map<string, Crew>
  incident: GameState['incidents'][number] | undefined
  drag: DragState | null
  lifted: boolean
  onOpen: () => void
  onDragStart: (crewId: string, e: React.PointerEvent) => void
  onRoomDragStart: (roomId: string, e: React.PointerEvent) => void
}) => {
  const d = def(module.kind)
  const slots = staffSlots(module)
  const running = workRate(module, crewById) > 0
  const showProgress = Boolean(d.cycleSeconds || d.trains)
  const room = Boolean(drag?.crewId) && slots > 0
  const full = module.staff.length >= slots && !module.staff.includes(drag?.crewId ?? '')

  return (
    <div
      className={[
        'room',
        incident ? 'room--alarm' : '',
        running ? '' : 'room--idle',
        module.standby ? 'room--standby' : '',
        module.width > 1 ? 'room--merged' : '',
        room ? (full ? 'room--dropno' : 'room--dropok') : '',
        drag?.crewId && drag.overModule === module.id ? 'is-over' : '',
        lifted ? 'room--lifted' : '',
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
      onPointerDown={(e) => onRoomDragStart(module.id, e)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      title={`${d.name} — level ${module.level}. Press and hold to move it, ${moveCost(module)}c.`}
    >
      <span className="room__glyph">{d.glyph}</span>
      {module.standby && <span className="room__standby">off</span>}
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
              <CrewAvatar who={c} size={26} dead={c.dead} />
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
  onScroller,
  state,
  placing,
  moving,
  drag,
  onDragStart,
  onRoomDragStart,
  onPlace,
  onCancelPlacing,
  onSelectModule,
  onSelectCrew,
  onSelectVisitor,
  onSelectGuest,
  onEmptyCell,
  onBuyDeck,
}: Props) => {
  const scroller = useRef<HTMLElement | null>(null)
  const crewById = new Map(state.crew.map((c) => [c.id, c]))
  const idle = idleCrew(state)
  // Crew who are off the station are still worth seeing — they are just not
  // yours to post anywhere until they are home.
  const awayIds = awayCrewIds(state)
  const awayCrew = state.crew.filter((c) => awayIds.has(c.id) && !c.dead)
  const flightOf = (crewId: string) =>
    state.missions.find((m) => m.status === 'flying' && m.crewIds.includes(crewId))
  const nextDeck = deckCost(state.decks)
  const aboard = guestsAboard(state)
  // A room is in hand either because it is being dragged or because its Move
  // button was tapped; both light up the same landing spots.
  const held = state.modules.find((m) => m.id === (drag?.roomId ?? moving)) ?? null

  // The station is wider than a phone, so open it centred on the lift shaft —
  // that is where the station starts and where the empty slots worth building
  // on are. Panning from there is the player's choice, not the default.
  useLayoutEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2
  }, [])

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

  /** Renders one wing of a deck: rooms in place, empty slots where you can build. */
  const wing = (deck: number, from: number, to: number) => {
    const cells: React.ReactNode[] = []
    for (let col = from; col < to; ) {
      const m = moduleAt(state, deck, col)
      if (m && m.col === col) {
        cells.push(
          <Room
            key={m.id}
            module={m}
            crewById={crewById}
            incident={state.incidents.find((i) => i.moduleId === m.id)}
            drag={drag}
            lifted={held?.id === m.id}
            onOpen={() => onSelectModule(m.id)}
            onDragStart={onDragStart}
            onRoomDragStart={onRoomDragStart}
          />,
        )
        col += m.width
        continue
      }
      // `col` advances below, so bind this cell's column first — the click
      // handler must not read the loop's later value.
      const at = col
      const buildable = canBuildAt(state, deck, at)
      const landing = held ? relocateAnchor(state, held, deck, at) !== null : false
      cells.push(
        <button
          key={`${deck}-${at}`}
          className={`cell${buildable ? ' cell--open' : ''}${
            placing && buildable ? ' cell--target' : ''
          }${landing ? ' cell--target cell--landing' : ''}`}
          data-drop-cell={`${deck}:${at}`}
          disabled={!buildable && !placing && !landing}
          onClick={() => {
            if (held && landing) onPlace(deck, at)
            else if (placing && buildable) onPlace(deck, at)
            else onEmptyCell()
          }}
          title={
            held
              ? landing
                ? `Set the ${def(held.kind).short} down here — ${moveCost(held)}c`
                : 'The room will not fit here'
              : buildable
                ? 'Empty slot'
                : 'Unreachable — build outward from the lift'
          }
        >
          {held ? (landing ? '⇲' : '') : buildable ? '+' : ''}
        </button>,
      )
      col += 1
    }
    return cells
  }

  return (
    <div className="stage">
      {(placing || moving) && (
        <div className="station__hint">
          {placing ? (
            <>
              Placing <strong>{def(placing).name}</strong> — pick a highlighted slot.
            </>
          ) : (
            <>
              Moving <strong>{held ? def(held.kind).name : 'room'}</strong>
              {held ? ` — ${moveCost(held)}c` : ''}. Pick a highlighted slot.
            </>
          )}
          <button className="btn btn--tiny" onClick={onCancelPlacing}>
            Cancel
          </button>
        </div>
      )}

      <section
        className="station"
        ref={(el) => {
          scroller.current = el
          onScroller(el)
        }}
        onContextMenu={(e) => {
          if (placing || moving) {
            e.preventDefault()
            onCancelPlacing()
          }
        }}
      >
        <div className="station__hull">
          {Array.from({ length: state.decks }, (_, deck) => (
            <div className="deck" key={deck}>
              <div className="deck__wing">{wing(deck, 0, WING)}</div>
              <div className="deck__lift">
                <span className="deck__num">{deck + 1}</span>
              </div>
              <div className="deck__wing">{wing(deck, WING, WING * 2)}</div>
            </div>
          ))}

        </div>

        <div className="deck--new">
          <button className="deck__buy" onClick={onBuyDeck} disabled={state.credits < nextDeck}>
            ＋ Pressurise deck {state.decks + 1} — {nextDeck}c
          </button>
        </div>
      </section>

      <div className="dock-row">
        <div
          className={`dock${drag?.crewId ? ' is-armed' : ''}${
            drag?.crewId && drag.overDock ? ' is-over' : ''
          }`}
          data-drop-dock
        >
          <span className="dock__label" title="Crew off duty">
            <b>Off duty</b>
            <i className="dock__mark">☾</i> <i>{idle.length}</i>
          </span>
          <div className="dock__list">
            {idle.length === 0 && (
              <span className="dock__empty">
                {drag?.crewId ? 'Drop here to stand down' : 'Everyone is at their post.'}
              </span>
            )}
            {idle.map((c) => (
              <span
                key={c.id}
                className={`grip dock__crew${drag?.crewId === c.id ? ' is-lifted' : ''}`}
                onPointerDown={(e) => onDragStart(c.id, e)}
                title={`${c.name} — drag to a room`}
              >
                <CrewAvatar who={c} size={38} />
              </span>
            ))}
          </div>
        </div>

        {aboard.length > 0 && (
          <div className="dock dock--guests">
            <span className="dock__label" title="Visitors walking the station">
              <b>Aboard</b>
              <i className="dock__mark">☺</i> <i>{aboard.length}</i>
            </span>
            <div className="dock__list">
              {aboard.map(({ guest, ship }) => (
                <button
                  key={guest.id}
                  className={`dock__crew dock__crew--guest${guest.offer ? ' has-offer' : ''}`}
                  onClick={() => onSelectGuest(guest.id)}
                  title={`${guest.name} — ${guest.role} off the ${ship.name}${
                    guest.offer ? `, wants a word about ${guest.offer.title.toLowerCase()}` : ''
                  }`}
                >
                  <CrewAvatar who={guest} size={38} />
                  {guest.offer && <span className="dock__bang">!</span>}
                </button>
              ))}
            </div>
          </div>
        )}

        {state.visitors.length > 0 && (
          <div className="dock dock--visitors">
            <span className="dock__label" title="Ships in the vicinity">
              <b>Traffic</b>
              <i className="dock__mark">⚓</i> <i>{state.visitors.length}</i>
            </span>
            <div className="dock__list">
              {state.visitors.map((v) => {
                const phase = visitorPhase(v)
                return (
                  <button
                    key={v.id}
                    className={`visitor-chip visitor-chip--${phase}`}
                    style={{ ['--power-hue' as string]: String(factionDef(v.faction).hue) }}
                    onClick={() => onSelectVisitor(v.id)}
                    title={`${v.name} — ${factionDef(v.faction).short} paper — ${
                      phase === 'inbound'
                        ? `on approach, hailing in ${Math.ceil(v.timer)}s`
                        : phase === 'hailing'
                          ? `requesting permission to dock, holding ${Math.ceil(v.timer)}s`
                          : `berthed, leaving in ${Math.ceil(v.timer)}s`
                    }`}
                  >
                    <span className="visitor-chip__flag">{factionDef(v.faction).glyph}</span>
                    <span className="visitor-chip__glyph">{shipDef(v.cls).glyph}</span>
                    <span className="visitor-chip__name">
                      {v.name}
                      <em>{PHASE_LABEL[phase]}</em>
                    </span>
                    {phase === 'hailing' && <span className="visitor-chip__bang">?</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {awayCrew.length > 0 && (
          <div className="dock dock--away">
            <span className="dock__label" title="Crew away on missions">
              <b>Away</b>
              <i className="dock__mark">➤</i> <i>{awayCrew.length}</i>
            </span>
            <div className="dock__list">
              {awayCrew.map((c) => {
                const flight = flightOf(c.id)
                return (
                  <button
                    key={c.id}
                    className="dock__crew dock__crew--away"
                    onClick={() => onSelectCrew(c.id)}
                    title={
                      flight
                        ? `${c.name} — out on ${flight.name}, ${Math.ceil(flight.remaining)}s from home`
                        : `${c.name} — on a mission`
                    }
                  >
                    <CrewAvatar who={c} size={38} />
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
