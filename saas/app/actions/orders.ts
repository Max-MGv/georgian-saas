'use server'

import { db, withTenantDb } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { recalcOrderTotal } from '@/lib/pricing'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'
import { findTier } from '@/lib/pricingUtils'
import { getSetting } from '@/app/actions/settings'
import { sendInvoiceEmail } from '@/lib/emails/invoiceEmail'
import { OrderStatus } from '@prisma/client'

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
          lunchGuests * tier.tastingLunchPricePerPerson +
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
            data.lunchGuestCount * tier.tastingLunchPricePerPerson +
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
  customMessage: string
): Promise<{ success: true } | { error: string }> {
  await requireAdmin()
  const tenantId = await getTenantId()
  try {
    const order = await withTenantDb(tenantId, tx =>
      tx.order.findFirst({
        where: { id: orderId, tenantId },
        include: {
          company: true,
          masterclassLines: { include: { masterclassItem: true } },
          extras: true,
        },
      })
    )

    if (!order) return { error: 'Order not found.' }
    if (!order.email) return { error: 'This order has no email address.' }

    const [recipientName, personalNumber, bankName, bankCode, iban] = await Promise.all([
      getSetting('payment_recipient_name'),
      getSetting('payment_personal_number'),
      getSetting('payment_bank_name'),
      getSetting('payment_bank_code'),
      getSetting('payment_iban'),
    ])

    await sendInvoiceEmail({
      name: order.name,
      surname: order.surname,
      email: order.email,
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
    })

    const advanceStatuses = ['NEW', 'CONFIRMED']
    if (advanceStatuses.includes(order.status)) {
      await withTenantDb(tenantId, tx =>
        tx.order.update({ where: { id: orderId }, data: { status: 'INVOICE_SENT' } })
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

export async function exportOrdersCsv(filters: {
  dateFrom?: string
  dateTo?: string
  companyId?: string
  status?: string
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
      ...(filters.status ? { status: filters.status as OrderStatus } : {}),
    },
    include: { company: true },
    orderBy: { date: 'desc' },
  }))

  const header = ['Date', 'Time', 'Name', 'Surname', 'Company', 'Booking Type', 'Visit Type', 'Guests', 'Total (GEL)', 'Status', 'Email', 'Phone', 'Notes']
  const rows = orders.map(o => [
    o.date.toLocaleDateString('en-GB'),
    o.timeSlot,
    o.name,
    o.surname,
    o.company?.name ?? '',
    o.bookingType,
    o.visitType,
    o.guestCount,
    o.totalPrice ?? '',
    o.status,
    o.email ?? '',
    o.phone ?? '',
    o.notes ?? '',
  ])

  return [header, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')
}

export async function updateOrderStatus(
  orderId: string,
  status: 'NEW' | 'CONFIRMED' | 'INVOICE_SENT' | 'PAID' | 'COMPLETED' | 'CANCELLED'
): Promise<{ success: true } | { error: string }> {
  await requireAdmin()
  const tenantId = await getTenantId()
  try {
    const result = await withTenantDb(tenantId, tx =>
      tx.order.updateMany({ where: { id: orderId, tenantId }, data: { status } })
    )
    if (result.count === 0) return { error: 'Order not found.' }
    revalidatePath('/admin/orders')
    return { success: true }
  } catch {
    return { error: 'Failed to update status.' }
  }
}
