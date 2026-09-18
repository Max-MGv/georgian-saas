'use client'

import { useState } from 'react'

/**
 * Pure render of the company access-code popup — the single source of truth
 * for what it looks like. `BookingForm.tsx` renders this live, wired to its
 * own state and handlers; the admin Messages tab renders the exact same
 * component with draft content and a sample company name, so editors see the
 * real thing rather than a hand-maintained mockup (the trap documented for
 * BookingFormVisualPanel.tsx in MaintenanceNotes.md §1). Same pattern as
 * PaymentResultView.tsx / NewCompanyPopupView.tsx.
 *
 * Unlike those two, this one keeps a small piece of local state (the
 * password-visibility toggle) — purely ephemeral display state that never
 * needs to reach either caller, and both callers are already client
 * components, so there's no server-component constraint to keep this
 * hookless for (that was Payment Result's reason, not a rule in itself).
 */
export type AccessCodePopupStatus = 'idle' | 'checking' | 'error'

type Labels = {
  placeholder: string
  checking: string
  confirm: string
  enterManually: string
}

type Props = {
  status: AccessCodePopupStatus
  title: string
  intro: string
  errorMessage: string
  /** Raw company name, for the hidden autofill field only — `intro` already has any {company} token resolved. */
  companyName: string
  code: string
  onCodeChange?: (value: string) => void
  onSubmit?: () => void
  onEnterManually?: () => void
  labels: Labels
  /** Preview mode: renders as an inline card instead of a fixed full-screen overlay, and the buttons become inert (no handlers needed). */
  preview?: boolean
}

const C = {
  bg: 'var(--site-surface)', border: 'var(--site-border)', text: 'var(--site-text)',
  muted: 'var(--site-muted)', wine: 'var(--color-brand)', inputBg: 'var(--site-surface)',
}

const STATUS = {
  errorText: 'color-mix(in srgb, #dc2626 65%, var(--site-text))',
}

export default function AccessCodePopupView({
  status, title, intro, errorMessage, companyName, code, onCodeChange, onSubmit, onEnterManually, labels, preview,
}: Props) {
  const [showCodeText, setShowCodeText] = useState(false)
  const inputStyle = { backgroundColor: C.inputBg, borderColor: C.border, color: C.text, outline: 'none' }

  const fields = (
    <>
      <div>
        <h3 className="font-semibold text-base mb-1" style={{ color: C.text }}>{title}</h3>
        <p className="text-sm" style={{ color: C.muted }}>{intro}</p>
      </div>

      {/* Hidden username field — tells the browser what account this password belongs to */}
      <input type="text" name="username" autoComplete="username" value={companyName} readOnly style={{ display: 'none' }} />

      <div className="relative">
        <input
          autoFocus={!preview}
          name="password"
          type={showCodeText ? 'text' : 'password'}
          autoComplete="current-password"
          value={code}
          readOnly={!onCodeChange}
          onChange={e => onCodeChange?.(e.target.value.toUpperCase())}
          placeholder={labels.placeholder}
          className="w-full rounded-lg border px-3 py-2.5 text-sm font-mono"
          style={{ ...inputStyle, paddingRight: '40px', letterSpacing: '0.08em' }}
        />
        <button
          type="button"
          onClick={() => setShowCodeText(s => !s)}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-80"
        >
          {showCodeText ? (
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>

      {status === 'error' && <p className="text-sm" style={{ color: STATUS.errorText }}>{errorMessage}</p>}

      {preview ? (
        <span className="w-full py-2.5 rounded-lg font-semibold text-sm text-white text-center cursor-default block"
          style={{ backgroundColor: C.wine, opacity: 0.6 }}>
          {status === 'checking' ? labels.checking : labels.confirm}
        </span>
      ) : (
        <button
          type="submit"
          disabled={status === 'checking' || !code.trim()}
          className="w-full py-2.5 rounded-lg font-semibold text-sm text-white"
          style={{ backgroundColor: C.wine, opacity: (status === 'checking' || !code.trim()) ? 0.6 : 1 }}
        >
          {status === 'checking' ? labels.checking : labels.confirm}
        </button>
      )}

      {preview ? (
        <span className="w-full py-2 rounded-lg text-xs font-medium border text-center cursor-default block"
          style={{ color: C.muted, borderColor: C.border }}>
          {labels.enterManually}
        </span>
      ) : (
        <button
          type="button"
          onClick={onEnterManually}
          className="w-full py-2 rounded-lg text-xs font-medium border text-center transition-colors hover:bg-gray-50"
          style={{ color: C.muted, borderColor: C.border }}
        >
          {labels.enterManually}
        </button>
      )}
    </>
  )

  const cardClass = 'w-full max-w-sm rounded-2xl shadow-2xl p-6 flex flex-col gap-4'
  const cardStyle = { backgroundColor: C.bg, border: `1px solid ${C.border}` }

  if (preview) {
    return (
      <div className="flex items-center justify-center px-4 py-6">
        <div className={cardClass} style={cardStyle}>{fields}</div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
      <form onSubmit={e => { e.preventDefault(); onSubmit?.() }} className={cardClass} style={cardStyle}>
        {fields}
      </form>
    </div>
  )
}
