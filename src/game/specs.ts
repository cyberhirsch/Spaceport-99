import type { ItemId, ModuleKind, SpecId } from './types.ts'

/**
 * A spec sheet: somebody else's working drawing, recovered rather than bought.
 *
 * Three things you cannot get any other way sit behind these. A spec has to be
 * found out there, worked out in the Research Lab, and then either built (a room) or
 * run off in the Fab Shop (a piece of kit). None of the three steps can be
 * skipped and none of them happens on its own.
 */
export interface SpecDef {
  id: SpecId
  name: string
  /** What having it worked out actually gives you. */
  unlocks: { kind: 'module'; module: ModuleKind } | { kind: 'item'; item: ItemId }
  /** Where a fragment of it turns up. Flavour, and it reads in the log. */
  found: string
  blurb: string
  /** Lab-seconds at one point of Intellect. Divided by what the room can do. */
  effort: number
  /** Credits and time the Fab Shop needs per unit, for item specs. */
  build?: { credits: number; seconds: number }
}

export const SPEC_DEFS: Record<SpecId, SpecDef> = {
  shield: {
    id: 'shield',
    name: 'Field Projector Geometry',
    unlocks: { kind: 'module', module: 'shield' },
    found: 'a survey hull that had been running one for years and never filed the design',
    blurb:
      'Coil spacing, phase timing, and the four pages of errata that keep it from cooking the crew.',
    effort: 900,
  },
  vault: {
    id: 'vault',
    name: 'Reclamation Sorting Tables',
    unlocks: { kind: 'module', module: 'vault' },
    found: 'a Drift salvor who had written down what everything is worth and to whom',
    blurb:
      'Somebody spent a lifetime learning which scrap is treasure. They wrote it down and then died.',
    effort: 780,
  },
  astro: {
    id: 'astro',
    name: 'Long-Baseline Astrogation',
    unlocks: { kind: 'module', module: 'dso' },
    found:
      'a survey hull that had been plotting fixes nobody asked for, on bearings nobody had charted',
    blurb:
      'How to know where you are when there is nothing near enough to take a bearing from. Four pages of it are corrections to the other two.',
    effort: 1150,
  },
  filter: {
    id: 'filter',
    name: 'Phased Return Filtering',
    unlocks: { kind: 'module', module: 'sensor' },
    found: 'a patrol boat that had stopped caring who was lying to it',
    blurb:
      'Pulls the shape of a hull out of a return that was meant to look like rock. It does not make the scan certain. It makes it less of a guess.',
    effort: 820,
  },
  torch: {
    id: 'torch',
    name: 'Breaching Torch Pattern',
    unlocks: { kind: 'item', item: 'torch' },
    found: 'a boarding party that did not need theirs any more',
    blurb: 'A cutting tool with the safety interlocks deliberately left out of the drawing.',
    effort: 520,
    build: { credits: 380, seconds: 70 },
  },
}

export const SPEC_IDS = Object.keys(SPEC_DEFS) as SpecId[]

export const specDef = (id: SpecId): SpecDef => SPEC_DEFS[id]

/** The specs that gate a room, so the build menu knows what to hide. */
export const MODULE_SPEC: Partial<Record<ModuleKind, SpecId>> = Object.fromEntries(
  SPEC_IDS.filter((id) => SPEC_DEFS[id].unlocks.kind === 'module').map((id) => [
    (SPEC_DEFS[id].unlocks as { module: ModuleKind }).module,
    id,
  ]),
)

/** The specs that gate a piece of kit, so the fab shop knows what it can run. */
export const ITEM_SPEC: Partial<Record<ItemId, SpecId>> = Object.fromEntries(
  SPEC_IDS.filter((id) => SPEC_DEFS[id].unlocks.kind === 'item').map((id) => [
    (SPEC_DEFS[id].unlocks as { item: ItemId }).item,
    id,
  ]),
)
