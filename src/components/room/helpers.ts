import { itemDef } from '../../game/gear.ts'
import { def } from '../../game/modules.ts'
import { specDef } from '../../game/specs.ts'
import type { SpecId } from '../../game/types.ts'

/** Seconds, rounded to something a person would say out loud. */
export const eta = (remaining: number, rate: number): string => {
  if (rate <= 0) return 'stalled — nobody is working'
  const s = Math.ceil(remaining / rate)
  if (s < 90) return `${s}s`
  return `${Math.ceil(s / 60)} min`
}

/** What a spec gives you, in one line. */
export const gift = (id: SpecId): string => {
  const u = specDef(id).unlocks
  return u.kind === 'module' ? `builds ${def(u.module).name}` : `runs off ${itemDef(u.item).name}`
}
