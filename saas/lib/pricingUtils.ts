export type PriceTier = {
  minGuests: number
  maxGuests: number
  pricePerPerson: number
  tastingLunchPricePerPerson: number
  registrationPrice: number
}

/**
 * Per-person rate for a guest doing tasting + lunch.
 *
 * `tastingLunchPricePerPerson` is the lunch add-on only — a combo guest is
 * charged the tasting rate plus this add-on, not the add-on alone.
 */
export function comboRatePerPerson<T extends PriceTier>(tier: T): number {
  return tier.pricePerPerson + tier.tastingLunchPricePerPerson
}

/**
 * Find the price tier for a given paying guest count.
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
  // Fallback: highest pricePerPerson tier
  return prices.reduce((best, p) =>
    p.pricePerPerson > best.pricePerPerson ? p : best
  )
}

// ─── The one place a booking is priced (2026-09-19) ──────────────────────────
//
// Nine sites used to re-derive this by hand — five servers, three previews and
// the seed — and four of them had drifted (bugs #48, #50, #51, #52). They never
// actually disagreed about the arithmetic; they disagreed about *where the rates
// come from*. So that is the split below: one `priceBooking` that does the sum,
// and small resolvers that answer "what are the rates for this order".
//
// See vault/MaintenanceNotes.md §22.

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

export type VisitType = 'TASTING' | 'TASTING_LUNCH'

/**
 * The rates for a party, from its company's price ladder.
 *
 * **The tier is chosen by party size, not by how many of them are paying.**
 * Changed 2026-09-19 on Max's call: a price ladder answers "how big is this
 * booking", which is a fact about the party, not about who happens to be eating.
 * It used to use `tastingGuests + lunchGuests`, so a party of 8 with a guide and
 * a driver was priced as a party of 6 — and re-splitting the same party between
 * the two buckets silently moved it between bands.
 *
 * Keeping the lookup in here rather than at the call sites is the point: there
 * is now exactly one line in the codebase that decides which tier applies.
 */
export function ratesForParty<T extends PriceTier>(
  prices: T[],
  guestCount: number,
  opts: { chargeRegistration?: boolean } = {},
): RateSet | null {
  const tier = findTier(prices, guestCount)
  if (!tier) return null
  return {
    tasting: tier.pricePerPerson,
    lunch: comboRatePerPerson(tier),
    registration: opts.chargeRegistration === false ? 0 : tier.registrationPrice,
  }
}

/** Rates a tier already in hand. Prefer {@link ratesForParty}, which picks the tier too. */
export function ratesFromTier<T extends PriceTier>(tier: T, opts: { chargeRegistration?: boolean } = {}): RateSet {
  return {
    tasting: tier.pricePerPerson,
    lunch: comboRatePerPerson(tier),
    registration: opts.chargeRegistration === false ? 0 : tier.registrationPrice,
  }
}

/**
 * The rates this order was sold at, read back off the row.
 *
 * Null when the order predates the snapshot columns — the caller must then
 * decide, loudly, what to do. It must never quietly substitute live rates.
 */
export function ratesFromSnapshot(o: {
  tastingRateSnapshot: number | null
  lunchRateSnapshot: number | null
  registrationFeeSnapshot: number | null
}): RateSet | null {
  if (o.tastingRateSnapshot == null && o.lunchRateSnapshot == null) return null
  return {
    tasting: o.tastingRateSnapshot ?? 0,
    lunch: o.lunchRateSnapshot ?? 0,
    registration: o.registrationFeeSnapshot ?? 0,
  }
}

/** Hand-typed rates, for a walk-in or a company with no ladder. No registration fee. */
export function ratesFromManual(tasting: number, lunch: number): RateSet {
  return { tasting, lunch, registration: 0 }
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
  const paying = guests.tastingGuests + guests.lunchGuests
  const base = paying > 0
    ? guests.tastingGuests * rates.tasting + guests.lunchGuests * rates.lunch
    : guests.guestCount * (visitType === 'TASTING_LUNCH' ? rates.lunch : rates.tasting)
  return base + rates.registration + lines.masterclass + lines.extras
}
