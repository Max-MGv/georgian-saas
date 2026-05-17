'use server'

import { db } from '@/lib/db'
import { BookingType, VisitType } from '@/app/generated/prisma/client'

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
  | { success: true }
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
        totalPrice = price.pricePerPerson * guestCount + price.registrationPrice
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

    return { success: true }
  } catch {
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
