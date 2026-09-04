import { def, wingOf } from './modules.ts'
import { uid } from './crew.ts'
import { incidentDef } from './incidents.ts'
import type { GameState, IncidentKind, StationModule } from './types.ts'
import { log, pickOne, roll, roller } from './core.ts'

// Fires, breaches, vermin and boarders: how they start and where they spread.

/**
 * Neighbours an emergency can spread into: along the same wing, or straight up
 * and down through the deck. The lift shaft acts as a fire break.
 */
export const adjacentModules = (s: GameState, m: StationModule): StationModule[] =>
  s.modules.filter(
    (o) =>
      o.id !== m.id &&
      ((o.deck === m.deck &&
        wingOf(o.col) === wingOf(m.col) &&
        (o.col + o.width === m.col || o.col === m.col + m.width)) ||
        (Math.abs(o.deck - m.deck) === 1 && o.col < m.col + m.width && o.col + o.width > m.col)),
  )

/** Emergencies never pile up past this — a station under siege stays playable. */
export const incidentCap = (s: GameState): number => 2 + Math.floor(s.modules.length / 5)

export const startIncident = (s: GameState, kind: IncidentKind, module: StationModule): void => {
  if (s.incidents.some((i) => i.moduleId === module.id)) return
  if (s.incidents.length >= incidentCap(s)) return
  const d = incidentDef(kind)
  const threat = 1 + s.modules.length * 0.06 + s.crew.filter((c) => !c.dead).length * 0.04
  const hp = Math.round(d.hp * threat)
  s.incidents.push({
    id: uid('i'),
    kind,
    moduleId: module.id,
    hp,
    maxHp: hp,
    spreadIn: d.spreadSeconds,
    startedAt: s.elapsed,
  })
  log(s, `${d.onset} ${def(module.kind).name}!`, 'bad')
}

export const rollIncident = (s: GameState): void => {
  const candidates = s.modules.filter(
    (m) => m.kind !== 'spine' && !s.incidents.some((i) => i.moduleId === m.id),
  )
  if (candidates.length === 0) return
  // A tidier station is a safer one; damaged, unstaffed rooms invite trouble.
  const target = pickOne(roller(s), candidates)
  const risk = 0.22 + (1 - target.condition) * 0.4 + (target.staff.length === 0 ? 0.1 : 0)
  if (roll(s) > risk) return
  const r = roll(s)
  const kind: IncidentKind =
    r < 0.34 ? 'fire' : r < 0.6 ? 'vermin' : r < 0.85 ? 'breach' : 'pirates'
  startIncident(s, kind, target)
}
