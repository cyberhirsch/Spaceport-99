import { BUILDABLE, buildCost, countOfKind } from '../game/engine'
import type { Derived } from '../game/engine'
import type { GameState, ModuleKind } from '../game/types'
import { RESOURCE_INFO, STAT_INFO } from '../game/types'

interface Props {
  state: GameState
  derived: Derived
  placing: ModuleKind | null
  onPick: (kind: ModuleKind) => void
}

export const BuildMenu = ({ state, derived, placing, onPick }: Props) => {
  const crewCount = derived.crewAlive.length
  return (
    <div className="panel-body">
      <p className="panel-note">
        Rooms must touch the spine or an existing room. Two identical rooms side by side merge into
        one bigger, faster room.
      </p>
      <ul className="build-list">
        {BUILDABLE.map((d) => {
          const locked = crewCount < d.unlockAtCrew
          const cost = buildCost(d.kind, countOfKind(state, d.kind))
          const poor = state.credits < cost
          return (
            <li key={d.kind}>
              <button
                className={`build-item${placing === d.kind ? ' is-active' : ''}`}
                style={{ ['--room-hue' as string]: String(d.hue) }}
                disabled={locked || poor}
                onClick={() => onPick(d.kind)}
                title={locked ? `Unlocks at ${d.unlockAtCrew} crew` : d.blurb}
              >
                <span className="build-item__glyph">{d.glyph}</span>
                <span className="build-item__text">
                  <span className="build-item__name">{d.name}</span>
                  <span className="build-item__blurb">{d.blurb}</span>
                  <span className="build-item__tags">
                    <em title={STAT_INFO[d.stat].name}>{d.stat} · {STAT_INFO[d.stat].name}</em>
                    {d.produces && <em>{RESOURCE_INFO[d.produces].icon} {RESOURCE_INFO[d.produces].name}</em>}
                    {d.credits && <em>◈ credits</em>}
                    {d.trains && <em>trains {d.trains}</em>}
                    {d.crewCapacity && <em>+{d.crewCapacity} bunks</em>}
                    {d.storageBonus && <em>+{d.storageBonus} storage</em>}
                    {d.heals && <em>✚ heals crew</em>}
                    {d.powerDraw > 0 && <em className="is-cost">⚡ {d.powerDraw}/s</em>}
                  </span>
                </span>
                <span className="build-item__cost">
                  {locked ? `${d.unlockAtCrew} crew` : `${cost}c`}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
