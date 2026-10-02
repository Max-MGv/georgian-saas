/**
 * Resets the "Test Onboarding Wizard" tenant back to a fresh, unlaunched
 * state — the manual SQL `playwright/notes/10-onboarding-wizard.md` has
 * documented since the test was built, now a button instead of a query
 * someone has to go find and paste by hand before every full suite run.
 *
 * This tenant is a standing fixture, not reseeded from scratch: it was
 * already fully onboarded and launched when the test was first built, so
 * the reset clears exactly what the wizard itself can re-create, not the
 * tenant's baseline setup (theme, domain, the Individuals company row
 * itself). Mirrors `stagingWipe.ts`'s shape — wipe-only, no reseed — but a
 * different target and a different, narrower set of rows: this tenant
 * exists to be walked through the setup wizard repeatedly, not to hold
 * realistic booking/order data.
 *
 * SAFETY: resolves the tenant by slug ('test-onboarding-wizard') and refuses
 * anything else, so it cannot be aimed at a real winery even if called
 * against the wrong database.
 */
import type { PrismaClient } from '@prisma/client'

export const ONBOARDING_WIZARD_SLUG = 'test-onboarding-wizard'

const ONBOARDING_SETTING_KEYS = [
  'onboarding_launched_at', 'onboarding_works_with_companies',
  'onboarding_offers_food_addons', 'onboarding_offers_masterclasses',
  'contact_phone', 'contact_email', 'contact_address', 'maps_embed_url',
  'payment_iban', 'payment_bank_code', 'payment_bank_name',
  'payment_personal_number', 'payment_recipient_name',
]

export async function resetOnboardingWizardTenant(db: PrismaClient): Promise<{
  tenantId: string
  tenantName: string
  deleted: { prices: number; companies: number; wines: number; settings: number }
}> {
  const tenant = await db.tenant.findFirst({ where: { slug: ONBOARDING_WIZARD_SLUG } })
  if (!tenant) throw new Error(`No tenant with slug "${ONBOARDING_WIZARD_SLUG}" on this database.`)
  const tid = tenant.id

  // The auto-created "Individuals" company is a required row the wizard
  // depends on via `ensureIndividualsCompany` — kept, only its own price
  // tiers (set during the wizard's Individuals-pricing step) are cleared.
  const individuals = await db.company.findFirst({ where: { tenantId: tid, isIndividual: true } })
  if (!individuals) throw new Error(`Tenant "${ONBOARDING_WIZARD_SLUG}" has no Individuals company — refusing to reset.`)

  const before = await db.$transaction([
    db.price.count({ where: { companyId: individuals.id } }),
    db.company.count({ where: { tenantId: tid, isIndividual: false } }),
    db.wine.count({ where: { tenantId: tid } }),
    db.setting.count({ where: { tenantId: tid, key: { in: ONBOARDING_SETTING_KEYS } } }),
  ])

  await db.price.deleteMany({ where: { companyId: individuals.id } })
  await db.company.deleteMany({ where: { tenantId: tid, isIndividual: false } })
  await db.wine.deleteMany({ where: { tenantId: tid } })
  await db.setting.deleteMany({ where: { tenantId: tid, key: { in: ONBOARDING_SETTING_KEYS } } })

  return {
    tenantId: tid,
    tenantName: tenant.displayName ?? tenant.name,
    deleted: {
      prices: before[0],
      companies: before[1],
      wines: before[2],
      settings: before[3],
    },
  }
}
