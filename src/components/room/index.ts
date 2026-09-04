import type { ModuleKind } from '../../game/types.ts'
import type { RoomPanel } from './types.ts'
import { LabPanel } from './LabPanel.tsx'
import { FabPanel } from './FabPanel.tsx'
import { BrigPanel } from './BrigPanel.tsx'
import { CovertPanel } from './CovertPanel.tsx'
import { FilePanel } from './FilePanel.tsx'

export type { RoomPanelProps } from './types.ts'

/**
 * A room's extra panel, keyed by kind. Most rooms need nothing beyond the
 * generic crew/output view `ModuleModal` already draws — this only covers the
 * ones with their own board to show. Adding one is a new file plus one line
 * here, never a new branch in `ModuleModal` itself.
 */
export const ROOM_PANELS: Partial<Record<ModuleKind, RoomPanel>> = {
  library: LabPanel,
  fabricator: FabPanel,
  brig: BrigPanel,
  covertops: CovertPanel,
  comms: FilePanel,
}
