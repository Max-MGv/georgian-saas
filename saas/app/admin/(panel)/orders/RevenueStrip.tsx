import { adminT } from '@/lib/adminT'

/**
 * Three numbers above the bookings table: upcoming bookings, the revenue those
 * bookings represent, and when the next one is.
 *
 * ── History, because it changes how this should be read ──
 * Built demo-only in Plan-DemoFlowFixes Chunk 7 task 7.3, to fix a sales
 * problem: "I run a winery" landed on a thirteen-column table, so the first
 * impression of the back office was data entry rather than a business, while
 * the committed future revenue sat two clicks away on Statistics. Max then
 * asked for it on every winery's site (2026-09-11), which is the version this
 * is. The task had always said the every-winery answer needed its own design
 * pass rather than a widened `if`; the three decisions below are that pass.
 *
 * **1. It hides itself for a winery with no bookings at all.** A brand-new
 * tenant opening the back office on day one should not be met by a row of
 * zeros — that is discouraging and says nothing. The strip appears with their
 * first booking. A winery that *has* traded but has nothing upcoming (out of
 * season, say) still gets it, showing 0 and "No upcoming orders", because
 * there the zero is real information rather than an empty state.
 *
 * **2. The numbers ignore the page's filters.** They are the whole business,
 * not the current view — a strip that moved every time someone filtered by
 * company would be a second, quieter set of totals competing with the one the
 * table already prints at its foot. Same definition Statistics uses
 * (upcoming = date >= today, cancelled excluded), so the two screens cannot
 * disagree.
 *
 * **3. Centred**, per Max. Three equal cells, so nothing is the "main" one.
 *
 * A server component: the page already has to fetch this, so the strip adds no
 * client JavaScript to a page that ships plenty.
 */

const C = {
  border: 'var(--site-border)',
  bg: 'var(--site-surface)',
  muted: 'var(--site-muted)',
  faint: 'var(--site-secondary)',
  wine: 'var(--color-brand)',
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export type RevenueStripData = {
  /** Upcoming bookings, all companies, ignoring the page's filters. */
  count: number
  /** Their combined total, rounded. */
  revenue: number
  /** The soonest upcoming booking's date, or null if there are none. */
  nextDate: Date | null
}

export default function RevenueStrip({
  count,
  revenue,
  nextDate,
  locale = 'en',
}: RevenueStripData & { locale?: string }) {
  const at = (key: string) => adminT(locale, key)

  // 'en-US' explicitly, never the runtime default: the server is UTC/en-US and
  // a Georgian browser is not, which is exactly the hydration text mismatch
  // Chunk 2 had to chase down (React #418). StatisticsV2 pins it for the same
  // reason — if one of these is ever changed, change both.
  const cells: { label: string; value: string; sub: string }[] = [
    {
      label: at('statistics.card.upcomingOrders'),
      value: String(count),
      sub: count === 1 ? at('orders.booking.singular') : at('orders.booking.plural'),
    },
    {
      label: at('statistics.card.futureRevenue'),
      value: `${revenue.toLocaleString('en-US')}₾`,
      // No sub-label: "Future revenue" already says it, and any extra word here
      // competes with the number, which is the whole point of the strip.
      sub: '',
    },
    {
      label: at('statistics.card.nextOrder'),
      value: nextDate ? `${nextDate.getDate()} ${MONTHS[nextDate.getMonth()]}` : '—',
      sub: nextDate ? '' : at('statistics.noUpcomingOrders'),
    },
  ]

  return (
    <div
      className="rounded-xl border mb-4 grid sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x"
      style={{ borderColor: C.border, backgroundColor: C.bg, borderStyle: 'solid' }}
    >
      {cells.map(cell => (
        <div key={cell.label} className="px-5 py-3 text-center" style={{ borderColor: C.border }}>
          <p className="text-xs font-medium" style={{ color: C.muted }}>{cell.label}</p>
          <p className="text-xl font-bold leading-tight mt-0.5" style={{ color: C.wine }}>{cell.value}</p>
          {/* Reserved even when empty, so the three cells stay the same height
              and the numbers sit on one line however the subs land. */}
          <p className="text-xs mt-0.5" style={{ color: C.faint, minHeight: '1rem' }}>{cell.sub}</p>
        </div>
      ))}
    </div>
  )
}
