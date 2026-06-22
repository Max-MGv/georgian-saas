'use server'

import { db, withTenantDb } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'

export async function updateWineOrderStatus(id: string, status: string) {
  await requireAdmin()
  const tenantId = await getTenantId()
  await withTenantDb(tenantId, tx =>
    tx.wineOrder.updateMany({ where: { id, tenantId }, data: { status } })
  )
  revalidatePath('/admin/wine-orders')
}
