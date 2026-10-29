/**
 * T-318 R2 (Chunk 2b, Q-12) — "Nothing to pay": the fourth payment state for a booking whose total is
 * set and is exactly 0 ₾.
 *
 * Throwaway bookings on the DEV database (deleted at the end) → needs --write; dry run without it.
 * Checks, against the real database (so Prisma's NULL handling is exercised, not assumed):
 *   - paymentStateOf: 0 ₾ unpaid → nothing; 0 ₾ already paid → paid (history is not rewritten);
 *     0 ₾ with an old invoice → nothing (not the chasing list); no price (NULL) → unpaid.
 *   - paymentFilterWhere: the four filters PARTITION the rows — every row in exactly one bucket, a
 *     NULL total in `unpaid` (not silently dropped by `<> 0`), a 0 ₾ row never in unpaid / invoiced.
 *   - the filter agrees with the pill (paymentStateOf) row for row.
 *
 * Run: npx tsx scripts/test-nothing-to-pay.ts --write
 */
import { db } from '../lib/db'
import { PAYMENT_FILTERS, paymentFilterWhere, paymentStateOf, type PaymentFilter } from '../lib/orderFilters'
import { seedStageColumns } from '../lib/statusWrite'

if (!process.argv.includes('--write')) {
  console.log('Dry run (no --write): would create 8 throwaway bookings on the DEV database, check the four')
  console.log('payment states and filters against them, then delete them. Add --write to run it.')
  process.exit(0)
}

const TENANT = 'cmrxb85wo0000vlc0d964nzf8' // Staging Winery (dev)
const PREFIX = 'zz-nil-' + Date.now()
const DAY = 86_400_000

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ok   ${label}`) }
  else { failed++; console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`) }
}

async function main() {
  const ids: string[] = []
  const mk = (tag: string, total: number | null, f: { paid?: boolean; invoiced?: boolean } = {}) =>
    db.order.create({
      data: {
        tenantId: TENANT, bookingType: 'INDIVIDUAL', visitType: 'TASTING', date: new Date('2030-08-01'), timeSlot: '12:00',
        guestCount: 2, name: 'ZZ', surname: `${PREFIX}-${tag}`, totalPrice: total,
        ...(f.paid ? { paidAt: new Date(Date.now() - 2 * DAY) } : {}),
        ...(f.invoiced ? { invoiceSentAt: new Date(Date.now() - 3 * DAY) } : {}),
        ...seedStageColumns('booking', 'CONFIRMED', new Date(Date.now() - 5 * DAY)),
      },
    }).then(o => { ids.push(o.id); return o })

  try {
    const expected: Record<string, PaymentFilter> = {
      'free-unpaid': 'nothing', 'free-paid-before': 'paid', 'free-old-invoice': 'nothing',
      'noprice-unpaid': 'unpaid', 'noprice-invoiced': 'invoiced',
      'real-unpaid': 'unpaid', 'real-invoiced': 'invoiced', 'real-paid': 'paid',
    }
    await mk('free-unpaid', 0)
    await mk('free-paid-before', 0, { paid: true })
    await mk('free-old-invoice', 0, { invoiced: true })
    await mk('noprice-unpaid', null)
    await mk('noprice-invoiced', null, { invoiced: true })
    await mk('real-unpaid', 15000)
    await mk('real-invoiced', 15000, { invoiced: true })
    await mk('real-paid', 15000, { paid: true })

    console.log('\nThe pill (paymentStateOf)\n')
    const rows = await db.order.findMany({ where: { tenantId: TENANT, surname: { startsWith: PREFIX } } })
    const tag = (r: { surname: string }) => r.surname.slice(PREFIX.length + 1)
    for (const r of rows) {
      const want = expected[tag(r)]
      check(`${tag(r)} → ${want}`, paymentStateOf(r) === want, `got ${paymentStateOf(r)}`)
    }

    console.log('\nThe filters (paymentFilterWhere) — same rows, through the database\n')
    const scope = { tenantId: TENANT, surname: { startsWith: PREFIX } }
    const bucket: Record<string, string[]> = {}
    for (const f of PAYMENT_FILTERS) {
      const hit = await db.order.findMany({ where: { ...scope, ...paymentFilterWhere(f) }, select: { surname: true } })
      bucket[f] = hit.map(r => tag(r))
    }
    const seen = PAYMENT_FILTERS.flatMap(f => bucket[f])
    check('every row lands in exactly one bucket (a partition)', seen.length === rows.length && new Set(seen).size === rows.length,
      JSON.stringify(bucket))
    for (const [t, want] of Object.entries(expected)) {
      check(`filter puts ${t} in "${want}"`, bucket[want]?.includes(t) === true, JSON.stringify(bucket))
    }
    check('a NULL total is in "unpaid" / "invoiced", not dropped by the 0 ₾ exclusion',
      bucket.unpaid.includes('noprice-unpaid') && bucket.invoiced.includes('noprice-invoiced'))
    check('no 0 ₾ row is ever in "unpaid" or "invoiced"',
      !bucket.unpaid.some(t => t.startsWith('free')) && !bucket.invoiced.some(t => t.startsWith('free')))
    check('an unrecognised filter value still matches everything', (await db.order.count({ where: { ...scope, ...paymentFilterWhere('bogus') } })) === rows.length)
  } finally {
    await db.order.deleteMany({ where: { id: { in: ids } } })
    const left = await db.order.count({ where: { surname: { startsWith: PREFIX } } })
    console.log(`\n(cleanup: ${ids.length} bookings removed; ${left} left behind)`)
  }
  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
