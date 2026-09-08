import { def, derive } from '../engine.ts'
import { factionDef } from '../factions.ts'
import { STAT_KEYS, type StatKey, type GameState, type Stats } from '../types.ts'
import { registerScript, type TalkScript } from '../talk.ts'

/**
 * Meeting somebody HQ posted here.
 *
 * There is nothing to win and nothing to lose. The transfer went through
 * before they were put on the courier: they are crew the moment this ends, and
 * no answer given here changes that. What it is for is finding out who has
 * just walked onto your station — which is the one thing the roster will never
 * tell you.
 *
 * Everything varies off their seed, so two recruits are not the same arrival,
 * and off the state of the station, because what they noticed coming in
 * depends on what there was to notice.
 */

/**
 * One of a set, fixed for this person. Each `salt` is an independent draw, and
 * the mixing matters: neighbouring seeds have to land on different lines, or
 * two recruits dispatched together arrive saying the same things.
 */
const pick = <T>(seed: number, salt: number, from: readonly T[]): T =>
  from[Math.abs(seed * 31 + salt * 101) % from.length]

/**
 * A stable number for somebody whose record has already left the dock. By the
 * closing line they are crew, not a candidate, so their seed is out of reach
 * and the name is all the conversation still holds.
 */
const fromName = (name: string): number => {
  let h = 0
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) | 0
  return h
}

const bestStat = (stats: Stats): StatKey =>
  STAT_KEYS.reduce((best, k) => (stats[k] > stats[best] ? k : best), STAT_KEYS[0])

/**
 * The first thing they noticed on the way in. The station decides this one —
 * but a station with nothing wrong with it still gets a range of answers, or
 * every recruit arriving at a quiet posting says the same sentence.
 */
const firstImpression = (s: GameState, seed: number): string => {
  const d = derive(s)
  if (s.incidents.length > 0) {
    return `"Honestly? I could see it burning from the approach." A beat. "I have arrived at worse."`
  }
  if (d.crewAlive.length >= d.crewCap) {
    return `"Full. That was the first thing." They shrug. "I counted the bunks on the way in. It is a habit and not a helpful one."`
  }
  if (s.resources.air <= 0 || s.resources.food <= 0) {
    return `"You are out of something. I could tell from the corridor." They do not push it. "Not my first week of that either."`
  }
  if (s.modules.length >= 12) {
    return `"Bigger than the briefing made it sound. Somebody has been building out here."` + ` That reads as approval.`
  }
  return pick(seed, 4, [
    `"Small." They catch themselves. "That is not an insult. I have had small postings I was sorry to leave."`,
    `"Quiet." A pause, as though deciding whether to say the rest. "I have done loud. Quiet is better."`,
    `"Honestly, I cannot tell yet." Which is the most useful answer anybody has given you all week.`,
    `"Tidier than the last one." They mean it as a compliment and it lands as one.`,
  ])
}

const script: TalkScript = {
  start: {
    text: (c) => {
      const cand = c.candidate
      if (!cand) return 'They have gone.'
      return pick(cand.seed, 0, [
        `"${c.name}. Reporting aboard." They have a kitbag over one shoulder and nowhere obvious to put it.`,
        `"Commander." They set down a crate, straighten up, and wait to be told what happens next.`,
        `"${c.name}. They said find whoever is in charge." A look around. "I am assuming that is you."`,
        `"The transfer is already in the system, if you want to check it." They are not being difficult. They have just done this before.`,
      ])
    },
    beat: (c) => {
      const cand = c.candidate
      if (!cand) return null
      return `${factionDef(cand.faction).short} transfer · best at ${bestStat(cand.stats)} · already on the roster`
    },
    replies: [
      { label: 'What were you doing before this?', sets: ['before'], goto: 'before' },
      { label: 'What do you make of the place?', sets: ['looked'], goto: 'impression' },
      { label: 'Did you ask for this posting?', sets: ['asked'], goto: 'asked' },
      { label: 'Welcome them aboard.', goto: 'aboard' },
    ],
  },

  before: {
    text: (c) => {
      const cand = c.candidate
      if (!cand) return ''
      return pick(cand.seed, 1, [
        `"Ore hauler out of the belt. Three years of the same corridor." They do not appear to miss it.`,
        `"Depot work, dirtside. I had never been further out than the yards until the courier."`,
        `"A station about a third this size that is not there any more." They leave it exactly there.`,
        `"This, with a different name on it. You get moved a lot when nobody has a reason to keep you."`,
      ])
    },
    beat: (c) =>
      c.candidate
        ? `Good with ${bestStat(c.candidate.stats)}, whatever the last place had them doing.`
        : null,
    replies: [
      {
        label: 'What do you make of the place?',
        when: (c) => !c.has('looked'),
        sets: ['looked'],
        goto: 'impression',
      },
      {
        label: 'Did you ask for this posting?',
        when: (c) => !c.has('asked'),
        sets: ['asked'],
        goto: 'asked',
      },
      { label: 'Welcome them aboard.', goto: 'aboard' },
    ],
  },

  impression: {
    text: (c) => firstImpression(c.s, c.candidate?.seed ?? 0),
    replies: [
      {
        label: 'What were you doing before this?',
        when: (c) => !c.has('before'),
        sets: ['before'],
        goto: 'before',
      },
      {
        label: 'Did you ask for this posting?',
        when: (c) => !c.has('asked'),
        sets: ['asked'],
        goto: 'asked',
      },
      { label: 'Welcome them aboard.', goto: 'aboard' },
    ],
  },

  asked: {
    text: (c) => {
      const cand = c.candidate
      if (!cand) return ''
      return pick(cand.seed, 2, [
        `"No. Nobody asks." A shrug that is not resentful. "It is not the worst way to end up somewhere."`,
        `"I put in for a different one and got this instead." A pause. "I have stopped taking that personally."`,
        `"You do not ask. You get a berth number and eleven days to think about it."`,
      ])
    },
    replies: [
      {
        label: 'What were you doing before this?',
        when: (c) => !c.has('before'),
        sets: ['before'],
        goto: 'before',
      },
      {
        label: 'What do you make of the place?',
        when: (c) => !c.has('looked'),
        sets: ['looked'],
        goto: 'impression',
      },
      { label: 'Welcome them aboard.', goto: 'aboard' },
    ],
  },

  // The engine puts them on the roster the moment this is reached; the flag is
  // written back so the line can tell whether there was a bunk for them.
  aboard: {
    final: true,
    text: (c) => {
      if (!c.has('signed')) {
        return `"There is nowhere to put me, is there." Not a complaint — an observation, and a correct one. "I will wait on the dock. Build something with a bunk in it."`
      }
      const room = c.s.modules.find((m) => m.kind === 'quarters')
      return pick(fromName(c.name), 3, [
        room
          ? `"Right. The ${def(room.kind).name}, then. I will find it." They are already going.`
          : `"Right. Somewhere to put this, then." They shoulder the bag again and go looking.`,
        `"Then I am aboard." They pick the kitbag back up. "Tell me where you want me."`,
        `"Good." A nod, and that is the whole of the ceremony.`,
      ])
    },
    replies: [{ label: 'Close', goto: null }],
  },
}

registerScript('welcome', script)

export default script
