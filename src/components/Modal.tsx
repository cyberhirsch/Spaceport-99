import { useEffect, type ReactNode } from 'react'

interface Props {
  title: ReactNode
  onClose: () => void
  children: ReactNode
  wide?: boolean
  /** For a conversation there is no walking away from: no ✕, no scrim, no Escape. */
  locked?: boolean
}

export const Modal = ({ title, onClose, children, wide = false, locked = false }: Props) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !locked) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, locked])

  return (
    <div className="scrim" onClick={locked ? undefined : onClose} role="presentation">
      <div
        className={`modal${wide ? ' modal--wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header className="modal__head">
          <h2>{title}</h2>
          {!locked && (
            <button className="btn btn--ghost" onClick={onClose} aria-label="Close">
              ✕
            </button>
          )}
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  )
}
