/**
 * priceWineOrder (lib/winePricing.ts, T-12). Pure; no database.
 * Run: npx tsx scripts/test-wine-pricing.ts
 */
import { priceWineOrder, wineLineAmount } from '../lib/winePricing'
import { applyPercent, asTetri } from '../lib/money'

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ✅  ${label}`) } else { failed++; console.log(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`) }
}
console.log('\n── priceWineOrder ──\n')

const A = { vintageId: 'a', quantity: 3, standardPrice: 4550 } // 45.50₾ × 3
const B = { vintageId: 'b', quantity: 2, standardPrice: 3000 } // 30₾ × 2

// No negotiated prices → the total is the sum of the lines, each rounded on its own (T-22, C-1). With no % that is the plain sum.
for (const pct of [null, 0, 10, 15, 33.3]) {
  const line = (l: typeof A) => (pct ? applyPercent(asTetri(l.standardPrice * l.quantity), pct) : l.standardPrice * l.quantity)
  const expected = line(A) + line(B)
  const r = priceWineOrder([A, B], {}, pct)
  check(`no negotiated, ${pct ?? 'no'}% → sum of per-line totals (${expected})`, r.total === expected && r.total === r.lines[0]!.lineTotal + r.lines[1]!.lineTotal, String(r.total))
}
// A single line can't differ from the old single-% total.
for (const pct of [10, 15, 33.3]) {
  const r = priceWineOrder([A], {}, pct)
  check(`one line at ${pct}% equals the old whole-order calculation`, r.total === applyPercent(asTetri(A.standardPrice * A.quantity), pct))
}
// Per-line rounding can differ from rounding the sum by a tetri — this is the one deliberate change (C-1).
const odd = [{ vintageId: 'x', quantity: 1, standardPrice: 1005 }, { vintageId: 'y', quantity: 1, standardPrice: 1005 }]
const rOdd = priceWineOrder(odd, {}, 50)
check('per-line rounding: two 10.05₾ bottles at 50% = 5.03 + 5.03 (not 10.05)', rOdd.total === 1006 && rOdd.lines.every(l => l.lineTotal === 503), String(rOdd.total))

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

// Per-line facts stored with each line (T-22): negotiated flag, the % on THAT line, its total.
check('negotiated line: no % on it, total = quantity × its price', r1.lines[0]!.discountPercent === null && r1.lines[0]!.lineTotal === 12000)
check('standard line: the % is on the line, total rounded on its own', r1.lines[1]!.discountPercent === 10 && r1.lines[1]!.lineTotal === 5400)
check('no company %: no line carries one', priceWineOrder([A, B], {}, null).lines.every(l => l.discountPercent === null))
check('a "constructor" vintage id is not a negotiated price (F6)', !priceWineOrder([{ vintageId: 'constructor', quantity: 1, standardPrice: 100 }], {}, null).lines[0]!.negotiated)

console.log('\n── wineLineAmount ──\n')
check('its own lineTotal when it has one', wineLineAmount({ quantity: 2, priceSnapshot: 1000, lineTotal: 1700 }, 50) === 1700)
check('no lineTotal: bottle price × quantity', wineLineAmount({ quantity: 2, priceSnapshot: 1000, lineTotal: null }) === 2000)
check('no lineTotal: less the order %, rounded', wineLineAmount({ quantity: 3, priceSnapshot: 1005, lineTotal: null }, 10) === 2714)

console.log('\n──────────────────────────────────────────────────')
console.log(`Results: ${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exitCode = 1
