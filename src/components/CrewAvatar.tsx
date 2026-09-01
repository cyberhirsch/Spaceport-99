import { portraitIndex } from '../game/crew.ts'

/**
 * Portrait URLs. `BASE_URL` matters: GitHub Pages serves the game from
 * /<repo>/, so a bare "/crew/..." would 404 there.
 */
const portraitUrl = (seed: number, dossier: boolean): string => {
  const n = String(portraitIndex(seed)).padStart(2, '0')
  return `${import.meta.env.BASE_URL}crew/crew-${n}${dossier ? '' : '-sm'}.webp`
}

interface Props {
  seed: number
  size?: number
  dead?: boolean
  /** Use the 512px dossier image instead of the 128px thumbnail. */
  dossier?: boolean
  className?: string
}

/** A crew member's portrait. The same seed always gets the same face. */
export const CrewAvatar = ({ seed, size = 40, dead = false, dossier = false, className }: Props) => (
  <img
    className={`avatar${dead ? ' avatar--dead' : ''}${dossier ? ' avatar--dossier' : ''}${
      className ? ` ${className}` : ''
    }`}
    src={portraitUrl(seed, dossier)}
    width={size}
    height={size}
    // Portraits are decoration next to the crew member's name, which carries
    // the meaning; announcing "photo of crew member" twice helps nobody.
    alt=""
    loading="lazy"
    decoding="async"
    draggable={false}
  />
)
