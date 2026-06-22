'use server'

import { db, withTenantDb } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'

export async function createWine(data: {
  name: string; type: string; description?: string; price: number; color: string
}) {
  await requireAdmin()
  const tenantId = await getTenantId()
  await withTenantDb(tenantId, async (tx) => {
    const maxOrder = await tx.wine.aggregate({ where: { tenantId }, _max: { sortOrder: true } })
    await tx.wine.create({
      data: { ...data, tenantId, sortOrder: (maxOrder._max.sortOrder ?? -1) + 1 },
    })
  })
  revalidatePath('/admin/wines')
  revalidatePath('/wines')
}

export async function updateWine(id: string, data: {
  name?: string; type?: string; description?: string; price?: number; color?: string
  imagePath?: string | null; active?: boolean; sortOrder?: number
}) {
  await requireAdmin()
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, tx =>
    tx.wine.updateMany({ where: { id, tenantId }, data })
  )
  if (result.count === 0) return { error: 'Wine not found.' }
  revalidatePath('/admin/wines')
  revalidatePath('/wines')
}

export async function deleteWine(id: string) {
  await requireAdmin()
  const tenantId = await getTenantId()
  await withTenantDb(tenantId, tx =>
    tx.wine.deleteMany({ where: { id, tenantId } })
  )
  revalidatePath('/admin/wines')
  revalidatePath('/wines')
}
