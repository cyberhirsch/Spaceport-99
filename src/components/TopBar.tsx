import { useState } from 'react'
import type { Derived } from '../game/engine.ts'
import { resupplyAmount, resupplyCost } from '../game/engine.ts'
import type { GameState, ResourceKey } from '../game/types.ts'
import { RESOURCE_INFO } from '../game/types.ts'

interface Props {
  state: GameState
  derived: Derived
  onRename: (name: string) => void
  onResupply: (resource: ResourceKey) => void
  onOpenMenu: () => void
}

const fmtRate = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}/s`

const Gauge = ({
  keyName,
  value,
  cap,
  rate,
  credits,
  onResupply,
}: {
  keyName: ResourceKey
  value: number
  cap: number
  rate: number
  credits: number
  onResupply: () => void
}) => {
  const info = RESOURCE_INFO[keyName]
  const pct = Math.max(0, Math.min(1, value / cap))
  // Flag anything low, or anything draining fast enough to run out within 90s.
  const critical = pct < 0.12 || (rate < 0 && value / Math.max(0.01, -rate) < 90)
  const cost = resupplyCost(cap)
  return (
    <div className={`gauge gauge--${keyName}${critical ? ' gauge--critical' : ''}`}>
      <div className="gauge__head">
        <span className="gauge__icon">{info.icon}</span>
        <span className="gauge__name">{info.short}</span>
        <span className="gauge__value">{Math.floor(value)}</span>
        <span className="gauge__cap">/{Math.floor(cap)}</span>
      </div>
      <div className="gauge__track">
        <div className="gauge__fill" style={{ width: `${pct * 100}%` }} />
      </div>
      <div className="gauge__foot">
        <span className={`gauge__rate${rate < 0 ? ' is-neg' : ''}`}>{fmtRate(rate)}</span>
        <button
          className="gauge__buy"
          disabled={credits < cost || value >= cap}
          onClick={onResupply}
          title={`Emergency barge: +${resupplyAmount(cap)} ${info.name} for ${cost}c`}
        >
          ⤓ {cost}c
        </button>
      </div>
    </div>
  )
}

export const TopBar = ({ state, derived, onRename, onResupply, onOpenMenu }: Props) => {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(state.name)

  const commit = () => {
    setEditing(false)
    onRename(draft.trim())
  }

  return (
    <header className="topbar">
      <div className="topbar__id">
        {editing ? (
          <input
            className="topbar__input"
            value={draft}
            autoFocus
            maxLength={28}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                setDraft(state.name)
                setEditing(false)
              }
            }}
          />
        ) : (
          <button
            className="topbar__name"
            onClick={() => {
              setDraft(state.name)
              setEditing(true)
            }}
            title="Rename station"
          >
            {state.name}
          </button>
        )}
        <div className="topbar__meta">
          <span title="Credits and docking-fee income">
            ◈ {Math.floor(state.credits)}c <i>+{derived.creditRate.toFixed(1)}/s</i>
          </span>
          <span title="Crew / capacity">
            ☺ {derived.crewAlive.length}/{derived.crewCap}
          </span>
          <span title="Decks">▤ {state.decks}</span>
        </div>
      </div>

      <div className="topbar__gauges">
        {(['power', 'air', 'food'] as ResourceKey[]).map((k) => (
          <Gauge
            key={k}
            keyName={k}
            value={state.resources[k]}
            cap={derived.storageCap}
            rate={k === 'power' ? derived.powerRate : k === 'air' ? derived.airRate : derived.foodRate}
            credits={state.credits}
            onResupply={() => onResupply(k)}
          />
        ))}
      </div>

      <button className="btn btn--ghost topbar__menu" onClick={onOpenMenu} title="Station options">
        ☰
      </button>
    </header>
  )
}
