'use server'

import { withTenantDb } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'
import { WINE_RULE_KEYS, type UnknownZonePayment } from '@/lib/wineOrderRules'

/**
 * Delivery zones and the other wine-order rules (T-8, vault/Plan-WineOrderFeatures.md Chunk 4).
 *
 * A zone is "Tbilisi — 0₾": one fee per order, in tetri. Deleting one is safe for history —
 * `WineOrder.deliveryZoneId` and `CompanyAddress.deliveryZoneId` are SetNull, and every order
 * keeps its own `deliveryZoneName` / `deliveryFee` snapshot.
 */

type ZoneInput = { nameEn: string; nameKa?: string; fee: number }

function cleanZone(data: ZoneInput): { error: string } | { nameEn: string; nameKa: string | null; fee: number } {
  const nameEn = data.nameEn.trim()
  if (!nameEn) return { error: 'Name is required.' }
  // Tetri, whole and non-negative. The form converts from lari; this is the backstop.
  if (!Number.isInteger(data.fee) || data.fee < 0 || data.fee > 100_000_00) return { error: 'Enter a valid fee.' }
  return { nameEn, nameKa: data.nameKa?.trim() || null, fee: data.fee }
}

function revalidate() {
  revalidatePath('/admin/settings')
  revalidatePath('/admin/companies')
  revalidatePath('/wines')
}

export async function createDeliveryZone(data: ZoneInput) {
  await requireAdmin()
  const clean = cleanZone(data)
  if ('error' in clean) return clean
  const tenantId = await getTenantId()
  const zone = await withTenantDb(tenantId, async tx => {
    const last = await tx.deliveryZone.aggregate({ where: { tenantId }, _max: { sortOrder: true } })
    return tx.deliveryZone.create({
      data: { tenantId, ...clean, sortOrder: (last._max.sortOrder ?? -1) + 1 },
      select: { id: true, nameEn: true, nameKa: true, fee: true },
    })
  })
  revalidate()
  return { success: true as const, zone }
}

export async function updateDeliveryZone(id: string, data: ZoneInput) {
  await requireAdmin()
  const clean = cleanZone(data)
  if ('error' in clean) return clean
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, tx =>
    tx.deliveryZone.updateMany({ where: { id, tenantId }, data: clean })
  )
  if (result.count === 0) return { error: 'Not found.' }
  revalidate()
  return { success: true as const }
}

export async function deleteDeliveryZone(id: string) {
  await requireAdmin()
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, tx => tx.deliveryZone.deleteMany({ where: { id, tenantId } }))
  if (result.count === 0) return { error: 'Not found.' }
  revalidate()
  return { success: true as const }
}

/**
 * The three scalar rules, validated here rather than through the generic `updateSetting` (which
 * takes any key and any value). Readers parse defensively too (`parseWineOrderRules`), but a
 * value that can never be wrong in the table is better than one every reader must doubt.
 */
export async function saveWineOrderRules(input: {
  minType: 'off' | 'bottles' | 'amount'
  /** Bottles, or tetri for 'amount'. Ignored when 'off'. */
  minValue: number
  pickupEnabled: boolean
  unknownZonePayment: UnknownZonePayment
}) {
  await requireAdmin()
  if (!['off', 'bottles', 'amount'].includes(input.minType)) return { error: 'Invalid minimum type.' }
  if (input.minType !== 'off' && (!Number.isInteger(input.minValue) || input.minValue <= 0)) {
    return { error: 'Enter a minimum greater than zero.' }
  }
  if (!['pay_wine_now', 'reservation'].includes(input.unknownZonePayment)) return { error: 'Invalid choice.' }
  const tenantId = await getTenantId()
  const values: Record<string, string> = {
    [WINE_RULE_KEYS.minType]: input.minType,
    [WINE_RULE_KEYS.minValue]: input.minType === 'off' ? '' : String(input.minValue),
    [WINE_RULE_KEYS.pickup]: input.pickupEnabled ? 'true' : 'false',
    [WINE_RULE_KEYS.unknownZonePayment]: input.unknownZonePayment,
  }
  await withTenantDb(tenantId, async tx => {
    for (const [key, value] of Object.entries(values)) {
      await tx.setting.upsert({
        where: { key_tenantId: { key, tenantId } },
        update: { value },
        create: { key, value, tenantId },
      })
    }
  })
  revalidate()
  return { success: true as const }
}
