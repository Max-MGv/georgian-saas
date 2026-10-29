/**
 * T-318 R2 — the "Set the price first" / "Nothing to pay" rules (Q-11 / Q-12), as a truth table.
 * Pure functions, no database, no network: safe to run any time.
 *
 * The server actions that call these (`changeBookingStatus`, `changeWineOrderStatus`) need an admin
 * session, so the end-to-end path is checked in the browser on localhost; this proves the rules.
 *
 * Run: npx tsx scripts/test-status-refusal.ts
 */
import { bookingMoneyRefusal, wineMoneyRefusal } from '../lib/statusRefusal'

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ok   ${label}`) }
  else { failed++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`) }
}
const code = (r: { code: string } | null) => r?.code ?? null

console.log('\nBookings (total null = price not set, 0 = free)\n')
check('paid ✓ on no price → NO_PRICE', code(bookingMoneyRefusal(null, { kind: 'paid', value: true })) === 'NO_PRICE')
check('paid ✓ on 0 ₾ → NOTHING_TO_PAY', code(bookingMoneyRefusal(0, { kind: 'paid', value: true })) === 'NOTHING_TO_PAY')
check('paid ✓ on a real price → allowed', bookingMoneyRefusal(15000, { kind: 'paid', value: true }) === null)
check('paid ✗ (un-pay) on 0 ₾ / no price → allowed (only taking money is blocked)',
  bookingMoneyRefusal(0, { kind: 'paid', value: false }) === null && bookingMoneyRefusal(null, { kind: 'paid', value: false }) === null)
check('invoice sent ✓ on 0 ₾ → NOTHING_TO_PAY', code(bookingMoneyRefusal(0, { kind: 'invoiceSent', value: true })) === 'NOTHING_TO_PAY')
check('invoice sent ✓ on no price → allowed (unchanged; the invoice flow has its own checks)',
  bookingMoneyRefusal(null, { kind: 'invoiceSent', value: true }) === null)
check('invoice sent ✓ on a real price → allowed', bookingMoneyRefusal(15000, { kind: 'invoiceSent', value: true }) === null)
check('invoice sent ✗ on 0 ₾ → allowed', bookingMoneyRefusal(0, { kind: 'invoiceSent', value: false }) === null)
check('a stage change is never refused (0 ₾, no price)',
  bookingMoneyRefusal(0, { kind: 'stage' }) === null && bookingMoneyRefusal(null, { kind: 'stage' }) === null)
check('restore (abandoned → live) is never refused', bookingMoneyRefusal(null, { kind: 'restore' }) === null)

console.log('\nWine orders (amount due = wines + delivery fee; null / 0 = nothing priced)\n')
check('paid ✓ with no wines total → NO_PRICE', code(wineMoneyRefusal(null, { kind: 'paid', value: true })) === 'NO_PRICE')
check('paid ✓ with 0 due → NO_PRICE', code(wineMoneyRefusal(0, { kind: 'paid', value: true })) === 'NO_PRICE')
check('paid ✓ with wines priced (fee still unset counts as 0) → allowed', wineMoneyRefusal(12000, { kind: 'paid', value: true }) === null)
check('paid ✗ on a 0-due order → allowed', wineMoneyRefusal(0, { kind: 'paid', value: false }) === null)
check('stage / restore never refused', wineMoneyRefusal(null, { kind: 'stage' }) === null && wineMoneyRefusal(null, { kind: 'restore' }) === null)

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
