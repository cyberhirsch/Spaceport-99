import {
  ARMED_ENOUGH,
  covertShift,
  defence,
  log,
  roll,
  shift,
  standDown,
  tribute,
} from '../engine.ts'
import { factionDef } from '../factions.ts'
import { registerScript, type TalkCtx, type TalkScript } from '../talk.ts'

/**
 * A hull that arrived and did not ask for anything.
 *
 * It is two kilometres out with its transponder honest and its intentions not.
 * Nothing has happened yet and nothing has to — but this is the last point at
 * which it is cheap. Every option here costs less than the demand that follows
 * it, and far less than what follows that.
 *
 * The station's guns are the whole argument. Below ARMED_ENOUGH a hard word is
 * a bluff and they can hear it in your voice.
 */

const armed = (c: TalkCtx): boolean => defence(c.s).guns >= ARMED_ENOUGH

const script: TalkScript = {
  start: {
    text: (c) => {
      const v = c.ship
      if (!v) return ''
      return `The channel opens on the third try and nobody says anything for a while. Then: "Spaceport-99. We are not inbound. We are not asking. We are just here."`
    },
    beat: (c) => {
      const v = c.ship
      if (!v) return null
      const d = defence(c.s)
      return `${factionDef(v.faction).short} paper · standing off · your guns read ${Math.round(d.guns)} against their ${v.force ?? '?'}`
    },
    replies: [
      { label: 'Ask what they want.', goto: 'want' },
      {
        label: 'Tell them to move along.',
        note: (c) =>
          armed(c)
            ? 'You have the batteries to mean it, and they can hear that.'
            : 'You do not have the guns to mean it, and they can hear that too.',
        goto: (c) => (armed(c) ? 'moved' : 'called'),
        effect: (c) => {
          const v = c.ship
          if (!v) return
          if (armed(c)) {
            standDown(c.s, v, 'Somebody out there did the arithmetic.')
            shift(c.s, v.faction, -0.02)
          } else {
            // They now know exactly how long they can afford to wait.
            v.timer = Math.min(v.timer, 40)
          }
        },
      },
      {
        label: (c) => `Pay them to be elsewhere — ${Math.round(tribute(c.s, c.ship!) * 0.55)}c.`,
        note: () => 'Cheaper now than it will be in ten minutes. It always is.',
        when: (c) => Boolean(c.ship),
        barred: (c) =>
          c.s.credits < Math.round(tribute(c.s, c.ship!) * 0.55) ? 'Not in the account' : null,
        effect: (c) => {
          const v = c.ship
          if (!v) return
          const paid = Math.round(tribute(c.s, v) * 0.55)
          c.s.credits -= paid
          standDown(c.s, v, `It cost ${paid}c and nobody had to explain it afterwards.`)
        },
        goto: 'paid',
      },
      {
        label: 'Remind them who you have been talking to.',
        note: () => 'An arrangement is worth exactly one of these.',
        when: (c) => Boolean(c.ship) && c.s.covert[c.ship!.faction] > 0.06,
        effect: (c) => {
          const v = c.ship
          if (!v) return
          covertShift(c.s, v.faction, -0.07)
          standDown(c.s, v, 'Whoever they answer to answered for them.')
        },
        goto: 'known',
      },
      {
        label: 'Say nothing and watch them.',
        note: () => 'They are not going to get bored before you do.',
        goto: null,
      },
    ],
  },

  want: {
    text: (c) => {
      const v = c.ship
      if (!v) return ''
      return v.faction === 'unlisted'
        ? `"Want." They sound amused. "We are looking at a station with four rooms of anything worth carrying and a battery I can count from here. We are not in a hurry, commander. Take your time deciding what that means."`
        : `"Nothing at all." Pause. "We are conducting a survey. It would be improper for me to say for whom, and you would not enjoy the answer."`
    },
    beat: () => 'Whatever this is, it is not going to be resolved by asking again.',
    replies: [
      {
        label: 'Tell them to move along.',
        note: (c) => (armed(c) ? 'And you can back it.' : 'And you cannot back it.'),
        goto: (c) => (armed(c) ? 'moved' : 'called'),
        effect: (c) => {
          const v = c.ship
          if (!v) return
          if (armed(c)) {
            standDown(c.s, v, 'Somebody out there did the arithmetic.')
            shift(c.s, v.faction, -0.02)
          } else {
            v.timer = Math.min(v.timer, 40)
          }
        },
      },
      {
        label: (c) => `Pay them to be elsewhere — ${Math.round(tribute(c.s, c.ship!) * 0.55)}c.`,
        when: (c) => Boolean(c.ship),
        barred: (c) =>
          c.s.credits < Math.round(tribute(c.s, c.ship!) * 0.55) ? 'Not in the account' : null,
        effect: (c) => {
          const v = c.ship
          if (!v) return
          const paid = Math.round(tribute(c.s, v) * 0.55)
          c.s.credits -= paid
          standDown(c.s, v, `It cost ${paid}c and nobody had to explain it afterwards.`)
        },
        goto: 'paid',
      },
      { label: 'Close the channel.', goto: null },
    ],
  },

  moved: {
    final: true,
    text: (c) =>
      `The ${c.talk.who} came about without acknowledging and was off the board inside four minutes. Guns are not for firing. This is what they are for.`,
    replies: [{ label: 'Close', goto: null }],
  },

  called: {
    text: () =>
      `"With what?" There is no heat in it, which is worse. The channel stays open a moment longer than it needs to, and then closes.`,
    beat: () => 'That was the cheap option, and it is gone.',
    replies: [
      {
        label: (c) => `Pay them — ${Math.round(tribute(c.s, c.ship!) * 0.55)}c.`,
        when: (c) => Boolean(c.ship),
        barred: (c) =>
          c.s.credits < Math.round(tribute(c.s, c.ship!) * 0.55) ? 'Not in the account' : null,
        effect: (c) => {
          const v = c.ship
          if (!v) return
          const paid = Math.round(tribute(c.s, v) * 0.55)
          c.s.credits -= paid
          standDown(c.s, v, `It cost ${paid}c and rather more than that in the retelling.`)
        },
        goto: 'paid',
      },
      {
        label: 'Get everyone to a battery.',
        note: () => 'Nothing you can do in the next four minutes changes the arithmetic much.',
        effect: (c) => {
          // Being ready is worth something, even when it is only nerve.
          if (roll(c.s) < 0.5) log(c.s, `The station went to stations. Nobody complained.`, 'info')
        },
        goto: null,
      },
    ],
  },

  paid: {
    final: true,
    text: (c) =>
      `The ${c.talk.who} took the credits and went, and there is no version of the log where that looks good. There is also no version where the station is short a room over it.`,
    replies: [{ label: 'Close', goto: null }],
  },

  known: {
    final: true,
    text: (c) =>
      `Eleven seconds of nothing. Then the ${c.talk.who} came about and left without a word, and somebody, somewhere, is now owed rather less than they were this morning.`,
    replies: [{ label: 'Close', goto: null }],
  },
}

registerScript('loiter', script)

export default script
