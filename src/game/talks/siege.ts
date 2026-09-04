import { clamp, defence, log, pickOne, roll, roller, spread, unassign } from '../engine.ts'
import { registerScript, type TalkCtx, type TalkScript } from '../talk.ts'
import type { GameState } from '../types.ts'

/**
 * The last act, for a commander who kept asking and never decided.
 *
 * It cannot be negotiated with, bought, reported or reasoned with, so none of
 * those replies are here. Every option on this screen is about the station:
 * where the crew are standing, whether the shield is up, and whether you are
 * going to fire at something the instruments cannot agree on the position of.
 *
 * It is survivable. A station that built its guns and kept them staffed comes
 * through this scarred; one that did not, does not come through it whole. What
 * it never does is take the station — it is not here for the station.
 */

/** What the station can actually bring to bear on a thing it cannot plot. */
const held = (c: TalkCtx): number => {
  const d = defence(c.s)
  // Guns need a firing solution. Shields do not, and neither do people.
  return d.guns * 0.45 + d.shield * 1.1 + d.smallArms * 0.5
}

const odds = (c: TalkCtx): number => clamp(held(c) / (held(c) + 26), 0.05, 0.92)

/** It goes through the station and out the other side. */
const visit = (s: GameState, softened: number): void => {
  const through = clamp(1 - softened, 0.1, 1)
  for (const m of s.modules) {
    if (m.kind === 'spine') continue
    if (roll(s) >= through * 0.6) continue
    m.condition = clamp(m.condition - spread(roller(s), 0.15, 0.45) * through, 0.1, 1)
  }
  const alive = s.crew.filter((c) => !c.dead)
  let taken = 0
  for (const c of alive) {
    if (roll(s) >= through * 0.3) continue
    // People are not killed. People are somewhere else afterwards, and the
    // station's own record disagrees with itself about when they stopped being
    // aboard.
    if (alive.length - taken > 2 && roll(s) < 0.4) {
      c.dead = true
      c.hp = 0
      unassign(s, c.id)
      taken += 1
      log(s, `${c.name} is not aboard. The manifest disagrees with itself about when.`, 'bad')
    } else {
      c.hp = Math.max(1, c.hp - Math.round(c.maxHp * spread(roller(s), 0.2, 0.5) * through))
    }
  }
  if (taken === 0) log(s, `Everybody is accounted for, which took four hours to establish.`, 'good')
}

/** Run when the station commits to an answer. The reducer calls this. */
export const resolveSiege = (c: TalkCtx): void => {
  const good = roll(c.s) < odds(c)
  visit(c.s, good ? 0.7 : 0.25)
  c.talk.flags.push(good ? 'held' : 'through')
  c.s.quest.stage = 'over'
  c.s.quest.ending = good ? 'met' : 'lost'
  c.s.quest.attention = 0
  // Whatever it was, it is not on the board any more, and it was never on the
  // board in the first place.
  c.s.visitors = c.s.visitors.filter((v) => v.intent !== 'conquest' || v.faction !== 'unlisted')
}

const script: TalkScript = {
  start: {
    sticky: true,
    text: () =>
      `There are four returns on the board and none of them answer. They are not in formation, they are not closing, and the fix on each of them changes between one sweep and the next in the same direction and by the same amount, which is not a thing a ship does.\n\nThe watch officer has asked you twice what to log them as. There is no field on the form.`,
    beat: (c) =>
      `nothing is hailing · your shield reads ${Math.round(defence(c.s).shield)} and your guns ${Math.round(defence(c.s).guns)} · you would come through this ${Math.round(odds(c) * 100)}% intact`,
    replies: [
      {
        label: 'Everyone inside. Shield up. Nobody fires.',
        note: () => 'Guns need a firing solution. There is not going to be one.',
        effect: (c) => {
          log(c.s, `The station closed up and waited. It did not take long.`, 'warn')
        },
        goto: 'through',
      },
      {
        label: 'Fire on the nearest return.',
        note: (c) =>
          `The batteries will engage a position the instruments cannot agree on. Roughly ${Math.round(odds(c) * 100)}%.`,
        effect: (c) => {
          // Firing at it does nothing to it and a good deal to the gunners.
          const guns = c.s.modules.filter((m) => m.kind === 'battery')
          if (guns.length > 0) {
            const m = pickOne(roller(c.s), guns)
            m.condition = clamp(m.condition - 0.35, 0.1, 1)
          }
          log(c.s, `The batteries engaged. The returns did not react to being hit.`, 'bad')
          c.talk.flags.push('fired')
        },
        goto: 'through',
      },
      {
        label: 'Open every channel and say who you are.',
        note: () => 'It has never answered anybody. That is not the same as never listening.',
        effect: (c) => {
          log(c.s, `The station identified itself on every channel it has. Twice.`, 'info')
          c.talk.flags.push('spoke')
        },
        goto: 'through',
      },
    ],
  },

  /** Whatever you chose, this is what happened. The reducer resolves it here. */
  through: {
    final: true,
    text: (c) => {
      const good = c.has('held')
      const opening = c.has('fired')
        ? `The batteries fired for eleven minutes at four positions that were not where they were being fired at.`
        : c.has('spoke')
          ? `The station said its name on every channel it has, twice, and got back exactly what everybody who has ever tried it gets back.`
          : `The station closed every door it has and put its shield up and waited.`
      return good
        ? `${opening}\n\nAt 0417 the returns were no longer on the board. Nobody saw them go. The shield had held, the doors had held, and the damage is the sort a station can put right with a workshop and a fortnight.\n\nThe log for those four hours is complete and does not agree with itself in three places.`
        : `${opening}\n\nAt 0417 the returns were no longer on the board. Rather more of the station was not on the board either.\n\nWhat is left is repairable. What is not is the four separate places where the station's own record disagrees about who was aboard, and the fact that nobody has been able to make it agree since.`
    },
    replies: [{ label: 'Close', goto: null }],
  },
}

registerScript('siege', script)

export default script
