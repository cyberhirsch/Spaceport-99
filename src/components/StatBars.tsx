import { MAX_STAT } from '../game/crew.ts'
import { STAT_INFO, STAT_KEYS, type Stats } from '../game/types.ts'

export const StatBars = ({ stats, highlight }: { stats: Stats; highlight?: string }) => (
  <ul className="statbars">
    {STAT_KEYS.map((k) => (
      <li key={k} className={highlight === k ? 'is-highlight' : ''} title={`${STAT_INFO[k].name} — ${STAT_INFO[k].blurb}`}>
        <span className="statbars__key">{k}</span>
        <span className="statbars__track">
          {Array.from({ length: MAX_STAT }, (_, i) => (
            <i key={i} className={i < stats[k] ? 'is-on' : ''} />
          ))}
        </span>
        <span className="statbars__value">{stats[k]}</span>
      </li>
    ))}
  </ul>
)
