import { derive, fabRate, fabricable, heldItems } from '../../game/engine.ts'
import { itemDef } from '../../game/gear.ts'
import { ITEM_SPEC, specDef } from '../../game/specs.ts'
import { eta } from './helpers.ts'
import type { RoomPanelProps } from './types.ts'

/**
 * The Fab Shop. It can only run patterns the lab has finished, one at a time,
 * and each run costs materials up front.
 */
export const FabPanel = ({ state, onFabricate }: RoomPanelProps) => {
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
