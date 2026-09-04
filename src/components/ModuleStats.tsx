import { cycleCredits, cycleYield, powerDraw } from '../game/modules.ts'
import { RESOURCE_INFO, STAT_INFO, type ModuleDef, type StationModule } from '../game/types.ts'

interface Props {
  m: StationModule
  d: ModuleDef
  rate: number
  secondsLeft: number | null
  bonus: number
}

/** The dry numbers: what it runs on, what it makes, and how it is holding up. */
export const ModuleStats = ({ m, d, rate, secondsLeft, bonus }: Props) => (
  <dl className="kv">
    <div>
      <dt>Driven by</dt>
      <dd>
        {d.stat} · {STAT_INFO[d.stat].name}
      </dd>
    </div>
    <div>
      <dt>Output</dt>
      <dd>
        {d.produces
          ? `${Math.round(cycleYield(m))} ${RESOURCE_INFO[d.produces].name} / cycle`
          : d.credits
            ? `${Math.round(cycleCredits(m))}c / cycle`
            : d.trains
              ? `+1 ${d.trains} per cycle`
              : d.heals
                ? 'Heals crew station-wide'
                : '—'}
      </dd>
    </div>
    <div>
      <dt>Speed</dt>
      <dd>{rate <= 0 ? 'stalled' : `${Math.round(rate * 100)}%`}</dd>
    </div>
    <div>
      <dt>Power draw</dt>
      <dd>
        {powerDraw(m).toFixed(1)} /s{m.standby ? ' · standby' : ''}
      </dd>
    </div>
    <div>
      <dt>Run</dt>
      <dd>
        {m.width} wide{bonus > 0 ? ` · +${bonus}% output` : ''}
      </dd>
    </div>
    <div>
      <dt>Condition</dt>
      <dd>{Math.round(m.condition * 100)}%</dd>
    </div>
    <div>
      <dt>Cycle</dt>
      <dd>{secondsLeft === null ? '—' : `${secondsLeft.toFixed(0)}s left`}</dd>
    </div>
  </dl>
)
