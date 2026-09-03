import { BUILDABLE, buildCost, countOfKind, moduleLocked } from '../game/engine.ts'
import { specDef } from '../game/specs.ts'
import type { Derived } from '../game/engine.ts'
import type { GameState, ModuleKind } from '../game/types.ts'
import { RESOURCE_INFO, STAT_INFO } from '../game/types.ts'

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
        Wings grow outward from the lift shaft, five rooms to a side. Rooms of a kind at the same
        level weld into one run — up to three wide, worth 15% more output per extra segment, and
        it takes two upgrades where a room on its own takes one. Press and hold a room to pick it
        up and move it, for a fee.
      </p>
      <ul className="build-list">
        {BUILDABLE.map((d) => {
          // Two different walls. Most rooms wait on people; a couple wait on a
          // drawing nobody at this station has ever seen.
          const gate = moduleLocked(state, d.kind)
          const found = gate !== null && state.specs[gate] !== undefined
          const locked = gate !== null || crewCount < d.unlockAtCrew
          const cost = buildCost(d.kind, countOfKind(state, d.kind))
          const poor = state.credits < cost
          const why = gate
            ? found
              ? `${specDef(gate).name} — the lab is still working on it`
              : `Needs a spec nobody here has: ${specDef(gate).name}`
            : crewCount < d.unlockAtCrew
              ? `Unlocks at ${d.unlockAtCrew} crew`
              : d.blurb
          return (
            <li key={d.kind}>
              <button
                className={`build-item${placing === d.kind ? ' is-active' : ''}${gate ? ' is-gated' : ''}`}
                style={{ ['--room-hue' as string]: String(d.hue) }}
                disabled={locked || poor}
                onClick={() => onPick(d.kind)}
                title={why}
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
                    {d.repairs && <em>⚙ repairs rooms</em>}
                    {d.berths && <em>{d.berths} berths · ◈ docking fees</em>}
                    {d.powerDraw > 0 && <em className="is-cost">⚡ {d.powerDraw}/s</em>}
                  </span>
                </span>
                <span className="build-item__cost">
                  {gate ? (found ? 'in the lab' : 'spec needed') : locked ? `${d.unlockAtCrew} crew` : `${cost}c`}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
