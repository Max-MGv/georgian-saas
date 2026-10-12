'use server'

import { withTenantDb } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'
import type { Tetri } from '@/lib/money'

/**
 * Negotiated wine prices for one company (T-12, vault/Plan-WineOrderFeatures.md Chunk 9) —
 * "exceptions only": setting a price writes a row, "Reset to standard" deletes it.
 *
 * Both the company and the vintage are re-checked against the caller's tenant before writing,
 * on top of RLS — the same defence-in-depth as companyPeople.ts / companyAddresses.ts. Past
 * orders never change: each order line keeps the price it was charged (priceSnapshot).
 */
export async function setCompanyWinePrice(
  companyId: string,
  wineVintageId: string,
  /** Tetri per bottle, or null to go back to the standard price. */
  price: Tetri | null
): Promise<{ success: true } | { error: string }> {
  await requireAdmin()
  if (price !== null && (!Number.isInteger(price) || price < 0 || price > 100_000_00)) {
    return { error: 'Enter a valid price.' }
  }
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async tx => {
    const [company, vintage] = await Promise.all([
      tx.company.findFirst({ where: { id: companyId, tenantId }, select: { id: true } }),
      tx.wineVintage.findFirst({ where: { id: wineVintageId, tenantId }, select: { id: true } }),
    ])
    if (!company) return { error: 'Company not found.' }
    if (!vintage) return { error: 'Wine not found.' }
    if (price === null) {
      await tx.companyWinePrice.deleteMany({ where: { companyId, wineVintageId } })
    } else {
      await tx.companyWinePrice.upsert({
        where: { companyId_wineVintageId: { companyId, wineVintageId } },
        update: { price },
        create: { companyId, wineVintageId, price },
      })
    }
    return { success: true as const }
  })
  if ('error' in result) return result
  revalidatePath('/admin/companies')
  return result
}
