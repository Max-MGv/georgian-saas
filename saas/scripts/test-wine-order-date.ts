/**
 * Preferred-date rules (lib/wineOrderDate.ts, T-14 Chunk 7). Pure; no database.
 * Run: npx tsx scripts/test-wine-order-date.ts
 */
import { checkPreferredDate, earliestPreferredDate, wineLeadHours, formatPreferredDate } from '../lib/wineOrderDate'
import { minBookableInstant, slotMeetsLeadTime } from '../lib/bookingHours'
import { tbilisiDateIso, tbilisiInstant } from '../lib/tbilisiTime'

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ✅  ${label}`) } else { failed++; console.log(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`) }
}
console.log('\n── preferred date rules ──\n')

// Instants written in Georgian time explicitly, so the script means the same thing whatever the
// machine's own clock is — run it with TZ=UTC as well, which is what Vercel uses (KnownBugs #79).
const morning = new Date('2026-10-12T09:00:00+04:00')   // 12 Oct 2026, 09:00 in Tbilisi
const night = new Date('2026-10-12T22:00:00+04:00')     // 12 Oct 2026, 22:00 in Tbilisi
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

// Georgian time, not the runtime's (KnownBugs #79).
console.log(`\n  (this process's own time zone offset: ${-new Date().getTimezoneOffset() / 60} h)\n`)
const earlyMorning = new Date('2026-10-13T02:00:00+04:00') // = 22:00 UTC on 12 Oct
check("02:00 in Tbilisi is already the 13th, whatever the server's clock says",
  tbilisiDateIso(earlyMorning) === '2026-10-13', tbilisiDateIso(earlyMorning))
check('…so with no lead time the 12th is refused as "too soon"',
  checkPreferredDate('2026-10-12', { leadHours: 0, blockedDates: [] }, earlyMorning) === 'too_soon')
check('…and the 13th is the earliest day', earliestPreferredDate(earlyMorning, 0) === '2026-10-13')
check('13:00 in Tbilisi is 09:00 UTC', tbilisiInstant(2026, 10, 13, 13).toISOString() === '2026-10-13T09:00:00.000Z',
  tbilisiInstant(2026, 10, 13, 13).toISOString())
const noon = new Date('2026-10-13T12:00:00+04:00')
const min3h = minBookableInstant(noon, 3) // 15:00 Tbilisi
check('Booking at noon with a 3 h lead: the 13:00 slot is refused', slotMeetsLeadTime('2026-10-13', '13:00', min3h) === false)
check('…and the 15:00 slot is allowed', slotMeetsLeadTime('2026-10-13', '15:00', min3h) === true)
check('…and 14:00 is still refused (on a UTC server it used to pass)', slotMeetsLeadTime('2026-10-13', '14:00', min3h) === false)

console.log('\n──────────────────────────────────────────────────')
console.log(`Results: ${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exitCode = 1
