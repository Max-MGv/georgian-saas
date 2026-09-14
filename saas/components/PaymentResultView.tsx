import Link from 'next/link'

/**
 * Pure, stateless render of the payment result screen — the single source of
 * truth for what it looks like. `app/(site)/payment/result/page.tsx` renders
 * this live, server-side, with the real query-string status; the admin
 * Messages tab renders the exact same component client-side with draft
 * content and sample data, so editors see the real thing rather than a
 * hand-maintained mockup that can drift out of sync with it (the trap
 * documented for BookingFormVisualPanel.tsx in MaintenanceNotes.md §1).
 *
 * No hooks, no 'use client' — safe to import from a server component (the
 * real page) or a client component (the admin preview) alike.
 */
export type PaymentResultKind = 'success' | 'failed' | 'pending'

type Props = {
  kind: PaymentResultKind
  heading: string
  body: string
  /** Shown only for failed/pending — the reservation is still held, a call settles it fastest. */
  contactPhone?: string
  backHomeLabel: string
  /** Preview mode: the "Back to home" link becomes inert (no navigation) so it doesn't leave the admin panel. */
  preview?: boolean
}

const ICON: Record<PaymentResultKind, string> = { success: '🍷', failed: '💳', pending: '⏳' }

export default function PaymentResultView({ kind, heading, body, contactPhone, backHomeLabel, preview }: Props) {
  const Wrapper = preview ? 'div' : 'main'
  return (
    <Wrapper className={preview ? 'flex items-center justify-center px-6 py-10' : 'min-h-[60vh] flex items-center justify-center px-6 py-16'}>
      <div
        className="rounded-xl border p-10 text-center max-w-lg"
        style={{ backgroundColor: 'var(--site-surface)', borderColor: 'var(--site-border)' }}
      >
        <div className="text-4xl mb-4">{ICON[kind]}</div>
        <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--site-text)' }}>{heading}</h1>
        <p style={{ color: 'var(--site-muted)' }}>{body}</p>
        {contactPhone && (
          <p className="mt-4 font-medium" style={{ color: 'var(--site-text)' }}>
            <a href={`tel:${contactPhone}`}>{contactPhone}</a>
          </p>
        )}
        {preview ? (
          <span
            className="inline-block mt-8 py-3 px-6 rounded-lg text-sm font-medium text-white cursor-default"
            style={{ backgroundColor: 'var(--color-brand)' }}
          >
            {backHomeLabel}
          </span>
        ) : (
          <Link
            href="/"
            className="inline-block mt-8 py-3 px-6 rounded-lg text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--color-brand)' }}
          >
            {backHomeLabel}
          </Link>
        )}
      </div>
    </Wrapper>
  )
}
