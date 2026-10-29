import { adminT } from '@/lib/adminT'
import { asTetri, formatTetri } from '@/lib/money'

/**
 * Amber notice: card money is sitting on a CANCELLED order (T-318 Q-2, mockup board 5).
 *
 * Worked out from the payments, not from a stored flag, so it also covers old orders and any
 * order whose link was paid after it was cancelled. Shown on the order page and the wine card
 * only — deliberately not in the lists. The money is on the ledger; this tells a human it may
 * have to be refunded in Flitt (refunds are not built into the app).
 */
export function CardMoneyOnCancelledNotice({ amount, subject, locale, className }: {
  /** Live card money in tetri. Renders nothing when it is 0. */
  amount: number
  subject: 'booking' | 'wine'
  locale: string
  className?: string
}) {
  if (!(amount > 0)) return null
  const text = adminT(locale, subject === 'wine' ? 'cardOnCancelled.wine' : 'cardOnCancelled.booking')
  const [before, after] = text.split('{amount}')
  return (
    <div
      role="note"
      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] leading-snug ${className ?? ''}`}
      style={{ backgroundColor: '#fdf3dc', borderColor: '#e8c777', color: '#5c3d05' }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 shrink-0">
        <path d="M12 3 2 21h20L12 3z" /><path d="M12 10v5M12 18h.01" />
      </svg>
      <span>{before}<b>{formatTetri(asTetri(amount))}</b>{after}</span>
    </div>
  )
}
