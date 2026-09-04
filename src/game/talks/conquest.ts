import { clamp, defence, log, pickOne, roll, roller, shift } from '../engine.ts'
import { STANDING_CEILING, factionDef } from '../factions.ts'
import { registerScript, type TalkCtx, type TalkScript } from '../talk.ts'

/**
 * Somebody has come to take the station.
 *
 * There is no warning bar for this and no diplomacy tab to head it off. A hull
 * arrives that is not asking for a berth, and by the time you are reading this
 * it is already alongside. What you can still decide is how it goes.
 */

/** What they brought. Set on the hull when it was rolled. */
const force = (c: TalkCtx): number => c.ship?.force ?? 20

/** What the station can put against it. */
const held = (c: TalkCtx): number => {
  const d = defence(c.s)
  return d.guns + d.shield * 0.7 + d.smallArms * 0.4
}

const odds = (c: TalkCtx): number => clamp(held(c) / Math.max(1, held(c) + force(c)), 0.02, 0.95)

/** What buying them off costs: steep, and steeper if you cannot fight. */
const bribe = (c: TalkCtx): number => Math.round(force(c) * 220 * (1.6 - odds(c)))

/** Whether the current patron would actually come. */
const patronWouldCome = (c: TalkCtx): boolean => {
  const p = c.s.patron
  if (!p || p === c.ship?.faction) return false
  return c.s.standing[p] >= STANDING_CEILING * 0.55
}

/** Hand the station over. The only thing that changes hands is the flag. */
const cede = (c: TalkCtx): void => {
  const taker = c.ship?.faction
  if (!taker) return
  const old = c.s.patron
  if (old && old !== taker) {
    shift(c.s, old, -0.12)
    if (!c.s.resigned.includes(old)) c.s.resigned.push(old)
  }
  c.s.patron = taker
  shift(c.s, taker, 0.06)
  log(c.s, `Spaceport-99 now flies ${factionDef(taker).name} paper. Nobody voted.`, 'bad')
}

/** They fought. Whether it went well or not, it cost. */
const battle = (c: TalkCtx, won: boolean): void => {
  const v = c.ship
  if (!v) return
  const hurt = won ? 0.25 : 0.6
  const scar = (m: { condition: number }) => {
    m.condition = clamp(m.condition - 0.2 - roll(c.s) * 0.3, 0.2, 1)
  }
  let marked = false
  for (const m of c.s.modules) {
    if (roll(c.s) >= hurt) continue
    scar(m)
    marked = true
  }
  // Nobody trades fire without something to show for it afterwards.
  if (!marked && c.s.modules.length > 0) {
    scar(pickOne(roller(c.s), c.s.modules))
  }
  for (const crew of c.s.crew) {
    if (crew.dead) continue
    if (roll(c.s) >= hurt * 0.55) continue
    crew.hp = Math.max(1, Math.round(crew.hp * (won ? 0.65 : 0.35)))
  }
  if (won) {
    shift(c.s, v.faction, -0.15)
    // Everybody else notices that this station said no and made it stick.
    for (const id of ['terran', 'concern', 'compact', 'unlisted'] as const) {
      if (id !== v.faction) shift(c.s, id, 0.05)
    }
    log(c.s, `The ${v.name} broke off. Spaceport-99 is still its own.`, 'good')
  } else {
    c.s.credits = Math.round(c.s.credits * 0.55)
    cede(c)
  }
}

const script: TalkScript = {
  start: {
    text: (c) => {
      const v = c.ship
      if (!v) return ''
      const them = factionDef(v.faction)
      return `"Spaceport-99. This is the ${v.name}, ${them.name}. We are not requesting a berth — we are alongside." A pause, unhurried. "You are being brought onto the ${them.short} roll. The commander stays. The flag does not."`
    },
    beat: (c) => {
      const v = c.ship
      if (!v) return null
      const chance = Math.round(odds(c) * 100)
      return `${factionDef(v.faction).name} · they have already clamped on · you would win this ${chance}% of the time`
    },
    sticky: true,
    replies: [
      {
        label: 'On whose authority?',
        when: (c) => !c.has('argued'),
        sets: ['argued'],
        goto: 'authority',
      },
      { label: 'Strike the flag. Nobody dies over paperwork.', goto: 'ceded' },
      {
        label: 'Refuse. Bring the batteries up.',
        note: (c) => `Roughly ${Math.round(odds(c) * 100)}% — and it will cost either way.`,
        goto: 'fight',
      },
      {
        label: (c) => `Pay them off — ${bribe(c)}c.`,
        note: (c) =>
          c.s.credits < bribe(c) ? 'Not in the account.' : 'They go. They do not forget the address.',
        barred: (c) => (c.s.credits < bribe(c) ? 'Not in the account' : null),
        effect: (c) => {
          c.s.credits -= bribe(c)
          const v = c.ship
          if (v) {
            v.status = 'requesting'
            v.timer = 0
            v.intent = undefined
            shift(c.s, v.faction, -0.03)
            log(c.s, `The ${v.name} was paid to be somewhere else. −${bribe(c)}c.`, 'warn')
          }
        },
        goto: 'bought',
      },
      {
        label: (c) => `Call ${factionDef(c.s.patron ?? 'terran').short} and hold them to it.`,
        note: () => 'You fly their paper. This is what that was supposed to buy.',
        when: (c) => Boolean(c.s.patron) && c.s.patron !== c.ship?.faction,
        goto: (c) => (patronWouldCome(c) ? 'rescued' : 'abandoned'),
        effect: (c) => {
          const v = c.ship
          if (!v) return
          if (patronWouldCome(c)) {
            v.status = 'requesting'
            v.timer = 0
            v.intent = undefined
            shift(c.s, v.faction, -0.08)
            log(
              c.s,
              `${factionDef(c.s.patron!).name} answered. The ${v.name} withdrew.`,
              'good',
            )
          } else if (c.s.patron) {
            shift(c.s, c.s.patron, -0.04)
          }
        },
      },
    ],
  },

  authority: {
    text: (c) => {
      const v = c.ship
      if (!v) return ''
      return `"Ours." They sound almost sympathetic. "There is no court out here, commander. There is what a hull can do when it is already clamped on. You knew that when you took the posting."`
    },
    sticky: true,
    replies: [
      { label: 'Strike the flag.', goto: 'ceded' },
      {
        label: 'Refuse. Bring the batteries up.',
        note: (c) => `Roughly ${Math.round(odds(c) * 100)}%.`,
        goto: 'fight',
      },
      {
        label: (c) => `Pay them off — ${bribe(c)}c.`,
        barred: (c) => (c.s.credits < bribe(c) ? 'Not in the account' : null),
        effect: (c) => {
          c.s.credits -= bribe(c)
          const v = c.ship
          if (v) {
            v.status = 'requesting'
            v.timer = 0
            v.intent = undefined
            shift(c.s, v.faction, -0.03)
            log(c.s, `The ${v.name} was paid to be somewhere else. −${bribe(c)}c.`, 'warn')
          }
        },
        goto: 'bought',
      },
    ],
  },

  ceded: {
    final: true,
    text: (c) =>
      `"Sensible." The ${c.talk.who} is already transmitting the new registry. "You will find we are not difficult to work for, provided the numbers arrive."`,
    replies: [
      {
        label: 'Close',
        effect: (c) => {
          cede(c)
          const v = c.ship
          if (v) {
            v.intent = undefined
            v.status = 'requesting'
            v.timer = 0
          }
        },
        goto: null,
      },
    ],
  },

  fight: {
    final: true,
    text: (c) => (c.has('won') ? wonText(c) : c.has('lost') ? lostText(c) : ''),
    replies: [{ label: 'Close', goto: null }],
  },

  bought: {
    final: true,
    text: () =>
      `"A reasonable commander." The clamps release. "We will put that in the file. Files get read again."`,
    replies: [{ label: 'Close', goto: null }],
  },

  rescued: {
    final: true,
    text: (c) => {
      const patron = factionDef(c.s.patron ?? 'terran')
      return `Somebody else is on the channel now, and they are not talking to you. Ninety seconds later the ${c.talk.who} lets go of the clamps. ${patron.short} did not send a fleet. They sent a file number, and that was enough.`
    },
    replies: [{ label: 'Close', goto: null }],
  },

  abandoned: {
    text: (c) => {
      const patron = factionDef(c.s.patron ?? 'terran')
      return `The channel stays open for a long time. Then: "${patron.name} acknowledges your situation." That is the whole message.`
    },
    beat: () => 'Nobody is coming.',
    sticky: true,
    replies: [
      { label: 'Strike the flag.', goto: 'ceded' },
      {
        label: 'Refuse anyway.',
        note: (c) => `Roughly ${Math.round(odds(c) * 100)}%.`,
        goto: 'fight',
      },
    ],
  },
}

const wonText = (c: TalkCtx): string =>
  `The batteries got there first. The ${c.talk.who} took two hits she was not expecting and stopped talking. The clamps came off eleven minutes later, and it is going to take a while to put the station back together.`

const lostText = (c: TalkCtx): string =>
  `It lasted four minutes. The ${c.talk.who} did not even bring her second battery online. They took the flag, half the account, and a quiet note of everyone who fired.`

/** Run when the fight node is entered. The reducer calls this. */
export const resolveFight = (c: TalkCtx): void => {
  const won = roll(c.s) < odds(c)
  battle(c, won)
  c.talk.flags.push(won ? 'won' : 'lost')
  const v = c.ship
  if (v) {
    v.intent = undefined
    v.status = 'requesting'
    v.timer = 0
  }
}

registerScript('conquest', script)

export default script
