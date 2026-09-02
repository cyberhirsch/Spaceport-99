import { useState } from 'react'

interface Props {
  value: string
  onChange: (name: string) => void
  className?: string
  maxLength?: number
  label?: string
}

/** A name you can tap to rewrite. Escape abandons the edit, Enter commits it. */
export const EditableName = ({
  value,
  onChange,
  className = '',
  maxLength = 24,
  label = 'Rename',
}: Props) => {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    if (next && next !== value) onChange(next)
  }

  if (editing) {
    return (
      <input
        className={`rename ${className}`}
        value={draft}
        autoFocus
        maxLength={maxLength}
        aria-label={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') {
            setDraft(value)
            setEditing(false)
          }
        }}
      />
    )
  }

  return (
    <button
      className={`rename rename--idle ${className}`}
      title={label}
      onClick={(e) => {
        e.stopPropagation()
        setDraft(value)
        setEditing(true)
      }}
    >
      {value}
      <i aria-hidden="true">✎</i>
    </button>
  )
}
