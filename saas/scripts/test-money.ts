/**
 * Proves lib/money.ts before anything depends on it (Chunk 3a).
 *
 * Deliberately runs before the schema changes: the seam has to be trustworthy
 * *first*, because chunk 3b's migration is destructive and chunk 3d rewrites
 * every display site in the app onto these helpers. A rounding mistake here
 * would be multiplied across ~49 files and an invoice.
 *
 * No database. Pure functions, run with: npx tsx scripts/test-money.ts
 */
import {
  asTetri, asTetriOrNull, fromMajor, toMajor, formatTetri, formatTetriOrDash,
  parseMajor, sumTetri, multiplyTetri, applyPercent, type Tetri,
} from '../lib/money'

let passed = 0
let failed = 0

function check(label: string, actual: unknown, expected: unknown) {
  const ok = Object.is(actual, expected)
  if (ok) { passed++; return }
  failed++
  console.error(`  FAIL  ${label}\n        expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

function throws(label: string, fn: () => unknown) {
  try { fn(); failed++; console.error(`  FAIL  ${label}\n        expected a throw, got none`) }
  catch { passed++ }
}

console.log('\nfromMajor / toMajor')
check('whole GEL', fromMajor(45), 4500)
check('half GEL', fromMajor(45.5), 4550)
check('two decimals', fromMajor(45.55), 4555)
check('zero', fromMajor(0), 0)
check('round-trips', toMajor(fromMajor(45.5)), 45.5)
// The exact case that motivated the whole change: 49.985 truncates to 4998 and
// undercharges by a tetri. Math.round is what prevents it.
check('rounds up, never truncates', fromMajor(49.985), 4999)
check('rounds half away from zero', fromMajor(0.005), 1)
// Float representation: 0.1 + 0.2 = 0.30000000000000004 as a float.
check('absorbs float error', fromMajor(0.1 + 0.2), 30)
throws('rejects NaN', () => fromMajor(NaN))
throws('rejects Infinity', () => fromMajor(Infinity))

console.log('asTetri')
check('passes an integer', asTetri(4500), 4500)
check('null passes through', asTetriOrNull(null), null)
check('undefined passes through', asTetriOrNull(undefined), null)
// This is the guard that catches a major-unit value reaching the DB boundary
// without conversion — 45.5 is not a whole number of tetri.
throws('rejects a fractional tetri', () => asTetri(45.5))
throws('rejects NaN', () => asTetri(NaN))

console.log('formatTetri — must match pre-conversion output exactly')
// Every display site rendered `${order.totalPrice}₾` before this change, so a
// whole-GEL amount has to come out byte-identical or screens change silently.
check('whole amount', formatTetri(asTetri(4500)), '45₾')
check('280 GEL, as the booking form shows', formatTetri(asTetri(28000)), '280₾')
check('shows decimals when they exist', formatTetri(asTetri(4550)), '45.50₾')
check('pads a single tetri', formatTetri(asTetri(4505)), '45.05₾')
check('forced decimals for invoices', formatTetri(asTetri(4500), { decimals: true }), '45.00₾')
check('grouping, as Statistics shows', formatTetri(asTetri(2430100), { grouping: true }), '24,301₾')
check('no grouping by default', formatTetri(asTetri(2430100)), '24301₾')
check('space before symbol, as InvoicePrint shows', formatTetri(asTetri(4500), { space: true }), '45 ₾')
check('symbol suppressed', formatTetri(asTetri(4500), { symbol: false }), '45')
check('zero', formatTetri(asTetri(0)), '0₾')
check('negative', formatTetri(asTetri(-4550)), '-45.50₾')
check('nullable renders a dash', formatTetriOrDash(null), '—')
check('nullable renders the amount', formatTetriOrDash(asTetri(4500)), '45₾')

console.log('parseMajor')
check('plain integer', parseMajor('45'), 4500)
check('decimal', parseMajor('45.5'), 4550)
check('with symbol', parseMajor('45 ₾'), 4500)
check('with separators', parseMajor('1,234.56'), 123456)
check('empty is null', parseMajor(''), null)
check('garbage is null', parseMajor('abc'), null)
check('partial garbage is null', parseMajor('45abc'), null)

console.log('arithmetic')
check('sum is exact', sumTetri([asTetri(1000), asTetri(2050), asTetri(5)]), 3055)
check('empty sum', sumTetri([]), 0)
check('multiply by quantity', multiplyTetri(asTetri(2500), 4), 10000)
check('multiply by zero', multiplyTetri(asTetri(2500), 0), 0)
throws('rejects fractional quantity', () => multiplyTetri(asTetri(2500), 1.5))
check('10% off', applyPercent(asTetri(10000), 10), 9000)
check('no discount', applyPercent(asTetri(10000), 0), 10000)
check('rounds a discount to whole tetri', applyPercent(asTetri(3333), 10), 3000)

// The property that Float could not provide: summing a hundred 10-tetri amounts
// lands exactly on 1000. In floats, 0.1 added a hundred times is not 10.
console.log('the property this whole change exists for')
const hundredDimes = Array.from({ length: 100 }, () => asTetri(10))
check('100 x 0.10 GEL is exactly 10 GEL', sumTetri(hundredDimes), 1000)
const floatEquivalent = Array.from({ length: 100 }, () => 0.1).reduce((a, b) => a + b, 0)
check('...whereas the float sum is not', floatEquivalent === 10, false)

// A realistic booking: 4 tasting guests at 70, a 25 registration fee, 4
// masterclass pieces at 25, and a 40 extra.
console.log('a realistic booking total')
const guests = multiplyTetri(fromMajor(70), 4)
const masterclass = multiplyTetri(fromMajor(25), 4)
const total: Tetri = sumTetri([guests, fromMajor(25), masterclass, fromMajor(40)])
check('total in tetri', total, 44500)
check('total displays correctly', formatTetri(total), '445₾')

console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed === 0 ? 0 : 1)
