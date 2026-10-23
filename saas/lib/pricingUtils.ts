// ─── Tier lookup by party size — the home page's display price only ──────────
//
// The party-size pricing that used to live here (priceBooking, ratesForParty, …) was retired by the product
// model below (Plan-PricingModel Chunk 10, 2026-10-22); every write path now prices per product. What is left
// is the one lookup the home page and the payment-setup banner still make: "the Individuals row for N guests".
//
// See vault/MaintenanceNotes.md §22.

/** A tier row. Same shape as {@link ProductTier} (declared below). */
export type PriceTier = ProductTier

/** A row's all-in Tasting & Lunch per-person price (the home page's "Tasting + Lunch from …"). */
export function comboRatePerPerson<T extends PriceTier>(tier: T): number {
  return tier.tastingLunchPrice ?? 0
}

/**
 * The row for a party size: the exact range, else the highest-priced row (never under-quote a small group).
 * Undefined only for an empty ladder or 0 guests. Booking prices use {@link findProductTier} instead.
 */
export function findTier<T extends PriceTier>(prices: T[], guestCount: number): T | undefined {
  if (prices.length === 0 || guestCount === 0) return undefined
  const exact = prices.find(p => guestCount >= p.minGuests && guestCount <= p.maxGuests)
  if (exact) return exact
  return prices.reduce((best, p) => ((p.tastingOnlyPrice ?? 0) > (best.tastingOnlyPrice ?? 0) ? p : best))
}

export type LineTotals = { masterclass: number; extras: number }

// ─── The product model (Plan-PricingModel, T-152, Max 2026-10-20) ────────────
//
// Companies sell three products — Tasting only, Lunch only, Tasting & Lunch — and
// every guest is in exactly one of them (or Free). Each product finds its tier
// from ITS OWN guest count, so one booking can use different rows of the same
// ladder; the group total plays no part in the price. Individuals are the same
// model with one product for the whole group.
//

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
 * Only rows that offer the product are considered. Exact range match first.
 * Above the last row (more guests than any row's max) → the last row: its max is a
 * cap, not a limit, and the guest was shown "7+ guests" (Max, 2026-10-23: "if 101
 * guests and max is 100 it should take the 100 tier price"). Otherwise — a gap
 * between rows, or fewer than the first row's min — the highest-priced row that
 * offers it, the same protection the old `findTier` gave (A-7: overcharge rather
 * than undercharge). Undefined when the count is 0 or no row offers the product
 * at all ("not offered").
 */
export function findProductTier<T extends ProductTier>(prices: T[], product: Product, count: number): T | undefined {
  if (count <= 0) return undefined
  const offering = prices.filter(p => productPrice(p, product) != null)
  if (offering.length === 0) return undefined
  const exact = offering.find(p => count >= p.minGuests && count <= p.maxGuests)
  if (exact) return exact
  const last = offering.reduce((top, p) => (p.maxGuests > top.maxGuests ? p : top))
  if (count > last.maxGuests) return last
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

/** Admin-typed per-person rates, tetri, per product. null (or ≤ 0) = nothing typed for that product. */
export type ManualRates = Record<Product, number | null>

/**
 * The admin screens' pricing (New Order, the order page, and their two server actions — Plan-PricingModel
 * Chunk 8). One rule so the preview and the stored total cannot disagree:
 * - The company's price table first: each product by its own count (D-2), its flat fee (D-6).
 * - A product with guests the table does not offer — or every product when there is no table (individuals
 *   on these screens, A-9) — takes the admin's typed rate (E-3). Typed rates carry no registration fee.
 * - No table and nothing typed for any product with guests → 'unpriced': the price is set later, as today.
 * - Otherwise a product with guests and no rate from either source → 'missing' (never priced at ₾0, D-7).
 */
export type AdminQuote =
  | { kind: 'priced'; rates: ProductRates; typed: Product[] }
  | { kind: 'unpriced' }
  | { kind: 'missing'; products: Product[] }

export function adminQuote<T extends ProductTier>(prices: T[], registration: number, counts: Counts, manual: ManualRates): AdminQuote {
  const hasTable = prices.length > 0
  const base: ProductRates = hasTable
    ? ratesForCounts(prices, counts, registration)
    : { tastingOnly: null, lunchOnly: null, tastingLunch: null, registration: 0 }
  const typedRate = (p: Product) => { const v = manual[p]; return v != null && v > 0 ? v : null }
  const needed = PRODUCTS.filter(p => counts[p] > 0 && base[p] == null)
  if (!hasTable && needed.every(p => typedRate(p) == null)) return { kind: 'unpriced' }
  const missing = needed.filter(p => typedRate(p) == null)
  if (missing.length > 0) return { kind: 'missing', products: missing }
  const rates = { ...base }
  for (const p of needed) rates[p] = typedRate(p)
  return { kind: 'priced', rates, typed: needed }
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
export const PRODUCT_LABEL: Record<Product, string> = { tastingOnly: 'Tasting', lunchOnly: 'Lunch', tastingLunch: 'Tasting & Lunch' }

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
