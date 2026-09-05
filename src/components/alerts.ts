import { def, dockOfficers, guestsAboard } from '../game/engine.ts'
import { incidentDef } from '../game/incidents.ts'
import type { Derived } from '../game/state.ts'
import type { GameState, ModuleKind } from '../game/types.ts'

// The standing bar of what is wrong with the station, worst first.

/**
 * Everything the commander ought to know about right now, as one ordered list.
 *
 * Two rules earn their keep here. An alert names the room it is about, because
 * "1 emergency in progress" leaves the player hunting a whole station for it.
 * And it says what to do in terms of what is already built, because telling
 * somebody to add a reactor they have had for an hour reads as the game not
 * having looked.
 */
export const alertsFor = (state: GameState, derived: Derived): string[] => {
  // Flag a deficit only once it will actually empty the tanks within ten
  // minutes — a room going briefly unstaffed is not worth an alarm.
  const draining = (value: number, rate: number) => rate < 0 && value / -rate < 600

  /**
   * How big the shortfall is and what closes it. Naming the room is only
   * advice the first time: once one is built and still not keeping up, the
   * answer is another one, and saying so is the difference between a hint and
   * a nag at somebody who already took it.
   */
  const shortfall = (kind: ModuleKind, rate: number) => {
    const name = def(kind).name
    const built = state.modules.some((m) => m.kind === kind)
    const article = /^[AEIOU]/.test(name) ? 'an' : 'a'
    const what = built ? `another ${name}` : `${article} ${name}`
    return `${Math.abs(rate).toFixed(1)}/s short. Add ${what}.`
  }

  /** Which room is on fire, rather than how many are. */
  const emergency = () => {
    const where = (i: GameState['incidents'][number]) => {
      const room = state.modules.find((m) => m.id === i.moduleId)
      const kind = incidentDef(i.kind).name
      return room ? `${kind} in the ${def(room.kind).name}` : kind
    }
    const [first, ...rest] = state.incidents
    if (!first) return false
    if (rest.length === 0) return where(first)
    if (rest.length === 1) return `${where(first)}, and ${where(rest[0])}`
    return `${where(first)}, and ${rest.length} more emergencies`
  }

  const boarding = (() => {
    const b = state.boarding
    if (!b) return false
    const room = state.modules.find((m) => m.id === b.moduleId)
    const door = state.crew.filter(
      (c) => !c.dead && (c.assignment === b.moduleId || b.responders.includes(c.id)),
    ).length
    const where = room ? def(room.kind).name : 'the station'
    return `${b.boarders.length} boarder${b.boarders.length === 1 ? '' : 's'} in the ${where} — ${
      door === 0 ? 'nobody is stopping them' : `${door} of yours on the door`
    }`
  })()

  return [
    boarding,
    state.resources.air <= 0 && 'No oxygen — the crew is suffocating',
    state.resources.food <= 0 && 'No rations — the crew is starving',
    emergency(),
    // A brownout is the power shortfall already arrived, so it carries the
    // remedy and the deficit line stands down rather than saying it twice.
    derived.brownout
      ? `Grid brownout, rooms running slow — ${shortfall('reactor', derived.powerRate)}`
      : draining(state.resources.power, derived.powerRate) &&
        `Power deficit — ${shortfall('reactor', derived.powerRate)}`,
    draining(state.resources.air, derived.airRate) &&
      `Oxygen deficit — ${shortfall('atmospherics', derived.airRate)}`,
    draining(state.resources.food, derived.foodRate) &&
      `Ration deficit — ${shortfall('hydroponics', derived.foodRate)}`,
    derived.crewAlive.length >= derived.crewCap && 'No free bunks — build Crew Quarters',
    (() => {
      const docked = state.candidates.filter((c) => c.arrivesIn <= 0).length
      return docked > 0 && `${docked} applicant${docked === 1 ? '' : 's'} waiting at the dock`
    })(),
    (() => {
      const hailing = state.visitors.filter((v) => v.status === 'requesting').length
      return hailing > 0 && `${hailing} ship${hailing === 1 ? '' : 's'} requesting permission to dock`
    })(),
    (() => {
      const waiting = guestsAboard(state).filter((x) => x.guest.offer)
      if (waiting.length === 0) return false
      return waiting.length === 1
        ? `${waiting[0].guest.name} is aboard and wants a word`
        : `${waiting.length} visitors aboard want a word`
    })(),
    (() => {
      const filed = state.missions.filter((m) => m.status === 'report').length
      return filed > 0 && `${filed} mission report${filed === 1 ? '' : 's'} to read`
    })(),
    state.modules.some((m) => m.kind === 'command') &&
      !state.modules.some((m) => m.kind === 'command' && m.staff.length > 0) &&
      'Command Module unstaffed — no contracts are coming in',
    state.modules.some((m) => m.kind === 'dock') &&
      dockOfficers(state) === 0 &&
      'Docking Port unstaffed — nothing can come alongside',
  ].filter(Boolean) as string[]
}
