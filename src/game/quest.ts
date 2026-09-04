import type { GameState, Quest } from './types.ts'

/**
 * The seven hulls.
 *
 * Somebody sent this station a list: ship names, the dates they stopped
 * transmitting, and one line of instruction. *None of these were lost where the
 * record says. Check the bearings.*
 *
 * The record is not falsified. Nobody has covered anything up. The record is
 * simply wrong, in the specific way a record is wrong when the thing it
 * describes does not stay where it was plotted — and every bearing a team
 * checks is one more place it now knows to look back at.
 *
 * The commander before you got the same letter, took the second name, and did
 * not come back.
 */

export interface LostHull {
  /** Transponder name, as the letter lists it. */
  name: string
  /** When the record says she stopped transmitting. */
  silent: string
  /** Where the record puts her. */
  filed: string
  /** What a team that goes and looks actually brings back. */
  found: string
  /** How much closer this brings the thing to your clamps. */
  weight: number
}

export const LOST: LostHull[] = [
  {
    name: 'Kestrel Ambit',
    silent: '11.04.2287',
    filed: 'Ridley Reach, inner survey lane',
    found:
      'Nothing at the filed position but clean vacuum and a beacon that had been switched off by hand. The wreck was eleven thousand kilometres coreward, cold, and sitting at the wrong angle to everything.',
    weight: 0.18,
  },
  {
    name: 'Corbel Nine',
    silent: '02.07.2287',
    filed: 'Outer Ridley, on passage',
    found:
      'A survey shuttle out of Spaceport-99, registered to the previous commander, on station at the filed position with its recorder still running. The recorder covers four days. Nothing happens in it until the last ninety seconds, and then the picture is of a stretch of empty sky that the instruments insist is not empty.',
    weight: 0.3,
  },
  {
    name: 'Long Meridian',
    silent: '19.09.2287',
    filed: 'The Threshing, transit',
    found:
      'The hull is intact and open to space. Every internal door is standing open, in sequence, from the outer lock inward. Nothing aboard is broken. Nothing aboard is aboard.',
    weight: 0.2,
  },
  {
    name: 'Ordinary Hours',
    silent: '28.11.2287',
    filed: 'Ridley Reach, outbound',
    found:
      'She is not where the record says and not where the drift says either. She is nine days ahead of her own last transmission, on a heading nobody plotted, still under way, with nobody at any station.',
    weight: 0.22,
  },
  {
    name: 'Sixteen Winters',
    silent: '03.02.2288',
    filed: 'Unsurveyed, bearing only',
    found:
      'A debris field, and in it a second debris field, older, of a hull that was never reported missing because it was never reported at all. The register has no entry. Somebody out here has been losing ships for longer than the Confederation has been counting.',
    weight: 0.25,
  },
  {
    name: 'Patience Fell',
    silent: '21.03.2288',
    filed: 'The Threshing, holding',
    found:
      'The team found her, logged her, and departed. Forty minutes later the fix they took no longer matched the sky. They took it again. It did not match the second time either, and the error was in the same direction and larger.',
    weight: 0.28,
  },
  {
    name: 'Absolute Zero Hour',
    silent: '—',
    filed: '—',
    found:
      'There is no such hull. There has never been such a hull. It is the seventh line on a list of six, written in the same hand as the rest, and whatever put it there was answering a question nobody asked out loud.',
    weight: 0.35,
  },
]

export const lostHull = (name: string): LostHull | undefined => LOST.find((h) => h.name === name)

/** The state of the thing before anybody has told you anything. */
export const blankQuest = (): Quest => ({
  stage: 'none',
  checked: [],
  attention: 0,
  ending: null,
})

/** Names still unchecked, in the order the letter lists them. */
export const openBearings = (q: Quest): LostHull[] => LOST.filter((h) => !q.checked.includes(h.name))

/**
 * How far along this is, as a number the interface can show. Checking bearings
 * is the only thing that moves it, and it does not move back.
 */
export const questProgress = (q: Quest): number => q.checked.length / LOST.length

/**
 * Enough to draw a conclusion from.
 *
 * Three bearings is the point at which the pattern is no longer deniable: the
 * positions are not merely wrong, they are wrong in a direction, and the
 * direction has an origin.
 */
export const ENOUGH_TO_KNOW = 3

export const knowsEnough = (q: Quest): boolean => q.checked.length >= ENOUGH_TO_KNOW

/** Attention at which it stops being a rumour and starts being a contact. */
export const WATCHED_AT = 0.5

/** Attention at which it arrives. */
export const SIEGE_AT = 1

/** What a station has learned, in words, for the file. */
export const questSummary = (s: GameState): string => {
  const q = s.quest
  if (q.stage === 'none') return 'Nothing. Nobody has told this station anything.'
  if (q.checked.length === 0)
    return 'Seven names and seven dates. Nobody has been out to look at any of them yet.'
  if (!knowsEnough(q))
    return `${q.checked.length} of seven checked. Each one was somewhere other than where it was filed, and so far that is all that can honestly be said.`
  return `${q.checked.length} of seven checked. The positions are not merely wrong, they are wrong in a direction, and the direction has an origin.`
}
