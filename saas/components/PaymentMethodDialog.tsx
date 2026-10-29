'use client'

import { Dialog } from '@base-ui/react/dialog'
import PaymentMethodChoices from '@/components/PaymentMethodChoices'
import { getCardState, type OrderKind } from '@/components/CardPaymentFor'

/**
 * "How was this paid?" as a small dialog — for the hosts whose old picker was an inline strip of buttons with
 * no room for the open-card-link warning (wine orders in all their views, Abandoned). The menu hosts (the
 * booking page, the bookings list) show the same {@link PaymentMethodChoices} inside their own menu.
 */
export default function PaymentMethodDialog({ kind, id, locale, onRecord, onCard, onClose, onAlreadyPaid }: {
  kind: OrderKind
  id: string
  locale: string
  onRecord: (method: 'BANK_TRANSFER' | 'CASH') => void
  /** Card chosen: the host closes this dialog and opens the popup. */
  onCard: () => void
  onClose: () => void
  onAlreadyPaid: () => void
}) {
  return (
    <Dialog.Root open onOpenChange={o => { if (!o) onClose() }}>
      <Dialog.Portal>
        <Dialog.Backdrop style={{ position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.45)' }} />
        <Dialog.Popup
          aria-label={locale === 'ka' ? 'როგორ გადაიხადა?' : 'How was this paid?'}
          style={{
            position: 'fixed', zIndex: 1001, top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 'min(92vw, 320px)', maxHeight: '92vh', overflowY: 'auto',
            backgroundColor: 'var(--site-surface)', color: 'var(--site-text)',
            border: '1px solid var(--site-border)', borderRadius: 16, padding: 8,
            boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
          }}
        >
          <PaymentMethodChoices
            locale={locale}
            getState={() => getCardState(kind, id)}
            onRecord={onRecord}
            onCard={onCard}
            onCancel={onClose}
            onAlreadyPaid={onAlreadyPaid}
            className="px-3 py-2"
          />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
