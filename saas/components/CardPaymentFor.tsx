'use client'

import { useRef } from 'react'
import dynamic from 'next/dynamic'
import {
  startOrderCardPayment, getOrderCardState, sendOrderTopUpCheckoutEmail,
} from '@/app/actions/orders'
import { startWineOrderCardPayment, getWineOrderCardState } from '@/app/actions/wineOrders'
import type { CardState } from '@/components/PaymentMethodChoices'

const CardPaymentPopup = dynamic(() => import('@/components/CardPaymentPopup'), { ssr: false })

/**
 * The Card popup wired to one order (T-318 Chunks 5–6): which server actions start the link, ask "paid yet?"
 * and (bookings only) e-mail it. Every place an admin takes money renders THIS, so the booking page, the list,
 * Abandoned and the wine orders cannot drift apart.
 */
export type OrderKind = 'booking' | 'wine'

/** "Is it Paid yet, and is a card link still open?" — read-only. */
export function getCardState(kind: OrderKind, id: string): Promise<CardState | { error: string }> {
  return kind === 'wine' ? getWineOrderCardState(id) : getOrderCardState(id)
}

export default function CardPaymentFor({ kind, id, locale, onPaid, onClose, onLink }: {
  kind: OrderKind
  id: string
  locale: string
  /** The payment was confirmed (the order is Paid now). Gets the amount (tetri) of the link that was paid. */
  onPaid: (amountTetri: number) => void
  onClose: () => void
  /** A link was made / re-opened: lets the host show its "card link open" mark. */
  onLink?: (link: { amount: number; expiresAt: string }) => void
}) {
  // One request at a time: a second call while the first is in flight (React's development double-mount, a
  // double click) shares its answer instead of asking again and getting "already open" back.
  const inflight = useRef<ReturnType<typeof startOrderCardPayment> | ReturnType<typeof startWineOrderCardPayment> | null>(null)

  return (
    <CardPaymentPopup
      locale={locale}
      subject={kind}
      start={() => {
        if (!inflight.current) {
          const p = kind === 'wine' ? startWineOrderCardPayment(id) : startOrderCardPayment(id)
          inflight.current = p
          p.then(r => {
            if ('success' in r) onLink?.({ amount: r.amount, expiresAt: r.expiresAt })
            // A refusal / error must not be replayed to an immediate "Make a new link": forget it now.
            else inflight.current = null
          }, () => { inflight.current = null })
            .finally(() => { setTimeout(() => { inflight.current = null }, 1500) })
            .catch(() => {})
        }
        return inflight.current
      }}
      isPaid={async () => { const s = await getCardState(kind, id); return !('error' in s) && s.paid }}
      sendEmail={kind === 'booking' ? paymentId => sendOrderTopUpCheckoutEmail(id, paymentId, locale === 'ka' ? 'ka' : 'en') : undefined}
      onPaid={onPaid}
      onClose={onClose}
    />
  )
}
