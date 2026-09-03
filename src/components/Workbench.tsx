import {
  derive,
  fabRate,
  fabricable,
  heldItems,
  knows,
  openSpecs,
  researchRate,
} from '../game/engine.ts'
import { itemDef } from '../game/gear.ts'
import { ITEM_SPEC, SPEC_IDS, specDef } from '../game/specs.ts'
import { def } from '../game/modules.ts'
import type { GameState, ItemId, SpecId } from '../game/types.ts'

/** Seconds, rounded to something a person would say out loud. */
const eta = (remaining: number, rate: number): string => {
  if (rate <= 0) return 'stalled — nobody is working'
  const s = Math.ceil(remaining / rate)
  if (s < 90) return `${s}s`
  return `${Math.ceil(s / 60)} min`
}

/** What a spec gives you, in one line. */
const gift = (id: SpecId): string => {
  const u = specDef(id).unlocks
  return u.kind === 'module' ? `builds ${def(u.module).name}` : `runs off ${itemDef(u.item).name}`
}

interface LabProps {
  state: GameState
  onResearch: (spec: SpecId | null) => void
}

/**
 * The Research Lab's own panel. Everything the station has ever recovered is
 * listed here, whether it has been worked out or not, because a drawing you
 * cannot read yet is still the only copy anyone has.
 */
export const LabPanel = ({ state, onResearch }: LabProps) => {
  const crewById = new Map(state.crew.map((c) => [c.id, c]))
  const rate = researchRate(state, crewById)
  const open = openSpecs(state)
  const held = SPEC_IDS.filter((id) => state.specs[id] !== undefined)
  const active = state.researching

  return (
    <>
      <h3 className="modal__sub">On the board</h3>
      {held.length === 0 ? (
        <p className="panel-note">
          Nothing to work on. Specs are not sold — they turn up out there, in wrecks and holds and
          the pockets of people who no longer need them. Send crew on jobs and they will find one.
        </p>
      ) : (
        <ul className="specs">
          {held.map((id) => {
            const sd = specDef(id)
            const done = knows(state, id)
            const at = state.specs[id] ?? 0
            const working = active === id
            return (
              <li key={id} className={`spec${done ? ' spec--done' : ''}${working ? ' spec--live' : ''}`}>
                <span className="spec__head">
                  <b>{sd.name}</b>
                  <em>{gift(id)}</em>
                </span>
                <span className="spec__blurb">{sd.blurb}</span>
                <span className="spec__bar">
                  <i style={{ width: `${at * 100}%` }} />
                </span>
                <span className="spec__foot">
                  <em>
                    {done
                      ? 'Worked out. It is yours.'
                      : working
                        ? `${Math.round(at * 100)}% · ${eta((1 - at) * sd.effort, rate)}`
                        : `${Math.round(at * 100)}% · set aside`}
                  </em>
                  {!done &&
                    (working ? (
                      <button className="btn btn--tiny" onClick={() => onResearch(null)}>
                        Set aside
                      </button>
                    ) : (
                      <button className="btn btn--tiny" onClick={() => onResearch(id)}>
                        Take it up
                      </button>
                    ))}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      <p className="panel-note">
        The lab works one drawing at a time, at <b>{rate.toFixed(1)}</b> a second — its crew's
        Intellect, its size and its level. Setting one aside loses nothing; paper keeps.
        {open.length > 1 ? ` ${open.length} still to work out.` : ''}
      </p>
    </>
  )
}

interface FabProps {
  state: GameState
  onFabricate: (item: ItemId | null) => void
}

/**
 * The Fab Shop. It can only run patterns the lab has finished, one at a time,
 * and each run costs materials up front.
 */
export const FabPanel = ({ state, onFabricate }: FabProps) => {
  const crewById = new Map(state.crew.map((c) => [c.id, c]))
  const rate = fabRate(state, crewById)
  const ready = fabricable(state)
  const run = state.fabricating

  const running = run ? itemDef(run.item) : null
  const runSpec = run ? ITEM_SPEC[run.item] : undefined
  const runBuild = runSpec ? specDef(runSpec).build : undefined

  return (
    <>
      <h3 className="modal__sub">Fabrication</h3>
      {run && running && runBuild ? (
        <div className="fab-run">
          <span className="spec__head">
            <b>{running.name}</b>
            <em>{eta((1 - run.progress) * runBuild.seconds, rate)}</em>
          </span>
          <span className="spec__bar">
            <i style={{ width: `${run.progress * 100}%` }} />
          </span>
          <span className="spec__foot">
            <em>{Math.round(run.progress * 100)}% · goes to the hold when it is done</em>
            <button className="btn btn--tiny btn--danger" onClick={() => onFabricate(null)}>
              Cancel — {runBuild.credits}c back
            </button>
          </span>
        </div>
      ) : ready.length === 0 ? (
        <p className="panel-note">
          Nothing to run. The shop can only make things somebody has worked out first — find a
          spec out there, then put the lab on it.
        </p>
      ) : (
        <ul className="specs">
          {ready.map((item) => {
            const it = itemDef(item)
            const spec = ITEM_SPEC[item]
            const build = spec ? specDef(spec).build : undefined
            if (!build) return null
            const poor = state.credits < build.credits
            const noRoom = heldItems(state) >= derive(state).holdCap
            return (
              <li key={item} className="spec">
                <span className="spec__head">
                  <b>{it.name}</b>
                  <em>
                    {it.slot} · guard {it.guard}
                  </em>
                </span>
                <span className="spec__blurb">{it.blurb}</span>
                <span className="spec__foot">
                  <em>
                    {build.credits}c · {build.seconds}s of shop time · {state.stores[item] ?? 0} in
                    the hold
                  </em>
                  <button
                    className="btn btn--tiny"
                    disabled={poor || noRoom}
                    onClick={() => onFabricate(item)}
                    title={
                      noRoom
                        ? 'Nowhere to put it — the hold is full'
                        : poor
                          ? 'Not enough credits for the materials'
                          : undefined
                    }
                  >
                    {noRoom ? 'Hold full' : 'Lay one on'}
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      )}
      <p className="panel-note">
        The shop runs at <b>{rate.toFixed(1)}</b> a second and does one thing at a time. Nothing
        made here can be bought from a visiting hull at any price.
      </p>
    </>
  )
}
