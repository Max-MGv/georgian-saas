'use server'

/**
 * Onboarding wizard (#127) — first slice, Companies step only.
 *
 * Deliberately has no dedicated schema/table. The qualifying-question answer
 * is a plain Setting row (reuses updateSetting/getSetting, same as every other
 * tenant toggle) and step completeness is computed live from that answer +
 * current Company rows — never stored as a frozen "done" flag, so toggling
 * anything later can't leave a stale state. See vault/Plan-OnboardingFlow.md.
 */

import { headers } from 'next/headers'
import { db, withTenantDb } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import { requireAdmin } from '@/lib/requireAdmin'
import { getSetting, updateSetting } from './settings'
import { createCompany, deleteCompany } from './companies'
import { createPrice, setDisplayPrice } from './prices'
import { createWine, createVintage, deleteWine } from './wines'
import type { WineType, Sweetness } from '@prisma/client'

export type OnboardingStatus = {
  worksWithCompanies: 'yes' | 'no' | null
  companyCount: number
  companiesStepDone: boolean
  individualsPricingSet: boolean
  wineOrdersModuleOn: boolean
  wineStepDone: boolean
  enhancedBookingOn: boolean
  offersFoodAddons: 'yes' | 'no' | null
  offersMasterclasses: 'yes' | 'no' | null
  menuItemCount: number
  masterclassItemCount: number
  bookingDetailsStepDone: boolean
  paymentIbanSet: boolean
  paymentInfoStepDone: boolean
  contactInfoStepDone: boolean
  mapsEmbedSet: boolean
  contentPhotosStepDone: boolean
  readyToLaunch: boolean
  launched: boolean
  launchedAt: string | null
  stepDone: boolean
}

export async function getOnboardingStatus(): Promise<OnboardingStatus> {
  const tenantId = await getTenantId()
  const h = await headers()
  const wineOrdersModuleOn = h.get('x-tenant-modules-wine-orders') === 'true'

  const [
    raw, companyCount, individualsPriceCount, wineCount,
    enhancedBookingRaw, offersFoodRaw, offersMasterclassRaw, menuItemCount, masterclassItemCount,
    paymentIban, contactPhone, contactEmail, contactAddress, mapsEmbedUrl,
    tenant, heroBg, launchedAt,
  ] = await Promise.all([
    getSetting('onboarding_works_with_companies'),
    withTenantDb(tenantId, tx => tx.company.count({ where: { tenantId, isIndividual: false } })),
    withTenantDb(tenantId, tx => tx.price.count({ where: { company: { tenantId, isIndividual: true } } })),
    // A wine with zero vintages has no price and can't actually be ordered —
    // mirrors companiesStepDone's own "the question was answered isn't enough,
    // a real record must exist" shape.
    withTenantDb(tenantId, tx => tx.wine.count({ where: { tenantId, vintages: { some: {} } } })),
    getSetting('enable_enhanced_company_booking'),
    getSetting('onboarding_offers_food_addons'),
    getSetting('onboarding_offers_masterclasses'),
    withTenantDb(tenantId, tx => tx.menuItem.count({ where: { tenantId } })),
    withTenantDb(tenantId, tx => tx.masterclassItem.count({ where: { tenantId } })),
    getSetting('payment_iban'),
    // Contact fields now read from the same Setting store SettingsClient.tsx and
    // the public footer/invoice email use — see saveOnboardingContactInfo below
    // for why this moved off SiteContent.
    getSetting('contact_phone'),
    getSetting('contact_email'),
    getSetting('contact_address'),
    getSetting('maps_embed_url'),
    db.tenant.findUnique({ where: { id: tenantId }, select: { logoUrl: true } }),
    getSetting('home_hero_bg_path'),
    getSetting('onboarding_launched_at'),
  ])

  const worksWithCompanies = raw === 'yes' ? 'yes' : raw === 'no' ? 'no' : null
  const companiesStepDone = worksWithCompanies === 'no' || (worksWithCompanies === 'yes' && companyCount > 0)
  const individualsPricingSet = individualsPriceCount > 0
  const wineStepDone = !wineOrdersModuleOn || wineCount > 0

  const enhancedBookingOn = enhancedBookingRaw === 'true'
  const offersFoodAddons = offersFoodRaw === 'yes' ? 'yes' : offersFoodRaw === 'no' ? 'no' : null
  const offersMasterclasses = offersMasterclassRaw === 'yes' ? 'yes' : offersMasterclassRaw === 'no' ? 'no' : null
  // Each category is done independently once answered "no" or backed by a real
  // item — mirrors companiesStepDone's own rule. The step as a whole is skipped
  // entirely (counts as done) for tenants without the enhanced-booking setting on.
  const foodAddonsDone = offersFoodAddons === 'no' || (offersFoodAddons === 'yes' && menuItemCount > 0)
  const masterclassesDone = offersMasterclasses === 'no' || (offersMasterclasses === 'yes' && masterclassItemCount > 0)
  const bookingDetailsStepDone = !enhancedBookingOn || (foodAddonsDone && masterclassesDone)

  // Only the IBAN gates the step/readyToLaunch — it's the one field that makes a
  // bank transfer actually possible. The other four matter for a complete invoice
  // but are tracked separately (see getFinishDetailsStatus's paymentPartial).
  const paymentIbanSet = Boolean(paymentIban)
  const paymentInfoStepDone = paymentIbanSet

  const contactInfoStepDone = Boolean(contactPhone || contactEmail || contactAddress)
  const mapsEmbedSet = Boolean(mapsEmbedUrl)
  const contentPhotosStepDone = Boolean(tenant?.logoUrl || heroBg)
  const readyToLaunch = companiesStepDone && individualsPricingSet && wineStepDone && paymentInfoStepDone

  return {
    worksWithCompanies,
    companyCount,
    companiesStepDone,
    individualsPricingSet,
    wineOrdersModuleOn,
    wineStepDone,
    enhancedBookingOn,
    offersFoodAddons,
    offersMasterclasses,
    menuItemCount,
    masterclassItemCount,
    bookingDetailsStepDone,
    paymentIbanSet,
    paymentInfoStepDone,
    contactInfoStepDone,
    mapsEmbedSet,
    contentPhotosStepDone,
    readyToLaunch,
    launched: Boolean(launchedAt),
    launchedAt: launchedAt || null,
    // Extends the step-1-only meaning this had before the wine step existed —
    // OnboardingBanner.tsx needs no changes, it already just reads this field.
    stepDone: readyToLaunch,
  }
}

// Wizard's wine step deliberately never shows a color/sparkling field (see
// vault/Plan-OnboardingFlow.md — these stay deferred to the real Wines page,
// per the plan's original minimal-field table). createWine() still requires
// values for both, so this derives a sensible color from the chosen type
// rather than always sending the brand color regardless of it.
const TYPE_DEFAULT_COLOR: Record<WineType, string> = {
  RED: '#7c1d23',
  WHITE: '#e8d9a0',
  AMBER: '#c97f2b',
  ROSE: '#e8a0ab',
}

/**
 * Wizard's wine creation, one step atomic with its first vintage — mirrors
 * createOnboardingCompany's atomic-with-rollback shape. wineType/sweetness
 * are omitted entirely in VINTAGE-mode tenants (the wizard doesn't ask, per
 * #146's "no guessed data" rule for per-vintage characteristics) — they
 * silently fall back to the schema defaults, which is fine since VINTAGE-mode
 * display never reads the wine-level values anyway.
 */
export async function createOnboardingWine(
  wine: { name: string; wineType?: WineType; sweetness?: Sweetness },
  vintage: { year: number; price: number }
) {
  await requireAdmin()
  const wineType = wine.wineType ?? 'RED'
  const created = await createWine({
    name: wine.name,
    wineType,
    sweetness: wine.sweetness ?? 'DRY',
    sparkling: false,
    color: TYPE_DEFAULT_COLOR[wineType],
  })
  const vintageResult = await createVintage(created.wine.id, vintage)
  if (vintageResult && 'error' in vintageResult) {
    await deleteWine(created.wine.id)
    return { error: vintageResult.error ?? 'Could not add a vintage for this wine.' }
  }
  return { success: true as const, wine: created.wine }
}

export type FinishDetailsStatus = {
  paymentPartial: boolean
  companiesNeedingDetails: number
  winesNeedingDetails: number
  bookingDetailsIncomplete: boolean
  contactInfoStepDone: boolean
  mapsEmbedSet: boolean
  contentPhotosStepDone: boolean
  hasOutstandingItems: boolean
  readyToLaunch: boolean
}

/**
 * Post-launch "finish full details" nudge (#127 Phase 3) — separate from
 * getOnboardingStatus() on purpose. This runs heavier per-record queries
 * (every Company and Wine row, plus vintages) that have no business running
 * on every wizard-step load, and it only means anything once readyToLaunch
 * is already true (the wizard's own banner owns the pre-launch nudge).
 *
 * Restructured (7-step wizard) from the old dual-dimension (companies × wines)
 * combinatorial body-text approach to a flat set of independent conditions.
 * FinishDetailsBanner.tsx picks the single highest-priority one to surface —
 * this function just reports what's true, it doesn't decide what to say.
 */
export async function getFinishDetailsStatus(): Promise<FinishDetailsStatus> {
  const onboarding = await getOnboardingStatus()
  const {
    readyToLaunch, contactInfoStepDone, mapsEmbedSet, contentPhotosStepDone,
    paymentIbanSet, enhancedBookingOn, offersFoodAddons, offersMasterclasses,
    menuItemCount, masterclassItemCount,
  } = onboarding

  if (!readyToLaunch) {
    return {
      paymentPartial: false,
      companiesNeedingDetails: 0,
      winesNeedingDetails: 0,
      bookingDetailsIncomplete: false,
      contactInfoStepDone,
      mapsEmbedSet,
      contentPhotosStepDone,
      hasOutstandingItems: false,
      readyToLaunch,
    }
  }

  const tenantId = await getTenantId()

  const [companies, tenant, wines, recipientName, personalNumber, bankName, bankCode] = await Promise.all([
    withTenantDb(tenantId, tx => tx.company.findMany({
      where: { tenantId, isIndividual: false },
      select: {
        identificationCode: true,
        contactName: true,
        contactPhone: true,
        contactEmail: true,
        address: true,
        isBookingCompany: true,
        prices: { select: { id: true } },
      },
    })),
    // Same documented exception as logoUrl above — wineDetailLevel is a
    // tenant-level setting, not tenant-scoped data, so it's read directly.
    db.tenant.findUnique({ where: { id: tenantId }, select: { wineDetailLevel: true } }),
    withTenantDb(tenantId, tx => tx.wine.findMany({
      where: { tenantId },
      select: {
        nameKa: true,
        description: true,
        imagePath: true,
        vintages: { select: { wineType: true, sweetness: true, sparkling: true, alcoholLevel: true } },
      },
    })),
    getSetting('payment_recipient_name'),
    getSetting('payment_personal_number'),
    getSetting('payment_bank_name'),
    getSetting('payment_bank_code'),
  ])

  // Pricing only counts against a company if it's actually a booking company —
  // wine-order-only companies never use price tiers, so this would otherwise
  // false-positive on every one of them. Same rule as CompaniesClient.tsx's
  // missingDetails() — keep both in sync if this changes.
  const companiesNeedingDetails = companies.filter(c =>
    c.identificationCode === null
    || (c.contactName === null && c.contactPhone === null && c.contactEmail === null && c.address === null)
    || (c.isBookingCompany && c.prices.length === 0)
  ).length

  const vintageDetailMode = tenant?.wineDetailLevel === 'VINTAGE'
  const winesNeedingDetails = wines.filter(w =>
    w.nameKa === null
    || w.description === null
    || w.imagePath === null
    || (vintageDetailMode && w.vintages.some(v =>
      v.wineType === null && v.sweetness === null && v.sparkling === null && v.alcoholLevel === null
    ))
  ).length

  // IBAN alone makes a transfer possible (see paymentInfoStepDone above), but an
  // invoice with a blank recipient/bank name still looks unfinished to a guest.
  const paymentPartial = paymentIbanSet && (!recipientName || !personalNumber || !bankName || !bankCode)

  const bookingDetailsIncomplete = enhancedBookingOn && (
    (offersFoodAddons === 'yes' && menuItemCount === 0)
    || (offersMasterclasses === 'yes' && masterclassItemCount === 0)
  )

  const hasOutstandingItems = paymentPartial
    || companiesNeedingDetails > 0
    || winesNeedingDetails > 0
    || bookingDetailsIncomplete
    || !contactInfoStepDone
    || !mapsEmbedSet
    || !contentPhotosStepDone

  return {
    paymentPartial,
    companiesNeedingDetails,
    winesNeedingDetails,
    bookingDetailsIncomplete,
    contactInfoStepDone,
    mapsEmbedSet,
    contentPhotosStepDone,
    hasOutstandingItems,
    readyToLaunch,
  }
}

/**
 * Contact info step — phone/email/address write to the same Setting keys
 * SettingsClient.tsx edits (contact_phone/contact_email/contact_address), which
 * is what actually feeds the site-wide footer/nav and the invoice email's return
 * address. Previously wrote to the SiteContent table instead (saveContent), which
 * only ever fed the public /contact page — a brand-new tenant filling this step in
 * would see it "saved" here while Settings and invoices stayed blank. No backfill
 * needed: real tenants already have this set via normal Settings usage, so only
 * brand-new tenants ever hit the old bug, and this fix is exactly what closes it
 * going forward.
 */
export async function saveOnboardingContactInfo(field: 'phone' | 'email' | 'address', value: string) {
  await requireAdmin()
  const map = {
    phone: 'contact_phone',
    email: 'contact_email',
    address: 'contact_address',
  } as const
  return updateSetting(map[field], value)
}

export async function setOffersFoodAddons(value: 'yes' | 'no') {
  await requireAdmin()
  await updateSetting('onboarding_offers_food_addons', value)
  return { success: true }
}

export async function setOffersMasterclasses(value: 'yes' | 'no') {
  await requireAdmin()
  await updateSetting('onboarding_offers_masterclasses', value)
  return { success: true }
}

/**
 * Review step's Launch action. Purely a record of the moment, not a gate —
 * the app is fully functional throughout regardless (the wizard has always
 * been skippable), and readyToLaunch above stays 100% live-computed either
 * way. Nothing reads this value to restrict access.
 */
export async function launchTenant() {
  await requireAdmin()
  const iso = new Date().toISOString()
  await updateSetting('onboarding_launched_at', iso)
  return { success: true as const, launchedAt: iso }
}

export async function setWorksWithCompanies(value: 'yes' | 'no') {
  await requireAdmin()
  await updateSetting('onboarding_works_with_companies', value)
  return { success: true }
}

export type OnboardingTier = {
  minGuests: number
  maxGuests: number
  pricePerPerson: number
  tastingLunchPricePerPerson: number
  registrationPrice: number
}

/**
 * Wizard's Company creation, one step atomic with a starting price tier.
 *
 * createCompany() alone (the plain admin-page path) leaves a company with
 * zero Price rows — createBooking.ts then silently bills that company's
 * guests at the tenant's Individuals/walk-in rate instead of erroring or
 * asking, which is exactly the "wrong pricing charged, nobody notices"
 * failure Max flagged reviewing this wizard. So the wizard never creates a
 * company without at least one tier. Takes a full tier object rather than
 * just a number so both the wizard's Simple mode (one flat rate, built into
 * a 1–999-guest tier client-side) and Detailed mode (the real tier fields —
 * same shape as the Companies page's own PriceForm) share this one path
 * instead of two. If the price write fails, the company is deleted again
 * rather than left behind unpriced.
 */
export async function createOnboardingCompany(
  name: string,
  tier: OnboardingTier,
  modules: { isBookingCompany: boolean; isWineOrderCompany: boolean }
) {
  await requireAdmin()
  const companyResult = await createCompany(name, modules)
  if ('error' in companyResult) return companyResult

  const priceResult = await createPrice({ companyId: companyResult.company.id, ...tier })
  if ('error' in priceResult) {
    await deleteCompany(companyResult.company.id)
    return { error: priceResult.error ?? 'Could not set pricing for this company.' }
  }

  return { success: true as const, company: companyResult.company }
}

/**
 * Wizard's Individuals/walk-in pricing — unconditional, asked regardless of
 * how the companies question is answered (Max: a tenant that says "no
 * companies" still needs its default rate set, and one that says "yes" still
 * takes individual bookings too). Reuses the tenant's existing Individuals
 * company (the same synthetic row the real Companies page's "Public pricing"
 * card edits) rather than creating a second concept of "default price".
 *
 * The very first tier ever added here is also marked the display price —
 * without that, #125's neutral-fallback behavior means the public site would
 * still show no price at all even after the wizard "sets" one, since display
 * price is a separate manual toggle on the real Companies page today.
 */
export async function addIndividualsPriceTier(tier: OnboardingTier) {
  await requireAdmin()
  const tenantId = await getTenantId()
  const individuals = await withTenantDb(tenantId, tx =>
    tx.company.findFirst({ where: { tenantId, isIndividual: true } })
  )
  if (!individuals) return { error: 'Individuals pricing record not found for this tenant.' }

  const hadNoTiersBefore = (await withTenantDb(tenantId, tx =>
    tx.price.count({ where: { companyId: individuals.id } })
  )) === 0

  const priceResult = await createPrice({ companyId: individuals.id, ...tier })
  if ('error' in priceResult) return priceResult

  if (hadNoTiersBefore) {
    const created = await withTenantDb(tenantId, tx =>
      tx.price.findFirst({ where: { companyId: individuals.id } })
    )
    if (created) await setDisplayPrice(created.id)
  }

  return { success: true as const }
}
