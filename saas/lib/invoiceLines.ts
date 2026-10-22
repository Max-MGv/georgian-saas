/**
 * What an invoice says about the booking itself (Plan-PricingModel Chunk 9) — shared by the printed invoice
 * (InvoicePrint.tsx) and the invoice email (invoiceEmailTemplate.ts), so the two never describe one order
 * differently.
 *
 * The three products each get their own line ("4 × 92₾") when the order's frozen rates explain its booking
 * amount exactly. When they do not — an old order without rates, an unpriced one, or a total someone changed
 * by hand — the invoice falls back to one line with the whole booking amount, as invoices always did: it never
 * prints a split that does not add up to what is billed.
 */
import type { BookingVisitType, Product } from '@/lib/pricingUtils'

export type InvoiceLocale = 'en' | 'ka'

export type InvoiceOrderInput = {
  visitType: string
  guestCount: number
  tastingOnlyGuests: number
  lunchOnlyGuests: number
  tastingLunchGuests: number
  freeGuestCount: number
  /** Frozen per-person rates, tetri (null = none). */
  tastingOnlyRate: number | null
  lunchOnlyRate: number | null
  tastingLunchRate: number | null
  registrationFeeSnapshot: number | null
  totalPrice: number
  masterclassAmt: number
  extrasAmt: number
}

export type InvoiceProductLine = { product: Product; count: number; rate: number; amount: number }

export type InvoiceView = {
  /** Products with guests, in the order the kitchen thinks of them. */
  guests: { product: Product; count: number }[]
  free: number
  totalGuests: number
  /** The booking amount: total minus masterclasses and extras. */
  bookingAmt: number
  /** Per-product lines when the rates explain bookingAmt exactly; null → print one booking line instead. */
  lines: InvoiceProductLine[] | null
  /** Registration fee inside bookingAmt (only when `lines` is set). */
  registration: number
  /** The product a single booking line is labelled with — the visit type's own product. */
  visitProduct: Product
}

export const INVOICE_PRODUCT_LABEL: Record<InvoiceLocale, Record<Product, string>> = {
  ka: { tastingOnly: 'დეგუსტაცია', lunchOnly: 'მხოლოდ სადილი', tastingLunch: 'სადილი + დეგუსტაცია' },
  en: { tastingOnly: 'Tasting only', lunchOnly: 'Lunch only', tastingLunch: 'Tasting & Lunch' },
}
export const INVOICE_REGISTRATION_LABEL: Record<InvoiceLocale, string> = { ka: 'რეგისტრაციის საფასური', en: 'Registration fee' }

export function invoiceView(o: InvoiceOrderInput): InvoiceView {
  const counts: Record<Product, number> = { tastingOnly: o.tastingOnlyGuests, lunchOnly: o.lunchOnlyGuests, tastingLunch: o.tastingLunchGuests }
  const rates: Record<Product, number | null> = { tastingOnly: o.tastingOnlyRate, lunchOnly: o.lunchOnlyRate, tastingLunch: o.tastingLunchRate }
  const order: Product[] = ['tastingLunch', 'lunchOnly', 'tastingOnly']
  const guests = order.filter(p => counts[p] > 0).map(p => ({ product: p, count: counts[p] }))
  const bookingAmt = o.totalPrice - o.masterclassAmt - o.extrasAmt
  const registration = o.registrationFeeSnapshot ?? 0
  const visit = o.visitType as BookingVisitType
  const visitProduct: Product = visit === 'TASTING' ? 'tastingOnly' : visit === 'LUNCH' ? 'lunchOnly' : 'tastingLunch'

  const priced = guests.length > 0 && guests.every(g => rates[g.product] != null)
  const lines = priced ? guests.map(g => ({ product: g.product, count: g.count, rate: rates[g.product]!, amount: g.count * rates[g.product]! })) : null
  const explains = lines != null && lines.reduce((s, l) => s + l.amount, 0) + registration === bookingAmt
  return {
    guests, free: o.freeGuestCount, totalGuests: o.guestCount, bookingAmt,
    lines: explains ? lines : null, registration: explains ? registration : 0, visitProduct,
  }
}

/**
 * "2 Tasting only · 1 Lunch only · 2 Tasting & Lunch · 1 free" for the booking emails — or null when the
 * booking is a single product with no free guests, where the total guest count already says everything.
 */
export function guestSplitText(c: { tastingOnly: number; lunchOnly: number; tastingLunch: number; free: number }, locale: InvoiceLocale): string | null {
  const P = INVOICE_PRODUCT_LABEL[locale]
  const parts = (['tastingOnly', 'lunchOnly', 'tastingLunch'] as Product[]).filter(p => c[p] > 0).map(p => `${c[p]} ${P[p]}`)
  if (c.free > 0) parts.push(`${c.free} ${locale === 'ka' ? 'უფასო' : 'free'}`)
  return parts.length > 1 ? parts.join(' · ') : null
}
