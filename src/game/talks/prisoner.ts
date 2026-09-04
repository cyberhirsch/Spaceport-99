import { crewPortrait, makeCrew } from '../crew.ts'
import { assign, derive, log, shift } from '../engine.ts'
import { factionDef } from '../factions.ts'
import { registerScript, type TalkCtx, type TalkScript } from '../talk.ts'

/**
 * Somebody in the cells.
 *
 * A prisoner is not a number that ticks down. They are three doors: hand them
 * to a power that wants them, let them go and be owed something by the people
 * who fly without papers, or find out whether they would rather work here.
 *
 * The last one is the interesting one, because somebody with nowhere else to be
 * is the easiest recruit on the station and the one most likely to resent it.
 */

const held = (c: TalkCtx): number => Math.floor((c.prisoner?.held ?? 0) / 60)

/** Taking them off the station, however it happens. */
const release = (c: TalkCtx): void => {
  const p = c.prisoner
  if (!p) return
  c.s.prisoners = c.s.prisoners.filter((x) => x.id !== p.id)
}

const script: TalkScript = {
  start: {
    text: (c) => {
      const p = c.prisoner
      if (!p) return ''
      const mins = held(c)
      if (mins >= 20)
        return `"You have had me in here long enough to have decided something." They have stopped pacing. "So decide."`
      if (mins >= 5) return `"Still here, then." They do not get up.`
      return `"I want to know what I am charged with, and I want to know who by."`
    },
    beat: (c) => {
      const p = c.prisoner
      if (!p) return null
      return `${p.name} · off the ${p.hull} · ${factionDef(p.faction).short} · ${p.charge} · ${held(c)} min in the cells`
    },
    replies: [
      { label: 'What were you carrying?', goto: 'carrying' },
      {
        label: (c) => `Hand them to ${factionDef(c.s.patron ?? 'terran').short}.`,
        note: () => 'By the book. The flag you fly will note who filed it.',
        when: (c) => Boolean(c.s.patron) && c.s.patron !== c.prisoner?.faction,
        effect: (c) => {
          const p = c.prisoner
          const patron = c.s.patron
          if (!p || !patron) return
          release(c)
          // Their own people take it personally; yours take it as evidence you
          // are worth having out here.
          shift(c.s, patron, 0.06)
          shift(c.s, p.faction, -0.06)
          c.s.credits += 240
          log(c.s, `${p.name} was handed to ${factionDef(patron).name}. +240c.`, 'good')
        },
        goto: 'handed',
      },
      {
        label: 'Let them go.',
        note: () => 'No charge, no record. The Drift keeps its own books.',
        effect: (c) => {
          const p = c.prisoner
          if (!p) return
          release(c)
          shift(c.s, 'unlisted', 0.05)
          shift(c.s, p.faction, 0.03)
          if (c.s.patron === 'terran') shift(c.s, 'terran', -0.02)
          log(c.s, `${p.name} walked out of the cells and off the station.`, 'info')
        },
        goto: 'freed',
      },
      {
        label: 'Offer them a berth.',
        note: (c) => {
          const d = derive(c.s)
          if (d.crewAlive.length >= d.crewCap) return 'No bunk free.'
          return held(c) < 5
            ? 'Too soon. They have not had time to think about it.'
            : 'Somebody with nowhere else to be is easy to keep.'
        },
        barred: (c) => {
          const d = derive(c.s)
          if (d.crewAlive.length >= d.crewCap) return 'No bunk free'
          return held(c) < 5 ? 'Give them a few minutes to think' : null
        },
        goto: 'offer',
      },
      { label: 'Leave them.', goto: null },
    ],
  },

  carrying: {
    text: (c) => {
      const p = c.prisoner
      if (!p) return ''
      if (p.faction === 'unlisted')
        return `"Nothing that belonged to anyone who would miss it." A shrug. "That is the whole business, commander. You know that."`
      return `"Cargo. Bonded, sealed, and not mine to open." They look at you steadily. "Whoever loaded it did not tell me either. That is the arrangement."`
    },
    beat: () => 'They are not going to say more than that, and they know you know it.',
    replies: [
      {
        label: 'Offer them a berth.',
        barred: (c) => {
          const d = derive(c.s)
          if (d.crewAlive.length >= d.crewCap) return 'No bunk free'
          return held(c) < 5 ? 'Give them a few minutes to think' : null
        },
        goto: 'offer',
      },
      { label: 'Leave them.', goto: null },
    ],
  },

  offer: {
    text: (c) => {
      const p = c.prisoner
      if (!p) return ''
      // Somebody whose own people would not come for them has less to weigh.
      const owed = c.s.standing[p.faction]
      if (owed < -0.05)
        return `"Off that hull?" They laugh, once, without much in it. "They were not coming back for me. All right."`
      return `"You are offering me a job. In the room you are keeping me in." A long pause. "Ask me again with the door open."`
    },
    replies: [
      {
        label: 'Open the door and ask again.',
        note: () => 'They sign, or they walk. Either way the cell is empty after this.',
        effect: (c) => {
          const p = c.prisoner
          if (!p) return
          release(c)
          const d = derive(c.s)
          if (d.crewAlive.length >= d.crewCap) {
            log(c.s, `${p.name} was offered a berth the station does not have.`, 'warn')
            return
          }
          // With the door open it is an honest offer, and mostly taken — the
          // people who end up in a cell out here rarely have somewhere better.
          const takes = Math.random() < (c.s.standing[p.faction] < -0.05 ? 0.85 : 0.55)
          if (!takes) {
            shift(c.s, 'unlisted', 0.03)
            log(c.s, `${p.name} thanked you for the offer and left on the next hull.`, 'info')
            return
          }
          const hire = makeCrew({
            name: p.name,
            stats: p.stats,
            seed: p.seed,
            portrait: crewPortrait(p),
          })
          c.s.crew.push(hire)
          const brig = c.s.modules.find((m) => m.kind === 'brig')
          if (brig) assign(c.s, hire.id, brig.id)
          c.talk.flags.push('signed')
          shift(c.s, p.faction, -0.03)
          log(c.s, `${p.name} came off the manifest and onto the roster.`, 'good')
        },
        goto: 'answered',
      },
      { label: 'Leave it.', goto: null },
    ],
  },

  answered: {
    final: true,
    text: (c) =>
      c.has('signed')
        ? `"Then somebody had better show me where I am sleeping. Somewhere that locks from the inside, preferably."`
        : `"No. But I will remember you asked properly, which is more than the last station managed."`,
    replies: [{ label: 'Close', goto: null }],
  },

  handed: {
    final: true,
    text: () =>
      `A patrol takes them off your hands within the hour and does not say thank you. The paperwork is filed under your name, which is the point.`,
    replies: [{ label: 'Close', goto: null }],
  },

  freed: {
    final: true,
    text: () =>
      `They walk out without looking back. Somewhere in the Drift, a note goes in a book that this station let one go.`,
    replies: [{ label: 'Close', goto: null }],
  },
}

registerScript('prisoner', script)

export default script
