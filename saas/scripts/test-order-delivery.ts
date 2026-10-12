/**
 * Pure tests for `resolveOrderDelivery()` / `minimumOrderError()` (lib/orderDelivery.ts, T-8) —
 * what both wine-order write paths do with the browser's "delivery or pickup, which zone".
 * A crafted request can only name a zone; it can never set a fee, skip the zone question, or get
 * a pickup the winery does not offer. No database needed.
 *
 * Run: npx tsx scripts/test-order-delivery.ts
 */
import { resolveOrderDelivery, minimumOrderError } from '../lib/orderDelivery'
import { parseWineOrderRules } from '../lib/wineOrderRules'
import type { WineOrderDelivery } from '../lib/wineOrderDelivery'

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ✅  ${label}`) } else { failed++; console.log(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`) }
}

const rules = (m: Record<string, string>) => parseWineOrderRules(k => m[k])
const zones = [{ id: 'z1', nameEn: 'Tbilisi', nameKa: 'თბილისი', fee: 1500 }]
const setup = (m: Record<string, string> = {}, z = zones): WineOrderDelivery => ({ rules: rules(m), zones: z, dateRules: { leadHours: 0, blockedDates: [] } })

console.log('\n── resolveOrderDelivery / minimumOrderError ──\n')

const known = resolveOrderDelivery(setup(), { fulfilment: 'DELIVERY', zoneChoice: 'z1' })
check('A known zone → its fee and name, from the zone row',
  !('error' in known) && known.deliveryFee === 1500 && known.deliveryZoneName === 'Tbilisi' && !known.deliveryFeePending, JSON.stringify(known))

check('An unknown zone id is refused', 'error' in resolveOrderDelivery(setup(), { fulfilment: 'DELIVERY', zoneChoice: 'zz-made-up' }))
check('No zone chosen while zones exist is refused', 'error' in resolveOrderDelivery(setup(), { fulfilment: 'DELIVERY', zoneChoice: '' }))

const other = resolveOrderDelivery(setup(), { fulfilment: 'DELIVERY', zoneChoice: 'other' })
check('"other" → fee pending, no fee, no zone',
  !('error' in other) && other.deliveryFeePending && other.deliveryFee === null && other.deliveryZoneId === null)

const noZones = resolveOrderDelivery(setup({}, []), { fulfilment: 'DELIVERY', zoneChoice: 'z1' })
check('No zones configured → delivery exactly as before T-8 (nothing recorded, nothing pending)',
  !('error' in noZones) && noZones.deliveryFee === null && !noZones.deliveryFeePending && noZones.deliveryZoneId === null)

check('Pickup when the winery does not offer it is refused',
  'error' in resolveOrderDelivery(setup(), { fulfilment: 'PICKUP', zoneChoice: 'z1' }))
const pickup = resolveOrderDelivery(setup({ wine_pickup_enabled: 'true' }), { fulfilment: 'PICKUP', zoneChoice: 'z1' })
check('Pickup when offered → no fee, no zone, even if a zone was sent',
  !('error' in pickup) && pickup.fulfilment === 'PICKUP' && pickup.deliveryFee === null && pickup.deliveryZoneId === null)
check('Admin may record a pickup the public form does not offer',
  !('error' in resolveOrderDelivery(setup(), { fulfilment: 'PICKUP', zoneChoice: null }, { admin: true })))
check('Anything but PICKUP is a delivery',
  (r => !('error' in r) && r.fulfilment === 'DELIVERY')(resolveOrderDelivery(setup(), { fulfilment: 'TELEPORT', zoneChoice: 'z1' })))

const six = rules({ wine_min_order_type: 'bottles', wine_min_order_value: '6' }).minOrder
check('Minimum 6 bottles: 5 refused with a reason', minimumOrderError(six, 5, 0) === 'The minimum order is 6 bottles.')
check('Minimum 6 bottles: 6 accepted', minimumOrderError(six, 6, 0) === null)
const amt = rules({ wine_min_order_type: 'amount', wine_min_order_value: '20000' }).minOrder
check('Minimum 200₾: 199.99₾ refused', minimumOrderError(amt, 1, 19999)?.startsWith('The minimum order is') === true)
check('No minimum: anything accepted', minimumOrderError(rules({}).minOrder, 0, 0) === null)

console.log('\n──────────────────────────────────────────────────')
console.log(`Results: ${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exitCode = 1
