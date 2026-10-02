'use server'

import { requireSuperAdmin } from '@/lib/requireSuperAdmin'
import { db } from '@/lib/db'
import { resetOnboardingWizardTenant, ONBOARDING_WIZARD_SLUG } from '@/lib/onboardingWizardReset'
import { revalidatePath } from 'next/cache'

/**
 * "Reset onboarding wizard tenant" — replaces the manual SQL
 * `playwright/notes/10-onboarding-wizard.md` has documented since the test
 * was built (Plan-PlaywrightSuiteHardening Chunk 6, 2026-10-02: Max asked
 * for a button after a session couldn't run the SQL directly). Same shape
 * as `clearStagingDataNow` — wipe-only, no reseed.
 *
 * Safety, in layers:
 *  - `requireSuperAdmin()` first, before anything is read or written.
 *  - `resetOnboardingWizardTenant` looks the tenant up by its own slug and
 *    refuses outright if it does not find it, so this cannot touch a real
 *    winery's data even if it were somehow called against the wrong
 *    database.
 *  - The button that calls it asks for confirmation, because this deletes
 *    rows with no undo.
 */
export async function resetOnboardingWizardNow(): Promise<
  | { ok: true; tenant: string; deleted: { prices: number; companies: number; wines: number; settings: number } }
  | { ok: false; error: string }
> {
  await requireSuperAdmin()

  try {
    const report = await resetOnboardingWizardTenant(db)
    revalidatePath('/super-admin/tenants')
    return { ok: true, tenant: report.tenantName, deleted: report.deleted }
  } catch (e) {
    // A missing onboarding-wizard tenant is the expected outcome on any
    // deployment that is not the dev database hosting it — reported, not thrown.
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Whether this database has the onboarding-wizard test tenant at all — decides if the card renders. */
export async function onboardingWizardTenantExists(): Promise<{ name: string } | null> {
  await requireSuperAdmin()
  const tenant = await db.tenant.findFirst({
    where: { slug: ONBOARDING_WIZARD_SLUG },
    select: { name: true, displayName: true },
  })
  if (!tenant) return null
  return { name: tenant.displayName ?? tenant.name }
}
