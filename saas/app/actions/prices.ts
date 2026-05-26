'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'

async function validateTier(
  companyId: string,
  minGuests: number,
  maxGuests: number,
  excludeId?: string,
): Promise<string | null> {
  if (minGuests > maxGuests) return 'Min guests cannot exceed max guests.'
  if (minGuests < 1) return 'Min guests must be at least 1.'
  if (maxGuests < 1) return 'Max guests must be at least 1.'
  const overlap = await db.price.findFirst({
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
  const err = await validateTier(data.companyId, data.minGuests, data.maxGuests)
  if (err) return { error: err }
  await db.price.create({ data })
  revalidatePath('/admin/companies')
  return { success: true }
}

export async function updatePrice(id: string, data: {
  minGuests: number
  maxGuests: number
  pricePerPerson: number
  tastingLunchPricePerPerson: number
  registrationPrice: number
}, companyId: string) {
  const err = await validateTier(companyId, data.minGuests, data.maxGuests, id)
  if (err) return { error: err }
  await db.price.update({ where: { id }, data })
  revalidatePath('/admin/companies')
  return { success: true }
}

export async function deletePrice(id: string) {
  await db.price.delete({ where: { id } })
  revalidatePath('/admin/companies')
  return { success: true }
}
