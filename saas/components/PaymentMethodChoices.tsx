'use client'

import { useEffect, useRef, useState } from 'react'
import { adminT } from '@/lib/adminT'
import { asTetri, formatTetri } from '@/lib/money'
import { formatLinkMoment } from '@/lib/formatLinkMoment'

/**
 * "How was this paid?" — Bank transfer · Cash · Card (T-318 Chunks 5–6, mockup boards 1, 2, 8).
 *
 * The ONE copy of this picker for every place an admin takes money (booking order page, bookings list,
 * the dialog that wine orders and Abandoned open). Bank and Cash record money that has ALREADY arrived;
 * Card is different — it asks the guest to pay — so it is outlined and says what happens (option B).
 *
 * Before recording Bank / Cash it asks the server whether a card link for the order is still open: the guest
 * could still pay it and be charged twice, and a link cannot be cancelled. If so it warns first
 * ("Record cash anyway"; "Card" reopens the SAME link). If the order was paid in the meantime it says so
 * instead of recording a second payment.
 */
export type CardState = { paid: boolean; openLink: { amount: number; expiresAt: string } | null }

type Method = 'BANK_TRANSFER' | 'CASH'

const WINE = 'var(--color-brand)'
const MUTED = 'var(--site-muted)'

export default function PaymentMethodChoices({ locale, getState, onRecord, onCard, onCancel, onAlreadyPaid, onOpenLink, className }: {
  locale: string
  /** Server read: is it Paid yet, and is a card link still open? */
  getState: () => Promise<CardState | { error: string }>
  /** Record money that has already arrived. */
  onRecord: (method: Method) => void
  /** Open the Card popup. */
  onCard: () => void
  onCancel: () => void
  /** The order turned out to be paid already — nothing to record. */
  onAlreadyPaid: () => void
  /** Told whatever the check found, so the host can show its "link open" mark. */
  onOpenLink?: (link: CardState['openLink']) => void
  className?: string
}) {
  const at = (key: string, vars?: Record<string, string | number>) => adminT(locale, key, vars)
  const [checking, setChecking] = useState(false)
  const [checkError, setCheckError] = useState(false)
  // False once this picker is gone (cancelled, menu closed): a slow answer must not record money after that.
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])
  const [warn, setWarn] = useState<{ method: Method; link: NonNullable<CardState['openLink']> } | null>(null)

  async function choose(method: Method) {
    setChecking(true)
    setCheckError(false)
    let state: Awaited<ReturnType<typeof getState>> | null = null
    try { state = await getState() } catch { state = null }
    if (!active.current) return
    setChecking(false)
    // Fail closed: if the open-link check itself failed we do NOT record — that check is what prevents a
    // double charge. The admin sees why and can simply try again.
    if (!state || 'error' in state) { setCheckError(true); return }
    onOpenLink?.(state.openLink)
    if (state.paid) { onAlreadyPaid(); return }
    if (state.openLink) { setWarn({ method, link: state.openLink }); return }
    onRecord(method)
  }

  const green = { backgroundColor: '#16a34a', minHeight: 40 } as const

  return (
    <div className={className ?? 'px-3 py-2'} style={{ minWidth: 220, maxWidth: 'min(86vw, 300px)' }}>
      <p className="text-xs mb-1.5" style={{ color: MUTED }}>{at('paymentMethod.howPaid')}</p>
      {checkError && !warn && (
        <p role="alert" className="text-xs rounded-md px-2 py-1.5 mb-1.5" style={{ backgroundColor: '#fdecea', border: '1px solid #f0b4ae', color: '#8a1c16' }}>{at('paymentMethod.checkFailed')}</p>
      )}
      {warn ? (
        <div className="flex flex-col gap-1.5">
          <p role="alert" className="text-xs rounded-md px-2 py-1.5" style={{ backgroundColor: '#fdf3dc', border: '1px solid #e8c777', color: '#5c3d05' }}>
            {at('paymentMethod.linkOpenWarn', { amount: formatTetri(asTetri(warn.link.amount)), date: formatLinkMoment(warn.link.expiresAt, locale) })}
          </p>
          <button onClick={() => onRecord(warn.method)} className="text-left text-xs px-2 rounded font-medium text-white" style={green}>
            {at(warn.method === 'CASH' ? 'paymentMethod.anywayCash' : 'paymentMethod.anywayBank')}
          </button>
          <button onClick={onCard} className="text-left text-xs px-2 rounded font-semibold" style={{ border: `1.5px solid ${WINE}`, color: WINE, minHeight: 40 }}>
            {at('paymentMethod.card')}
            <span className="block font-normal" style={{ color: MUTED, fontSize: 11 }}>{at('paymentMethod.cardOpenHint')}</span>
          </button>
          <button onClick={() => setWarn(null)} className="text-left text-xs px-2" style={{ color: MUTED, minHeight: 40 }}>
            {at('paymentMethod.back')}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <button onClick={() => void choose('BANK_TRANSFER')} disabled={checking}
            className="text-left text-xs px-2 py-1 rounded font-medium text-white disabled:opacity-60" style={green}>
            {at('paymentMethod.bankTransfer')}
          </button>
          <button onClick={() => void choose('CASH')} disabled={checking}
            className="text-left text-xs px-2 py-1 rounded font-medium text-white disabled:opacity-60" style={green}>
            {at('paymentMethod.cash')}
          </button>
          {/* Card ASKS the guest to pay (the order turns Paid only when Flitt confirms), so it is outlined and
              says what happens — mockup option B. */}
          <button onClick={onCard} disabled={checking}
            className="text-left text-xs px-2 py-1 rounded font-semibold disabled:opacity-60" style={{ border: `1.5px solid ${WINE}`, color: WINE, minHeight: 40 }}>
            {at('paymentMethod.card')}
            <span className="block font-normal" style={{ color: MUTED, fontSize: 11 }}>{at('paymentMethod.cardHint')}</span>
          </button>
          <button onClick={onCancel} className="text-left text-xs px-2" style={{ color: MUTED, minHeight: 40 }}>
            {at('paymentMethod.cancel')}
          </button>
        </div>
      )}
    </div>
  )
}
