'use client'

/**
 * Pure render of the "review your visit" confirm sheet (Feature 184) — a modal
 * that sits between a validated booking form and the actual createBooking()
 * call, so a guest sees a plain-language summary (including the visit's
 * expected duration/end time, from the visit_duration_* Settings) before
 * anything is sent. Same shape as AccessCodePopupView.tsx / NewCompanyPopupView.tsx:
 * BookingForm.tsx renders this live, wired to its own state; the admin content
 * editor's BookingFormVisualPanel.tsx renders it with sample data via `preview`.
 *
 * Deliberately generic rows (`ReviewRow[]`) rather than named props per field —
 * the simple and enhanced/company forms show a different set of details (the
 * enhanced form has split guest counts, hot dishes, masterclass add-ons), and
 * a fixed prop shape would either lose fields or grow one optional prop per
 * variant. BookingForm.tsx decides what rows to build; this component only
 * lays them out.
 */
export type ReviewRow = { label: string; value: string }

type Labels = {
  heading: string
  subheading: string
  sectionVisit: string
  sectionGuests: string
  edit: string
  confirm: string
}

type Props = {
  labels: Labels
  visitRows: ReviewRow[]
  guestRows: ReviewRow[]
  /** The "~2.5 hrs · plan to finish around 16:30" line — null when the tenant has no visit-duration Setting configured, in which case the strip is omitted entirely rather than showing a guess. */
  durationNote?: string | null
  totalLabel?: string
  /** Formatted price string (e.g. "420₾") — null hides the total row (price not yet known, same rule as the live form's own price preview). */
  totalValue?: string | null
  submitting?: boolean
  onEdit?: () => void
  onConfirm?: () => void
  /** Preview mode: renders as an inline card instead of a fixed full-screen overlay, and the buttons become inert (no handlers needed). */
  preview?: boolean
}

const C = {
  bg: 'var(--site-surface)', surface2: 'color-mix(in srgb, var(--site-surface) 92%, var(--site-secondary))',
  border: 'var(--site-border)', text: 'var(--site-text)', muted: 'var(--site-muted)',
  faint: 'var(--site-secondary)', wine: 'var(--color-brand)',
}

function RowList({ rows }: { rows: ReviewRow[] }) {
  return (
    <>
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between gap-3 py-0.5 text-sm">
          <span style={{ color: C.muted }}>{r.label}</span>
          <span className="font-semibold text-right" style={{ color: C.text }}>{r.value}</span>
        </div>
      ))}
    </>
  )
}

export default function BookingConfirmPopupView({
  labels, visitRows, guestRows, durationNote, totalLabel, totalValue, submitting, onEdit, onConfirm, preview,
}: Props) {
  const card = (
    <div className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden flex flex-col"
      style={{ backgroundColor: C.bg, border: `1px solid ${C.border}` }}>
      <div className="px-5 py-4 border-b border-dashed" style={{ borderColor: C.border }}>
        <h3 className="font-semibold text-base" style={{ color: C.text }}>{labels.heading}</h3>
        <p className="text-xs mt-0.5" style={{ color: C.muted }}>{labels.subheading}</p>
      </div>

      <div className="px-5 py-3.5 border-b" style={{ borderColor: C.border }}>
        <p className="text-[0.68rem] font-bold uppercase tracking-wider mb-2" style={{ color: C.faint }}>{labels.sectionVisit}</p>
        <RowList rows={visitRows} />
        {durationNote && (
          <div className="flex items-center gap-2 mt-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold"
            style={{ backgroundColor: C.surface2, color: C.wine }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.6" />
              <path d="M12 7v5.2l3.6 2.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span>{durationNote}</span>
          </div>
        )}
      </div>

      <div className="px-5 py-3.5 border-b" style={{ borderColor: C.border }}>
        <p className="text-[0.68rem] font-bold uppercase tracking-wider mb-2" style={{ color: C.faint }}>{labels.sectionGuests}</p>
        <RowList rows={guestRows} />
      </div>

      {totalValue != null && (
        <div className="px-5 py-3.5 flex items-center justify-between" style={{ backgroundColor: C.surface2 }}>
          <span className="text-xs font-semibold" style={{ color: C.muted }}>{totalLabel}</span>
          <span className="font-bold text-xl" style={{ color: C.wine }}>{totalValue}</span>
        </div>
      )}

      <div className="px-5 py-4 flex gap-2.5">
        {preview ? (
          <>
            <span className="flex-shrink-0 py-2.5 px-4 rounded-lg text-sm font-semibold border text-center cursor-default"
              style={{ color: C.muted, borderColor: C.border }}>{labels.edit}</span>
            <span className="flex-1 py-2.5 rounded-lg font-semibold text-sm text-white text-center cursor-default"
              style={{ backgroundColor: C.wine, opacity: 0.85 }}>{labels.confirm}</span>
          </>
        ) : (
          <>
            <button type="button" onClick={onEdit}
              className="flex-shrink-0 py-2.5 px-4 rounded-lg text-sm font-semibold border transition-colors hover:bg-gray-50"
              style={{ color: C.muted, borderColor: C.border }}>{labels.edit}</button>
            <button type="button" onClick={onConfirm} disabled={submitting}
              className="flex-1 py-2.5 rounded-lg font-semibold text-sm text-white"
              style={{ backgroundColor: C.wine, opacity: submitting ? 0.6 : 1 }}>{labels.confirm}</button>
          </>
        )}
      </div>
    </div>
  )

  if (preview) {
    return <div className="flex items-center justify-center px-4 py-6">{card}</div>
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4 pb-4 sm:pb-0" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
      {card}
    </div>
  )
}
