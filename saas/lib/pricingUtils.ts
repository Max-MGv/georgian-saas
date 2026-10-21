// ─── Party-size pricing (2026-09-19) — on the new columns since T-152 Chunk 3 ──
//
// These keep TODAY's rules (the tier is picked by the party size; an order is
// either split into tasting / tasting+lunch or priced on its visit type) but read
// the product columns. They are replaced by the product model below when the
// forms move to it (Plan-PricingModel Chunks 7–8) and then deleted.
//
// See vault/MaintenanceNotes.md §22.

/** A tier row. Same shape as {@link ProductTier} (declared below). */
export type PriceTier = ProductTier

/**
 * Per-person rate for a guest doing tasting + lunch: the row's all-in
 * Tasting & Lunch price (since T-152 it is stored all-in, not as an add-on).
 *
 * `?? 0` only because the column is nullable while the old model is phased out;
 * a row converted from the old model always has it (Chunk 2's backfill), and the
 * product model never reads this function.
 */
export function comboRatePerPerson<T extends PriceTier>(tier: T): number {
  return tier.tastingLunchPrice ?? 0
}

/** Per-person tasting rate of a row (same nullable caveat as {@link comboRatePerPerson}). */
export function tastingRatePerPerson<T extends PriceTier>(tier: T): number {
  return tier.tastingOnlyPrice ?? 0
}

/**
 * Find the price tier for a given party size.
 *
 * - Exact match: guest count falls within a tier's min/max range.
 * - No exact match: returns the highest-priced tier (protects against
 *   under-charging very small groups that fall below the lowest tier).
 * - Returns undefined only when prices is empty or guestCount is 0.
 */
export function findTier<T extends PriceTier>(
  prices: T[],
  guestCount: number
): T | undefined {
  if (prices.length === 0 || guestCount === 0) return undefined
  const exact = prices.find(
    p => guestCount >= p.minGuests && guestCount <= p.maxGuests
  )
  if (exact) return exact
  // Fallback: highest tasting price tier
  return prices.reduce((best, p) =>
    tastingRatePerPerson(p) > tastingRatePerPerson(best) ? p : best
  )
}

/** All tetri. Where these came from is the resolver's business, not priceBooking's. */
export type RateSet = {
  /** Per person having tasting only. */
  tasting: number
  /** Per person having tasting AND lunch — all-in, NOT the lunch add-on. */
  lunch: number
  /** Charged once for the booking, not per head. */
  registration: number
}

export type Headcount = {
  /** The party size. This alone decides the price tier. */
  guestCount: number
  /** Of that party, how many have tasting only. */
  tastingGuests: number
  /** Of that party, how many have tasting AND lunch. */
  lunchGuests: number
}

export type LineTotals = { masterclass: number; extras: number }

/** Same as {@link BookingVisitType} since Chunk 6 (the database's VisitType gained 'LUNCH'). */
export type VisitType = BookingVisitType

/**
 * The rates for a party, from its company's price ladder.
 *
 * **The tier is chosen by party size, not by how many of them are paying**
 * (Max, 2026-09-19 — retired by the product model, T-152). `registration` is the
 * company's flat fee (`Company.registrationFee`); individuals pass 0.
 */
export function ratesForParty<T extends PriceTier>(
  prices: T[],
  guestCount: number,
  registration: number,
): RateSet | null {
  const tier = findTier(prices, guestCount)
  if (!tier) return null
  return ratesFromTier(tier, registration)
}

/** Rates a tier already in hand. Prefer {@link ratesForParty}, which picks the tier too. */
export function ratesFromTier<T extends PriceTier>(tier: T, registration: number): RateSet {
  return {
    tasting: tastingRatePerPerson(tier),
    lunch: comboRatePerPerson(tier),
    registration,
  }
}

/**
 * The rates this order was sold at, read back off the row.
 *
 * Null when the order predates the snapshot columns — the caller must then
 * decide, loudly, what to do. It must never quietly substitute live rates.
 */
export function ratesFromSnapshot(o: {
  tastingOnlyRate: number | null
  tastingLunchRate: number | null
  registrationFeeSnapshot: number | null
}): RateSet | null {
  if (o.tastingOnlyRate == null && o.tastingLunchRate == null) return null
  return {
    tasting: o.tastingOnlyRate ?? 0,
    lunch: o.tastingLunchRate ?? 0,
    registration: o.registrationFeeSnapshot ?? 0,
  }
}

/** Hand-typed rates, for a walk-in or a company with no ladder. No registration fee. */
export function ratesFromManual(tasting: number, lunch: number): RateSet {
  return { tasting, lunch, registration: 0 }
}

/** An order's boxes as the party-size functions read them (old "tasting" / "lunch" = Tasting only / Tasting & Lunch). */
export function headcountOf(o: { guestCount: number; tastingOnlyGuests: number | null; tastingLunchGuests: number | null }): Headcount {
  return { guestCount: o.guestCount, tastingGuests: o.tastingOnlyGuests ?? 0, lunchGuests: o.tastingLunchGuests ?? 0 }
}

/**
 * What a booking costs, in tetri.
 *
 * Two shapes, and which one applies is decided by the buckets, not by visitType:
 *
 *  - **Split party** (someone is in a bucket): each bucket pays its own rate.
 *    `visitType` is ignored — the buckets already say who is eating.
 *  - **Unsplit party** (both buckets empty): the whole party is on one visit
 *    type, so `visitType` picks the rate.
 *
 * `freeGuestCount` never appears here: free guests are not charged. They do
 * count toward the tier, which happens in {@link ratesForParty}, not here.
 */
export function priceBooking(
  rates: RateSet,
  guests: Headcount,
  visitType: VisitType,
  lines: LineTotals,
): number {
  // This old two-bucket formula has no Lunch-only rate: an unsplit Lunch-only party would be priced at the
  // TASTING rate. Nothing creates such an order before Plan-PricingModel Chunk 7, and Chunks 7–8 move every
  // caller to priceCounts() first — until then, refuse loudly rather than misprice (Chunk 6, 2026-10-21).
  if (visitType === 'LUNCH') throw new Error('priceBooking() cannot price a Lunch only booking — use priceCounts() (Plan-PricingModel Chunk 7)')
  const paying = guests.tastingGuests + guests.lunchGuests
  const base = paying > 0
    ? guests.tastingGuests * rates.tasting + guests.lunchGuests * rates.lunch
    : guests.guestCount * (visitType === 'TASTING_LUNCH' ? rates.lunch : rates.tasting)
  return base + rates.registration + lines.masterclass + lines.extras
}

// ─── The product model (Plan-PricingModel, T-152, Max 2026-10-20) ────────────
//
// Companies sell three products — Tasting only, Lunch only, Tasting & Lunch — and
// every guest is in exactly one of them (or Free). Each product finds its tier
// from ITS OWN guest count, so one booking can use different rows of the same
// ladder; the group total plays no part in the price. Individuals are the same
// model with one product for the whole group.
//
// Everything above this line is the old model and is removed in the plan's
// Chunk 3/4, once every caller has moved here.

export type Product = 'tastingOnly' | 'lunchOnly' | 'tastingLunch'
export const PRODUCTS: readonly Product[] = ['tastingOnly', 'lunchOnly', 'tastingLunch']

/** Every visit type, including the company simple form's Lunch only (D-10). */
export type BookingVisitType = 'TASTING' | 'TASTING_LUNCH' | 'LUNCH'

/**
 * One row of a price ladder, all tetri. A null price means the product is not
 * offered on this row (D-7) — never read it as ₾0. Tasting & Lunch is its own
 * all-in price, not tasting + something.
 */
export type ProductTier = {
  minGuests: number
  maxGuests: number
  tastingOnlyPrice: number | null
  lunchOnlyPrice: number | null
  tastingLunchPrice: number | null
}

/** Who is coming. guestCount (the kitchen count) is always the sum of all four. */
export type Counts = { tastingOnly: number; lunchOnly: number; tastingLunch: number; free: number }

/** Per-person rate for each product (null = not offered / not used), plus the once-per-booking fee. */
export type ProductRates = {
  tastingOnly: number | null
  lunchOnly: number | null
  tastingLunch: number | null
  registration: number
}

const PRICE_FIELD: Record<Product, 'tastingOnlyPrice' | 'lunchOnlyPrice' | 'tastingLunchPrice'> = {
  tastingOnly: 'tastingOnlyPrice',
  lunchOnly: 'lunchOnlyPrice',
  tastingLunch: 'tastingLunchPrice',
}

export function productPrice(tier: ProductTier, product: Product): number | null {
  return tier[PRICE_FIELD[product]]
}

export const payingGuests = (c: Counts) => c.tastingOnly + c.lunchOnly + c.tastingLunch
export const totalGuests = (c: Counts) => payingGuests(c) + c.free

/**
 * The row of the ladder that prices `count` guests of `product`.
 *
 * Only rows that offer the product are considered. Exact range match first;
 * otherwise the highest-priced row that offers it — the same protection the
 * old `findTier` gave against an unpriced gap (A-7). Undefined when the count
 * is 0 or no row offers the product at all ("not offered").
 */
export function findProductTier<T extends ProductTier>(prices: T[], product: Product, count: number): T | undefined {
  if (count <= 0) return undefined
  const offering = prices.filter(p => productPrice(p, product) != null)
  if (offering.length === 0) return undefined
  const exact = offering.find(p => count >= p.minGuests && count <= p.maxGuests)
  if (exact) return exact
  return offering.reduce((best, p) => (productPrice(p, product)! > productPrice(best, product)! ? p : best))
}

/**
 * Rates for a booking from a price ladder: each product with guests looks up its
 * own row by its own count. Products with no guests get null (nothing to freeze).
 * `registration` is the company's flat fee (D-6) — 0 for individuals.
 */
export function ratesForCounts<T extends ProductTier>(prices: T[], counts: Counts, registration: number): ProductRates {
  const rate = (p: Product) => {
    const tier = findProductTier(prices, p, counts[p])
    return tier ? productPrice(tier, p) : null
  }
  return { tastingOnly: rate('tastingOnly'), lunchOnly: rate('lunchOnly'), tastingLunch: rate('tastingLunch'), registration }
}

/** The rates an order was sold at, read back off the row. Null when nothing was frozen (pre-snapshot order). */
export function ratesFromProductSnapshot(o: {
  tastingOnlyRate: number | null
  lunchOnlyRate: number | null
  tastingLunchRate: number | null
  registrationFeeSnapshot: number | null
}): ProductRates | null {
  if (o.tastingOnlyRate == null && o.lunchOnlyRate == null && o.tastingLunchRate == null) return null
  return {
    tastingOnly: o.tastingOnlyRate,
    lunchOnly: o.lunchOnlyRate,
    tastingLunch: o.tastingLunchRate,
    registration: o.registrationFeeSnapshot ?? 0,
  }
}

/** Admin-typed all-in rates for a company with no ladder (A-9). Blank = not offered. No registration fee. */
export function ratesFromManualProducts(tastingOnly: number | null, lunchOnly: number | null, tastingLunch: number | null): ProductRates {
  return { tastingOnly, lunchOnly, tastingLunch, registration: 0 }
}

/** Products that have guests but no rate. Must be empty before {@link priceCounts} is called. */
export function notOffered(rates: ProductRates, counts: Counts): Product[] {
  return PRODUCTS.filter(p => counts[p] > 0 && rates[p] == null)
}

/**
 * What a booking costs, in tetri: each product's guests × its rate, plus the
 * registration fee and the line totals. Free guests are never charged.
 *
 * Throws when a product with guests has no rate — pricing it at ₾0 would be a
 * silent undercharge; callers check {@link notOffered} first and refuse or warn.
 */
export function priceCounts(rates: ProductRates, counts: Counts, lines: LineTotals): number {
  const missing = notOffered(rates, counts)
  if (missing.length > 0) throw new Error(`priceCounts: no rate for ${missing.join(', ')}`)
  const base = PRODUCTS.reduce((sum, p) => sum + (counts[p] > 0 ? counts[p] * (rates[p] as number) : 0), 0)
  return base + rates.registration + lines.masterclass + lines.extras
}

/**
 * The boxes for a booking made with ONE guest count (individuals, company simple
 * form): the whole group is on the product its visit type names (A-4).
 */
export function countsFromVisit(visitType: BookingVisitType, guestCount: number): Counts {
  return {
    tastingOnly: visitType === 'TASTING' ? guestCount : 0,
    lunchOnly: visitType === 'LUNCH' ? guestCount : 0,
    tastingLunch: visitType === 'TASTING_LUNCH' ? guestCount : 0,
    free: 0,
  }
}

/**
 * How an order stored under the OLD model reads in the new one (A-2/A-4, §4.1).
 * The migration's backfill SQL mirrors this function exactly; Chunk 2 checks the
 * database against it row by row.
 *
 *  - split (tasting or lunch box used): old "tasting" = Tasting only, old "lunch"
 *    (who also tasted) = Tasting & Lunch; guests the split left out were never
 *    charged, so they join Free (E-2).
 *  - unsplit: the whole guestCount is on the visit type's product. Old unsplit
 *    pricing charged every guest including any free ones, so free folds in (E-1).
 */
export function countsFromLegacy(o: {
  visitType: string
  guestCount: number
  tastingGuestCount: number
  lunchGuestCount: number
  freeGuestCount: number
}): Counts {
  if (o.tastingGuestCount + o.lunchGuestCount > 0) {
    const leftover = Math.max(0, o.guestCount - (o.tastingGuestCount + o.lunchGuestCount + o.freeGuestCount))
    return { tastingOnly: o.tastingGuestCount, lunchOnly: 0, tastingLunch: o.lunchGuestCount, free: o.freeGuestCount + leftover }
  }
  return countsFromVisit(o.visitType === 'TASTING_LUNCH' ? 'TASTING_LUNCH' : 'TASTING', o.guestCount)
}

/** An order's boxes, read back off its columns (the inverse of {@link boxColumns}). */
export function countsOf(o: { tastingOnlyGuests: number; lunchOnlyGuests: number; tastingLunchGuests: number; freeGuestCount: number }): Counts {
  return { tastingOnly: o.tastingOnlyGuests, lunchOnly: o.lunchOnlyGuests, tastingLunch: o.tastingLunchGuests, free: o.freeGuestCount }
}

/** Product names as admins and guests read them (English; the forms translate their own copy). */
export const PRODUCT_LABEL: Record<Product, string> = { tastingOnly: 'Tasting only', lunchOnly: 'Lunch only', tastingLunch: 'Tasting & Lunch' }

/** The Order / InvoiceSent columns that hold the boxes. guestCount stays as the caller sets it. */
export function boxColumns(c: Counts) {
  return { tastingOnlyGuests: c.tastingOnly, lunchOnlyGuests: c.lunchOnly, tastingLunchGuests: c.tastingLunch, freeGuestCount: c.free }
}

/**
 * A tier's three product prices as the admin actions take them (T-152). TETRI per person; null = the
 * product is not offered on this row. Tasting & Lunch is the ALL-IN price, not an add-on. The registration
 * fee is not per row any more — it is `Company.registrationFee`. Lives here, not in the action file:
 * a 'use server' file may export async functions only (MaintenanceNotes §24).
 */
export type TierPrices = { tastingOnlyPrice: number | null; lunchOnlyPrice: number | null; tastingLunchPrice: number | null }
