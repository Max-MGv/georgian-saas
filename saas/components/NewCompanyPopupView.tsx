/**
 * Pure, stateless render of the "New Company" popup — the single source of
 * truth for what it looks like. `BookingForm.tsx` renders this live,
 * client-side, wired to its own state and handlers; the admin Messages tab
 * renders the exact same component with draft content, sample field values,
 * and no handlers, so editors see the real thing rather than a hand-
 * maintained mockup that can drift out of sync with it (the trap documented
 * for BookingFormVisualPanel.tsx in MaintenanceNotes.md §1). Same pattern as
 * PaymentResultView.tsx.
 *
 * `includesBooking` and `status` mirror BookingForm's own
 * `newCompanyIncludesBooking` state and `newCoStatus` state exactly — they
 * are independent axes in the real popup (an error can occur in either the
 * with-booking or no-booking flow), so they're kept as two props here rather
 * than collapsed into one enum.
 *
 * No hooks, no 'use client' — safe to import from a server component or a
 * client component alike.
 */
export type NewCompanyPopupStatus = 'idle' | 'submitting' | 'sent' | 'error'

type Labels = {
  namePlaceholder: string
  contactPlaceholder: string
  phonePlaceholder: string
  emailPlaceholder: string
  sending: string
  sendWithBooking: string
  sendRequest: string
  cancel: string
  close: string
}

type Props = {
  includesBooking: boolean
  status: NewCompanyPopupStatus
  title: string
  bodyWithBooking: string
  bodyNoBooking: string
  successTitle: string
  successBody: string
  errorMessage: string
  name: string
  contact: string
  phone: string
  email: string
  onNameChange?: (value: string) => void
  onContactChange?: (value: string) => void
  onPhoneChange?: (value: string) => void
  onEmailChange?: (value: string) => void
  onSubmit?: () => void
  onClose?: () => void
  labels: Labels
  /** Preview mode: renders as an inline card instead of a fixed full-screen overlay, and the submit button becomes inert (no `onSubmit` needed). */
  preview?: boolean
}

const C = {
  bg: 'var(--site-surface)', border: 'var(--site-border)', text: 'var(--site-text)',
  muted: 'var(--site-muted)', inputBg: 'var(--site-surface)',
}

const STATUS = {
  errorText: 'color-mix(in srgb, #dc2626 65%, var(--site-text))',
  successText: 'color-mix(in srgb, #16a34a 65%, var(--site-text))',
}

export default function NewCompanyPopupView({
  includesBooking, status, title, bodyWithBooking, bodyNoBooking, successTitle, successBody, errorMessage,
  name, contact, phone, email, onNameChange, onContactChange, onPhoneChange, onEmailChange, onSubmit, onClose, labels, preview,
}: Props) {
  const canSubmit = !!name.trim() && !!contact.trim() && !!phone.trim()
  const disabled = status === 'submitting' || !canSubmit

  const card = (
    <div className="w-full max-w-sm rounded-2xl shadow-2xl p-6 flex flex-col gap-3"
      style={{ backgroundColor: C.bg, border: `1px solid ${C.border}` }}>
      <div>
        <h3 className="font-semibold text-base mb-1" style={{ color: C.text }}>{title}</h3>
        <p className="text-sm" style={{ color: C.muted }}>
          {includesBooking ? bodyWithBooking : bodyNoBooking}
        </p>
      </div>
      {status === 'sent' ? (
        <div className="py-4 text-center">
          <p className="font-medium" style={{ color: STATUS.successText }}>{successTitle}</p>
          <p className="text-sm mt-1" style={{ color: C.muted }}>{successBody}</p>
          {preview ? (
            <span className="inline-block mt-4 px-4 py-2 rounded-lg text-sm font-medium border cursor-default"
              style={{ borderColor: C.border, color: C.text }}>
              {labels.close}
            </span>
          ) : (
            <button type="button" onClick={onClose}
              className="mt-4 px-4 py-2 rounded-lg text-sm font-medium border"
              style={{ borderColor: C.border, color: C.text }}>
              {labels.close}
            </button>
          )}
        </div>
      ) : (
        <>
          <input type="text" placeholder={labels.namePlaceholder} value={name} readOnly={!onNameChange}
            onChange={e => onNameChange?.(e.target.value)}
            className="w-full rounded-lg border px-3 py-2.5 text-sm" style={{ backgroundColor: C.inputBg, borderColor: C.border, color: C.text, outline: 'none' }} />
          <input type="text" placeholder={labels.contactPlaceholder} value={contact} readOnly={!onContactChange}
            onChange={e => onContactChange?.(e.target.value)}
            className="w-full rounded-lg border px-3 py-2.5 text-sm" style={{ backgroundColor: C.inputBg, borderColor: C.border, color: C.text, outline: 'none' }} />
          <input type="tel" placeholder={labels.phonePlaceholder} value={phone} readOnly={!onPhoneChange}
            onChange={e => onPhoneChange?.(e.target.value)}
            className="w-full rounded-lg border px-3 py-2.5 text-sm" style={{ backgroundColor: C.inputBg, borderColor: C.border, color: C.text, outline: 'none' }} />
          <input type="email" placeholder={labels.emailPlaceholder} value={email} readOnly={!onEmailChange}
            onChange={e => onEmailChange?.(e.target.value)}
            className="w-full rounded-lg border px-3 py-2.5 text-sm" style={{ backgroundColor: C.inputBg, borderColor: C.border, color: C.text, outline: 'none' }} />
          {status === 'error' && (
            <p className="text-xs" style={{ color: STATUS.errorText }}>{errorMessage}</p>
          )}
          {preview ? (
            <span className="w-full py-2.5 rounded-lg font-semibold text-sm text-white text-center cursor-default block"
              style={{ backgroundColor: 'var(--color-brand)', opacity: 0.6 }}>
              {includesBooking ? labels.sendWithBooking : labels.sendRequest}
            </span>
          ) : (
            <button type="button" onClick={onSubmit}
              disabled={disabled}
              className="w-full py-2.5 rounded-lg font-semibold text-sm text-white transition-opacity"
              style={{ backgroundColor: 'var(--color-brand)', opacity: disabled ? 0.6 : 1 }}>
              {status === 'submitting' ? labels.sending : includesBooking ? labels.sendWithBooking : labels.sendRequest}
            </button>
          )}
          {preview ? (
            <span className="w-full py-2 rounded-lg text-xs font-medium border text-center cursor-default block"
              style={{ color: C.muted, borderColor: C.border }}>
              {labels.cancel}
            </span>
          ) : (
            <button type="button" onClick={onClose}
              className="w-full py-2 rounded-lg text-xs font-medium border text-center"
              style={{ color: C.muted, borderColor: C.border }}>
              {labels.cancel}
            </button>
          )}
        </>
      )}
    </div>
  )

  if (preview) {
    return (
      <div className="flex items-center justify-center px-4 py-6">
        {card}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      {card}
    </div>
  )
}
