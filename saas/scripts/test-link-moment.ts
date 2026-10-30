/**
 * T-318 Chunk 5 — the "valid until" moment shown in the Card popup: Tbilisi time (UTC+4) whatever zone the
 * browser is in, Georgian month names that do not depend on the browser's locale data. Pure, no database.
 *
 * Run: npx tsx scripts/test-link-moment.ts
 */
import { formatLinkDay, formatLinkMoment } from '../lib/formatLinkMoment'

let passed = 0
let failed = 0
function check(label: string, got: string, want: string) {
  if (got === want) { passed++; console.log(`  ok   ${label}`) }
  else { failed++; console.log(`  FAIL ${label} — got "${got}", want "${want}"`) }
}

check('EN: 10:30 UTC is 14:30 in Tbilisi', formatLinkMoment('2026-11-05T10:30:00Z', 'en'), '5 Nov 2026, 14:30')
check('KA: same instant, Georgian month', formatLinkMoment('2026-11-05T10:30:00Z', 'ka'), '5 ნოე 2026, 14:30')
check('the Tbilisi day can be the next UTC day (and year)', formatLinkMoment('2026-12-31T20:05:00Z', 'en'), '1 Jan 2027, 00:05')
check('short day, EN', formatLinkDay('2026-11-05T10:30:00Z', 'en'), '5 Nov')
check('short day, KA', formatLinkDay('2026-11-05T10:30:00Z', 'ka'), '5 ნოე')
check('single-digit hour keeps its zero', formatLinkMoment('2026-03-01T01:07:00Z', 'en'), '1 Mar 2026, 05:07')

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
