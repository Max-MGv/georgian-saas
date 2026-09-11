'use server'

import { requireSuperAdmin } from '@/lib/requireSuperAdmin'
import { db } from '@/lib/db'
import { seedDemoTenant, DEMO_SLUG } from '@/lib/demoSeed'
import { revalidatePath } from 'next/cache'

/**
 * "Reset demo now" — Max's request, Plan-DemoFlowFixes Chunk 8 task 8.2.
 *
 * The demo already rebuilds itself at 03:00 UTC (`/api/cron/reseed-demo`). This
 * is the same rebuild on demand, so Max can clear a morning's worth of visitor
 * clicks in the minute before a sales call instead of waiting for the cron.
 *
 * It calls `seedDemoTenant` — the *same* function the cron calls, not a second
 * implementation — so the two can never drift apart, and the onboarding reset
 * added in 8.1 comes along for free.
 *
 * Safety, in layers:
 *  - `requireSuperAdmin()` first, before anything is read or written.
 *  - `seedDemoTenant` looks the tenant up by the demo slug and refuses outright
 *    if it does not find it, so this cannot touch a real winery's data even if
 *    it were somehow called against the wrong database.
 *  - The button that calls it asks for confirmation, because this deletes and
 *    rebuilds rows.
 *
 * Deliberately does NOT use withTenantDb, for the same reason the cron route
 * does not: seeding writes across several tenanted tables as an operator, not
 * as a request on behalf of a tenant.
 */
export async function resetDemoNow(): Promise<
  | { ok: true; tenant: string; created: { bookings: number; wineOrders: number }; totals: { bookings: number; revenue: number }; elapsedMs: number }
  | { ok: false; error: string }
> {
  await requireSuperAdmin()

  const startedAt = Date.now()
  try {
    const report = await seedDemoTenant(db)
    // The demo's admin pages are force-dynamic, but the super-admin tenant list
    // shows counts that are now stale.
    revalidatePath('/super-admin/tenants')
    return {
      ok: true,
      tenant: report.tenantName,
      created: { bookings: report.created.bookings, wineOrders: report.created.wineOrders },
      totals: { bookings: report.totals.bookings, revenue: report.totals.revenue },
      elapsedMs: Date.now() - startedAt,
    }
  } catch (e) {
    // A demo tenant missing from this database is the expected outcome on any
    // deployment that is not the one hosting it — reported, not thrown, so the
    // button can say so plainly.
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Whether this database has a demo tenant at all — decides if the card renders. */
export async function demoTenantExists(): Promise<{ name: string } | null> {
  await requireSuperAdmin()
  const tenant = await db.tenant.findFirst({
    where: { slug: DEMO_SLUG },
    select: { name: true, displayName: true },
  })
  if (!tenant) return null
  return { name: tenant.displayName ?? tenant.name }
}
