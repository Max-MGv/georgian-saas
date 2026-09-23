'use server'

import { db, withTenantDb } from '@/lib/db'
import { writeOrderContacts, syncOrderContactPerson, type IncomingContact } from '@/lib/orderContacts'
import { invoiceRecipientsFor } from '@/lib/contactResolution'
import { recordManualPayment, reverseManualPayments } from '@/lib/payments/manualPayment'
import { recordOrderEvent, eventTypeForChange } from '@/lib/orderEvents'
import { asTetri, toMajor, type Tetri } from '@/lib/money'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'
import { priceBooking, ratesForParty, ratesFromManual } from '@/lib/pricingUtils'
import { getSetting } from '@/app/actions/settings'
import { sendInvoiceEmail } from '@/lib/emails/invoiceEmail'
import { resolveTenantTheme } from '@/lib/themePresets'
import type { BookingStage } from '@prisma/client'
import { countryName } from '@/lib/countries'
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

export async function deleteOrder(id: string) {
  await requireAdmin()
  const tenantId = await getTenantId()
  await withTenantDb(tenantId, tx => tx.order.deleteMany({ where: { id, tenantId } }))
  revalidatePath('/admin/orders')
  revalidatePath('/admin/statistics')
  return { success: true }
}

export async function updateOrder(id: string, data: {
  date: string
  timeSlot: string
  guestCount: number
  name: string
  surname: string
  phone: string
  email: string
  notes: string
}) {
  await requireAdmin()
  if (!data.name.trim()) return { error: 'First name is required.' }
  if (!data.surname.trim()) return { error: 'Last name is required.' }
  if (data.guestCount < 1) return { error: 'Guest count must be at least 1.' }

  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async tx => {
    const updated = await tx.order.updateMany({
      where: { id, tenantId },
      data: {
        date: new Date(data.date),
        timeSlot: data.timeSlot,
        guestCount: data.guestCount,
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
  return { success: true }
}

export async function updateOrderEnhanced(
  id: string,
  data: {
    /** The party size. Drives the price tier, so it is editable (2026-09-19). */
    guestCount: number
    tastingGuestCount: number
    lunchGuestCount: number
    freeGuestCount: number
    hotDishVegetable: string | null
    hotDishMeat: string | null
    foodNotes: string | null
    /** TETRI — the detail screen converts what the admin typed (chunk 3). */
    manualTastingRate?: Tetri
    manualLunchRate?: Tetri
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

    // The three buckets are subsets of the party, never more than it. Nothing
    // enforced this until 2026-09-19 (#54), so an order could bill 14 paying
    // guests while every document it produced still said 10.
    if (data.guestCount < 1) return { error: 'Guest count must be at least 1.' } as const
    const split = data.tastingGuestCount + data.lunchGuestCount + data.freeGuestCount
    if (split > data.guestCount) {
      return {
        error: `The split adds up to ${split} but the party is ${data.guestCount}. ` +
          `Raise the guest count or lower the split.`,
      } as const
    }

    const tastingGuests = data.tastingGuestCount
    const lunchGuests = data.lunchGuestCount
    const totalPayingGuests = tastingGuests + lunchGuests

    let totalPrice: number | null = order.totalPrice
    const masterclassAmt = order.masterclassLines.reduce((sum, l) => sum + l.quantity * l.pricePerUnit, 0)
    const extrasAmt = order.extras.reduce((sum, e) => sum + e.amount, 0)

    // An admin editing guest counts or rates is deliberately re-pricing the
    // order, so the snapshot moves with it and records what the order is sold
    // at *now*. That is the opposite of `recalcOrderTotal`, where a line change
    // must never disturb the agreed rates (chunk 4).
    let tastingRateSnapshot: number | null = null
    let lunchRateSnapshot: number | null = null
    let registrationFeeSnapshot: number | null = null

    // The party size, not the paying head count, picks the tier (2026-09-19).
    const guests = { guestCount: data.guestCount, tastingGuests, lunchGuests }
    const lines = { masterclass: masterclassAmt, extras: extrasAmt }

    const rates = order.company?.prices?.length
      ? ratesForParty(order.company.prices, data.guestCount)
      : (data.manualTastingRate != null || data.manualLunchRate != null)
        ? ratesFromManual(data.manualTastingRate ?? 0, data.manualLunchRate ?? 0)
        : null

    if (totalPayingGuests > 0 && rates) {
      tastingRateSnapshot = rates.tasting
      lunchRateSnapshot = rates.lunch
      registrationFeeSnapshot = rates.registration
      totalPrice = priceBooking(rates, guests, order.visitType, lines)
    }

    await tx.order.update({
      where: { id },
      data: {
        guestCount: data.guestCount,
        tastingGuestCount: data.tastingGuestCount,
        lunchGuestCount: data.lunchGuestCount,
        freeGuestCount: data.freeGuestCount,
        hotDishVegetable: data.hotDishVegetable || null,
        hotDishMeat: data.hotDishMeat || null,
        foodNotes: data.foodNotes || null,
        totalPrice,
        // Only when this edit actually re-priced the order; a null here would
        // erase a snapshot the order still needs.
        ...(tastingRateSnapshot != null
          ? { tastingRateSnapshot, lunchRateSnapshot, registrationFeeSnapshot }
          : {}),
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
  visitType: 'TASTING' | 'TASTING_LUNCH'
  date: string
  timeSlot: string
  name: string
  surname: string
  phone: string | null
  email: string | null
  notes: string | null
  guestCount: number
  tastingGuestCount: number
  lunchGuestCount: number
  freeGuestCount: number
  hotDishVegetable: string | null
  hotDishMeat: string | null
  foodNotes: string | null
  /** TETRI — the new-order form converts what the admin typed (chunk 3). */
  manualTastingRate: Tetri
  manualLunchRate: Tetri
  masterclassLines: { masterclassItemId: string; quantity: number; pricePerUnit: number }[]
  extras: { label: string; amount: number }[]
  /**
   * One entry per contact role, from the admin's inline pickers (Plan-ContactRoles Chunk 10).
   * Written via `writeOrderContacts()`, the one base every order-creation path shares, which
   * re-verifies every `roleId` and `personId` against `companyId` under the tenant first.
   */
  contacts?: IncomingContact[]
}): Promise<{ orderId: string } | { error: string }> {
  const actor = await requireAdmin()
  if (!data.name.trim()) return { error: 'First name is required.' }
  if (!data.surname.trim()) return { error: 'Last name is required.' }
  if (!data.date) return { error: 'Date is required.' }
  if (data.guestCount < 1) return { error: 'Guest count must be at least 1.' }
  const splitTotal = data.tastingGuestCount + data.lunchGuestCount + data.freeGuestCount
  if (splitTotal > data.guestCount) {
    return { error: `The split adds up to ${splitTotal} but the party is ${data.guestCount}.` }
  }

  const tenantId = await getTenantId()

  const masterclassAmt = data.masterclassLines.reduce((s, l) => s + l.quantity * l.pricePerUnit, 0)
  // Rate snapshots — see schema.prisma on Order (chunk 4).
  let tastingRateSnapshot: number | null = null
  let lunchRateSnapshot: number | null = null
  let registrationFeeSnapshot: number | null = null
  const extrasAmt = data.extras.reduce((s, e) => s + e.amount, 0)

  let totalPrice: number | null = null

  const orderId = await withTenantDb(tenantId, async (tx) => {
    // One lookup, on the party size (2026-09-19). Manual rates are the fallback
    // when there is no ladder, and are just as much "what this was sold at" as a
    // tier is — until 2026-09-18 they were used once and thrown away, which is
    // why an order priced that way could never be recalculated at all.
    const guests = {
      guestCount: data.guestCount,
      tastingGuests: data.tastingGuestCount,
      lunchGuests: data.lunchGuestCount,
    }
    const lines = { masterclass: masterclassAmt, extras: extrasAmt }

    const company = data.companyId
      ? await tx.company.findFirst({ where: { id: data.companyId, tenantId }, include: { prices: true } })
      : null

    const rates = company?.prices?.length
      ? ratesForParty(company.prices, data.guestCount)
      : (data.manualTastingRate > 0 || data.manualLunchRate > 0)
        ? ratesFromManual(data.manualTastingRate, data.manualLunchRate)
        : null

    if (rates) {
      tastingRateSnapshot = rates.tasting
      lunchRateSnapshot = rates.lunch
      registrationFeeSnapshot = rates.registration
      totalPrice = priceBooking(rates, guests, data.visitType, lines)
    }

    if (totalPrice === null && masterclassAmt + extrasAmt > 0) totalPrice = masterclassAmt + extrasAmt
    if (totalPrice === null) totalPrice = 0

    const order = await tx.order.create({
      data: {
        bookingType: data.companyId ? 'COMPANY' : 'INDIVIDUAL',
        visitType: data.visitType,
        date: new Date(data.date),
        timeSlot: data.timeSlot,
        guestCount: data.guestCount,
        tastingGuestCount: data.tastingGuestCount,
        lunchGuestCount: data.lunchGuestCount,
        freeGuestCount: data.freeGuestCount,
        hotDishVegetable: data.hotDishVegetable || null,
        hotDishMeat: data.hotDishMeat || null,
        foodNotes: data.foodNotes || null,
        name: data.name.trim(),
        surname: data.surname.trim(),
        phone: data.phone?.trim() || null,
        email: data.email?.trim() || null,
        notes: data.notes?.trim() || null,
        totalPrice,
        tastingRateSnapshot,
        lunchRateSnapshot,
        registrationFeeSnapshot,
        tenantId,
        ...NEW_ORDER_COLUMNS,
        ...(data.companyId ? { companyId: data.companyId } : {}),
        masterclassLines: data.masterclassLines.length
          ? { create: data.masterclassLines.map(l => ({ masterclassItemId: l.masterclassItemId, quantity: l.quantity, pricePerUnit: l.pricePerUnit })) }
          : undefined,
        extras: data.extras.length
          ? { create: data.extras.map(e => ({ label: e.label, amount: e.amount })) }
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
      payload: { totalPrice: order.totalPrice, bookingType: order.bookingType, guestCount: data.guestCount },
    })
    return order.id
  })

  revalidatePath('/admin/orders')
  revalidatePath('/admin/statistics')
  return { orderId }
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
      visitType: order.visitType as 'TASTING' | 'TASTING_LUNCH',
      guestCount: order.guestCount,
      tastingGuestCount: order.tastingGuestCount,
      lunchGuestCount: order.lunchGuestCount,
      freeGuestCount: order.freeGuestCount,
      totalPrice: order.totalPrice ?? 0,
      companyName: order.company?.name ?? null,
      identificationCode: order.company?.identificationCode ?? null,
      masterclassLines: order.masterclassLines.map(l => ({
        name: l.masterclassItem.name,
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

    // Sending an invoice stamps a date and nothing else. It records that we
    // have asked for money, which says nothing about whether the visit has
    // happened — so it does not touch `stage`, and it is recorded whatever
    // stage the booking is at, including a completed one being billed after
    // the fact. Under the previous design this was a rung on a payment ladder,
    // which is why marking such an order paid used to erase it.
    if (order.invoiceSentAt == null) {
      await withTenantDb(tenantId, tx =>
        tx.order.update({
          where: { id: orderId },
          data: invoiceSentPatch(true, toCurrentDates(order), new Date()),
        })
      )
    }

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
    include: { company: true },
    orderBy: { date: 'desc' },
  }))

  // Stage and payment are separate columns, or a completed-but-unpaid booking
  // exports as indistinguishable from a paid one. Invoice Sent gets its own
  // date rather than collapsing into Payment, since an order can be both
  // invoiced and paid — which the old payment ladder could not represent.
  const header = ['Date', 'Time', 'Name', 'Surname', 'Company', 'Booking Type', 'Visit Type', 'Guests', 'Nationality', 'Total (GEL)', 'Status', 'Payment', 'Paid At', 'Invoice Sent At', 'Email', 'Phone', 'Notes']
  const rows = orders.map(o => [
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
    o.stage,
    o.paidAt ? 'paid' : o.invoiceSentAt ? 'invoiced' : 'unpaid',
    o.paidAt ? o.paidAt.toLocaleDateString('en-GB') : '',
    o.invoiceSentAt ? o.invoiceSentAt.toLocaleDateString('en-GB') : '',
    o.email ?? '',
    o.phone ?? '',
    o.notes ?? '',
  ])

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

    const masterclassAmt = order.masterclassLines.reduce((s, l) => s + l.quantity * l.pricePerUnit, 0)
    const extrasAmt = order.extras.reduce((s, e) => s + e.amount, 0)

    // The three snapshots record the tier rates this order was actually sold
    // at, exactly as createBooking.ts does. They were NOT written here until
    // 2026-09-18 (bug #47): this path produced a brand-new order with null
    // snapshots, and the nullable columns are supposed to mean "created before
    // the columns existed". recalcOrderTotal then fell into its legacy branch
    // and re-priced the whole booking off whatever the company's tiers said
    // that day — the precise repricing bug chunk 4 was written to close.
    let tastingRateSnapshot: number | null = null
    let lunchRateSnapshot: number | null = null
    let registrationFeeSnapshot: number | null = null

    // The two branches this used to have differed only in which head count fed
    // findTier. Now the party size always does, so there is one path.
    const rates = ratesForParty(company.prices, order.guestCount)
    let totalPrice = 0
    if (rates) {
      totalPrice = priceBooking(
        rates,
        { guestCount: order.guestCount, tastingGuests: order.tastingGuestCount, lunchGuests: order.lunchGuestCount },
        order.visitType,
        { masterclass: masterclassAmt, extras: extrasAmt },
      )
      tastingRateSnapshot = rates.tasting
      lunchRateSnapshot = rates.lunch
      registrationFeeSnapshot = rates.registration
    }
    if (totalPrice === 0 && masterclassAmt + extrasAmt > 0) totalPrice = masterclassAmt + extrasAmt

    await tx.order.update({
      where: { id: orderId },
      data: {
        companyId, bookingType: 'COMPANY', totalPrice,
        tastingRateSnapshot, lunchRateSnapshot, registrationFeeSnapshot,
      },
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
