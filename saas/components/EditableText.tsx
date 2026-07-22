'use client'

import { useState, useRef, useTransition } from 'react'
import { saveContent, deleteContent } from '@/app/actions/siteContent'
import { adminT } from '@/lib/adminT'

type Props = {
  contentKey: string
  section: string
  label: string
  locale: string
  adminLocale?: string
  fallback: string
  isAdmin: boolean
  as?: keyof React.JSX.IntrinsicElements
  className?: string
  style?: React.CSSProperties
  children: string | null | undefined
}

export default function EditableText({
  contentKey, section, label, locale, adminLocale = 'en', fallback, isAdmin,
  as: Tag = 'span', className, style, children,
}: Props) {
  const at = (key: string, vars?: Record<string, string | number>) => adminT(adminLocale, key, vars)
  const [editing, setEditing]         = useState(false)
  const [value, setValue]             = useState(children ?? fallback)
  const [hovered, setHovered]         = useState(false)
  const [saved, setSaved]             = useState(false)
  const [resetDone, setResetDone]     = useState(false)
  const [showResetTip, setShowResetTip] = useState(false)
  const [isPending, startTransition]  = useTransition()
  const ref = useRef<HTMLElement>(null)

  if (!isAdmin) {
    return <Tag className={className} style={style}>{children ?? fallback}</Tag>
  }

  const hasDbValue = children != null

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

  function handleReset() {
    startTransition(async () => {
      await deleteContent(contentKey, locale)
      setValue(fallback)
      setResetDone(true)
      setShowResetTip(false)
      setTimeout(() => setResetDone(false), 2000)
    })
  }

  const editableStyle: React.CSSProperties = {
    ...style,
    cursor: editing ? 'text' : 'pointer',
    outline: editing
      ? '2px solid var(--color-brand)'
      : hovered
      ? '1px dashed #c9a090'
      : '1px dashed transparent',
    outlineOffset: 3,
    borderRadius: 3,
    transition: 'outline 0.1s',
  }

  // Truncate fallback for tooltip preview
  const tipText = fallback.length > 60 ? fallback.slice(0, 60) + '…' : fallback

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const T = Tag as any
  const inlineTags = new Set(['span', 'a', 'strong', 'em', 'b', 'i', 'label'])
  const Wrapper = inlineTags.has(Tag) ? 'span' : 'div'

  return (
    <Wrapper
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setShowResetTip(false) }}
    >
      {/* Reset badge — appears left of pencil when a DB value exists */}
      {hovered && !editing && hasDbValue && (
        <span
          aria-label={at('editable.resetAriaLabel', { fallback })}
          onMouseEnter={() => setShowResetTip(true)}
          onMouseLeave={() => setShowResetTip(false)}
          onClick={handleReset}
          style={{
            position: 'absolute',
            top: -6,
            right: 18,
            color: '#fff',
            backgroundColor: '#a89070',
            fontSize: '0.65rem',
            lineHeight: 1,
            padding: '2px 4px',
            borderRadius: 4,
            opacity: isPending ? 0.5 : 1,
            cursor: 'pointer',
            pointerEvents: 'all',
            zIndex: 10,
            whiteSpace: 'nowrap',
          }}
        >
          ↺
          {/* Tooltip */}
          {showResetTip && (
            <span
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 4,
                backgroundColor: '#1c1008',
                color: '#f5efe6',
                fontSize: '0.7rem',
                lineHeight: 1.4,
                padding: '5px 8px',
                borderRadius: 5,
                whiteSpace: 'normal',
                width: 200,
                zIndex: 50,
                pointerEvents: 'none',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              }}
            >
              {at('editable.resetTooltip', { tip: tipText })}
            </span>
          )}
        </span>
      )}

      {/* Pencil badge — top-right */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: -6,
          right: -6,
          color: '#fff',
          backgroundColor: 'var(--color-brand)',
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
        title={editing ? undefined : at('editable.editTitle', { label })}
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
            style={{ backgroundColor: 'var(--color-brand)', opacity: isPending ? 0.6 : 1 }}
          >
            {isPending ? '…' : at('editable.save')}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="text-xs px-2 py-1 rounded font-medium"
            style={{ color: '#6b5a47', border: '1px solid #e0d4c0', backgroundColor: '#fff9f3' }}
          >
            {at('editable.cancel')}
          </button>
        </div>
      )}

      {saved && !editing && (
        <span className="text-xs mt-0.5 block" style={{ color: '#16a34a' }}>{at('editable.saved')}</span>
      )}
      {resetDone && !editing && (
        <span className="text-xs mt-0.5 block" style={{ color: '#a89070' }}>{at('editable.resetToDefault')}</span>
      )}
    </Wrapper>
  )
}
