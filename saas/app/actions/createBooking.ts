'use server'

import { db, withTenantDb } from '@/lib/db'
import { BookingType, OrderStatus, VisitType } from '@prisma/client'
import { cookies } from 'next/headers'
import { sendBookingConfirmation } from '@/lib/emails/bookingConfirmation'
import { resolveTenantTheme } from '@/lib/themePresets'
import { findTier } from '@/lib/pricingUtils'
import { getSetting } from '@/app/actions/settings'
import { getTenantId } from '@/lib/tenant'
import { shouldTakePayment } from '@/lib/payments/shouldTakePayment'
import { startCheckout } from '@/lib/payments/startCheckout'

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
  tastingGuestCount?: number
  lunchGuestCount?: number
  freeGuestCount?: number
  hotDishVegetable?: string | null
  hotDishMeat?: string | null
  foodNotes?: string | null
  masterclassLines?: { masterclassItemId: string; quantity: number; pricePerUnit: number }[]
}

export type BookingResult =
  /**
   * `checkoutUrl` present means the tenant takes online payment and the client
   * must redirect there — the booking is saved either way, so a customer who
   * never completes checkout still exists as PENDING_PAYMENT for the winery to
   * chase. Absent = today's reservation-only flow, unchanged.
   */
  | { success: true; totalPrice: number; bookingType: 'INDIVIDUAL' | 'COMPANY'; checkoutUrl?: string }
  | { success: false; error: string }

export async function createBooking(data: BookingFormData): Promise<BookingResult> {
  try {
    const tenantId = await getTenantId()

    // Guard: past dates
    const dateStr = new Date(data.date).toISOString().split('T')[0]
    const todayStr = new Date().toISOString().split('T')[0]
    if (dateStr < todayStr) {
      return { success: false, error: 'Bookings cannot be made for past dates.' }
    }

    // Guard: blocked dates (scoped to this tenant)
    const blocked = await withTenantDb(tenantId, tx =>
      tx.blockedDate.findFirst({ where: { date: new Date(dateStr), tenantId } })
    )
    if (blocked) {
      return { success: false, error: 'The winery is closed on this date. Please choose another date.' }
    }

    // Guard: min guests from settings (tenant-scoped via getSetting)
    const [minTastingStr, minLunchStr] = await Promise.all([
      getSetting('min_guests_tasting'),
      getSetting('min_guests_tasting_lunch'),
    ])
    const minGuests = data.visitType === 'TASTING'
      ? (parseInt(minTastingStr) || 4)
      : (parseInt(minLunchStr) || 4)

    const guestCount = Number(data.guestCount)
    const isEnhanced = data.bookingType === 'COMPANY' &&
      (data.tastingGuestCount != null || data.lunchGuestCount != null)

    const effectiveGuestCount = isEnhanced
      ? (data.tastingGuestCount ?? 0) + (data.lunchGuestCount ?? 0)
      : guestCount
    if (effectiveGuestCount < minGuests) {
      return { success: false, error: `Minimum ${minGuests} guests required for this visit type.` }
    }

    // Fetch real masterclass prices from DB (scoped to this tenant)
    const masterclassIds = (data.masterclassLines ?? []).map(l => l.masterclassItemId)
    const masterclassItemsFromDb = masterclassIds.length > 0
      ? await withTenantDb(tenantId, tx =>
          tx.masterclassItem.findMany({
            where: { id: { in: masterclassIds }, tenantId },
            select: { id: true, pricePerUnit: true },
          })
        )
      : []
    const masterclassPriceMap = Object.fromEntries(masterclassItemsFromDb.map(i => [i.id, i.pricePerUnit]))
    const masterclassAmt = (data.masterclassLines ?? []).reduce(
      (s, l) => s + l.quantity * (masterclassPriceMap[l.masterclassItemId] ?? 0), 0
    )

    // Fetch individual pricing tiers. No invented 50/100 defaults: a tenant
    // with no pricing configured stores 0 and confirms the price manually.
    const individualsCompany = await withTenantDb(tenantId, tx =>
      tx.company.findFirst({
        where: { tenantId, isIndividual: true },
        include: { prices: { orderBy: { minGuests: 'asc' } } },
      })
    )
    let pricePerPersonTasting: number | null = null
    let pricePerPersonLunch: number | null = null
    if (individualsCompany?.prices.length) {
      const tier = findTier(individualsCompany.prices, guestCount)
      if (tier) {
        pricePerPersonTasting = tier.pricePerPerson
        pricePerPersonLunch = tier.tastingLunchPricePerPerson || tier.pricePerPerson
      }
    }
    const pricePerPerson = data.visitType === 'TASTING' ? pricePerPersonTasting : pricePerPersonLunch
    let totalPrice = isEnhanced ? masterclassAmt : (pricePerPerson ?? 0) * guestCount

    if (data.bookingType === 'COMPANY' && data.companyId) {
      const company = await withTenantDb(tenantId, tx =>
        tx.company.findFirst({ where: { id: data.companyId, tenantId }, include: { prices: true } })
      )

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

    const createdOrder = await withTenantDb(tenantId, tx => tx.order.create({
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
        tenantId,
        companyId: data.bookingType === 'COMPANY' ? data.companyId || null : null,
        masterclassLines: (data.masterclassLines ?? []).length > 0 ? {
          create: (data.masterclassLines ?? []).map(l => ({
            masterclassItemId: l.masterclassItemId,
            quantity: l.quantity,
            pricePerUnit: masterclassPriceMap[l.masterclassItemId] ?? 0,
          })),
        } : undefined,
      },
    }))

    // ── Online payment branch ──────────────────────────────────────────────
    // Only after the order safely exists. Every failure inside this block
    // degrades to the reservation-only flow below — the customer is never
    // blocked by a payment problem that isn't theirs.
    const showCompanyPrice = await getSetting('show_company_price_after_booking')
    const gate = await shouldTakePayment({
      tenantId,
      totalPrice,
      // A COMPANY booking whose price is hidden from the customer must not be
      // charged an amount they were never shown (§7.4) — invoice instead.
      priceShown: data.bookingType === 'INDIVIDUAL' || showCompanyPrice === 'true',
    })

    if (gate.takePayment) {
      const locale = (await cookies()).get('site_locale')?.value
      // order_desc from the actual order, not a hardcoded site name.
      const typeLabel = data.visitType === 'TASTING' ? 'Tasting' : 'Tasting + Lunch'
      const checkoutUrl = await startCheckout({
        tenantId,
        merchantId: gate.merchantId,
        secretKey: gate.secretKey,
        orderId: createdOrder.id,
        amount: totalPrice,
        orderDesc: `${typeLabel}, ${effectiveGuestCount} guests, ${dateStr} ${data.timeSlot}`,
        locale,
      })

      if (checkoutUrl) {
        // Status moves to PENDING_PAYMENT only once a checkout really exists —
        // done in this order so a failed checkout leaves a plain NEW order.
        await withTenantDb(tenantId, tx => tx.order.update({
          where: { id: createdOrder.id },
          data: { status: OrderStatus.PENDING_PAYMENT },
        }))
        // No confirmation email here: "your booking is confirmed" must not
        // reach someone who hasn't paid and may abandon checkout. It is sent
        // by the settlement path once Flitt confirms (phase 7).
        return { success: true, totalPrice, bookingType: data.bookingType, checkoutUrl }
      }
      // fall through: checkout unavailable → reservation-only, email as today
    }

    if (data.email) {
      const formattedDate = new Date(data.date).toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      })
      const [wineryPhone, wineryEmail, wineryAddress, tenant] = await Promise.all([
        getSetting('contact_phone'),
        getSetting('contact_email'),
        getSetting('contact_address'),
        db.tenant.findUnique({ where: { id: tenantId }, select: { displayName: true, name: true, theme: true } }),
      ])
      sendBookingConfirmation({
        name: data.name,
        surname: data.surname,
        email: data.email,
        date: formattedDate,
        timeSlot: data.timeSlot,
        guestCount,
        visitType: data.visitType,
        totalPrice,
        wineryName: tenant?.displayName ?? tenant?.name ?? '',
        wineryAddress,
        wineryPhone,
        wineryEmail,
        theme: resolveTenantTheme(tenant?.theme ?? null),
      }).catch(err => console.error('Email send failed:', err))
    }

    return { success: true, totalPrice, bookingType: data.bookingType }
  } catch {
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}
