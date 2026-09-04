import { covertShift, derive, log, roll, shift, unassign } from '../engine.ts'
import { factionDef } from '../factions.ts'
import { registerScript, type TalkCtx, type TalkScript } from '../talk.ts'

/**
 * The first bill from whoever took the station.
 *
 * Losing the flag used to be the end of the story: the paper over the door
 * changed and nothing followed from it. This is what follows. They do not want
 * the station wrecked, they want it useful, and useful turns out to have a
 * price list — credits, or people, or a room run their way.
 *
 * Refusing is survivable exactly once. What it really does is make the quiet
 * word from the power you used to fly for arrive sooner, and land better.
 */

const owed = (c: TalkCtx): number => c.ship?.asking ?? 400

/** Two hands they would like transferred to their own use. */
const hands = (c: TalkCtx) => derive(c.s).crewAlive.slice(0, 2)

const script: TalkScript = {
  start: {
    sticky: true,
    text: (c) => {
      const them = factionDef(c.s.patron ?? 'terran')
      return `They do not take the chair you offer. "Spaceport-99. You are on the ${them.short} roll as of eleven days ago, which means you are on the ${them.short} schedule." A folder, actually printed. "This is what the schedule says."`
    },
    beat: (c) =>
      `${factionDef(c.s.patron ?? 'terran').name} · first assessment · ${owed(c)}c, or two of your people, or the Brig run to their standard`,
    replies: [
      {
        label: (c) => `Pay the assessment — ${owed(c)}c.`,
        note: () => 'The cheapest of the three, and the one nobody remembers.',
        barred: (c) => (c.s.credits < owed(c) ? 'Not in the account' : null),
        effect: (c) => {
          const paid = owed(c)
          c.s.credits -= paid
          if (c.s.patron) shift(c.s, c.s.patron, 0.05)
          log(c.s, `The assessment was paid. −${paid}c.`, 'info')
        },
        goto: 'settled',
      },
      {
        label: 'Second two of the crew to them.',
        note: (c) => {
          const who = hands(c)
          return who.length < 2
            ? 'You do not have two to spare.'
            : `${who.map((x) => x.name).join(' and ')} go with them. It costs nothing you can count.`
        },
        barred: (c) => (hands(c).length < 2 ? 'Not enough crew aboard' : null),
        effect: (c) => {
          const who = hands(c)
          for (const x of who) {
            unassign(c.s, x.id)
            c.s.crew = c.s.crew.filter((y) => y.id !== x.id)
          }
          if (c.s.patron) shift(c.s, c.s.patron, 0.07)
          log(
            c.s,
            `${who.map((x) => x.name).join(' and ')} were seconded off the station. They did not ask to be.`,
            'warn',
          )
          c.talk.flags.push('seconded')
        },
        goto: 'settled',
      },
      {
        label: 'Refuse the assessment.',
        note: () => 'They expected this. Somebody else will be pleased to hear it.',
        effect: (c) => {
          const patron = c.s.patron
          if (patron) shift(c.s, patron, -0.09)
          // The powers you used to fly for hear about this within the hour.
          for (const id of c.s.resigned) covertShift(c.s, id, 0.06)
          // And they will be in touch.
          c.s.nextApproachIn = Math.min(c.s.nextApproachIn, 90 + roll(c.s) * 180)
          log(c.s, `You refused the assessment. It was written down.`, 'bad')
        },
        goto: 'refused',
      },
    ],
  },

  settled: {
    final: true,
    text: (c) =>
      c.has('seconded')
        ? `They went aboard with one bag each and did not look back at the station, which is the correct way to do it and made it no easier to watch. The folder was closed. There will be another folder.`
        : `The folder closed. Nobody shook hands, and the ${c.talk.who} was off the clamps inside twenty minutes. There will be another folder.`,
    replies: [{ label: 'Close', goto: null }],
  },

  refused: {
    final: true,
    text: (c) =>
      `"Noted." That is the entire answer. The ${c.talk.who} left on schedule, and somewhere in the Drift three separate people who used to have paper on this station heard about it before the hull had cleared the beacon.`,
    replies: [{ label: 'Close', goto: null }],
  },
}

registerScript('levy', script)

export default script
