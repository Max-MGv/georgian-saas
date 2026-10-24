'use server'

import { db, withTenantDb, type TxClient } from '@/lib/db'
import { writeOrderContacts, syncOrderContactPerson, type IncomingContact, type OrderContactView } from '@/lib/orderContacts'
import { invoiceRecipientsFor } from '@/lib/contactResolution'
import { recordManualPayment, reverseManualPayments, recordAdditionalPayment } from '@/lib/payments/manualPayment'
import { startTopUpCheckout } from '@/lib/payments/topUpCheckout'
import { sendTopUpCheckoutEmail } from '@/lib/emails/topUpCheckoutEmail'
import { recordOrderEvent, eventTypeForChange } from '@/lib/orderEvents'
import { asTetri, balanceDue, toMajor, type Tetri } from '@/lib/money'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'
import { adminQuote, boxColumns, countsOf, notOffered, priceCounts, PRODUCT_LABEL, PRODUCTS, ratesForCounts, ratesFromProductSnapshot, totalGuests, type BookingVisitType, type Counts, type ManualRates, type Product, type ProductRates } from '@/lib/pricingUtils'
import { checkAdminOrder, checkMasterclassLines, MASTERCLASS_CATALOGUE_SELECT, type AdminOrderProblem } from '@/lib/bookingInput'
import { lineIdentity, lineTotals, sumAmountLines, sumQuantityLines } from '@/lib/orderLines'
import { NO_TYPED_RATES } from '@/lib/adminOrderView'
import { adminT } from '@/lib/adminT'
import { getSetting } from '@/app/actions/settings'
import { sendInvoiceEmail } from '@/lib/emails/invoiceEmail'
import { resolveTenantTheme } from '@/lib/themePresets'
import type { BookingStage } from '@prisma/client'
import { COUNTRIES, countryName } from '@/lib/countries'
import { splitFullName } from '@/lib/splitFullName'
import { isIsoDate } from '@/lib/isoDate'
import {
  bookingStagePatch,
  invoiceSentPatch,
  paidPatch,
  isBookingStage,
  NEW_ORDER_COLUMNS,
} from '@/lib/statusWrite'
// Types come from lib/, never from a 'use server' file — MaintenanceNotes §24.
import type { BookingStatusChange } from '@/lib/statusWrite'
import { NOT_ABANDONED, paymentFilterWhere } from '@/lib/orderFilters'

// Not exported: a 'use server' file may only export async functions (MaintenanceNotes §24).
const VALID_COUNTRY_CODES = new Set(COUNTRIES.map(c => c.code))

export async function deleteOrder(id: string) {
  await requireAdmin()
  const tenantId = await getTenantId()
  await withTenantDb(tenantId, tx => tx.order.deleteMany({ where: { id, tenantId } }))
  revalidatePath('/admin/orders')
  revalidatePath('/admin/statistics')
  return { success: true }
}

/**
 * The orders table's quick-edit panel: date, time and contact details. Guest numbers are NOT edited here
 * (T-152): the total is the sum of the guest boxes and picks the price, so it changes on the order page
 * (`updateOrderEnhanced`), where boxes, total and price move together. This used to write `guestCount` alone.
 */
export async function updateOrder(id: string, data: {
  date: string
  timeSlot: string
  name: string
  surname: string
  phone: string
  email: string
  notes: string
}) {
  await requireAdmin()
  // One Name box, like both booking forms (T-215): the surname is whatever follows the first word, possibly empty.
  if (!data.name.trim()) return { error: 'Name is required.' }
  // A cleared date input sends '' (Invalid Date).
  if (!isIsoDate(data.date)) return { error: 'Please choose a valid date.' }
  if (!/^\d{1,2}:\d{2}$/.test(data.timeSlot)) return { error: 'Please choose a time.' }

  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async tx => {
    const updated = await tx.order.updateMany({
      where: { id, tenantId },
      data: {
        date: new Date(data.date),
        timeSlot: data.timeSlot,
        name: data.name.trim(),
        surname: data.surname.trim(),
        phone: data.phone.trim() || null,
        email: data.email.trim() || null,
        notes: data.notes.trim() || null,
      },
    })
    if (updated.count > 0) {
      /**
       * Keep the contact_person snapshot in step with the columns just edited.
       *
       * Decision 4 makes `OrderContact` the source of truth and these four columns a
       * denormalised copy of one of its rows. Editing the copy alone left the original stale
       * with nothing to reconcile them — found by an audit, and a poor place to reintroduce
       * exactly the drift this rework exists to end. No-op when the order has no contact row,
       * which is every INDIVIDUAL booking and every pre-migration order.
       */
      await syncOrderContactPerson(tx, {
        tenantId,
        orderId: id,
        name: `${data.name} ${data.surname}`.trim(),
        phone: data.phone,
        email: data.email,
      })
    }
    return updated
  })
  if (result.count === 0) return { error: 'Order not found.' }
  revalidatePath('/admin/orders')
  revalidatePath(`/admin/orders/${id}`)
  return { success: true }
}

/**
 * The order page's Booking Info card (T-215 part 2, Plan-OrderPageMirror): date, time, internal notes, the company
 * (or none = an individual booking) and the nationality tags — what the booking forms take in that section.
 *
 * Changing the company re-prices the order from the new company's price table (an individual: the Individuals
 * table, no registration fee — D-14), with the same `adminQuote` as New Order, and only before payment (bug #64 —
 * the same lock as the guests). The contacts are not carried across: the people picked belonged to the old company,
 * so their links are cleared (snapshots kept); an individual booking keeps no contact rows at all.
 */
export async function updateOrderBooking(id: string, data: {
  date: string
  timeSlot: string
  notes: string
  /** null = an individual booking. */
  companyId: string | null
  /** ISO codes; company bookings only — dropped for an individual, unknown codes ignored (as in createOrderAdmin). */
  nationalities: string[]
}): Promise<{ success: true } | { error: string }> {
  await requireAdmin()
  if (!isIsoDate(data.date)) return { error: 'Please choose a valid date.' }
  if (!/^\d{1,2}:\d{2}$/.test(data.timeSlot)) return { error: 'Please choose a time.' }
  const tenantId = await getTenantId()
  const en = (p: AdminOrderProblem) => adminT('en', p.key, p.vars)

  const result = await withTenantDb(tenantId, async tx => {
    const order = await tx.order.findFirst({ where: { id, tenantId }, include: { masterclassLines: true, extras: true } })
    if (!order) return { error: 'Order not found.' } as const

    const newCompanyId = data.companyId || null
    const companyChanged = newCompanyId !== order.companyId
    let pricing: Record<string, unknown> = {}
    if (companyChanged) {
      if (order.paidAt) {
        return { error: 'This order has already been paid, so its company can no longer be changed — the price would no longer match what the guest paid.' } as const
      }
      const company = newCompanyId
        ? await tx.company.findFirst({ where: { id: newCompanyId, tenantId, isBookingCompany: true, isIndividual: false }, include: { prices: true } })
        : null
      if (newCompanyId && !company) return { error: 'Company not found.' } as const
      const individual = !company
      const counts = countsOf(order)
      if (individual) {
        // An individual books one product, no free guests, never Lunch only (D-5) — the same shape New Order allows.
        const nonZero = PRODUCTS.filter(p => counts[p] > 0).length
        if (order.visitType === 'LUNCH' || counts.lunchOnly > 0 || counts.free > 0 || nonZero > 1) {
          return { error: 'An individual booking has one product and no free guests. Change the guests in the Guest breakdown first, then switch it to Individual.' } as const
        }
      }
      const prices = individual ? await individualsTable(tx, tenantId) : company.prices
      if (individual && prices.length === 0) return { error: en({ key: 'orderForm.err.noIndividualsTable' }) } as const
      const quote = adminQuote(prices, individual ? 0 : company.registrationFee, counts, NO_TYPED_RATES)
      if (quote.kind === 'missing') {
        const key = individual ? 'orderForm.err.individualsMissing' : 'orderForm.err.missingRate'
        return { error: en({ key, vars: { products: quote.products.map(p => PRODUCT_LABEL[p]).join(', ') } }) } as const
      }
      const lines = lineTotals(order)
      // A company with no price table yet: priced later on the Guest breakdown (typed rates), as on New Order.
      pricing = quote.kind === 'unpriced'
        ? { totalPrice: lines.masterclass + lines.extras, tastingOnlyRate: null, lunchOnlyRate: null, tastingLunchRate: null, registrationFeeSnapshot: null }
        : {
            totalPrice: priceCounts(quote.rates, counts, lines),
            tastingOnlyRate: quote.rates.tastingOnly, lunchOnlyRate: quote.rates.lunchOnly,
            tastingLunchRate: quote.rates.tastingLunch, registrationFeeSnapshot: quote.rates.registration,
          }
      if (individual) await tx.orderContact.deleteMany({ where: { orderId: id, tenantId } })
      else await tx.orderContact.updateMany({ where: { orderId: id, tenantId }, data: { personId: null } })
    }

    const isCompany = !!newCompanyId
    await tx.order.update({
      where: { id },
      data: {
        date: new Date(data.date),
        timeSlot: data.timeSlot,
        notes: data.notes.trim() || null,
        companyId: newCompanyId,
        bookingType: isCompany ? 'COMPANY' : 'INDIVIDUAL',
        nationalities: isCompany ? Array.from(new Set((data.nationalities ?? []).filter(c => VALID_COUNTRY_CODES.has(c)))) : [],
        ...pricing,
      },
    })
    return { success: true as const }
  })
  if ('error' in result) return result
  revalidatePath('/admin/orders')
  revalidatePath(`/admin/orders/${id}`)
  return { success: true }
}

/**
 * The order page's Contacts card (T-215 part 2): the contact person (one Name box, like both booking forms) and every
 * other contact type (Guide…), each possibly picked from the order's company's people. The order's contact rows are
 * rewritten through `writeOrderContacts` — the same checks as every order-creation path (role valid for bookings,
 * person really in this company in that role, else the link is dropped and the typed facts kept) — and the contact
 * person is copied into `Order.name/surname/phone/email`. An individual booking has no contact rows: only the four
 * columns change.
 */
export async function updateOrderContacts(id: string, data: {
  fullName: string
  phone: string
  email: string
  contacts?: IncomingContact[]
}): Promise<{ success: true; contacts: OrderContactView[] } | { error: string }> {
  await requireAdmin()
  const fullName = data.fullName.trim()
  if (!fullName) return { error: 'Name is required.' }
  const tenantId = await getTenantId()

  const result = await withTenantDb(tenantId, async tx => {
    const order = await tx.order.findFirst({ where: { id, tenantId }, select: { id: true, companyId: true } })
    if (!order) return { error: 'Order not found.' } as const
    await tx.order.update({
      where: { id },
      data: { ...splitFullName(fullName), phone: data.phone.trim() || null, email: data.email.trim() || null },
    })
    if (order.companyId) {
      await tx.orderContact.deleteMany({ where: { orderId: id, tenantId } })
      await writeOrderContacts(tx, {
        tenantId,
        target: { orderId: id },
        companyId: order.companyId,
        module: 'BOOKING',
        contacts: data.contacts,
        fallbackContactPerson: { name: fullName, phone: data.phone.trim() || null, email: data.email.trim() || null },
      })
    }
    // What is now recorded, read back — the page shows this at once instead of waiting for router.refresh(), which
    // lags several seconds; opening the editor in that gap used to prefill the old contacts (QA T-215, case C4).
    const rows = await tx.orderContact.findMany({ where: { orderId: id, tenantId }, include: { role: true }, orderBy: { role: { sortOrder: 'asc' } } })
    const contacts: OrderContactView[] = rows.map(c => ({
      roleId: c.roleId, roleKey: c.role.key, personId: c.personId, roleLabelEn: c.role.labelEn, roleLabelKa: c.role.labelKa,
      name: c.nameSnapshot, phone: c.phoneSnapshot, email: c.emailSnapshot,
    }))
    return { success: true as const, contacts }
  })
  if ('error' in result) return result
  revalidatePath('/admin/orders')
  revalidatePath(`/admin/orders/${id}`)
  return result
}

/**
 * Typed per-person rates from an admin screen: each null, or whole tetri from 1 to ₾100,000. Anything else (a
 * fraction, a negative, a huge number from a crafted call) is refused with a message instead of reaching
 * Prisma's Int column as a 500 (blind review, Chunk 11). Not exported: a 'use server' file only exports actions.
 */
function badManualRates(m: unknown): boolean {
  if (!m || typeof m !== 'object') return true
  return PRODUCTS.some(p => {
    const v = (m as Record<string, unknown>)[p]
    return v != null && !(typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 10_000_000)
  })
}

/**
 * The tenant's Individuals price table — what an individual order is priced from on the admin screens, by its
 * guest count, like a company (D-14). The public form reads the same row (createBooking.ts). Empty = none yet.
 */
async function individualsTable(tx: TxClient, tenantId: string) {
  const row = await tx.company.findFirst({ where: { tenantId, isIndividual: true }, include: { prices: true } })
  return row?.prices ?? []
}

export async function updateOrderEnhanced(
  id: string,
  data: {
    /** Admins may change the visit type before payment (D-9); it must agree with the boxes (A-6). */
    visitType: BookingVisitType
    /** Individual orders: the one guest count (D-5). Ignored for a company order. */
    guestCount?: number
    /** Company orders: the four boxes; the total is their sum (D-3). Ignored for an individual order. */
    boxes?: Counts
    hotDishVegetable: string | null
    hotDishMeat: string | null
    foodNotes: string | null
    /** TETRI per product; the order page prefills them from the order's own snapshot. See adminQuote. Ignored for an individual order (D-14). */
    manualRates: ManualRates
  }
): Promise<{ success: true } | { error: string }> {
  await requireAdmin()
  const tenantId = await getTenantId()

  const result = await withTenantDb(tenantId, async (tx) => {
    const order = await tx.order.findFirst({
      where: { id, tenantId },
      include: {
        company: { include: { prices: true } },
        masterclassLines: true,
        extras: true,
      },
    })
    if (!order) return { error: 'Order not found' } as const

    // Bug #64: once real money has been charged (`Order.paidAt` set), the
    // guest count, tasting/lunch split, rates and food details this function
    // touches must become read-only historical facts. Before this check,
    // saving here silently moved `Order.totalPrice` (and the rate snapshots)
    // while the already-settled `Payment.amount` never moved — every screen
    // agreed with itself but not with what the gateway actually charged, with
    // nothing anywhere flagging the gap. Every field this function's `data`
    // accepts is one of the locked ones, so once paid there is nothing left
    // for it to safely do — see vault/Plan-PostPaymentExtras.md Chunk 1. Use
    // "add an extra" (`addOrderExtra`) to describe what changed instead.
    if (order.paidAt) {
      return {
        error:
          'This order has already been paid, so its guest count, tasting/lunch split, ' +
          'rates, and food details are locked — changing them here would silently ' +
          'disagree with the amount already charged to the guest. To bill for something ' +
          'that changed (e.g. extra guests joining after payment), add it as an extra on ' +
          'this order instead.',
      } as const
    }

    if (badManualRates(data.manualRates)) return { error: 'A typed rate must be a whole amount above 0.' } as const
    // An individual order is edited as one guest count on one product (D-5). One that was stored any other way
    // (free guests, two products — only possible for orders converted from the old model) is refused rather than
    // silently rewritten into that shape (blind review, Chunk 11).
    if (order.bookingType === 'INDIVIDUAL') {
      const nonZero = PRODUCTS.filter(p => countsOf(order)[p] > 0).length
      if (order.freeGuestCount > 0 || nonZero > 1) {
        return { error: 'This individual booking has free guests or more than one product, which this page cannot show — its guests cannot be changed here.' } as const
      }
    }

    // Who is coming — the check the order page shows inline (Plan-PricingModel Chunk 8, A-6, A-11).
    const en = (p: AdminOrderProblem) => adminT('en', p.key, p.vars)
    const checked = checkAdminOrder({
      bookingType: order.bookingType, visitType: data.visitType, guestCount: data.guestCount, boxes: data.boxes,
      hotDishVegetable: data.hotDishVegetable, hotDishMeat: data.hotDishMeat,
    })
    if (!checked.ok) return { error: en(checked.problem) } as const
    const { counts, visitType } = checked

    // Re-price only when what is sold changed: the visit type, a box, or a typed rate. Saving a food note no
    // longer re-prices an order at today's price table (it used to, on every Save).
    // D-14: an individual order has no typed rates — only its visit type or guest count re-prices it, from the
    // Individuals table.
    const individual = order.bookingType === 'INDIVIDUAL'
    const manual = individual ? NO_TYPED_RATES : data.manualRates
    const stored = countsOf(order)
    const snapshot = ratesFromProductSnapshot(order)
    const typed = (p: Product) => { const v = manual[p]; return v != null && v > 0 ? v : null }
    const changed = visitType !== order.visitType
      || PRODUCTS.some(p => counts[p] !== stored[p]) || counts.free !== stored.free
      || PRODUCTS.some(p => counts[p] > 0 && typed(p) != null && typed(p) !== (snapshot?.[p] ?? null))

    let pricing: { totalPrice: number; rates: ProductRates | null } | null = null
    if (changed) {
      const { masterclass: masterclassAmt, extras: extrasAmt } = lineTotals(order)
      // The company's table at today's rows (each product by its own count), typed rates for the rest — the
      // same adminQuote the page previews with, so the stored total is the one the admin saw. An individual
      // order: the Individuals table, no registration fee (D-14).
      const prices = individual ? await individualsTable(tx, tenantId) : order.company?.prices ?? []
      if (individual && prices.length === 0) return { error: en({ key: 'orderForm.err.noIndividualsTable' }) } as const
      const quote = adminQuote(prices, individual ? 0 : order.company?.registrationFee ?? 0, counts, manual)
      if (quote.kind === 'missing') {
        const key = individual ? 'orderForm.err.individualsMissing' : 'orderForm.err.missingRate'
        return { error: en({ key, vars: { products: quote.products.map(p => PRODUCT_LABEL[p]).join(', ') } }) } as const
      }
      if (quote.kind === 'unpriced') {
        // An order that already has a price never drops back to "price later" because its rates were cleared.
        if (snapshot) {
          const needed = PRODUCTS.filter(p => counts[p] > 0)
          return { error: en({ key: 'orderForm.err.rateRequired', vars: { products: needed.map(p => PRODUCT_LABEL[p]).join(', ') } }) } as const
        }
        pricing = { totalPrice: masterclassAmt + extrasAmt, rates: null }
      } else {
        pricing = { totalPrice: priceCounts(quote.rates, counts, { masterclass: masterclassAmt, extras: extrasAmt }), rates: quote.rates }
      }
    }

    await tx.order.update({
      where: { id },
      data: {
        visitType,
        guestCount: totalGuests(counts),
        ...boxColumns(counts),
        hotDishVegetable: data.hotDishVegetable || null,
        hotDishMeat: data.hotDishMeat || null,
        foodNotes: data.foodNotes || null,
        // Re-priced: the snapshot moves with it and records what the order is sold at now — the opposite of
        // recalcOrderTotal, where a line change never disturbs the agreed rates (chunk 4).
        ...(pricing ? {
          totalPrice: pricing.totalPrice,
          ...(pricing.rates ? {
            tastingOnlyRate: pricing.rates.tastingOnly, lunchOnlyRate: pricing.rates.lunchOnly,
            tastingLunchRate: pricing.rates.tastingLunch, registrationFeeSnapshot: pricing.rates.registration,
          } : {}),
        } : {}),
      },
    })
    return { success: true as const }
  })

  if ('error' in result) return result
  revalidatePath('/admin/orders')
  revalidatePath(`/admin/orders/${id}`)
  return { success: true }
}

export async function createOrderAdmin(data: {
  companyId: string | null
  /** Individuals: Tasting / Tasting + Lunch. Companies may also book Lunch only (D-9, A-6). */
  visitType: BookingVisitType
  date: string
  timeSlot: string
  name: string
  surname: string
  phone: string | null
  email: string | null
  notes: string | null
  /** Individuals only: the one guest count (D-5). Ignored for a company. */
  guestCount?: number
  /** Companies only: the four boxes; the total is their sum, never typed (D-3 — P-11). Ignored for an individual. */
  boxes?: Counts
  hotDishVegetable: string | null
  hotDishMeat: string | null
  foodNotes: string | null
  /** TETRI per product, null = nothing typed. Used only for products the company's table does not price (E-3, A-9); ignored for an individual (D-14). */
  manualRates: ManualRates
  /** The price always comes from the masterclass catalogue, never from the browser (Q-1, #93). */
  masterclassLines: { masterclassItemId: string; quantity: number }[]
  extras: { label: string; amount: number }[]
  /**
   * One entry per contact role, from the admin's inline pickers (Plan-ContactRoles Chunk 10).
   * Written via `writeOrderContacts()`, the one base every order-creation path shares, which
   * re-verifies every `roleId` and `personId` against `companyId` under the tenant first.
   */
  contacts?: IncomingContact[]
  /**
   * ISO 3166-1 alpha-2 codes for a COMPANY booking — the same tag set the public form sends
   * (Plan-CompanyNationality). Unknown codes are dropped; individuals never carry any.
   */
  nationalities?: string[]
}): Promise<{ orderId: string } | { error: string }> {
  const actor = await requireAdmin()
  // `surname` is no longer required: the form has one Name box (like the public one) and
  // splits it with splitFullName(), so a one-word name arrives with an empty surname.
  if (!data.name.trim()) return { error: 'Name is required.' }
  if (!data.date) return { error: 'Date is required.' }
  if (!isIsoDate(data.date)) return { error: 'Please choose a valid date.' }
  if (!Array.isArray(data.masterclassLines) || !Array.isArray(data.extras)) return { error: 'The order could not be read — please reload and try again.' }
  if (badManualRates(data.manualRates)) return { error: 'A typed rate must be a whole amount above 0.' }
  const en = (p: AdminOrderProblem) => adminT('en', p.key, p.vars)

  // Who is coming — the same check the form shows inline (Plan-PricingModel Chunk 8, A-6, A-11).
  const checked = checkAdminOrder({
    bookingType: data.companyId ? 'COMPANY' : 'INDIVIDUAL', visitType: data.visitType,
    guestCount: data.guestCount, boxes: data.boxes, hotDishVegetable: data.hotDishVegetable, hotDishMeat: data.hotDishMeat,
  })
  if (!checked.ok) return { error: en(checked.problem) }
  const { counts, visitType } = checked
  if (!data.extras.every(e => Number.isInteger(e.amount) && e.amount > 0 && e.label.trim())) {
    return { error: 'Each extra charge needs a description and an amount above 0.' }
  }

  const tenantId = await getTenantId()
  const extrasAmt = sumAmountLines(data.extras)

  const created = await withTenantDb(tenantId, async (tx) => {
    const company = data.companyId
      ? await tx.company.findFirst({ where: { id: data.companyId, tenantId }, include: { prices: true } })
      : null
    if (data.companyId && !company) return { error: 'Company not found.' } as const

    const catalogue = data.masterclassLines.length > 0
      ? await tx.masterclassItem.findMany({ where: { tenantId }, select: MASTERCLASS_CATALOGUE_SELECT })
      : []
    const checkedLines = checkMasterclassLines(data.masterclassLines, catalogue)
    if (!checkedLines.ok) {
      return { error: 'A masterclass line is not valid (unknown or inactive item, or a quantity that is not a whole number from 1 to 999).' } as const
    }
    const masterclassLines = checkedLines.lines
    const masterclassAmt = sumQuantityLines(masterclassLines)

    // The company's table by each product's own count, the admin's typed rate for anything it does not price;
    // no table and nothing typed = priced later (total = the lines), as before. An individual order: the
    // Individuals table only — no typed rates, no "price later", refused while there is no table (D-14).
    const individual = !company
    const prices = individual ? await individualsTable(tx, tenantId) : company.prices
    if (individual && prices.length === 0) return { error: en({ key: 'orderForm.err.noIndividualsTable' }) } as const
    const quote = adminQuote(prices, company?.registrationFee ?? 0, counts, individual ? NO_TYPED_RATES : data.manualRates)
    if (quote.kind === 'missing') {
      const key = individual ? 'orderForm.err.individualsMissing' : 'orderForm.err.missingRate'
      return { error: en({ key, vars: { products: quote.products.map(p => PRODUCT_LABEL[p]).join(', ') } }) } as const
    }
    const rates = quote.kind === 'priced' ? quote.rates : null
    const totalPrice = rates ? priceCounts(rates, counts, { masterclass: masterclassAmt, extras: extrasAmt }) : masterclassAmt + extrasAmt

    const order = await tx.order.create({
      data: {
        bookingType: data.companyId ? 'COMPANY' : 'INDIVIDUAL',
        visitType,
        date: new Date(data.date),
        timeSlot: data.timeSlot,
        guestCount: totalGuests(counts),
        ...boxColumns(counts),
        hotDishVegetable: data.hotDishVegetable || null,
        hotDishMeat: data.hotDishMeat || null,
        foodNotes: data.foodNotes || null,
        name: data.name.trim(),
        surname: data.surname.trim(),
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
        notes: data.notes?.trim() || null,
        // Same rule as createBooking: company bookings only, valid codes only, no duplicates.
        nationalities: data.companyId
          ? Array.from(new Set((data.nationalities ?? []).filter(code => VALID_COUNTRY_CODES.has(code))))
          : [],
        totalPrice,
        // What it was sold at, per product (null = no guests on it, or not priced yet).
        tastingOnlyRate: rates?.tastingOnly ?? null,
        lunchOnlyRate: rates?.lunchOnly ?? null,
        tastingLunchRate: rates?.tastingLunch ?? null,
        registrationFeeSnapshot: rates ? rates.registration : null,
        tenantId,
        ...NEW_ORDER_COLUMNS,
        ...(data.companyId ? { companyId: data.companyId } : {}),
        masterclassLines: masterclassLines.length
          ? { create: masterclassLines }
          : undefined,
        extras: data.extras.length
          ? { create: data.extras.map(e => ({ label: e.label.trim(), amount: e.amount })) }
          : undefined,
      },
    })
    /**
     * Who to contact, through the same base the public form uses. `fallbackContactPerson`
     * covers a company order whose admin typed contact-person details without picking from the
     * inline dropdown — the same shape a guest produces by choosing "I am not on this list".
     *
     * Until an audit caught it, this path wrote `Order.name/surname/phone/email` and **no**
     * `OrderContact` rows at all, so every admin-created company booking had an empty source
     * of truth while the public form's had a full one. Two write paths, one of them forgotten
     * — which is the exact drift the shared base exists to make impossible.
     */
    await writeOrderContacts(tx, {
      tenantId,
      target: { orderId: order.id },
      companyId: data.companyId || null,
      module: 'BOOKING',
      contacts: data.contacts,
      fallbackContactPerson: {
        name: `${data.name} ${data.surname}`.trim(),
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
      },
    })

    // First row of the timeline. ADMIN here, unlike the public form's GUEST —
    // a walk-in entered by staff and a guest's own submission are different
    // facts and the history should not blur them (chunk 5).
    await recordOrderEvent(tx, {
      tenantId,
      orderId: order.id,
      type: 'CREATED',
      actorType: 'ADMIN',
      actorId: actor?.id ?? null,
      toStage: order.stage,
      payload: { totalPrice: order.totalPrice, bookingType: order.bookingType, guestCount: order.guestCount },
    })
    return { orderId: order.id }
  })
  if (!created.orderId) return { error: created.error ?? 'The order could not be created.' }

  revalidatePath('/admin/orders')
  revalidatePath('/admin/statistics')
  return { orderId: created.orderId }
}

export async function sendOrderInvoice(
  orderId: string,
  customMessage: string,
  locale: 'en' | 'ka' = 'ka',
  // Lets the admin pick a company person's email as the recipient instead of the order's own
  // (Plan-ContactRoles Chunk 11) — falls back to order.email when omitted. Re-checked against
  // lib/contactResolution.ts's invoiceRecipientsFor() below, not trusted as-is.
  recipientEmail?: string
): Promise<{ success: true } | { error: string }> {
  await requireAdmin()
  const tenantId = await getTenantId()
  try {
    const order = await withTenantDb(tenantId, tx =>
      tx.order.findFirst({
        where: { id: orderId, tenantId },
        include: {
          company: { select: { id: true, name: true, identificationCode: true } },
          masterclassLines: { include: { masterclassItem: true } },
          extras: true,
          // A re-sent invoice on an order that's already been paid something
          // must say so — Plan-PostPaymentExtras Chunk 2 / KnownBugs #64's own
          // live repro was exactly this: a freshly re-sent invoice stating
          // the new, higher total with no mention that part of it was
          // already collected.
          payments: {
            where: { settledAt: { not: null }, reversedAt: null },
            select: { amount: true },
          },
        },
      })
    )

    if (!order) return { error: 'Order not found.' }
    let recipient = order.email
    if (recipientEmail && recipientEmail !== order.email) {
      const eligible = order.companyId ? await invoiceRecipientsFor(tenantId, [order.companyId]) : []
      if (!eligible.some(p => p.email === recipientEmail)) return { error: 'That recipient is not valid for this order.' }
      recipient = recipientEmail
    }
    if (!recipient) return { error: 'This order has no email address.' }

    const [recipientName, personalNumber, bankName, bankCode, iban, wineryAddress, wineryEmail, tenant] = await Promise.all([
      getSetting('payment_recipient_name'),
      getSetting('payment_personal_number'),
      getSetting('payment_bank_name'),
      getSetting('payment_bank_code'),
      getSetting('payment_iban'),
      getSetting('contact_address'),
      getSetting('contact_email'),
      db.tenant.findUnique({ where: { id: tenantId }, select: { displayName: true, name: true, theme: true } }),
    ])

    await sendInvoiceEmail({
      tenantId,
      name: order.name,
      surname: order.surname,
      email: recipient,
      date: order.date,
      timeSlot: order.timeSlot,
      visitType: order.visitType,
      guestCount: order.guestCount,
      // The template keeps its prop names: "tasting" = Tasting only, "lunch" = Tasting & Lunch (T-152).
      tastingGuestCount: order.tastingOnlyGuests ?? 0,
      lunchOnlyGuestCount: order.lunchOnlyGuests ?? 0,
      lunchGuestCount: order.tastingLunchGuests ?? 0,
      freeGuestCount: order.freeGuestCount,
      // Per-product lines on the invoice come from what the order was sold at.
      tastingOnlyRate: order.tastingOnlyRate,
      lunchOnlyRate: order.lunchOnlyRate,
      tastingLunchRate: order.tastingLunchRate,
      registrationFeeSnapshot: order.registrationFeeSnapshot,
      totalPrice: order.totalPrice ?? 0,
      // Only meaningful once something has actually settled — see this
      // field's doc comment on InvoiceEmailData.
      paymentsSettledTotal: order.payments.reduce((sum, p) => sum + p.amount, 0),
      companyName: order.company?.name ?? null,
      identificationCode: order.company?.identificationCode ?? null,
      masterclassLines: order.masterclassLines.map(l => ({
        name: lineIdentity(l).name,
        quantity: l.quantity,
        pricePerUnit: l.pricePerUnit,
      })),
      extras: order.extras.map(e => ({ label: e.label, amount: e.amount })),
      payment: { recipientName, personalNumber, bankName, bankCode, iban },
      customMessage,
      wineryName: tenant?.displayName ?? tenant?.name ?? '',
      wineryAddress,
      wineryEmail,
      theme: resolveTenantTheme(tenant?.theme ?? null),
      locale,
    })

    await withTenantDb(tenantId, async tx => {
      // The permanent record of what this invoice actually said — see InvoiceSent's schema
      // comment. sendOrderInvoice() builds the email live from the order's current data every
      // time it's called, so without this row a later edit to price/guests/masterclass lines
      // leaves no trace of what was originally billed. One row per send, never updated.
      await tx.invoiceSent.create({
        data: {
          tenantId,
          orderId,
          recipientEmail: recipient,
          recipientName: `${order.name} ${order.surname}`.trim(),
          companyName: order.company?.name ?? null,
          totalPrice: order.totalPrice ?? 0,
          guestCount: order.guestCount,
          tastingOnlyGuests: order.tastingOnlyGuests ?? 0,
          lunchOnlyGuests: order.lunchOnlyGuests ?? 0,
          tastingLunchGuests: order.tastingLunchGuests ?? 0,
          freeGuestCount: order.freeGuestCount,
          visitType: order.visitType,
          masterclassLines: order.masterclassLines.map(l => ({
            name: lineIdentity(l).name,
            quantity: l.quantity,
            pricePerUnit: l.pricePerUnit,
          })),
          extras: order.extras.map(e => ({ label: e.label, amount: e.amount })),
          customMessage,
          locale,
        },
      })

      // Sending an invoice stamps a date and nothing else. It records that we
      // have asked for money, which says nothing about whether the visit has
      // happened — so it does not touch `stage`, and it is recorded whatever
      // stage the booking is at, including a completed one being billed after
      // the fact. Under the previous design this was a rung on a payment ladder,
      // which is why marking such an order paid used to erase it.
      //
      // Only stamped once — a resend does not move this date — but the InvoiceSent
      // row above is written on every send regardless, same as Payment being
      // append-only for every payment event.
      if (order.invoiceSentAt == null) {
        await tx.order.update({
          where: { id: orderId },
          data: invoiceSentPatch(true, toCurrentDates(order), new Date()),
        })
      }
    })

    revalidatePath('/admin/orders')
    return { success: true }
  } catch {
    return { error: 'Failed to send email. Please try again.' }
  }
}

function csvCell(val: string | number | null | undefined): string {
  const s = String(val ?? '')
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Distinct ISO codes actually present across this tenant's orders (Plan-CompanyNationality) —
 * drives the Orders filter dropdown's options, not the full ~195-country list. Prisma's
 * `distinct` doesn't unnest array columns, so this is a raw query; `unnest` + `DISTINCT` is the
 * standard Postgres way to flatten `nationalities` across every row into one deduped list.
 */
export async function getDistinctOrderNationalities(tenantId: string): Promise<string[]> {
  const rows = await withTenantDb(tenantId, tx =>
    tx.$queryRaw<{ code: string }[]>`SELECT DISTINCT unnest("nationalities") as code FROM "Order" WHERE "tenantId" = ${tenantId} ORDER BY code ASC`
  )
  return rows.map(r => r.code)
}

export async function exportOrdersCsv(filters: {
  dateFrom?: string
  dateTo?: string
  companyId?: string
  /** A `BookingStage` value. An unknown one is ignored rather than cast. */
  status?: string
  /** `paid` | `unpaid` | `invoiced`, derived from the dates. AND'd with `status`. */
  payment?: string
  /** ISO 3166-1 code (Plan-CompanyNationality) — matches orders whose `nationalities` array includes it. */
  nationality?: string
}): Promise<string> {
  await requireAdmin()
  const tenantId = await getTenantId()
  const orders = await withTenantDb(tenantId, tx => tx.order.findMany({
    where: {
      tenantId,
      ...(filters.dateFrom || filters.dateTo ? {
        date: {
          ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
          ...(filters.dateTo   ? { lte: new Date(filters.dateTo + 'T23:59:59') } : {}),
        },
      } : {}),
      ...(filters.companyId === '__individual__'
        ? { bookingType: 'INDIVIDUAL' }
        : filters.companyId
          ? { companyId: filters.companyId }
          : {}),
      // An abandoned order is not an order, so it is never exported — the same
      // exclusion the screen this was exported from applies. It was missing
      // here, so a CSV silently carried rows the list on screen did not show.
      ...NOT_ABANDONED,
      ...(filters.status && isBookingStage(filters.status) ? { stage: filters.status } : {}),
      ...paymentFilterWhere(filters.payment),
      ...(filters.nationality ? { nationalities: { has: filters.nationality } } : {}),
    },
    include: {
      company: true,
      // Every live (settled, not reversed) payment — Balance Due (GEL) below
      // needs the true collected total, per Plan-PostPaymentExtras Chunk 2 /
      // KnownBugs #64: a CSV that only ever showed "Total (GEL)" is exactly
      // the kind of screen that bug describes, since an accountant reading it
      // has no way to know a post-payment extra moved the total without
      // moving what was actually charged.
      payments: {
        where: { settledAt: { not: null }, reversedAt: null },
        select: { amount: true },
      },
    },
    orderBy: { date: 'desc' },
  }))

  // Stage and payment are separate columns, or a completed-but-unpaid booking
  // exports as indistinguishable from a paid one. Invoice Sent gets its own
  // date rather than collapsing into Payment, since an order can be both
  // invoiced and paid — which the old payment ladder could not represent.
  const header = ['Date', 'Time', 'Name', 'Surname', 'Company', 'Booking Type', 'Visit Type', 'Guests', 'Nationality', 'Total (GEL)', 'Balance Due (GEL)', 'Status', 'Payment', 'Paid At', 'Invoice Sent At', 'Email', 'Phone', 'Notes']
  const rows = orders.map(o => {
    // Only populated once the order has actually been paid something —
    // otherwise "balance due" is just the whole total, which the Total (GEL)
    // column already says, and repeating it on every unpaid row would be
    // noise rather than the flag this column exists to raise.
    const paymentsSettledTotal = o.payments.reduce((sum, p) => sum + p.amount, 0)
    const balance = o.paidAt ? balanceDue(o.totalPrice, paymentsSettledTotal) : 0
    return [
    o.date.toLocaleDateString('en-GB'),
    o.timeSlot,
    o.name,
    o.surname,
    o.company?.name ?? '',
    o.bookingType,
    o.visitType,
    o.guestCount,
    o.nationalities.map(countryName).join('; '),
    // The header says "Total (GEL)" and this shipped as raw tetri, so every
    // exported row read 100x high in a file an accountant opens in Excel
    // (bug #46). toMajor rather than formatTetri: a ₾ in the cell would make
    // it text and break the column's arithmetic.
    o.totalPrice != null ? toMajor(asTetri(o.totalPrice)) : '',
    o.paidAt && balance !== 0 ? toMajor(balance) : '',
    o.stage,
    o.paidAt ? 'paid' : o.invoiceSentAt ? 'invoiced' : 'unpaid',
    o.paidAt ? o.paidAt.toLocaleDateString('en-GB') : '',
    o.invoiceSentAt ? o.invoiceSentAt.toLocaleDateString('en-GB') : '',
    o.email ?? '',
    o.phone ?? '',
    o.notes ?? '',
    ]
  })

  return [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')
}

/**
 * Links a booking that came in with no company (Feature 180's "New Company?"
 * flow — `companyId: null`, `requestedCompanyName` set) to a real Company row
 * once the winery has created one, and re-prices it against that company's
 * tiers. There is no other way for such an order to ever gain a companyId —
 * see vault/Features/Feature 180's "no auto-link" note — so this is the one
 * place that gap gets closed, by hand, per order.
 *
 * Deliberately refuses to touch an order that already has a companyId: this
 * is a one-time link-up for an order that has never had a company, not a
 * general "reassign company" tool.
 */
/**
 * Contact roles and this file: **re-decided in Chunk 9, not inherited.**
 *
 * The previous plan left `updateOrderEnhanced()` and `assignOrderCompany()` alone because
 * there was no code step for an admin to hook a picker into. Pickers now exist on the admin
 * side, so that reasoning expired and the question was asked again. The answer is still "no
 * contact writes here", for two new reasons:
 *
 * - `updateOrderEnhanced()` edits the *visit* — guest counts, dishes, notes. Contacts are a
 *   different thing on a different screen; putting them here would put the same edit in two
 *   places, which is the duplication this whole rework exists to undo.
 * - `assignOrderCompany()` links a company to an order that had none. Tempting to synthesise
 *   a `contact_person` row from `Order.name/surname/phone/email` at that moment — but nobody
 *   *picked* anyone, so the row would assert an attribution that was never made, and its
 *   snapshots would only duplicate columns that already exist. An order with no OrderContact
 *   rows is an ordinary, expected state: every INDIVIDUAL booking and every pre-migration
 *   order is in it, so Chunk 10's surfaces must fall back to those columns regardless.
 *
 * If contacts ever become editable after the fact, that belongs in Chunk 10's order detail
 * screen, next to where they are displayed.
 */
export async function assignOrderCompany(
  orderId: string,
  companyId: string
): Promise<{ success: true; totalPrice: number } | { error: string }> {
  await requireAdmin()
  const tenantId = await getTenantId()

  const result = await withTenantDb(tenantId, async (tx) => {
    const order = await tx.order.findFirst({
      where: { id: orderId, tenantId },
      include: { masterclassLines: true, extras: true },
    })
    if (!order) return { error: 'Order not found.' } as const
    if (order.companyId) return { error: 'This order already has a company linked.' } as const

    const company = await tx.company.findFirst({
      where: { id: companyId, tenantId },
      include: { prices: true },
    })
    if (!company) return { error: 'Company not found.' } as const

    const { masterclass: masterclassAmt, extras: extrasAmt } = lineTotals(order)

    // The three snapshots record the tier rates this order was actually sold
    // at, exactly as createBooking.ts does. They were NOT written here until
    // 2026-09-18 (bug #47): this path produced a brand-new order with null
    // snapshots, and the nullable columns are supposed to mean "created before
    // the columns existed". recalcOrderTotal then fell into its legacy branch
    // and re-priced the whole booking off whatever the company's tiers said
    // that day — the precise repricing bug chunk 4 was written to close.
    // Product model (Plan-PricingModel Chunk 7): each of the order's boxes looks up its own row of
    // the company's ladder (D-2). A company with no ladder leaves the order unpriced (0 + its lines),
    // as before; a ladder that does not price a box the order has is refused, never priced at ₾0.
    // Linking never rewrites money that is already settled or deliberately set (blind review, Chunk 11):
    // - a paid order is only linked — its total and rates are what the guest was charged;
    // - a company with no price table yet leaves an order that already has a price (typed on the order page) alone.
    // Only a priced table re-prices the order, which is the point of linking (E-7).
    if (order.paidAt || (!company.prices.length && ratesFromProductSnapshot(order))) {
      await tx.order.update({ where: { id: orderId }, data: { companyId, bookingType: 'COMPANY' } })
      return { success: true as const, totalPrice: order.totalPrice ?? 0 }
    }

    const counts = countsOf(order)
    const lines = { masterclass: masterclassAmt, extras: extrasAmt }
    let totalPrice = masterclassAmt + extrasAmt
    let snapshot: { tastingOnlyRate: number | null; lunchOnlyRate: number | null; tastingLunchRate: number | null; registrationFeeSnapshot: number | null } =
      { tastingOnlyRate: null, lunchOnlyRate: null, tastingLunchRate: null, registrationFeeSnapshot: null }
    if (company.prices.length) {
      const rates = ratesForCounts(company.prices, counts, company.isIndividual ? 0 : company.registrationFee)
      const missing = notOffered(rates, counts)
      if (missing.length) {
        return { error: `The price table for ${company.name} has no price for ${missing.map(p => PRODUCT_LABEL[p]).join(' / ')}. Add one on that company's price table first, then link it.` } as const
      }
      totalPrice = priceCounts(rates, counts, lines)
      snapshot = { tastingOnlyRate: rates.tastingOnly, lunchOnlyRate: rates.lunchOnly, tastingLunchRate: rates.tastingLunch, registrationFeeSnapshot: rates.registration }
    }

    await tx.order.update({
      where: { id: orderId },
      data: { companyId, bookingType: 'COMPANY', totalPrice, ...snapshot },
    })
    return { success: true as const, totalPrice }
  })

  if ('error' in result) return result
  revalidatePath('/admin/orders')
  revalidatePath(`/admin/orders/${orderId}`)
  return result
}

/** The date fields a patch needs, in the shape `statusWrite` expects. */
function toCurrentDates(o: {
  confirmedAt: Date | null
  completedAt: Date | null
  invoiceSentAt: Date | null
  paidAt: Date | null
}) {
  return {
    confirmedAt: o.confirmedAt,
    finishedAt: o.completedAt,
    invoiceSentAt: o.invoiceSentAt,
    paidAt: o.paidAt,
  }
}

export async function changeBookingStatus(
  orderId: string,
  change: BookingStatusChange
): Promise<{ success: true } | { error: string }> {
  const actor = await requireAdmin()
  const tenantId = await getTenantId()

  // Validated before anything is read or written. The root cause this whole
  // redesign was opened for was an unvalidated `status: string` that neither
  // the app nor the database rejected; a stage arriving from a dropdown is
  // still a string at runtime however well-typed the call site looks.
  if (change.kind === 'stage' && !isBookingStage(change.stage)) {
    return { error: 'Unknown status.' }
  }

  try {
    // Read first so a patch can preserve a date that already exists rather than
    // re-stamping it — the moment an order was really confirmed must not drift
    // forward every time someone touches the row.
    const result = await withTenantDb(tenantId, async tx => {
      const current = await tx.order.findFirst({
        where: { id: orderId, tenantId },
        // `stage` is selected for the history row's fromStage, not for the patch.
        // `totalPrice` is read for the ledger row a manual payment writes (chunk 6).
        select: { stage: true, totalPrice: true, confirmedAt: true, completedAt: true, invoiceSentAt: true, paidAt: true },
      })
      if (!current) return { count: 0 }
      const now = new Date()
      const dates = toCurrentDates(current)
      const data =
        change.kind === 'stage'
          ? bookingStagePatch(change.stage as BookingStage, dates, now)
          : change.kind === 'paid'
            ? paidPatch(change.value, dates, now)
            : change.kind === 'invoiceSent'
              ? invoiceSentPatch(change.value, dates, now)
              : { abandonedAt: null }
      const updated = await tx.order.updateMany({ where: { id: orderId, tenantId }, data })
      if (updated.count > 0) {
        // Every payment is a ledger row now, whatever channel it arrived
        // through — not just the ones Flitt settled (chunk 6).
        if (change.kind === 'paid') {
          if (change.value) {
            await recordManualPayment(tx, {
              tenantId, orderId, amount: asTetri(current.totalPrice ?? 0), at: now,
              method: change.method,
            })
          } else {
            await reverseManualPayments(tx, { orderId, at: now })
          }
        }
        // Same transaction as the change, so history can never claim something
        // that was rolled back (chunk 5).
        await recordOrderEvent(tx, {
          tenantId,
          orderId,
          type: eventTypeForChange(change),
          actorType: 'ADMIN',
          actorId: actor?.id ?? null,
          fromStage: change.kind === 'stage' ? current.stage : null,
          toStage: change.kind === 'stage' ? change.stage : null,
        })
      }
      return updated
    })
    if (result.count === 0) return { error: 'Order not found.' }
    revalidatePath('/admin/orders')
    revalidatePath(`/admin/orders/${orderId}`)
    revalidatePath('/admin/abandoned')
    return { success: true }
  } catch {
    return { error: 'Failed to update status.' }
  }
}

/**
 * Collect part or all of the balance due on an already-paid order as a real,
 * independent second payment (Plan-PostPaymentExtras Chunk 3, KnownBugs #64
 * finding 1) — an extra reprices `Order.totalPrice` immediately (Chunk 2),
 * but nothing before this action could actually record what the guest paid
 * for the difference without either silently doing nothing
 * (`recordManualPayment`'s existing guard, correctly protecting its own
 * different job) or editing the original, already-collected payment.
 *
 * Admin-initiated and deliberate: does not consult `shouldTakePayment()` —
 * no module toggle, section toggle, or company override applies to a top-up
 * the admin themselves chose to record after the fact (ground rule 5).
 */
export async function recordTopUpPayment(
  orderId: string,
  data: { amount: Tetri; method: 'BANK_TRANSFER' | 'CASH' }
): Promise<{ success: true } | { error: string }> {
  const actor = await requireAdmin()
  const tenantId = await getTenantId()

  const result = await withTenantDb(tenantId, async tx => {
    const recorded = await recordAdditionalPayment(tx, {
      orderId,
      tenantId,
      amount: data.amount,
      method: data.method,
      at: new Date(),
    })
    if ('error' in recorded) return recorded
    // Same transaction as the payment it describes, so history can never
    // claim a top-up that got rolled back (matches changeBookingStatus's own
    // PAID/UNPAID event, and addOrderExtra's EXTRA_ADDED/EXTRA_REMOVED).
    await recordOrderEvent(tx, {
      tenantId,
      orderId,
      type: 'ADDITIONAL_PAYMENT_RECORDED',
      actorType: 'ADMIN',
      actorId: actor?.id ?? null,
      payload: { amount: data.amount, method: data.method },
    })
    return { success: true as const }
  })
  if ('error' in result) return result

  revalidatePath('/admin/orders')
  revalidatePath(`/admin/orders/${orderId}`)
  return result
}

/**
 * Start a real Flitt checkout for part or all of the balance due, so the
 * guest can pay it themselves by card (Plan-PostPaymentExtras Chunk 4,
 * KnownBugs #64) — the card-paying sibling of `recordTopUpPayment` above.
 *
 * Deliberately returns the checkout URL to the caller rather than emailing
 * it itself: generating a real checkout (a real Payment row, a real Flitt
 * API call) and sending mail to a guest are two different kinds of action
 * with two different blast radii, and keeping them separate lets the admin
 * see/copy the link before deciding to email it (or send it some other way
 * entirely — WhatsApp, SMS) rather than an unreviewable one-click send.
 * `sendOrderTopUpCheckoutEmail` below is the follow-up step.
 *
 * Admin-initiated and deliberate: does not consult `shouldTakePayment()` —
 * see `startTopUpCheckout`'s own doc comment (ground rule 5).
 */
export async function startOrderTopUpCheckout(
  orderId: string,
  data: { amount: Tetri }
): Promise<{ success: true; checkoutUrl: string; paymentId: string } | { error: string }> {
  await requireAdmin()
  const tenantId = await getTenantId()

  const order = await withTenantDb(tenantId, tx => tx.order.findFirst({
    where: { id: orderId, tenantId },
    select: { name: true, surname: true, date: true, timeSlot: true },
  }))
  if (!order) return { error: 'Order not found.' }

  const dateStr = order.date.toLocaleDateString('en-GB')
  const result = await startTopUpCheckout({
    orderId,
    tenantId,
    amount: data.amount,
    orderDesc: `Balance top-up, ${order.name} ${order.surname}, ${dateStr} ${order.timeSlot}`,
  })
  if ('error' in result) return result

  // Nothing display-relevant changes yet — the balance only moves once this
  // checkout actually settles, through the real Flitt callback (settle.ts),
  // same as any other checkout. No revalidatePath needed here.
  return result
}

/**
 * Email a previously-generated top-up checkout link to the guest (Plan-
 * PostPaymentExtras Chunk 4) — reuses the existing email-sending
 * infrastructure the same way `sendOrderInvoice` does (same sender config
 * via `sendTenantEmail`, same tenant-theme/address lookups).
 *
 * Looks the Payment row up by id rather than trusting a caller-supplied
 * checkoutUrl/amount pair — the same reasoning `startTopUpCheckout` uses for
 * why it re-reads its own just-created row: the server is the one source of
 * truth for what a guest is being asked to pay, never the browser.
 */
export async function sendOrderTopUpCheckoutEmail(
  orderId: string,
  paymentId: string,
  locale: 'en' | 'ka' = 'ka'
): Promise<{ success: true } | { error: string }> {
  await requireAdmin()
  const tenantId = await getTenantId()

  const order = await withTenantDb(tenantId, tx => tx.order.findFirst({
    where: { id: orderId, tenantId },
    select: { name: true, surname: true, email: true, date: true, timeSlot: true },
  }))
  if (!order) return { error: 'Order not found.' }
  if (!order.email) return { error: 'This order has no email address.' }

  const payment = await withTenantDb(tenantId, tx => tx.payment.findFirst({
    where: { id: paymentId, orderId, tenantId, provider: 'flitt' },
    select: { checkoutUrl: true, amount: true },
  }))
  if (!payment || !payment.checkoutUrl) return { error: 'Checkout link not found.' }

  const [wineryAddress, wineryEmail, tenant] = await Promise.all([
    getSetting('contact_address'),
    getSetting('contact_email'),
    db.tenant.findUnique({ where: { id: tenantId }, select: { displayName: true, name: true, theme: true } }),
  ])

  await sendTopUpCheckoutEmail({
    tenantId,
    name: order.name,
    surname: order.surname,
    email: order.email,
    date: order.date,
    timeSlot: order.timeSlot,
    amount: payment.amount,
    checkoutUrl: payment.checkoutUrl,
    wineryName: tenant?.displayName ?? tenant?.name ?? '',
    wineryAddress,
    wineryEmail,
    theme: resolveTenantTheme(tenant?.theme ?? null),
    locale,
  })

  return { success: true }
}
