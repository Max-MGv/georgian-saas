// ─── Per-person add-on lines follow the guests (T-7, Plan-AddOnsAndWine D-11 / G-3) ────────────────────────────
//
// A PER_PERSON line is charged per PAYING guest (the three boxes, never Free — D-19). Its stored quantity therefore
// has to move whenever the booking's paying guests move, in the same transaction as the guest change, and leave a
// line in the booking's history. One function does it for every write path that changes guest counts, so a path
// cannot forget (MaintenanceNotes §38).
//
// Server-only: takes the caller's transaction.

import type { TxClient } from '@/lib/db'
import { recordOrderEvent } from '@/lib/orderEvents'
import { lineIdentity, type QuantityLine } from '@/lib/orderLines'

type LineRow = QuantityLine & {
  id: string
  nameSnapshot?: string | null
  nameKaSnapshot?: string | null
  unitSnapshot?: 'PER_PERSON' | 'PER_PIECE' | 'FLAT' | null
  groupNameSnapshot?: string | null
  groupNameKaSnapshot?: string | null
  masterclassItem?: { name: string; nameKa?: string | null; unitType: 'PER_PERSON' | 'PER_PIECE' | 'FLAT' } | null
}

/**
 * What the lines would be after the guests change — pure, so a caller can price with it before writing anything.
 * Only PER_PERSON lines whose quantity differs from `payingGuests` change.
 */
export function withSyncedQuantities<T extends LineRow>(lines: readonly T[], payingGuests: number): { lines: T[]; changed: { id: string; name: string; from: number; to: number }[] } {
  const changed: { id: string; name: string; from: number; to: number }[] = []
  const out = lines.map(l => {
    const who = lineIdentity(l)
    if (who.unit !== 'PER_PERSON' || l.quantity === payingGuests) return l
    changed.push({ id: l.id, name: who.name, from: l.quantity, to: payingGuests })
    return { ...l, quantity: payingGuests }
  })
  return { lines: out, changed }
}

/** Writes the new quantities and one history event. No-op when nothing changed. Returns the money delta, tetri. */
export async function writeSyncedQuantities(
  tx: TxClient,
  args: { tenantId: string; orderId: string; actorId: string | null; lines: readonly LineRow[]; payingGuests: number },
): Promise<number> {
  const { changed } = withSyncedQuantities(args.lines, args.payingGuests)
  if (changed.length === 0) return 0
  let delta = 0
  for (const c of changed) {
    const line = args.lines.find(l => l.id === c.id)!
    delta += (c.to - c.from) * line.pricePerUnit
    await tx.orderMasterclass.update({ where: { id: c.id }, data: { quantity: c.to } })
  }
  await recordOrderEvent(tx, {
    tenantId: args.tenantId, orderId: args.orderId,
    type: 'ADDON_QTY_SYNCED', actorType: 'ADMIN', actorId: args.actorId,
    payload: { payingGuests: args.payingGuests, lines: changed.map(({ name, from, to }) => ({ name, from, to })) },
  })
  return delta
}
