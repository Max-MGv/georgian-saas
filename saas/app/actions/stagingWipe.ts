'use server'

import { requireSuperAdmin } from '@/lib/requireSuperAdmin'
import { db } from '@/lib/db'
import { wipeStagingTenant, STAGING_SLUG } from '@/lib/stagingWipe'
import { revalidatePath } from 'next/cache'

/**
 * "Clear staging data" — wipe-only counterpart to `resetDemoNow` in
 * demoReset.ts. No reseed: leaves the tenant empty for testing against a
 * clean setup (onboarding, empty states) instead of rebuilding fixtures.
 *
 * Safety, in layers:
 *  - `requireSuperAdmin()` first, before anything is read or written.
 *  - `wipeStagingTenant` looks the tenant up by the staging slug and refuses
 *    outright if it does not find it, so this cannot touch a real winery's
 *    data even if it were somehow called against the wrong database.
 *  - The button that calls it asks for confirmation, because this deletes
 *    rows with no undo.
 */
export async function clearStagingDataNow(): Promise<
  | { ok: true; tenant: string; deleted: { orders: number; wineOrders: number; companies: number; payments: number } }
  | { ok: false; error: string }
> {
  await requireSuperAdmin()

  try {
    const report = await wipeStagingTenant(db)
    revalidatePath('/super-admin/tenants')
    return { ok: true, tenant: report.tenantName, deleted: report.deleted }
  } catch (e) {
    // A staging tenant missing from this database is the expected outcome on
    // any deployment that is not the one hosting it — reported, not thrown.
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Whether this database has a staging tenant at all — decides if the card renders. */
export async function stagingTenantExists(): Promise<{ name: string } | null> {
  await requireSuperAdmin()
  const tenant = await db.tenant.findFirst({
    where: { slug: STAGING_SLUG },
    select: { name: true, displayName: true },
  })
  if (!tenant) return null
  return { name: tenant.displayName ?? tenant.name }
}
