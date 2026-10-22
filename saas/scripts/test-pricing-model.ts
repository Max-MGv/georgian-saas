/**
 * The product pricing model (Plan-PricingModel, T-152) — worked examples, the #93 input checks, and an
 * equivalence check over every real order.
 *
 * Written before any caller uses the new functions (Chunk 1), so the rules are pinned by numbers first.
 * Prices are tetri (100 = ₾1). The Georgica ladder is Nikalas Marani's real production ladder as it
 * converts (A-1): Tasting & Lunch = old tasting + old add-on.
 *
 * Equivalence: `scripts/_qa/pricing-baseline-{dev,prod}.json` (untracked, written by
 * `scripts/_qa/pricing-baseline.ts`) hold every order's old-model inputs and stored total. Each is
 * converted with `countsFromLegacy` and re-priced from its frozen rates — the result must equal the
 * stored total, which proves the conversion keeps the money (A-2). Skipped when the files are absent.
 *
 * Run: npx tsx scripts/test-pricing-model.ts
 */
import fs from 'fs'
import path from 'path'
import {
  adminQuote, countsFromLegacy, countsFromVisit, findProductTier, findTier, notOffered, priceCounts, ratesForCounts,
  ratesFromManualProducts, ratesFromProductSnapshot, totalGuests,
  type Counts, type ProductTier,
} from '../lib/pricingUtils'
import { guestSplitText, invoiceView } from '../lib/invoiceLines'
import { adminOrderView, visibleBoxes } from '../lib/adminOrderView'
import { checkAdminOrder, checkBookingCounts, checkMasterclassLines, countRulesFromSettings, hotDishWithoutLunch, type CountRules, type CountRuleKey } from '../lib/bookingInput'
import { getLeadHours, getVisitDurationMinutes, rulesVisitType } from '../lib/bookingHours'

let passed = 0, failed = 0
function check(label: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { passed++; return }
  failed++
  console.error(`  FAIL  ${label}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}
function throws(label: string, fn: () => unknown) {
  try { fn(); failed++; console.error(`  FAIL  ${label}: did not throw`) } catch { passed++ }
}

const NO_LINES = { masterclass: 0, extras: 0 }
const c = (tastingOnly: number, lunchOnly: number, tastingLunch: number, free = 0): Counts => ({ tastingOnly, lunchOnly, tastingLunch, free })

// Georgica Travel, production, as converted. Lunch only not offered (A-1).
const GEORGICA: ProductTier[] = [
  { minGuests: 1, maxGuests: 1, tastingOnlyPrice: 10000, lunchOnlyPrice: null, tastingLunchPrice: 25000 },
  { minGuests: 2, maxGuests: 2, tastingOnlyPrice: 7500, lunchOnlyPrice: null, tastingLunchPrice: 15000 },
  { minGuests: 3, maxGuests: 3, tastingOnlyPrice: 6000, lunchOnlyPrice: null, tastingLunchPrice: 12000 },
  { minGuests: 4, maxGuests: 24, tastingOnlyPrice: 5000, lunchOnlyPrice: null, tastingLunchPrice: 9500 },
  { minGuests: 25, maxGuests: 48, tastingOnlyPrice: 3000, lunchOnlyPrice: null, tastingLunchPrice: 7000 },
]
// The same ladder once a Lunch only price is entered.
const WITH_LUNCH: ProductTier[] = GEORGICA.map(t => ({
  ...t, lunchOnlyPrice: t.maxGuests <= 3 ? 5000 : t.maxGuests <= 24 ? 4000 : 3500,
}))

console.log('Pricing — worked examples')
{
  // P-11: Nikalas typed 9 tasting + 2 free + a ₾100 wine extra and was blocked. New model: ₾550, kitchen 11.
  const counts = c(9, 0, 0, 2)
  const r = ratesForCounts(GEORGICA, counts, 0)
  check('P-11 total', priceCounts(r, counts, { masterclass: 0, extras: 10000 }), 55000)
  check('P-11 kitchen count', totalGuests(counts), 11)

  // Nikalas's two real orders keep their money (A-2).
  const o2 = c(0, 0, 40, 2)
  check('2026-10-15 order (40 Tasting & Lunch)', priceCounts(ratesForCounts(GEORGICA, o2, 0), o2, NO_LINES), 280000)
  const o1 = c(5, 0, 0, 2)
  check('2026-10-07 order (5 Tasting only)', priceCounts(ratesForCounts(GEORGICA, o1, 0), o1, NO_LINES), 25000)

  // R-1 (accepted by Max): each product on its own row. 24 T&L on row 4–24 (₾95), 1 tasting on row 1 (₾100).
  const r1 = c(1, 0, 24)
  check('R-1: 24 Tasting & Lunch + 1 Tasting only', priceCounts(ratesForCounts(GEORGICA, r1, 0), r1, NO_LINES), 238000)
  // The old (party-size) model, retired in Chunk 10, priced the same party on the 25–48 row:
  // 24 × ₾70 + 1 × ₾30 = ₾1,710 (checked against priceBooking while it existed).

  // All three products, three different rows: 4 tasting (4–24 ₾50), 2 lunch only (row "2" ₾50), 30 T&L (25–48 ₾70).
  const mixed = c(4, 2, 30, 1)
  const rm = ratesForCounts(WITH_LUNCH, mixed, 0)
  check('mixed: rates per product', [rm.tastingOnly, rm.lunchOnly, rm.tastingLunch], [5000, 5000, 7000])
  check('mixed: total', priceCounts(rm, mixed, NO_LINES), 4 * 5000 + 2 * 5000 + 30 * 7000)
  check('mixed: free guests are never charged', priceCounts(rm, mixed, NO_LINES), priceCounts(rm, { ...mixed, free: 9 }, NO_LINES))

  // Registration is charged once, masterclass and extras added on top.
  const reg = c(4, 0, 0)
  check('registration once + lines', priceCounts(ratesForCounts(GEORGICA, reg, 3000), reg, { masterclass: 7000, extras: 1500 }), 4 * 5000 + 3000 + 7000 + 1500)

  // Not offered (D-7): lunch-only guests on a ladder with no lunch-only price.
  const lo = c(0, 2, 0)
  const rlo = ratesForCounts(GEORGICA, lo, 0)
  check('not offered → listed', notOffered(rlo, lo), ['lunchOnly'])
  throws('not offered → priceCounts refuses rather than charging ₾0', () => priceCounts(rlo, lo, NO_LINES))

  // Fallback (A-7): no row covers 60 → the highest-priced row that offers the product. 0 guests → no row.
  check('fallback: 60 tasting guests → highest tasting price', findProductTier(GEORGICA, 'tastingOnly', 60)?.tastingOnlyPrice, 10000)
  check('fallback: 0 guests → no row', findProductTier(GEORGICA, 'tastingOnly', 0), undefined)
  // A row that does not offer lunch only is skipped even when its range matches.
  const gap: ProductTier[] = [
    { minGuests: 1, maxGuests: 10, tastingOnlyPrice: 5000, lunchOnlyPrice: null, tastingLunchPrice: 9000 },
    { minGuests: 11, maxGuests: 30, tastingOnlyPrice: 4000, lunchOnlyPrice: 3000, tastingLunchPrice: 8000 },
  ]
  check('row without lunch only is skipped → fallback to a row that offers it', findProductTier(gap, 'lunchOnly', 5)?.lunchOnlyPrice, 3000)

  // Manual rates (A-9) and snapshot read-back.
  const man = ratesFromManualProducts(6000, null, 11000)
  check('manual rates price like a ladder', priceCounts(man, c(2, 0, 3), NO_LINES), 2 * 6000 + 3 * 11000)
  check('snapshot: nothing frozen → null', ratesFromProductSnapshot({ tastingOnlyRate: null, lunchOnlyRate: null, tastingLunchRate: null, registrationFeeSnapshot: 0 }), null)
  check('snapshot: read back', ratesFromProductSnapshot({ tastingOnlyRate: 5000, lunchOnlyRate: null, tastingLunchRate: 9500, registrationFeeSnapshot: null }), { tastingOnly: 5000, lunchOnly: null, tastingLunch: 9500, registration: 0 })
}

console.log('Pricing — individuals and the company simple form are unchanged (one product, one count)')
{
  // Nikalas's real Individuals ladder (production), converted: tasting / tasting + old add-on.
  const NEW_IND: ProductTier[] = [
    { minGuests: 1, maxGuests: 1, tastingOnlyPrice: 15000, lunchOnlyPrice: null, tastingLunchPrice: 30000 },
    { minGuests: 2, maxGuests: 2, tastingOnlyPrice: 12000, lunchOnlyPrice: null, tastingLunchPrice: 20000 },
    { minGuests: 3, maxGuests: 3, tastingOnlyPrice: 7000, lunchOnlyPrice: null, tastingLunchPrice: 14000 },
    { minGuests: 4, maxGuests: 100, tastingOnlyPrice: 5000, lunchOnlyPrice: null, tastingLunchPrice: 11000 },
  ]
  let diffs = 0
  for (const visit of ['TASTING', 'TASTING_LUNCH'] as const) {
    for (let n = 1; n <= 120; n++) {
      // The retired party-size rule for one visit type: the row for n guests, everyone on that visit's price.
      const row = findTier(NEW_IND, n)!
      const oldTotal = n * ((visit === 'TASTING_LUNCH' ? row.tastingLunchPrice : row.tastingOnlyPrice) ?? 0)
      const counts = countsFromVisit(visit, n)
      const newTotal = priceCounts(ratesForCounts(NEW_IND, counts, 0), counts, NO_LINES)
      if (oldTotal !== newTotal) { diffs++; if (diffs < 4) console.error(`  ${visit} × ${n}: old ${oldTotal} new ${newTotal}`) }
    }
  }
  check('individuals: 240 cases (1–120 guests × 2 visit types) identical, incl. beyond the top row', diffs, 0)
}

console.log('Input checks (#93)')
{
  const none: CountRules = { groupMin: null, productMins: { tastingOnly: null, lunchOnly: null, tastingLunch: null } }
  const pub = (over: Record<string, unknown>, rules = none) =>
    checkBookingCounts({ bookingType: 'COMPANY', layout: 'boxes', form: 'public', visitType: 'TASTING_LUNCH', ...over } as never, rules)
  const err = (r: ReturnType<typeof checkBookingCounts>) => (r.ok ? 'ok' : r.error.code)

  check('the #93 attack: tasting −5, lunch 20', err(pub({ tastingOnly: -5, tastingLunch: 20 })), 'not_whole_number')
  check('fraction', err(pub({ tastingLunch: 2.5 })), 'not_whole_number')
  check('string "4"', err(pub({ tastingLunch: '4' })), 'not_whole_number')
  check('1000 guests', err(pub({ tastingLunch: 1000 })), 'not_whole_number')
  check('negative free', err(pub({ tastingLunch: 4, free: -1 })), 'not_whole_number')
  check('NaN', err(pub({ tastingLunch: NaN })), 'not_whole_number')
  check('only free guests', err(pub({ free: 5 })), 'no_paying_guests')
  check('valid boxes', pub({ tastingOnly: 4, lunchOnly: 2, tastingLunch: 6, free: 2 }), { ok: true, counts: c(4, 2, 6, 2), visitType: 'TASTING_LUNCH', warnings: [] })

  // Individuals: one count; forged boxes are ignored (the ₾60-for-10-guests attack).
  const ind = checkBookingCounts({ bookingType: 'INDIVIDUAL', layout: 'single', form: 'public', visitType: 'TASTING', guestCount: 10, tastingOnly: 1 }, none)
  check('individual: forged split ignored, all 10 on tasting', ind.ok && ind.counts, c(10, 0, 0))
  check('individual: negative guest count', err(checkBookingCounts({ bookingType: 'INDIVIDUAL', layout: 'single', form: 'public', visitType: 'TASTING', guestCount: -3 }, none)), 'not_whole_number')
  check('individual: Lunch only is not a thing (D-5)', err(checkBookingCounts({ bookingType: 'INDIVIDUAL', layout: 'single', form: 'public', visitType: 'LUNCH', guestCount: 4 }, none)), 'bad_visit_type')
  check('unknown visit type', err(pub({ visitType: 'BRUNCH', tastingOnly: 4 })), 'bad_visit_type')
  const simpleLunch = checkBookingCounts({ bookingType: 'COMPANY', layout: 'single', form: 'public', visitType: 'LUNCH', guestCount: 8 }, none)
  check('company simple form: Lunch only (D-10)', simpleLunch.ok && simpleLunch.counts, c(0, 8, 0))

  // Visit type vs boxes (A-6; Q-3 answered by Max 2026-10-21: refused everywhere, public and admin).
  check('Tasting visit with lunch guests → refused', err(pub({ visitType: 'TASTING', tastingOnly: 4, tastingLunch: 2 })), 'visit_mismatch')
  check('Tasting + Lunch visit with no lunch guest → refused (F-2 shape)', err(pub({ tastingOnly: 5, free: 2 })), 'visit_mismatch')
  const adm = checkBookingCounts({ bookingType: 'COMPANY', layout: 'boxes', form: 'admin', visitType: 'TASTING_LUNCH', tastingOnly: 5, free: 2 }, none)
  check('…on an admin screen it is refused too (Q-3)', adm.ok ? 'ok' : adm.error.code, 'visit_mismatch')
  check('Lunch only visit with tasting guests → refused', err(pub({ visitType: 'LUNCH', lunchOnly: 4, tastingLunch: 2 })), 'visit_mismatch')
  check('Lunch only visit, only Lunch only guests → ok', err(pub({ visitType: 'LUNCH', lunchOnly: 6, free: 1 })), 'ok')

  // Minimums, option C (D-11).
  const withGroup: CountRules = { ...none, groupMin: 4 }
  check('group minimum: 2 + 3 = 5 paying ≥ 4 → ok (as today)', err(pub({ tastingOnly: 2, tastingLunch: 3 }, withGroup)), 'ok')
  check('group minimum: 3 paying + 4 free → refused (free never counts)', err(pub({ tastingLunch: 3, free: 4 }, withGroup)), 'below_group_min')
  const withProduct: CountRules = { groupMin: 4, productMins: { tastingOnly: null, lunchOnly: 4, tastingLunch: null } }
  check('product minimum: 2 lunch only < 4 → refused', err(pub({ lunchOnly: 2, tastingLunch: 10 }, withProduct)), 'below_product_min')
  check('product minimum: 0 lunch only is always fine', err(pub({ tastingLunch: 10 }, withProduct)), 'ok')
  check('admin screens are exempt from minimums (A-8)', err(checkBookingCounts({ bookingType: 'COMPANY', layout: 'boxes', form: 'admin', visitType: 'TASTING_LUNCH', lunchOnly: 1 }, withProduct)), 'ok')
  check('individuals: product minimums never apply', err(checkBookingCounts({ bookingType: 'INDIVIDUAL', layout: 'single', form: 'public', visitType: 'TASTING_LUNCH', guestCount: 4 }, { groupMin: 4, productMins: { tastingOnly: 9, lunchOnly: 9, tastingLunch: 9 } })), 'ok')

  // Masterclass lines.
  const cat = [
    { id: 'pp', unitType: 'PER_PERSON' as const, active: true, pricePerUnit: 3500 },
    { id: 'flat', unitType: 'FLAT' as const, active: true, pricePerUnit: 6000 },
    { id: 'old', unitType: 'PER_PIECE' as const, active: false, pricePerUnit: 1000 },
  ]
  const mErr = (lines: unknown) => { const r = checkMasterclassLines(lines, cat); return r.ok ? 'ok' : r.error.code }
  check('masterclass: the #93 attack, quantity −20', mErr([{ masterclassItemId: 'pp', quantity: -20 }]), 'bad_quantity')
  check('masterclass: quantity 0', mErr([{ masterclassItemId: 'pp', quantity: 0 }]), 'bad_quantity')
  check('masterclass: quantity 2.5', mErr([{ masterclassItemId: 'pp', quantity: 2.5 }]), 'bad_quantity')
  check('masterclass: quantity "3"', mErr([{ masterclassItemId: 'pp', quantity: '3' }]), 'bad_quantity')
  check('masterclass: quantity 1000', mErr([{ masterclassItemId: 'pp', quantity: 1000 }]), 'bad_quantity')
  check('masterclass: inactive item', mErr([{ masterclassItemId: 'old', quantity: 1 }]), 'inactive_item')
  check("masterclass: another tenant's / unknown item", mErr([{ masterclassItemId: 'nope', quantity: 1 }]), 'unknown_item')
  check('masterclass: same item twice', mErr([{ masterclassItemId: 'pp', quantity: 1 }, { masterclassItemId: 'pp', quantity: 2 }]), 'duplicate_item')
  check('masterclass: not a list', mErr({ masterclassItemId: 'pp' }), 'not_a_list')
  const okLines = checkMasterclassLines([{ masterclassItemId: 'pp', quantity: 8, pricePerUnit: 0 }, { masterclassItemId: 'flat', quantity: 5 }], cat)
  check('masterclass: price from the catalogue, FLAT forced to 1', okLines.ok && okLines.lines, [
    { masterclassItemId: 'pp', quantity: 8, pricePerUnit: 3500 },
    { masterclassItemId: 'flat', quantity: 1, pricePerUnit: 6000 },
  ])
  check('masterclass: none sent', mErr(undefined), 'ok')
}

console.log('Equivalence — every real order keeps its money after conversion (A-2)')
for (const which of ['dev', 'prod']) {
  const file = path.resolve(__dirname, `_qa/pricing-baseline-${which}.json`)
  if (!fs.existsSync(file)) { console.log(`  (skipped ${which}: ${path.basename(file)} not present)`); continue }
  type BaselineOrder = {
    id: string; tenant: string; bookingType: string; visitType: string; guestCount: number; tasting: number; lunch: number; free: number
    tRate: number | null; lRate: number | null; reg: number | null; totalPrice: number; mc: number; extras: number
  }
  const { orders } = JSON.parse(fs.readFileSync(file, 'utf-8')) as { orders: BaselineOrder[] }
  let same = 0, skipped = 0
  const diffs: string[] = []
  for (const o of orders) {
    if (o.tRate == null && o.lRate == null) { skipped++; continue }
    const counts = countsFromLegacy({ visitType: o.visitType, guestCount: o.guestCount, tastingGuestCount: o.tasting, lunchGuestCount: o.lunch, freeGuestCount: o.free })
    const rates = { tastingOnly: o.tRate, lunchOnly: null, tastingLunch: o.lRate, registration: o.reg ?? 0 }
    let total: number | string
    try { total = priceCounts(rates, counts, { masterclass: o.mc, extras: o.extras }) } catch (e) { total = String(e) }
    if (total === o.totalPrice) same++
    else diffs.push(`${o.id} ${o.tenant} ${o.bookingType} ${o.visitType} stored ${o.totalPrice} new ${total}`)
    if (totalGuests(counts) !== o.guestCount && o.free === 0 && o.tasting + o.lunch === 0) diffs.push(`${o.id} guest total moved: ${o.guestCount} → ${totalGuests(counts)}`)
  }
  console.log(`  ${which}: ${same} identical, ${diffs.length} different, ${skipped} skipped (no frozen rates)`)
  for (const d of diffs.slice(0, 10)) console.error(`    ${d}`)
  check(`${which}: every order with frozen rates re-prices to its stored total`, diffs.length, 0)
}

console.log('Rules from settings (Chunk 6)')
{
  const settings = (m: Partial<Record<CountRuleKey, string>>) => (k: CountRuleKey) => m[k] ?? ''
  const base = { min_guests_tasting: '4', min_guests_tasting_lunch: '6', max_guests_tasting: '', max_guests_tasting_lunch: '40' }
  check('Lunch only follows Tasting + Lunch rules (A-5)', rulesVisitType('LUNCH'), 'TASTING_LUNCH')
  check('Tasting follows Tasting rules', rulesVisitType('TASTING'), 'TASTING')
  check('lead time: Lunch only = Tasting + Lunch hours', getLeadHours('LUNCH', true, 3, 2, 6), 6)
  check('lead time: no split = single value for every type', getLeadHours('LUNCH', false, 3, 2, 6), 3)
  check('visit length: Lunch only = Tasting + Lunch minutes', getVisitDurationMinutes('LUNCH', 90, 180), 180)
  const t = countRulesFromSettings(settings(base), 'TASTING', 'COMPANY')
  check('Tasting: group min/max from the Tasting keys; company minimums blank = none (day one unchanged)', t, { groupMin: 4, groupMax: null, productMins: { tastingOnly: null, lunchOnly: null, tastingLunch: null } })
  const l = countRulesFromSettings(settings(base), 'LUNCH', 'COMPANY')
  check('Lunch only: group min/max from the Tasting + Lunch keys', [l.groupMin, l.groupMax], [6, 40])
  check('blank group minimum falls back to 4, as createBooking always has', countRulesFromSettings(settings({}), 'TASTING_LUNCH', 'COMPANY').groupMin, 4)
  const mins = settings({ ...base, min_guests_company_tasting_only: '3', min_guests_company_lunch_only: ' 8 ', min_guests_company_tasting_lunch: 'abc' })
  check('company minimums: set / spaces trimmed / garbage = none', countRulesFromSettings(mins, 'TASTING_LUNCH', 'COMPANY').productMins, { tastingOnly: 3, lunchOnly: 8, tastingLunch: null })
  check('company minimum "0" means none', countRulesFromSettings(settings({ min_guests_company_lunch_only: '0' }), 'TASTING_LUNCH', 'COMPANY').productMins.lunchOnly, null)
  check('individuals never get company minimums', countRulesFromSettings(mins, 'TASTING_LUNCH', 'INDIVIDUAL').productMins, { tastingOnly: null, lunchOnly: null, tastingLunch: null })
  // Wired end to end: settings → rules → check.
  const r = countRulesFromSettings(mins, 'TASTING_LUNCH', 'COMPANY')
  const e = (x: ReturnType<typeof checkBookingCounts>) => (x.ok ? 'ok' : x.error.code)
  check('settings-wired: 5 Lunch only < company minimum 8 → refused', e(checkBookingCounts({ bookingType: 'COMPANY', layout: 'boxes', form: 'public', visitType: 'TASTING_LUNCH', lunchOnly: 5, tastingLunch: 10 }, r)), 'below_product_min')
  check('settings-wired: same booking on an admin screen → ok (A-8)', e(checkBookingCounts({ bookingType: 'COMPANY', layout: 'boxes', form: 'admin', visitType: 'TASTING_LUNCH', lunchOnly: 5, tastingLunch: 10 }, r)), 'ok')
  // A-11 (Max, 2026-10-21): a hot dish needs a lunch guest; food notes are not checked here.
  const c = (to: number, lo: number, tl: number) => ({ tastingOnly: to, lunchOnly: lo, tastingLunch: tl, free: 0 })
  check('hot dish, no lunch guest → refused', hotDishWithoutLunch(c(4, 0, 0), 'Pkhali', null), true)
  check('meat dish only, no lunch guest → refused', hotDishWithoutLunch(c(4, 0, 0), null, 'Mtsvadi'), true)
  check('hot dish with a Lunch only guest → ok', hotDishWithoutLunch(c(0, 1, 0), 'Pkhali', 'Mtsvadi'), false)
  check('hot dish with a Tasting & Lunch guest → ok', hotDishWithoutLunch(c(4, 0, 2), 'Pkhali', null), false)
  check('no dish chosen (blank / spaces / null) → ok', hotDishWithoutLunch(c(4, 0, 0), '  ', null), false)
}

// ── Chunk 8: admin New Order / order page — adminQuote + checkAdminOrder ──
{
  console.log('\nChunk 8 — admin screens')
  const tbl: ProductTier[] = [
    { minGuests: 1, maxGuests: 20, tastingOnlyPrice: 5000, lunchOnlyPrice: null, tastingLunchPrice: 9200 },
    { minGuests: 21, maxGuests: 100, tastingOnlyPrice: 4500, lunchOnlyPrice: null, tastingLunchPrice: 7800 },
  ]
  const none = { tastingOnly: null, lunchOnly: null, tastingLunch: null }
  const c = (to: number, lo: number, tl: number, free = 0): Counts => ({ tastingOnly: to, lunchOnly: lo, tastingLunch: tl, free })

  // P-11 (production T-11): 9 Tasting only + 2 free + a ₾100 wine extra on a company table → ₾550, kitchen 11.
  const p11 = checkAdminOrder({ bookingType: 'COMPANY', visitType: 'TASTING', boxes: { tastingOnly: 9, lunchOnly: 0, tastingLunch: 0, free: 2 } })
  check('P-11: 9 Tasting only + 2 free is accepted (no typed party size to contradict it)', p11.ok, true)
  const q11 = adminQuote(tbl, 0, c(9, 0, 0, 2), none)
  check('P-11: priced from the table', q11.kind, 'priced')
  if (q11.kind === 'priced') check('P-11: total ₾550 with the ₾100 extra', priceCounts(q11.rates, c(9, 0, 0, 2), { masterclass: 0, extras: 10000 }), 55000)
  check('P-11: kitchen count 11', totalGuests(c(9, 0, 0, 2)), 11)

  const lo = adminQuote(tbl, 0, c(0, 3, 5), none)
  check('table has no Lunch only price, nothing typed → missing', lo.kind === 'missing' ? lo.products : lo.kind, ['lunchOnly'])
  const loTyped = adminQuote(tbl, 0, c(0, 3, 5), { ...none, lunchOnly: 4000 })
  check('typed Lunch only fills the gap; T&L still from the table (E-3)', loTyped.kind === 'priced' ? [loTyped.rates.lunchOnly, loTyped.rates.tastingLunch, loTyped.typed] : loTyped.kind, [4000, 9200, ['lunchOnly']])
  check('a typed rate never overrides a table price', adminQuote(tbl, 0, c(4, 0, 0), { ...none, tastingOnly: 1 }).kind === 'priced' && (adminQuote(tbl, 0, c(4, 0, 0), { ...none, tastingOnly: 1 }) as { rates: { tastingOnly: number } }).rates.tastingOnly, 5000)
  check('no table, nothing typed → priced later', adminQuote([], 0, c(4, 0, 0), none).kind, 'unpriced')
  const ind = adminQuote([], 0, c(0, 0, 4), { ...none, tastingLunch: 7000 })
  check('no table, typed rate → priced, no registration fee (A-9)', ind.kind === 'priced' ? [ind.rates.tastingLunch, ind.rates.registration] : ind.kind, [7000, 0])
  check('no table, one product typed but another not → missing', (() => { const q = adminQuote([], 0, c(2, 0, 3), { ...none, tastingOnly: 5000 }); return q.kind === 'missing' ? q.products : q.kind })(), ['tastingLunch'])
  check('company fee charged with the table', (() => { const q = adminQuote(tbl, 3000, c(4, 0, 0), none); return q.kind === 'priced' ? q.rates.registration : q.kind })(), 3000)

  const e = (x: ReturnType<typeof checkAdminOrder>) => (x.ok ? 'ok' : x.problem.key)
  check('individual: one guest count, Tasting + Lunch', e(checkAdminOrder({ bookingType: 'INDIVIDUAL', visitType: 'TASTING_LUNCH', guestCount: 4 })), 'ok')
  check('individual: Lunch only refused (D-5)', e(checkAdminOrder({ bookingType: 'INDIVIDUAL', visitType: 'LUNCH', guestCount: 4 })), 'orderForm.err.visitType')
  check('individual: boxes sent are ignored (A-4)', (() => { const r = checkAdminOrder({ bookingType: 'INDIVIDUAL', visitType: 'TASTING', guestCount: 3, boxes: { tastingOnly: 99, free: 9 } }); return r.ok ? r.counts : r.problem.key })(), c(3, 0, 0, 0))
  check('company Tasting + Lunch with no lunch guest → Q-3 message', e(checkAdminOrder({ bookingType: 'COMPANY', visitType: 'TASTING_LUNCH', boxes: { tastingOnly: 4 } })), 'orderForm.err.mismatchTastingLunch')
  check('company Lunch only with a Tasting only guest → refused', e(checkAdminOrder({ bookingType: 'COMPANY', visitType: 'LUNCH', boxes: { tastingOnly: 1, lunchOnly: 4 } })), 'orderForm.err.mismatchLunch')
  check('company: only free guests → refused', e(checkAdminOrder({ bookingType: 'COMPANY', visitType: 'TASTING', boxes: { free: 3 } })), 'orderForm.err.noPaying')
  check('company: negative box → refused', e(checkAdminOrder({ bookingType: 'COMPANY', visitType: 'TASTING', boxes: { tastingOnly: -2 } })), 'orderForm.err.wholeNumbers')
  check('admin screens skip the minimums (A-8): 1 guest ok', e(checkAdminOrder({ bookingType: 'COMPANY', visitType: 'TASTING', boxes: { tastingOnly: 1 } })), 'ok')
  check('hot dish with no lunch guest → refused (A-11)', e(checkAdminOrder({ bookingType: 'COMPANY', visitType: 'TASTING', boxes: { tastingOnly: 4 }, hotDishVegetable: 'Pkhali' })), 'orderForm.err.hotDish')
  check('hot dish with a lunch guest → ok', e(checkAdminOrder({ bookingType: 'COMPANY', visitType: 'LUNCH', boxes: { lunchOnly: 4 }, hotDishMeat: 'Mtsvadi' })), 'ok')
}

// ── Chunk 9: invoice lines + guest split (printed invoice, invoice email, booking emails) ──
{
  console.log('\nChunk 9 — invoice lines')
  const base = { visitType: 'TASTING_LUNCH', guestCount: 8, tastingOnlyGuests: 0, lunchOnlyGuests: 3, tastingLunchGuests: 5, freeGuestCount: 0,
    tastingOnlyRate: null, lunchOnlyRate: 4500, tastingLunchRate: 9200, registrationFeeSnapshot: 0, totalPrice: 59500, masterclassAmt: 0, extrasAmt: 0 }
  const v = invoiceView(base)
  check('rates explain the total → one line per product', v.lines?.map(l => [l.product, l.count, l.amount]), [['tastingLunch', 5, 46000], ['lunchOnly', 3, 13500]])
  check('a hand-changed total → one booking line instead (never a split that does not add up)', invoiceView({ ...base, totalPrice: 60000 }).lines, null)
  check("no rates → one booking line on the visit's product", [invoiceView({ ...base, lunchOnlyRate: null }).lines, invoiceView({ ...base, lunchOnlyRate: null }).visitProduct], [null, 'tastingLunch'])
  check('masterclass and extras stay outside the booking amount', invoiceView({ ...base, totalPrice: 69500, masterclassAmt: 8000, extrasAmt: 2000 }).lines?.length, 2)
  check('registration fee counted in', invoiceView({ ...base, registrationFeeSnapshot: 3000, totalPrice: 62500 }).registration, 3000)
  check('guest split: mixed booking', guestSplitText({ tastingOnly: 1, lunchOnly: 0, tastingLunch: 2, free: 1 }, 'en'), '1 Tasting only · 2 Tasting & Lunch · 1 free')
  check('guest split: one product, no free → nothing extra to say', guestSplitText({ tastingOnly: 0, lunchOnly: 0, tastingLunch: 4, free: 0 }, 'en'), null)
}

// ── Chunk 11 blind-review fixes: hidden boxes are never zeroed unseen; a priced order cannot go "unpriced" ──
{
  console.log('\nChunk 11 — review fixes')
  const tbl: ProductTier[] = [{ minGuests: 1, maxGuests: 50, tastingOnlyPrice: 5000, lunchOnlyPrice: null, tastingLunchPrice: 9200 }]
  const stored = { tastingOnly: '6', lunchOnly: '0', tastingLunch: '4', free: '0' }
  check('a Tasting order with stored Tasting & Lunch guests shows that box too', visibleBoxes('TASTING', stored), ['tastingOnly', 'tastingLunch', 'free'])
  const v = adminOrderView({ bookingType: 'COMPANY', visitType: 'TASTING', guests: '0', boxes: stored, prices: tbl, registration: 0,
    manual: { tastingOnly: '', lunchOnly: '', tastingLunch: '' }, masterclassAmt: 0, extrasAmt: 0 })
  check('…and the contradiction is a problem to fix, not 4 guests dropped on Save', v.problem?.key, 'orderForm.err.mismatchTasting')
  const manual = { tastingOnly: '', lunchOnly: '', tastingLunch: '' }
  const ind = (hadRates: boolean) => adminOrderView({ bookingType: 'INDIVIDUAL', visitType: 'TASTING', guests: '4', boxes: { tastingOnly: '0', lunchOnly: '0', tastingLunch: '0', free: '0' },
    prices: [], registration: 0, manual, masterclassAmt: 0, extrasAmt: 0, hadRates })
  check('no rates typed on a new order → price later, no problem', [ind(false).quote?.kind, ind(false).problem], ['unpriced', null])
  check('rates cleared on an order that had a price → refused like the server (8a)', [ind(true).problem?.key, ind(true).missing, ind(true).total], ['orderForm.err.missingRate', ['tastingOnly'], null])
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
