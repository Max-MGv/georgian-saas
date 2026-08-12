'use server'

import { db, withTenantDb, type TxClient } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'

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

export async function createPrice(data: {
  companyId: string
  minGuests: number
  maxGuests: number
  pricePerPerson: number
  tastingLunchPricePerPerson: number
  registrationPrice: number
}) {
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
    const err = await validateTier(tx, data.companyId, data.minGuests, data.maxGuests)
    if (err) return { error: err }
    await tx.price.create({ data })
    return { success: true as const }
  })
  if (!('error' in result)) revalidatePath('/admin/companies')
  return result
}

export async function updatePrice(id: string, data: {
  minGuests: number
  maxGuests: number
  pricePerPerson: number
  tastingLunchPricePerPerson: number
  registrationPrice: number
}, companyId: string) {
  await requireAdmin()
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async (tx) => {
    const price = await tx.price.findFirst({
      where: { id, companyId },
      select: { id: true, company: { select: { tenantId: true } } },
    })
    if (!price || price.company.tenantId !== tenantId) return { error: 'Not found.' }
    const err = await validateTier(tx, companyId, data.minGuests, data.maxGuests, id)
    if (err) return { error: err }
    await tx.price.update({ where: { id }, data })
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
