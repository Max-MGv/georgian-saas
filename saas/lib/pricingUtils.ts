export type PriceTier = {
  minGuests: number
  maxGuests: number
  pricePerPerson: number
  tastingLunchPricePerPerson: number
  registrationPrice: number
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
