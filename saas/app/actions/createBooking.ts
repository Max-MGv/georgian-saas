'use server'

import { db } from '@/lib/db'
import { BookingType, VisitType } from '@prisma/client'
import { sendBookingConfirmation } from '@/lib/emails/bookingConfirmation'
import { findTier } from '@/lib/pricingUtils'
import { getSetting } from '@/app/actions/settings'

export type BookingFormData = {
  bookingType: 'INDIVIDUAL' | 'COMPANY'
  companyId?: string
  visitType: 'TASTING' | 'TASTING_LUNCH'
  date: string
  timeSlot: string
  guestCount: number
  name: string
  surname: string
  email?: string
  phone?: string
  // Enhanced company booking fields
  tastingGuestCount?: number
  lunchGuestCount?: number
  freeGuestCount?: number
  hotDishVegetable?: string | null
  hotDishMeat?: string | null
  foodNotes?: string | null
  masterclassLines?: { masterclassItemId: string; quantity: number; pricePerUnit: number }[]
}

export type BookingResult =
  | { success: true; totalPrice: number; bookingType: 'INDIVIDUAL' | 'COMPANY' }
  | { success: false; error: string }

export async function createBooking(data: BookingFormData): Promise<BookingResult> {
  try {
    // Server-side guard: blocked dates
    const dateStr = new Date(data.date).toISOString().split('T')[0]
    const blocked = await db.blockedDate.findFirst({
      where: { date: new Date(dateStr) },
    })
    if (blocked) {
      return { success: false, error: 'The winery is closed on this date. Please choose another date.' }
    }

    // Server-side guard: min guests from settings
    const [minTastingStr, minLunchStr] = await Promise.all([
      getSetting('min_guests_tasting'),
      getSetting('min_guests_tasting_lunch'),
    ])
    const minGuests = data.visitType === 'TASTING'
      ? (parseInt(minTastingStr) || 4)
      : (parseInt(minLunchStr) || 4)

    const guestCount = Number(data.guestCount)
    if (guestCount < minGuests) {
      return { success: false, error: `Minimum ${minGuests} guests required for this visit type.` }
    }

    const isEnhanced = data.bookingType === 'COMPANY' &&
      (data.tastingGuestCount != null || data.lunchGuestCount != null)

    const masterclassAmt = (data.masterclassLines ?? []).reduce(
      (s, l) => s + l.quantity * l.pricePerUnit, 0
    )

    const pricePerPerson = data.visitType === 'TASTING' ? 50 : 100
    // Enhanced bookings: start at masterclassAmt so 0-paying-guest groups get correct total
    let totalPrice = isEnhanced ? masterclassAmt : pricePerPerson * guestCount

    if (data.bookingType === 'COMPANY' && data.companyId) {
      const company = await db.company.findUnique({
        where: { id: data.companyId },
        include: { prices: true },
      })

      if (company?.prices.length) {
        const payingGuests = isEnhanced
          ? (data.tastingGuestCount ?? 0) + (data.lunchGuestCount ?? 0)
          : guestCount
        const tier = findTier(company.prices, payingGuests)
        if (tier) {
          if (isEnhanced) {
            totalPrice =
              (data.tastingGuestCount ?? 0) * tier.pricePerPerson +
              (data.lunchGuestCount ?? 0) * tier.tastingLunchPricePerPerson +
              tier.registrationPrice +
              masterclassAmt
          } else {
            const ratePerPerson = data.visitType === 'TASTING'
              ? tier.pricePerPerson
              : tier.tastingLunchPricePerPerson || tier.pricePerPerson
            totalPrice = ratePerPerson * guestCount + tier.registrationPrice
          }
        } else if (!isEnhanced) {
          return { success: false, error: `No pricing tier covers ${guestCount} guests for this company. Please contact us directly.` }
        }
      }
    } else if (isEnhanced) {
      totalPrice = masterclassAmt
    }

    await db.order.create({
      data: {
        bookingType: data.bookingType as BookingType,
        visitType: data.visitType as VisitType,
        date: new Date(data.date),
        timeSlot: data.timeSlot,
        guestCount,
        tastingGuestCount: isEnhanced ? (data.tastingGuestCount ?? 0) : 0,
        lunchGuestCount: isEnhanced ? (data.lunchGuestCount ?? 0) : 0,
        freeGuestCount: isEnhanced ? (data.freeGuestCount ?? 0) : 0,
        hotDishVegetable: data.hotDishVegetable || null,
        hotDishMeat: data.hotDishMeat || null,
        foodNotes: data.foodNotes || null,
        name: data.name,
        surname: data.surname,
        email: data.email || null,
        phone: data.phone || null,
        totalPrice,
        companyId: data.bookingType === 'COMPANY' ? data.companyId || null : null,
        masterclassLines: (data.masterclassLines ?? []).length > 0 ? {
          create: (data.masterclassLines ?? []).map(l => ({
            masterclassItemId: l.masterclassItemId,
            quantity: l.quantity,
            pricePerUnit: l.pricePerUnit,
          })),
        } : undefined,
      },
    })

    // Send confirmation email if customer provided an email address
    if (data.email) {

      const formattedDate = new Date(data.date).toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
      // Fire and forget — don't fail the booking if email fails
      sendBookingConfirmation({
        name: data.name,
        surname: data.surname,
        email: data.email,
        date: formattedDate,
        timeSlot: data.timeSlot,
        guestCount,
        visitType: data.visitType,
        totalPrice,
      }).catch(err => console.error('Email send failed:', err))
    }

    return { success: true, totalPrice, bookingType: data.bookingType }
  } catch {
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
