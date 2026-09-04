import { cellsAboard, covertShift, log, roll, shift } from '../engine.ts'
import { factionDef } from '../factions.ts'
import { registerScript, type TalkCtx, type TalkScript } from '../talk.ts'
import type { Prisoner } from '../types.ts'

/**
 * They have come for the person in your cells.
 *
 * The Brig used to end every story in one conversation. It does not now: people
 * have people, and holding somebody long enough means finding out who. What you
 * decided down there is suddenly a thing another power has an opinion about,
 * and there is no answer here that costs nothing.
 */

const held = (c: TalkCtx): Prisoner | null =>
  c.s.prisoners.find((p) => p.id === c.ship?.claiming) ?? null

/** What they will pay to have this settled quietly. */
const purse = (c: TalkCtx): number => c.ship?.asking ?? 300

const release = (c: TalkCtx): Prisoner | null => {
  const p = held(c)
  if (!p) return null
  c.s.prisoners = c.s.prisoners.filter((x) => x.id !== p.id)
  return p
}

/** The hull has what it came for, or has been told no. Either way it goes. */
const leave = (c: TalkCtx): void => {
  const v = c.ship
  if (!v) return
  v.claiming = undefined
  v.status = 'requesting'
  v.timer = 0
}

const script: TalkScript = {
  start: {
    text: (c) => {
      const p = held(c)
      if (!p) {
        return `"We were told you had one of ours." They look past you at the deck, and at nothing in particular. "Told wrong, apparently. It happens."`
      }
      const mins = Math.floor(p.held / 60)
      return p.faction === 'unlisted'
        ? `"You have got ${p.name}." Not a question. "${mins} minutes, near enough. We do not file complaints, commander, we just turn up. So: what is it going to take."`
        : `"Commander. You are holding ${p.name}, who is ours, on a charge you wrote yourself." A thin pause. "We would like them back, and we would like this to stay small."`
    },
    beat: (c) => {
      const p = held(c)
      if (!p) return 'Whoever they came for is not in the cells.'
      return `${factionDef(p.faction).short} · ${p.charge} · ${Math.floor(p.held / 60)} min in the cells · they are offering ${purse(c)}c`
    },
    replies: [
      {
        label: 'Hand them over.',
        note: (c) => `+${purse(c)}c, and ${factionDef(c.ship?.faction ?? 'unlisted').short} owe you a small one.`,
        when: (c) => Boolean(held(c)),
        effect: (c) => {
          const p = release(c)
          const v = c.ship
          if (!p || !v) return
          const paid = purse(c)
          c.s.credits += paid
          shift(c.s, p.faction, 0.05)
          // Your own flag notices that a charge you wrote went away for money.
          if (c.s.patron && c.s.patron !== p.faction) shift(c.s, c.s.patron, -0.03)
          leave(c)
          log(c.s, `${p.name} went home on the ${v.name}. +${paid}c.`, 'good')
        },
        goto: 'handed',
      },
      {
        label: 'Give them up for nothing.',
        note: () => 'No money changes hands, which is the part they will remember.',
        when: (c) => Boolean(held(c)),
        effect: (c) => {
          const p = release(c)
          if (!p) return
          shift(c.s, p.faction, 0.09)
          covertShift(c.s, p.faction, 0.05)
          leave(c)
          log(c.s, `${p.name} walked out to their own people. Nobody paid anybody.`, 'info')
        },
        goto: 'handed',
      },
      {
        label: 'No. They stay where they are.',
        note: (c) =>
          c.s.patron && c.s.patron !== c.ship?.faction
            ? `${factionDef(c.s.patron).short} will like that. ${factionDef(c.ship?.faction ?? 'unlisted').short} will not.`
            : 'They will take that badly, and they will take it personally.',
        effect: (c) => {
          const v = c.ship
          if (!v) return
          shift(c.s, v.faction, -0.07)
          covertShift(c.s, v.faction, -0.05)
          if (c.s.patron && c.s.patron !== v.faction) shift(c.s, c.s.patron, 0.03)
          // Being refused is exactly the sort of thing that brings a hull back
          // later with a different intent.
          if (roll(c.s) < 0.5) c.s.nextLoiterIn = Math.min(c.s.nextLoiterIn, 240 + roll(c.s) * 240)
          leave(c)
          log(c.s, `You told the ${v.name} no. They did not argue, which is worse.`, 'warn')
        },
        goto: 'refused',
      },
      {
        label: 'Ask what they are worth to somebody else.',
        note: () => 'A bidding war over a person is a thing that happens out here.',
        when: (c) => Boolean(held(c)) && cellsAboard(c.s) > 0,
        goto: 'auction',
      },
      { label: 'Say nothing yet.', when: (c) => Boolean(held(c)), goto: null },
    ],
  },

  auction: {
    text: (c) => {
      const p = held(c)
      if (!p) return ''
      return `The pause is long enough to be an answer on its own. "You are asking me to bid against people who are not here." A breath. "${Math.round(purse(c) * 1.6)}. That is the whole of it, and I will not be asked again."`
    },
    beat: () => 'They have doubled once. There will not be a second time.',
    replies: [
      {
        label: (c) => `Take it — ${Math.round(purse(c) * 1.6)}c.`,
        effect: (c) => {
          const p = release(c)
          const v = c.ship
          if (!p || !v) return
          const paid = Math.round(purse(c) * 1.6)
          c.s.credits += paid
          // They paid over the odds and they know exactly why.
          shift(c.s, p.faction, -0.02)
          covertShift(c.s, p.faction, 0.03)
          if (c.s.patron && c.s.patron !== p.faction) shift(c.s, c.s.patron, -0.04)
          leave(c)
          log(c.s, `${p.name} was sold back to their own people. +${paid}c.`, 'good')
        },
        goto: 'handed',
      },
      {
        label: 'No. They stay.',
        effect: (c) => {
          const v = c.ship
          if (!v) return
          shift(c.s, v.faction, -0.09)
          covertShift(c.s, v.faction, -0.06)
          leave(c)
          log(c.s, `The ${v.name} left with nothing, having offered a great deal.`, 'warn')
        },
        goto: 'refused',
      },
    ],
  },

  handed: {
    final: true,
    text: (c) =>
      `The transfer took four minutes and nobody signed anything. Whatever the ${c.talk.who} is, it is now a hull that has been to this station and been dealt with fairly, and that gets said out loud somewhere.`,
    replies: [{ label: 'Close', goto: null }],
  },

  refused: {
    final: true,
    text: (c) =>
      `The ${c.talk.who} came off the clamps without another word. Somebody in the cells heard the whole thing through a deck plate and has stopped asking when they are getting out.`,
    replies: [{ label: 'Close', goto: null }],
  },
}

registerScript('claim', script)

export default script
