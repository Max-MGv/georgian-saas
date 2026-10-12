/**
 * priceWineOrder (lib/winePricing.ts, T-12). Pure; no database.
 * Run: npx tsx scripts/test-wine-pricing.ts
 */
import { priceWineOrder } from '../lib/winePricing'
import { applyPercent, asTetri } from '../lib/money'

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ✅  ${label}`) } else { failed++; console.log(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`) }
}
console.log('\n── priceWineOrder ──\n')

const A = { vintageId: 'a', quantity: 3, standardPrice: 4550 } // 45.50₾ × 3
const B = { vintageId: 'b', quantity: 2, standardPrice: 3000 } // 30₾ × 2

// No negotiated prices → exactly the pre-T-12 single-% total, to the tetri.
for (const pct of [null, 0, 10, 15, 33.3]) {
  const sub = A.standardPrice * A.quantity + B.standardPrice * B.quantity
  const before = pct ? applyPercent(asTetri(sub), pct) : sub
  const r = priceWineOrder([A, B], {}, pct)
  check(`no negotiated, ${pct ?? 'no'}% → same total as before T-12 (${before})`, r.total === before, String(r.total))
}

const r1 = priceWineOrder([A, B], { a: 4000 }, 10)
check('negotiated line uses its price, no % on it', r1.lines[0]!.unitPrice === 4000 && r1.lines[0]!.negotiated && r1.negotiatedTotal === 12000)
check('standard line keeps its price, % applies to it', r1.lines[1]!.unitPrice === 3000 && r1.standardSubtotal === 6000)
check('total = 120₾ + (60₾ − 10%) = 174₾', r1.total === 12000 + 5400, String(r1.total))
check('discount reported as 10%', r1.discountPercent === 10)

const r2 = priceWineOrder([A, B], { a: 4000, b: 2500 }, 10)
check('all lines negotiated → no % reported, plain sum', r2.discountPercent === null && r2.total === 12000 + 5000)

const r3 = priceWineOrder([A], { b: 1 }, null)
check('a negotiated price for a wine not in the cart changes nothing', r3.total === 13650 && !r3.lines[0]!.negotiated)

const r4 = priceWineOrder([A], { a: 0 }, 50)
check('a negotiated price of 0 is honoured (free), not treated as "none"', r4.total === 0 && r4.lines[0]!.negotiated)

const r5 = priceWineOrder([{ vintageId: 'c', quantity: 1, standardPrice: 4550 }], {}, 15)
check('rounding stays whole tetri (bug #44: 45.50₾ at 15%)', Number.isInteger(r5.total), String(r5.total))

console.log('\n──────────────────────────────────────────────────')
console.log(`Results: ${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exitCode = 1
