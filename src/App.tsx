import { useCallback, useState } from 'react'
import { BuildMenu } from './components/BuildMenu.tsx'
import { CrewModal } from './components/CrewModal.tsx'
import { CrewPanel } from './components/CrewPanel.tsx'
import { DragGhost } from './components/DragGhost.tsx'
import { FleetPanel } from './components/FleetPanel.tsx'
import { InterviewModal } from './components/InterviewModal.tsx'
import { LaunchModal } from './components/LaunchModal.tsx'
import { LogPanel } from './components/LogPanel.tsx'
import { Modal } from './components/Modal.tsx'
import { ModuleModal } from './components/ModuleModal.tsx'
import { StationView } from './components/StationView.tsx'
import { TopBar } from './components/TopBar.tsx'
import { staffSlots } from './game/engine.ts'
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
  const { state, derived, act, hardReset } = useGame()
  const wide = useMediaQuery('(min-width: 900px)')
  const [tab, setTab] = useState<Tab>('build')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [placing, setPlacing] = useState<ModuleKind | null>(null)
  const [moduleId, setModuleId] = useState<string | null>(null)
  const [crewId, setCrewId] = useState<string | null>(null)
  const [candidateId, setCandidateId] = useState<string | null>(null)
  const [missionId, setMissionId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const panelOpen = wide || sheetOpen

  const canDrop = useCallback(
    (id: string, target: string) => {
      const m = state.modules.find((x) => x.id === target)
      const c = state.crew.find((x) => x.id === id)
      if (!m || !c || c.dead) return false
      return m.staff.includes(id) || m.staff.length < staffSlots(m)
    },
    [state],
  )

  const { drag, start } = useDragAssign({
    onDrop: (id, target) => act({ type: 'assign', crewId: id, moduleId: target }),
    onTap: (id) => setCrewId(id),
    canDrop,
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
      const filed = state.missions.filter((m) => m.status === 'report').length
      return filed > 0 && `${filed} mission report${filed === 1 ? '' : 's'} to read`
    })(),
    state.modules.some((m) => m.kind === 'command') &&
      !state.modules.some((m) => m.kind === 'command' && m.staff.length > 0) &&
      'Command Module unstaffed — no contracts are coming in',
  ].filter(Boolean) as string[]

  return (
    <div className={`app${drag ? ' is-dragging' : ''}`}>
      <TopBar
        state={state}
        derived={derived}
        onRename={(name) => act({ type: 'rename', name })}
        onResupply={(resource) => act({ type: 'resupply', resource })}
        onOpenMenu={() => setMenuOpen(true)}
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
          state={state}
          placing={placing}
          drag={drag}
          onDragStart={start}
          onPlace={(deck, col) => {
            if (!placing) return
            act({ type: 'build', kind: placing, deck, col })
            setPlacing(null)
          }}
          onCancelPlacing={() => setPlacing(null)}
          onSelectModule={(id) => {
            const kind = state.modules.find((m) => m.id === id)?.kind
            if (kind === 'hangar' || kind === 'command') {
              setTab('fleet')
              if (!wide) setSheetOpen(true)
            }
            setModuleId(id)
          }}
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
          onRush={() => act({ type: 'rush', moduleId })}
          onStandby={(standby) => act({ type: 'setStandby', moduleId, standby })}
          onDemolish={() => {
            act({ type: 'demolish', moduleId })
            setModuleId(null)
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
            Progress saves to this device automatically, and the station keeps running while you are
            away (up to four hours of catch-up).
          </p>
          <p className="panel-note">
            Drag a crew portrait from the off-duty tray onto a room to post them there, or back onto
            the tray to stand them down. Tap a portrait to open their file.
          </p>
          <div className="modal__actions">
            <button
              className="btn btn--danger"
              onClick={() => {
                if (confirm('Scuttle the station and start over? This cannot be undone.')) {
                  hardReset()
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
              outward from it. Two identical rooms side by side merge into one bigger, faster room.
            </li>
            <li>
              <b>Rushing</b> finishes a cycle instantly but can start a fire. <b>Emergencies</b> are
              fought by whoever is standing in that room.
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
