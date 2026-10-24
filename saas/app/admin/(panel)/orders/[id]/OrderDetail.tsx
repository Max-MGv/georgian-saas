'use client'

import { Fragment, useState, useEffect, useRef, useCallback, useTransition } from 'react'
import { asTetri, fromMajor, toMajor, formatTetri, multiplyTetri, balanceDue } from '@/lib/money'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import ContactRoleFields from '@/components/ContactRoleFields'
import NationalityPicker from '@/components/NationalityPicker'
import DateInput from '@/components/DateInput'
import { useContactSelection } from '@/lib/useContactSelection'
import type { ContactChoice, OrderRole } from '@/lib/contactResolution'
import { countryName } from '@/lib/countries'
import { updateOrderBooking, updateOrderContacts, updateOrderEnhanced, changeBookingStatus, sendOrderInvoice, assignOrderCompany, recordTopUpPayment, startOrderTopUpCheckout, sendOrderTopUpCheckoutEmail } from '@/app/actions/orders'
import { notOffered, priceCounts, PRODUCTS, ratesFromProductSnapshot, type BookingVisitType, type Counts, type Product } from '@/lib/pricingUtils'
import { lineTotals } from '@/lib/orderLines'
import { adminOrderView, manualFromStrings, NO_TYPED_RATES, PRODUCT_AT, typedTetri, type AdminOrderView, type BoxField, type BoxStrings, type PriceLine } from '@/lib/adminOrderView'
import { GuestFields, PriceLines, problemText, RateFields } from '../OrderGuestFields'
import { slotOptions } from '../timeSlots'
import { addMasterclassLine, removeMasterclassLine, updateMasterclassLine } from '@/app/actions/orderMasterclass'
import { addOrderExtra, removeOrderExtra, updateOrderExtra } from '@/app/actions/orderExtras'
import { UNIT_LABELS } from '@/lib/masterclass'
import type { MasterclassUnit } from '@/lib/masterclass'
import { adminT } from '@/lib/adminT'
import {
  bookingStagePatch,
  invoiceSentPatch,
  paidPatch,
  type BookingStatusChange,
} from '@/lib/statusWrite'
import { BOOKING_STAGES, buildFlowLine, unreachedStages, isCancelled, CANCELLED, type FlowState } from '@/lib/statusFlow'
import dynamic from 'next/dynamic'
import InvoicePrint from '../InvoicePrint'

// The QR library only loads once a card-payment link actually exists on this page.
const QrCodeDialog = dynamic(() => import('@/components/QrCodeDialog'), { ssr: false })

const C = {
  text: 'var(--site-text)', muted: 'var(--site-muted)', faint: 'var(--site-secondary)',
  border: 'var(--site-border)', bg: 'var(--site-surface)', wine: 'var(--color-brand)',
}

const inputStyle: React.CSSProperties = {
  backgroundColor: 'var(--site-surface)',
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: '7px 10px',
  fontSize: '0.875rem',
  color: C.text,
  outline: 'none',
  width: '100%',
}

// ─── Types ────────────────────────────────────────────────────────────────────

type StatusStyle = { labelKey: string; bg: string; color: string }

/**
 * Mirrors OrdersTable's own map - the same statuses have to look the same on
 * the list and on the order's own page. Keyed by `BookingStage`, plus the two
 * payment milestones, which appear as flow-line steps and dropdown entries.
 */
const STATUS_CONFIG: Record<string, StatusStyle> = {
  NEW:       { labelKey: 'orders.status.new',       bg: '#fef9c3', color: '#a16207' },
  CONFIRMED: { labelKey: 'orders.status.confirmed', bg: '#dbeafe', color: '#1d4ed8' },
  COMPLETED: { labelKey: 'orders.status.completed', bg: '#bbf7d0', color: '#065f46' },
  CANCELLED: { labelKey: 'orders.status.cancelled', bg: '#fee2e2', color: '#b91c1c' },
  unpaid:       { labelKey: 'orders.status.unpaid',      bg: '#f5f5f4', color: '#44403c' },
  // Both spellings: the flow-line names its event steps INVOICE_SENT / PAID,
  // the dropdown and filters use the lowercase payment-state words.
  INVOICE_SENT: { labelKey: 'orders.status.invoiceSent', bg: '#fef3c7', color: '#92400e' },
  PAID:         { labelKey: 'orders.status.paid',        bg: '#dcfce7', color: '#166534' },
  invoiced:     { labelKey: 'orders.status.invoiceSent', bg: '#fef3c7', color: '#92400e' },
  paid:         { labelKey: 'orders.status.paid',        bg: '#dcfce7', color: '#166534' },
}

const UNKNOWN_STATUS_STYLE: StatusStyle = { labelKey: '', bg: '#f3f4f6', color: '#374151' }

function styleFor(code: string | null): StatusStyle {
  return (code && STATUS_CONFIG[code]) || UNKNOWN_STATUS_STYLE
}

function labelFor(locale: string, code: string | null): string {
  if (!code) return '—'
  const cfg = STATUS_CONFIG[code]
  return cfg ? adminT(locale, cfg.labelKey) : code
}

/**
 * "We have asked for money but it hasn't arrived" — the one financial state the
 * flow-line below cannot show, because the line's payment step is Paid and
 * `invoiced` sits before it. Without this the winery could set Invoice Sent and
 * then see no trace of it anywhere, which is what it used to say on the pill.
 *
 * Paid needs no marker here: the flow-line already ticks it, in the position it
 * actually happened.
 */
function InvoiceSentMark({ locale }: { locale: string }) {
  const label = adminT(locale, 'orders.status.invoiceSent')
  return (
    <span
      title={label}
      aria-label={label}
      className="inline-flex items-center rounded-full font-bold flex-shrink-0"
      style={{ backgroundColor: '#fef3c7', color: '#92400e', fontSize: '0.65rem', padding: '0.1rem 0.4rem', lineHeight: 1.5 }}
    >
      ✉
    </span>
  )
}

/**
 * The merged one-line flow (Plan-StatusModel chunk 4) — horizontal here,
 * because the detail page's action bar runs across the top rather than down a
 * card's edge like the wine-orders list.
 *
 * One line, with Paid where payment actually happened: an individual who paid
 * at checkout reads new → paid → confirmed → completed, a company on invoice
 * terms reads new → confirmed → completed → paid, both off the same two
 * columns. Read-only — the dropdown beside it is what changes the status, and
 * duplicating that as click targets would give the same action two places to
 * disagree.
 */
/** How the money arrived, for the small parenthetical beside a done "Paid" step. */
function paymentMethodLabel(method: 'CARD' | 'BANK_TRANSFER' | 'CASH' | 'MANUAL' | null, locale: string) {
  if (!method) return null
  const key = method === 'CARD' ? 'paymentMethod.card'
    : method === 'BANK_TRANSFER' ? 'paymentMethod.bankTransfer'
    : method === 'CASH' ? 'paymentMethod.cash'
    : 'paymentMethod.manual'
  return adminT(locale, key)
}

/** One settled, non-reversed payment, as passed down from page.tsx. */
type PaymentRow = { method: 'CARD' | 'BANK_TRANSFER' | 'CASH' | 'MANUAL'; amount: number; settledAt: Date | string }

function FlowLine({ steps, locale, payments }: {
  steps: ReturnType<typeof buildFlowLine>
  locale: string
  /**
   * Every settled, non-reversed payment for this order, newest first.
   *
   * Only ever shown inline beside a done "Paid" step when there is exactly
   * one — that's the overwhelming majority of orders, and it renders
   * identically to how this line always has (Plan-PostPaymentExtras Chunk 5).
   * Two or more payments are deliberately NOT collapsed into this single
   * label any more: doing that used to silently relabel how the *original*
   * charge was paid the moment a top-up settled with a different method
   * (KnownBugs #64 finding 4) — e.g. a card booking topped up with cash would
   * flip this to "Paid · Cash", implying the whole order was paid in cash.
   * The real, itemised list renders separately in the Total card instead.
   */
  payments?: PaymentRow[]
}) {
  const singlePaymentMethod = payments && payments.length === 1 ? payments[0].method : null
  return (
    <div className="flex items-center flex-wrap gap-x-1 gap-y-1.5 mb-4">
      {steps.map((step, i) => (
        <div key={step.code} className="flex items-center gap-1">
          <span
            className="inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full whitespace-nowrap"
            style={{
              backgroundColor: step.done ? styleFor(step.code).bg : 'transparent',
              color: step.done ? styleFor(step.code).color : C.faint,
              border: `1px solid ${step.done ? styleFor(step.code).color + '44' : C.border}`,
              fontWeight: step.active ? 700 : 400,
            }}
          >
            {step.done && (
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden>
                <path d="M1.5 5l2.5 2.5 4.5-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
            {labelFor(locale, step.code)}
            {step.code === 'PAID' && step.done && singlePaymentMethod && (
              <span style={{ opacity: 0.75, fontWeight: 400 }}>· {paymentMethodLabel(singlePaymentMethod, locale)}</span>
            )}
          </span>
          {i < steps.length - 1 && (
            <span style={{ color: step.done && steps[i + 1].done ? C.wine : C.border, fontSize: '0.75rem' }}>→</span>
          )}
        </div>
      ))}
    </div>
  )
}

type Payment = { recipientName: string; personalNumber: string; bankName: string; bankCode: string; iban: string }

type Price = {
  id: string
  minGuests: number
  maxGuests: number
  // Product model (T-152): tetri per person, null = not offered; tastingLunchPrice is all-in.
  tastingOnlyPrice: number | null
  lunchOnlyPrice: number | null
  tastingLunchPrice: number | null
}

type MasterclassItemRow = {
  id: string
  name: string
  unitType: string
  pricePerUnit: number
  active: boolean
  /** The add-on group (T-7) — the add picker lists items under it. */
  groupName?: string | null
}

type MasterclassLine = {
  id: string
  masterclassItemId: string
  quantity: number
  pricePerUnit: number
  /** The group's name as it was when the line was added (snapshot); null for a line that had none. */
  groupName?: string | null
  masterclassItem: MasterclassItemRow
}

type ExtraRow = { id: string; label: string; amount: number }
type MenuItemRow = { id: string; name: string; type: string }

type OrderProp = {
  id: string
  stage: string
  createdAt: Date | string
  confirmedAt: Date | string | null
  completedAt: Date | string | null
  invoiceSentAt: Date | string | null
  paidAt: Date | string | null
  /** Every settled, non-reversed payment for this order, newest first —
   *  empty if unpaid. See FlowLine's own comment for why this is a list, not
   *  a single method (Plan-PostPaymentExtras Chunk 5, KnownBugs #64 finding 4). */
  payments: PaymentRow[]
  date: Date
  timeSlot: string
  bookingType: string
  visitType: string
  guestCount: number
  tastingGuestCount: number
  lunchGuestCount: number
  /** Lunch only guests (T-152) — shown read-only until Plan-PricingModel Chunk 8 gives this screen a box for them. */
  lunchOnlyGuestCount: number
  freeGuestCount: number
  hotDishVegetable: string | null
  hotDishMeat: string | null
  foodNotes: string | null
  name: string
  surname: string
  email: string | null
  phone: string | null
  notes: string | null
  totalPrice: number | null
  /** Sum of this order's settled, non-reversed Payment.amount rows — the
   *  other half of the balance-due figure (Plan-PostPaymentExtras Chunk 2). */
  paymentsSettledTotal: number
  // The rates this order was actually sold at. The page's query already loaded
  // them (it uses `include`), but its prop literal listed fields one by one and
  // never passed these three down — so this screen had no way to know what the
  // order cost, and invented ₾50 instead (#50) while double-counting its lines
  // against the stored total (#52). Both fixes need these here.
  tastingOnlyRate: number | null
  lunchOnlyRate: number | null
  tastingLunchRate: number | null
  registrationFeeSnapshot: number | null
  requestedCompanyName: string | null
  company: {
    id: string
    name: string
    identificationCode: string | null
    prices: Price[]
    /** Flat fee per booking (T-152 D-6) — replaces each tier's own registration fee. */
    registrationFee: number
  } | null
  masterclassLines: MasterclassLine[]
  extras: ExtraRow[]
  /** ISO codes — company bookings only (Plan-CompanyNationality). */
  nationalities: string[]
  contacts: { roleId: string; roleKey: string; personId: string | null; roleLabelEn: string; roleLabelKa: string; name: string; phone: string | null; email: string | null }[]
  invoicesSent: { id: string; sentAt: Date | string; recipientEmail: string; totalPrice: number }[]
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border mb-4" style={{ borderColor: C.border }}>
      <div
        className="px-5 py-3 border-b flex items-center justify-between gap-3"
        style={{ borderColor: C.border, backgroundColor: 'var(--site-bg)' }}
      >
        <h3
          className="text-xs font-semibold uppercase tracking-wider"
          style={{ color: 'var(--site-secondary)' }}
        >
          {title}
        </h3>
        {action}
      </div>
      <div className="px-5 py-4" style={{ backgroundColor: C.bg }}>
        {children}
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-0.5">
      <span className="text-xs w-28 flex-shrink-0 pt-0.5" style={{ color: C.faint }}>
        {label}
      </span>
      <span className="text-sm" style={{ color: C.text }}>
        {value ?? '—'}
      </span>
    </div>
  )
}

/** yyyy-mm-dd for a date input — the same conversion the Orders side panel uses. */
function toInputDate(d: Date | string) {
  return new Date(d).toISOString().split('T')[0]
}

function formatDate(d: Date) {
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OrderDetail({
  order,
  payment,
  detailed,
  displayName = 'Your Winery',
  menuItems,
  masterclassItems,
  companies = [],
  individualsPrices = [],
  contactRoles = [],
  nationalityEnabled = false,
  locale = 'en',
}: {
  order: OrderProp
  payment: Payment
  detailed: boolean
  displayName?: string
  menuItems: MenuItemRow[]
  masterclassItems: MasterclassItemRow[]
  /** Real companies to link a no-company order to (Feature 180). Excludes
   * the isIndividual pricing-container row — see page.tsx's fetch. */
  companies?: { id: string; name: string; isBookingCompany: boolean }[]
  /** The tenant's Individuals price table — what an individual order is re-priced from (D-14). */
  individualsPrices?: Price[]
  /** The contact types a booking records, Contact Person first among them — as New Order shows (T-215 part 2). */
  contactRoles?: OrderRole[]
  /** The tenant's nationality-tag switch (Plan-CompanyNationality) — New Order's gate for the picker. */
  nationalityEnabled?: boolean
  locale?: string
}) {
  const at = (key: string, vars?: Record<string, string | number>) => adminT(locale, key, vars)
  const router = useRouter()

  // ── Click-to-edit cards (T-215 part 2, Plan-OrderPageMirror D-1/D-2) ───────
  // Every editable card is read-only until its red pencil is clicked; one card at a time; Save / Cancel. The cards
  // mirror the booking forms: Booking Info = date, time, company (or none = individual), nationality, internal notes
  // (updateOrderBooking); Contacts = the contact person + every contact type, picked from the company's people like
  // New Order (updateOrderContacts); Guest breakdown (updateOrderEnhanced); Masterclass and Extras lines edited in
  // place (updateMasterclassLine / updateOrderExtra — adding and removing a line still act at once).
  type EditCard = 'info' | 'contact' | 'guests' | 'mc' | 'ex'
  const [editingCard, setEditingCard] = useState<EditCard | null>(null)
  const editingInfo = editingCard === 'info'
  const editingContact = editingCard === 'contact'
  const [msgCard, setMsgCard] = useState<EditCard>('info')
  const [infoDate, setInfoDate] = useState('')
  const [infoTime, setInfoTime] = useState('')
  const [infoNotes, setInfoNotes] = useState('')
  const [infoCompanyId, setInfoCompanyId] = useState('')
  const [infoNationalities, setInfoNationalities] = useState<string[]>([])
  const [contactName, setContactName] = useState('')
  const [infoPhone, setInfoPhone] = useState('')
  const [infoEmail, setInfoEmail] = useState('')
  const [lineQty, setLineQty] = useState<Record<string, string>>({})
  // What the Masterclass / Extras cards held when they opened — Save applies the difference, Cancel restores it.
  const mcSnap = useRef<MasterclassLine[]>([])
  const exSnap = useRef<ExtraRow[]>([])
  const [extraEdits, setExtraEdits] = useState<Record<string, { label: string; amount: string }>>({})
  const [infoSaving, setInfoSaving] = useState(false)
  const [infoMsg, setInfoMsg] = useState('')
  const [infoError, setInfoError] = useState(false)

  // Contact types and the company's people — the same hook and rules as New Order (Plan-ContactRoles §4b).
  const contactPersonRole = contactRoles.find(r => r.key === 'contact_person') ?? null
  const extraRoles = contactRoles.filter(r => r.key !== 'contact_person')
  const roleLabel = (role: OrderRole) => (locale === 'ka' ? role.labelKa : role.labelEn) || role.labelEn
  const applyPickedPerson = useCallback((person: ContactChoice, role: OrderRole) => {
    if (contactPersonRole && role.roleId !== contactPersonRole.roleId) return
    setContactName(person.name.trim())
    if (person.phone) setInfoPhone(person.phone)
    if (person.email) setInfoEmail(person.email)
  }, [contactPersonRole])
  const {
    selected: selectedContacts, contacts: pickedContacts, roleChoices,
    resolve: resolveContacts, pickFor, clearRole, setTyped: setTypedContact, prefill: prefillContacts, reset: resetContacts,
  } = useContactSelection({ module: 'BOOKING', onApply: applyPickedPerson, asAdmin: true })

  // What the order records right now — set from the save's own answer at once, and from every refresh. router.refresh()
  // lags several seconds, and opening the editor in that gap prefilled the *previous* contacts, which could bring back
  // a guide that had just been removed (QA T-215, case C4).
  const [contactsNow, setContactsNow] = useState(order.contacts)
  useEffect(() => { setContactsNow(order.contacts) }, [order.contacts])
  const [bookerNow, setBookerNow] = useState({ name: order.name, surname: order.surname, phone: order.phone, email: order.email })
  useEffect(() => {
    setBookerNow({ name: order.name, surname: order.surname, phone: order.phone, email: order.email })
  }, [order.name, order.surname, order.phone, order.email])

  function startEdit(card: EditCard) {
    setInfoMsg('')
    setInfoError(false)
    setMsgCard(card)
    setEditingCard(card)
    if (card === 'info') {
      setInfoDate(toInputDate(order.date))
      setInfoTime(order.timeSlot)
      setInfoNotes(order.notes ?? '')
      setInfoCompanyId(order.company?.id ?? '')
      setInfoNationalities(order.nationalities)
    } else if (card === 'contact') {
      setContactName(`${bookerNow.name} ${bookerNow.surname}`.trim())
      setInfoPhone(bookerNow.phone ?? '')
      setInfoEmail(bookerNow.email ?? '')
      // Start from what the order records now — synchronously, so nothing left from an earlier edit survives and
      // nothing typed before the people list arrives is lost — then load the company's people for the pickers
      // without touching the selection.
      resetContacts()
      prefillContacts(contactsNow.map(c => ({ roleId: c.roleId, personId: c.personId ?? undefined, name: c.name, phone: c.phone, email: c.email })))
      if (order.company) void resolveContacts({ companyId: order.company.id }, { keepSelection: true })
    } else if (card === 'guests') {
      resetGuests()
    } else if (card === 'mc') {
      mcSnap.current = lines
      setLineQty(Object.fromEntries(lines.map(l => [l.id, String(l.quantity)])))
    } else {
      exSnap.current = extras
      setExtraEdits(Object.fromEntries(extras.map(e => [e.id, { label: e.label, amount: String(toMajor(asTetri(e.amount))) }])))
    }
  }

  function cancelEdit() {
    if (editingCard === 'guests') resetGuests()
    // Draft lines (added / removed on screen) go back to what was saved.
    if (editingCard === 'mc') { setLines(mcSnap.current); setAddingLine(false) }
    if (editingCard === 'ex') { setExtras(exSnap.current); setAddingExtra(false) }
    setEditingCard(null)
    setInfoMsg('')
    setInfoError(false)
  }

  /** contact_person rebuilt from the live fields (keeping its pick), then every other type — as New Order does. */
  function buildContacts() {
    const others = pickedContacts.filter(c => c.roleId !== contactPersonRole?.roleId)
    const name = contactName.trim()
    return contactPersonRole && name
      ? [{ roleId: contactPersonRole.roleId, personId: selectedContacts[contactPersonRole.roleId]?.personId, name, phone: infoPhone.trim() || null, email: infoEmail.trim() || null }, ...others]
      : others
  }

  async function saveCard(): Promise<{ error: string } | null> {
    if (editingCard === 'info') {
      const r = await updateOrderBooking(order.id, { date: infoDate, timeSlot: infoTime, notes: infoNotes, companyId: infoCompanyId || null, nationalities: infoNationalities })
      return 'error' in r ? r : null
    }
    if (editingCard === 'contact') {
      const r = await updateOrderContacts(order.id, { fullName: contactName, phone: infoPhone, email: infoEmail, contacts: order.company ? buildContacts() : undefined })
      if ('error' in r) return r
      const words = contactName.trim().split(' ')
      setContactsNow(r.contacts)
      setBookerNow({ name: words[0] ?? '', surname: words.slice(1).join(' '), phone: infoPhone.trim() || null, email: infoEmail.trim() || null })
      return null
    }
    if (editingCard === 'guests') return saveGuests()
    if (editingCard === 'mc') {
      // Number(), not parseInt: "2.5" must reach the server's whole-number rule and be refused, not become 2.
      const qtyOf = (l: MasterclassLine) => {
        // Flat is once; per person is the paying guests — the server sets it, so what is stored is sent back unchanged.
        if (l.masterclassItem.unitType === 'FLAT') return 1
        if (l.masterclassItem.unitType === 'PER_PERSON') return l.quantity
        const raw = (lineQty[l.id] ?? String(l.quantity)).trim()
        return raw === '' ? NaN : Number(raw)
      }
      // Each step that succeeds is written into the snapshot at once, so a second Save after a refusal never repeats it.
      for (const l of mcSnap.current.filter(s => !lines.some(x => x.id === s.id))) {
        await removeMasterclassLine(l.id, order.id)
        mcSnap.current = mcSnap.current.filter(s => s.id !== l.id)
      }
      for (const l of lines) {
        const q = qtyOf(l)
        if (l.id.startsWith('new-')) {
          const r = await addMasterclassLine(order.id, { masterclassItemId: l.masterclassItemId, quantity: Number.isFinite(q) ? q : 0 })
          if ('error' in r) return r
          const saved = { ...l, id: r.lineId, quantity: q }
          setLines(prev => prev.map(x => (x.id === l.id ? saved : x)))
          mcSnap.current = [...mcSnap.current, saved]
          continue
        }
        if (q === l.quantity) continue
        const r = await updateMasterclassLine(l.id, order.id, Number.isFinite(q) ? q : 0)
        if ('error' in r) return r
        setLines(prev => prev.map(x => (x.id === l.id ? { ...x, quantity: q } : x)))
        mcSnap.current = mcSnap.current.map(s => (s.id === l.id ? { ...s, quantity: q } : s))
      }
      return null
    }
    if (editingCard === 'ex') {
      for (const e of exSnap.current.filter(s => !extras.some(x => x.id === s.id))) {
        await removeOrderExtra(e.id, order.id)
        exSnap.current = exSnap.current.filter(s => s.id !== e.id)
      }
      for (const e of extras) {
        const ed = extraEdits[e.id] ?? { label: e.label, amount: String(toMajor(asTetri(e.amount))) }
        const amount = fromMajor(parseFloat(ed.amount) || 0)
        if (e.id.startsWith('new-')) {
          const r = await addOrderExtra(order.id, { label: ed.label, amount })
          if ('error' in r) return r
          const saved = { id: r.extraId, label: ed.label.trim(), amount }
          setExtras(prev => prev.map(x => (x.id === e.id ? saved : x)))
          exSnap.current = [...exSnap.current, saved]
          continue
        }
        if (ed.label.trim() === e.label && amount === e.amount) continue
        const r = await updateOrderExtra(e.id, order.id, { label: ed.label, amount })
        if ('error' in r) return r
        setExtras(prev => prev.map(x => (x.id === e.id ? { ...x, label: ed.label.trim(), amount } : x)))
        exSnap.current = exSnap.current.map(s => (s.id === e.id ? { ...s, label: ed.label.trim(), amount } : s))
      }
      return null
    }
    return null
  }

  // The card stays on "Saving…" until router.refresh() has delivered the saved order, then closes — the view never
  // shows the old values after a Save (the refresh can take seconds; QA T-215 found 8 s+ of stale values).
  const [refreshing, startRefresh] = useTransition()
  const [closeAfterRefresh, setCloseAfterRefresh] = useState(false)
  useEffect(() => {
    if (!closeAfterRefresh || refreshing) return
    setCloseAfterRefresh(false)
    setInfoSaving(false)
    setEditingCard(null)
    setInfoMsg(at('orderDetail.bookingInfo.savedOk'))
    const t = setTimeout(() => setInfoMsg(''), 3000)
    return () => clearTimeout(t)
  }, [closeAfterRefresh, refreshing]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCardSave() {
    setInfoSaving(true)
    setInfoMsg('')
    const failed = await saveCard()
    if (failed) {
      setInfoSaving(false)
      setInfoError(true)
      setInfoMsg(failed.error)
      return
    }
    setInfoError(false)
    setCloseAfterRefresh(true)
    startRefresh(() => router.refresh())
  }

  // Plain render helpers (no inputs inside, so calling them doesn't remount a field and lose focus).
  // The red pencil is the Settings one (SettingsClient.tsx) — D-2: an icon, never the word "Edit".
  const editButton = (card: EditCard, hidden = false) => editingCard === null && !hidden && (
    <button
      type="button"
      onClick={() => startEdit(card)}
      title={at('orderDetail.bookingInfo.edit')}
      aria-label={at('orderDetail.bookingInfo.edit')}
      className="flex-shrink-0 p-3 -m-2 md:p-1 md:m-0 rounded hover:opacity-70 transition-opacity"
      style={{ color: '#9b090c' }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
      </svg>
    </button>
  )
  const editActions = (blocked = false) => (
    <>
      {infoMsg && infoError && <p className="text-sm" style={{ color: '#b91c1c' }}>{infoMsg}</p>}
      <div className="flex gap-3">
        <button
          onClick={handleCardSave}
          disabled={infoSaving || blocked}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ backgroundColor: C.wine, opacity: infoSaving || blocked ? 0.6 : 1 }}
        >
          {infoSaving ? at('orders.editPanel.saving') : at('orders.editPanel.save')}
        </button>
        <button
          onClick={cancelEdit}
          className="px-4 py-2 rounded-lg border text-sm"
          style={{ borderColor: C.border, color: C.muted }}
        >
          {at('orders.editPanel.cancel')}
        </button>
      </div>
    </>
  )
  // Any change clears a refused save's message (input events bubble from every field, the select too).
  const clearRefusal = () => { if (infoError) { setInfoError(false); setInfoMsg('') } }
  const savedNote = (card: EditCard) =>
    editingCard === null && msgCard === card && infoMsg && !infoError && <p className="text-xs mt-2" style={{ color: '#166534' }}>{infoMsg}</p>

  // Contact blocks — the same labels, layout and "Choose the …" dropdown as New Order (NewOrderForm.tsx rolePicker).
  const roleLabels = {
    name: at('newOrder.contact.name'),
    phone: at('orderDetail.bookingInfo.phone'),
    email: at('newOrder.contact.email'),
  }
  const roleTitleStyle: React.CSSProperties = { color: C.faint, marginBottom: 6 }
  function rolePicker(role: OrderRole) {
    const choices = roleChoices.find(r => r.roleId === role.roleId)
    if (!choices || choices.people.length === 0) return undefined
    return (
      <select
        aria-label={at('newWineOrder.contact.pickPerson', { role: roleLabel(role) })}
        value={selectedContacts[role.roleId]?.personId ?? ''}
        onChange={e => {
          const person = choices.people.find(pp => pp.id === e.target.value)
          if (person) pickFor(person, choices)
          else clearRole(role.roleId)
        }}
        style={inputStyle}
      >
        <option value="">{at('newWineOrder.contact.pickPerson', { role: roleLabel(role) })}</option>
        {choices.people.map(pp => (
          <option key={pp.id} value={pp.id}>{pp.name}{pp.phone ? ` — ${pp.phone}` : ''}</option>
        ))}
      </select>
    )
  }

  // ── Link to a real company (Feature 180) ───────────────────────────────────
  // Only relevant for an order that came in with no companyId at all — see
  // assignOrderCompany's own doc comment for why this never happens
  // automatically.
  const [assignCompanyId, setAssignCompanyId] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [assignMsg, setAssignMsg] = useState('')
  const [assignError, setAssignError] = useState(false)

  async function handleAssignCompany() {
    if (!assignCompanyId) return
    setAssigning(true)
    setAssignMsg('')
    const result = await assignOrderCompany(order.id, assignCompanyId)
    setAssigning(false)
    if ('error' in result) {
      setAssignError(true)
      setAssignMsg(result.error)
      return
    }
    setAssignError(false)
    setAssignMsg('Linked — refreshing…')
    router.refresh()
  }
  // ── Guest / dish / notes state ─────────────────────────────────────────────
  // String state so the user can clear the field and type a new number freely
  // The party size. Editable since 2026-09-19 because it, not the split, picks
  // the price tier — and because it used to drift from the split on every edit
  // (#54), leaving the invoice and the price describing different bookings.
  // Once paid, `updateOrderEnhanced` rejects any edit to guest counts/split/
  // rates/hot-dish/food-notes outright (Chunk 1, KnownBugs #64) — the original
  // charged amount must stay a fixed historical fact. Every input this card
  // renders is disabled from here on; "add an extra" is the only way left to
  // change what's owed on a paid order.
  const isPaid = order.paidAt != null
  const lockedInputStyle = { ...inputStyle, opacity: 0.6, cursor: 'not-allowed' } as const
  // Plan-PricingModel Chunk 8: the visit type, and the guests as the order stores them — four boxes for a
  // company (the total is their sum, D-3), one count for an individual (D-5).
  const [visitType, setVisitType] = useState<BookingVisitType>(order.visitType as BookingVisitType)
  const [guestCountStr, setGuestCountStr] = useState(String(order.guestCount))
  const storedBoxes: BoxStrings = {
    tastingOnly: String(order.tastingGuestCount), lunchOnly: String(order.lunchOnlyGuestCount),
    tastingLunch: String(order.lunchGuestCount), free: String(order.freeGuestCount),
  }
  const [boxes, setBoxes] = useState<BoxStrings>(storedBoxes)
  const setBox = (f: BoxField, v: string) => setBoxes(prev => ({ ...prev, [f]: v }))
  // Typed per-person rates, seeded from what the order was sold at — never from a constant: a hardcoded
  // ₾50 here once re-priced a ₾70/pp booking on Save (#50). Empty when the order carries no rate.
  const major = (t: number | null) => (t != null ? String(toMajor(asTetri(t))) : '')
  const storedManual: Record<Product, string> = {
    tastingOnly: major(order.tastingOnlyRate), lunchOnly: major(order.lunchOnlyRate), tastingLunch: major(order.tastingLunchRate),
  }
  const [manualRates, setManualRates] = useState<Record<Product, string>>(storedManual)
  const [hotDishVeg, setHotDishVeg] = useState(order.hotDishVegetable ?? '')
  const [hotDishMeat, setHotDishMeat] = useState(order.hotDishMeat ?? '')
  const [foodNotes, setFoodNotes] = useState(order.foodNotes ?? '')

  // ── Top action bar state ───────────────────────────────────────────────────
  // Both axes are local state now, so the flow-line and the pill move on click
  // rather than waiting for the server round trip.
  const [flow, setFlow] = useState<FlowState>({
    stage: order.stage,
    createdAt: order.createdAt,
    confirmedAt: order.confirmedAt,
    finishedAt: order.completedAt,
    invoiceSentAt: order.invoiceSentAt,
    paidAt: order.paidAt,
  })
  const [statusMenuOpen, setStatusMenuOpen] = useState(false)
  // The 'paid' step swaps the menu to this picker instead of firing right
  // away, so the ledger records Bank transfer / Cash rather than a guessed
  // MANUAL. CARD never appears here — only a real Flitt settlement sets it.
  const [pickingPaymentMethod, setPickingPaymentMethod] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendMsg, setSendMsg] = useState('')
  const [printReady, setPrintReady] = useState(false)
  const printPending = useRef(false)

  useEffect(() => {
    if (!statusMenuOpen) return
    // Next's App Router hydrates at `document`, so React's own delegated click
    // listener lives on the same node this effect adds its listener to — not a
    // descendant of it. Calling `e.stopPropagation()` inside the menu (below)
    // only stops the event bubbling to further *ancestors*; it cannot stop a
    // second, independently-registered listener on that same `document` node
    // from also running, which is exactly what this one is.
    //
    // A plain containment check (`e.target.closest('[data-status-menu]')`) on
    // a *bubble*-phase listener is not enough, and this was confirmed live,
    // not assumed: clicking "Paid" swaps the menu's content (the step list
    // unmounts, the Bank Transfer/Cash picker mounts in its place), and React
    // flushes that synchronously as part of dispatching the click to its own
    // (earlier-registered) bubble listener — *before* this listener's turn on
    // the same `document` node. By the time this ran, `e.target` (the old
    // "Paid" button) had already been removed from the DOM, so
    // `.closest()` on a detached node found nothing and this handler
    // wrongly concluded the click was "outside" and closed what the click had
    // just opened. Running in the *capture* phase fixes this: capture fires
    // top-down before the click ever reaches the target, so the containment
    // check runs while the DOM is still exactly as the user clicked it.
    function close(e: MouseEvent) {
      if ((e.target as HTMLElement | null)?.closest('[data-status-menu]')) return
      setStatusMenuOpen(false); setPickingPaymentMethod(false)
    }
    document.addEventListener('click', close, true)
    return () => document.removeEventListener('click', close, true)
  }, [statusMenuOpen])

  useEffect(() => {
    if (printReady && printPending.current) {
      printPending.current = false
      setTimeout(() => { window.print(); setPrintReady(false) }, 100)
    }
  }, [printReady])

  /**
   * The optimistic mirror of one status change, using the same pure patch
   * functions the server action calls rather than restating the rules - two
   * copies of "which columns does this move" is where drift hides.
   */
  function applyLocally(change: BookingStatusChange) {
    setFlow(prev => {
      const now = new Date()
      const dates = {
        confirmedAt: prev.confirmedAt ? new Date(prev.confirmedAt) : null,
        finishedAt: prev.finishedAt ? new Date(prev.finishedAt) : null,
        invoiceSentAt: prev.invoiceSentAt ? new Date(prev.invoiceSentAt) : null,
        paidAt: prev.paidAt ? new Date(prev.paidAt) : null,
      }
      switch (change.kind) {
        case 'stage': {
          const patch = bookingStagePatch(change.stage as never, dates, now)
          return {
            ...prev,
            stage: patch.stage,
            confirmedAt: patch.confirmedAt !== undefined ? patch.confirmedAt : prev.confirmedAt,
            finishedAt: patch.completedAt !== undefined ? patch.completedAt : prev.finishedAt,
          }
        }
        case 'paid':
          return { ...prev, ...paidPatch(change.value, dates, now) }
        case 'invoiceSent':
          return { ...prev, ...invoiceSentPatch(change.value, dates, now) }
        case 'restore':
          return prev
      }
    })
  }

  async function handleStatusChange(change: BookingStatusChange) {
    setStatusMenuOpen(false)
    applyLocally(change)
    await changeBookingStatus(order.id, change)
  }

  /** A menu step was clicked — 'paid' opens the method picker instead of
   * firing immediately; everything else behaves as before. */
  function handleStepClick(step: { code: string; change: BookingStatusChange }) {
    if (step.code === 'paid') {
      setPickingPaymentMethod(true)
      return
    }
    handleStatusChange(step.change)
  }

  function handlePaymentMethodChosen(method: 'BANK_TRANSFER' | 'CASH') {
    setPickingPaymentMethod(false)
    handleStatusChange({ kind: 'paid', value: true, method })
  }

  async function handleSendInvoice() {
    setSending(true)
    setSendMsg('')
    const result = await sendOrderInvoice(order.id, '')
    setSending(false)
    if ('error' in result) {
      setSendMsg(at('orderDetail.sendFailed'))
    } else {
      setSendMsg(at('orders.emailModal.sent'))
      // Sending an invoice stamps a date and nothing else: it records that we
      // asked for money, not that the visit happened, so it applies at any
      // stage rather than only from NEW or CONFIRMED as the old status did.
      if (flow.invoiceSentAt == null) applyLocally({ kind: 'invoiceSent', value: true })
      setTimeout(() => setSendMsg(''), 3000)
    }
  }

  // ── Masterclass lines state ────────────────────────────────────────────────
  const [lines, setLines] = useState<MasterclassLine[]>(order.masterclassLines)
  const [addingLine, setAddingLine] = useState(false)
  const [newLineItemId, setNewLineItemId] = useState('')
  const [newLineQty, setNewLineQty] = useState('1')
  const [lineLoading, setLineLoading] = useState(false)

  // ── Extras state ───────────────────────────────────────────────────────────
  const [extras, setExtras] = useState<ExtraRow[]>(order.extras)
  const [addingExtra, setAddingExtra] = useState(false)
  const [newExtraLabel, setNewExtraLabel] = useState('')
  const [newExtraAmount, setNewExtraAmount] = useState('')
  const [extraLoading, setExtraLoading] = useState(false)

  // ── Record an additional payment (Plan-PostPaymentExtras Chunk 3,
  // KnownBugs #64) ────────────────────────────────────────────────────────────
  const [recordingPayment, setRecordingPayment] = useState(false)
  const [recordAmount, setRecordAmount] = useState('')
  const [recordLoading, setRecordLoading] = useState(false)
  const [recordMsg, setRecordMsg] = useState('')

  // ── Card-link top-up (Plan-PostPaymentExtras Chunk 4, KnownBugs #64) ───────
  // Two steps, not one blind "generate and send" click: generating a real
  // Flitt checkout and emailing a guest are different actions with different
  // blast radii, so the admin sees/can copy the real link before choosing to
  // email it (or send it some other way entirely).
  const [startingLink, setStartingLink] = useState(false)
  const [linkAmount, setLinkAmount] = useState('')
  const [linkLoading, setLinkLoading] = useState(false)
  const [linkMsg, setLinkMsg] = useState('')
  const [generatedLink, setGeneratedLink] = useState<{ checkoutUrl: string; paymentId: string } | null>(null)
  const [linkCopied, setLinkCopied] = useState(false)
  const [emailSending, setEmailSending] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  // ── Pricing calculations ───────────────────────────────────────────────────
  const isCompanyOrder = order.bookingType === 'COMPANY'
  // An individual order is priced from the Individuals table, never typed rates (D-14).
  const prices = isCompanyOrder ? order.company?.prices ?? [] : individualsPrices
  const companyRegistrationFee = order.company?.registrationFee ?? 0
  // The add-ons as stored (what a not-yet-edited order was sold with) and extras.
  const { masterclass: storedAddOnAmt, extras: extrasAmt } = lineTotals({ masterclassLines: lines, extras })

  // The same check and pricing updateOrderEnhanced runs, so a Save stores exactly what is previewed. A per-person
  // add-on is priced at the paying guests being typed, so the preview already shows what the guests card will store.
  const view = adminOrderView({
    bookingType: isCompanyOrder ? 'COMPANY' : 'INDIVIDUAL', visitType, guests: guestCountStr, boxes,
    prices, registration: companyRegistrationFee, manual: manualRates,
    addOnLines: lines.map(l => ({ quantity: l.quantity, pricePerUnit: l.pricePerUnit, unit: l.masterclassItem.unitType as MasterclassUnit })),
    extrasAmt,
    hadRates: ratesFromProductSnapshot(order) != null,
  })
  const payingGuests = view.counts ? view.counts.tastingOnly + view.counts.lunchOnly + view.counts.tastingLunch : 0
  // What a line shows as its quantity: a per-person line is the paying guests as typed right now (it follows them on Save).
  const lineQtyShown = (l: MasterclassLine) => l.masterclassItem.unitType === 'PER_PERSON' && view.counts ? payingGuests : l.quantity
  // The add-on lines under their group's name, in the order the groups first appear (lines carry the group's snapshot).
  const lineGroups = (() => {
    const names: string[] = []
    const byName = new Map<string, MasterclassLine[]>()
    for (const l of lines) {
      const k = l.groupName ?? ''
      if (!byName.has(k)) { byName.set(k, []); names.push(k) }
      byName.get(k)!.push(l)
    }
    return names.map(name => ({ name, lines: byName.get(name)! }))
  })()

  // Nothing about what is sold has been edited → show the order as it was sold (its own rates), not a quote at
  // today's price table. This is also why "Live preview" no longer appears with nothing unsaved (finding 2).
  const sameBoxes = isCompanyOrder
    ? (Object.keys(storedBoxes) as BoxField[]).every(f => (parseInt(boxes[f]) || 0) === (parseInt(storedBoxes[f]) || 0))
    : (parseInt(guestCountStr) || 0) === order.guestCount
  const snapshot = ratesFromProductSnapshot(order)
  // updateOrderEnhanced's own rule: a rate counts as changed only when one is typed for a product with guests
  // and differs from what the order was sold at.
  const rateEdited = isCompanyOrder && PRODUCTS.some(p => {
    const typed = typedTetri(manualRates[p])
    return (view.counts?.[p] ?? 0) > 0 && typed != null && typed !== (snapshot?.[p] ?? null)
  })
  const edited = visitType !== order.visitType || !sameBoxes || rateEdited
  // D-14: the server re-prices an individual order only when its visit or guests change, so a missing (or
  // incomplete) Individuals table blocks Save only then — a food note or hot dish still saves without one.
  const individualTableProblem = !isCompanyOrder && (view.problem?.key === 'orderForm.err.noIndividualsTable' || view.problem?.key === 'orderForm.err.individualsMissing')
  const problem = individualTableProblem && !edited ? null : problemText(at, view)
  const storedCounts: Counts = { tastingOnly: order.tastingGuestCount, lunchOnly: order.lunchOnlyGuestCount, tastingLunch: order.lunchGuestCount, free: order.freeGuestCount }
  const soldLines: PriceLine[] = snapshot
    ? PRODUCTS.filter(p => storedCounts[p] > 0 && snapshot[p] != null)
        .map(p => ({ product: p, count: storedCounts[p], rate: snapshot[p]!, amount: snapshot[p]! * storedCounts[p], row: null }))
    : []
  const soldTotal = snapshot && notOffered(snapshot, storedCounts).length === 0
    ? priceCounts(snapshot, storedCounts, { masterclass: storedAddOnAmt, extras: extrasAmt })
    : null
  const shown: AdminOrderView = edited ? view : { ...view, lines: soldLines, registration: snapshot?.registration ?? 0, total: soldTotal }
  // null means "this screen cannot derive a total" — the display then shows the stored order.totalPrice (#52).
  const computedTotal: number | null = shown.total

  // What's still owed, once this order has ever been paid — the balance-due
  // figure from Plan-PostPaymentExtras Chunk 2 (KnownBugs #64). Uses
  // computedTotal when there is one (it's the same figure a Save would
  // persist), falling back to the stored total exactly like the display
  // above does, so this never disagrees with what's shown as "Total".
  const displayedTotal = computedTotal ?? order.totalPrice
  const balance = balanceDue(displayedTotal, order.paymentsSettledTotal)

  // ── Selected item for add-line form ───────────────────────────────────────
  const selectedMcItem = masterclassItems.find(i => i.id === newLineItemId)
  const isFlatUnit = selectedMcItem?.unitType === 'FLAT'
  // What the new line will come to: flat once, per person at the paying guests, per piece at the typed quantity.
  const lineTotal = selectedMcItem
    ? isFlatUnit
      ? selectedMcItem.pricePerUnit
      : selectedMcItem.unitType === 'PER_PERSON'
        ? Math.max(payingGuests, 1) * selectedMcItem.pricePerUnit
        : (parseInt(newLineQty) || 1) * selectedMcItem.pricePerUnit
    : 0
  // The picker lists the active items under their group's name, in the winery's group order.
  const pickerGroups = (() => {
    const names: string[] = []
    const byName = new Map<string, MasterclassItemRow[]>()
    for (const i of masterclassItems) {
      const k = i.groupName ?? ''
      if (!byName.has(k)) { byName.set(k, []); names.push(k) }
      byName.get(k)!.push(i)
    }
    return names.map(name => ({ name, items: byName.get(name)! }))
  })()

  function handleNewLineItemChange(itemId: string) {
    setNewLineItemId(itemId)
    const item = masterclassItems.find(i => i.id === itemId)
    if (!item) return
    if (item.unitType === 'PER_PERSON') setNewLineQty(String(payingGuests || 1))
    else setNewLineQty('1')
  }

  // ── Guest breakdown: Cancel puts the fields back to what the order stores ──────
  function resetGuests() {
    setVisitType(order.visitType as BookingVisitType)
    setGuestCountStr(String(order.guestCount))
    setBoxes(storedBoxes)
    setManualRates(storedManual)
    setHotDishVeg(order.hotDishVegetable ?? '')
    setHotDishMeat(order.hotDishMeat ?? '')
    setFoodNotes(order.foodNotes ?? '')
  }

  // ── Save enhanced fields (the Guest breakdown card's Save) ─────────────────
  async function saveGuests(): Promise<{ error: string } | null> {
    const result = await updateOrderEnhanced(order.id, {
      visitType,
      ...(isCompanyOrder ? { boxes: view.counts ?? undefined } : { guestCount: parseInt(guestCountStr) || 0 }),
      // No lunch guest, no dish (A-11).
      hotDishVegetable: view.lunchGuests > 0 ? hotDishVeg || null : null,
      hotDishMeat: view.lunchGuests > 0 ? hotDishMeat || null : null,
      foodNotes: foodNotes || null,
      // Seeded from the order's own rates (#50); the server re-prices only when something here was changed.
      // Companies only — an individual order has no typed rates (D-14).
      manualRates: isCompanyOrder ? manualFromStrings(manualRates) : NO_TYPED_RATES,
    })
    return 'error' in result ? result : null
  }

  // ── Add / remove masterclass line ─────────────────────────────────────────
  // ── Add / remove masterclass lines and extras — draft until Save (QA T-215, 2026-10-24) ─────────────────────
  // Inside edit mode adding and removing only change the list on screen (the Order total previews it); Save applies
  // the difference against the snapshot taken when the card opened, Cancel restores it — so Cancel throws away
  // everything, like every other card. New rows carry a temporary `new-…` id until saved.
  function handleAddLine() {
    if (!newLineItemId || !selectedMcItem) return
    const raw = newLineQty.trim()
    // Flat is once; per person is the paying guests (the server sets it from the order's guests); per piece is typed.
    const qty = isFlatUnit ? 1 : selectedMcItem.unitType === 'PER_PERSON' ? Math.max(payingGuests, 1) : raw === '' ? NaN : Number(raw)
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) {
      setInfoError(true)
      setInfoMsg('Quantity must be a whole number from 1 to 999.')
      return
    }
    setLines(prev => [
      ...prev,
      { id: `new-${Date.now()}`, masterclassItemId: newLineItemId, quantity: qty, pricePerUnit: selectedMcItem.pricePerUnit, groupName: selectedMcItem.groupName ?? null, masterclassItem: selectedMcItem },
    ])
    setNewLineItemId('')
    setNewLineQty('1')
    setAddingLine(false)
  }

  function handleRemoveLine(lineId: string) {
    setLines(prev => prev.filter(l => l.id !== lineId))
  }

  function handleAddExtra() {
    if (!newExtraLabel.trim() || !newExtraAmount) return
    // The field is labelled "Amount (₾)", so what the admin typed is lari.
    // Everything downstream — ExtraRow, extrasAmt, the formatTetri renders —
    // is tetri, so convert here (bug #45; NewOrderForm.tsx has always done it).
    const amount = fromMajor(parseFloat(newExtraAmount) || 0)
    setExtras(prev => [...prev, { id: `new-${Date.now()}`, label: newExtraLabel, amount }])
    setNewExtraLabel('')
    setNewExtraAmount('')
    setAddingExtra(false)
  }

  function handleRemoveExtra(extraId: string) {
    setExtras(prev => prev.filter(e => e.id !== extraId))
  }

  // ── Record an additional payment ───────────────────────────────────────────
  // Reads through as major units (₾) the same way the extras amount field
  // does, then converts at the boundary (bug #45's lesson) — the server is
  // still the one source of truth for "does this exceed the balance", this
  // is only what gates whether the buttons are clickable at all.
  async function handleRecordPayment(method: 'BANK_TRANSFER' | 'CASH') {
    const amount = fromMajor(parseFloat(recordAmount) || 0)
    if (amount <= 0) return
    setRecordLoading(true)
    setRecordMsg('')
    const result = await recordTopUpPayment(order.id, { amount, method })
    setRecordLoading(false)
    if ('error' in result) {
      setRecordMsg(result.error)
      return
    }
    setRecordingPayment(false)
    setRecordAmount('')
    setRecordMsg(at('orderDetail.recordPayment.savedOk'))
    setTimeout(() => setRecordMsg(''), 3000)
    // `paymentsSettledTotal` comes from the server component's own read of
    // every settled Payment row — a fresh one, not a locally-patched guess,
    // is what re-renders the balance-due figure correctly after this.
    router.refresh()
  }

  // ── Card-link top-up (Plan-PostPaymentExtras Chunk 4) ──────────────────────
  // Same major-unit-in-the-field, tetri-at-the-boundary pattern as the manual
  // record-payment field above. No router.refresh() after generating: the
  // balance-due figure only moves once this checkout actually settles via
  // the real Flitt callback, not when it's merely created.
  async function handleGenerateLink() {
    const amount = fromMajor(parseFloat(linkAmount) || 0)
    if (amount <= 0) return
    setLinkLoading(true)
    setLinkMsg('')
    const result = await startOrderTopUpCheckout(order.id, { amount })
    setLinkLoading(false)
    if ('error' in result) {
      setLinkMsg(result.error)
      return
    }
    setGeneratedLink({ checkoutUrl: result.checkoutUrl, paymentId: result.paymentId })
    setLinkCopied(false)
    setEmailSent(false)
  }

  async function handleCopyLink() {
    if (!generatedLink) return
    try {
      await navigator.clipboard.writeText(generatedLink.checkoutUrl)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 3000)
    } catch {
      // Clipboard permission can be denied — the link is still shown as
      // selectable text, so there's a fallback even if this silently fails.
    }
  }

  async function handleEmailLink() {
    if (!generatedLink) return
    setEmailSending(true)
    setLinkMsg('')
    const result = await sendOrderTopUpCheckoutEmail(order.id, generatedLink.paymentId, locale === 'ka' ? 'ka' : 'en')
    setEmailSending(false)
    if ('error' in result) {
      setLinkMsg(result.error)
      return
    }
    setEmailSent(true)
  }

  function handleCloseLinkPanel() {
    setStartingLink(false)
    setLinkAmount('')
    setLinkMsg('')
    setGeneratedLink(null)
    setLinkCopied(false)
    setEmailSent(false)
  }

  const vegItems = menuItems.filter(i => i.type === 'VEGETABLE')
  const meatItems = menuItems.filter(i => i.type === 'MEAT')

  // ── Derived status view ────────────────────────────────────────────────────
  const displayCode = flow.stage
  const flowSteps = buildFlowLine(BOOKING_STAGES, flow)
  // Only what this order has not reached, so the menu can never offer a step
  // the flow-line above it already shows as done. Invoice Sent and Paid are
  // appended rather than being part of the stage sequence: a booking can be
  // invoiced or paid at any stage, which is the whole point of the split.
  const menuSteps: { code: string; change: BookingStatusChange }[] = [
    ...unreachedStages(BOOKING_STAGES, flow)
      .filter(code => code !== CANCELLED)
      .map(code => ({ code, change: { kind: 'stage' as const, stage: code } })),
    ...(flow.invoiceSentAt == null && flow.paidAt == null
      ? [{ code: 'invoiced', change: { kind: 'invoiceSent' as const, value: true } }] : []),
    ...(flow.paidAt == null
      ? [{ code: 'paid', change: { kind: 'paid' as const, value: true } }] : []),
    ...(flow.stage !== CANCELLED
      ? [{ code: CANCELLED, change: { kind: 'stage' as const, stage: CANCELLED } }] : []),
  ]

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Page header */}
      <div className="flex items-start justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-bold" style={{ color: C.text }}>
            {order.name} {order.surname}
          </h1>
          <p className="text-sm" style={{ color: C.muted }}>
            {formatDate(order.date)} · {order.timeSlot} ·{' '}
            <span className="font-mono text-xs">#{order.id.slice(-8)}</span>
          </p>
        </div>

        {/* Action bar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status dropdown */}
          <div className="relative flex items-center gap-1.5" data-status-menu onClick={e => e.stopPropagation()}>
            {(() => {
              const cfg = styleFor(displayCode)
              return (
                <button
                  onClick={() => setStatusMenuOpen(o => !o)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-semibold border"
                  style={{ backgroundColor: cfg.bg, color: cfg.color, borderColor: cfg.color + '44' }}
                >
                  {labelFor(locale, displayCode)} ▾
                </button>
              )
            })()}
            {flow.invoiceSentAt != null && flow.paidAt == null && <InvoiceSentMark locale={locale} />}
            {statusMenuOpen && (
              <div
                className="absolute left-0 z-30 rounded-lg shadow-lg border py-1 mt-1"
                style={{ minWidth: 150, backgroundColor: 'var(--site-surface)', borderColor: C.border }}
                onClick={e => e.stopPropagation()}
              >
                {pickingPaymentMethod ? (
                  <div className="px-3 py-2">
                    <p className="text-xs mb-1.5" style={{ color: C.muted }}>{at('paymentMethod.howPaid')}</p>
                    <div className="flex flex-col gap-1">
                      <button onClick={() => handlePaymentMethodChosen('BANK_TRANSFER')}
                        className="text-left text-xs px-2 py-1 rounded font-medium text-white" style={{ backgroundColor: '#16a34a' }}>
                        {at('paymentMethod.bankTransfer')}
                      </button>
                      <button onClick={() => handlePaymentMethodChosen('CASH')}
                        className="text-left text-xs px-2 py-1 rounded font-medium text-white" style={{ backgroundColor: '#16a34a' }}>
                        {at('paymentMethod.cash')}
                      </button>
                      <button onClick={() => setPickingPaymentMethod(false)}
                        className="text-left text-xs px-2 py-0.5" style={{ color: C.muted }}>
                        {at('paymentMethod.cancel')}
                      </button>
                    </div>
                  </div>
                ) : menuSteps.map(step => (
                  <button
                    key={step.code}
                    onClick={() => handleStepClick(step)}
                    className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-amber-50"
                    style={{ color: C.text }}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: styleFor(step.code).color }} />
                    {labelFor(locale, step.code)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Print invoice */}
          <button
            onClick={() => { printPending.current = true; setPrintReady(true) }}
            title={at('orders.printInvoice')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium"
            style={{ borderColor: C.border, color: C.muted, backgroundColor: C.bg }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            {at('orderDetail.print')}
          </button>

          {/* Send invoice */}
          <button
            onClick={handleSendInvoice}
            disabled={sending || !order.email}
            title={order.email ? at('orderDetail.sendInvoiceTitle') : at('orderDetail.noEmailTitle')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white"
            style={{ backgroundColor: order.email ? C.wine : '#c8b89a', cursor: order.email ? 'pointer' : 'not-allowed' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="4" width="20" height="16" rx="2"/>
              <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
            </svg>
            {sending ? at('orders.emailModal.sending') : at('orders.emailModal.sendInvoice')}
          </button>

          {sendMsg && (
            <span className="text-xs font-medium" style={{ color: sendMsg.includes('✓') ? '#16a34a' : '#b91c1c' }}>
              {sendMsg}
            </span>
          )}
        </div>
      </div>

      {/* The merged one-line flow. Sits under the header rather than beside the
          pill because it is the whole story of the order, and the pill is only
          its current position. */}
      {!isCancelled(flow) && (
        <FlowLine steps={flowSteps} locale={locale} payments={order.payments} />
      )}

      {/* Print portal */}
      {printReady && typeof document !== 'undefined' && createPortal(
        <div id="invoice-portal">
          <InvoicePrint
            order={{
              id: order.id,
              date: order.date,
              timeSlot: order.timeSlot,
              visitType: order.visitType,
              guestCount: order.guestCount,
              tastingGuestCount: order.tastingGuestCount,
              lunchOnlyGuestCount: order.lunchOnlyGuestCount,
              lunchGuestCount: order.lunchGuestCount,
              freeGuestCount: order.freeGuestCount,
              tastingOnlyRate: order.tastingOnlyRate,
              lunchOnlyRate: order.lunchOnlyRate,
              tastingLunchRate: order.tastingLunchRate,
              registrationFeeSnapshot: order.registrationFeeSnapshot,
              name: order.name,
              surname: order.surname,
              totalPrice: order.totalPrice,
              paymentsSettledTotal: order.paymentsSettledTotal,
              company: order.company ? { name: order.company.name, identificationCode: order.company.identificationCode } : null,
              masterclassLines: lines.map(l => ({ name: l.masterclassItem.name, groupName: l.groupName ?? null, quantity: l.quantity, pricePerUnit: l.pricePerUnit })),
              extras: extras.map(e => ({ label: e.label, amount: e.amount })),
            }}
            payment={payment}
            detailed={detailed}
            displayName={displayName}
          />
        </div>,
        document.body
      )}

      {/* ── Booking Info — mirrors the booking forms' booking section (T-215 part 2): date, time, company (none = an
          individual), nationality, internal notes. Visit type and guests are in the Guest breakdown card below. ── */}
      <Card title={at('orderDetail.bookingInfo.title')} action={editButton('info')}>
        {editingInfo ? (
          <div className="flex flex-col gap-3 mb-3" onInput={clearRefusal}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs" style={{ color: C.faint }}>{at('orders.editPanel.date')}</span>
                <DateInput value={infoDate} onChange={v => { setInfoDate(v); clearRefusal() }} style={inputStyle} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs" style={{ color: C.faint }}>{at('orders.editPanel.time')}</span>
                <select value={infoTime} onChange={e => setInfoTime(e.target.value)} style={inputStyle}>
                  {slotOptions(order.timeSlot).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs" style={{ color: C.faint }}>{at('newOrder.bookingDetails.company')}</span>
              <select value={infoCompanyId} onChange={e => setInfoCompanyId(e.target.value)} disabled={isPaid} style={isPaid ? lockedInputStyle : inputStyle}>
                <option value="">{at('newOrder.bookingDetails.individual')}</option>
                {companies.filter(c => c.isBookingCompany || c.id === order.company?.id).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </label>
            {infoCompanyId && nationalityEnabled && (
              <div className="flex flex-col gap-1">
                <span className="text-xs" style={{ color: C.faint }}>{at('newOrder.contact.nationality')}</span>
                <NationalityPicker
                  value={infoNationalities}
                  onChange={v => { setInfoNationalities(v); clearRefusal() }}
                  placeholder={at('newOrder.contact.nationalityPlaceholder')}
                  emptyText={at('newOrder.contact.nationalityEmpty')}
                />
              </div>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-xs" style={{ color: C.faint }}>{at('orders.editPanel.notes')}</span>
              <textarea
                value={infoNotes}
                onChange={e => setInfoNotes(e.target.value)}
                rows={3}
                placeholder={at('orders.editPanel.notesPlaceholder')}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </label>
            <p className="text-xs" style={{ color: C.faint }}>
              {at(isPaid ? 'orderDetail.bookingInfo.companyLockedPaid' : 'orderDetail.bookingInfo.companyRepriceHint')}
            </p>
            {editActions()}
          </div>
        ) : (
          <>
            <InfoRow label={at('orderDetail.bookingInfo.date')} value={formatDate(order.date)} />
            <InfoRow label={at('orderDetail.bookingInfo.time')} value={order.timeSlot} />
            <InfoRow
              label={at('orderDetail.bookingInfo.visitType')}
              value={order.visitType === 'TASTING' ? at('orders.visit.tasting') : order.visitType === 'LUNCH' ? at('orders.visit.lunch') : at('orders.visit.tastingLunch')}
            />
            <InfoRow
              label={at('orderDetail.bookingInfo.bookingType')}
              value={
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: order.bookingType === 'COMPANY' ? '#fef3c7' : '#f0fdf4',
                    color: order.bookingType === 'COMPANY' ? '#92400e' : '#166534',
                  }}
                >
                  {order.bookingType === 'COMPANY' ? at('orders.type.company') : at('orders.type.individual')}
                </span>
              }
            />
            {order.company && <InfoRow label={at('orderDetail.bookingInfo.company')} value={order.company.name} />}
            {order.bookingType === 'COMPANY' && (nationalityEnabled || order.nationalities.length > 0) && (
              <InfoRow label={at('newOrder.contact.nationality')} value={order.nationalities.map(code => countryName(code)).join(', ') || undefined} />
            )}
          </>
        )}
        {!order.company && order.bookingType === 'COMPANY' && !editingInfo && (
          <div className="mt-2 mb-1 rounded-lg border p-3" style={{ borderColor: '#fbbf24', backgroundColor: '#fffbeb' }}>
            <p className="text-xs font-semibold mb-1" style={{ color: '#92400e' }}>
              {order.requestedCompanyName
                ? `Requested company: ${order.requestedCompanyName} — not linked yet`
                : 'No company linked yet'}
            </p>
            <p className="text-xs mb-2" style={{ color: '#92400e' }}>
              This came in through the "New Company?" flow before an account existed
              (Feature 180). It stays unpriced and unlinked until you connect it below —
              nothing does this automatically.
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={assignCompanyId}
                onChange={e => { setAssignCompanyId(e.target.value); setAssignMsg('') }}
                style={{ ...inputStyle, width: 'auto', flex: '1 1 200px' }}
              >
                <option value="">Select a company…</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button
                onClick={handleAssignCompany}
                disabled={!assignCompanyId || assigning}
                className="px-3 py-2 rounded-lg text-sm font-medium text-white flex-shrink-0"
                style={{ backgroundColor: C.wine, opacity: (!assignCompanyId || assigning) ? 0.6 : 1 }}
              >
                {assigning ? 'Linking…' : 'Link Company'}
              </button>
            </div>
            {assignMsg && (
              <p className="text-xs mt-1.5" style={{ color: assignError ? '#b91c1c' : '#166534' }}>
                {assignMsg}
              </p>
            )}
          </div>
        )}
        {!editingInfo && <InfoRow label={at('orderDetail.bookingInfo.totalGuests')} value={order.guestCount} />}
        {/* Phone / email live in the Contacts card for every booking (T-215): a company's Contact Person row, or an
            individual's booker — where Contacts → Edit changes them. */}
        {!editingInfo && <InfoRow label={at('orderDetail.bookingInfo.notes')} value={order.notes || undefined} />}
        {savedNote('info')}
      </Card>

      {/* ── Contacts, by role (Plan-ContactRoles Chunk 10 — finding F1). Edit = New Order's contact block: the contact
          person and every contact type, each with "Choose the …" from the company's people, which fills the boxes
          (T-215 part 2). An individual booking: just the booker. ── */}
      <Card title={at('orderDetail.contacts.title')} action={editButton('contact')}>
        {editingContact ? (
          <div className="flex flex-col gap-4 mb-3" onInput={clearRefusal}>
            <ContactRoleFields
              title={contactPersonRole ? roleLabel(contactPersonRole) : at('orderDetail.contacts.booker')}
              titleStyle={roleTitleStyle}
              picker={contactPersonRole && order.company ? rolePicker(contactPersonRole) : undefined}
              name={contactName}
              phone={infoPhone}
              email={infoEmail}
              onChange={(field, value) => {
                if (field === 'name') setContactName(value)
                else if (field === 'phone') setInfoPhone(value)
                else setInfoEmail(value)
              }}
              labels={roleLabels}
              inputStyle={inputStyle}
            />
            {order.company && extraRoles.map(role => {
              const chosen = selectedContacts[role.roleId]
              return (
                <ContactRoleFields
                  key={role.roleId}
                  title={roleLabel(role)}
                  titleStyle={roleTitleStyle}
                  picker={rolePicker(role)}
                  name={chosen?.name ?? ''}
                  phone={chosen?.phone ?? ''}
                  email={chosen?.email ?? ''}
                  onChange={(field, value) => setTypedContact(role.roleId, {
                    name: field === 'name' ? value : (chosen?.name ?? ''),
                    phone: field === 'phone' ? value : chosen?.phone,
                    email: field === 'email' ? value : chosen?.email,
                  })}
                  labels={roleLabels}
                  inputStyle={inputStyle}
                />
              )
            })}
            {order.company && roleChoices.some(r => r.people.length > 0) && (
              <p className="text-xs" style={{ color: C.faint }}>{at('orderDetail.contacts.pickHint')}</p>
            )}
            {editActions()}
          </div>
        ) : contactsNow.length === 0 && order.bookingType !== 'COMPANY' ? (
          // An individual has no OrderContact rows — the booker on the order is the contact person.
          <InfoRow
            label={at('orderDetail.contacts.booker')}
            value={[`${bookerNow.name} ${bookerNow.surname}`.trim(), bookerNow.phone, bookerNow.email].filter(Boolean).join(' · ')}
          />
        ) : (
          // A company booking: every contact type the booking forms ask for, empty ones as "—" — so an admin sees
          // "no guide yet" instead of the row not existing (Max, 2026-10-24). Then any recorded contact whose type has
          // since been switched off, so nothing that was recorded disappears.
          <>
            {contactRoles.map(role => {
              const c = contactsNow.find(x => x.roleId === role.roleId)
              return (
                <InfoRow
                  key={role.roleId}
                  label={roleLabel(role)}
                  value={c ? [c.name, c.phone, c.email].filter(Boolean).join(' · ') : undefined}
                />
              )
            })}
            {contactsNow.filter(c => !contactRoles.some(r => r.roleId === c.roleId)).map((c, i) => (
              <InfoRow
                key={`old-${i}`}
                label={locale === 'ka' ? c.roleLabelKa : c.roleLabelEn}
                value={[c.name, c.phone, c.email].filter(Boolean).join(' · ')}
              />
            ))}
            {contactRoles.length === 0 && contactsNow.length === 0 && (
              <p className="text-sm" style={{ color: C.faint }}>{at('orderDetail.contacts.none')}</p>
            )}
          </>
        )}
        {savedNote('contact')}
      </Card>

      {/* ── Invoice history — a permanent record of what was actually billed, since the
          email itself is rebuilt live from current order data on every send ── */}
      <Card title={at('orderDetail.invoiceHistory.title')}>
        {order.invoicesSent.length === 0 ? (
          <p className="text-sm" style={{ color: C.faint }}>{at('orderDetail.invoiceHistory.none')}</p>
        ) : (
          order.invoicesSent.map(inv => (
            <InfoRow
              key={inv.id}
              label={`${formatDate(new Date(inv.sentAt))} · ${new Date(inv.sentAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`}
              value={`${inv.recipientEmail} · ${formatTetri(asTetri(inv.totalPrice))}`}
            />
          ))
        )}
      </Card>

      {/* ── Guest Breakdown & Dishes — read-only until the pencil (D-1); locked once paid (bug #64) ── */}
      <Card title={at('orderDetail.guestBreakdown.title')} action={editButton('guests', isPaid)}>
        {isPaid && (
          <div
            className="text-xs rounded-lg p-3 mb-4"
            style={{ backgroundColor: '#fef3c7', color: '#92400e' }}
          >
            <strong>{at('orderDetail.guestBreakdown.lockedTitle')}</strong>{' '}
            {at('orderDetail.guestBreakdown.lockedDetail')}
          </div>
        )}

        {order.bookingType === 'COMPANY' && prices.length === 0 && (
          <div
            className="text-xs rounded-lg p-3 mb-4"
            style={{ backgroundColor: '#fee2e2', color: '#991b1b' }}
          >
            <strong>{at('orderDetail.guestBreakdown.noTiers', { name: order.company?.name ?? 'this company' })}</strong>{' '}
            {at('orderDetail.guestBreakdown.noTiersDetail')}{' '}
            <a href="/admin/companies" style={{ textDecoration: 'underline' }}>
              {at('orderDetail.guestBreakdown.addTiersLink')}
            </a>{' '}
            {at('orderDetail.guestBreakdown.thenComeBack')}
          </div>
        )}

        {editingCard !== 'guests' ? (
          <>
            <InfoRow
              label={at('orderDetail.bookingInfo.visitType')}
              value={order.visitType === 'TASTING' ? at('orders.visit.tasting') : order.visitType === 'LUNCH' ? at('orders.visit.lunch') : at('orders.visit.tastingLunch')}
            />
            <InfoRow
              label={at('orderDetail.guestBreakdown.guestsLabel')}
              value={isCompanyOrder
                ? [
                    ...PRODUCTS.filter(p => storedCounts[p] > 0).map(p => `${at(PRODUCT_AT[p])} ${storedCounts[p]}`),
                    ...(order.freeGuestCount > 0 ? [`${at('orderDetail.guestBreakdown.freeGuests')} ${order.freeGuestCount}`] : []),
                  ].join(' · ') || '0'
                : String(order.guestCount)}
            />
            <InfoRow label={at('orderDetail.guestBreakdown.hotDishVeg')} value={order.hotDishVegetable || at('orderDetail.guestBreakdown.none')} />
            <InfoRow label={at('orderDetail.guestBreakdown.hotDishMeat')} value={order.hotDishMeat || at('orderDetail.guestBreakdown.none')} />
            <InfoRow label={at('orderDetail.guestBreakdown.foodNotes')} value={order.foodNotes || undefined} />
            {savedNote('guests')}
          </>
        ) : (
          <div onInput={clearRefusal}>
            {/* Visit type and guests (Plan-PricingModel Chunk 8): a company's four boxes add up to the total — there
                is no typed party size any more (P-11) — and an individual keeps one guest count (D-5). */}
            <GuestFields
              at={at} isCompany={isCompanyOrder} visitType={visitType} onVisitType={setVisitType}
              guests={guestCountStr} onGuests={setGuestCountStr} boxes={boxes} onBox={setBox}
              view={view} disabled={isPaid} inputStyle={inputStyle}
            />

            {/* Typed rates for what the price table does not cover, or for an order with no table (A-9, E-3). */}
            <RateFields
              at={at} view={view} hasTable={prices.length > 0} companyName={order.company?.name ?? ''}
              manual={manualRates} onManual={(p, v) => setManualRates(prev => ({ ...prev, [p]: v }))}
              disabled={isPaid} inputStyle={inputStyle}
            />

            {/* A hot dish needs a lunch guest (A-11). */}
            {view.lunchGuests === 0 && (vegItems.length > 0 || meatItems.length > 0) && (
              <p className="text-xs mb-3" style={{ color: C.faint }}>{at(isCompanyOrder && visitType !== 'TASTING' ? 'orderForm.hotDishNeedsLunch' : 'orderForm.hotDishSwitchVisit')}</p>
            )}

            {vegItems.length > 0 && (
              <div className="mb-3">
                <label className="text-xs block mb-1" style={{ color: C.faint }}>
                  {at('orderDetail.guestBreakdown.hotDishVeg')}
                </label>
                <select
                  value={view.lunchGuests > 0 ? hotDishVeg : ''}
                  onChange={e => setHotDishVeg(e.target.value)}
                  disabled={isPaid || view.lunchGuests === 0}
                  style={isPaid || view.lunchGuests === 0 ? lockedInputStyle : inputStyle}
                >
                  <option value="">{at('orderDetail.guestBreakdown.none')}</option>
                  {vegItems.map(i => (
                    <option key={i.id} value={i.name}>{i.name}</option>
                  ))}
                </select>
              </div>
            )}

            {meatItems.length > 0 && (
              <div className="mb-3">
                <label className="text-xs block mb-1" style={{ color: C.faint }}>
                  {at('orderDetail.guestBreakdown.hotDishMeat')}
                </label>
                <select
                  value={view.lunchGuests > 0 ? hotDishMeat : ''}
                  onChange={e => setHotDishMeat(e.target.value)}
                  disabled={isPaid || view.lunchGuests === 0}
                  style={isPaid || view.lunchGuests === 0 ? lockedInputStyle : inputStyle}
                >
                  <option value="">{at('orderDetail.guestBreakdown.none')}</option>
                  {meatItems.map(i => (
                    <option key={i.id} value={i.name}>{i.name}</option>
                  ))}
                </select>
              </div>
            )}

            {vegItems.length === 0 && meatItems.length === 0 && (
              <p className="text-xs mb-3" style={{ color: C.faint }}>
                {at('orderDetail.guestBreakdown.noMenuItems')}{' '}
                <a href="/admin/menu-items" style={{ color: C.wine }}>
                  {at('orderDetail.guestBreakdown.menuItemsAdminLink')}
                </a>
                .
              </p>
            )}

            <div className="mb-4">
              <label className="text-xs block mb-1" style={{ color: C.faint }}>
                {at('orderDetail.guestBreakdown.foodNotes')}
              </label>
              <textarea
                value={foodNotes}
                onChange={e => setFoodNotes(e.target.value)}
                rows={2}
                disabled={isPaid}
                placeholder={at('orderDetail.guestBreakdown.foodNotesPlaceholder')}
                style={{ ...(isPaid ? lockedInputStyle : inputStyle), resize: 'vertical' }}
              />
            </div>

            {problem && <p className="text-xs mb-2" style={{ color: '#b91c1c' }}>{problem}</p>}
            {editActions(!!problem)}
          </div>
        )}
      </Card>

      {/* ── Add-ons (T-7) — read-only until the pencil (D-1); grouped by the winery's add-on groups. A per-person line is
          the paying guests and follows them (shown as "= paying guests"), a flat line is once, only a per-piece line
          has a typed quantity. The Unit column is folded into the item's second line so the card fits a phone. ── */}
      <Card title={at('orderDetail.addons.title')} action={editButton('mc')}>
        {lines.length > 0 && (
          <div className="rounded-lg border overflow-hidden mb-3" style={{ borderColor: C.border }}>
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  style={{
                    backgroundColor: 'var(--site-bg)',
                    borderBottom: `1px solid ${C.border}`,
                  }}
                >
                  {[at('orderDetail.masterclass.colItem'), at('orderDetail.masterclass.colQty'), at('orderDetail.masterclass.colTotal'), ...(editingCard === 'mc' ? [''] : [])].map((h, i) => (
                    <th
                      key={i}
                      className="text-left px-3 py-2 text-xs font-medium"
                      style={{ color: 'var(--site-secondary)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lineGroups.map(g => (
                  <Fragment key={g.name || '_ungrouped'}>
                    {(g.name || lineGroups.length > 1) && (
                      <tr style={{ backgroundColor: 'var(--site-bg)', borderTop: `1px solid ${C.border}` }}>
                        <td colSpan={editingCard === 'mc' ? 4 : 3} className="px-3 py-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--site-secondary)' }}>
                          {g.name || at('addons.ungrouped.title')}
                        </td>
                      </tr>
                    )}
                    {g.lines.map(l => {
                      const unit = l.masterclassItem.unitType as MasterclassUnit
                      const qty = lineQtyShown(l)
                      return (
                        <tr key={l.id} style={{ borderTop: `1px solid ${C.border}` }}>
                          <td className="px-3 py-2 text-sm" style={{ color: C.text }}>
                            {l.masterclassItem.name}
                            <span className="block text-xs" style={{ color: C.faint }}>
                              {formatTetri(asTetri(l.pricePerUnit))} {UNIT_LABELS[unit] ?? unit}
                              {unit === 'PER_PERSON' && ` · ${at('orderDetail.addons.followsGuests')}`}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-sm" style={{ color: C.muted }}>
                            {editingCard === 'mc' && unit === 'PER_PIECE' ? (
                              <input
                                type="number"
                                min={1}
                                max={999}
                                aria-label={`${at('orderDetail.masterclass.colQty')} — ${l.masterclassItem.name}`}
                                value={lineQty[l.id] ?? String(l.quantity)}
                                onChange={e => { setLineQty(prev => ({ ...prev, [l.id]: e.target.value })); clearRefusal() }}
                                style={{ ...inputStyle, width: 72 }}
                              />
                            ) : qty}
                          </td>
                          <td className="px-3 py-2 text-sm font-medium" style={{ color: C.wine }}>
                            {formatTetri(multiplyTetri(asTetri(l.pricePerUnit), qty), { decimals: true })}
                          </td>
                          {editingCard === 'mc' && (
                            <td className="px-3 py-2">
                              <button
                                onClick={() => handleRemoveLine(l.id)}
                                disabled={lineLoading}
                                className="text-xs px-2 py-1 rounded border"
                                style={{ borderColor: '#fca5a5', color: '#b91c1c' }}
                              >
                                {at('orderDetail.masterclass.remove')}
                              </button>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {lines.length === 0 && !addingLine && (
          <p className="text-sm mb-3" style={{ color: C.faint }}>
            {at('orderDetail.addons.none')}
          </p>
        )}

        {/* Add line form — edit mode only */}
        {editingCard === 'mc' && (addingLine ? (
          <div className="flex items-end gap-2 flex-wrap">
            <div style={{ flex: '1 1 160px' }}>
              <label className="text-xs block mb-1" style={{ color: C.faint }}>
                {at('orderDetail.masterclass.colItem')}
              </label>
              <select
                value={newLineItemId}
                onChange={e => handleNewLineItemChange(e.target.value)}
                style={inputStyle}
              >
                <option value="">{at('orderDetail.masterclass.selectItem')}</option>
                {pickerGroups.map(g => (
                  <optgroup key={g.name || '_ungrouped'} label={g.name || at('addons.ungrouped.title')}>
                    {g.items.map(i => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({UNIT_LABELS[i.unitType as MasterclassUnit]})
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {selectedMcItem?.unitType === 'PER_PIECE' && (
              <div style={{ width: 80 }}>
                <label className="text-xs block mb-1" style={{ color: C.faint }}>
                  {at('orderDetail.masterclass.colQty')}
                </label>
                <input
                  type="number"
                  min={1}
                  value={newLineQty}
                  onChange={e => setNewLineQty(e.target.value)}
                  style={inputStyle}
                />
              </div>
            )}

            {selectedMcItem && (
              <div className="text-sm pb-2" style={{ color: C.muted }}>
                = {formatTetri(asTetri(lineTotal), { decimals: true })}
              </div>
            )}

            <button
              onClick={handleAddLine}
              disabled={lineLoading || !newLineItemId}
              className="px-3 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: C.wine }}
            >
              {lineLoading ? '…' : at('orderDetail.masterclass.add')}
            </button>
            <button
              onClick={() => {
                setAddingLine(false)
                setNewLineItemId('')
                setNewLineQty('1')
              }}
              className="px-3 py-2 rounded-lg text-sm border"
              style={{ borderColor: C.border, color: C.muted }}
            >
              {at('orderDetail.masterclass.cancel')}
            </button>
          </div>
        ) : masterclassItems.length > 0 ? (
          <button
            onClick={() => setAddingLine(true)}
            className="text-sm font-medium"
            style={{ color: C.wine }}
          >
            {at('orderDetail.masterclass.addBtn')}
          </button>
        ) : (
          <p className="text-xs" style={{ color: C.faint }}>
            {at('orderDetail.masterclass.noActiveItems')}{' '}
            <a href="/admin/add-ons" style={{ color: C.wine }}>
              {at('orderDetail.masterclass.addSomeLink')}
            </a>
            .
          </p>
        ))}
        {editingCard === 'mc' ? <div className="mt-4 flex flex-col gap-3">{editActions()}</div> : savedNote('mc')}
      </Card>

      {/* ── Extra Charges — read-only until the pencil (D-1); label / amount edited in place, add / remove at once ── */}
      <Card title={at('orderDetail.extras.title')} action={editButton('ex')}>
        {extras.length > 0 && (
          <div className="space-y-2 mb-3">
            {extras.map(e => (
              <div key={e.id} className="flex items-center gap-2">
                {editingCard === 'ex' ? (
                  <>
                    <input
                      aria-label={at('orderDetail.extras.description')}
                      value={extraEdits[e.id]?.label ?? e.label}
                      onChange={ev => { const v = ev.target.value; setExtraEdits(prev => ({ ...prev, [e.id]: { label: v, amount: prev[e.id]?.amount ?? String(toMajor(asTetri(e.amount))) } })); clearRefusal() }}
                      style={{ ...inputStyle, flex: '1 1 auto' }}
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      aria-label={at('orderDetail.extras.amount')}
                      value={extraEdits[e.id]?.amount ?? String(toMajor(asTetri(e.amount)))}
                      onChange={ev => { const v = ev.target.value; setExtraEdits(prev => ({ ...prev, [e.id]: { label: prev[e.id]?.label ?? e.label, amount: v } })); clearRefusal() }}
                      style={{ ...inputStyle, width: 110 }}
                    />
                    <button
                      onClick={() => handleRemoveExtra(e.id)}
                      disabled={extraLoading}
                      className="text-xs px-2 py-1 rounded border flex-shrink-0"
                      style={{ borderColor: '#fca5a5', color: '#b91c1c' }}
                    >
                      {at('orderDetail.extras.remove')}
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm" style={{ color: C.text }}>
                      {e.label}
                    </span>
                    <span className="text-sm font-medium" style={{ color: C.wine }}>
                      {formatTetri(asTetri(e.amount), { decimals: true })}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {extras.length === 0 && !addingExtra && (
          <p className="text-sm mb-3" style={{ color: C.faint }}>
            {at('orderDetail.extras.none')}
          </p>
        )}

        {/* Add extra form — edit mode only */}
        {editingCard === 'ex' && (addingExtra ? (
          <div className="flex items-end gap-2 flex-wrap">
            <div style={{ flex: '1 1 140px' }}>
              <label className="text-xs block mb-1" style={{ color: C.faint }}>
                {at('orderDetail.extras.description')}
              </label>
              <input
                value={newExtraLabel}
                onChange={e => setNewExtraLabel(e.target.value)}
                placeholder={at('orderDetail.extras.descriptionPh')}
                style={inputStyle}
                onKeyDown={e => { if (e.key === 'Enter') handleAddExtra() }}
              />
            </div>
            <div style={{ width: 110 }}>
              <label className="text-xs block mb-1" style={{ color: C.faint }}>
                {at('orderDetail.extras.amount')}
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={newExtraAmount}
                onChange={e => setNewExtraAmount(e.target.value)}
                style={inputStyle}
                onKeyDown={e => { if (e.key === 'Enter') handleAddExtra() }}
              />
            </div>
            <button
              onClick={handleAddExtra}
              disabled={extraLoading || !newExtraLabel.trim() || !newExtraAmount}
              className="px-3 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: C.wine }}
            >
              {extraLoading ? '…' : at('orderDetail.extras.add')}
            </button>
            <button
              onClick={() => {
                setAddingExtra(false)
                setNewExtraLabel('')
                setNewExtraAmount('')
              }}
              className="px-3 py-2 rounded-lg text-sm border"
              style={{ borderColor: C.border, color: C.muted }}
            >
              {at('orderDetail.extras.cancel')}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAddingExtra(true)}
            className="text-sm font-medium"
            style={{ color: C.wine }}
          >
            {at('orderDetail.extras.addBtn')}
          </button>
        ))}
        {editingCard === 'ex' ? <div className="mt-4 flex flex-col gap-3">{editActions()}</div> : savedNote('ex')}
      </Card>

      {/* ── Order Total ── */}
      <Card title={at('orderDetail.total.title')}>
        <div className="space-y-1.5">
          {/* One line per product with the price-table row it used (finding 7); unedited, the rates it was sold at. */}
          <PriceLines at={at} view={shown} />
          {lines.map(l => (
            <div key={l.id} className="flex justify-between text-sm">
              <span style={{ color: C.muted }}>
                {l.masterclassItem.name} × {l.quantity}
              </span>
              <span style={{ color: C.text }}>
                {formatTetri(multiplyTetri(asTetri(l.pricePerUnit), l.quantity), { decimals: true })}
              </span>
            </div>
          ))}
          {extras.map(e => (
            <div key={e.id} className="flex justify-between text-sm">
              <span style={{ color: C.muted }}>{e.label}</span>
              <span style={{ color: C.text }}>{formatTetri(asTetri(e.amount), { decimals: true })}</span>
            </div>
          ))}
        </div>

        <div
          className="mt-3 pt-3 flex justify-between items-center border-t"
          style={{ borderColor: C.border }}
        >
          <span className="text-sm font-semibold" style={{ color: C.muted }}>
            {at('orderDetail.total.totalLabel')}
          </span>
          <span className="text-2xl font-bold" style={{ color: C.wine }}>
            {computedTotal != null
              ? formatTetri(asTetri(computedTotal), { decimals: true })
              : order.totalPrice != null
                ? formatTetri(asTetri(order.totalPrice), { decimals: true })
                : '—'}
          </span>
        </div>

        {/* Shown whenever the figure above is NOT what is stored, rather than on
            a guess about which path produced it. The old `payingGuests > 0`
            gate hid it on exactly the path where the number was wrong (#52),
            so a live preview read as the settled total. */}
        {edited && computedTotal != null && computedTotal !== order.totalPrice && (
          <p className="text-xs mt-1 text-right" style={{ color: C.faint }}>
            {at('orderDetail.total.livePreview')}
          </p>
        )}

        {/* Itemised payments (Plan-PostPaymentExtras Chunk 5, KnownBugs #64
            finding 4) — only once there's more than one, so the single-payment
            case (the overwhelming majority of orders) keeps rendering exactly
            as it always has: just the flow-line's "Paid · <method>" above,
            with nothing repeated down here. Two or more payments get a real,
            dated breakdown instead of the old single collapsed label, so a
            differently-paid top-up can never again be mistaken for how the
            original, larger charge was made. */}
        {order.payments.length > 1 && (
          <div className="mt-3 pt-3 border-t" style={{ borderColor: C.border }}>
            <p className="text-xs font-semibold mb-1.5" style={{ color: C.muted }}>
              {at('orderDetail.total.paymentsTitle')}
            </p>
            <div className="space-y-1">
              {order.payments.map((p, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span style={{ color: C.muted }}>
                    {paymentMethodLabel(p.method, locale)} · {formatDate(new Date(p.settledAt))}
                  </span>
                  <span style={{ color: C.text }}>{formatTetri(asTetri(p.amount), { decimals: true })}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Balance due (Plan-PostPaymentExtras Chunk 2, KnownBugs #64) — only
            once this order has been paid at least once. An unpaid order's
            "balance" is just its whole total, which the Total row above
            already says; repeating it here would be noise, not information. */}
        {isPaid && balance !== 0 && (
          <div
            className="mt-2 pt-2 flex justify-between items-center border-t"
            style={{ borderColor: C.border }}
          >
            <span className="text-sm font-semibold" style={{ color: balance > 0 ? '#92400e' : C.muted }}>
              {balance > 0 ? at('orderDetail.total.balanceDue') : at('orderDetail.total.credit')}
            </span>
            <span className="text-base font-bold" style={{ color: balance > 0 ? '#92400e' : C.muted }}>
              {formatTetri(asTetri(Math.abs(balance)), { decimals: true })}
            </span>
          </div>
        )}

        {/* Record an additional payment (Plan-PostPaymentExtras Chunk 3,
            KnownBugs #64) — only offered once there is a real, positive
            balance to collect. A credit (balance < 0) has nothing to record
            a payment against; that case is display-only. */}
        {isPaid && balance > 0 && (
          <div className="mt-3 pt-3 border-t" style={{ borderColor: C.border }}>
            {!recordingPayment ? (
              <button
                onClick={() => {
                  setRecordingPayment(true)
                  setRecordAmount(String(toMajor(balance)))
                  setRecordMsg('')
                }}
                className="text-sm font-medium"
                style={{ color: C.wine }}
              >
                {at('orderDetail.recordPayment.button')}
              </button>
            ) : (
              <div className="flex items-end gap-2 flex-wrap">
                <div style={{ width: 110 }}>
                  <label className="text-xs block mb-1" style={{ color: C.faint }}>
                    {at('orderDetail.extras.amount')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={toMajor(balance)}
                    step="0.01"
                    value={recordAmount}
                    onChange={e => setRecordAmount(e.target.value)}
                    style={inputStyle}
                    disabled={recordLoading}
                  />
                </div>
                <div style={{ flex: '1 1 160px' }}>
                  <p className="text-xs mb-1.5" style={{ color: C.muted }}>{at('paymentMethod.howPaid')}</p>
                  <div className="flex gap-1.5 flex-wrap">
                    <button
                      onClick={() => handleRecordPayment('BANK_TRANSFER')}
                      disabled={recordLoading || !((parseFloat(recordAmount) || 0) > 0)}
                      className="text-xs px-2 py-1.5 rounded font-medium text-white disabled:opacity-50"
                      style={{ backgroundColor: '#16a34a' }}
                    >
                      {at('paymentMethod.bankTransfer')}
                    </button>
                    <button
                      onClick={() => handleRecordPayment('CASH')}
                      disabled={recordLoading || !((parseFloat(recordAmount) || 0) > 0)}
                      className="text-xs px-2 py-1.5 rounded font-medium text-white disabled:opacity-50"
                      style={{ backgroundColor: '#16a34a' }}
                    >
                      {at('paymentMethod.cash')}
                    </button>
                    <button
                      onClick={() => { setRecordingPayment(false); setRecordAmount(''); setRecordMsg('') }}
                      disabled={recordLoading}
                      className="text-xs px-2 py-1.5"
                      style={{ color: C.muted }}
                    >
                      {at('paymentMethod.cancel')}
                    </button>
                  </div>
                </div>
              </div>
            )}
            {recordMsg && (
              <p className="text-xs mt-2" style={{ color: C.faint }}>{recordMsg}</p>
            )}
          </div>
        )}

        {/* Card-link top-up (Plan-PostPaymentExtras Chunk 4, KnownBugs #64) —
            the guest's own card, alongside the manual entry above. Same gate
            as "Record payment": only offered against a real, positive
            balance. */}
        {isPaid && balance > 0 && (
          <div className="mt-3 pt-3 border-t" style={{ borderColor: C.border }}>
            {!startingLink ? (
              <button
                onClick={() => {
                  setStartingLink(true)
                  setLinkAmount(String(toMajor(balance)))
                  setLinkMsg('')
                }}
                className="text-sm font-medium"
                style={{ color: C.wine }}
              >
                {at('orderDetail.topUpCheckout.button')}
              </button>
            ) : !generatedLink ? (
              <div className="flex items-end gap-2 flex-wrap">
                <div style={{ width: 110 }}>
                  <label className="text-xs block mb-1" style={{ color: C.faint }}>
                    {at('orderDetail.extras.amount')}
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={toMajor(balance)}
                    step="0.01"
                    value={linkAmount}
                    onChange={e => setLinkAmount(e.target.value)}
                    style={inputStyle}
                    disabled={linkLoading}
                  />
                </div>
                <button
                  onClick={handleGenerateLink}
                  disabled={linkLoading || !((parseFloat(linkAmount) || 0) > 0)}
                  className="text-xs px-2 py-1.5 rounded font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: '#16a34a' }}
                >
                  {at('orderDetail.topUpCheckout.generate')}
                </button>
                <button
                  onClick={handleCloseLinkPanel}
                  disabled={linkLoading}
                  className="text-xs px-2 py-1.5"
                  style={{ color: C.muted }}
                >
                  {at('paymentMethod.cancel')}
                </button>
              </div>
            ) : (
              <div>
                <label className="text-xs block mb-1" style={{ color: C.faint }}>
                  {at('orderDetail.topUpCheckout.linkLabel')}
                </label>
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  {/* The full URL is deliberately not shown: it is long, it carries a payment
                      token, and nobody needs to read it. A QR opens in a dialog for scanning;
                      Copy and Email below are the other ways to hand it over. */}
                  <QrCodeDialog
                    url={generatedLink.checkoutUrl}
                    triggerLabel={at('orderDetail.topUpCheckout.showQr')}
                    title={at('orderDetail.topUpCheckout.qrTitle')}
                    hint={at('orderDetail.topUpCheckout.qrHint')}
                    qrAriaLabel={at('orderDetail.topUpCheckout.qrAria')}
                    openLabel={at('orderDetail.topUpCheckout.openLink')}
                    closeLabel={at('orderDetail.topUpCheckout.closeQr')}
                    triggerClassName="text-xs px-2 py-1.5 rounded font-medium"
                    triggerStyle={{ border: `1px solid ${C.wine}`, color: C.wine }}
                  />
                  <button
                    onClick={handleCopyLink}
                    className="text-xs px-2 py-1.5 rounded font-medium"
                    style={{ border: `1px solid ${C.border}`, color: C.text }}
                  >
                    {linkCopied ? at('orderDetail.topUpCheckout.copied') : at('orderDetail.topUpCheckout.copy')}
                  </button>
                  {order.email ? (
                    <button
                      onClick={handleEmailLink}
                      disabled={emailSending}
                      className="text-xs px-2 py-1.5 rounded font-medium text-white disabled:opacity-50"
                      style={{ backgroundColor: '#16a34a' }}
                    >
                      {emailSent ? at('orderDetail.topUpCheckout.emailSent') : at('orderDetail.topUpCheckout.emailButton')}
                    </button>
                  ) : null}
                  <button
                    onClick={handleCloseLinkPanel}
                    className="text-xs px-2 py-1.5"
                    style={{ color: C.muted }}
                  >
                    {at('orderDetail.topUpCheckout.done')}
                  </button>
                </div>
                {!order.email && (
                  <p className="text-xs" style={{ color: C.faint }}>{at('orderDetail.topUpCheckout.noEmail')}</p>
                )}
              </div>
            )}
            {linkMsg && (
              <p className="text-xs mt-2" style={{ color: C.faint }}>{linkMsg}</p>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
