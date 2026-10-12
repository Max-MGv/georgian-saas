import { asTetri, type Tetri } from '@/lib/money'

/**
 * A winery's wine-order rules (T-8, vault/Plan-WineOrderFeatures.md Chunk 4): minimum order,
 * whether pickup is offered, and what happens to online payment when the customer's delivery
 * area is not on the zone list. Stored as plain `Setting` rows, per tenant.
 *
 * A plain module (not `'use server'`) so the parser is usable from server pages, server actions
 * and scripts alike (MaintenanceNotes §24). Every reader goes through `parseWineOrderRules` — a
 * hand-edited or half-written setting falls back to "off", never to a guess.
 */

export const WINE_RULE_KEYS = {
  minType: 'wine_min_order_type',
  minValue: 'wine_min_order_value',
  pickup: 'wine_pickup_enabled',
  unknownZonePayment: 'wine_unknown_zone_payment',
} as const

export type MinOrderRule =
  | { type: 'off' }
  | { type: 'bottles'; bottles: number }
  /** Compared against the wines total after the company's own pricing — never the delivery fee. */
  | { type: 'amount'; amount: Tetri }

/**
 * 'pay_wine_now' — the customer pays for the wine online; the admin adds the delivery fee later.
 * 'reservation'  — no online payment for that order; it is taken as a reservation.
 */
export type UnknownZonePayment = 'pay_wine_now' | 'reservation'

export type WineOrderRules = {
  minOrder: MinOrderRule
  pickupEnabled: boolean
  unknownZonePayment: UnknownZonePayment
}

export function parseWineOrderRules(get: (key: string) => string | undefined): WineOrderRules {
  const type = get(WINE_RULE_KEYS.minType)
  const raw = Number.parseInt(get(WINE_RULE_KEYS.minValue) ?? '', 10)
  const value = Number.isFinite(raw) && raw > 0 ? raw : 0
  const minOrder: MinOrderRule =
    type === 'bottles' && value > 0 ? { type: 'bottles', bottles: value }
    : type === 'amount' && value > 0 ? { type: 'amount', amount: asTetri(value) }
    : { type: 'off' }
  return {
    minOrder,
    pickupEnabled: get(WINE_RULE_KEYS.pickup) === 'true',
    unknownZonePayment: get(WINE_RULE_KEYS.unknownZonePayment) === 'reservation' ? 'reservation' : 'pay_wine_now',
  }
}

/** True when the order meets the minimum. `winesTotal` is tetri, after company pricing. */
export function meetsMinimum(rule: MinOrderRule, bottles: number, winesTotal: number): boolean {
  if (rule.type === 'bottles') return bottles >= rule.bottles
  if (rule.type === 'amount') return winesTotal >= rule.amount
  return true
}
