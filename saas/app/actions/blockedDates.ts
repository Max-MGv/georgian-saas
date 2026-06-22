'use server'

import { db, withTenantDb } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'

export async function getBlockedDates() {
  const tenantId = await getTenantId()
  const rows = await withTenantDb(tenantId, tx =>
    tx.blockedDate.findMany({ where: { tenantId }, orderBy: { date: 'asc' } })
  )
  return rows.map(r => ({
    id: r.id,
    date: r.date.toISOString().split('T')[0],
    reason: r.reason,
  }))
}

export async function addBlockedDate(dateStr: string, reason?: string) {
  await requireAdmin()
  const tenantId = await getTenantId()
  const date = new Date(dateStr)
  const row = await withTenantDb(tenantId, tx =>
    tx.blockedDate.upsert({
      where: { date_tenantId: { date, tenantId } },
      update: { reason: reason ?? null },
      create: { date, reason: reason ?? null, tenantId },
    })
  )
  revalidatePath('/admin/settings')
  revalidatePath('/')
  return { id: row.id, date: row.date.toISOString().split('T')[0], reason: row.reason }
}

export async function removeBlockedDate(id: string) {
  await requireAdmin()
  const tenantId = await getTenantId()
  await withTenantDb(tenantId, tx =>
    tx.blockedDate.deleteMany({ where: { id, tenantId } })
  )
  revalidatePath('/admin/settings')
  revalidatePath('/')
}
