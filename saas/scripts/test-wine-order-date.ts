/**
 * Preferred-date rules (lib/wineOrderDate.ts, T-14 Chunk 7). Pure; no database.
 * Run: npx tsx scripts/test-wine-order-date.ts
 */
import { checkPreferredDate, earliestPreferredDate, wineLeadHours, formatPreferredDate } from '../lib/wineOrderDate'

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ✅  ${label}`) } else { failed++; console.log(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`) }
}
console.log('\n── preferred date rules ──\n')

const morning = new Date(2026, 9, 12, 9, 0)   // 12 Oct 2026, 09:00 local
const night = new Date(2026, 9, 12, 22, 0)    // 12 Oct 2026, 22:00 local
check('3h lead in the morning → today is the earliest', earliestPreferredDate(morning, 3) === '2026-10-12')
check('3h lead at 22:00 → tomorrow is the earliest', earliestPreferredDate(night, 3) === '2026-10-13')
check('48h lead → two days later', earliestPreferredDate(morning, 48) === '2026-10-14')

const rules = { leadHours: 3, blockedDates: ['2026-10-20'] }
check('Missing → "missing"', checkPreferredDate('', rules, morning) === 'missing')
check('Garbage → "invalid"', checkPreferredDate('12/10/2026', rules, morning) === 'invalid')
check('30 Feb → "invalid" (not rolled into March)', checkPreferredDate('2026-02-30', rules, morning) === 'invalid')
check('Yesterday → "too_soon"', checkPreferredDate('2026-10-11', rules, morning) === 'too_soon')
check('Today at 22:00 with 3h lead → "too_soon"', checkPreferredDate('2026-10-12', rules, night) === 'too_soon')
check('A Closed Day → "closed"', checkPreferredDate('2026-10-20', rules, morning) === 'closed')
check('An ordinary later day → fine', checkPreferredDate('2026-10-21', rules, morning) === null)

check('Lead time not split → the single value', wineLeadHours({ split: false, single: 3, tasting: 5, lunch: 6 }) === 3)
check('Lead time split → the shorter of the two', wineLeadHours({ split: true, single: 3, tasting: 5, lunch: 8 }) === 5)

// A @db.Date comes back as UTC midnight; the label must not slip a day in any timezone.
check('Formatting keeps the stored day', formatPreferredDate(new Date('2026-10-20T00:00:00Z'), 'en').startsWith('20 Oct'), formatPreferredDate(new Date('2026-10-20T00:00:00Z'), 'en'))

console.log('\n──────────────────────────────────────────────────')
console.log(`Results: ${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exitCode = 1
