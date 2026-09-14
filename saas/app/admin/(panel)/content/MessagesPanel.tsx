'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
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
import { t } from '@/lib/t'
import PaymentResultView, { type PaymentResultKind } from '@/components/PaymentResultView'
import NewCompanyPopupView, { type NewCompanyPopupStatus } from '@/components/NewCompanyPopupView'
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
type NewCompanyVariant = 'withBooking' | 'noBooking' | 'sent' | 'error'

// Maps the admin's 4-way preview pill to the two independent props the real
// popup takes (BookingForm.tsx's `newCompanyIncludesBooking` state and
// `newCoStatus` state) — see NewCompanyPopupView.tsx's header for why those
// stay separate props instead of being collapsed into this enum.
const NEW_COMPANY_PREVIEW: Record<NewCompanyVariant, { includesBooking: boolean; status: NewCompanyPopupStatus }> = {
  withBooking: { includesBooking: true, status: 'idle' },
  noBooking: { includesBooking: false, status: 'idle' },
  sent: { includesBooking: false, status: 'sent' },
  error: { includesBooking: false, status: 'error' },
}

function IframePreview({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(420)

  const measure = () => {
    const doc = ref.current?.contentDocument
    if (doc) setHeight(doc.documentElement.scrollHeight)
  }

  useEffect(measure, [html])

  return (
    <iframe
      ref={ref}
      srcDoc={`<div style="padding:24px;background:#f4f1ec;">${html}</div>`}
      sandbox="allow-same-origin"
      onLoad={measure}
      style={{ width: '100%', height, border: 'none', borderRadius: 8, backgroundColor: '#f4f1ec' }}
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

// Shared editable-field renderer for the small, plain (non-email) On-Site
// Messages fields — a single label + input/textarea + save-on-blur, no
// preview. Avoids repeating the boilerplate per field (used 6x for the New
// Company popup below). Top-level, not nested in MessagesPanel — a component
// defined inside another component's body is a new type every render, which
// would remount this (and drop input focus) on every keystroke.
function EditField({
  label, draftKey, multiline, inputStyle, savedKey, savedLabel, setDraft, save, drafts,
}: {
  label: string
  draftKey: string
  multiline?: boolean
  inputStyle: React.CSSProperties
  savedKey: string | null
  savedLabel: string
  setDraft: (key: string, value: string) => void
  save: (key: string, label: string, value: string) => void
  drafts: Record<string, string>
}) {
  const value = drafts[draftKey]
  return (
    <div className="mb-4">
      <label className="text-sm block mb-2" style={{ color: C.muted }}>{label}</label>
      <div className="flex items-start gap-2">
        {multiline ? (
          <textarea
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
            value={value}
            onChange={e => setDraft(draftKey, e.target.value)}
            onBlur={() => save(draftKey, label, value)}
          />
        ) : (
          <input
            type="text"
            style={inputStyle}
            value={value}
            onChange={e => setDraft(draftKey, e.target.value)}
            onBlur={() => save(draftKey, label, value)}
          />
        )}
        {savedKey === draftKey && (
          <span className="text-xs flex-shrink-0 mt-2" style={{ color: '#16a34a' }}>✓ {savedLabel}</span>
        )}
      </div>
    </div>
  )
}

export default function MessagesPanel({ c, locale, adminLocale, winery, theme }: Props) {
  const at = (key: string) => adminT(adminLocale, key)

  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setOpen(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const [variant, setVariant] = useState<BookingVariant>('unpaid')
  const [paymentVariant, setPaymentVariant] = useState<PaymentResultKind>('success')
  const [newCompanyVariant, setNewCompanyVariant] = useState<NewCompanyVariant>('withBooking')
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
    onsite_pending_company_note: c.onsite_pending_company_note ?? t(locale, 'form.onsite_pending_company_note'),
    onsite_new_company_title: c.onsite_new_company_title ?? t(locale, 'form.new_company_title'),
    onsite_new_company_body_with_booking: c.onsite_new_company_body_with_booking ?? t(locale, 'form.new_company_body_with_booking'),
    onsite_new_company_body_no_booking: c.onsite_new_company_body_no_booking ?? t(locale, 'form.new_company_body_no_booking'),
    onsite_new_company_success_title: c.onsite_new_company_success_title ?? t(locale, 'form.new_company_success_title'),
    onsite_new_company_success_body: c.onsite_new_company_success_body ?? t(locale, 'form.new_company_success_body'),
    onsite_new_company_error: c.onsite_new_company_error ?? t(locale, 'form.new_company_error'),
    onsite_payment_success_heading: c.onsite_payment_success_heading ?? t(locale, 'payment.success_heading'),
    onsite_payment_success_body: c.onsite_payment_success_body ?? t(locale, 'payment.success_body'),
    onsite_payment_failed_heading: c.onsite_payment_failed_heading ?? t(locale, 'payment.failed_heading'),
    onsite_payment_failed_body: c.onsite_payment_failed_body ?? t(locale, 'payment.failed_body'),
    onsite_payment_pending_heading: c.onsite_payment_pending_heading ?? t(locale, 'payment.pending_heading'),
    onsite_payment_pending_body: c.onsite_payment_pending_body ?? t(locale, 'payment.pending_body'),
    onsite_access_code_title: c.onsite_access_code_title ?? t(locale, 'form.access_code_title'),
    onsite_access_code_intro: c.onsite_access_code_intro ?? t(locale, 'form.access_code_intro'),
    onsite_access_code_error: c.onsite_access_code_error ?? t(locale, 'form.access_code_error'),
    onsite_access_code_direct_not_recognised: c.onsite_access_code_direct_not_recognised ?? t(locale, 'form.access_code_direct_not_recognised'),
    onsite_err_select_date: c.onsite_err_select_date ?? t(locale, 'form.err_select_date'),
    onsite_err_future_date: c.onsite_err_future_date ?? t(locale, 'form.err_future_date'),
    onsite_err_contact: c.onsite_err_contact ?? t(locale, 'form.err_contact'),
    onsite_err_blocked: c.onsite_err_blocked ?? t(locale, 'form.err_blocked'),
    onsite_err_day_closed: c.onsite_err_day_closed ?? t(locale, 'form.err_day_closed'),
    onsite_err_working_hours: c.onsite_err_working_hours ?? t(locale, 'form.err_working_hours'),
    onsite_err_lead_time: c.onsite_err_lead_time ?? t(locale, 'form.err_lead_time'),
    onsite_err_min_guests: c.onsite_err_min_guests ?? t(locale, 'form.err_min_guests'),
    onsite_no_rate_detail: c.onsite_no_rate_detail ?? t(locale, 'form.no_rate_detail'),
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

        <h3 className="text-xs font-semibold uppercase tracking-wider mt-1" style={{ color: C.faint }}>
          {at('messages.group.emails')}
        </h3>

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

        <h3 className="text-xs font-semibold uppercase tracking-wider mt-3" style={{ color: C.faint }}>
          {at('messages.group.onsite')}
        </h3>

        <Section
          title={at('messages.onsitePendingCompany.title')}
          editable
          badgeLabel={at('messages.editableBadge')}
          trigger={at('messages.onsitePendingCompany.trigger')}
          open={open.has('onsitePendingCompany')}
          onToggle={() => toggle('onsitePendingCompany')}
        >
          <label className="text-sm block mb-2" style={{ color: C.muted }}>{at('messages.messageLabel')}</label>
          <div className="flex items-start gap-2">
            <textarea
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
              value={drafts.onsite_pending_company_note}
              onChange={e => setDraft('onsite_pending_company_note', e.target.value)}
              onBlur={() => save('onsite_pending_company_note', 'On-site: pending company note', drafts.onsite_pending_company_note)}
            />
            {savedKey === 'onsite_pending_company_note' && (
              <span className="text-xs flex-shrink-0 mt-2" style={{ color: '#16a34a' }}>✓ {at('messages.saved')}</span>
            )}
          </div>
        </Section>

        <Section
          title={at('messages.onsiteNewCompany.title')}
          editable
          badgeLabel={at('messages.editableBadge')}
          trigger={at('messages.onsiteNewCompany.trigger')}
          open={open.has('onsiteNewCompany')}
          onToggle={() => toggle('onsiteNewCompany')}
        >
          <EditField label={at('messages.onsiteNewCompany.titleField')} draftKey="onsite_new_company_title"
            inputStyle={inputStyle} savedKey={savedKey} savedLabel={at('messages.saved')} setDraft={setDraft} save={save} drafts={drafts} />

          <div className="flex gap-2 mb-4">
            {(['withBooking', 'noBooking', 'sent', 'error'] as NewCompanyVariant[]).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setNewCompanyVariant(v)}
                className="text-xs px-3 py-1.5 rounded-full flex-shrink-0"
                style={newCompanyVariant === v
                  ? { backgroundColor: 'var(--color-brand)', color: '#fff' }
                  : { backgroundColor: C.pageBg, color: C.muted, border: `1px solid ${C.border}` }}
              >
                {at(`messages.onsiteNewCompany.variant.${v}`)}
              </button>
            ))}
          </div>

          {newCompanyVariant === 'withBooking' && (
            <EditField label={at('messages.onsiteNewCompany.bodyWithBooking')} draftKey="onsite_new_company_body_with_booking" multiline
              inputStyle={inputStyle} savedKey={savedKey} savedLabel={at('messages.saved')} setDraft={setDraft} save={save} drafts={drafts} />
          )}
          {newCompanyVariant === 'noBooking' && (
            <EditField label={at('messages.onsiteNewCompany.bodyNoBooking')} draftKey="onsite_new_company_body_no_booking" multiline
              inputStyle={inputStyle} savedKey={savedKey} savedLabel={at('messages.saved')} setDraft={setDraft} save={save} drafts={drafts} />
          )}
          {newCompanyVariant === 'sent' && (
            <>
              <EditField label={at('messages.onsiteNewCompany.successTitle')} draftKey="onsite_new_company_success_title"
                inputStyle={inputStyle} savedKey={savedKey} savedLabel={at('messages.saved')} setDraft={setDraft} save={save} drafts={drafts} />
              <EditField label={at('messages.onsiteNewCompany.successBody')} draftKey="onsite_new_company_success_body"
                inputStyle={inputStyle} savedKey={savedKey} savedLabel={at('messages.saved')} setDraft={setDraft} save={save} drafts={drafts} />
            </>
          )}
          {newCompanyVariant === 'error' && (
            <EditField label={at('messages.onsiteNewCompany.errorText')} draftKey="onsite_new_company_error"
              inputStyle={inputStyle} savedKey={savedKey} savedLabel={at('messages.saved')} setDraft={setDraft} save={save} drafts={drafts} />
          )}

          <p className="text-xs mb-2" style={{ color: C.faint }}>{at('messages.previewLabel')}</p>
          <div className="rounded-lg overflow-hidden" style={{ backgroundColor: '#f4f1ec' }}>
            <NewCompanyPopupView
              includesBooking={NEW_COMPANY_PREVIEW[newCompanyVariant].includesBooking}
              status={NEW_COMPANY_PREVIEW[newCompanyVariant].status}
              title={drafts.onsite_new_company_title}
              bodyWithBooking={drafts.onsite_new_company_body_with_booking}
              bodyNoBooking={drafts.onsite_new_company_body_no_booking}
              successTitle={drafts.onsite_new_company_success_title}
              successBody={drafts.onsite_new_company_success_body}
              errorMessage={drafts.onsite_new_company_error}
              name={SAMPLE_GUEST.name}
              contact={`${SAMPLE_GUEST.name} ${SAMPLE_GUEST.surname}`}
              phone={SAMPLE_GUEST.phone}
              email={SAMPLE_GUEST.email}
              labels={{
                namePlaceholder: t(locale, 'form.new_company_name_placeholder'),
                contactPlaceholder: t(locale, 'form.new_company_contact_placeholder'),
                phonePlaceholder: t(locale, 'form.new_company_phone_placeholder'),
                emailPlaceholder: t(locale, 'form.new_company_email_placeholder'),
                sending: t(locale, 'form.new_company_sending'),
                sendWithBooking: t(locale, 'form.new_company_send_with_booking'),
                sendRequest: t(locale, 'form.new_company_send_request'),
                cancel: t(locale, 'form.new_company_cancel'),
                close: t(locale, 'form.new_company_close'),
              }}
              preview
            />
          </div>
        </Section>

        <Section
          title={at('messages.onsitePayment.title')}
          editable
          badgeLabel={at('messages.editableBadge')}
          trigger={at('messages.onsitePayment.trigger')}
          open={open.has('onsitePayment')}
          onToggle={() => toggle('onsitePayment')}
        >
          <div className="flex gap-2 mb-4">
            {(['success', 'failed', 'pending'] as PaymentResultKind[]).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setPaymentVariant(v)}
                className="text-xs px-3 py-1.5 rounded-full flex-shrink-0"
                style={paymentVariant === v
                  ? { backgroundColor: 'var(--color-brand)', color: '#fff' }
                  : { backgroundColor: C.pageBg, color: C.muted, border: `1px solid ${C.border}` }}
              >
                {at(`messages.onsitePayment.variant.${v}`)}
              </button>
            ))}
          </div>
          <EditField label={at('messages.onsitePayment.headingLabel')} draftKey={`onsite_payment_${paymentVariant}_heading`}
            inputStyle={inputStyle} savedKey={savedKey} savedLabel={at('messages.saved')} setDraft={setDraft} save={save} drafts={drafts} />
          <EditField label={at('messages.onsitePayment.bodyLabel')} draftKey={`onsite_payment_${paymentVariant}_body`} multiline
            inputStyle={inputStyle} savedKey={savedKey} savedLabel={at('messages.saved')} setDraft={setDraft} save={save} drafts={drafts} />
          <p className="text-xs mb-2" style={{ color: C.faint }}>{at('messages.previewLabel')}</p>
          <div className="rounded-lg overflow-hidden" style={{ backgroundColor: '#f4f1ec' }}>
            <PaymentResultView
              kind={paymentVariant}
              heading={drafts[`onsite_payment_${paymentVariant}_heading`]}
              body={drafts[`onsite_payment_${paymentVariant}_body`]}
              contactPhone={paymentVariant === 'success' ? undefined : (winery.phone || '+995 555 00 00 00')}
              backHomeLabel={t(locale, 'payment.back_home')}
              preview
            />
          </div>
        </Section>

        <Section
          title={at('messages.onsiteAccessCode.title')}
          editable
          badgeLabel={at('messages.editableBadge')}
          trigger={at('messages.onsiteAccessCode.trigger')}
          open={open.has('onsiteAccessCode')}
          onToggle={() => toggle('onsiteAccessCode')}
        >
          <EditField label={at('messages.onsiteAccessCode.titleField')} draftKey="onsite_access_code_title"
            inputStyle={inputStyle} savedKey={savedKey} savedLabel={at('messages.saved')} setDraft={setDraft} save={save} drafts={drafts} />
          <EditField label={at('messages.onsiteAccessCode.intro')} draftKey="onsite_access_code_intro"
            inputStyle={inputStyle} savedKey={savedKey} savedLabel={at('messages.saved')} setDraft={setDraft} save={save} drafts={drafts} />
          <EditField label={at('messages.onsiteAccessCode.error')} draftKey="onsite_access_code_error"
            inputStyle={inputStyle} savedKey={savedKey} savedLabel={at('messages.saved')} setDraft={setDraft} save={save} drafts={drafts} />
          <EditField label={at('messages.onsiteAccessCode.directNotRecognised')} draftKey="onsite_access_code_direct_not_recognised"
            inputStyle={inputStyle} savedKey={savedKey} savedLabel={at('messages.saved')} setDraft={setDraft} save={save} drafts={drafts} />
        </Section>

        <Section
          title={at('messages.onsiteErrors.title')}
          editable
          badgeLabel={at('messages.editableBadge')}
          trigger={at('messages.onsiteErrors.trigger')}
          open={open.has('onsiteErrors')}
          onToggle={() => toggle('onsiteErrors')}
        >
          <EditField label={at('messages.onsiteErrors.selectDate')} draftKey="onsite_err_select_date"
            inputStyle={inputStyle} savedKey={savedKey} savedLabel={at('messages.saved')} setDraft={setDraft} save={save} drafts={drafts} />
          <EditField label={at('messages.onsiteErrors.futureDate')} draftKey="onsite_err_future_date"
            inputStyle={inputStyle} savedKey={savedKey} savedLabel={at('messages.saved')} setDraft={setDraft} save={save} drafts={drafts} />
          <EditField label={at('messages.onsiteErrors.contact')} draftKey="onsite_err_contact"
            inputStyle={inputStyle} savedKey={savedKey} savedLabel={at('messages.saved')} setDraft={setDraft} save={save} drafts={drafts} />
          <EditField label={at('messages.onsiteErrors.blocked')} draftKey="onsite_err_blocked"
            inputStyle={inputStyle} savedKey={savedKey} savedLabel={at('messages.saved')} setDraft={setDraft} save={save} drafts={drafts} />
          <EditField label={at('messages.onsiteErrors.dayClosed')} draftKey="onsite_err_day_closed"
            inputStyle={inputStyle} savedKey={savedKey} savedLabel={at('messages.saved')} setDraft={setDraft} save={save} drafts={drafts} />
          <EditField label={at('messages.onsiteErrors.workingHours')} draftKey="onsite_err_working_hours"
            inputStyle={inputStyle} savedKey={savedKey} savedLabel={at('messages.saved')} setDraft={setDraft} save={save} drafts={drafts} />
          <EditField label={at('messages.onsiteErrors.leadTime')} draftKey="onsite_err_lead_time"
            inputStyle={inputStyle} savedKey={savedKey} savedLabel={at('messages.saved')} setDraft={setDraft} save={save} drafts={drafts} />
          <EditField label={at('messages.onsiteErrors.minGuests')} draftKey="onsite_err_min_guests"
            inputStyle={inputStyle} savedKey={savedKey} savedLabel={at('messages.saved')} setDraft={setDraft} save={save} drafts={drafts} />
          <EditField label={at('messages.onsiteErrors.noRateDetail')} draftKey="onsite_no_rate_detail"
            inputStyle={inputStyle} savedKey={savedKey} savedLabel={at('messages.saved')} setDraft={setDraft} save={save} drafts={drafts} />
        </Section>

      </div>
    </div>
  )
}
