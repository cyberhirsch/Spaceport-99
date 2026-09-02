import {
  DECLARE_AT,
  declineReason,
  patronStanding,
} from '../game/engine.ts'
import {
  FACTION_IDS,
  STANDING_CEILING,
  STANDING_FLOOR,
  factionDef,
  standingWord,
} from '../game/factions.ts'
import type { FactionId, GameState } from '../game/types.ts'

interface Props {
  state: GameState
  onDeclare: (faction: FactionId) => void
  onResign: () => void
}

/** Where a power's opinion sits on the bar, 0..1. */
const place = (n: number): number =>
  ((n - STANDING_FLOOR) / (STANDING_CEILING - STANDING_FLOOR)) * 100

export const PowersPanel = ({ state, onDeclare, onResign }: Props) => {
  const patron = state.patron ? factionDef(state.patron) : null
  const locked = Boolean(patron && !patron.exit)

  return (
    <div className="panel-body">
      <p className="panel-note">
        Three powers hold a claim on this patch of the Verge, and the station sits where the
        claims overlap. Whose paper you fly decides who HQ sends you and how nasty the contracts
        get. The front moves; the right flag this year is not next year's.
      </p>

      <div className={`flag${patron ? ' flag--flown' : ''}`}>
        <span className="flag__label">Flying</span>
        <b style={patron ? { color: `hsl(${patron.hue} 70% 62%)` } : undefined}>
          {patron ? patron.name : 'No flag'}
        </b>
        <em>
          {patron
            ? locked
              ? 'Enrolled. There is no clause for undoing this.'
              : patron.offer
            : 'Nobody taxes you, audits you or bills you. Nobody comes when the Ossuary Kings do.'}
        </em>
      </div>

      <ul className="powers">
        {FACTION_IDS.map((id) => {
          const d = factionDef(id)
          const n = state.standing[id]
          const why = declineReason(state, id)
          const flying = state.patron === id
          return (
            <li
              key={id}
              className={`power${flying ? ' power--flying' : ''}`}
              style={{ ['--power-hue' as string]: String(d.hue) }}
            >
              <span className="power__head">
                <i className="power__glyph">{d.glyph}</i>
                <span className="power__name">
                  {d.name}
                  <em>{d.claim}</em>
                </span>
                <span className={`power__word power__word--${standingWord(n)}`}>
                  {standingWord(n)}
                </span>
              </span>

              <span className="power__bar" title={`Standing ${n.toFixed(3)}`}>
                <i className="power__zero" />
                <i className="power__fill" style={{ width: `${place(n)}%` }} />
                <i className="power__gate" style={{ left: `${place(DECLARE_AT)}%` }} />
              </span>

              {state.resigned.includes(id) && (
                <span className="power__note">You walked out on them once. They kept the file.</span>
              )}

              {flying ? (
                <div className="power__act">
                  <span className="power__note">{d.offer}</span>
                  {d.exit ? (
                    <button className="btn btn--tiny btn--danger" onClick={onResign}>
                      Strike the flag
                    </button>
                  ) : (
                    <span className="power__note">No exit clause.</span>
                  )}
                </div>
              ) : (
                <div className="power__act">
                  <span className="power__note">{why ?? d.offer}</span>
                  {!why && (
                    <button className="btn btn--tiny" onClick={() => onDeclare(id)}>
                      Declare
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <p className="panel-note">
        Standing moves on what you do at the clamps: who you berth, who you wave off, who you
        trade with, and who you poach off somebody else's bridge. It counts for{' '}
        <b>{(patronStanding(state) * 100).toFixed(0)}</b> towards what the station is worth to a
        stranger right now.
      </p>
    </div>
  )
}
