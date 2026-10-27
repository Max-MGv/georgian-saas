// ─── The "Wine for the table" group (T-22) ──────────────────────────────────────────────────────────────────
//
// Among the add-on groups (Admin → Add-ons) there is at most ONE of kind WINE: the row on the booking form where guests add
// bottles to their table. It carries only what any group carries (name in two languages, who sees it, which visit types, its
// place among the groups) — its contents are the winery's wines marked "Offer on bookings". Created the first time the winery
// switches a wine on, so a winery that never does has nothing to see and nothing changes for it.
//
// Server-only: takes the caller's transaction.

import type { TxClient } from '@/lib/db'

export const WINE_GROUP_NAME_EN = 'Wine for the table'
export const WINE_GROUP_NAME_KA = 'ღვინო მაგიდისთვის'

/** The winery's wine group, created (active, shown to companies and individuals, every visit type, last in order) if missing. */
export async function ensureWineGroup(tx: TxClient, tenantId: string): Promise<{ id: string }> {
  const existing = await tx.addOnGroup.findFirst({ where: { tenantId, kind: 'WINE' }, select: { id: true } })
  if (existing) return existing
  const last = await tx.addOnGroup.findFirst({ where: { tenantId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } })
  return tx.addOnGroup.create({
    data: {
      tenantId, kind: 'WINE', nameEn: WINE_GROUP_NAME_EN, nameKa: WINE_GROUP_NAME_KA,
      showToCompanies: true, showToIndividuals: true, sortOrder: (last?.sortOrder ?? -1) + 1,
    },
    select: { id: true },
  })
}
