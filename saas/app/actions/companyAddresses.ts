'use server'

import { withTenantDb } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'

/**
 * CRUD for CompanyAddress — a company's delivery addresses (T-13,
 * vault/Plan-WineOrderFeatures.md Chunk 2). Same shape as `companyPeople.ts`.
 *
 * Every write re-verifies the address's company belongs to the caller's tenant before touching
 * the row, even though RLS already scopes it — the same defence-in-depth `companyPeople.ts` and
 * `prices.ts` use.
 */

type AddressInput = { label?: string; address: string; workingHours?: string; deliveryZoneId?: string | null }

function clean(data: AddressInput) {
  return {
    label: data.label?.trim() || null,
    address: data.address.trim(),
    workingHours: data.workingHours?.trim() || null,
    deliveryZoneId: data.deliveryZoneId || null,
  }
}

/** A zone id from the browser must be this tenant's (T-8). Null is always fine. */
async function zoneIsOwned(tx: Parameters<Parameters<typeof withTenantDb>[1]>[0], tenantId: string, zoneId: string | null | undefined) {
  if (!zoneId) return true
  return (await tx.deliveryZone.count({ where: { id: zoneId, tenantId } })) === 1
}

/** Shared guard: resolve an address and prove it belongs to this tenant, or explain why not. */
async function findOwnedAddress(
  tx: Parameters<Parameters<typeof withTenantDb>[1]>[0],
  id: string,
  companyId: string,
  tenantId: string
) {
  const address = await tx.companyAddress.findFirst({
    where: { id, companyId },
    select: { id: true, company: { select: { tenantId: true } } },
  })
  if (!address || address.company.tenantId !== tenantId) return null
  return address
}

export async function createAddress(companyId: string, data: AddressInput) {
  await requireAdmin()
  if (!data.address.trim()) return { error: 'Address is required.' }
  const tenantId = await getTenantId()

  const result = await withTenantDb(tenantId, async tx => {
    const company = await tx.company.findFirst({ where: { id: companyId, tenantId }, select: { id: true } })
    if (!company) return { error: 'Company not found.' }
    if (!(await zoneIsOwned(tx, tenantId, data.deliveryZoneId))) return { error: 'Delivery zone not found.' }
    // New addresses go to the end of the list; the order is what the customer's picker shows.
    const last = await tx.companyAddress.aggregate({ where: { companyId }, _max: { sortOrder: true } })
    const address = await tx.companyAddress.create({
      data: { companyId, ...clean(data), sortOrder: (last._max.sortOrder ?? -1) + 1 },
      select: { id: true, label: true, address: true, workingHours: true, deliveryZoneId: true },
    })
    return { success: true as const, address }
  })
  if (!('error' in result)) revalidatePath('/admin/companies')
  return result
}

export async function updateAddress(id: string, companyId: string, data: AddressInput) {
  await requireAdmin()
  if (!data.address.trim()) return { error: 'Address is required.' }
  const tenantId = await getTenantId()

  const result = await withTenantDb(tenantId, async tx => {
    const owned = await findOwnedAddress(tx, id, companyId, tenantId)
    if (!owned) return { error: 'Not found.' }
    if (!(await zoneIsOwned(tx, tenantId, data.deliveryZoneId))) return { error: 'Delivery zone not found.' }
    await tx.companyAddress.update({ where: { id }, data: clean(data) })
    return { success: true as const }
  })
  if (!('error' in result)) revalidatePath('/admin/companies')
  return result
}

/**
 * Deleting an address is safe for history: `WineOrder.companyAddressId` is `onDelete: SetNull`
 * and every order keeps its own `address` / `workingHours` / `addressLabel` snapshot, so a past
 * order still shows where it went (asserted in scripts/test-company-addresses-rls.ts).
 */
export async function deleteAddress(id: string, companyId: string) {
  await requireAdmin()
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async tx => {
    const owned = await findOwnedAddress(tx, id, companyId, tenantId)
    if (!owned) return { error: 'Not found.' }
    await tx.companyAddress.delete({ where: { id } })
    return { success: true as const }
  })
  if (!('error' in result)) revalidatePath('/admin/companies')
  return result
}
