import {
  clamp,
  covertShift,
  defence,
  log,
  roll,
  roller,
  shift,
  spread,
  standDown,
  tribute,
} from '../engine.ts'
import { factionDef } from '../factions.ts'
import { registerScript, type TalkCtx, type TalkScript } from '../talk.ts'

/**
 * They have stopped waiting.
 *
 * This is the second of the three beats and the last one you get a choice in.
 * Paying is expensive and works. Refusing means they come in, and a raid you
 * chose is a great deal better than one you were surprised by — the station is
 * at stations, which is worth real numbers when the shooting starts.
 *
 * The odds shown are honest, because the whole encounter is built on the player
 * being able to see it coming.
 */

/** How this would go if it came to it. Guns, shields, and people with sidearms. */
const held = (c: TalkCtx): number => {
  const d = defence(c.s)
  return d.guns + d.shield * 0.7 + d.smallArms * 0.35
}

const odds = (c: TalkCtx): number => {
  const force = c.ship?.force ?? 12
  return clamp(held(c) / (held(c) + force), 0.05, 0.95)
}

const ask = (c: TalkCtx): number => (c.ship ? tribute(c.s, c.ship) : 0)

/** Standing your ground before they choose the moment is worth something. */
const ready = (c: TalkCtx): void => {
  const v = c.ship
  if (!v) return
  // They came in on your timing rather than theirs, and it shows.
  v.force = Math.round((v.force ?? 12) * spread(roller(c.s), 0.6, 0.8))
  log(c.s, `The station went to stations before they moved. That is worth something.`, 'info')
}

const script: TalkScript = {
  start: {
    sticky: true,
    text: (c) => {
      const v = c.ship
      if (!v) return ''
      return v.faction === 'unlisted'
        ? `"Right. Here is the shape of it, commander." No preamble at all. "${ask(c)} credits, transferred now, and we were never on your board. Or we come in and take rather more than that, and some of your people do not get up afterwards."`
        : `"Spaceport-99. A survey of this station finds it in breach of several arrangements it is not party to." A dry pause. "${ask(c)} credits settles the matter administratively. The alternative is not administrative."`
    },
    beat: (c) =>
      `${ask(c)}c · their ${c.ship?.force ?? '?'} against your ${Math.round(held(c))} · you would hold this ${Math.round(odds(c) * 100)}% of the time`,
    replies: [
      {
        label: (c) => `Pay them — ${ask(c)}c.`,
        note: () => 'They go. They also tell people this station pays.',
        barred: (c) => (c.s.credits < ask(c) ? 'Not in the account' : null),
        effect: (c) => {
          const v = c.ship
          if (!v) return
          const paid = ask(c)
          c.s.credits -= paid
          // Word gets round that there is money here and no spine behind it.
          shift(c.s, 'unlisted', 0.04)
          standDown(c.s, v, `−${paid}c. They will remember the address.`)
        },
        goto: 'paid',
      },
      {
        label: 'Refuse, and bring everyone to a battery.',
        note: (c) =>
          `They come in. Meeting it ready is worth real numbers — roughly ${Math.round(odds(c) * 100)}% as things stand.`,
        effect: (c) => {
          const v = c.ship
          if (!v) return
          ready(c)
          v.intent = 'raid'
          v.timer = 12
          c.talk.flags.push('refused')
        },
        goto: 'refused',
      },
      {
        label: 'Remind them who you have been talking to.',
        note: () => 'An arrangement is worth exactly one of these.',
        when: (c) => Boolean(c.ship) && c.s.covert[c.ship!.faction] > 0.06,
        effect: (c) => {
          const v = c.ship
          if (!v) return
          covertShift(c.s, v.faction, -0.08)
          standDown(c.s, v, 'Somebody they answer to answered for them.')
        },
        goto: 'known',
      },
      {
        label: (c) => `Call ${factionDef(c.s.patron ?? 'terran').short}.`,
        note: () => 'You fly their paper. This is meant to be what that buys.',
        when: (c) => Boolean(c.s.patron) && c.s.patron !== c.ship?.faction,
        goto: (c) => (answered(c) ? 'answered' : 'alone'),
        effect: (c) => {
          const v = c.ship
          const patron = c.s.patron
          if (!v || !patron) return
          if (answered(c)) {
            standDown(c.s, v, `${factionDef(patron).name} put a hull on the board and that was that.`)
          } else {
            // The call goes out and nothing comes back. That is an answer too.
            shift(c.s, patron, -0.03)
            v.timer = Math.min(v.timer, 30)
          }
        },
      },
    ],
  },

  refused: {
    final: true,
    text: () =>
      `The channel closes without a reply. Somewhere out there a hull is coming about, and this station is not going to be surprised by it.`,
    replies: [{ label: 'Close', goto: null }],
  },

  paid: {
    final: true,
    text: (c) =>
      `The ${c.talk.who} confirmed receipt, which somehow made it worse, and was off the board inside the hour. It is not the credits. It is that the Drift now has this station written down under a heading.`,
    replies: [{ label: 'Close', goto: null }],
  },

  known: {
    final: true,
    text: (c) =>
      `The demand was withdrawn in the middle of a sentence. Whatever you are to ${c.talk.who}'s owners, it is worth more than this station's cargo — for now.`,
    replies: [{ label: 'Close', goto: null }],
  },

  answered: {
    final: true,
    text: (c) =>
      `Your flag answered inside twenty minutes, which is the fastest anybody has ever seen them do anything. The ${c.talk.who} did not wait to argue about jurisdiction.`,
    replies: [{ label: 'Close', goto: null }],
  },

  alone: {
    sticky: true,
    text: (c) =>
      `The call goes out on the proper channel with the proper authentication and nothing comes back. ${factionDef(c.s.patron ?? 'terran').short} are not coming, and the ${c.talk.who} has not moved.`,
    beat: () => 'Whatever happens in the next few minutes, it happens to you.',
    replies: [
      {
        label: (c) => `Pay them — ${ask(c)}c.`,
        barred: (c) => (c.s.credits < ask(c) ? 'Not in the account' : null),
        effect: (c) => {
          const v = c.ship
          if (!v) return
          const paid = ask(c)
          c.s.credits -= paid
          shift(c.s, 'unlisted', 0.04)
          standDown(c.s, v, `−${paid}c, and nobody to send the bill to.`)
        },
        goto: 'paid',
      },
      {
        label: 'Refuse, and bring everyone to a battery.',
        note: (c) => `Roughly ${Math.round(odds(c) * 100)}%, and nobody else is coming.`,
        effect: (c) => {
          const v = c.ship
          if (!v) return
          ready(c)
          v.intent = 'raid'
          v.timer = 12
        },
        goto: 'refused',
      },
    ],
  },
}

/** Whether the flag you fly would actually put a hull on the board for you. */
const answered = (c: TalkCtx): boolean => {
  const patron = c.s.patron
  if (!patron) return false
  return roll(c.s) < 0.25 + c.s.standing[patron] * 2.2
}

registerScript('demand', script)

export default script
