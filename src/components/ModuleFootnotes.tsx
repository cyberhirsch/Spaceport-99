import { MAX_MERGE } from '../game/engine.ts'
import type { ModuleDef, StationModule } from '../game/types.ts'

interface Props {
  m: StationModule
  d: ModuleDef
  top: number
  bonus: number
  nextSlots: number
  onAutoAccept: (on: boolean) => void
}

/** The small print: merging, repairs, the dock's standing order, standby. */
export const ModuleFootnotes = ({ m, d, top, bonus, nextSlots, onAutoAccept }: Props) => (
  <>
    {d.slotsPerSegment > 0 && (
      <p className="panel-note">
        {m.width < MAX_MERGE
          ? `Put another level-${m.level} ${d.name} against this one and they weld into a single run — up to ${MAX_MERGE} wide, worth 15% more output per extra segment. Upgrading a neighbour to match does it too.`
          : `A ${m.width}-wide run: +${bonus}% output over the same floor apart, and two upgrades instead of one.`}
        {m.level < top
          ? ` Level ${m.level + 1} works ${nextSlots}.`
          : m.width === 1
            ? ' A room on its own stops here; weld it into a run for the second upgrade.'
            : ''}
      </p>
    )}

    {d.repairs && (
      <p className="panel-note">
        While staffed, its damage-control party works the station's worst-damaged rooms back
        towards sound. It will not touch a room that is currently on fire.
      </p>
    )}

    {m.kind === 'dock' && (
      <label className="toggle">
        <input
          type="checkbox"
          checked={Boolean(m.autoAccept)}
          onChange={(e) => onAutoAccept(e.target.checked)}
        />
        <span>
          Standing order to the desk: clear anything that hails. Convenient, and nobody reads the
          scan before a hull is alongside. The desk still has to be manned either way.
        </span>
      </label>
    )}

    {m.standby && (
      <p className="panel-note">
        Powered down. It draws a tenth of its usual load and does nothing at all until you bring it
        back.
      </p>
    )}
  </>
)
