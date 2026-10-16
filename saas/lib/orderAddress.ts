import type { TxClient } from '@/lib/db'

/**
 * Where a wine order goes (T-13, vault/Plan-WineOrderFeatures.md Chunk 3) — the one place both
 * wine-order write paths (`submitWineOrder`, `createWineOrderAdmin`) turn "what the form sent"
 * into the columns the order stores.
 *
 * Two shapes come in:
 * - **A saved address** (`companyAddressId`). The browser's copy of the text is ignored: the
 *   address, working hours and name are re-read from the row, which must belong to the order's
 *   company under this tenant and be active. Same discipline as prices (KnownBugs #22) — the
 *   client says *which*, the server says *what*.
 * - **A typed address** ("Other address", no company, or a company with none saved). Stored as
 *   typed, with no link.
 *
 * Either way the result is a snapshot: the order keeps its own text, and the link may go null
 * later (SetNull) without moving it.
 */
export type OrderAddressInput = {
  companyId: string | null
  companyAddressId: string | null
  typedAddress: string | null
  typedWorkingHours: string | null
}

export type OrderAddress = {
  companyAddressId: string | null
  address: string
  workingHours: string | null
  addressLabel: string | null
  /** The saved address's own delivery area (T-8), when it has one — the area that address is
   *  delivered to. Public orders must use it (Max, 2026-10-14); a typed address has none. */
  deliveryZoneId: string | null
}

export async function resolveOrderAddress(
  tx: TxClient,
  tenantId: string,
  input: OrderAddressInput
): Promise<OrderAddress | { error: string }> {
  if (input.companyAddressId) {
    if (!input.companyId) return { error: 'Please choose a delivery address.' }
    const saved = await tx.companyAddress.findFirst({
      where: {
        id: input.companyAddressId,
        companyId: input.companyId,
        isActive: true,
        company: { tenantId },
      },
      select: { id: true, label: true, address: true, workingHours: true, deliveryZoneId: true },
    })
    // Most likely the admin deleted it while the form was open. Asking again beats silently
    // filing the order with no address.
    if (!saved) return { error: 'That delivery address is no longer available. Please choose again.' }
    return {
      companyAddressId: saved.id,
      address: saved.address,
      workingHours: saved.workingHours,
      addressLabel: saved.label,
      deliveryZoneId: saved.deliveryZoneId,
    }
  }
  const typed = input.typedAddress?.trim()
  if (!typed) return { error: 'Address is required.' }
  return {
    companyAddressId: null,
    address: typed,
    workingHours: input.typedWorkingHours?.trim() || null,
    addressLabel: null,
    deliveryZoneId: null,
  }
}

/** "Vake branch — 12 Chavchavadze Ave", or just the address when it has no name. */
export function formatAddressOption(a: { label: string | null; address: string }): string {
  return a.label ? `${a.label} — ${a.address}` : a.address
}
