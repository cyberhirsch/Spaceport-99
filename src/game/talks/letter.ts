import { covertShift, log, shift } from '../engine.ts'
import { FACTION_IDS, factionDef } from '../factions.ts'
import { ENOUGH_TO_KNOW, LOST, knowsEnough, lostHull } from '../quest.ts'
import { registerScript, type TalkCtx, type TalkScript } from '../talk.ts'
import type { FactionId } from '../types.ts'

/**
 * The seven hulls.
 *
 * One script covers the whole business: how the letter arrives, reading it,
 * what the bearings turned out to be, and the four things a commander can
 * decide to do about it. Which of those four is available depends only on
 * having been out to look, because the letter's entire argument is that the
 * record is worth less than a bearing checked in person.
 *
 * Nothing here is a new mechanic. The bearings are far contracts, the evidence
 * is the Sensor Array reading wrong, the powers are the standing you already
 * have with them, and the last act is the station's guns.
 */

/** Who the file says will pay most to have this not exist. */
const buyer = (c: TalkCtx): FactionId => {
  let best: FactionId = 'terran'
  for (const id of FACTION_IDS) {
    if (c.s.covert[id] + c.s.standing[id] > c.s.covert[best] + c.s.standing[best]) best = id
  }
  return best
}

const price = (c: TalkCtx): number => Math.round(4200 + c.s.quest.checked.length * 1800)

const checkedList = (c: TalkCtx): string =>
  c.s.quest.checked.length === 0
    ? 'Nobody has been out to any of them.'
    : c.s.quest.checked.join(', ')

const script: TalkScript = {
  /** However it reached you, this is the first time you read it. */
  arrived: {
    text: (c) => {
      if (c.has('from:comms'))
        return `It came in on the open channel at four in the morning, addressed to the station rather than to you, and repeated twice. There is no origin on it. The array logged it as traffic and somebody printed it out because it did not read like traffic.`
      if (c.has('from:hull'))
        return `"I was asked to hand this to whoever runs this place." They do not sit down. "I was not told by whom, I was not paid, and I would rather not have it on my hull any longer than necessary."`
      return `"Commander." They have clearly been holding it for a while and deciding. "This was in with the manifests. It is not a manifest."`
    },
    beat: () => 'A list of seven ship names and seven dates, and one line under it.',
    replies: [
      { label: 'Read it.', goto: 'list' },
      {
        label: 'Put it in the file and get on with the day.',
        note: () => 'It will be in the Comms Array whenever you want it.',
        goto: null,
      },
    ],
  },

  list: {
    text: () =>
      LOST.map((h) => `${h.name} — ${h.silent} — ${h.filed}`).join('\n') +
      `\n\nNone of these were lost where the record says. Check the bearings.`,
    beat: () =>
      'No signature. The seventh line is written in the same hand as the other six and does not correspond to any hull that has ever existed.',
    replies: [
      { label: 'Who sends something like this?', goto: 'who' },
      {
        label: 'What happened to the commander before me?',
        when: (c) => c.s.quest.checked.includes('Corbel Nine'),
        goto: 'before',
      },
      { label: 'File it.', goto: 'filed' },
    ],
  },

  who: {
    text: () =>
      `Nobody knows. It has no origin, no signature and no request in it beyond the one line. Three of the six hulls were Confederation-registered, two were on Concern charter and one was nobody's at all, which rules out every obvious motive for sending it — there is no power that comes out of this looking better.\n\nWhat is left is somebody who wanted a station to go and look, and had no way of making it worth anyone's while.`,
    replies: [
      { label: 'File it.', goto: 'filed' },
      {
        label: 'What happened to the commander before me?',
        when: (c) => c.s.quest.checked.includes('Corbel Nine'),
        goto: 'before',
      },
    ],
  },

  before: {
    text: () =>
      `They got the same letter. The log has it, filed under traffic, four days before they signed out a survey shuttle against a personal requisition and took it out to the second name on the list.\n\nThe requisition is still open. Nobody closed it, because closing it requires a return date.`,
    beat: () => 'Your predecessor read this list and went to look at Corbel Nine.',
    replies: [{ label: 'File it.', goto: 'filed' }],
  },

  filed: {
    final: true,
    text: (c) =>
      knowsEnough(c.s.quest)
        ? `The file goes back in the Comms Array with everything the teams have brought home stapled to it. It is no longer a list of names. It is an argument, and it only points one way.`
        : `The file goes back in the Comms Array. Seven names, seven dates, and a station with a contract board and no particular reason not to send somebody out to look.`,
    replies: [{ label: 'Close', goto: null }],
  },

  /** Reachable from the file once enough bearings have been checked. */
  decide: {
    text: (c) =>
      `Seven names. ${c.s.quest.checked.length} of them checked in person, and every one of those was somewhere other than where it was filed — not scattered, not random, wrong in a direction.\n\nThe direction has an origin, and the origin has been paying attention to the traffic asking about it.`,
    beat: (c) =>
      `Checked: ${checkedList(c)} · this is a decision that closes the file one way or another`,
    replies: [
      {
        label: 'Put the whole file on the open channel.',
        note: () =>
          'Every station, every registry, every hull with a receiver. It cannot be taken back.',
        effect: (c) => {
          // The register is embarrassed; the people who fly without one are not.
          shift(c.s, 'terran', -0.1)
          shift(c.s, 'concern', -0.05)
          shift(c.s, 'compact', -0.02)
          shift(c.s, 'unlisted', 0.12)
          for (const id of FACTION_IDS) covertShift(c.s, id, -0.05)
          c.s.quest.ending = 'published'
          c.s.quest.stage = 'over'
          log(c.s, `The file went out on the open channel. It cannot be taken back.`, 'warn')
        },
        goto: 'published',
      },
      {
        label: (c) => `Sell it to ${factionDef(buyer(c)).short} — ${price(c)}c.`,
        note: () => 'They will not publish it. That is what you are being paid for.',
        effect: (c) => {
          const who = buyer(c)
          const paid = price(c)
          c.s.credits += paid
          shift(c.s, who, 0.08)
          covertShift(c.s, who, 0.12)
          for (const id of FACTION_IDS) if (id !== who) shift(c.s, id, -0.02)
          c.s.quest.ending = 'sold'
          c.s.quest.stage = 'over'
          log(c.s, `The file went to ${factionDef(who).name}. +${paid}c.`, 'good')
        },
        goto: 'sold',
      },
      {
        label: 'Burn it and stand the teams down.',
        note: () => 'Nobody else has to know it was ever here. Including whatever is out there.',
        effect: (c) => {
          c.s.quest.ending = 'buried'
          c.s.quest.stage = 'over'
          // Nothing is looking for the station any more, because nothing is
          // being asked about.
          c.s.quest.attention = 0
          log(c.s, `The file is gone. So is the requisition your predecessor left open.`, 'info')
        },
        goto: 'buried',
      },
      {
        label: 'Go and look at the seventh name.',
        note: (c) =>
          c.s.ships.length === 0
            ? 'You would need a hull to do it in.'
            : 'There is no seventh hull. There is only the place where the list says one is.',
        barred: (c) => (c.s.ships.length === 0 ? 'No hull in the bay' : null),
        effect: (c) => {
          const hull = c.s.ships[0]
          if (!hull) return
          c.s.ships = c.s.ships.filter((h) => h.id !== hull.id)
          c.s.quest.ending = 'met'
          c.s.quest.stage = 'over'
          c.s.quest.attention = 0
          c.talk.flags.push(`hull:${hull.name}`)
          log(c.s, `The ${hull.name} went out to the seventh bearing.`, 'warn')
        },
        goto: 'met',
      },
      { label: 'Not yet.', goto: null },
    ],
  },

  published: {
    final: true,
    text: () =>
      `It went out at 0400 station time and was acknowledged by eleven receivers inside an hour. By the end of the week two registries had opened enquiries and one had closed one.\n\nNobody out here believes the record any more, which is an improvement and has cost this station every friend it had in an office. Whatever is at the origin did not react at all, because it was never the sort of thing that reads.`,
    replies: [{ label: 'Close', goto: null }],
  },

  sold: {
    final: true,
    text: (c) =>
      `The transfer was clean and the receipt does not mention what was transferred. ${factionDef(buyer(c)).short} will not publish it, will not act on it, and will file it somewhere with a number on the front.\n\nIn eleven years somebody will find it and start again from the beginning, with six names instead of seven, because one of them will have been quietly removed.`,
    replies: [{ label: 'Close', goto: null }],
  },

  buried: {
    final: true,
    text: () =>
      `The file burned, the teams stood down, and the contract board went back to hauling and salvage. Traffic settled. The instruments stopped disagreeing with each other.\n\nSix hulls are still not where the record says they are. The record has not been corrected. Nothing will happen to this station, which was the entire point, and there is no version of the log in which that reads as a decision anybody is proud of.`,
    replies: [{ label: 'Close', goto: null }],
  },

  met: {
    final: true,
    text: (c) => {
      const hull = c.talk.flags.find((f) => f.startsWith('hull:'))?.slice(5) ?? 'the hull'
      return `The ${hull} made the bearing in nine days and reported nothing there, which is what a bearing to a hull that does not exist ought to give you.\n\nThe last transmission is forty seconds long. Thirty-eight of them are a routine position fix. The other two are the officer of the watch saying, quite calmly, that the fix is wrong and that it has been wrong in the same direction each time they have taken it.\n\nNothing has come near Spaceport-99 since. The requisition is still open.`
    },
    replies: [{ label: 'Close', goto: null }],
  },
}

/** What a team brought back from one of the seven, for the log and the file. */
export const findingFor = (name: string): string => lostHull(name)?.found ?? ''

/** Enough bearings to make the argument. Exported for the file panel. */
export const ENOUGH = ENOUGH_TO_KNOW

registerScript('letter', script)

export default script
