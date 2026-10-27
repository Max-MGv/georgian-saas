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
  /** Wine for the table (T-22). Omitted = none. */
  wineAmt?: number
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
  ka: { tastingOnly: 'დეგუსტაცია', lunchOnly: 'სადილი', tastingLunch: 'დეგუსტაცია და სადილი' },
  en: { tastingOnly: 'Tasting', lunchOnly: 'Lunch', tastingLunch: 'Tasting & Lunch' },
}
export const INVOICE_REGISTRATION_LABEL: Record<InvoiceLocale, string> = { ka: 'რეგისტრაციის საფასური', en: 'Registration fee' }

// ─── Add-on lines (T-7): one section per group, on every invoice ──────────────────────────────────────────────
//
// An invoice shows each add-on under the group the winery filed it in ("Masterclass", "Food", …), named as it was when
// it was sold: the line's snapshot, never today's catalogue. The Georgian name is used on Georgian invoices when the
// winery gave one. Old stored invoices (InvoiceSent rows) carry only `name` — they read as one untitled group.

export type InvoiceAddOnLine = {
  name: string
  nameKa?: string | null
  groupName?: string | null
  groupNameKa?: string | null
  quantity: number
  pricePerUnit: number
}

const pick = (en: string, ka: string | null | undefined, locale: InvoiceLocale) => (locale === 'ka' && ka && ka.trim() ? ka : en)

// ─── Wine for the table (T-22) on an invoice ──────────────────────────────────────────────────────────────
// One line per wine: "Saperavi 2021 × 2" with what it cost, and WHY it cost that when it was not the website price —
// "agreed 40.00" (the company's own price) or "38.00 −10%" (the company's % off) — so the invoice explains itself (D-16).

export type InvoiceWineLine = {
  name: string
  year: number
  quantity: number
  /** Per bottle before the % — the agreed price when `negotiated`. */
  unitPrice: number
  negotiated: boolean
  discountPercent: number | null
  /** What this line cost, rounded on its own. */
  lineTotal: number
}

const WINE_AGREED: Record<InvoiceLocale, string> = { ka: 'შეთანხმებული', en: 'agreed' }
const fixed2 = (tetri: number) => (tetri / 100).toFixed(2)

/** "Saperavi 2021 × 2" plus the reason in brackets when the price was not the standard one. */
export function wineLineLabel(l: InvoiceWineLine, locale: InvoiceLocale): string {
  const base = `${l.name} ${l.year} × ${l.quantity}`
  if (l.negotiated) return `${base} (${WINE_AGREED[locale]} ${fixed2(l.unitPrice)})`
  if (l.discountPercent) return `${base} (${fixed2(l.unitPrice)} −${l.discountPercent}%)`
  return base
}

/** "Khinkali folding class × 12" — or just the name for a single one. */
export function addOnLabel(l: InvoiceAddOnLine, locale: InvoiceLocale, withQty = true): string {
  const name = pick(l.name, l.nameKa, locale)
  return withQty ? `${name} × ${l.quantity}` : name
}

/**
 * The lines under their group's name, groups in the order they first appear. A line with no group (an old invoice, or
 * an item whose group was removed before the snapshot existed) goes under `fallbackTitle`.
 */
export function groupInvoiceAddOns<T extends InvoiceAddOnLine>(lines: readonly T[], locale: InvoiceLocale, fallbackTitle: string): { title: string; lines: T[] }[] {
  const titles: string[] = []
  const byTitle = new Map<string, T[]>()
  for (const l of lines) {
    const title = l.groupName ? pick(l.groupName, l.groupNameKa, locale) : fallbackTitle
    if (!byTitle.has(title)) { byTitle.set(title, []); titles.push(title) }
    byTitle.get(title)!.push(l)
  }
  return titles.map(title => ({ title, lines: byTitle.get(title)! }))
}

export function invoiceView(o: InvoiceOrderInput): InvoiceView {
  const counts: Record<Product, number> = { tastingOnly: o.tastingOnlyGuests, lunchOnly: o.lunchOnlyGuests, tastingLunch: o.tastingLunchGuests }
  const rates: Record<Product, number | null> = { tastingOnly: o.tastingOnlyRate, lunchOnly: o.lunchOnlyRate, tastingLunch: o.tastingLunchRate }
  const order: Product[] = ['tastingLunch', 'lunchOnly', 'tastingOnly']
  const guests = order.filter(p => counts[p] > 0).map(p => ({ product: p, count: counts[p] }))
  const bookingAmt = o.totalPrice - o.masterclassAmt - (o.wineAmt ?? 0) - o.extrasAmt
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
