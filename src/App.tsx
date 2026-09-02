import { useCallback, useRef, useState } from 'react'
import { BuildMenu } from './components/BuildMenu.tsx'
import { CrewModal } from './components/CrewModal.tsx'
import { CrewPanel } from './components/CrewPanel.tsx'
import { DragGhost } from './components/DragGhost.tsx'
import { FleetPanel } from './components/FleetPanel.tsx'
import { InterviewModal } from './components/InterviewModal.tsx'
import { LaunchModal } from './components/LaunchModal.tsx'
import { LogPanel } from './components/LogPanel.tsx'
import { VisitorModal } from './components/VisitorModal.tsx'
import { Modal } from './components/Modal.tsx'
import { GuestModal } from './components/GuestModal.tsx'
import { ModuleModal } from './components/ModuleModal.tsx'
import { StationView } from './components/StationView.tsx'
import { TitleScreen } from './components/TitleScreen.tsx'
import { agoOf, spanOf } from './components/saveText.ts'
import { slotInfo } from './game/save.ts'
import { TopBar } from './components/TopBar.tsx'
import { canMove, guestsAboard, isAway, relocateAnchor, staffSlots } from './game/engine.ts'
import { useDragAssign } from './hooks/useDragAssign.ts'
import { useGame } from './hooks/useGame.ts'
import { useMediaQuery } from './hooks/useMediaQuery.ts'
import type { ModuleKind } from './game/types.ts'

type Tab = 'build' | 'crew' | 'fleet' | 'log'

const TABS: { id: Tab; label: string; glyph: string }[] = [
  { id: 'build', label: 'Build', glyph: '⊞' },
  { id: 'crew', label: 'Crew', glyph: '☺' },
  { id: 'fleet', label: 'Fleet', glyph: '⬢' },
  { id: 'log', label: 'Log', glyph: '≡' },
]

export default function App() {
  const { state, derived, act, hardReset, saveNow, bookmark, restore } = useGame()
  const wide = useMediaQuery('(min-width: 900px)')
  const [tab, setTab] = useState<Tab>('build')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [placing, setPlacing] = useState<ModuleKind | null>(null)
  // A room picked up for relocation by tapping rather than dragging.
  const [moving, setMoving] = useState<string | null>(null)
  const [moduleId, setModuleId] = useState<string | null>(null)
  const [crewId, setCrewId] = useState<string | null>(null)
  const [candidateId, setCandidateId] = useState<string | null>(null)
  const [missionId, setMissionId] = useState<string | null>(null)
  const [visitorId, setVisitorId] = useState<string | null>(null)
  const [guestId, setGuestId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  // Set down at the title screen: saved, and asking nothing of you.
  const [parked, setParked] = useState(false)
  // Re-read whenever the menu opens or a save is written, not every render.
  const [slot, setSlot] = useState(() => slotInfo())
  const [savedAt, setSavedAt] = useState<number | null>(null)
  // The station's scroll box, so a swipe that started on a room can pan it.
  const station = useRef<HTMLElement | null>(null)
  const panelOpen = wide || sheetOpen

  const canDropCrew = useCallback(
    (id: string, target: string) => {
      const m = state.modules.find((x) => x.id === target)
      const c = state.crew.find((x) => x.id === id)
      if (!m || !c || c.dead || isAway(state, id)) return false
      return m.staff.includes(id) || m.staff.length < staffSlots(m)
    },
    [state],
  )

  const canDropRoom = useCallback(
    (id: string, cell: { deck: number; col: number }) => {
      const m = state.modules.find((x) => x.id === id)
      if (!m) return false
      return relocateAnchor(state, m, cell.deck, cell.col) !== null
    },
    [state],
  )

  // Opening a room: the hangar and command module live in the Fleet tab, so
  // tapping them takes you there as well as opening the panel.
  const openModule = useCallback(
    (id: string) => {
      const kind = state.modules.find((m) => m.id === id)?.kind
      if (kind === 'hangar' || kind === 'command') {
        setTab('fleet')
        if (!wide) setSheetOpen(true)
      }
      setModuleId(id)
    },
    [state, wide],
  )

  const { drag, start, startRoom } = useDragAssign({
    onDropCrew: (id, target) => act({ type: 'assign', crewId: id, moduleId: target }),
    onDropRoom: (id, cell) => {
      act({ type: 'relocate', moduleId: id, deck: cell.deck, col: cell.col })
      setMoving(null)
    },
    onTap: (subject) => {
      if (subject.type === 'crew') setCrewId(subject.id)
      else if (!moving) openModule(subject.id)
    },
    canDropCrew,
    canDropRoom,
    onPan: (dx, dy) => {
      const el = station.current
      if (!el) return
      el.scrollLeft -= dx
      el.scrollTop -= dy
    },
  })

  const openTab = (next: Tab) => {
    if (wide) {
      setTab(next)
      return
    }
    setSheetOpen(tab === next ? !sheetOpen : true)
    setTab(next)
  }

  // Flag a deficit only once it will actually empty the tanks within ten
  // minutes — a room going briefly unstaffed is not worth an alarm.
  const draining = (value: number, rate: number) => rate < 0 && value / -rate < 600

  const alerts = [
    state.resources.air <= 0 && 'No oxygen — the crew is suffocating',
    state.resources.food <= 0 && 'No rations — the crew is starving',
    state.incidents.length > 0 && `${state.incidents.length} emergency in progress`,
    derived.brownout && 'Grid brownout — rooms are running slow',
    draining(state.resources.power, derived.powerRate) && 'Power deficit — add a Fusion Reactor',
    draining(state.resources.air, derived.airRate) && 'Oxygen deficit — add an Atmospherics Plant',
    draining(state.resources.food, derived.foodRate) && 'Ration deficit — add a Hydroponics Bay',
    derived.crewAlive.length >= derived.crewCap && 'No free bunks — build Crew Quarters',
    (() => {
      const docked = state.candidates.filter((c) => c.arrivesIn <= 0).length
      return docked > 0 && `${docked} applicant${docked === 1 ? '' : 's'} waiting at the dock`
    })(),
    (() => {
      const hailing = state.visitors.filter((v) => v.status === 'requesting').length
      return hailing > 0 && `${hailing} ship${hailing === 1 ? '' : 's'} requesting permission to dock`
    })(),
    (() => {
      const waiting = guestsAboard(state).filter((x) => x.guest.offer)
      if (waiting.length === 0) return false
      return waiting.length === 1
        ? `${waiting[0].guest.name} is aboard and wants a word`
        : `${waiting.length} visitors aboard want a word`
    })(),
    (() => {
      const filed = state.missions.filter((m) => m.status === 'report').length
      return filed > 0 && `${filed} mission report${filed === 1 ? '' : 's'} to read`
    })(),
    state.modules.some((m) => m.kind === 'command') &&
      !state.modules.some((m) => m.kind === 'command' && m.staff.length > 0) &&
      'Command Module unstaffed — no contracts are coming in',
  ].filter(Boolean) as string[]

  if (parked) {
    return (
      <TitleScreen
        state={state}
        derived={derived}
        slot={slot}
        onResume={() => setParked(false)}
        onLoad={() => {
          if (restore()) setParked(false)
        }}
        onScuttle={() => {
          if (!confirm('Scuttle the station and start over? This cannot be undone.')) return
          hardReset()
          setSlot(null)
          setParked(false)
        }}
      />
    )
  }

  return (
    <div className={`app${drag ? ' is-dragging' : ''}`}>
      <TopBar
        state={state}
        derived={derived}
        onRename={(name) => act({ type: 'rename', name })}
        onResupply={(resource) => act({ type: 'resupply', resource })}
        onOpenMenu={() => {
          setSlot(slotInfo())
          setMenuOpen(true)
        }}
      />

      {alerts.length > 0 && (
        <div className="alerts">
          {alerts.map((a) => (
            <span key={a}>⚠ {a}</span>
          ))}
        </div>
      )}

      <main className="layout">
        <StationView
          onScroller={(el) => {
            station.current = el
          }}
          state={state}
          placing={placing}
          moving={moving}
          drag={drag}
          onDragStart={start}
          onRoomDragStart={startRoom}
          onPlace={(deck, col) => {
            if (moving) {
              act({ type: 'relocate', moduleId: moving, deck, col })
              setMoving(null)
              return
            }
            if (!placing) return
            act({ type: 'build', kind: placing, deck, col })
            setPlacing(null)
          }}
          onCancelPlacing={() => {
            setPlacing(null)
            setMoving(null)
          }}
          onSelectModule={openModule}
          onSelectCrew={(id) => setCrewId(id)}
          onSelectVisitor={(id) => setVisitorId(id)}
          onSelectGuest={(id) => setGuestId(id)}
          onEmptyCell={() => {
            setTab('build')
            if (!wide) setSheetOpen(true)
          }}
          onBuyDeck={() => act({ type: 'buyDeck' })}
        />

        {!wide && sheetOpen && (
          <button className="sheet-scrim" onClick={() => setSheetOpen(false)} aria-label="Close panel" />
        )}

        <aside className={`panel${panelOpen ? ' is-open' : ''}`} aria-hidden={!panelOpen}>
          <button className="panel__grab" onClick={() => setSheetOpen(false)} aria-label="Close panel" />
          <nav className="panel__tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={tab === t.id ? 'is-active' : ''}
                onClick={() => openTab(t.id)}
              >
                {t.id === 'crew' ? `Crew (${derived.crewAlive.length})` : t.label}
              </button>
            ))}
          </nav>
          {tab === 'build' && (
            <BuildMenu
              state={state}
              derived={derived}
              placing={placing}
              onPick={(kind) => {
                setPlacing((p) => (p === kind ? null : kind))
                // On a phone the sheet covers the station, so get out of the way.
                if (!wide) setSheetOpen(false)
              }}
            />
          )}
          {tab === 'crew' && (
            <CrewPanel
              state={state}
              derived={derived}
              drag={drag}
              onDragStart={start}
              onSelect={(id) => setCrewId(id)}
              onSelectCandidate={(id) => setCandidateId(id)}
              onAutoAssign={() => act({ type: 'autoAssign' })}
              onRequestCrew={() => act({ type: 'requestCrew' })}
            />
          )}
          {tab === 'fleet' && (
            <FleetPanel
              state={state}
              onOpenMission={(id) => setMissionId(id)}
              onDecline={(id) => act({ type: 'declineMission', missionId: id })}
              onFileReport={(id) => act({ type: 'fileReport', missionId: id })}
              onBuy={(cls) => act({ type: 'buyShip', cls })}
              onRefit={(id) => act({ type: 'refitShip', shipId: id })}
              onRepair={(id) => act({ type: 'repairShip', shipId: id })}
              onTradeIn={(id) => act({ type: 'tradeInShip', shipId: id })}
              onRenameShip={(id, name) => act({ type: 'renameShip', shipId: id, name })}
            />
          )}
          {tab === 'log' && <LogPanel state={state} />}
        </aside>
      </main>

      <nav className="tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={sheetOpen && tab === t.id ? 'is-active' : ''}
            onClick={() => openTab(t.id)}
          >
            <i>{t.glyph}</i>
            {t.id === 'crew' ? `Crew ${derived.crewAlive.length}` : t.label}
          </button>
        ))}
        <button onClick={() => setMenuOpen(true)}>
          <i>☰</i>
          More
        </button>
      </nav>

      <DragGhost drag={drag} state={state} />

      {moduleId && (
        <ModuleModal
          state={state}
          moduleId={moduleId}
          drag={drag}
          onDragStart={start}
          onClose={() => setModuleId(null)}
          onAssign={(cid, mid) => act({ type: 'assign', crewId: cid, moduleId: mid })}
          onUpgrade={() => act({ type: 'upgrade', moduleId })}
          canMove={(() => {
            const m = state.modules.find((x) => x.id === moduleId)
            return Boolean(m && canMove(state, m))
          })()}
          onMove={() => {
            setMoving(moduleId)
            setModuleId(null)
            if (!wide) setSheetOpen(false)
          }}
          onRush={() => act({ type: 'rush', moduleId })}
          onStandby={(standby) => act({ type: 'setStandby', moduleId, standby })}
          onAutoAccept={(on) => act({ type: 'setAutoAccept', moduleId, autoAccept: on })}
          onDemolish={() => {
            act({ type: 'demolish', moduleId })
            setModuleId(null)
          }}
        />
      )}

      {visitorId && (
        <VisitorModal
          state={state}
          visitorId={visitorId}
          onClose={() => setVisitorId(null)}
          onAccept={() => act({ type: 'acceptVisitor', visitorId })}
          onRefuse={() => {
            act({ type: 'refuseVisitor', visitorId })
            setVisitorId(null)
          }}
          onTrade={(resource, buy) => act({ type: 'tradeVisitor', visitorId, resource, buy })}
          onSelectGuest={(id) => {
            setVisitorId(null)
            setGuestId(id)
          }}
          onAutoAccept={(on) => {
            const dock = state.modules.find((m) => m.kind === 'dock')
            if (dock) act({ type: 'setAutoAccept', moduleId: dock.id, autoAccept: on })
          }}
        />
      )}

      {guestId && (
        <GuestModal
          state={state}
          guestId={guestId}
          onClose={() => setGuestId(null)}
          crewRoom={derived.crewCap - derived.crewAlive.length}
          onAnswer={(yes) => act({ type: 'answerGuest', guestId, yes })}
          onTactic={(tactic, mid) =>
            act({ type: 'persuadeGuest', guestId, tactic, moduleId: mid })
          }
          onSign={() => {
            act({ type: 'signGuest', guestId })
            setGuestId(null)
          }}
          onOpenShip={(id) => {
            setGuestId(null)
            setVisitorId(id)
          }}
        />
      )}

      {missionId && (
        <LaunchModal
          state={state}
          missionId={missionId}
          onClose={() => setMissionId(null)}
          onLaunch={(shipId, crewIds) => {
            act({ type: 'launch', missionId, shipId, crewIds })
            setMissionId(null)
          }}
        />
      )}

      {candidateId && (
        <InterviewModal
          state={state}
          candidateId={candidateId}
          onClose={() => setCandidateId(null)}
          onTactic={(tactic, moduleId) => act({ type: 'interview', candidateId, tactic, moduleId })}
          onOffer={() => {
            act({ type: 'offerContract', candidateId })
            setCandidateId(null)
          }}
          onTurnAway={() => {
            act({ type: 'turnAway', candidateId })
            setCandidateId(null)
          }}
        />
      )}

      {crewId && (
        <CrewModal
          state={state}
          crewId={crewId}
          onClose={() => setCrewId(null)}
          onAssign={(cid, mid) => act({ type: 'assign', crewId: cid, moduleId: mid })}
          onRevive={() => act({ type: 'revive', crewId })}
          onRename={(name) => act({ type: 'renameCrew', crewId, name })}
          onDismiss={() => {
            act({ type: 'dismiss', crewId })
            setCrewId(null)
          }}
        />
      )}

      {menuOpen && (
        <Modal title="Station options" onClose={() => setMenuOpen(false)}>
          <p className="panel-note">
            Progress saves to this device by itself, and the station keeps running while you are
            away — up to four hours of it is credited when you come back. A manual save is a
            separate bookmark you can come back to whenever you like.
          </p>

          <dl className="kv">
            <div>
              <dt>Station</dt>
              <dd>{state.name}</dd>
            </div>
            <div>
              <dt>On station</dt>
              <dd>{spanOf(state.elapsed)}</dd>
            </div>
            <div>
              <dt>Manual save</dt>
              <dd>
                {slot
                  ? `${slot.crew} crew · ${slot.rooms} rooms · ${agoOf(slot.savedAt)}`
                  : 'none yet'}
              </dd>
            </div>
          </dl>

          {savedAt && <p className="panel-note">Saved {agoOf(savedAt)}.</p>}

          <div className="modal__actions">
            <button
              className="btn btn--primary"
              onClick={() => {
                bookmark()
                setSlot(slotInfo())
                setSavedAt(Date.now())
              }}
            >
              Save
            </button>
            <button
              className="btn"
              disabled={!slot}
              onClick={() => {
                if (!confirm('Load the manual save? Everything since it is lost.')) return
                if (!restore()) return
                setMenuOpen(false)
                setModuleId(null)
                setCrewId(null)
                setSavedAt(null)
              }}
            >
              Load
            </button>
            <button
              className="btn"
              onClick={() => {
                saveNow()
                setMenuOpen(false)
                setModuleId(null)
                setCrewId(null)
                setSlot(slotInfo())
                setParked(true)
              }}
            >
              Exit
            </button>
          </div>

          <div className="modal__actions">
            <button
              className="btn btn--danger"
              onClick={() => {
                if (confirm('Scuttle the station and start over? This cannot be undone.')) {
                  hardReset()
                  setSlot(null)
                  setSavedAt(null)
                  setMenuOpen(false)
                  setModuleId(null)
                  setCrewId(null)
                }
              }}
            >
              Scuttle and restart
            </button>
          </div>
        </Modal>
      )}

      {!state.seenIntro && (
        <Modal title="Welcome aboard, Commander" onClose={() => act({ type: 'dismissIntro' })}>
          <p className="panel-note">
            You have a reactor, an air plant, a hydroponics bay and five people who signed up without
            reading the contract. Keep them breathing.
          </p>
          <ul className="tips">
            <li>
              <b>Drag a crew portrait</b> from the tray at the bottom onto a room to post them there.
              Drag them back to the tray to stand them down; tap one to open their file.
            </li>
            <li>
              <b>Power, oxygen and rations</b> are made in cycles by staffed rooms and burned
              constantly by your crew. Watch the rates under each gauge.
            </li>
            <li>
              <b>O.R.B.I.T.A.L.</b> stats decide who is good at what. High Tech runs the reactor,
              high Operations runs atmospherics.
            </li>
            <li>
              <b>Decks are symmetrical</b> — five room slots each side of the lift shaft, built
              outward from it. Rooms of a kind at the same level weld into one run: more output
              per segment, and a second upgrade a lone room never gets. Press and hold a room to
              pick it up and move it.
            </li>
            <li>
              <b>Rushing</b> finishes a cycle instantly but can start a fire. <b>Emergencies</b> are
              fought by whoever is standing in that room.
            </li>
            <li>
              <b>Anyone who docks can be poached.</b> People come off a berthed hull and walk your
              decks; every one of them can be talked into staying. A ship's master is the hard one,
              and only a station worth moving to will manage it — but their hull comes with them.
            </li>
            <li>
              <b>Hiring</b> runs through the Comms Array and a Docking Port: request someone from
              HQ, wait out their transit, then interview them. You get three tactics to talk them
              round, and the good ones will not join a station that is not worth joining yet.
            </li>
            <li>
              <b>A Hangar Bay</b> berths one ship — HQ issues a shuttle with your first — and a
              <b> Command Module</b> pulls contracts off the wire. Pick a hull and an away team and
              send them out. A bad run costs cargo, hull and skin; only a disaster costs the ship.
            </li>
          </ul>
          <div className="modal__actions">
            <button className="btn btn--primary" onClick={() => act({ type: 'dismissIntro' })}>
              Take command
            </button>
          </div>
        </Modal>
      )}

      {state.gameOver && (
        <Modal title="Station lost" onClose={() => undefined}>
          <p className="panel-note">
            Every soul aboard {state.name} is gone. The lights are still on, which is the saddest part.
          </p>
          <p className="panel-note">
            Survived {Math.floor(state.elapsed / 60)} minutes · {state.modules.length} rooms built.
          </p>
          <div className="modal__actions">
            <button className="btn btn--primary" onClick={hardReset}>
              Commission a new station
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
