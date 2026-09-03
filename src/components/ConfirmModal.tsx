import type { ReactNode } from 'react'
import { Modal } from './Modal.tsx'

interface Props {
  title: string
  /** What is about to happen, and what it costs. */
  children: ReactNode
  /** The label on the button that does it. */
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * The station asking whether you meant it.
 *
 * Only for things that cannot be undone — scrapping a room, scuttling the
 * station, throwing away a save. It says what will happen rather than asking a
 * bare yes/no, because the answer depends on knowing the consequence.
 */
export const ConfirmModal = ({ title, children, confirmLabel, onConfirm, onCancel }: Props) => (
  <Modal title={<span className="modal__title">{title}</span>} onClose={onCancel}>
    <p className="panel-note confirm__body">{children}</p>
    <div className="modal__actions">
      <button className="btn" onClick={onCancel} autoFocus>
        Cancel
      </button>
      <button className="btn btn--danger" onClick={onConfirm}>
        {confirmLabel}
      </button>
    </div>
  </Modal>
)
