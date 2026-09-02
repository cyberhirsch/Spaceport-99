import { crewPortrait } from '../game/crew.ts'

/**
 * Portrait URLs. `BASE_URL` matters: GitHub Pages serves the game from
 * /<repo>/, so a bare "/crew/..." would 404 there.
 */
const portraitUrl = (portrait: number, dossier: boolean): string => {
  const n = String(portrait).padStart(2, '0')
  return `${import.meta.env.BASE_URL}crew/crew-${n}${dossier ? '' : '-sm'}.webp`
}

interface Props {
  /** The crew member or applicant whose face this is. */
  who: { portrait?: number; seed: number }
  size?: number
  dead?: boolean
  /** Use the 512px dossier image instead of the 128px thumbnail. */
  dossier?: boolean
  className?: string
}

/** A crew member's portrait — the one they were dealt when they joined. */
export const CrewAvatar = ({ who, size = 40, dead = false, dossier = false, className }: Props) => (
  <img
    className={`avatar${dead ? ' avatar--dead' : ''}${dossier ? ' avatar--dossier' : ''}${
      className ? ` ${className}` : ''
    }`}
    src={portraitUrl(crewPortrait(who), dossier)}
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
