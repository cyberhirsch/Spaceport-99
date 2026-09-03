import { useEffect, useRef } from 'react'
import { labelOf, nodeOf, offered, speaker } from '../game/talk.ts'
import { factionDef } from '../game/factions.ts'
import type { GameState } from '../game/types.ts'
import { CrewAvatar } from './CrewAvatar.tsx'
import { Modal } from './Modal.tsx'

interface Props {
  state: GameState
  onSay: (reply: number) => void
  onClose: () => void
}

/**
 * A conversation.
 *
 * Everything already said stays on screen above the current line, because the
 * whole point of a conversation is that what came earlier is still true. The
 * replies are the only thing that moves.
 */
export const TalkModal = ({ state, onSay, onClose }: Props) => {
  const talk = state.talk
  const foot = useRef<HTMLDivElement>(null)
  const c = talk ? speaker(state, talk.with) : null
  const node = talk ? nodeOf(talk) : null

  // Keep the newest line in view as the conversation grows.
  useEffect(() => {
    foot.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [talk?.node, talk?.said.length])

  if (!talk || !node || !c) return null

  const options = offered(c, node)
  const beat = node.beat?.(c) ?? null
  const who =
    c.crew ?? c.candidate ?? c.guest ?? null
  const flag = c.ship ? factionDef(c.ship.faction) : null

  return (
    <Modal
      wide
      locked={node.sticky}
      onClose={onClose}
      title={
        <span className="modal__title">
          {c.name}
          {flag && (
            <em style={{ color: `hsl(${flag.hue} 70% 62%)` }}>
              {flag.glyph} {flag.short}
            </em>
          )}
        </span>
      }
    >
      <div className="talk">
        {who && 'seed' in who && (
          <div className="talk__face">
            <CrewAvatar who={who} size={72} />
          </div>
        )}

        <div className="talk__thread">
          {talk.said.map((line, i) => (
            <p key={i} className={`talk__line talk__line--${line.who}`}>
              {line.who === 'you' && <i>You</i>}
              {line.text}
            </p>
          ))}

          <p className="talk__line talk__line--now">{node.text(c)}</p>
          {beat && <p className="talk__beat">{beat}</p>}
          <div ref={foot} />
        </div>
      </div>

      <div className="talk__replies">
        {options.map(({ reply, index, barred }) => {
          const note = reply.note?.(c) ?? null
          return (
            <button
              key={index}
              className="talk__reply"
              disabled={Boolean(barred)}
              onClick={() => onSay(index)}
              title={barred ?? undefined}
            >
              <b>{labelOf(reply, c)}</b>
              {(note || barred) && <em>{barred ?? note}</em>}
            </button>
          )
        })}
      </div>

      {node.sticky && (
        <p className="panel-note talk__stuck">
          There is no walking away from this one.
        </p>
      )}
    </Modal>
  )
}
