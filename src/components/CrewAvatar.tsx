import { portraitFor } from '../game/crew'

interface Props {
  seed: number
  size?: number
  dead?: boolean
}

/** A tiny procedural crew portrait — same seed always gives the same face. */
export const CrewAvatar = ({ seed, size = 40, dead = false }: Props) => {
  const p = portraitFor(seed)
  const eyeY = 27
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={`avatar${dead ? ' avatar--dead' : ''}`}
      aria-hidden="true"
    >
      <rect width="48" height="48" rx="8" fill="#0c141c" />
      <path d="M8 48c0-9 7-13 16-13s16 4 16 13z" fill={p.suit} />
      <rect x="20" y="30" width="8" height="7" fill={p.skin} />
      <ellipse cx="24" cy="22" rx="11" ry="12" fill={p.skin} />
      {p.hairStyle === 0 && <path d="M13 20c0-8 5-12 11-12s11 4 11 12c0-4-4-6-11-6s-11 2-11 6z" fill={p.hair} />}
      {p.hairStyle === 1 && <path d="M12 22c0-9 5-14 12-14s12 5 12 14l-3 1c0-7-3-10-9-10s-9 3-9 10z" fill={p.hair} />}
      {p.hairStyle === 2 && <path d="M14 14c4-6 16-6 20 0 2 3 1 7 1 7l-2-4c-6 3-13 3-18 0l-2 4s-1-4 1-7z" fill={p.hair} />}
      {p.hairStyle === 3 && <circle cx="24" cy="13" r="7" fill={p.hair} />}
      {p.visor ? (
        <rect x="13" y={eyeY - 5} width="22" height="9" rx="4" fill="#7fe3ff" opacity="0.85" />
      ) : (
        <>
          <ellipse cx="19.5" cy={eyeY} rx={p.eyes === 0 ? 1.7 : 2.1} ry={p.eyes === 2 ? 1.1 : 2.1} fill="#12181f" />
          <ellipse cx="28.5" cy={eyeY} rx={p.eyes === 0 ? 1.7 : 2.1} ry={p.eyes === 2 ? 1.1 : 2.1} fill="#12181f" />
        </>
      )}
      {p.mouth === 0 && <path d="M20 34q4 3 8 0" stroke="#7d3f3f" strokeWidth="1.6" fill="none" strokeLinecap="round" />}
      {p.mouth === 1 && <rect x="21" y="33" width="6" height="1.8" rx="0.9" fill="#7d3f3f" />}
      {p.mouth === 2 && <path d="M20 34q4 -3 8 0" stroke="#7d3f3f" strokeWidth="1.6" fill="none" strokeLinecap="round" />}
      {dead && (
        <>
          <path d="M14 14l20 20M34 14L14 34" stroke="#ff6b6b" strokeWidth="2.5" strokeLinecap="round" opacity="0.9" />
        </>
      )}
    </svg>
  )
}
