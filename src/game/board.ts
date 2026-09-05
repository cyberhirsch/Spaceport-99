import { CLAIM_AFTER } from './core.ts'
import { factionDef } from './factions.ts'
import { def } from './modules.ts'
import { guestsAboard } from './traffic.ts'
import type { GameState, Quest } from './types.ts'

// The missions board: everything with a next step, gathered in one place.

/**
 * One thing that is going on and will go on without you. Not a contract and
 * not the file — the hull standing off, the prisoner whose people are coming,
 * the applicant on the dock. Each says what it is, what it wants, and when.
 */
export interface Thread {
  id: string
  /** What is going on, as a headline. */
  title: string
  /** What it needs from the commander, or what happens next if nothing is done. */
  detail: string
  /** Seconds until the next thing happens, when there is a clock on it. */
  clock?: number
  tone: 'info' | 'good' | 'warn' | 'bad'
}

/** Where the file stands, in words a board can carry. */
export const questStageLabel = (q: Quest): string => {
  switch (q.stage) {
    case 'none':
      return 'Nothing has reached the station'
    case 'letter':
      return 'A letter, and seven names nobody has been out to'
    case 'checking':
      return 'Checking the bearings'
    case 'watched':
      return 'Something is asking about this station'
    case 'siege':
      return 'It is here'
    case 'over':
      return q.ending === 'published'
        ? 'Closed — published, and every office knows your name'
        : q.ending === 'sold'
          ? 'Closed — sold, and filed under a number'
          : q.ending === 'buried'
            ? 'Closed — buried, and nothing came of it'
            : q.ending === 'met'
              ? 'Closed — you went and looked, and came back'
              : 'Closed — it came through the station'
  }
}

/**
 * Everything running on its own clock that the commander can still do
 * something about, soonest first. Nothing here is invented: each line is a
 * state the tick already drives, read back in order.
 */
export const openThreads = (s: GameState): Thread[] => {
  const out: Thread[] = []
  const prisonerName = (id: string) => s.prisoners.find((p) => p.id === id)?.name ?? 'somebody'

  if (s.boarding) {
    const b = s.boarding
    const room = s.modules.find((m) => m.id === b.moduleId)
    const door = s.crew.filter(
      (c) => !c.dead && (c.assignment === b.moduleId || b.responders.includes(c.id)),
    ).length
    out.push({
      id: 'boarding',
      title: `Boarders in the ${room ? def(room.kind).name : 'station'}`,
      detail:
        door === 0
          ? `${b.boarders.length} of them, looting. Put somebody armed in that room.`
          : `${b.boarders.length} of them against ${door} of yours. Kit counts.`,
      tone: 'bad',
    })
  }

  for (const v of s.visitors) {
    if (v.intent === 'boarding') continue
    if (v.intent === 'loiter') {
      out.push({
        id: `hull:${v.id}`,
        title: `${v.name} is standing off`,
        detail: 'They have not said what they want yet. They will.',
        clock: v.timer,
        tone: 'warn',
      })
    } else if (v.intent === 'demand') {
      out.push({
        id: `hull:${v.id}`,
        title: `${v.name} wants ${v.asking ?? 0}c`,
        detail: 'Pay, refuse, or say nothing — and saying nothing is an answer they will act on.',
        clock: v.timer,
        tone: 'bad',
      })
    } else if (v.intent === 'raid') {
      out.push({
        id: `hull:${v.id}`,
        title: `${v.name} is coming in`,
        detail: 'Get everyone to a battery. This is happening.',
        clock: v.timer,
        tone: 'bad',
      })
    } else if (v.intent === 'conquest') {
      out.push({
        id: `hull:${v.id}`,
        title: `${v.name} has come for the station`,
        detail: `${factionDef(v.faction).short} paper. They will wait as long as it takes.`,
        tone: 'bad',
      })
    } else if (v.claiming) {
      out.push({
        id: `claim:${v.id}`,
        title: `${prisonerName(v.claiming)}'s people are alongside`,
        detail: `${v.name} wants them back. Answer them before they leave.`,
        clock: v.timer,
        tone: 'warn',
      })
    } else if (v.status === 'docked' && v.covert) {
      out.push({
        id: `covert:${v.id}`,
        title: `A quiet word from ${factionDef(v.covert.from).short}`,
        detail: `${v.name} is carrying it: a ${v.covert.ask} arrangement, ${v.covert.pays}c on the table.`,
        clock: v.timer,
        tone: 'info',
      })
    } else if (v.status === 'requesting') {
      out.push({
        id: `hail:${v.id}`,
        title: `${v.name} is requesting permission to dock`,
        detail: 'Nobody has answered. They will not wait forever.',
        clock: v.timer,
        tone: 'info',
      })
    }
  }

  for (const { guest, ship } of guestsAboard(s)) {
    if (!guest.offer) continue
    out.push({
      id: `guest:${guest.id}`,
      title: `${guest.name} is aboard and wants a word`,
      detail:
        guest.offer.kind === 'mission'
          ? `Off the ${ship.name}, with a contract to hand over.`
          : `Off the ${ship.name}, with something to say.`,
      clock: ship.timer,
      tone: 'info',
    })
  }

  const claimants = new Set(s.visitors.map((v) => v.claiming).filter(Boolean))
  for (const p of s.prisoners) {
    if (claimants.has(p.id)) continue
    const due = p.held >= CLAIM_AFTER
    out.push({
      id: `cell:${p.id}`,
      title: due ? `Somebody is coming for ${p.name}` : `${p.name} is in the cells`,
      detail: due
        ? `Held long enough that ${factionDef(p.faction).short} has noticed. A hull is due.`
        : 'Hold them long enough and their people come asking.',
      clock: due ? Math.max(0, s.nextClaimIn) : CLAIM_AFTER - p.held,
      tone: due ? 'warn' : 'info',
    })
  }

  if (s.nextLevyIn > 0 && s.patron) {
    out.push({
      id: 'levy',
      title: `${factionDef(s.patron).short}'s first assessment`,
      detail: 'The new flag looks the books over, and decides what the station owes.',
      clock: s.nextLevyIn,
      tone: 'warn',
    })
  }

  for (const c of s.candidates) {
    if (c.arrivesIn > 0) {
      out.push({
        id: `cand:${c.id}`,
        title: `${c.name} is on a courier`,
        detail: c.origin === 'posted' ? 'Posted here by HQ.' : 'Put in for the berth.',
        clock: c.arrivesIn,
        tone: 'info',
      })
      continue
    }
    out.push({
      id: `cand:${c.id}`,
      title: `${c.name} is at the dock`,
      detail:
        c.origin === 'posted'
          ? 'Posted here by HQ — already crew. Welcome them aboard.'
          : c.origin === 'walkIn'
            ? 'Came off a hull at the Trading Hub. Interview them.'
            : 'Put in for the berth. Interview them.',
      clock: c.patience,
      tone: 'good',
    })
  }

  for (const m of s.missions) {
    if (m.status !== 'calling') continue
    out.push({
      id: `call:${m.id}`,
      title: `${m.name} is hailing`,
      detail: 'They want an answer, and nothing happens out there until they get one.',
      tone: 'warn',
    })
  }

  if (s.quest.stage === 'watched') {
    out.push({
      id: 'watched',
      title: 'Something is asking about this station',
      detail: 'Every bearing checked brings it closer. The file can be closed any time.',
      tone: 'bad',
    })
  }

  // Soonest first; anything without a clock waits at the bottom.
  return out.sort((a, b) => (a.clock ?? Infinity) - (b.clock ?? Infinity))
}
