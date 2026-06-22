'use server'

import { db, withTenantDb } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'

export async function createMenuItem(data: {
  name: string
  type: 'VEGETABLE' | 'MEAT'
  sortOrder?: number
}) {
  await requireAdmin()
  const tenantId = await getTenantId()
  await withTenantDb(tenantId, tx =>
    tx.menuItem.create({
      data: { name: data.name.trim(), type: data.type, sortOrder: data.sortOrder ?? 0, tenantId },
    })
  )
  revalidatePath('/admin/menu-items')
}

export async function updateMenuItem(id: string, data: {
  name?: string
  type?: 'VEGETABLE' | 'MEAT'
  active?: boolean
  sortOrder?: number
}) {
  await requireAdmin()
  const tenantId = await getTenantId()
  await withTenantDb(tenantId, tx =>
    tx.menuItem.updateMany({
      where: { id, tenantId },
      data: {
        ...(data.name !== undefined      ? { name: data.name.trim() }      : {}),
        ...(data.type !== undefined      ? { type: data.type }              : {}),
        ...(data.active !== undefined    ? { active: data.active }          : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder }    : {}),
      },
    })
  )
  revalidatePath('/admin/menu-items')
}

export async function deleteMenuItem(id: string) {
  await requireAdmin()
  const tenantId = await getTenantId()
  await withTenantDb(tenantId, tx =>
    tx.menuItem.deleteMany({ where: { id, tenantId } })
  )
  revalidatePath('/admin/menu-items')
}
