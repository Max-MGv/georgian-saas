'use server'

import { db, withTenantDb, type TxClient } from '@/lib/db'
import type { TierPrices } from '@/lib/pricingUtils'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'
import type { Tetri } from '@/lib/money'

async function validateTier(
  tx: TxClient,
  companyId: string,
  minGuests: number,
  maxGuests: number,
  excludeId?: string,
): Promise<string | null> {
  if (minGuests > maxGuests) return 'Min guests cannot exceed max guests.'
  if (minGuests < 1) return 'Min guests must be at least 1.'
  if (maxGuests < 1) return 'Max guests must be at least 1.'
  const overlap = await tx.price.findFirst({
    where: {
      companyId,
      minGuests: { lte: maxGuests },
      maxGuests: { gte: minGuests },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  })
  if (overlap) return `Overlaps with existing tier (${overlap.minGuests}–${overlap.maxGuests} guests).`
  return null
}

/** ₾1,000,000 — far above any real per-person or per-booking price; stops a typo becoming a 32-bit overflow. */
const MAX_TETRI = 100_000_000

/**
 * Whole tetri ≥ 0 or null. Tasting only and Tasting & Lunch are REQUIRED for now: until the booking rules move
 * to the product model (Plan-PricingModel Chunk 7) the party-size pricing reads an empty price as ₾0. Lunch only
 * may be empty — that is "not offered" (D-7) — and is never offered to individuals (D-5).
 */
function tierPricesProblem(p: TierPrices, isIndividual: boolean): string | null {
  const all = [p.tastingOnlyPrice, p.lunchOnlyPrice, p.tastingLunchPrice]
  if (all.some(v => v != null && (!Number.isInteger(v) || v < 0 || v > MAX_TETRI))) return 'Prices must be whole amounts of 0 or more.'
  if (p.tastingOnlyPrice == null || p.tastingLunchPrice == null) return 'Tasting and Tasting & Lunch prices are required.'
  if (isIndividual && p.lunchOnlyPrice != null) return 'Individuals have no Lunch price.'
  return null
}


/** The tier columns a price action may write — never companyId changes or isDisplayPrice from a browser object. */
function tierFields(d: { minGuests: number; maxGuests: number } & TierPrices) {
  return {
    minGuests: d.minGuests, maxGuests: d.maxGuests,
    tastingOnlyPrice: d.tastingOnlyPrice, lunchOnlyPrice: d.lunchOnlyPrice, tastingLunchPrice: d.tastingLunchPrice,
  }
}

export async function createPrice(data: {
  companyId: string
  minGuests: number
  maxGuests: number
} & TierPrices) {
  await requireAdmin()
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async (tx) => {
    // Defense-in-depth, mirrors setDisplayPrice's pattern: the companyId argument
    // is caller-supplied, so confirm it actually belongs to this admin's tenant
    // before touching anything. RLS (Price's policy JOINs to Company) would also
    // reject a cross-tenant write here, but a raw RLS failure is a thrown
    // Postgres error, not this file's `{ error }` convention — so check first.
    const company = await tx.company.findFirst({ where: { id: data.companyId, tenantId } })
    if (!company) return { error: 'Not found.' }
    const err = tierPricesProblem(data, company.isIndividual) ?? await validateTier(tx, data.companyId, data.minGuests, data.maxGuests)
    if (err) return { error: err }
    // Only the known fields — the caller's object is passed in from the browser (blind review, Chunk 11).
    await tx.price.create({ data: { companyId: data.companyId, ...tierFields(data) } })
    return { success: true as const }
  })
  if (!('error' in result)) revalidatePath('/admin/companies')
  return result
}

export async function updatePrice(id: string, data: {
  minGuests: number
  maxGuests: number
} & TierPrices, companyId: string) {
  await requireAdmin()
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async (tx) => {
    const price = await tx.price.findFirst({
      where: { id, companyId },
      select: { id: true, company: { select: { tenantId: true, isIndividual: true } } },
    })
    if (!price || price.company.tenantId !== tenantId) return { error: 'Not found.' }
    const err = tierPricesProblem(data, price.company.isIndividual) ?? await validateTier(tx, companyId, data.minGuests, data.maxGuests, id)
    if (err) return { error: err }
    await tx.price.update({ where: { id }, data: tierFields(data) })
    return { success: true as const }
  })
  if (!('error' in result)) revalidatePath('/admin/companies')
  return result
}

export async function deletePrice(id: string) {
  await requireAdmin()
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async (tx) => {
    const price = await tx.price.findFirst({
      where: { id },
      select: { id: true, company: { select: { tenantId: true } } },
    })
    if (!price || price.company.tenantId !== tenantId) return { error: 'Not found.' }
    await tx.price.delete({ where: { id } })
    return { success: true as const }
  })
  if (!('error' in result)) revalidatePath('/admin/companies')
  return result
}

export async function setDisplayPrice(priceId: string) {
  await requireAdmin()
  const tenantId = await getTenantId()
  const price = await db.price.findFirst({
    where: { id: priceId },
    select: { companyId: true, company: { select: { isIndividual: true, tenantId: true } } },
  })
  if (!price || price.company.tenantId !== tenantId || !price.company.isIndividual) {
    return { error: 'Not found.' }
  }
  await db.$transaction(async tx => {
    await tx.price.updateMany({ where: { companyId: price.companyId }, data: { isDisplayPrice: false } })
    await tx.price.update({ where: { id: priceId }, data: { isDisplayPrice: true } })
  })
  revalidatePath('/')
  revalidatePath('/admin/companies')
  return { success: true }
}

/**
 * A company's flat registration fee, TETRI, charged once per booking (Plan-PricingModel D-6, T-152). Replaces
 * the per-tier fee. Individuals are never charged one, so the Individuals company cannot have it.
 */
export async function setRegistrationFee(companyId: string, fee: Tetri) {
  await requireAdmin()
  if (!Number.isInteger(fee) || fee < 0 || fee > MAX_TETRI) return { error: 'The fee must be a whole amount of 0 or more.' }
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async tx => {
    const updated = await tx.company.updateMany({ where: { id: companyId, tenantId, isIndividual: false }, data: { registrationFee: fee } })
    return updated.count === 0 ? { error: 'Not found.' } : { success: true as const }
  })
  if (!('error' in result)) revalidatePath('/admin/companies')
  return result
}
