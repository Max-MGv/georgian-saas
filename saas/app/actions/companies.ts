'use server'

import { db, withTenantDb } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'

export async function createCompany(name: string, identificationCode?: string) {
  await requireAdmin()
  if (!name.trim()) return { error: 'Name is required.' }
  const tenantId = await getTenantId()
  await withTenantDb(tenantId, tx =>
    tx.company.create({
      data: { name: name.trim(), identificationCode: identificationCode?.trim() || null, tenantId },
    })
  )
  revalidatePath('/admin/companies')
  return { success: true }
}

export async function updateCompany(id: string, name: string, identificationCode?: string) {
  await requireAdmin()
  if (!name.trim()) return { error: 'Name is required.' }
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, tx =>
    tx.company.updateMany({
      where: { id, tenantId },
      data: { name: name.trim(), identificationCode: identificationCode?.trim() || null },
    })
  )
  if (result.count === 0) return { error: 'Company not found.' }
  revalidatePath('/admin/companies')
  return { success: true }
}

export async function deleteCompany(id: string) {
  await requireAdmin()
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, tx =>
    tx.company.deleteMany({ where: { id, tenantId } })
  )
  if (result.count === 0) return { error: 'Company not found.' }
  revalidatePath('/admin/companies')
  return { success: true }
}
