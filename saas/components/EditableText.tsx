'use client'

import { useState, useRef, useTransition } from 'react'
import { saveContent } from '@/app/actions/siteContent'

type Props = {
  contentKey: string
  section: string
  label: string
  locale: string
  fallback: string
  isAdmin: boolean
  as?: keyof React.JSX.IntrinsicElements
  className?: string
  style?: React.CSSProperties
  children: string
}

export default function EditableText({
  contentKey, section, label, locale, fallback, isAdmin,
  as: Tag = 'span', className, style, children,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(children || fallback)
  const [hovered, setHovered] = useState(false)
  const [saved, setSaved] = useState(false)
  const [isPending, startTransition] = useTransition()
  const ref = useRef<HTMLElement>(null)

  if (!isAdmin) {
    return <Tag className={className} style={style}>{children || fallback}</Tag>
  }

  function handleClick() {
    if (editing) return
    setEditing(true)
    setTimeout(() => {
      if (ref.current) {
        ref.current.focus()
        const range = document.createRange()
        range.selectNodeContents(ref.current)
        range.collapse(false)
        window.getSelection()?.removeAllRanges()
        window.getSelection()?.addRange(range)
      }
    }, 0)
  }

  function handleSave() {
    const newValue = ref.current?.innerText ?? value
    setValue(newValue)
    startTransition(async () => {
      await saveContent(contentKey, newValue, section, label, locale)
      setEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  function handleCancel() {
    if (ref.current) ref.current.innerText = value
    setEditing(false)
  }

  const editableStyle: React.CSSProperties = {
    ...style,
    cursor: editing ? 'text' : 'pointer',
    outline: editing
      ? '2px solid #7c1d23'
      : hovered
      ? '1px dashed #c9a090'
      : '1px dashed transparent',
    outlineOffset: 3,
    borderRadius: 3,
    transition: 'outline 0.1s',
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const T = Tag as any

  return (
    <div
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Red pencil badge — top-right corner on hover */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: -6,
          right: -6,
          color: '#fff',
          backgroundColor: '#7c1d23',
          fontSize: '0.65rem',
          lineHeight: 1,
          padding: '2px 4px',
          borderRadius: 4,
          opacity: hovered && !editing ? 1 : 0,
          transition: 'opacity 0.15s',
          pointerEvents: 'none',
          zIndex: 10,
          whiteSpace: 'nowrap',
        }}
      >
        ✎
      </span>

      <T
        ref={ref}
        className={className}
        style={editableStyle}
        contentEditable={editing}
        suppressContentEditableWarning
        onClick={handleClick}
        title={editing ? undefined : `Edit: ${label}`}
      >
        {value}
      </T>

      {editing && (
        <div className="flex items-center gap-1.5 mt-1.5">
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="text-xs px-2.5 py-1 rounded font-medium text-white"
            style={{ backgroundColor: '#7c1d23', opacity: isPending ? 0.6 : 1 }}
          >
            {isPending ? '…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="text-xs px-2 py-1 rounded font-medium"
            style={{ color: '#6b5a47', border: '1px solid #e0d4c0', backgroundColor: '#fff9f3' }}
          >
            Cancel
          </button>
        </div>
      )}

      {saved && !editing && (
        <span className="text-xs mt-0.5 block" style={{ color: '#16a34a' }}>✓ Saved</span>
      )}
    </div>
  )
}
