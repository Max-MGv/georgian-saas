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
import { addOnLabel, groupInvoiceAddOns, guestSplitText, invoiceView } from '../lib/invoiceLines'
import { adminOrderView, visibleBoxes } from '../lib/adminOrderView'
import { checkAdminOrder, checkBookingCounts, checkMasterclassLines, countRulesFromSettings, hotDishWithoutLunch, type CountRules, type CountRuleKey } from '../lib/bookingInput'
import { getLeadHours, getVisitDurationMinutes, rulesVisitType } from '../lib/bookingHours'
import { groupShownOn, localName, normalizeVisitTypes, visitTypesTicked } from '../lib/addOns'
import { withSyncedQuantities } from '../lib/addOnLines'
import { lineTotals } from '../lib/orderLines'

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

  // Above the last row → the last row (Max 2026-10-23: 101 guests on a 100-max table takes the 100-row price).
  // A gap between rows keeps A-7: the highest-priced row that offers the product. 0 guests → no row.
  check('above the last row: 60 tasting guests → the last row', findProductTier(GEORGICA, 'tastingOnly', 60)?.tastingOnlyPrice, 3000)
  const GAPPY: ProductTier[] = [
    { minGuests: 1, maxGuests: 5, tastingOnlyPrice: 10000, lunchOnlyPrice: null, tastingLunchPrice: 15000 },
    { minGuests: 10, maxGuests: 20, tastingOnlyPrice: 8000, lunchOnlyPrice: null, tastingLunchPrice: 12000 },
  ]
  check('gap between rows (7 guests, rows 1–5 and 10–20) → the highest price (A-7)', findProductTier(GAPPY, 'tastingOnly', 7)?.tastingOnlyPrice, 10000)
  check('above the last row (25 guests) → the last row, not the highest price', findProductTier(GAPPY, 'tastingOnly', 25)?.tastingOnlyPrice, 8000)
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
    for (let n = 1; n <= 100; n++) {
      // The retired party-size rule for one visit type: the row for n guests, everyone on that visit's price.
      const row = findTier(NEW_IND, n)!
      const oldTotal = n * ((visit === 'TASTING_LUNCH' ? row.tastingLunchPrice : row.tastingOnlyPrice) ?? 0)
      const counts = countsFromVisit(visit, n)
      const newTotal = priceCounts(ratesForCounts(NEW_IND, counts, 0), counts, NO_LINES)
      if (oldTotal !== newTotal) { diffs++; if (diffs < 4) console.error(`  ${visit} × ${n}: old ${oldTotal} new ${newTotal}`) }
    }
  }
  check('individuals: 200 cases (1–100 guests × 2 visit types) identical to the old party-size rule', diffs, 0)
  // Above the top row the rule changed on purpose (Max 2026-10-23): 101–120 guests use the 4–100 row, not the 1–2 row.
  check('individuals: 101 guests, Tasting → the last row (₾50), not the highest price', ratesForCounts(NEW_IND, countsFromVisit('TASTING', 101), 0).tastingOnly, 5000)
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
  check('masterclass: price from the catalogue, FLAT forced to 1', okLines.ok && okLines.lines.map(l => ({ masterclassItemId: l.masterclassItemId, quantity: l.quantity, pricePerUnit: l.pricePerUnit })), [
    { masterclassItemId: 'pp', quantity: 8, pricePerUnit: 3500 },
    { masterclassItemId: 'flat', quantity: 1, pricePerUnit: 6000 },
  ])
  check('masterclass: none sent', mErr(undefined), 'ok')

  // ── Add-on groups (T-7): per person = the paying guests, visibility is checked on the server ──
  const gOn = { id: 'g1', nameEn: 'Food', nameKa: null, active: true, showToCompanies: true, showToIndividuals: false, visitTypes: ['TASTING_LUNCH'] }
  const catG = [
    { id: 'pp', unitType: 'PER_PERSON' as const, active: true, pricePerUnit: 3500, name: 'Class', group: gOn },
    { id: 'pc', unitType: 'PER_PIECE' as const, active: true, pricePerUnit: 1800, name: 'Khachapuri', group: gOn },
    { id: 'off', unitType: 'PER_PIECE' as const, active: true, pricePerUnit: 100, name: 'In an off group', group: { ...gOn, active: false } },
    { id: 'none', unitType: 'PER_PIECE' as const, active: true, pricePerUnit: 100, name: 'No group', group: null },
  ]
  const withGuests = (lines: unknown, shownOn?: { bookingType: 'INDIVIDUAL' | 'COMPANY'; visitType: string }) => checkMasterclassLines(lines, catG, { payingGuests: 10, shownOn })
  const forged = withGuests([{ masterclassItemId: 'pp', quantity: 999 }])
  check('add-ons: a forged per-person quantity is replaced by the paying guests', forged.ok && forged.lines[0].quantity, 10)
  const noQty = withGuests([{ masterclassItemId: 'pp' }])
  check('add-ons: a per-person line needs no quantity at all', noQty.ok && noQty.lines[0].quantity, 10)
  const snap = withGuests([{ masterclassItemId: 'pc', quantity: 3 }])
  check('add-ons: the line carries its snapshot', snap.ok && [snap.lines[0].nameSnapshot, snap.lines[0].unitSnapshot, snap.lines[0].groupId, snap.lines[0].groupNameSnapshot], ['Khachapuri', 'PER_PIECE', 'g1', 'Food'])
  check('add-ons: a per-piece quantity is still validated', (() => { const r = withGuests([{ masterclassItemId: 'pc', quantity: -1 }]); return r.ok ? 'ok' : r.error.code })(), 'bad_quantity')
  const vis = (id: string, bt: 'INDIVIDUAL' | 'COMPANY', vt: string) => { const r = withGuests([{ masterclassItemId: id, quantity: 1 }], { bookingType: bt, visitType: vt }); return r.ok ? 'ok' : r.error.code }
  check('add-ons: offered to companies on its visit type', vis('pc', 'COMPANY', 'TASTING_LUNCH'), 'ok')
  check('add-ons: refused for individuals when the group is companies-only', vis('pc', 'INDIVIDUAL', 'TASTING_LUNCH'), 'hidden_group')
  check('add-ons: refused on a visit type the group excludes', vis('pc', 'COMPANY', 'TASTING'), 'hidden_group')
  check('add-ons: refused when the group is switched off', vis('off', 'COMPANY', 'TASTING_LUNCH'), 'hidden_group')
  check('add-ons: refused when the item has no group', vis('none', 'COMPANY', 'TASTING_LUNCH'), 'hidden_group')
  check('add-ons: the admin path has no visibility check', withGuests([{ masterclassItemId: 'off', quantity: 2 }]).ok, true)
  check('add-ons: per person with no paying guests is refused', (() => { const r = checkMasterclassLines([{ masterclassItemId: 'pp' }], catG, { payingGuests: 0 }); return r.ok ? 'ok' : r.error.code })(), 'bad_quantity')

  check('visit types: all three ticked = every type', normalizeVisitTypes(['LUNCH', 'TASTING', 'TASTING_LUNCH']), [])
  check('visit types: a subset is kept in canonical order', normalizeVisitTypes(['TASTING_LUNCH', 'TASTING']), ['TASTING', 'TASTING_LUNCH'])
  check('visit types: none is refused', normalizeVisitTypes([]), null)
  check('visit types: an unknown value is refused', normalizeVisitTypes(['TASTING', 'BRUNCH']), null)
  check('visit types: empty stored list shows all three ticked', visitTypesTicked([]), ['TASTING', 'TASTING_LUNCH', 'LUNCH'])
  const gv = { active: true, showToCompanies: true, showToIndividuals: false, visitTypes: [] as string[] }
  check('group: no visit types stored = every visit type', groupShownOn(gv, 'COMPANY', 'LUNCH'), true)
  check('group: a group the winery switched off is never shown', groupShownOn({ ...gv, active: false }, 'COMPANY', 'TASTING'), false)
  check('group: Georgian falls back to English when empty', [localName('Food', null, 'ka'), localName('Food', '  ', 'ka'), localName('Food', 'საჭმელი', 'ka'), localName('Food', 'საჭმელი', 'en')], ['Food', 'Food', 'საჭმელი', 'Food'])

  // Per-person lines follow the guests (D-11)
  const stored = [
    { id: 'a', quantity: 10, pricePerUnit: 3500, unitSnapshot: 'PER_PERSON' as const, nameSnapshot: 'Class' },
    { id: 'b', quantity: 4, pricePerUnit: 1800, unitSnapshot: 'PER_PIECE' as const, nameSnapshot: 'Khachapuri' },
    { id: 'c', quantity: 1, pricePerUnit: 6000, unitSnapshot: 'FLAT' as const, nameSnapshot: 'Tour' },
  ]
  const synced = withSyncedQuantities(stored, 12)
  check('sync: only the per-person line moves', synced.lines.map(l => l.quantity), [12, 4, 1])
  check('sync: the change is reported for the history', synced.changed, [{ id: 'a', name: 'Class', from: 10, to: 12 }])
  check('sync: nothing to do when the guests did not change', withSyncedQuantities(stored, 10).changed.length, 0)
  check('sync: the total follows (10 → 12 guests = +₾70)', lineTotals({ masterclassLines: synced.lines, extras: [] }).masterclass - lineTotals({ masterclassLines: stored, extras: [] }).masterclass, 2 * 3500)
  const preview = (paying: string) => adminOrderView({ bookingType: 'COMPANY', visitType: 'TASTING', guests: '0', boxes: { tastingOnly: paying, lunchOnly: '0', tastingLunch: '0', free: '0' },
    prices: [{ minGuests: 1, maxGuests: 99, tastingOnlyPrice: 5000, lunchOnlyPrice: null, tastingLunchPrice: 8000 }], registration: 0, manual: { tastingOnly: '', lunchOnly: '', tastingLunch: '' },
    addOnLines: [{ quantity: 1, pricePerUnit: 3500, unit: 'PER_PERSON' }, { quantity: 4, pricePerUnit: 1800, unit: 'PER_PIECE' }, { quantity: 1, pricePerUnit: 6000, unit: 'FLAT' }], extrasAmt: 0 })
  check('admin preview: per person is charged at the guests being typed', [preview('10').addOnAmt, preview('12').addOnAmt], [10 * 3500 + 4 * 1800 + 6000, 12 * 3500 + 4 * 1800 + 6000])
  check('admin preview: the total includes them', preview('10').total, 10 * 5000 + 10 * 3500 + 4 * 1800 + 6000)

  // Invoices: one section per group, names as sold, Georgian where the winery gave one, old rows still readable.
  const inv = [
    { name: 'Khinkali class', nameKa: 'ხინკლის კლასი', groupName: 'Masterclass', groupNameKa: 'მასტერკლასი', quantity: 12, pricePerUnit: 3500 },
    { name: 'Khachapuri', nameKa: null, groupName: 'Food', groupNameKa: null, quantity: 4, pricePerUnit: 1800 },
    { name: 'Cellar tour', nameKa: null, groupName: 'Masterclass', groupNameKa: 'მასტერკლასი', quantity: 1, pricePerUnit: 6000 },
    { name: 'Old row', quantity: 1, pricePerUnit: 100 },
  ]
  const en = groupInvoiceAddOns(inv, 'en', 'Add-ons')
  check('invoice: groups in order of first appearance', en.map(g => [g.title, g.lines.length]), [['Masterclass', 2], ['Food', 1], ['Add-ons', 1]])
  const ka = groupInvoiceAddOns(inv, 'ka', 'დამატებითი სერვისები')
  check('invoice (Georgian): group and item names in Georgian where given, English otherwise', [ka[0].title, addOnLabel(inv[0], 'ka'), addOnLabel(inv[1], 'ka'), ka[1].title], ['მასტერკლასი', 'ხინკლის კლასი × 12', 'Khachapuri × 4', 'Food'])
  check('invoice: the English invoice never shows Georgian', addOnLabel(inv[0], 'en'), 'Khinkali class × 12')
  check('invoice: a line with no group (old invoice) goes under the fallback title', en[2].lines[0].name, 'Old row')
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
  check('guest split: mixed booking', guestSplitText({ tastingOnly: 1, lunchOnly: 0, tastingLunch: 2, free: 1 }, 'en'), '1 Tasting · 2 Tasting & Lunch · 1 free') // no "only" since 2026-10-23
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
  // A company with no price table yet (since D-14 the only orders that can be priced later).
  const co = (hadRates: boolean) => adminOrderView({ bookingType: 'COMPANY', visitType: 'TASTING', guests: '0', boxes: { tastingOnly: '4', lunchOnly: '0', tastingLunch: '0', free: '0' },
    prices: [], registration: 0, manual, masterclassAmt: 0, extrasAmt: 0, hadRates })
  check('no table, no rates typed on a new order → price later, no problem', [co(false).quote?.kind, co(false).problem], ['unpriced', null])
  check('rates cleared on an order that had a price → refused like the server (8a)', [co(true).problem?.key, co(true).missing, co(true).total], ['orderForm.err.missingRate', ['tastingOnly'], null])
}

// D-14 (Max 2026-10-22): an individual order on the admin screens is priced from the Individuals table by its
// guest count — no typed rates, no "price later", no registration fee.
{
  console.log('\nD-14 — individuals from the Individuals table')
  const individuals: ProductTier[] = [
    { minGuests: 1, maxGuests: 2, tastingOnlyPrice: 9000, lunchOnlyPrice: null, tastingLunchPrice: 15000 },
    { minGuests: 3, maxGuests: 6, tastingOnlyPrice: 7000, lunchOnlyPrice: null, tastingLunchPrice: 12000 },
    { minGuests: 7, maxGuests: 100, tastingOnlyPrice: 6000, lunchOnlyPrice: null, tastingLunchPrice: 10500 },
  ]
  const noBoxes = { tastingOnly: '0', lunchOnly: '0', tastingLunch: '0', free: '0' }
  const ind = (o: { visitType?: 'TASTING' | 'TASTING_LUNCH'; guests: string; prices?: ProductTier[]; manual?: string; registration?: number; hadRates?: boolean }) =>
    adminOrderView({ bookingType: 'INDIVIDUAL', visitType: o.visitType ?? 'TASTING', guests: o.guests, boxes: noBoxes, prices: o.prices ?? individuals,
      registration: o.registration ?? 0, manual: { tastingOnly: o.manual ?? '', lunchOnly: '', tastingLunch: o.manual ?? '' }, masterclassAmt: 0, extrasAmt: 0, hadRates: o.hadRates })
  const four = ind({ guests: '4' })
  check('4 guests, Tasting → the 3–6 row, ₾70 × 4 = ₾280', [four.quote?.kind, four.total, four.lines.map(l => [l.rate, l.row])], ['priced', 28000, [[7000, { min: 3, max: 6, outside: false }]]])
  check('8 guests, Tasting + Lunch → the 7–100 row, ₾105 × 8', ind({ visitType: 'TASTING_LUNCH', guests: '8' }).total, 84000)
  const typed = ind({ guests: '4', manual: '50' })
  check('a typed rate is ignored — the table price stands, no rate inputs', [typed.total, typed.rateInputs], [28000, []])
  check('no registration fee for an individual, whatever is passed', ind({ guests: '4', registration: 3000 }).registration, 0)
  const noTable = ind({ guests: '4', prices: [] })
  check('no Individuals table → refused, not priced later', [noTable.problem?.key, noTable.quote, noTable.total, noTable.rateInputs], ['orderForm.err.noIndividualsTable', null, null, []])
  const noTL = ind({ visitType: 'TASTING_LUNCH', guests: '4', prices: individuals.map(r => ({ ...r, tastingLunchPrice: null })) })
  check('table lacks the product → refused with the Individuals message', [noTL.problem?.key, noTL.missing, noTL.rateInputs], ['orderForm.err.individualsMissing', ['tastingLunch'], []])
  check('an order that had rates still prices from the table (hadRates is a company rule)', ind({ guests: '4', hadRates: true }).total, 28000)
}

// A-7 kept (Max 2026-10-23: overcharge rather than undercharge) — the admin line says when no row covers the count.
{
  console.log('\nA-7 fallback label')
  const tbl: ProductTier[] = [
    { minGuests: 1, maxGuests: 12, tastingOnlyPrice: 5800, lunchOnlyPrice: 4500, tastingLunchPrice: 9800 },
    { minGuests: 13, maxGuests: 100, tastingOnlyPrice: 4600, lunchOnlyPrice: null, tastingLunchPrice: 8600 },
  ]
  const v = (lo: string) => adminOrderView({ bookingType: 'COMPANY', visitType: 'TASTING_LUNCH', guests: '0', boxes: { tastingOnly: '0', lunchOnly: lo, tastingLunch: '1', free: '0' },
    prices: tbl, registration: 0, manual: { tastingOnly: '', lunchOnly: '', tastingLunch: '' }, masterclassAmt: 0, extrasAmt: 0 })
  const line = (lo: string) => v(lo).lines.find(l => l.product === 'lunchOnly')
  check('13 Lunch only, no row 13+ offers it → ₾45 from row 1–12 (the last row offering it), flagged above', [line('13')?.rate, line('13')?.row], [4500, { min: 1, max: 12, outside: 'above' }])
  check('5 Lunch only → its own row, not flagged', line('5')?.row, { min: 1, max: 12, outside: false })
  // Acceptance test 2026-10-23: another problem (too many free) must not zero the lunch guests the dish selects follow.
  const tooFree = adminOrderView({ bookingType: 'COMPANY', visitType: 'TASTING_LUNCH', guests: '0', boxes: { tastingOnly: '11', lunchOnly: '2', tastingLunch: '12', free: '26' },
    prices: tbl, registration: 0, manual: { tastingOnly: '', lunchOnly: '', tastingLunch: '' }, masterclassAmt: 0, extrasAmt: 0 })
  check('too many free: problem shown, lunch guests still 14', [tooFree.problem?.key, tooFree.lunchGuests], ['orderForm.err.tooManyFree', 14])
}

// Max 2026-10-22/23: no more Free guests than paying guests — public form and admin screens.
{
  console.log('\nFree-guest cap')
  const none = { groupMin: null, productMins: { tastingOnly: null, lunchOnly: null, tastingLunch: null } }
  const r = (form: 'public' | 'admin', to: number, free: number) => { const x = checkBookingCounts({ bookingType: 'COMPANY', layout: 'boxes', form, visitType: 'TASTING', tastingOnly: to, free }, none); return x.ok ? 'ok' : x.error }
  check('public: 1 paying + 200 free → refused, max 1', r('public', 1, 200), { code: 'too_many_free', max: 1 })
  check('public: 4 paying + 4 free → ok', r('public', 4, 4), 'ok')
  check('admin screens refuse it too (Max 2026-10-23)', r('admin', 1, 3), { code: 'too_many_free', max: 1 })
  check('admin: 9 paying + 9 free → ok', r('admin', 9, 9), 'ok')
  check('admin order: 9 paying + 12 free → tooManyFree, max 9', (() => { const x = checkAdminOrder({ bookingType: 'COMPANY', visitType: 'TASTING', boxes: { tastingOnly: 9, lunchOnly: 0, tastingLunch: 0, free: 12 } }); return x.ok ? 'ok' : x.problem })(), { key: 'orderForm.err.tooManyFree', vars: { max: 9 } })
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
