'use server'

import { db, withTenantDb } from '@/lib/db'
import { writeOrderContacts } from '@/lib/orderContacts'
import { recordOrderEvent } from '@/lib/orderEvents'
import { asTetri } from '@/lib/money'
import { BookingType, VisitType } from '@prisma/client'
import { cookies } from 'next/headers'
import { sendBookingConfirmation } from '@/lib/emails/bookingConfirmation'
import { sendNewBookingNotification } from '@/lib/emails/newBookingNotification'
import { resolveTenantTheme } from '@/lib/themePresets'
import { priceBooking, ratesForParty } from '@/lib/pricingUtils'
import { getSetting } from '@/app/actions/settings'
import { getContent } from '@/app/actions/siteContent'
import { t } from '@/lib/t'
import {
  DEFAULT_BOOKING_INTRO_UNPAID, DEFAULT_BOOKING_INTRO_UNPAID_KA,
  DEFAULT_BOOKING_INTRO_PENDING_COMPANY, DEFAULT_BOOKING_INTRO_PENDING_COMPANY_KA,
} from '@/lib/emails/templates/bookingConfirmationTemplate'
import { formatLongDate } from '@/lib/emails/templates/dateFormat'
import { getTenantId } from '@/lib/tenant'
import { shouldTakePayment } from '@/lib/payments/shouldTakePayment'
import { startCheckout } from '@/lib/payments/startCheckout'
import { checkDemoRateLimit, DEMO_BOOKING_LIMIT } from '@/lib/demoRateLimit'
import { parseWeeklyHours, getDayHours, getLeadHours, minBookableInstant, slotMeetsLeadTime } from '@/lib/bookingHours'
import { COUNTRIES } from '@/lib/countries'
import { NEW_ORDER_COLUMNS } from '@/lib/statusWrite'

const VALID_COUNTRY_CODES = new Set(COUNTRIES.map(c => c.code))

export type BookingFormData = {
  bookingType: 'INDIVIDUAL' | 'COMPANY'
  companyId?: string
  /**
   * One entry per contact role, built by `buildBookingPayload()` in BookingForm.tsx —
   * the only place a booking field may be added (MaintenanceNotes #1 / hurdle H3).
   *
   * `personId` is absent when the guest typed the details in by hand rather than
   * picking someone on file ("I am not on this list"), which is exactly why the name
   * and contact details travel alongside it rather than being looked up from the id:
   * Chunk 9 stores them as snapshots, so deleting a person later loses the *link* and
   * never the *facts* (finding F2 / KnownBugs #56).
   *
   * **Never trusted as sent** — `buildOrderContactRows()` re-verifies every role and every
   * `personId` against `companyId` under the tenant before any of it is written. It replaced
   * `guideId`, which was written on every company booking and **read by nothing** (finding
   * F1): the attribution the guides feature existed for was never delivered anywhere.
   */
  contacts?: {
    roleId: string
    personId?: string
    name: string
    phone: string | null
    email: string | null
  }[]
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
  /**
   * ISO 3166-1 alpha-2 codes for the nationalities present on a COMPANY booking
   * (Plan-CompanyNationality) — a small tag set, no per-country headcount.
   * Ignored for INDIVIDUAL bookings and re-validated against the real country
   * list server-side below before it's ever written.
   */
  nationalities?: string[]
  /**
   * Company name typed into the "New Company?" popup when a COMPANY booking
   * is submitted with no companyId (Feature 180) — display-only, stored on
   * the order so the winery can tell which registration request it belongs
   * to before a real Company row exists. Ignored unless companyId is absent.
   */
  requestedCompanyName?: string
}

export type BookingResult =
  /**
   * `checkoutUrl` present means the tenant takes online payment and the client
   * must redirect there — the booking is saved either way, so a customer who
   * never completes checkout still exists as PENDING_PAYMENT for the winery to
   * chase. Absent = today's reservation-only flow, unchanged.
   *
   * `guestCountAdjustedTo` / `guestCountOverMax` are the two halves of the
   * per-tenant "max guests" cap (`max_guests_tasting`/`max_guests_tasting_lunch`
   * settings, optional — blank means no cap):
   *  - INDIVIDUAL bookings over the cap are silently clamped down before
   *    saving; `guestCountAdjustedTo` carries the number it was clamped to so
   *    the client can tell the customer. `null` when no clamp happened.
   *  - COMPANY bookings are never altered; `guestCountOverMax` is just a flag
   *    so the client can show an informational heads-up. `guestCountMax`
   *    carries the cap that was exceeded, for that message's copy.
   */
  | {
      success: true
      totalPrice: number
      bookingType: 'INDIVIDUAL' | 'COMPANY'
      checkoutUrl?: string
      guestCountAdjustedTo?: number | null
      guestCountOverMax?: boolean
      guestCountMax?: number | null
    }
  | { success: false; error: string }

export async function createBooking(data: BookingFormData): Promise<BookingResult> {
  try {
    const tenantId = await getTenantId()

    // The guest's actual chosen language for this request (same cookie read
    // again, unchanged, further down for the email-send branch). Resolved
    // this early so every error guard below — not just the happy path —
    // can return admin-edited, correctly-localized copy instead of a
    // hardcoded English string. No Order.locale column exists, so this only
    // works for requests made directly by a browser; see the later comment
    // on settle.ts's webhook path for why it can't do the same.
    const guestLocale = (await cookies()).get('site_locale')?.value === 'ka' ? 'ka' : 'en'
    // Chunk 4 (On-Site Messages plan) — mirrors the mc() helper every public
    // page/component already has, just server-side: SiteContent section
    // 'messages' with a code-fallback, same {token} substitution as t().
    // Several guards below share a key with BookingForm.tsx's client-side
    // check of the same rule — one editable field controls both surfaces.
    async function mc(key: string, tKey: string, vars?: Record<string, string | number>) {
      let str = await getContent(key, t(guestLocale, tKey), guestLocale)
      if (vars) for (const [k, v] of Object.entries(vars)) str = str.replaceAll(`{${k}}`, String(v))
      return str
    }

    // Guard: abuse on the public demo sandbox. A no-op for real tenants —
    // see lib/demoRateLimit.ts for why this is deliberately demo-only. Not
    // localized/editable, deliberately — demo-only, never a real customer.
    const rate = await checkDemoRateLimit(tenantId, 'booking', DEMO_BOOKING_LIMIT)
    if (rate.limited) {
      return {
        success: false,
        error: `That's a lot of bookings in a short time. This is a shared demo, so it caps how fast bookings can be made — try again in about ${Math.ceil(rate.retryAfterSeconds / 60)} minute(s).`,
      }
    }

    // Guard: past dates
    const dateStr = new Date(data.date).toISOString().split('T')[0]
    const todayStr = new Date().toISOString().split('T')[0]
    if (dateStr < todayStr) {
      return { success: false, error: await mc('onsite_err_future_date', 'form.err_future_date') }
    }

    // Guard: blocked dates (scoped to this tenant)
    const blocked = await withTenantDb(tenantId, tx =>
      tx.blockedDate.findFirst({ where: { date: new Date(dateStr), tenantId } })
    )
    if (blocked) {
      return { success: false, error: await mc('onsite_err_blocked', 'form.err_blocked') }
    }

    // Guard: working hours/days + minimum lead time (#178). Mirrors the client-side
    // check in BookingForm.tsx via the shared lib/bookingHours.ts helpers — this is
    // the authoritative copy, since the client check can be bypassed.
    const [
      workingHoursCustomStr, workingHoursOpen, workingHoursClose, workingHoursDaysJson,
      bookingLeadSplitStr, bookingLeadHoursStr, bookingLeadHoursTastingStr, bookingLeadHoursLunchStr,
    ] = await Promise.all([
      getSetting('working_hours_custom'),
      getSetting('working_hours_open'),
      getSetting('working_hours_close'),
      getSetting('working_hours_days_json'),
      getSetting('booking_lead_split'),
      getSetting('booking_lead_hours'),
      getSetting('booking_lead_hours_tasting'),
      getSetting('booking_lead_hours_tasting_lunch'),
    ])
    const weeklyHours = parseWeeklyHours(workingHoursDaysJson, workingHoursOpen, workingHoursClose)
    const dayHours = getDayHours(dateStr, workingHoursCustomStr === 'true', weeklyHours, workingHoursOpen, workingHoursClose)
    if (dayHours.closed) {
      return { success: false, error: await mc('onsite_err_day_closed', 'form.err_day_closed') }
    }
    const requestedHour = parseInt(data.timeSlot.split(':')[0]) || 0
    const openHour = Math.ceil(parseInt(dayHours.open.split(':')[0]) || 0)
    const closeHour = Math.floor(parseInt(dayHours.close.split(':')[0]) || 0)
    if (requestedHour < openHour || requestedHour > closeHour) {
      return { success: false, error: await mc('onsite_err_working_hours', 'form.err_working_hours') }
    }
    const leadHours = getLeadHours(
      data.visitType, bookingLeadSplitStr === 'true',
      parseInt(bookingLeadHoursStr) || 3, parseInt(bookingLeadHoursTastingStr) || 3, parseInt(bookingLeadHoursLunchStr) || 6
    )
    const minInstant = minBookableInstant(new Date(), leadHours)
    if (!slotMeetsLeadTime(dateStr, data.timeSlot, minInstant)) {
      return { success: false, error: await mc('onsite_err_lead_time', 'form.err_lead_time', { hours: leadHours }) }
    }

    // Guard: min guests from settings (tenant-scoped via getSetting)
    const [minTastingStr, minLunchStr] = await Promise.all([
      getSetting('min_guests_tasting'),
      getSetting('min_guests_tasting_lunch'),
    ])
    const minGuests = data.visitType === 'TASTING'
      ? (parseInt(minTastingStr) || 4)
      : (parseInt(minLunchStr) || 4)

    let guestCount = Number(data.guestCount)
    const isEnhanced = data.bookingType === 'COMPANY' &&
      (data.tastingGuestCount != null || data.lunchGuestCount != null)

    let effectiveGuestCount = isEnhanced
      ? (data.tastingGuestCount ?? 0) + (data.lunchGuestCount ?? 0)
      : guestCount
    if (effectiveGuestCount < minGuests) {
      return { success: false, error: await mc('onsite_err_min_guests', 'form.err_min_guests', { min: minGuests }) }
    }

    // Guard: max guests from settings (optional — blank/unset means no cap).
    // INDIVIDUAL bookings over the cap are clamped down, never rejected.
    // COMPANY bookings are never altered — only flagged for a heads-up.
    const [maxTastingStr, maxLunchStr] = await Promise.all([
      getSetting('max_guests_tasting'),
      getSetting('max_guests_tasting_lunch'),
    ])
    const maxGuestsStr = data.visitType === 'TASTING' ? maxTastingStr : maxLunchStr
    const maxGuests = maxGuestsStr.trim() !== '' && !Number.isNaN(parseInt(maxGuestsStr))
      ? parseInt(maxGuestsStr)
      : null

    let guestCountAdjustedTo: number | null = null
    let guestCountOverMax = false

    if (maxGuests != null && effectiveGuestCount > maxGuests) {
      if (data.bookingType === 'INDIVIDUAL') {
        guestCount = maxGuests
        effectiveGuestCount = maxGuests
        guestCountAdjustedTo = maxGuests
      } else {
        guestCountOverMax = true
      }
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
    // The party size picks the tier (2026-09-19). Registration is never charged
    // on the individual path, which is why the resolver is told so here rather
    // than the fee being zeroed afterwards.
    const individualRates = individualsCompany?.prices.length
      ? ratesForParty(individualsCompany.prices, guestCount, { chargeRegistration: false })
      : null
    const pricePerPersonTasting: number | null = individualRates?.tasting ?? null
    const pricePerPersonLunch: number | null = individualRates?.lunch ?? null

    // The party and its line totals, shared by both branches below.
    const guests = {
      guestCount,
      tastingGuests: data.tastingGuestCount ?? 0,
      lunchGuests: data.lunchGuestCount ?? 0,
    }
    const lines = { masterclass: masterclassAmt, extras: 0 }

    // What this order is actually sold at, frozen onto the row (chunk 4).
    //
    // Seeded from the individuals tier ONLY for an individual booking. A company
    // booking that no tier prices keeps a null snapshot deliberately: its total
    // stays 0 ("confirmed after submission"), and seeding it with the
    // individuals rate would let a later recalc invent a price the winery never
    // quoted.
    //
    // Registration is 0 rather than the tier's fee because the individual path
    // never applies that fee — the snapshot records what was *used*, not what
    // the tier happened to hold.
    const isIndividual = data.bookingType === 'INDIVIDUAL'
    let tastingRateSnapshot: number | null = isIndividual ? pricePerPersonTasting : null
    let lunchRateSnapshot: number | null = isIndividual ? pricePerPersonLunch : null
    let registrationFeeSnapshot: number | null =
      isIndividual && pricePerPersonTasting != null ? 0 : null
    // A COMPANY booking with no companyId is a new-company request (Feature 180) —
    // there's no company row to price against yet, so it must not fall through to
    // the individuals table below. It stays 0 ("confirmed after submission") until
    // the winery creates the company and prices it manually.
    const isNewCompanyRequest = data.bookingType === 'COMPANY' && !data.companyId
    let totalPrice = isEnhanced
      ? masterclassAmt
      : data.bookingType === 'INDIVIDUAL'
        ? (individualRates ? priceBooking(individualRates, guests, data.visitType, lines) : 0)
        : 0

    if (data.bookingType === 'COMPANY' && data.companyId) {
      const company = await withTenantDb(tenantId, tx =>
        tx.company.findFirst({ where: { id: data.companyId, tenantId }, include: { prices: true } })
      )

      if (company?.prices.length) {
        // One lookup on the party size, and one call: priceBooking already
        // branches on whether the buckets are set, which is what the enhanced
        // and simple cases used to hand-code separately.
        const companyRates = ratesForParty(company.prices, guestCount)
        if (companyRates) {
          tastingRateSnapshot = companyRates.tasting
          lunchRateSnapshot = companyRates.lunch
          registrationFeeSnapshot = companyRates.registration
          totalPrice = priceBooking(companyRates, guests, data.visitType, lines)
        } else if (!isEnhanced) {
          return { success: false, error: await mc('onsite_no_rate_detail', 'form.no_rate_detail', { n: guestCount }) }
        }
      }
    } else if (isEnhanced) {
      totalPrice = masterclassAmt
    }

    const createdOrder = await withTenantDb(tenantId, async tx => {
      const created = await tx.order.create({
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
        requestedCompanyName: isNewCompanyRequest ? (data.requestedCompanyName || null) : null,
        totalPrice,
        tastingRateSnapshot,
        lunchRateSnapshot,
        registrationFeeSnapshot,
        tenantId,
        ...NEW_ORDER_COLUMNS,
        companyId: data.bookingType === 'COMPANY' ? data.companyId || null : null,
        // Never trust a client-sent array outright — filter to real ISO codes and
        // dedupe, same defense-in-depth discipline as verifiedGuideId above.
        nationalities: data.bookingType === 'COMPANY'
          ? Array.from(new Set((data.nationalities ?? []).filter(code => VALID_COUNTRY_CODES.has(code))))
          : [],
        masterclassLines: (data.masterclassLines ?? []).length > 0 ? {
          create: (data.masterclassLines ?? []).map(l => ({
            masterclassItemId: l.masterclassItemId,
            quantity: l.quantity,
            pricePerUnit: masterclassPriceMap[l.masterclassItemId] ?? 0,
          })),
        } : undefined,
      },
    })
      /**
       * Who to contact about this booking, one row per role, with snapshots.
       *
       * ⚠️ **The one special case in the whole design, commented here and nowhere else.**
       * The Contact Person's details are *also* in `Order.name/surname/phone/email` above —
       * not by a second write, but because those columns are populated from the very form
       * fields the Contact Person fills (decision 4). They are non-nullable and are the only
       * place an INDIVIDUAL booking's guest name exists, so they cannot be removed; ~16 files
       * read them. One consistent meaning — "who to contact about this booking" — beats
       * sixteen `if (companyBooking)` branches. `OrderContact` is the source of truth; those
       * four columns are a denormalised copy of one of its rows.
       *
       * Snapshots, not just a link: deleting a person later loses the *link* and never the
       * *facts* (finding F2 / KnownBugs #56). That is why `personId` is `SetNull` here, where
       * the same Prisma default on `Order.guideId` was a silent data-loss bug.
       */
      await writeOrderContacts(tx, {
        tenantId,
        target: { orderId: created.id },
        companyId: data.bookingType === 'COMPANY' ? data.companyId || null : null,
        module: 'BOOKING',
        contacts: data.contacts,
        // The form always sends a contact_person for a company booking, so this rarely fires
        // — but it makes the guarantee unconditional rather than dependent on the client.
        fallbackContactPerson: {
          name: `${data.name} ${data.surname}`.trim(),
          phone: data.phone || null,
          email: data.email || null,
        },
      })

      // The first row of the order's timeline. GUEST, because a booking form
      // submission has no admin behind it (chunk 5).
      await recordOrderEvent(tx, {
        tenantId,
        orderId: created.id,
        type: 'CREATED',
        actorType: 'GUEST',
        toStage: created.stage,
        payload: { totalPrice: created.totalPrice, bookingType: created.bookingType, guestCount },
      })
      return created
    })

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
      // #148: section toggle + company override precedence. Individuals never
      // carry a companyId (see shouldTakePayment.ts's PaymentSection doc).
      section: data.bookingType === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'COMPANY',
      companyId: data.bookingType === 'COMPANY' ? (data.companyId || null) : null,
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
        // Already tetri: every input to the total (tier rates, registration fee,
        // masterclass lines, extras) is stored in tetri, and integer arithmetic
        // keeps it there. asTetri asserts that rather than converting.
        amount: asTetri(totalPrice),
        orderDesc: `${typeLabel}, ${effectiveGuestCount} guests, ${dateStr} ${data.timeSlot}`,
        locale,
      })

      if (checkoutUrl) {
        // Marked incomplete only once a checkout really exists — done in this
        // order so a failed checkout leaves a plain NEW booking rather than one
        // filed under abandoned. Cleared by settle.ts the moment money arrives,
        // or by an admin restoring it by hand. Until then the booking is not an
        // order: it appears on /admin/abandoned and on no order screen.
        await withTenantDb(tenantId, tx => tx.order.update({
          where: { id: createdOrder.id },
          data: { abandonedAt: new Date() },
        }))
        // No confirmation email here: "your booking is confirmed" must not
        // reach someone who hasn't paid and may abandon checkout. It is sent
        // by the settlement path once Flitt confirms (phase 7).
        return {
          success: true, totalPrice, bookingType: data.bookingType, checkoutUrl,
          guestCountAdjustedTo, guestCountOverMax, guestCountMax: maxGuests,
        }
      }
      // fall through: checkout unavailable → reservation-only, email as today
    }

    // guestLocale resolved at the top of the function now (Chunk 4) — reused
    // here unchanged. No Order.locale column exists (nothing persists it),
    // so this only works for requests made directly by a browser; settle.ts's
    // webhook path can't do the same (see its own comment) and falls back to
    // the tenant's site-wide default.

    // Fetched unconditionally (not just under `if (data.email)`) because the
    // winery notification below must fire even for phone-only bookings.
    const formattedDate = formatLongDate(new Date(data.date), guestLocale)

    const [wineryPhone, wineryEmail, wineryAddress, bookingIntroUnpaid, bookingIntroPendingCompany, tenant] = await Promise.all([
      getSetting('contact_phone'),
      getSetting('contact_email'),
      getSetting('contact_address'),
      getContent('email_booking_intro_unpaid', guestLocale === 'ka' ? DEFAULT_BOOKING_INTRO_UNPAID_KA : DEFAULT_BOOKING_INTRO_UNPAID, guestLocale),
      getContent('email_booking_intro_pending_company', guestLocale === 'ka' ? DEFAULT_BOOKING_INTRO_PENDING_COMPANY_KA : DEFAULT_BOOKING_INTRO_PENDING_COMPANY, guestLocale),
      db.tenant.findUnique({ where: { id: tenantId }, select: { displayName: true, name: true, theme: true } }),
    ])
    const wineryName = tenant?.displayName ?? tenant?.name ?? ''

    if (data.email) {
      sendBookingConfirmation({
        tenantId,
        name: data.name,
        surname: data.surname,
        email: data.email,
        date: formattedDate,
        timeSlot: data.timeSlot,
        guestCount,
        visitType: data.visitType,
        totalPrice,
        wineryName,
        wineryAddress,
        wineryPhone,
        wineryEmail,
        theme: resolveTenantTheme(tenant?.theme ?? null),
        pendingNewCompany: isNewCompanyRequest,
        introText: isNewCompanyRequest ? bookingIntroPendingCompany : bookingIntroUnpaid,
        locale: guestLocale,
      }).catch(err => console.error('Email send failed:', err))
    }

    sendNewBookingNotification({
      tenantId,
      tenantName: wineryName,
      wineryEmail,
      guestName: data.name,
      guestSurname: data.surname,
      guestEmail: data.email,
      guestPhone: data.phone,
      date: formattedDate,
      timeSlot: data.timeSlot,
      guestCount,
      visitType: data.visitType,
      totalPrice,
      bookingType: data.bookingType,
      requestedCompanyName: isNewCompanyRequest ? (data.requestedCompanyName || null) : null,
    }).catch(err => console.error('Winery notification email failed:', err))

    return {
      success: true, totalPrice, bookingType: data.bookingType,
      guestCountAdjustedTo, guestCountOverMax, guestCountMax: maxGuests,
    }
  } catch {
    // mc()/guestLocale above are scoped to the try block, and whatever threw
    // could in principle be the cookies()/DB call either depends on — so this
    // re-resolves both defensively rather than assuming they're available.
    // Reuses Chunk 1's onsite_new_company_error field: same generic
    // catch-all wording as the New Company popup's own error state.
    try {
      const locale = (await cookies()).get('site_locale')?.value === 'ka' ? 'ka' : 'en'
      const message = await getContent('onsite_new_company_error', t(locale, 'form.new_company_error'), locale)
      return { success: false, error: message }
    } catch {
      return { success: false, error: t('en', 'form.new_company_error') }
    }
  }
}
