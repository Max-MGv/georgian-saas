'use server'

import { db, withTenantDb } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { recalcOrderTotal } from '@/lib/pricing'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'
import { comboRatePerPerson, findTier } from '@/lib/pricingUtils'
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
  const result = await withTenantDb(tenantId, tx =>
    tx.order.updateMany({
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
  )
  if (result.count === 0) return { error: 'Order not found.' }
  revalidatePath('/admin/orders')
  return { success: true }
}

export async function updateOrderEnhanced(
  id: string,
  data: {
    tastingGuestCount: number
    lunchGuestCount: number
    freeGuestCount: number
    hotDishVegetable: string | null
    hotDishMeat: string | null
    foodNotes: string | null
    manualTastingRate?: number
    manualLunchRate?: number
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

    const tastingGuests = data.tastingGuestCount
    const lunchGuests = data.lunchGuestCount
    const totalPayingGuests = tastingGuests + lunchGuests

    let totalPrice: number | null = order.totalPrice
    const masterclassAmt = order.masterclassLines.reduce((sum, l) => sum + l.quantity * l.pricePerUnit, 0)
    const extrasAmt = order.extras.reduce((sum, e) => sum + e.amount, 0)

    if (totalPayingGuests > 0 && order.company?.prices?.length) {
      const tier = findTier(order.company.prices, totalPayingGuests)
      if (tier) {
        totalPrice =
          tastingGuests * tier.pricePerPerson +
          lunchGuests * comboRatePerPerson(tier) +
          tier.registrationPrice +
          masterclassAmt +
          extrasAmt
      }
    } else if (totalPayingGuests > 0 && (data.manualTastingRate != null || data.manualLunchRate != null)) {
      const tr = data.manualTastingRate ?? 0
      const lr = data.manualLunchRate ?? 0
      totalPrice = tastingGuests * tr + lunchGuests * lr + masterclassAmt + extrasAmt
    }

    await tx.order.update({
      where: { id },
      data: {
        tastingGuestCount: data.tastingGuestCount,
        lunchGuestCount: data.lunchGuestCount,
        freeGuestCount: data.freeGuestCount,
        hotDishVegetable: data.hotDishVegetable || null,
        hotDishMeat: data.hotDishMeat || null,
        foodNotes: data.foodNotes || null,
        totalPrice,
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
  manualTastingRate: number
  manualLunchRate: number
  masterclassLines: { masterclassItemId: string; quantity: number; pricePerUnit: number }[]
  extras: { label: string; amount: number }[]
}): Promise<{ orderId: string } | { error: string }> {
  await requireAdmin()
  if (!data.name.trim()) return { error: 'First name is required.' }
  if (!data.surname.trim()) return { error: 'Last name is required.' }
  if (!data.date) return { error: 'Date is required.' }
  if (data.guestCount < 1) return { error: 'Guest count must be at least 1.' }

  const tenantId = await getTenantId()

  const masterclassAmt = data.masterclassLines.reduce((s, l) => s + l.quantity * l.pricePerUnit, 0)
  const extrasAmt = data.extras.reduce((s, e) => s + e.amount, 0)

  let totalPrice: number | null = null
  const payingGuests = data.tastingGuestCount + data.lunchGuestCount

  const orderId = await withTenantDb(tenantId, async (tx) => {
    if (payingGuests > 0 && data.companyId) {
      const company = await tx.company.findFirst({
        where: { id: data.companyId, tenantId },
        include: { prices: true },
      })
      if (company?.prices.length) {
        const tier = findTier(company.prices, payingGuests)
        if (tier) {
          totalPrice =
            data.tastingGuestCount * tier.pricePerPerson +
            data.lunchGuestCount * comboRatePerPerson(tier) +
            tier.registrationPrice +
            masterclassAmt +
            extrasAmt
        }
      }
    }

    if (totalPrice === null && (data.manualTastingRate > 0 || data.manualLunchRate > 0)) {
      const tastingCount = data.companyId ? data.tastingGuestCount : data.guestCount
      totalPrice =
        tastingCount * data.manualTastingRate +
        data.lunchGuestCount * data.manualLunchRate +
        masterclassAmt +
        extrasAmt
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
  // Lets the admin pick a company Representative's email as the recipient instead of the
  // order's own (Plan-CompanyGuidesAndReps Chunk 9) — falls back to order.email when omitted.
  // Re-checked against the order's own company's representatives below, not trusted as-is.
  recipientEmail?: string
): Promise<{ success: true } | { error: string }> {
  await requireAdmin()
  const tenantId = await getTenantId()
  try {
    const order = await withTenantDb(tenantId, tx =>
      tx.order.findFirst({
        where: { id: orderId, tenantId },
        include: {
          company: { include: { representatives: true } },
          masterclassLines: { include: { masterclassItem: true } },
          extras: true,
        },
      })
    )

    if (!order) return { error: 'Order not found.' }
    let recipient = order.email
    if (recipientEmail && recipientEmail !== order.email) {
      const validRep = order.company?.representatives.some(r => r.email === recipientEmail)
      if (!validRep) return { error: 'That recipient is not valid for this order.' }
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
    o.totalPrice ?? '',
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
    const payingGuests = order.tastingGuestCount + order.lunchGuestCount

    let totalPrice = 0
    if (payingGuests > 0) {
      // Enhanced/split booking — same shape as updateOrderEnhanced's calc.
      const tier = findTier(company.prices, payingGuests)
      if (tier) {
        totalPrice =
          order.tastingGuestCount * tier.pricePerPerson +
          order.lunchGuestCount * comboRatePerPerson(tier) +
          tier.registrationPrice + masterclassAmt + extrasAmt
      }
    } else {
      // Simple booking — priced off guestCount + visitType, same shape as
      // createBooking.ts's COMPANY-with-companyId branch.
      const tier = findTier(company.prices, order.guestCount)
      if (tier) {
        const ratePerPerson = order.visitType === 'TASTING' ? tier.pricePerPerson : comboRatePerPerson(tier)
        totalPrice = ratePerPerson * order.guestCount + tier.registrationPrice + masterclassAmt + extrasAmt
      }
    }
    if (totalPrice === 0 && masterclassAmt + extrasAmt > 0) totalPrice = masterclassAmt + extrasAmt

    await tx.order.update({
      where: { id: orderId },
      data: { companyId, bookingType: 'COMPANY', totalPrice },
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
  await requireAdmin()
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
        select: { confirmedAt: true, completedAt: true, invoiceSentAt: true, paidAt: true },
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
      return tx.order.updateMany({ where: { id: orderId, tenantId }, data })
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
