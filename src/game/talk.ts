import type { Candidate, Crew, GameState, Guest, Prisoner, Prospect, Visitor } from './types.ts'

/**
 * Conversations.
 *
 * The commander's job is talking to people, so this is the one system every
 * other one eventually hands off to: hiring, trading, being leaned on, and
 * being told the station has changed hands.
 *
 * Only the *pointer* is saved — which script, which node, what has been
 * established. The scripts themselves live in code, which is why a reply can
 * carry a closure and still survive a reload.
 */

/** Who the commander is talking to. */
export type SpeakerRef =
  | { kind: 'crew'; id: string }
  | { kind: 'guest'; id: string }
  | { kind: 'candidate'; id: string }
  | { kind: 'visitor'; id: string }
  | { kind: 'prisoner'; id: string }

export type ScriptId = 'crew' | 'hire' | 'captain' | 'conquest' | 'prisoner' | 'covert'

/** One exchanged line, kept so the conversation reads as a conversation. */
export interface TalkLine {
  who: 'them' | 'you'
  text: string
}

/** A conversation in progress. This is the part that is saved. */
export interface Talk {
  script: ScriptId
  with: SpeakerRef
  /**
   * Their name, captured when the conversation opened. A closing line still
   * has to render after the person has walked off the manifest.
   */
  who: string
  /** The node on screen. */
  node: string
  /** What has been established. Replies branch on these. */
  flags: string[]
  /** Everything said so far, oldest first. */
  said: TalkLine[]
}

/**
 * Everything a line or a reply is allowed to look at. Whichever of the four
 * subjects applies is filled in; the rest are undefined.
 */
export interface TalkCtx {
  s: GameState
  talk: Talk
  name: string
  crew?: Crew
  guest?: Guest
  candidate?: Candidate
  /** The hull in question: the visitor themselves, or the one a guest came on. */
  ship?: Visitor
  /** Somebody in the cells. */
  prisoner?: Prisoner
  /** The persuasion subject, for the scripts that are about talking someone round. */
  prospect?: Prospect
  has: (flag: string) => boolean
}

export interface TalkReply {
  /** What the commander says. */
  label: string | ((c: TalkCtx) => string)
  /** A small line under it: what it costs, or what it means. */
  note?: (c: TalkCtx) => string | null
  /** Only offered when this holds. */
  when?: (c: TalkCtx) => boolean
  /** Offered, but greyed out — so the player can see what they are missing. */
  barred?: (c: TalkCtx) => string | null
  /** Runs when picked, against the reducer's draft state. */
  effect?: (c: TalkCtx) => void
  /** Established by picking it. */
  sets?: string[]
  /** Where it goes. `null` ends the conversation. */
  goto: string | null | ((c: TalkCtx) => string | null)
}

export interface TalkNode {
  /** What they say. */
  text: (c: TalkCtx) => string
  /** A stage direction under the line — what they do while saying it. */
  beat?: (c: TalkCtx) => string | null
  replies: TalkReply[]
  /** True when the conversation cannot simply be closed from here. */
  sticky?: boolean
  /**
   * True for a node reached *after* the subject has left — a signed contract,
   * a hull that has undocked. The line still shows; there is just nobody left
   * to look up.
   */
  final?: boolean
}

export type TalkScript = Record<string, TalkNode>

const SCRIPTS: Partial<Record<ScriptId, TalkScript>> = {}

/** Scripts register themselves, so this file depends on none of them. */
export const registerScript = (id: ScriptId, script: TalkScript): void => {
  SCRIPTS[id] = script
}

export const scriptOf = (id: ScriptId): TalkScript => {
  const found = SCRIPTS[id]
  if (!found) throw new Error(`no talk script: ${id}`)
  return found
}

export const nodeOf = (t: Talk): TalkNode | null => scriptOf(t.script)[t.node] ?? null

/**
 * Resolve whoever the conversation is with, or null if they have gone.
 *
 * The exception is a node marked `final`: by then the person has left on
 * purpose — signed on, or undocked — and the closing line still has to render,
 * so it gets a context carrying nothing but the name.
 */
export const speaker = (s: GameState, ref: SpeakerRef): TalkCtx | null => {
  const has = (flag: string) => s.talk?.flags.includes(flag) ?? false
  const base = { s, talk: s.talk as Talk, has }
  const gone = (): TalkCtx | null => {
    const talk = s.talk
    if (!talk) return null
    return scriptOf(talk.script)[talk.node]?.final ? { ...base, name: talk.who } : null
  }

  if (ref.kind === 'crew') {
    const crew = s.crew.find((c) => c.id === ref.id)
    if (!crew || crew.dead) return gone()
    return { ...base, name: crew.name, crew }
  }
  if (ref.kind === 'candidate') {
    const candidate = s.candidates.find((c) => c.id === ref.id)
    if (!candidate || candidate.arrivesIn > 0) return gone()
    return { ...base, name: candidate.name, candidate, prospect: candidate }
  }
  if (ref.kind === 'guest') {
    for (const ship of s.visitors) {
      const guest = ship.aboard.find((g) => g.id === ref.id)
      if (guest) {
        if (ship.status !== 'docked') return gone()
        return { ...base, name: guest.name, guest, ship, prospect: guest }
      }
    }
    return gone()
  }
  if (ref.kind === 'prisoner') {
    const prisoner = s.prisoners.find((p) => p.id === ref.id)
    if (!prisoner) return gone()
    return { ...base, name: prisoner.name, prisoner }
  }
  const ship = s.visitors.find((v) => v.id === ref.id)
  if (!ship) return gone()
  return { ...base, name: ship.name, ship }
}

/** The replies actually on offer, with the barred ones kept and marked. */
export const offered = (c: TalkCtx, node: TalkNode): { reply: TalkReply; index: number; barred: string | null }[] =>
  node.replies
    .map((reply, index) => ({ reply, index, barred: reply.barred?.(c) ?? null }))
    .filter(({ reply }) => reply.when?.(c) ?? true)

export const labelOf = (reply: TalkReply, c: TalkCtx): string =>
  typeof reply.label === 'function' ? reply.label(c) : reply.label

/** A conversation, opened at its first node. Nothing is said until it starts. */
export const beginTalk = (
  script: ScriptId,
  ref: SpeakerRef,
  who: string,
  node = 'start',
): Talk => ({
  script,
  with: ref,
  who,
  node,
  flags: [],
  said: [],
})
