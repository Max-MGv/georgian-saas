'use client'

import { useState, useTransition } from 'react'
import { saveContent, deleteContent } from '@/app/actions/siteContent'
import { adminT } from '@/lib/adminT'

type Props = {
  contentKey: string
  section: string
  label: string
  locale: string
  adminLocale?: string
  fallback: string
  value: string | null
}

// Textarea-based sibling to EditableText, for long-form content (legal documents)
// where a contentEditable span/div is the wrong editing surface. Same save/cancel/
// reset chrome and server actions, different input control.
export default function EditableLongText({
  contentKey, section, label, locale, adminLocale = 'en', fallback, value,
}: Props) {
  const at = (key: string, vars?: Record<string, string | number>) => adminT(adminLocale, key, vars)
  const [editing, setEditing]       = useState(false)
  const [current, setCurrent]       = useState(value ?? fallback)
  const [draft, setDraft]           = useState(current)
  const [saved, setSaved]           = useState(false)
  const [resetDone, setResetDone]   = useState(false)
  const [isPending, startTransition] = useTransition()

  const hasDbValue = value != null

  function handleEdit() {
    setDraft(current)
    setEditing(true)
  }

  function handleSave() {
    startTransition(async () => {
      await saveContent(contentKey, draft, section, label, locale)
      setCurrent(draft)
      setEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  function handleCancel() {
    setDraft(current)
    setEditing(false)
  }

  function handleReset() {
    startTransition(async () => {
      await deleteContent(contentKey, locale)
      setCurrent(fallback)
      setDraft(fallback)
      setResetDone(true)
      setTimeout(() => setResetDone(false), 2000)
    })
  }

  return (
    <div>
      {editing ? (
        <>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={16}
            className="w-full text-sm leading-relaxed rounded-lg border px-3 py-2.5"
            style={{ borderColor: 'var(--color-brand)', backgroundColor: '#fffdf9', color: '#1c1008', resize: 'vertical' }}
            autoFocus
          />
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
            {hasDbValue && (
              <button
                type="button"
                onClick={handleReset}
                disabled={isPending}
                className="text-xs px-2 py-1 rounded font-medium ml-auto"
                style={{ color: '#a89070' }}
              >
                {at('editable.resetToDefault')}
              </button>
            )}
          </div>
        </>
      ) : (
        <div
          onClick={handleEdit}
          className="cursor-pointer rounded-lg border px-3 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
          style={{ borderColor: '#e0d4c0', backgroundColor: '#fff9f3', color: '#1c1008', maxHeight: 220, overflowY: 'auto' }}
          title={at('editable.editTitle', { label })}
        >
          {current}
        </div>
      )}

      {saved && !editing && (
        <span className="text-xs mt-0.5 block" style={{ color: '#16a34a' }}>{at('editable.saved')}</span>
      )}
      {resetDone && !editing && (
        <span className="text-xs mt-0.5 block" style={{ color: '#a89070' }}>{at('editable.resetToDefault')}</span>
      )}
    </div>
  )
}
