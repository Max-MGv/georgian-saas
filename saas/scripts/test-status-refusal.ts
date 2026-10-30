/**
 * T-318 R2 — the "Set the price first" / "Nothing to pay" rules (Q-11 / Q-12), as a truth table.
 * Pure functions, no database, no network: safe to run any time.
 *
 * The server actions that call these (`changeBookingStatus`, `changeWineOrderStatus`) need an admin
 * session, so the end-to-end path is checked in the browser on localhost; this proves the rules.
 *
 * Run: npx tsx scripts/test-status-refusal.ts
 */
import { bookingMoneyRefusal, wineMoneyRefusal, malformedChange } from '../lib/statusRefusal'
import { revertPatch } from '../lib/revertPatch'

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

console.log('\nCancelled orders cannot be marked Paid by any method\n')
check('booking: paid ✓ on a CANCELLED booking → CANCELLED', code(bookingMoneyRefusal(15000, { kind: 'paid', value: true }, 'CANCELLED')) === 'CANCELLED')
check('booking: paid ✓ on a live stage → allowed', bookingMoneyRefusal(15000, { kind: 'paid', value: true }, 'CONFIRMED') === null)
check('booking: paid ✗ (un-pay) on a CANCELLED booking → allowed (correcting a mistake)', bookingMoneyRefusal(15000, { kind: 'paid', value: false }, 'CANCELLED') === null)
check('booking: a stage change out of CANCELLED (reopen) is never refused', bookingMoneyRefusal(15000, { kind: 'stage' }, 'CANCELLED') === null)
check('booking: invoice sent on a CANCELLED booking is not part of this rule', bookingMoneyRefusal(15000, { kind: 'invoiceSent', value: true }, 'CANCELLED') === null)
check('wine: paid ✓ on a CANCELLED wine order → CANCELLED', code(wineMoneyRefusal(12000, { kind: 'paid', value: true }, 'CANCELLED')) === 'CANCELLED')
check('wine: paid ✓ on a live stage → allowed', wineMoneyRefusal(12000, { kind: 'paid', value: true }, 'NEW') === null)
check('wine: paid ✗ (un-pay) on a CANCELLED wine order → allowed', wineMoneyRefusal(12000, { kind: 'paid', value: false }, 'CANCELLED') === null)
check('wine: reopen (stage change) is never refused', wineMoneyRefusal(12000, { kind: 'stage' }, 'CANCELLED') === null)

console.log('\nMalformed payloads (crafted requests)\n')
const KINDS = ['stage', 'paid', 'invoiceSent', 'restore']
check('paid with value 1 (truthy, not boolean) is rejected', malformedChange({ kind: 'paid', value: 1 }, KINDS) !== null)
check('paid with value "true" (string) is rejected', malformedChange({ kind: 'paid', value: 'true' }, KINDS) !== null)
check('paid / invoiceSent with a real boolean is accepted',
  malformedChange({ kind: 'paid', value: true }, KINDS) === null && malformedChange({ kind: 'invoiceSent', value: false }, KINDS) === null)
check('an unknown kind is rejected (it used to fall through to "clear abandonedAt")',
  malformedChange({ kind: 'explode' }, KINDS) !== null && malformedChange({}, KINDS) !== null)
check('stage / restore need no boolean', malformedChange({ kind: 'stage' }, KINDS) === null && malformedChange({ kind: 'restore' }, KINDS) === null)

console.log('\nrevertPatch (a refused change must not undo a later one)\n')
type Row = { stage: string; paidAt: Date | null }
const before: Row = { stage: 'CONFIRMED', paidAt: null }
const after: Row = { stage: 'CONFIRMED', paidAt: new Date(1000) } // optimistic Paid
check('untouched since → back to before', JSON.stringify(revertPatch(after, before, after)) === JSON.stringify(before))
const later: Row = { stage: 'COMPLETED', paidAt: new Date(1000) } // the admin then also completed it
const reverted = revertPatch(later, before, after)
check('a later change survives: stage stays COMPLETED, only paidAt is put back', reverted.stage === 'COMPLETED' && reverted.paidAt === null, JSON.stringify(reverted))
const overwritten: Row = { stage: 'CONFIRMED', paidAt: new Date(2000) } // something else set paidAt since
check('a field someone else changed since is left alone', revertPatch(overwritten, before, after).paidAt?.getTime() === 2000)

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
