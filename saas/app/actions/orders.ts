'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { recalcOrderTotal } from '@/lib/pricing'
import { findTier } from '@/lib/pricingUtils'

export async function deleteOrder(id: string) {
  await db.order.delete({ where: { id } })
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
  if (!data.name.trim()) return { error: 'First name is required.' }
  if (!data.surname.trim()) return { error: 'Last name is required.' }
  if (data.guestCount < 1) return { error: 'Guest count must be at least 1.' }

  await db.order.update({
    where: { id },
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
  // Fetch order with company prices + current masterclass/extras for total recalc
  const order = await db.order.findUnique({
    where: { id },
    include: {
      company: { include: { prices: true } },
      masterclassLines: true,
      extras: true,
    },
  })
  if (!order) return { error: 'Order not found' }

  const tastingGuests = data.tastingGuestCount
  const lunchGuests = data.lunchGuestCount
  // Tier and pricing driven purely by paying guests; free guests are not charged
  const totalPayingGuests = tastingGuests + lunchGuests

  let totalPrice: number | null = order.totalPrice

  const masterclassAmt = order.masterclassLines.reduce(
    (sum, l) => sum + l.quantity * l.pricePerUnit,
    0
  )
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
    // Individual / no-tier order: admin-supplied per-person rates
    const tr = data.manualTastingRate ?? 0
    const lr = data.manualLunchRate ?? 0
    totalPrice = tastingGuests * tr + lunchGuests * lr + masterclassAmt + extrasAmt
  }

  await db.order.update({
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

  revalidatePath('/admin/orders')
  revalidatePath(`/admin/orders/${id}`)
  return { success: true }
}
