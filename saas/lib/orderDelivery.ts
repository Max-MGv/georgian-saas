import type { WineOrderDelivery } from '@/lib/wineOrderDelivery'
import { asTetri, formatTetri } from '@/lib/money'
import { meetsMinimum, type MinOrderRule } from '@/lib/wineOrderRules'

/**
 * How a wine order reaches the customer, and what that costs (T-8,
 * vault/Plan-WineOrderFeatures.md Chunk 5) — the one place both write paths (`submitWineOrder`,
 * `createWineOrderAdmin`) turn the form's choice into order columns. Pure: the caller passes the
 * winery's setup, freshly loaded on the server (`loadWineOrderDeliveryTx`), never the browser's.
 *
 * `zoneChoice` is a DeliveryZone id, `'other'` ("we'll contact you about delivery"), or empty.
 * The browser says *which* zone; the fee always comes from the zone row.
 */
export type OrderDeliveryInput = {
  fulfilment: string | null
  zoneChoice: string | null
  /** The chosen saved address's own delivery area (lib/orderAddress.ts), if it has one. */
  addressZoneId?: string | null
}

export type OrderDelivery = {
  fulfilment: 'DELIVERY' | 'PICKUP'
  deliveryZoneId: string | null
  deliveryZoneName: string | null
  deliveryFee: number | null
  deliveryFeePending: boolean
}

export function resolveOrderDelivery(
  setup: WineOrderDelivery,
  input: OrderDeliveryInput,
  /** Admin manual entry may record a pickup even when the public form does not offer it. */
  opts: { admin?: boolean } = {}
): OrderDelivery | { error: string } {
  const fulfilment = input.fulfilment === 'PICKUP' ? 'PICKUP' : 'DELIVERY'
  if (fulfilment === 'PICKUP') {
    if (!setup.rules.pickupEnabled && !opts.admin) return { error: 'Pickup is not available. Please choose delivery.' }
    return { fulfilment, deliveryZoneId: null, deliveryZoneName: null, deliveryFee: null, deliveryFeePending: false }
  }

  // No zones configured: delivery as it always was — no area asked, no fee recorded.
  if (setup.zones.length === 0) {
    return { fulfilment, deliveryZoneId: null, deliveryZoneName: null, deliveryFee: null, deliveryFeePending: false }
  }

  // A saved address that has a delivery area is delivered there, whatever area the request names
  // (Max, 2026-10-14: "it should be enforced") — otherwise a company could pick a cheaper area, or
  // "Other", for an address the winery has already priced. The admin's manual form may still
  // choose (trusted). If that area has since been switched off, the customer chooses as usual.
  if (!opts.admin && input.addressZoneId) {
    const own = setup.zones.find(z => z.id === input.addressZoneId)
    if (own) return { fulfilment, deliveryZoneId: own.id, deliveryZoneName: own.nameEn, deliveryFee: own.fee, deliveryFeePending: false }
  }

  const choice = input.zoneChoice?.trim() || ''
  if (choice === 'other') {
    return { fulfilment, deliveryZoneId: null, deliveryZoneName: null, deliveryFee: null, deliveryFeePending: true }
  }
  const zone = setup.zones.find(z => z.id === choice)
  // Empty, or a zone deleted / deactivated while the form was open.
  if (!zone) return { error: 'Please choose your delivery area.' }
  return { fulfilment, deliveryZoneId: zone.id, deliveryZoneName: zone.nameEn, deliveryFee: zone.fee, deliveryFeePending: false }
}

/** A refusal the customer can act on, or null when the minimum is met. English, like the rest
 *  of this action's errors; the form shows the same rule in the customer's language first. */
export function minimumOrderError(rule: MinOrderRule, bottles: number, winesTotal: number): string | null {
  if (meetsMinimum(rule, bottles, winesTotal)) return null
  if (rule.type === 'bottles') return `The minimum order is ${rule.bottles} bottles.`
  if (rule.type === 'amount') return `The minimum order is ${formatTetri(asTetri(rule.amount))} of wine.`
  return null
}
