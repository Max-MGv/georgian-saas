'use server'

import { db, withTenantDb } from '@/lib/db'
import { writeOrderContacts } from '@/lib/orderContacts'
import { recordOrderEvent } from '@/lib/orderEvents'
import { asTetri } from '@/lib/money'
import { BookingType, VisitType } from '@prisma/client'
import { cookies, headers } from 'next/headers'
import { sendBookingConfirmation } from '@/lib/emails/bookingConfirmation'
import { sendNewBookingNotification } from '@/lib/emails/newBookingNotification'
import { resolveTenantTheme } from '@/lib/themePresets'
import { boxColumns, countsFromVisit, notOffered, payingGuests, priceCounts, ratesForCounts, totalGuests, type BookingVisitType, type Product, type ProductRates } from '@/lib/pricingUtils'
import { sumQuantityLines } from '@/lib/orderLines'
import { groupShownOn } from '@/lib/addOns'
import { priceTableWine, type TableWineRow } from '@/lib/tableWine'
import { checkBookingCounts, checkMasterclassLines, COUNT_RULE_KEYS, countRulesFromSettings, hotDishWithoutLunch, MASTERCLASS_CATALOGUE_SELECT, type CountRuleKey } from '@/lib/bookingInput'
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
import { checkWriteRateLimit } from '@/lib/writeRateLimit'
import { parseWeeklyHours, getDayHours, getLeadHours, minBookableInstant, slotMeetsLeadTime } from '@/lib/bookingHours'
import { COUNTRIES } from '@/lib/countries'
import { NEW_ORDER_COLUMNS } from '@/lib/statusWrite'
import { companyCodeProof } from '@/lib/contactResolution'
import { tbilisiDateIso } from '@/lib/tbilisiTime'

const VALID_COUNTRY_CODES = new Set(COUNTRIES.map(c => c.code))
/** Public-site translation key for each product's name (lib/t.ts). */
const PRODUCT_T: Record<Product, string> = { tastingOnly: 'form.product_tasting_only', lunchOnly: 'form.product_lunch_only', tastingLunch: 'form.product_tasting_lunch' }

export type BookingFormData = {
  bookingType: 'INDIVIDUAL' | 'COMPANY'
  companyId?: string
  /**
   * The access code the guest confirmed for `companyId`. Checked again on the server
   * (`companyCodeMatches`, KnownBugs #78): naming a company is not proving it, and the
   * company's price tiers are only for someone who knows its code.
   */
  companyCode?: string
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
  /** 'LUNCH' only on the company simple form (Plan-PricingModel D-10). */
  visitType: 'TASTING' | 'TASTING_LUNCH' | 'LUNCH'
  date: string
  timeSlot: string
  guestCount: number
  name: string
  surname: string
  email?: string
  phone?: string
  /**
   * The detailed company form's four boxes (T-152 D-3). Read only when the tenant has the detailed form on;
   * otherwise `guestCount` is the one count and the server builds the boxes from the visit type (A-4).
   */
  boxes?: { tastingOnly: number; lunchOnly: number; tastingLunch: number; free: number }
  hotDishVegetable?: string | null
  hotDishMeat?: string | null
  foodNotes?: string | null
  /** pricePerUnit is ignored — the server reads every price from its own catalogue (#93). */
  masterclassLines?: { masterclassItemId: string; quantity: number; pricePerUnit?: number }[]
  /** Wine for the table (T-22): bottles of wines the winery switched on for bookings. Names and prices are read from the database; a company's terms only once its code is proven. */
  wineLines?: { vintageId: string; quantity: number }[]
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

    // Guard: abuse on public write actions. Every tenant is throttled — see
    // lib/writeRateLimit.ts for the demo-vs-real thresholds. Not
    // localized/editable, deliberately — this is a backstop, not a UX surface.
    const rate = await checkWriteRateLimit(tenantId, 'booking')
    if (rate.limited) {
      return {
        success: false,
        error: `That's a lot of bookings in a short time — please wait about ${Math.ceil(rate.retryAfterSeconds / 60)} minute(s) and try again.`,
      }
    }

    // Guard: past dates
    const dateStr = new Date(data.date).toISOString().split('T')[0]
    // Today on the winery's calendar, not the server's (UTC on Vercel — KnownBugs #79).
    const todayStr = tbilisiDateIso(new Date())
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

    // ── Who is coming (Plan-PricingModel §4.3, KnownBugs #93) ──────────────────
    // The server decides the layout from the tenant's setting — never from what the request happens to
    // contain — and runs the one shared check: whole numbers 0…999, at least one paying guest, visit type
    // and boxes agreeing (Q-3), the group minimum and any company per-product minimum. Forms only mirror it.
    const enhancedOn = (await getSetting('enable_enhanced_company_booking')) === 'true'
    const layout = data.bookingType === 'COMPANY' && enhancedOn ? 'boxes' : 'single'
    const ruleValues = await Promise.all(COUNT_RULE_KEYS.map(k => getSetting(k)))
    const ruleMap = new Map<CountRuleKey, string>(COUNT_RULE_KEYS.map((k, i) => [k, ruleValues[i]]))
    const visitForRules: BookingVisitType = (['TASTING', 'TASTING_LUNCH', 'LUNCH'] as const).includes(data.visitType as BookingVisitType)
      ? data.visitType as BookingVisitType : 'TASTING'
    const rules = countRulesFromSettings(k => ruleMap.get(k), visitForRules, data.bookingType)
    const checkedCounts = checkBookingCounts({
      bookingType: data.bookingType, layout, form: 'public', visitType: data.visitType,
      guestCount: data.guestCount,
      ...(layout === 'boxes' ? {
        tastingOnly: data.boxes?.tastingOnly, lunchOnly: data.boxes?.lunchOnly,
        tastingLunch: data.boxes?.tastingLunch, free: data.boxes?.free,
      } : {}),
    }, rules)
    if (!checkedCounts.ok) {
      const e = checkedCounts.error
      if (e.code === 'below_group_min') return { success: false, error: await mc('onsite_err_min_guests', 'form.err_min_guests', { min: e.min }) }
      if (e.code === 'below_product_min') return { success: false, error: await mc('onsite_err_product_min', 'form.err_product_min', { min: e.min, product: t(guestLocale, PRODUCT_T[e.product]) }) }
      if (e.code === 'too_many_free') return { success: false, error: await mc('onsite_err_too_many_free', 'form.err_too_many_free', { max: e.max }) }
      if (e.code === 'visit_mismatch' && data.visitType === 'TASTING_LUNCH') return { success: false, error: await mc('onsite_err_visit_mismatch', 'form.err_visit_mismatch') }
      return { success: false, error: await mc('onsite_err_guest_counts', 'form.err_guest_counts') }
    }
    const visitType = checkedCounts.visitType
    let counts = checkedCounts.counts

    // Guard: max guests from settings (optional — blank/unset means no cap), on the PAYING guests as before.
    // INDIVIDUAL bookings over the cap are clamped down, never rejected.
    // COMPANY bookings are never altered — only flagged for a heads-up.
    const maxGuests = rules.groupMax
    let guestCountAdjustedTo: number | null = null
    let guestCountOverMax = false
    if (maxGuests != null && payingGuests(counts) > maxGuests) {
      if (data.bookingType === 'INDIVIDUAL') {
        counts = countsFromVisit(visitType, maxGuests)
        guestCountAdjustedTo = maxGuests
      } else {
        guestCountOverMax = true
      }
    }
    const guestCount = totalGuests(counts)
    const effectiveGuestCount = payingGuests(counts)

    // A hot dish needs a lunch guest (A-11). Only the detailed company form asks for one; anything sent from
    // another layout is ignored below, as before.
    if (layout === 'boxes' && hotDishWithoutLunch(counts, data.hotDishVegetable, data.hotDishMeat)) {
      return { success: false, error: await mc('onsite_err_hot_dish', 'form.err_hot_dish') }
    }

    // ── Add-on lines (#93, T-7): this tenant's items, active, in a group offered to this kind of guest on this visit
    // type; per person = the paying guests, FLAT = 1, a typed quantity whole 1…999; price from the DB ──
    // Any form can send them now (the groups decide who is offered what); before T-7 only the detailed company form did.
    const catalogue = (data.masterclassLines ?? []).length > 0
      ? await withTenantDb(tenantId, tx => tx.masterclassItem.findMany({
          where: { tenantId }, select: MASTERCLASS_CATALOGUE_SELECT,
        }))
      : []
    const checkedLines = checkMasterclassLines(data.masterclassLines, catalogue, {
      payingGuests: effectiveGuestCount,
      shownOn: { bookingType: data.bookingType, visitType },
    })
    if (!checkedLines.ok) return { success: false, error: await mc('onsite_err_masterclass', 'form.err_masterclass') }
    const masterclassLines = checkedLines.lines
    const masterclassAmt = sumQuantityLines(masterclassLines)

    // ── Wine for the table (T-22): the winery's bookable wines, priced by lib/tableWine.ts — the same rules as a wine order.
    // A company's terms (its agreed prices and % off) apply ONLY once the company is proven by its code, below; an
    // individual, or a company merely named, pays the website price. The group must be switched on and offered to this guest.
    let wineRows: TableWineRow[] = []
    let wineAmt = 0
    const priceWine = async (termsCompanyId: string | null): Promise<string | null> => {
      if ((data.wineLines ?? []).length === 0) return null
      const unavailable = await mc('onsite_err_wine', 'form.err_wine')
      const wineOn = (await headers()).get('x-tenant-modules-wine-orders') === 'true'
      if (!wineOn) return unavailable
      const group = await withTenantDb(tenantId, tx => tx.addOnGroup.findFirst({ where: { tenantId, kind: 'WINE', active: true } }))
      if (!group || !groupShownOn(group, data.bookingType, visitType)) return unavailable
      const priced = await withTenantDb(tenantId, tx => priceTableWine(tx, tenantId, { lines: data.wineLines, termsCompanyId, locale: guestLocale }))
      if (!priced.ok) return unavailable
      wineRows = priced.rows
      wineAmt = priced.total
      return null
    }
    const linesNow = () => ({ masterclass: masterclassAmt, extras: 0, wine: wineAmt })

    // ── Price (Plan-PricingModel §4.2): each product looks up its own row by its own count (D-2) ──
    // A product with guests that the ladder does not offer is refused — never priced at ₾0 (D-7).
    // No ladder at all = no price yet ("confirmed after submission"): total = the add-ons, nothing frozen.
    const notOfferedError = async (missing: Product[]) => ({
      success: false as const,
      error: await mc('onsite_err_not_offered', 'form.err_not_offered', { product: missing.map(m => t(guestLocale, PRODUCT_T[m])).join(', ') }),
    })
    let rates: ProductRates | null = null
    let totalPrice = masterclassAmt
    const isNewCompanyRequest = data.bookingType === 'COMPANY' && !data.companyId

    if (data.bookingType === 'INDIVIDUAL' || !data.companyId) {
      // An individual, or a company that is only being requested (no company chosen yet): website wine prices.
      const wineError = await priceWine(null)
      if (wineError) return { success: false, error: wineError }
    }

    if (data.bookingType === 'INDIVIDUAL') {
      // Registration is never charged on the individual path.
      const individualsCompany = await withTenantDb(tenantId, tx =>
        tx.company.findFirst({ where: { tenantId, isIndividual: true }, include: { prices: { orderBy: { minGuests: 'asc' } } } })
      )
      if (individualsCompany?.prices.length) {
        rates = ratesForCounts(individualsCompany.prices, counts, 0)
        const missing = notOffered(rates, counts)
        if (missing.length) return await notOfferedError(missing)
        totalPrice = priceCounts(rates, counts, linesNow())
      }
    } else if (data.companyId) {
      // The browser names the company; the server decides whether this guest may book as it.
      // Without the code check a crafted request got a coded company's price tiers (KnownBugs #78).
      const checked = await withTenantDb(tenantId, async tx => {
        const c = await tx.company.findFirst({
          where: { id: data.companyId, tenantId, isIndividual: false },
          include: { prices: true },
        })
        return c && { company: c, proof: await companyCodeProof(tx, tenantId, c, data.companyCode, 'BOOKING') }
      })
      // Proven by its code or a person's code only. A company merely named — including one with no
      // access code at all — is an unknown company (Max, 2026-10-14: "otherwise the code loses meaning").
      if (!checked || !checked.proof || checked.proof === 'named') {
        return { success: false, error: await mc('onsite_access_code_error', 'form.access_code_error') }
      }
      const company = checked.company
      // Proven: this company's agreed wine prices and % apply to the wine it added.
      const wineError = await priceWine(company.id)
      if (wineError) return { success: false, error: wineError }
      if (company.prices.length) {
        rates = ratesForCounts(company.prices, counts, company.registrationFee)
        const missing = notOffered(rates, counts)
        if (missing.length) return await notOfferedError(missing)
        totalPrice = priceCounts(rates, counts, linesNow())
      }
    }
    // No price table / no pricing configured: the winery confirms the visit price by hand, as before. What the guest chose
    // (add-ons, wine) is already priced, so it is the total until then.
    if (!rates) totalPrice = masterclassAmt + wineAmt

    const createdOrder = await withTenantDb(tenantId, async tx => {
      const created = await tx.order.create({
      data: {
        bookingType: data.bookingType as BookingType,
        visitType: visitType as VisitType,
        date: new Date(data.date),
        timeSlot: data.timeSlot,
        guestCount,
        ...boxColumns(counts),
        // Hot dishes are asked on the detailed company form for a lunch visit only.
        hotDishVegetable: layout === 'boxes' && visitType !== 'TASTING' ? data.hotDishVegetable || null : null,
        hotDishMeat: layout === 'boxes' && visitType !== 'TASTING' ? data.hotDishMeat || null : null,
        foodNotes: layout === 'boxes' ? data.foodNotes || null : null,
        name: data.name,
        surname: data.surname,
        email: data.email || null,
        phone: data.phone || null,
        requestedCompanyName: isNewCompanyRequest ? (data.requestedCompanyName || null) : null,
        totalPrice,
        // What this order is sold at, frozen per product (chunk 4 / T-152). Null when nothing priced it.
        tastingOnlyRate: rates?.tastingOnly ?? null,
        lunchOnlyRate: rates?.lunchOnly ?? null,
        tastingLunchRate: rates?.tastingLunch ?? null,
        registrationFeeSnapshot: rates ? rates.registration : null,
        tenantId,
        ...NEW_ORDER_COLUMNS,
        companyId: data.bookingType === 'COMPANY' ? data.companyId || null : null,
        // Never trust a client-sent array outright — filter to real ISO codes and
        // dedupe, the same defense-in-depth discipline buildOrderContactRows() applies to
        // every client-sent roleId and personId below.
        nationalities: data.bookingType === 'COMPANY'
          ? Array.from(new Set((data.nationalities ?? []).filter(code => VALID_COUNTRY_CODES.has(code))))
          : [],
        masterclassLines: masterclassLines.length > 0 ? { create: masterclassLines } : undefined,
        wineLines: wineRows.length > 0 ? { create: wineRows } : undefined,
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
      const typeLabel = visitType === 'TASTING' ? 'Tasting' : visitType === 'LUNCH' ? 'Lunch' : 'Tasting + Lunch'
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
        visitType,
        boxes: counts,
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
      visitType,
      boxes: counts,
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
