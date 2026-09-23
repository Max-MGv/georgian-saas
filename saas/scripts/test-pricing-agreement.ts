/**
 * The nine places that decide what a booking costs must agree (bugs #50–#52).
 *
 * ## What this file is, honestly
 *
 * The pricing formulas live inside a server action and a React component, so
 * they cannot be imported and called directly. Each is therefore **replicated**
 * below, marked with the file and line it mirrors. That is a real weakness: a
 * replica can drift from the site it mirrors and this suite would not notice.
 *
 * It is written this way deliberately and temporarily. Extracting a shared
 * `priceBooking()` into pricingUtils.ts will change behaviour at exactly these
 * sites, because they have drifted — so extracting first buries three fixes in
 * a mechanical diff where a fix and a fresh bug look identical. These tests go
 * first, fail, and pin the numbers. When `priceBooking()` lands, every replica
 * here is deleted and the assertions point at the real function.
 *
 * Run: npx tsx scripts/test-pricing-agreement.ts
 */
import { findTier, priceBooking, ratesFromTier, type PriceTier } from '../lib/pricingUtils'
const NO_LINES = { masterclass: 0, extras: 0 }
import { fromMajor } from '../lib/money'

let passed = 0, failed = 0
function check(label: string, actual: unknown, expected: unknown) {
  if (Object.is(actual, expected)) { passed++; return }
  failed++
  console.error(`  FAIL  ${label}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

type VisitType = 'TASTING' | 'TASTING_LUNCH'
type Snapshot = { tasting: number; lunch: number; registration: number }

// ── Replicas ────────────────────────────────────────────────────────────────

/** createBooking.ts:259,285 — the public path. The reference for what a visit costs. */
function publicBooking(o: { visitType: VisitType; guestCount: number; rates: Snapshot; lines: number }) {
  const rate = o.visitType === 'TASTING' ? o.rates.tasting : o.rates.lunch
  return o.guestCount * rate + o.lines
}

/** orders.ts — createOrderAdmin's manual-rate branch, as fixed for #51. */
function adminWalkIn(o: { visitType: VisitType; guestCount: number; tastingGuestCount: number; lunchGuestCount: number; rates: Snapshot; lines: number }) {
  const paying = o.tastingGuestCount + o.lunchGuestCount
  return (paying > 0
    ? o.tastingGuestCount * o.rates.tasting + o.lunchGuestCount * o.rates.lunch
    : o.guestCount * (o.visitType === 'TASTING_LUNCH' ? o.rates.lunch : o.rates.tasting)) + o.lines
}

/** pricing.ts:47-54 — recalcOrderTotal's snapshot branch. Correct by construction. */
function recalcFromSnapshot(o: { visitType: VisitType; guestCount: number; tastingGuestCount: number; lunchGuestCount: number; snap: Snapshot; lines: number }) {
  const paying = o.tastingGuestCount + o.lunchGuestCount
  const base = paying > 0
    ? o.tastingGuestCount * o.snap.tasting + o.lunchGuestCount * o.snap.lunch
    : o.guestCount * (o.visitType === 'TASTING_LUNCH' ? o.snap.lunch : o.snap.tasting)
  return base + o.snap.registration + o.lines
}

/** OrderDetail.tsx — the individual / no-tier branch, as fixed for #52. */
function orderDetailTotal(o: { storedTotal: number; tier: PriceTier | null; payingGuests: number; lines: number; snapshotBase: number | null }) {
  if (o.tier) throw new Error('company path not under test here')
  if (o.payingGuests === 0) {
    // legacyBase is the snapshot-derived, LINE-FREE base; null falls through to
    // the stored total untouched.
    return o.snapshotBase != null ? o.snapshotBase + o.lines : o.storedTotal
  }
  return o.lines
}

/** OrderDetail.tsx — state seeding + handleSave, as fixed for #50. */
function orderDetailSaveSends(o: { hasCompanyPrices: boolean; payingGuests: number; snapshotTasting: number | null; snapshotLunch?: number | null; customRates?: boolean }) {
  // Seeded from the snapshot, empty when there is none.
  const manualTasting = o.snapshotTasting ?? 0
  const manualLunch = o.snapshotLunch ?? o.snapshotTasting ?? 0
  const sends = !o.hasCompanyPrices && o.payingGuests > 0
    && (o.snapshotTasting != null || o.customRates === true)
  return sends ? { manualTasting, manualLunch } : null
}

/** orders.ts:130-136 — updateOrderEnhanced's manual branch. */
function updateEnhancedManual(o: { tastingGuests: number; lunchGuests: number; rates: { tasting: number; lunch: number }; lines: number }) {
  return {
    total: o.tastingGuests * o.rates.tasting + o.lunchGuests * o.rates.lunch + o.lines,
    snapshotTasting: o.rates.tasting,
  }
}

// ── The cases ───────────────────────────────────────────────────────────────

const RATES: Snapshot = { tasting: fromMajor(50), lunch: fromMajor(80), registration: 0 }

console.log('#51 — the same visit must cost the same however it was entered')
{
  const shape = { visitType: 'TASTING_LUNCH' as VisitType, guestCount: 4, tastingGuestCount: 0, lunchGuestCount: 0, rates: RATES, lines: 0 }
  const web = publicBooking(shape)
  const admin = adminWalkIn(shape)
  check('public booking prices TASTING_LUNCH at the lunch rate', web, 32000)
  check('admin walk-in agrees with the public site', admin, web)
}

console.log('#51 — a walk-in total must match what its own snapshots recompute to')
{
  const shape = { visitType: 'TASTING_LUNCH' as VisitType, guestCount: 4, tastingGuestCount: 0, lunchGuestCount: 0, rates: RATES, lines: 0 }
  const created = adminWalkIn(shape)
  const afterExtra = recalcFromSnapshot({ ...shape, snap: RATES, lines: fromMajor(10) })
  check('adding a ₾10 extra moves the total by exactly ₾10', afterExtra - created, fromMajor(10))
}

console.log('#52 — the detail screen must agree with the invoice')
{
  // Individual, ₾50/pp, 4 guests, one ₾40 extra. recalcOrderTotal stored this.
  const indiv: Snapshot = { tasting: fromMajor(50), lunch: fromMajor(50), registration: 0 }
  const lines = fromMajor(40)
  const stored = recalcFromSnapshot({ visitType: 'TASTING', guestCount: 4, tastingGuestCount: 0, lunchGuestCount: 0, snap: indiv, lines })
  check('the stored total is ₾240', stored, 24000)
  const snapshotBase = 4 * indiv.tasting + indiv.registration     // line-free
  const shown = orderDetailTotal({ storedTotal: stored, tier: null, payingGuests: 0, lines, snapshotBase })
  check('the detail screen shows the same number as the invoice', shown, stored)
}

console.log('#50 — saving guest counts must not invent a rate or destroy a snapshot')
{
  // Sold at ₾70/pp, 4 guests, total ₾280, snapshot 7000.
  const soldAt = fromMajor(70)
  const storedTotal = 4 * soldAt
  const sent = orderDetailSaveSends({ hasCompanyPrices: false, payingGuests: 4, snapshotTasting: soldAt, snapshotLunch: soldAt })
  const after = updateEnhancedManual({ tastingGuests: 4, lunchGuests: 0, rates: { tasting: sent!.manualTasting, lunch: sent!.manualLunch }, lines: 0 })
  check("a Save re-prices at the order's own rate, not a constant", after.total, storedTotal)
  check('...and the rate snapshot survives', after.snapshotTasting, soldAt)

  // An order with no snapshot at all: nothing to trust, so send nothing and
  // leave the stored total and snapshot alone.
  const legacy = orderDetailSaveSends({ hasCompanyPrices: false, payingGuests: 4, snapshotTasting: null })
  check('a snapshot-less order sends no rates unless the admin typed one', legacy, null)
  const typed = orderDetailSaveSends({ hasCompanyPrices: false, payingGuests: 4, snapshotTasting: null, customRates: true })
  check('...but a deliberately typed rate IS sent', typed !== null, true)
}

console.log('#51 — the new-order form preview must agree with what the server stores')
{
  // NewOrderForm.tsx computedTotal, individual branch — the mirror of
  // createOrderAdmin. Fixing only the server would have been worse than fixing
  // neither: the admin reads one number on the form and another lands in the
  // database. Caught by driving the real form on staging, not by any test.
  const newOrderFormPreview = (o: { visitType: VisitType; guestCount: number; rates: Snapshot; lines: number }) =>
    o.guestCount * (o.visitType === 'TASTING_LUNCH' ? o.rates.lunch : o.rates.tasting) + o.lines

  const shape = { visitType: 'TASTING_LUNCH' as VisitType, guestCount: 4, tastingGuestCount: 0, lunchGuestCount: 0, rates: RATES, lines: 0 }
  check('the form preview equals the stored total', newOrderFormPreview(shape), adminWalkIn(shape))
  check('...and both are 4 x 80 GEL, not 4 x 50', adminWalkIn(shape), 32000)
}

console.log('the tier is the PARTY SIZE, not the paying head count (2026-09-19 rule change)')
{
  // The demo individuals ladder: 1-2 @90, 3-6 @70 (+50 lunch), 7-100 @60 (+45 lunch).
  const LADDER = [
    { minGuests: 1, maxGuests: 2, pricePerPerson: 9000, tastingLunchPricePerPerson: 6000, registrationPrice: 0 },
    { minGuests: 3, maxGuests: 6, pricePerPerson: 7000, tastingLunchPricePerPerson: 5000, registrationPrice: 0 },
    { minGuests: 7, maxGuests: 100, pricePerPerson: 6000, tastingLunchPricePerPerson: 4500, registrationPrice: 0 },
  ]
  // A party of 8: 2 tasting-only, 4 tasting+lunch, 2 free (guide + driver).
  const party = { guestCount: 8, tastingGuests: 2, lunchGuests: 4 }

  const oldTier = findTier(LADDER, party.tastingGuests + party.lunchGuests)!   // 6 paying -> 3-6 band
  const newTier = findTier(LADDER, party.guestCount)!                          // 8 people -> 7-100 band
  check('the old rule lands in the 3-6 band', oldTier.pricePerPerson, 7000)
  check('the new rule lands in the 7-100 band', newTier.pricePerPerson, 6000)

  const oldTotal = priceBooking(ratesFromTier(oldTier), party, 'TASTING', NO_LINES)
  const newTotal = priceBooking(ratesFromTier(newTier), party, 'TASTING', NO_LINES)
  check('old rule charged 620 GEL', oldTotal, 62000)
  check('new rule charges 540 GEL', newTotal, 54000)

  // Free guests are never charged, but they DO count toward the band.
  const noFree = { guestCount: 6, tastingGuests: 2, lunchGuests: 4 }
  check('the same 6 payers without a guide stay in the 3-6 band',
    findTier(LADDER, noFree.guestCount)!.pricePerPerson, 7000)

  // Moving guests between the two buckets must NOT move the band any more.
  const a = { guestCount: 8, tastingGuests: 2, lunchGuests: 4 }
  const b = { guestCount: 8, tastingGuests: 5, lunchGuests: 1 }
  check('re-splitting a party does not change its tier',
    findTier(LADDER, a.guestCount)!.pricePerPerson, findTier(LADDER, b.guestCount)!.pricePerPerson)
}

console.log('one function prices every site identically')
{
  const rates = { tasting: 5000, lunch: 8000, registration: 0 }
  const lines = { masterclass: 0, extras: 0 }
  // Individual, no split: the whole party is on one visit type.
  check('individual TASTING_LUNCH', priceBooking(rates, { guestCount: 4, tastingGuests: 0, lunchGuests: 0 }, 'TASTING_LUNCH', lines), 32000)
  check('individual TASTING', priceBooking(rates, { guestCount: 4, tastingGuests: 0, lunchGuests: 0 }, 'TASTING', lines), 20000)
  // Split party: visitType is irrelevant, the buckets decide.
  check('split party ignores visitType', priceBooking(rates, { guestCount: 6, tastingGuests: 2, lunchGuests: 3 }, 'TASTING', lines), 2 * 5000 + 3 * 8000)
  // Lines are added once, never folded into the base.
  check('lines add once', priceBooking(rates, { guestCount: 4, tastingGuests: 0, lunchGuests: 0 }, 'TASTING', { masterclass: 1200, extras: 800 }), 20000 + 2000)
}

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed === 0 ? 0 : 1)
