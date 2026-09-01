import type { IncidentKind, StatKey } from './types.ts'

export interface IncidentDef {
  kind: IncidentKind
  name: string
  glyph: string
  /** Crew stat used to fight it off. */
  counter: StatKey
  /** Base hit points at station threat level 1. */
  hp: number
  /** Damage dealt to each crew member in the room, per second. */
  crewDps: number
  /** Structural damage to the module, per second. */
  structureDps: number
  /** Seconds before it spreads to a neighbouring module. */
  spreadSeconds: number
  /** Flavour shown in the log when it starts. */
  onset: string
  /** Credits awarded on top of the base reward. */
  bounty: number
}

export const INCIDENT_DEFS: Record<IncidentKind, IncidentDef> = {
  fire: {
    kind: 'fire',
    name: 'Electrical Fire',
    glyph: '🔥',
    counter: 'B',
    hp: 42,
    crewDps: 0.9,
    structureDps: 0.012,
    spreadSeconds: 30,
    onset: 'Flames in',
    bounty: 20,
  },
  breach: {
    kind: 'breach',
    name: 'Hull Breach',
    glyph: '❄',
    counter: 'T',
    hp: 54,
    crewDps: 1.0,
    structureDps: 0.018,
    spreadSeconds: 38,
    onset: 'Decompression in',
    bounty: 30,
  },
  pirates: {
    kind: 'pirates',
    name: 'Boarding Party',
    glyph: '☠',
    counter: 'R',
    hp: 66,
    crewDps: 1.5,
    structureDps: 0.008,
    spreadSeconds: 28,
    onset: 'Boarders in',
    bounty: 70,
  },
  vermin: {
    kind: 'vermin',
    name: 'Void Mites',
    glyph: '✷',
    counter: 'I',
    hp: 38,
    crewDps: 0.5,
    structureDps: 0.006,
    spreadSeconds: 44,
    onset: 'Infestation in',
    bounty: 25,
  },
}

export const incidentDef = (kind: IncidentKind): IncidentDef => INCIDENT_DEFS[kind]
