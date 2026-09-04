import { ASK_RISK, expose } from '../engine.ts'
import { covertShift, exposureRisk, log, roll, shift } from '../engine.ts'
import { factionDef } from '../factions.ts'
import { luckiest } from '../crew.ts'
import { registerScript, type TalkCtx, type TalkScript } from '../talk.ts'
import type { CovertAsk, CovertOffer } from '../types.ts'

/**
 * The quiet word.
 *
 * Every power would rather have an arrangement with a station than the trouble
 * of taking one, so sooner or later each of them sends somebody to find out
 * what kind of commander you are. The hull carrying the message is never
 * flying their paper: neither of you has to admit the conversation happened.
 *
 * There are three answers and all of them mean something. Take it and you are
 * paid, you are owed a favour, and you are one bad roll from your own flag
 * finding out. Refuse and nothing happens at all, which is the point — refusing
 * is free, and that is what makes taking it a choice rather than a trap. Report
 * it and you have picked a side out loud.
 *
 * Allegiance in this game is not a menu. It is the sum of these answers.
 */

const offerOf = (c: TalkCtx): CovertOffer | null => c.ship?.covert ?? null

/** What the arrangement is worth to them, in their own ledger. */
const GAIN: Record<CovertAsk, number> = {
  cargo: 0.05,
  names: 0.06,
  window: 0.07,
  turn: 0.09,
}

const WANT: Record<CovertAsk, string> = {
  cargo: `"Four crates. They come aboard on your manifest as ration stock, and they leave on somebody else's. Nobody opens them. You least of all."`,
  names: `"Who has been alongside. Names, hulls, and what came off them." A small shrug. "You keep a log already. I am only asking to read it."`,
  window: `"One hour, tonight. Nobody on the clamps, nobody watching the approach, and no note of why." They let that sit. "You will not see what uses it, which is a kindness."`,
  turn: `"You fly their paper now. That is fine, that is business." A pause. "We would like you to go on talking to us as though you did not."`,
}

const TAKEN: Record<CovertAsk, string> = {
  cargo: 'The crates went into the hold as ration stock and came out again eleven hours later. Nobody signed anything.',
  names: 'You read them the log. It took four minutes and felt considerably longer.',
  window: 'For an hour the clamps had nobody on them. Whatever came alongside did not show on the board, and the board is not lying.',
  turn: 'Nothing about the station changed. Everything about who you are to it did.',
}

/** The odds this one does not stay quiet, as a percentage. */
export const exposureOdds = (c: TalkCtx): number => {
  const o = offerOf(c)
  if (!o) return 0
  // The luckiest one on the Covert Ops watch shades the odds a little, same as
  // everywhere else the stat works.
  const onWatch = c.s.crew.filter((cr) =>
    c.s.modules.some((m) => m.kind === 'covertops' && m.staff.includes(cr.id)),
  )
  return Math.max(0.03, Math.min(0.95, exposureRisk(c.s) * ASK_RISK[o.ask] - luckiest(onWatch) * 0.01))
}

const script: TalkScript = {
  start: {
    text: (c) => {
      const o = offerOf(c)
      if (!o) return `"Never mind. It will keep."`
      return `They wait until the deck is empty, which tells you what this is before they open their mouth. "I am not asking on behalf of the hull I came in on, commander. You understand that much."`
    },
    beat: (c) => {
      const o = offerOf(c)
      if (!o) return null
      return `Off the ${c.talk.who} · speaking for ${factionDef(o.from).name}`
    },
    replies: [
      { label: 'Go on.', goto: 'what' },
      {
        label: 'Say it on the open channel or not at all.',
        note: () => 'Nothing is asked, nothing is owed, and nobody hears about it.',
        effect: (c) => {
          const o = offerOf(c)
          if (!o || !c.ship) return
          c.ship.covert = undefined
          covertShift(c.s, o.from, -0.01)
        },
        goto: 'refused',
      },
    ],
  },

  what: {
    text: (c) => {
      const o = offerOf(c)
      return o ? WANT[o.ask] : ''
    },
    beat: (c) => {
      const o = offerOf(c)
      if (!o) return null
      return `${o.pays}c on the table. Nothing about this goes in the log — unless it comes out.`
    },
    replies: [
      {
        label: 'All right.',
        note: (c) => {
          const o = offerOf(c)
          if (!o) return null
          const pct = Math.round(exposureOdds(c) * 100)
          return `+${o.pays}c and ${factionDef(o.from).short} owe you one. About ${pct}% chance it comes out.`
        },
        effect: (c) => {
          const o = offerOf(c)
          if (!o || !c.ship) return
          c.s.credits += o.pays
          covertShift(c.s, o.from, GAIN[o.ask])
          // Selling the log means selling whoever is on it, including them.
          if (o.ask === 'names') shift(c.s, c.ship.faction, -0.02)
          c.ship.covert = undefined
          // The offer is gone by the time the closing line renders, so keep
          // what it was.
          c.talk.flags.push(`ask:${o.ask}`)
          log(c.s, `An arrangement with ${factionDef(o.from).short}. +${o.pays}c.`, 'good')
          // And then the part you do not control.
          if (roll(c.s) < exposureOdds(c)) {
            expose(c.s, o.from, o.ask)
            c.talk.flags.push('exposed')
          }
        },
        goto: 'taken',
      },
      {
        label: (c) => `Report it to ${factionDef(c.s.patron ?? 'terran').short}.`,
        note: () => 'Your flag hears within the hour. So does theirs.',
        when: (c) => c.s.patron !== null && c.s.patron !== offerOf(c)?.from,
        effect: (c) => {
          const o = offerOf(c)
          const patron = c.s.patron
          if (!o || !c.ship || !patron) return
          shift(c.s, patron, 0.05)
          shift(c.s, o.from, -0.06)
          covertShift(c.s, o.from, -0.1)
          c.ship.covert = undefined
          // Whoever carried the message is not staying to discuss it.
          c.ship.timer = Math.min(c.ship.timer, 20)
          log(
            c.s,
            `You filed ${factionDef(o.from).short}'s approach with ${factionDef(patron).short}.`,
            'info',
          )
        },
        goto: 'reported',
      },
      {
        label: 'No.',
        note: () => 'Nothing is owed either way. Nobody hears about it.',
        effect: (c) => {
          const o = offerOf(c)
          if (!o || !c.ship) return
          c.ship.covert = undefined
          covertShift(c.s, o.from, -0.01)
        },
        goto: 'refused',
      },
    ],
  },

  taken: {
    final: true,
    text: (c) => {
      const done = c.has('exposed')
      const line = c.talk.flags.find((f) => f.startsWith('ask:'))?.slice(4) as CovertAsk | undefined
      const body = line ? TAKEN[line] : 'It was done quietly and it stayed done.'
      return done
        ? `${body}\n\nAnd then somebody said something to somebody. These things get out. That is what they are for.`
        : `${body}\n\nNobody said anything. That is not the same as nobody knowing.`
    },
    replies: [{ label: 'Close', goto: null }],
  },

  refused: {
    final: true,
    text: () =>
      `"Then I did not ask." They go back to whatever they were pretending to do, and the hull leaves on schedule. Somewhere a note is made that this station said no, which is worth something too.`,
    replies: [{ label: 'Close', goto: null }],
  },

  reported: {
    final: true,
    text: (c) =>
      `The channel closes. The hull is off the clamps inside the hour and does not file a departure. ${factionDef(c.s.patron ?? 'terran').short} thanked you in the way they thank people: a line in a file you will never read.`,
    replies: [{ label: 'Close', goto: null }],
  },
}

registerScript('covert', script)

export default script
