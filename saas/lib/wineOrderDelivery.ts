import { withTenantDb, type TxClient } from '@/lib/db'
import { parseWineOrderRules, WINE_RULE_KEYS, type WineOrderRules } from '@/lib/wineOrderRules'
import { wineLeadHours, type PreferredDateRules } from '@/lib/wineOrderDate'
import { SETTING_DEFAULTS } from '@/lib/settings'

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
  /** Preferred-date rules (T-14): the booking lead time + the winery's Closed Days. */
  dateRules: PreferredDateRules
}

const LEAD_KEYS = ['booking_lead_split', 'booking_lead_hours', 'booking_lead_hours_tasting', 'booking_lead_hours_tasting_lunch'] as const

export async function loadWineOrderDeliveryTx(tx: TxClient, tenantId: string): Promise<WineOrderDelivery> {
  // Closed Days from yesterday on — enough for any date the form can still offer.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const [settings, zones, blocked] = await Promise.all([
    tx.setting.findMany({
      where: { tenantId, key: { in: [...Object.values(WINE_RULE_KEYS), ...LEAD_KEYS] } },
      select: { key: true, value: true },
    }),
    tx.deliveryZone.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: { id: true, nameEn: true, nameKa: true, fee: true },
    }),
    tx.blockedDate.findMany({ where: { tenantId, date: { gte: since } }, select: { date: true } }),
  ])
  const map = new Map(settings.map(r => [r.key, r.value]))
  // Same keys and defaults the booking form reads (lib/settings.ts SETTING_DEFAULTS).
  const num = (k: string) => Number.parseInt(map.get(k) ?? SETTING_DEFAULTS[k] ?? '', 10) || 0
  const leadHours = wineLeadHours({
    split: (map.get('booking_lead_split') ?? SETTING_DEFAULTS.booking_lead_split) === 'true',
    single: num('booking_lead_hours'),
    tasting: num('booking_lead_hours_tasting'),
    lunch: num('booking_lead_hours_tasting_lunch'),
  })
  return {
    rules: parseWineOrderRules(k => map.get(k)),
    zones,
    dateRules: { leadHours, blockedDates: blocked.map(b => b.date.toISOString().slice(0, 10)) },
  }
}

export function loadWineOrderDelivery(tenantId: string): Promise<WineOrderDelivery> {
  return withTenantDb(tenantId, tx => loadWineOrderDeliveryTx(tx, tenantId))
}
