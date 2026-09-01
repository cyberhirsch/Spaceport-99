import type { GameState } from '../game/types.ts'

const clock = (seconds: number) => {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export const LogPanel = ({ state }: { state: GameState }) => (
  <div className="panel-body">
    <p className="panel-note">Station time {clock(state.elapsed)}</p>
    <ul className="log">
      {state.log.length === 0 && <li className="log__empty">Nothing to report.</li>}
      {state.log.map((entry) => (
        <li key={entry.id} className={`log__row log__row--${entry.tone}`}>
          <span className="log__time">{clock(entry.at)}</span>
          <span>{entry.text}</span>
        </li>
      ))}
    </ul>
  </div>
)
