'use server'

import { db } from '@/lib/db'
import { BookingType, VisitType } from '@prisma/client'
import { sendBookingConfirmation } from '@/lib/emails/bookingConfirmation'

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
}

export type BookingResult =
  | { success: true; totalPrice: number; bookingType: 'INDIVIDUAL' | 'COMPANY' }
  | { success: false; error: string }

export async function createBooking(data: BookingFormData): Promise<BookingResult> {
  try {
    const guestCount = Number(data.guestCount)
    if (guestCount < 4) {
      return { success: false, error: 'Minimum 4 guests required.' }
    }

    const pricePerPerson = data.visitType === 'TASTING' ? 50 : 100

    let totalPrice = pricePerPerson * guestCount

    if (data.bookingType === 'COMPANY' && data.companyId) {
      const price = await db.price.findFirst({
        where: {
          companyId: data.companyId,
          minGuests: { lte: guestCount },
          maxGuests: { gte: guestCount },
        },
      })
      if (price) {
        const ratePerPerson = data.visitType === 'TASTING'
          ? price.pricePerPerson
          : price.tastingLunchPricePerPerson || price.pricePerPerson
        totalPrice = ratePerPerson * guestCount + price.registrationPrice
      } else {
        const tierCount = await db.price.count({ where: { companyId: data.companyId } })
        if (tierCount > 0) {
          return { success: false, error: `No pricing tier covers ${guestCount} guests for this company. Please contact us directly.` }
        }
      }
    }

    await db.order.create({
      data: {
        bookingType: data.bookingType as BookingType,
        visitType: data.visitType as VisitType,
        date: new Date(data.date),
        timeSlot: data.timeSlot,
        guestCount,
        name: data.name,
        surname: data.surname,
        email: data.email || null,
        phone: data.phone || null,
        totalPrice,
        companyId: data.bookingType === 'COMPANY' ? data.companyId || null : null,
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
