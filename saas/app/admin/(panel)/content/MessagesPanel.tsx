'use client'

import { useState, useTransition } from 'react'
import { adminT } from '@/lib/adminT'
import { saveContent } from '@/app/actions/siteContent'
import {
  renderBookingConfirmationEmail,
  DEFAULT_BOOKING_INTRO_UNPAID, DEFAULT_BOOKING_INTRO_UNPAID_KA,
  DEFAULT_BOOKING_INTRO_PAID, DEFAULT_BOOKING_INTRO_PAID_KA,
  DEFAULT_BOOKING_INTRO_PENDING_COMPANY, DEFAULT_BOOKING_INTRO_PENDING_COMPANY_KA,
} from '@/lib/emails/templates/bookingConfirmationTemplate'
import {
  renderWineOrderReceiptEmail,
  DEFAULT_WINE_RECEIPT_INTRO, DEFAULT_WINE_RECEIPT_INTRO_KA,
} from '@/lib/emails/templates/wineOrderReceiptTemplate'
import {
  renderInvoiceEmail,
  DEFAULT_INVOICE_MESSAGE_EN, DEFAULT_INVOICE_MESSAGE_KA,
} from '@/lib/emails/templates/invoiceEmailTemplate'
import { renderNewBookingNotificationEmail } from '@/lib/emails/templates/newBookingNotificationTemplate'
import { renderNotifyNewCompanyEmail } from '@/lib/emails/templates/notifyNewCompanyTemplate'
import { formatLongDate } from '@/lib/emails/templates/dateFormat'
import type { ResolvedTheme } from '@/lib/themePresets'

/**
 * "Messages" tab of the Content page (Feature 181, folded in from the
 * standalone /admin/messages page on 2026-09-14 specifically so these
 * strings could ride the same EN/KA toggle every other Content tab already
 * has). Persistence is `SiteContent` (section 'messages'), not `Setting` —
 * that's what makes the locale split possible at all; see
 * MaintenanceNotes.md on why booking/wine-receipt/invoice each resolve
 * their SEND-time locale differently even though they're all edited here.
 *
 * Preview rendering stays exactly as it was on the standalone page: each
 * template's `render*Email()` is a pure function with no server-only
 * imports, called directly in the browser so typing updates the iframe
 * instantly, no round trip.
 */

const C = {
  text: 'var(--site-text)', muted: 'var(--site-muted)', faint: 'var(--site-secondary)',
  border: 'var(--site-border)', bg: 'var(--site-surface)', pageBg: 'var(--site-bg)',
}

type Winery = { name: string; address: string; phone: string; email: string }
type Props = {
  c: Record<string, string>
  locale: 'en' | 'ka'
  adminLocale: string
  winery: Winery
  theme: ResolvedTheme
}

// Fictitious data for every preview below — never a real booking or customer.
const SAMPLE_DATE_RAW = new Date(2026, 8, 12) // Saturday, 12 September 2026
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

const BOOKING_KEY_BY_VARIANT: Record<BookingVariant, string> = {
  unpaid: 'email_booking_intro_unpaid',
  paid: 'email_booking_intro_paid',
  pendingCompany: 'email_booking_intro_pending_company',
}

function bookingDefault(variant: BookingVariant, locale: 'en' | 'ka'): string {
  if (variant === 'unpaid') return locale === 'ka' ? DEFAULT_BOOKING_INTRO_UNPAID_KA : DEFAULT_BOOKING_INTRO_UNPAID
  if (variant === 'paid') return locale === 'ka' ? DEFAULT_BOOKING_INTRO_PAID_KA : DEFAULT_BOOKING_INTRO_PAID
  return locale === 'ka' ? DEFAULT_BOOKING_INTRO_PENDING_COMPANY_KA : DEFAULT_BOOKING_INTRO_PENDING_COMPANY
}

export default function MessagesPanel({ c, locale, adminLocale, winery, theme }: Props) {
  const at = (key: string) => adminT(adminLocale, key)

  const [open, setOpen] = useState<Set<string>>(new Set(['booking']))
  const toggle = (id: string) => setOpen(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const [variant, setVariant] = useState<BookingVariant>('unpaid')
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // Local drafts, keyed by SiteContent key, seeded from `c` (the currently
  // selected locale's map) with the matching default when no row exists yet.
  const [drafts, setDrafts] = useState<Record<string, string>>({
    email_booking_intro_unpaid: c.email_booking_intro_unpaid ?? bookingDefault('unpaid', locale),
    email_booking_intro_paid: c.email_booking_intro_paid ?? bookingDefault('paid', locale),
    email_booking_intro_pending_company: c.email_booking_intro_pending_company ?? bookingDefault('pendingCompany', locale),
    email_wine_receipt_intro: c.email_wine_receipt_intro ?? (locale === 'ka' ? DEFAULT_WINE_RECEIPT_INTRO_KA : DEFAULT_WINE_RECEIPT_INTRO),
    email_invoice_message: c.email_invoice_message ?? (locale === 'ka' ? DEFAULT_INVOICE_MESSAGE_KA : DEFAULT_INVOICE_MESSAGE_EN),
  })

  function setDraft(key: string, value: string) {
    setDrafts(prev => ({ ...prev, [key]: value }))
  }

  function save(key: string, label: string, value: string) {
    startTransition(async () => {
      await saveContent(key, value, 'messages', label, locale)
      setSavedKey(key)
      setTimeout(() => setSavedKey(null), 2000)
    })
  }

  const inputStyle: React.CSSProperties = {
    backgroundColor: C.pageBg, borderColor: C.border, color: C.text,
    border: '1px solid', borderRadius: 8, padding: '8px 12px', fontSize: 14, width: '100%',
  }

  const bookingKey = BOOKING_KEY_BY_VARIANT[variant]
  const bookingValue = drafts[bookingKey]
  const sampleDate = formatLongDate(SAMPLE_DATE_RAW, locale)

  const bookingPreview = renderBookingConfirmationEmail({
    name: SAMPLE_GUEST.name,
    surname: SAMPLE_GUEST.surname,
    date: sampleDate,
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
    introText: bookingValue,
    locale,
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
    introText: drafts.email_wine_receipt_intro,
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
    customMessage: drafts.email_invoice_message,
    wineryName: winery.name,
    wineryAddress: winery.address,
    theme,
    locale,
  })

  const newBookingPreview = renderNewBookingNotificationEmail({
    guestName: SAMPLE_GUEST.name,
    guestSurname: SAMPLE_GUEST.surname,
    guestEmail: SAMPLE_GUEST.email,
    guestPhone: SAMPLE_GUEST.phone,
    date: sampleDate,
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
    <div className="max-w-3xl">
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
          <div className="flex items-start gap-2 mb-1">
            <textarea
              rows={5}
              style={{ ...inputStyle, resize: 'vertical' }}
              value={bookingValue}
              onChange={e => setDraft(bookingKey, e.target.value)}
              onBlur={() => save(bookingKey, `Booking confirmation intro (${variant})`, bookingValue)}
            />
            {savedKey === bookingKey && (
              <span className="text-xs flex-shrink-0 mt-2" style={{ color: '#16a34a' }}>✓ {at('messages.saved')}</span>
            )}
          </div>
          <p className="text-xs mb-4" style={{ color: C.faint }}>{at('messages.tokenHint')}</p>
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
          <div className="flex items-start gap-2 mb-1">
            <textarea
              rows={5}
              style={{ ...inputStyle, resize: 'vertical' }}
              value={drafts.email_wine_receipt_intro}
              onChange={e => setDraft('email_wine_receipt_intro', e.target.value)}
              onBlur={() => save('email_wine_receipt_intro', 'Wine order receipt intro', drafts.email_wine_receipt_intro)}
            />
            {savedKey === 'email_wine_receipt_intro' && (
              <span className="text-xs flex-shrink-0 mt-2" style={{ color: '#16a34a' }}>✓ {at('messages.saved')}</span>
            )}
          </div>
          <p className="text-xs mb-4" style={{ color: C.faint }}>{at('messages.tokenHint')}</p>
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
              value={drafts.email_invoice_message}
              placeholder={at('messages.messagePlaceholder')}
              onChange={e => setDraft('email_invoice_message', e.target.value)}
              onBlur={() => save('email_invoice_message', 'Invoice email message', drafts.email_invoice_message)}
            />
            {savedKey === 'email_invoice_message' && (
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
