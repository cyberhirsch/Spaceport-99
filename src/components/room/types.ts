import type { ComponentType } from 'react'
import type { GameState, ItemId, SpecId } from '../../game/types.ts'

/**
 * Everything a room-specific panel might need. Every panel takes this same
 * shape and destructures only what it uses, so the lookup in `index.ts` stays
 * a flat table: a new room's panel is a new file plus one line there, never a
 * new prop type to thread through `ModuleModal`.
 */
export interface RoomPanelProps {
  state: GameState
  onResearch: (spec: SpecId | null) => void
  onFabricate: (item: ItemId | null) => void
  onTalkPrisoner: (prisonerId: string) => void
  /** Opens the letter, and the decision about it. */
  onReadFile: () => void
  onDecideFile: () => void
}

export type RoomPanel = ComponentType<RoomPanelProps>
