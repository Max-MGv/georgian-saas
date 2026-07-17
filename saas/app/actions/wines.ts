'use server'

import { withTenantDb } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'
import type { WineType, Sweetness } from '@prisma/client'

function revalidateWines() {
  revalidatePath('/wines')
  revalidatePath('/admin/wines')
}

// ── Wine (product) actions ──────────────────────────────────────────────

export async function getWinesWithVintages() {
  await requireAdmin()
  const tenantId = await getTenantId()
  return withTenantDb(tenantId, tx =>
    tx.wine.findMany({
      where: { tenantId },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true, name: true, wineType: true, sweetness: true, sparkling: true,
        alcoholLevel: true, description: true, color: true, imagePath: true,
        sortOrder: true, active: true,
        vintages: { orderBy: [{ sortOrder: 'asc' }, { year: 'desc' }] },
      },
    })
  )
}

export async function createWine(data: {
  name: string; wineType: WineType; sweetness: Sweetness; sparkling: boolean
  alcoholLevel?: number; description?: string; color: string
}) {
  await requireAdmin()
  const tenantId = await getTenantId()
  await withTenantDb(tenantId, async (tx) => {
    const maxOrder = await tx.wine.aggregate({ where: { tenantId }, _max: { sortOrder: true } })
    await tx.wine.create({
      data: { ...data, tenantId, sortOrder: (maxOrder._max.sortOrder ?? -1) + 1 },
    })
  })
  revalidateWines()
}

export async function updateWine(id: string, data: Partial<{
  name: string; wineType: WineType; sweetness: Sweetness; sparkling: boolean
  alcoholLevel: number | null; description: string; color: string
  active: boolean; sortOrder: number
}>) {
  await requireAdmin()
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, tx =>
    tx.wine.updateMany({ where: { id, tenantId }, data })
  )
  if (result.count === 0) return { error: 'Wine not found.' }
  revalidateWines()
}

export async function deleteWine(id: string) {
  await requireAdmin()
  const tenantId = await getTenantId()
  await withTenantDb(tenantId, tx =>
    tx.wine.deleteMany({ where: { id, tenantId } })
  )
  revalidateWines()
}

export async function assignWineImage(wineId: string, imagePath: string | null) {
  await requireAdmin()
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, tx =>
    tx.wine.updateMany({ where: { id: wineId, tenantId }, data: { imagePath } })
  )
  if (result.count === 0) return { error: 'Wine not found.' }
  revalidateWines()
}

// ── WineVintage actions ─────────────────────────────────────────────────

export async function createVintage(wineId: string, data: {
  year: number; price: number; imagePath?: string
}) {
  await requireAdmin()
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async (tx) => {
    const wine = await tx.wine.findFirst({ where: { id: wineId, tenantId } })
    if (!wine) return { error: 'Wine not found.' }
    const maxOrder = await tx.wineVintage.aggregate({ where: { wineId }, _max: { sortOrder: true } })
    await tx.wineVintage.create({
      data: { ...data, wineId, tenantId, sortOrder: (maxOrder._max.sortOrder ?? -1) + 1 },
    })
    return { success: true }
  })
  if ('error' in result) return result
  revalidateWines()
}

export async function updateVintage(id: string, data: Partial<{
  year: number; price: number; imagePath: string | null; active: boolean; sortOrder: number
}>) {
  await requireAdmin()
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, tx =>
    tx.wineVintage.updateMany({ where: { id, tenantId }, data })
  )
  if (result.count === 0) return { error: 'Vintage not found.' }
  revalidateWines()
}

export async function deleteVintage(id: string) {
  await requireAdmin()
  const tenantId = await getTenantId()
  await withTenantDb(tenantId, tx =>
    tx.wineVintage.deleteMany({ where: { id, tenantId } })
  )
  revalidateWines()
}

export async function assignVintageImage(vintageId: string, imagePath: string | null) {
  await requireAdmin()
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, tx =>
    tx.wineVintage.updateMany({ where: { id: vintageId, tenantId }, data: { imagePath } })
  )
  if (result.count === 0) return { error: 'Vintage not found.' }
  revalidateWines()
}

export async function toggleVintageActive(id: string, active: boolean) {
  return updateVintage(id, { active })
}
