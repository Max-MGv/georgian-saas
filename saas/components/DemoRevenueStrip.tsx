import { adminT } from '@/lib/adminT'

/**
 * Three numbers above the bookings table, on the demo tenant only.
 *
 * Plan-DemoFlowFixes Chunk 7, task 7.3. "I run a winery" lands on
 * `/admin/orders`, and what a winery owner met there was a thirteen-column
 * table — the back office reading as data entry rather than as a business —
 * while the committed future revenue, the seasonal curve and the operator
 * ranking all sat two clicks away on Statistics.
 *
 * A server component: the numbers come from the page's own query, so this adds
 * no client JavaScript to a page that already ships plenty.
 *
 * Not gated internally on `DEMO_TENANT_ID` like the other demo components,
 * because it needs data the page must fetch anyway — so the page does the
 * gating and simply does not run the extra query for anyone else. That also
 * keeps the one `if` in the place it would have to be widened, if Max decides
 * every winery should get this.
 *
 * Styled on the tenant's own `--site-*` tokens rather than the demo chrome's
 * "cellar dark": this is not the platform talking about the tenant, it is part
 * of the winery's own back office, and it has to look native for the demo to
 * make its point.
 */

const C = {
  border: 'var(--site-border)',
  bg: 'var(--site-surface)',
  text: 'var(--site-text)',
  muted: 'var(--site-muted)',
  faint: 'var(--site-secondary)',
  wine: 'var(--color-brand)',
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function DemoRevenueStrip({
  count,
  revenue,
  nextDate,
  locale = 'en',
}: {
  count: number
  revenue: number
  nextDate: Date | null
  locale?: string
}) {
  const at = (key: string) => adminT(locale, key)

  // 'en-US' explicitly, never the runtime default: the server is UTC/en-US and
  // a Georgian browser is not, which is exactly the hydration mismatch Chunk 2
  // had to chase down (React #418). Same reason StatisticsV2 pins it.
  const revenueLabel = `${revenue.toLocaleString('en-US')}₾`
  const nextLabel = nextDate
    ? `${nextDate.getDate()} ${MONTHS[nextDate.getMonth()]}`
    : '—'

  const cells: { label: string; value: string; sub: string }[] = [
    {
      label: at('statistics.card.upcomingOrders'),
      value: String(count),
      sub: count === 1 ? at('orders.booking.singular') : at('orders.booking.plural'),
    },
    {
      label: at('statistics.card.futureRevenue'),
      value: revenueLabel,
      // No sub-label: "Future revenue" already says it, and every extra word
      // here competes with the number, which is the whole point of the strip.
      sub: '',
    },
    {
      label: at('statistics.card.nextOrder'),
      value: nextLabel,
      sub: nextDate ? '' : at('statistics.noUpcomingOrders'),
    },
  ]

  return (
    <div
      className="rounded-xl border mb-4 grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x"
      style={{ borderColor: C.border, backgroundColor: C.bg, borderStyle: 'solid' }}
    >
      {cells.map(cell => (
        <div key={cell.label} className="px-5 py-3" style={{ borderColor: C.border }}>
          <p className="text-xs font-medium" style={{ color: C.muted }}>{cell.label}</p>
          <p className="text-xl font-bold leading-tight mt-0.5" style={{ color: C.wine }}>{cell.value}</p>
          {cell.sub && <p className="text-xs mt-0.5" style={{ color: C.faint }}>{cell.sub}</p>}
        </div>
      ))}
    </div>
  )
}
