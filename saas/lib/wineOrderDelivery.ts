import { withTenantDb, type TxClient } from '@/lib/db'
import { parseWineOrderRules, WINE_RULE_KEYS, type WineOrderRules } from '@/lib/wineOrderRules'

/**
 * A winery's delivery setup — its wine-order rules and active delivery zones (T-8,
 * vault/Plan-WineOrderFeatures.md). One loader for every reader: the public `/wines` page, the
 * admin manual form, Settings, and `submitWineOrder` (which must re-read it, never trust the
 * browser's copy). Server-only: takes an explicit tenantId, so it must not live in a
 * `'use server'` file (see lib/contactResolution.ts's note on why).
 */
export type DeliveryZoneOption = { id: string; nameEn: string; nameKa: string | null; fee: number }

export type WineOrderDelivery = {
  rules: WineOrderRules
  zones: DeliveryZoneOption[]
}

export async function loadWineOrderDeliveryTx(tx: TxClient, tenantId: string): Promise<WineOrderDelivery> {
  const [settings, zones] = await Promise.all([
    tx.setting.findMany({
      where: { tenantId, key: { in: Object.values(WINE_RULE_KEYS) } },
      select: { key: true, value: true },
    }),
    tx.deliveryZone.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, nameEn: true, nameKa: true, fee: true },
    }),
  ])
  const map = new Map(settings.map(r => [r.key, r.value]))
  return { rules: parseWineOrderRules(k => map.get(k)), zones }
}

export function loadWineOrderDelivery(tenantId: string): Promise<WineOrderDelivery> {
  return withTenantDb(tenantId, tx => loadWineOrderDeliveryTx(tx, tenantId))
}
