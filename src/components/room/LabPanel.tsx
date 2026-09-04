import { knows, openSpecs, researchRate } from '../../game/engine.ts'
import { SPEC_IDS, specDef } from '../../game/specs.ts'
import { eta, gift } from './helpers.ts'
import type { RoomPanelProps } from './types.ts'

/**
 * The Research Lab's own panel. Everything the station has ever recovered is
 * listed here, whether it has been worked out or not, because a drawing you
 * cannot read yet is still the only copy anyone has.
 */
export const LabPanel = ({ state, onResearch }: RoomPanelProps) => {
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
