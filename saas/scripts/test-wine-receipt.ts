/**
 * The wine receipt's money lines (lib/emails/templates/wineOrderReceiptTemplate.ts). Pure; no database.
 * "Paid" is what was actually paid (a delivery-fee top-up re-sends the receipt), and the discount
 * is shown as the amount taken off — with negotiated prices the % only touches the other wines.
 * Run: npx tsx scripts/test-wine-receipt.ts
 */
import { renderWineOrderReceiptEmail, type WineOrderReceiptData } from '../lib/emails/templates/wineOrderReceiptTemplate'

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ✅  ${label}`) } else { failed++; console.log(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`) }
}
// The text of the cell right after a label cell, e.g. "Paid" → "115.00 ₾".
function cell(html: string, label: string): string | null {
  const m = html.match(new RegExp('>' + label.replace(/[()]/g, '\\$&') + '</td>\\s*<td[^>]*>([^<]*)</td>'))
  return m ? m[1]!.replace(/\s+/g, ' ').trim() : null
}
const num = (s: string | null) => (s ? Number(s.replace(/[^\d.]/g, '')) : NaN)
console.log('\n── wine receipt ──\n')

const base: WineOrderReceiptData = {
  contactName: 'ZZ', businessName: 'ZZ Bar',
  lines: [{ name: 'Saperavi', year: 2022, quantity: 2, price: 5000 }], // 100₾ of wine
  totalAmount: 10000,
  delivery: { fulfilment: 'DELIVERY', zoneName: 'Tbilisi', fee: 1500, pending: false },
}

// Before the fix's field existed: Paid = wines + fee, unchanged behaviour.
let h = renderWineOrderReceiptEmail(base).html
check('No paidAmount → Paid = wines + fee (115₾)', num(cell(h, 'Paid')) === 115, String(cell(h, 'Paid')))
check('…and no "Still to pay" line', cell(h, 'Still to pay') === null)

// Wine paid by card (110 = 100 + old 10₾ fee), fee then raised to 15 and the 5₾ top-up paid.
h = renderWineOrderReceiptEmail({ ...base, paidAmount: 11500 }).html
check('Top-up settled: Paid = what was really paid in total (115₾)', num(cell(h, 'Paid')) === 115)

// A partial top-up: 60₾ paid of 115₾ — must not claim the whole order.
h = renderWineOrderReceiptEmail({ ...base, paidAmount: 6000 }).html
check('Partial payment: Paid 60₾, not 115₾', num(cell(h, 'Paid')) === 60, String(cell(h, 'Paid')))
check('…and Still to pay 55₾', num(cell(h, 'Still to pay')) === 55, String(cell(h, 'Still to pay')))

// Negotiated line (40₾ × 2, no %) + standard line (50₾ × 2 less 10% = 90₾) → total 170₾, 10₾ off.
h = renderWineOrderReceiptEmail({
  ...base,
  lines: [{ name: 'Saperavi', year: 2022, quantity: 2, price: 4000 }, { name: 'Rkatsiteli', year: 2023, quantity: 2, price: 5000 }],
  totalAmount: 17000, discountPercent: 10, delivery: undefined, paidAmount: 17000,
}).html
check('Mixed negotiated + standard: discount shown as the 10₾ actually taken off', num(cell(h, 'Discount (10%)')) === 10, String(cell(h, 'Discount (10%)')))

// A discount that touched nothing (every line negotiated) shows no discount line at all.
h = renderWineOrderReceiptEmail({ ...base, totalAmount: 10000, discountPercent: 10 }).html
check('A % that took nothing off → no discount line', cell(h, 'Discount (10%)') === null)

console.log('\n──────────────────────────────────────────────────')
console.log(`Results: ${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exitCode = 1
