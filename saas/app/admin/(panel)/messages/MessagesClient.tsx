'use client'

import { useState, useTransition } from 'react'
import { adminT } from '@/lib/adminT'
import { updateSetting } from '@/app/actions/settings'
import { renderBookingConfirmationEmail } from '@/lib/emails/templates/bookingConfirmationTemplate'
import { renderWineOrderReceiptEmail } from '@/lib/emails/templates/wineOrderReceiptTemplate'
import { renderInvoiceEmail } from '@/lib/emails/templates/invoiceEmailTemplate'
import { renderNewBookingNotificationEmail } from '@/lib/emails/templates/newBookingNotificationTemplate'
import { renderNotifyNewCompanyEmail } from '@/lib/emails/templates/notifyNewCompanyTemplate'
import type { ResolvedTheme } from '@/lib/themePresets'

/**
 * Feature 181 — catalog of every automatic email the site sends. Each
 * template's `render*Email()` is a pure function (no server-only imports —
 * see lib/emails/templates/), so previews here run entirely client-side:
 * typing in a message box re-renders the iframe instantly, no round trip.
 * Saving still goes through the existing `updateSetting()` server action —
 * same one the Settings page's invoice message box already uses.
 */

const C = {
  text: 'var(--site-text)', muted: 'var(--site-muted)', faint: 'var(--site-secondary)',
  border: 'var(--site-border)', bg: 'var(--site-surface)', pageBg: 'var(--site-bg)',
}

type Winery = { name: string; address: string; phone: string; email: string }
type Props = {
  locale: string
  winery: Winery
  theme: ResolvedTheme
  defaults: { booking: string; wineReceipt: string; invoice: string }
}

// Fictitious data for every preview below — never a real booking or customer.
const SAMPLE_DATE = 'Saturday, 12 September 2026'
const SAMPLE_TIME = '14:00'
const SAMPLE_GUEST = { name: 'Ana', surname: 'Beridze', email: 'ana.beridze@example.com', phone: '+995 555 12 34 56' }
const SAMPLE_COMPANY = 'Beridze LLC'

type BookingVariant = 'unpaid' | 'paid' | 'pendingCompany'

function IframePreview({ html }: { html: string }) {
  return (
    <iframe
      srcDoc={`<div style="padding:24px;background:#f4f1ec;">${html}</div>`}
      sandbox=""
      style={{ width: '100%', height: 420, border: 'none', borderRadius: 8, backgroundColor: '#f4f1ec' }}
      title="Email preview"
    />
  )
}

function Badge({ editable, label }: { editable: boolean; label: string }) {
  return (
    <span
      className="text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0"
      style={editable
        ? { backgroundColor: 'rgba(22,163,74,0.12)', color: '#16a34a' }
        : { backgroundColor: 'rgba(107,90,71,0.12)', color: C.faint }}
    >
      {label}
    </span>
  )
}

function Section({
  title, editable, badgeLabel, trigger, open, onToggle, children,
}: {
  title: string
  editable: boolean
  badgeLabel: string
  trigger: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
        style={{ backgroundColor: C.pageBg }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold truncate" style={{ color: C.text }}>{title}</span>
          <Badge editable={editable} label={badgeLabel} />
        </div>
        <span className="text-lg flex-shrink-0" style={{ color: C.faint, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>⌄</span>
      </button>
      {open && (
        <div className="px-5 py-4 border-t" style={{ borderColor: C.border, backgroundColor: C.bg }}>
          <p className="text-xs mb-4" style={{ color: C.faint }}>{trigger}</p>
          {children}
        </div>
      )}
    </div>
  )
}

export default function MessagesClient({ locale, winery, theme, defaults }: Props) {
  const at = (key: string) => adminT(locale, key)

  const [open, setOpen] = useState<Set<string>>(new Set(['booking']))
  const toggle = (id: string) => setOpen(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const [bookingMsg, setBookingMsg] = useState(defaults.booking)
  const [wineMsg, setWineMsg] = useState(defaults.wineReceipt)
  const [invoiceMsg, setInvoiceMsg] = useState(defaults.invoice)
  const [variant, setVariant] = useState<BookingVariant>('unpaid')
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function save(key: string, value: string) {
    startTransition(async () => {
      await updateSetting(key, value)
      setSavedKey(key)
      setTimeout(() => setSavedKey(null), 2000)
    })
  }

  const inputStyle: React.CSSProperties = {
    backgroundColor: C.pageBg, borderColor: C.border, color: C.text,
    border: '1px solid', borderRadius: 8, padding: '8px 12px', fontSize: 14, width: '100%',
  }

  const bookingPreview = renderBookingConfirmationEmail({
    name: SAMPLE_GUEST.name,
    surname: SAMPLE_GUEST.surname,
    date: SAMPLE_DATE,
    timeSlot: SAMPLE_TIME,
    guestCount: 4,
    visitType: 'TASTING_LUNCH',
    totalPrice: 320,
    wineryName: winery.name,
    wineryAddress: winery.address,
    wineryPhone: winery.phone,
    wineryEmail: winery.email,
    theme,
    paid: variant === 'paid',
    pendingNewCompany: variant === 'pendingCompany',
    customMessage: bookingMsg,
  })

  const wineReceiptPreview = renderWineOrderReceiptEmail({
    contactName: `${SAMPLE_GUEST.name} ${SAMPLE_GUEST.surname}`,
    businessName: SAMPLE_COMPANY,
    lines: [
      { name: 'Saperavi', year: 2021, quantity: 6, price: 25 },
      { name: 'Rkatsiteli', year: 2022, quantity: 6, price: 20 },
    ],
    totalAmount: (6 * 25 + 6 * 20) * 0.9,
    discountPercent: 10,
    wineryName: winery.name,
    wineryAddress: winery.address,
    wineryPhone: winery.phone,
    wineryEmail: winery.email,
    theme,
    customMessage: wineMsg,
  })

  const invoicePreview = renderInvoiceEmail({
    name: SAMPLE_GUEST.name,
    surname: SAMPLE_GUEST.surname,
    date: new Date(),
    timeSlot: SAMPLE_TIME,
    visitType: 'TASTING_LUNCH',
    guestCount: 4,
    tastingGuestCount: 2,
    lunchGuestCount: 2,
    freeGuestCount: 0,
    totalPrice: 320,
    companyName: SAMPLE_COMPANY,
    identificationCode: '123456789',
    masterclassLines: [{ name: 'Wine Blending Masterclass', quantity: 2, pricePerUnit: 40 }],
    extras: [],
    payment: {
      recipientName: winery.name || 'Winery LLC',
      personalNumber: '01234567890',
      bankName: 'Bank of Georgia',
      bankCode: 'BAGAGE22',
      iban: 'GE00BG0000000123456789',
    },
    customMessage: invoiceMsg,
    wineryName: winery.name,
    wineryAddress: winery.address,
    theme,
  })

  const newBookingPreview = renderNewBookingNotificationEmail({
    guestName: SAMPLE_GUEST.name,
    guestSurname: SAMPLE_GUEST.surname,
    guestEmail: SAMPLE_GUEST.email,
    guestPhone: SAMPLE_GUEST.phone,
    date: SAMPLE_DATE,
    timeSlot: SAMPLE_TIME,
    guestCount: 4,
    visitType: 'TASTING_LUNCH',
    totalPrice: 320,
    bookingType: 'INDIVIDUAL',
    paid: false,
    requestedCompanyName: null,
  })

  const newCompanyPreview = renderNotifyNewCompanyEmail({
    companyName: SAMPLE_COMPANY,
    contactName: `${SAMPLE_GUEST.name} ${SAMPLE_GUEST.surname}`,
    phone: SAMPLE_GUEST.phone,
    email: SAMPLE_GUEST.email,
    module: 'BOOKING',
  })

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-xl font-semibold mb-1" style={{ color: C.text }}>{at('messages.pageTitle')}</h1>
      <p className="text-sm mb-6" style={{ color: C.faint }}>{at('messages.pageHint')}</p>

      <div className="flex flex-col gap-3">

        <Section
          title={at('messages.booking.title')}
          editable
          badgeLabel={at('messages.editableBadge')}
          trigger={at('messages.booking.trigger')}
          open={open.has('booking')}
          onToggle={() => toggle('booking')}
        >
          <div className="flex gap-2 mb-4">
            {(['unpaid', 'paid', 'pendingCompany'] as BookingVariant[]).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setVariant(v)}
                className="text-xs px-3 py-1.5 rounded-full flex-shrink-0"
                style={variant === v
                  ? { backgroundColor: 'var(--color-brand)', color: '#fff' }
                  : { backgroundColor: C.pageBg, color: C.muted, border: `1px solid ${C.border}` }}
              >
                {at(`messages.booking.variant.${v}`)}
              </button>
            ))}
          </div>
          <label className="text-sm block mb-2" style={{ color: C.muted }}>{at('messages.messageLabel')}</label>
          <div className="flex items-start gap-2 mb-4">
            <textarea
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
              value={bookingMsg}
              placeholder={at('messages.messagePlaceholder')}
              onChange={e => setBookingMsg(e.target.value)}
              onBlur={() => save('booking_email_message', bookingMsg)}
            />
            {savedKey === 'booking_email_message' && (
              <span className="text-xs flex-shrink-0 mt-2" style={{ color: '#16a34a' }}>✓ {at('messages.saved')}</span>
            )}
          </div>
          <p className="text-xs mb-2" style={{ color: C.faint }}>{at('messages.previewNote')}</p>
          <IframePreview html={bookingPreview.html} />
        </Section>

        <Section
          title={at('messages.wineReceipt.title')}
          editable
          badgeLabel={at('messages.editableBadge')}
          trigger={at('messages.wineReceipt.trigger')}
          open={open.has('wineReceipt')}
          onToggle={() => toggle('wineReceipt')}
        >
          <label className="text-sm block mb-2" style={{ color: C.muted }}>{at('messages.messageLabel')}</label>
          <div className="flex items-start gap-2 mb-4">
            <textarea
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
              value={wineMsg}
              placeholder={at('messages.messagePlaceholder')}
              onChange={e => setWineMsg(e.target.value)}
              onBlur={() => save('wine_receipt_email_message', wineMsg)}
            />
            {savedKey === 'wine_receipt_email_message' && (
              <span className="text-xs flex-shrink-0 mt-2" style={{ color: '#16a34a' }}>✓ {at('messages.saved')}</span>
            )}
          </div>
          <IframePreview html={wineReceiptPreview.html} />
        </Section>

        <Section
          title={at('messages.invoice.title')}
          editable
          badgeLabel={at('messages.editableBadge')}
          trigger={at('messages.invoice.trigger')}
          open={open.has('invoice')}
          onToggle={() => toggle('invoice')}
        >
          <label className="text-sm block mb-2" style={{ color: C.muted }}>{at('messages.messageLabel')}</label>
          <div className="flex items-start gap-2 mb-4">
            <textarea
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
              value={invoiceMsg}
              placeholder={at('messages.messagePlaceholder')}
              onChange={e => setInvoiceMsg(e.target.value)}
              onBlur={() => save('invoice_email_message', invoiceMsg)}
            />
            {savedKey === 'invoice_email_message' && (
              <span className="text-xs flex-shrink-0 mt-2" style={{ color: '#16a34a' }}>✓ {at('messages.saved')}</span>
            )}
          </div>
          <IframePreview html={invoicePreview.html} />
        </Section>

        <Section
          title={at('messages.newBooking.title')}
          editable={false}
          badgeLabel={at('messages.fixedBadge')}
          trigger={at('messages.newBooking.trigger')}
          open={open.has('newBooking')}
          onToggle={() => toggle('newBooking')}
        >
          <IframePreview html={newBookingPreview.html} />
        </Section>

        <Section
          title={at('messages.newCompany.title')}
          editable={false}
          badgeLabel={at('messages.fixedBadge')}
          trigger={at('messages.newCompany.trigger')}
          open={open.has('newCompany')}
          onToggle={() => toggle('newCompany')}
        >
          <IframePreview html={newCompanyPreview.html} />
        </Section>

      </div>
    </div>
  )
}
