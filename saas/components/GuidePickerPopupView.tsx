'use client'

import type { GuideChoice } from '@/app/actions/companies'

/**
 * "Which guide are you?" — the second step after a COMPANY-level access code is
 * accepted for a company that has guides (KnownBugs #55, 2026-09-19).
 *
 * **Why this exists.** A guide's own code identifies that guide directly. The
 * company's shared code cannot, so before this popup existed the booking form
 * simply rejected the company code for any company with guides — silently
 * killing a code already in circulation with a partner agency. Max's
 * resolution: keep the code working and ask who is booking. Attribution is
 * still recorded; it is just declared rather than proved.
 *
 * Pure render, same contract as AccessCodePopupView.tsx — the caller owns all
 * state and handlers, and `preview` swaps the fixed overlay for an inline card
 * with inert controls so the admin Messages tab can show the real component
 * rather than a hand-maintained mockup that drifts (MaintenanceNotes.md §1).
 */
type Labels = {
  notListed: string
}

type Props = {
  title: string
  /** `{company}` already resolved by the caller, same as AccessCodePopupView's `intro`. */
  intro: string
  guides: GuideChoice[]
  /** A guide was chosen. */
  onPick?: (guide: GuideChoice) => void
  /** "I'm not on this list" — proceed with the company's own contact details. */
  onNotListed?: () => void
  labels: Labels
  preview?: boolean
}

const C = {
  bg: 'var(--site-surface)', border: 'var(--site-border)', text: 'var(--site-text)',
  muted: 'var(--site-muted)', wine: 'var(--color-brand)',
}

export default function GuidePickerPopupView({
  title, intro, guides, onPick, onNotListed, labels, preview,
}: Props) {
  const fields = (
    <>
      <div>
        <h3 className="font-semibold text-base mb-1" style={{ color: C.text }}>{title}</h3>
        <p className="text-sm" style={{ color: C.muted }}>{intro}</p>
      </div>

      <div className="flex flex-col gap-2">
        {guides.map(g => {
          const inner = (
            <>
              <span className="font-medium text-sm" style={{ color: C.text }}>{g.name}</span>
              {g.phone && <span className="text-xs" style={{ color: C.muted }}>{g.phone}</span>}
            </>
          )
          const cls = 'w-full rounded-lg border px-3 py-2.5 flex flex-col items-start gap-0.5 text-left'
          const style = { borderColor: C.border, backgroundColor: 'transparent' }
          // Preview renders spans, not buttons: the admin panel shows this card
          // inside its own page, and a nested interactive control there would be
          // both inert and confusing. Same split AccessCodePopupView uses.
          return preview ? (
            <span key={g.id} className={`${cls} cursor-default`} style={style}>{inner}</span>
          ) : (
            <button
              key={g.id}
              type="button"
              onClick={() => onPick?.(g)}
              // Explicit label: the name and phone are separate nested spans, and
              // the computed accessible name came back EMPTY in a live check
              // (read_page reported a bare `button` with no name). A screen
              // reader would have announced "button" and nothing else, and a
              // Playwright spec could not target these by role+name either.
              aria-label={g.name}
              className={`${cls} transition-colors hover:bg-gray-50`}
              style={style}
            >
              {inner}
            </button>
          )
        })}
      </div>

      {/* Always offered. A guide who has just joined the agency and has not been added in
          the admin panel yet would otherwise be stuck at this step with no way forward —
          the booking falls back to the company's own contact details, exactly as it did
          before guides existed. */}
      {preview ? (
        <span className="w-full py-2 rounded-lg text-xs font-medium border text-center cursor-default block"
          style={{ color: C.muted, borderColor: C.border }}>
          {labels.notListed}
        </span>
      ) : (
        <button
          type="button"
          onClick={onNotListed}
          className="w-full py-2 rounded-lg text-xs font-medium border text-center transition-colors hover:bg-gray-50"
          style={{ color: C.muted, borderColor: C.border }}
        >
          {labels.notListed}
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
      <div className={cardClass} style={cardStyle}>{fields}</div>
    </div>
  )
}
