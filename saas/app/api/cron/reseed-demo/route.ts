import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { seedDemoTenant } from '@/lib/demoSeed'

/**
 * Nightly regeneration of the Vineworks demo tenant (Plan-DemoRedesign task
 * 0.6 — the same job as Plan-DemoSite's "nightly reset", not a second one).
 *
 * `demo.vineworks.ge` is a sandbox anyone can write to: visitors book tastings,
 * place wine orders, and change statuses. Left alone, the curated demo degrades
 * into whatever strangers happened to click. This wipes and rebuilds it every
 * night. The generator is deterministic, so every reset restores the identical
 * demo and any screenshot taken of it stays accurate.
 *
 * Scheduled from vercel.json. Vercel sends CRON_SECRET as a bearer token on
 * scheduled invocations; the check below is what stops anyone on the internet
 * from triggering a wipe by hitting the URL. If CRON_SECRET is unset the route
 * refuses outright rather than defaulting to open — an unauthenticated endpoint
 * whose whole job is to delete rows is not something to fail open on.
 *
 * Deliberately does NOT use withTenantDb: seeding writes across several tenanted
 * tables as an operator, not as a request on behalf of a tenant, and the guard
 * that matters here is the slug check inside seedDemoTenant, which refuses to
 * touch anything that isn't the demo tenant.
 */

// Long enough for a few hundred sequential writes.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured; refusing to run' },
      { status: 503 },
    )
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  try {
    const report = await seedDemoTenant(db)
    console.log(
      `[reseed-demo] rebuilt ${report.tenantName}: ${report.created.bookings} bookings, `
      + `${report.created.wineOrders} wine orders in ${Date.now() - startedAt}ms`,
    )
    return NextResponse.json({
      ok: true,
      tenant: report.tenantName,
      created: report.created,
      totals: report.totals,
      elapsedMs: Date.now() - startedAt,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // A demo tenant missing from this database is the expected outcome on any
    // deployment that isn't the one hosting it — not an error worth alerting on.
    console.error('[reseed-demo] failed:', message)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
