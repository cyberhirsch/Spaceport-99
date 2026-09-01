import { useState } from 'react'
import { BuildMenu } from './components/BuildMenu'
import { CrewModal } from './components/CrewModal'
import { CrewPanel } from './components/CrewPanel'
import { LogPanel } from './components/LogPanel'
import { Modal } from './components/Modal'
import { ModuleModal } from './components/ModuleModal'
import { StationView } from './components/StationView'
import { TopBar } from './components/TopBar'
import { useGame } from './hooks/useGame'
import type { ModuleKind } from './game/types'

type Tab = 'build' | 'crew' | 'log'

export default function App() {
  const { state, derived, act, hardReset } = useGame()
  const [tab, setTab] = useState<Tab>('build')
  const [placing, setPlacing] = useState<ModuleKind | null>(null)
  const [moduleId, setModuleId] = useState<string | null>(null)
  const [crewId, setCrewId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  // Flag a deficit only once it will actually empty the tanks within ten
  // minutes — a room going briefly unstaffed is not worth an alarm.
  const draining = (value: number, rate: number) => rate < 0 && value / -rate < 600

  const alerts = [
    state.resources.air <= 0 && 'No oxygen — the crew is suffocating',
    state.resources.food <= 0 && 'No rations — the crew is starving',
    state.incidents.length > 0 && `${state.incidents.length} emergency in progress`,
    derived.brownout && 'Grid brownout — rooms are running slow',
    draining(state.resources.power, derived.powerRate) &&
      'Power deficit — add or upgrade a Fusion Reactor',
    draining(state.resources.air, derived.airRate) &&
      'Oxygen deficit — add an Atmospherics Plant or cut crew',
    draining(state.resources.food, derived.foodRate) &&
      'Ration deficit — add a Hydroponics Bay or cut crew',
    derived.crewAlive.length >= derived.crewCap && 'No free bunks — build Crew Quarters',
  ].filter(Boolean) as string[]

  return (
    <div className="app">
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
          onPlace={(deck, col) => {
            if (!placing) return
            act({ type: 'build', kind: placing, deck, col })
            setPlacing(null)
          }}
          onCancelPlacing={() => setPlacing(null)}
          onSelectModule={(id) => setModuleId(id)}
          onSelectCrew={(id) => setCrewId(id)}
          onEmptyCell={() => setTab('build')}
          onBuyDeck={() => act({ type: 'buyDeck' })}
        />

        <aside className="panel">
          <nav className="panel__tabs">
            {(['build', 'crew', 'log'] as Tab[]).map((t) => (
              <button key={t} className={tab === t ? 'is-active' : ''} onClick={() => setTab(t)}>
                {t === 'build' ? 'Build' : t === 'crew' ? `Crew (${derived.crewAlive.length})` : 'Log'}
              </button>
            ))}
          </nav>
          {tab === 'build' && (
            <BuildMenu
              state={state}
              derived={derived}
              placing={placing}
              onPick={(kind) => setPlacing((p) => (p === kind ? null : kind))}
            />
          )}
          {tab === 'crew' && (
            <CrewPanel
              state={state}
              derived={derived}
              onSelect={(id) => setCrewId(id)}
              onAutoAssign={() => act({ type: 'autoAssign' })}
              onBroadcast={() => act({ type: 'broadcast' })}
            />
          )}
          {tab === 'log' && <LogPanel state={state} />}
        </aside>
      </main>

      {moduleId && (
        <ModuleModal
          state={state}
          moduleId={moduleId}
          onClose={() => setModuleId(null)}
          onAssign={(cid, mid) => act({ type: 'assign', crewId: cid, moduleId: mid })}
          onUpgrade={() => act({ type: 'upgrade', moduleId })}
          onRush={() => act({ type: 'rush', moduleId })}
          onDemolish={() => {
            act({ type: 'demolish', moduleId })
            setModuleId(null)
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
          onDismiss={() => {
            act({ type: 'dismiss', crewId })
            setCrewId(null)
          }}
        />
      )}

      {menuOpen && (
        <Modal title="Station options" onClose={() => setMenuOpen(false)}>
          <p className="panel-note">
            Progress saves to this browser automatically, and the station keeps running while you are
            away (up to four hours of catch-up).
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
        <Modal title="Welcome aboard, Overseer" onClose={() => act({ type: 'dismissIntro' })}>
          <p className="panel-note">
            You have a reactor, an air plant, a hydroponics bay and five people who signed up without
            reading the contract. Keep them breathing.
          </p>
          <ul className="tips">
            <li>
              <b>Power, oxygen and rations</b> are produced in cycles by staffed rooms and consumed
              constantly by your crew. Watch the rates in the header.
            </li>
            <li>
              <b>O.R.B.I.T.A.L.</b> stats decide who is good at what. Put high-Tech crew in the
              reactor, high-Operations crew in atmospherics.
            </li>
            <li>
              <b>Rooms merge</b> when two identical rooms of the same level sit side by side — bigger
              rooms are faster and hold more staff.
            </li>
            <li>
              <b>Rushing</b> finishes a cycle instantly but can start a fire, a breach or worse. The
              risk climbs with every rush.
            </li>
            <li>
              <b>Emergencies</b> are fought by whoever is standing in that room, using the stat listed
              in the room panel.
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
