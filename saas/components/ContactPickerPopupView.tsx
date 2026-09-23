'use client'

import type { ContactChoice } from '@/lib/contactResolution'

/**
 * "Which one of these people are you?" — the step after a COMPANY-level access code
 * is accepted for a company that has people on file.
 *
 * **Why this exists.** A person's own code identifies them directly. The company's
 * shared code cannot, so before this popup existed the booking form simply rejected
 * the company code for any company with guides — silently killing a code already in
 * circulation with a partner agency (KnownBugs #55). Max's resolution: keep the code
 * working and ask who is booking. Attribution is still recorded; it is just declared
 * rather than proved, and **the point of the whole thing is autofill, not
 * authentication** (Plan-ContactRoles §1, unpacked point 3).
 *
 * **Role-driven, and it knows nothing about guides.** Generalised from
 * `GuidePickerPopupView` in Chunk 7. It renders the people of exactly **one** role
 * per showing, and the role is expressed entirely through the caller's `title` and
 * `intro` — this component never branches on which role it is looking at. A company
 * with both a Contact Person and a Guide gets two showings in sequence, driven by
 * `useContactSelection()`, which is also what keeps the admin Messages preview
 * meaningful: one card, one role, the same thing a guest sees.
 *
 * Pure render, same contract as AccessCodePopupView.tsx — the caller owns all state
 * and handlers, and `preview` swaps the fixed overlay for an inline card with inert
 * controls so the admin Messages tab can show the real component rather than a
 * hand-maintained mockup that drifts (MaintenanceNotes.md §1).
 */
type Labels = {
  notListed: string
}

type Props = {
  title: string
  /** `{company}` and `{role}` already resolved by the caller, same as AccessCodePopupView's `intro`. */
  intro: string
  /** The people in ONE role. Never carries a person's `code` — see ContactChoice. */
  people: ContactChoice[]
  /** A person was chosen. */
  onPick?: (person: ContactChoice) => void
  /** "I'm not on this list" — proceed without picking anyone for this role. */
  onNotListed?: () => void
  labels: Labels
  preview?: boolean
  /**
   * Stacking layer for the overlay, as a Tailwind class. Defaults to the `z-50` the booking
   * form wants.
   *
   * The wine catalogue renders this *over its own checkout drawer*, which is itself `z-50`, so
   * the picker appeared behind it — visible but unreachable. That page's own access-code popup
   * already uses `z-[60]` for the same reason. Exposed as a prop rather than raised globally
   * because "what else is on this page" is the caller's knowledge, not this component's.
   */
  overlayZClass?: string
}

const C = {
  bg: 'var(--site-surface)', border: 'var(--site-border)', text: 'var(--site-text)',
  muted: 'var(--site-muted)', wine: 'var(--color-brand)',
}

export default function ContactPickerPopupView({
  title, intro, people, onPick, onNotListed, labels, preview, overlayZClass = 'z-50',
}: Props) {
  const fields = (
    <>
      <div>
        <h3 className="font-semibold text-base mb-1" style={{ color: C.text }}>{title}</h3>
        <p className="text-sm" style={{ color: C.muted }}>{intro}</p>
      </div>

      <div className="flex flex-col gap-2">
        {people.map(p => {
          const inner = (
            <>
              <span className="font-medium text-sm" style={{ color: C.text }}>{p.name}</span>
              {p.phone && <span className="text-xs" style={{ color: C.muted }}>{p.phone}</span>}
            </>
          )
          const cls = 'w-full rounded-lg border px-3 py-2.5 flex flex-col items-start gap-0.5 text-left'
          const style = { borderColor: C.border, backgroundColor: 'transparent' }
          // Preview renders spans, not buttons: the admin panel shows this card
          // inside its own page, and a nested interactive control there would be
          // both inert and confusing. Same split AccessCodePopupView uses.
          return preview ? (
            <span key={p.id} className={`${cls} cursor-default`} style={style}>{inner}</span>
          ) : (
            <button
              key={p.id}
              type="button"
              onClick={() => onPick?.(p)}
              // Explicit label: the name and phone are separate nested spans, and
              // the computed accessible name came back EMPTY in a live check
              // (read_page reported a bare `button` with no name). A screen
              // reader would have announced "button" and nothing else, and a
              // Playwright spec could not target these by role+name either.
              // Hurdle H14 — Chunk 13 asserts on this.
              aria-label={p.name}
              className={`${cls} transition-colors hover:bg-gray-50`}
              style={style}
            >
              {inner}
            </button>
          )
        })}
      </div>

      {/* Always offered. Someone who has just joined the agency and has not been added
          in the admin panel yet would otherwise be stuck at this step with no way
          forward — the booking proceeds on whatever they type into the form instead,
          exactly as it did before people were pickable at all. */}
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
    <div className={`fixed inset-0 ${overlayZClass} flex items-center justify-center px-4`} style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}>
      <div className={cardClass} style={cardStyle}>{fields}</div>
    </div>
  )
}
