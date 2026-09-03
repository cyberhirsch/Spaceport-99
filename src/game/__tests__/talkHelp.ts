import { reducer } from '../engine.ts'
import { labelOf, nodeOf, offered, speaker } from '../talk.ts'
import type { ScriptId, SpeakerRef } from '../talk.ts'
import type { GameState } from '../types.ts'

/** Open a conversation. */
export const open = (s: GameState, script: ScriptId, ref: SpeakerRef): GameState =>
  reducer(s, { type: 'talk', script, with: ref })

/** The replies currently on offer, as their labels. */
export const labels = (s: GameState): string[] => {
  const talk = s.talk
  if (!talk) return []
  const node = nodeOf(talk)
  const c = speaker(s, talk.with)
  if (!node || !c) return []
  return offered(c, node).map(({ reply }) => labelOf(reply, c))
}

/** What they are saying right now. */
export const line = (s: GameState): string => {
  const talk = s.talk
  if (!talk) return ''
  const node = nodeOf(talk)
  const c = speaker(s, talk.with)
  return node && c ? node.text(c) : ''
}

/** Whether a reply is offered but greyed out, and why. */
export const barredReason = (s: GameState, match: string): string | null => {
  const talk = s.talk
  if (!talk) return null
  const node = nodeOf(talk)
  const c = speaker(s, talk.with)
  if (!node || !c) return null
  const found = offered(c, node).find(({ reply }) => labelOf(reply, c).includes(match))
  return found?.barred ?? null
}

/** Say the first reply whose label contains `match`. Fails loudly if there is none. */
export const say = (s: GameState, match: string): GameState => {
  const talk = s.talk
  if (!talk) throw new Error(`no conversation open, wanted to say "${match}"`)
  const node = nodeOf(talk)
  const c = speaker(s, talk.with)
  if (!node || !c) throw new Error('conversation has no node')
  const found = offered(c, node).find(({ reply }) => labelOf(reply, c).includes(match))
  if (!found) {
    throw new Error(`no reply matching "${match}" — on offer: ${labels(s).join(' | ')}`)
  }
  return reducer(s, { type: 'say', reply: found.index })
}
