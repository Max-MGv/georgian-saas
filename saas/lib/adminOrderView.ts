/**
 * What the two admin booking screens (New Order, the order page) show while an admin types — guest boxes,
 * the reason it cannot be saved yet, which rates must be typed, and the per-product price lines.
 *
 * Pure and shared, so both screens preview exactly what `createOrderAdmin` / `updateOrderEnhanced` will store:
 * the same `checkAdminOrder` and `adminQuote` run here and on the server (Plan-PricingModel Chunk 8, §35).
 */
import { checkAdminOrder, type AdminOrderProblem } from '@/lib/bookingInput'
import {
  adminQuote, findProductTier, priceCounts, PRODUCTS, productPrice, ratesForCounts,
  type AdminQuote, type BookingVisitType, type Counts, type ManualRates, type Product, type ProductTier,
} from '@/lib/pricingUtils'
import { fromMajor } from '@/lib/money'

export type BoxField = 'tastingOnly' | 'lunchOnly' | 'tastingLunch' | 'free'
export type BoxStrings = Record<BoxField, string>

const num = (s: string) => (/^\d+$/.test(s.trim()) ? parseInt(s, 10) : 0)

/** Which boxes a company visit type shows (D-9; Lunch only → only Lunch only, A-6). Free is always there. */
export function boxesFor(visitType: BookingVisitType): BoxField[] {
  if (visitType === 'TASTING') return ['tastingOnly', 'free']
  if (visitType === 'LUNCH') return ['lunchOnly', 'free']
  return ['tastingOnly', 'lunchOnly', 'tastingLunch', 'free']
}

/**
 * The boxes a screen shows: the visit type's boxes, plus any box that holds guests. A stored order whose boxes
 * contradict its visit type (possible for orders converted from the old model) then shows the contradiction and
 * gets the usual "move them or switch the visit type" message — instead of a hidden box being counted as 0 and a
 * Save silently dropping those guests (blind review, Chunk 11).
 */
export function visibleBoxes(visitType: BookingVisitType, boxes: BoxStrings): BoxField[] {
  const own = boxesFor(visitType)
  return (['tastingOnly', 'lunchOnly', 'tastingLunch', 'free'] as BoxField[]).filter(f => own.includes(f) || num(boxes[f]) > 0)
}

/** adminT keys for the product names. */
export const PRODUCT_AT: Record<Product, string> = {
  tastingOnly: 'orderDetail.product.tastingOnly', lunchOnly: 'orderDetail.product.lunchOnly', tastingLunch: 'orderDetail.product.tastingLunch',
}

/** GEL typed in a rate box → tetri, or null when empty / zero. */
export const typedTetri = (s: string): number | null => { const v = parseFloat(s); return Number.isFinite(v) && v > 0 ? fromMajor(v) : null }
export const manualFromStrings = (m: Record<Product, string>): ManualRates =>
  ({ tastingOnly: typedTetri(m.tastingOnly), lunchOnly: typedTetri(m.lunchOnly), tastingLunch: typedTetri(m.tastingLunch) })

/** No typed rates — what an individual order is always priced with (D-14). */
export const NO_TYPED_RATES: ManualRates = { tastingOnly: null, lunchOnly: null, tastingLunch: null }
const NO_TYPED_STRINGS: Record<Product, string> = { tastingOnly: '', lunchOnly: '', tastingLunch: '' }

export type PriceLine = { product: Product; count: number; rate: number; amount: number; row: { min: number; max: number } | null }

export type AdminOrderView = {
  /** Null while the boxes cannot be read (the problem says why). */
  counts: Counts | null
  /** First reason this cannot be saved, or null. */
  problem: AdminOrderProblem | null
  quote: AdminQuote | null
  /** Products with guests that need a typed rate (no table, or the table does not price them) — show these inputs. */
  rateInputs: Product[]
  lines: PriceLine[]
  /** Registration fee in the quote (0 for typed rates / no table). */
  registration: number
  /** Null = cannot be computed yet (a problem, or nothing to price with). */
  total: number | null
  lunchGuests: number
  /** Products with guests and no rate from either source — name them in the missingRate message. */
  missing: Product[]
}

export function adminOrderView(input: {
  bookingType: 'INDIVIDUAL' | 'COMPANY'
  visitType: BookingVisitType
  /** Individuals' one guest count. */
  guests: string
  boxes: BoxStrings
  /** The company's price table — for an individual order, the tenant's Individuals table (D-14). */
  prices: ProductTier[]
  /** The company's registration fee; ignored for an individual order (never charged, as on the public form). */
  registration: number
  /** Typed rates; ignored for an individual order (D-14). */
  manual: Record<Product, string>
  masterclassAmt: number
  extrasAmt: number
  /** The order already carries frozen rates (order page) — clearing every typed rate is then refused, not "price later". */
  hadRates?: boolean
}): AdminOrderView {
  const company = input.bookingType === 'COMPANY'
  // D-14 (Max, 2026-10-22): an individual order is priced from the Individuals table by its guest count, like a
  // company — no typed rates, no "price later". To charge more, the admin adds an extra.
  if (!company) input = { ...input, registration: 0, manual: NO_TYPED_STRINGS, hadRates: false }
  const shown = company ? visibleBoxes(input.visitType, input.boxes) : []
  const box = (f: BoxField) => (shown.includes(f) ? num(input.boxes[f]) : 0)
  // Dishes are not part of this check: both screens switch the dish selects off and send no dish while there is
  // no lunch guest, so the admin never has a dish to fix. The server still refuses one (A-11) — a crafted request.
  const checked = checkAdminOrder({
    bookingType: input.bookingType, visitType: input.visitType,
    guestCount: num(input.guests),
    boxes: { tastingOnly: box('tastingOnly'), lunchOnly: box('lunchOnly'), tastingLunch: box('tastingLunch'), free: box('free') },
  })
  const empty: AdminOrderView = { counts: null, problem: null, quote: null, rateInputs: [], lines: [], registration: 0, total: null, lunchGuests: 0, missing: [] }
  if (!checked.ok) return { ...empty, problem: checked.problem }
  const counts: Counts = checked.counts

  const lunchGuests = counts.lunchOnly + counts.tastingLunch
  if (!company && input.prices.length === 0) {
    return { ...empty, counts, lunchGuests, problem: { key: 'orderForm.err.noIndividualsTable' } }
  }
  const table = input.prices.length > 0 ? ratesForCounts(input.prices, counts, input.registration) : null
  const rateInputs = company ? PRODUCTS.filter(p => counts[p] > 0 && (table == null || table[p] == null)) : []
  const quote = adminQuote(input.prices, input.registration, counts, manualFromStrings(input.manual))
  const lines: PriceLine[] = quote.kind === 'priced'
    ? PRODUCTS.filter(p => counts[p] > 0).map(p => {
        const rate = quote.rates[p]!
        const tier = quote.typed.includes(p) ? undefined : findProductTier(input.prices, p, counts[p])
        return { product: p, count: counts[p], rate, amount: rate * counts[p], row: tier && productPrice(tier, p) === rate ? { min: tier.minGuests, max: tier.maxGuests } : null }
      })
    : []
  const lineTotals = { masterclass: input.masterclassAmt, extras: input.extrasAmt }
  const total = quote.kind === 'priced' ? priceCounts(quote.rates, counts, lineTotals)
    : quote.kind === 'unpriced' ? input.masterclassAmt + input.extrasAmt
    : null
  // updateOrderEnhanced's rule: an order that already has a price never drops back to "price later" (review 8a).
  const unpricedButWasPriced = quote.kind === 'unpriced' && input.hadRates === true
  const missing = quote.kind === 'missing' ? quote.products : unpricedButWasPriced ? PRODUCTS.filter(p => counts[p] > 0) : []
  const problem: AdminOrderProblem | null = missing.length === 0 ? null
    : { key: company ? 'orderForm.err.missingRate' : 'orderForm.err.individualsMissing' }
  return {
    counts, problem, quote, rateInputs, lines, registration: quote.kind === 'priced' ? quote.rates.registration : 0,
    total: unpricedButWasPriced ? null : total, lunchGuests, missing,
  }
}
