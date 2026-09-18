/**
 * Plausibility audit across every money column (bugs #43–#48, 2026-09-19).
 *
 * Looks for the two shapes a unit error leaves: a value ~100x too small (a lari
 * figure written into a tetri column) and a non-integer (a fractional tetri,
 * which is what #44's stale rounding produced). Read-only.
 */
import * as dotenv from 'dotenv'
dotenv.config({ path: '.env' })
import { db } from '../lib/db'
import { formatTetri, asTetri } from '../lib/money'

type Finding = { table: string; column: string; id: string; value: number; note: string }

function fmt(v: number) {
  return Number.isInteger(v) ? formatTetri(asTetri(v)) : `${v} (FRACTIONAL)`
}

async function main() {
  const findings: Finding[] = []
  const stat = (label: string, vals: number[], floor: number) => {
    const clean = vals.filter(v => v !== 0)
    if (!clean.length) { console.log(`  ${label.padEnd(34)} no rows`); return }
    const min = Math.min(...clean), max = Math.max(...clean)
    const frac = clean.filter(v => !Number.isInteger(v)).length
    const small = clean.filter(v => v < floor).length
    console.log(
      `  ${label.padEnd(34)} n=${String(clean.length).padStart(4)}  ` +
      `min=${fmt(min).padStart(12)}  max=${fmt(max).padStart(12)}  ` +
      `under ${formatTetri(asTetri(floor))}: ${small}  fractional: ${frac}`
    )
  }

  console.log('Money plausibility audit\n')

  const orders = await db.order.findMany({ select: { id: true, totalPrice: true } })
  stat('Order.totalPrice', orders.map(o => o.totalPrice ?? 0), 1000)
  for (const o of orders) {
    const v = o.totalPrice
    if (v == null || v === 0) continue
    if (!Number.isInteger(v)) findings.push({ table: 'Order', column: 'totalPrice', id: o.id, value: v, note: 'fractional tetri' })
    else if (v < 1000) findings.push({ table: 'Order', column: 'totalPrice', id: o.id, value: v, note: 'under ₾10 — possible unconverted lari' })
  }

  const mc = await db.orderMasterclass.findMany({ select: { id: true, pricePerUnit: true } })
  stat('OrderMasterclass.pricePerUnit', mc.map(m => m.pricePerUnit), 100)
  for (const m of mc) {
    if (!Number.isInteger(m.pricePerUnit)) findings.push({ table: 'OrderMasterclass', column: 'pricePerUnit', id: m.id, value: m.pricePerUnit, note: 'fractional tetri' })
    else if (m.pricePerUnit > 0 && m.pricePerUnit < 100) findings.push({ table: 'OrderMasterclass', column: 'pricePerUnit', id: m.id, value: m.pricePerUnit, note: 'under ₾1' })
  }

  const wo = await db.wineOrder.findMany({ select: { id: true, totalAmount: true, discountPercent: true } })
  stat('WineOrder.totalAmount', wo.map(w => w.totalAmount ?? 0), 500)
  for (const w of wo) {
    const v = w.totalAmount
    if (v == null || v === 0) continue
    if (!Number.isInteger(v)) findings.push({ table: 'WineOrder', column: 'totalAmount', id: w.id, value: v, note: `fractional tetri (discount ${w.discountPercent ?? 0}%) — bug #44 shape` })
    else if (v < 500) findings.push({ table: 'WineOrder', column: 'totalAmount', id: w.id, value: v, note: 'under ₾5' })
  }

  const prices = await db.price.findMany({ select: { id: true, pricePerPerson: true, tastingLunchPricePerPerson: true, registrationPrice: true } })
  stat('Price.pricePerPerson', prices.map(p => p.pricePerPerson), 500)
  stat('Price.tastingLunchPricePerPerson', prices.map(p => p.tastingLunchPricePerPerson), 100)
  stat('Price.registrationPrice', prices.map(p => p.registrationPrice), 100)
  for (const p of prices) {
    for (const [col, v, floor] of [['pricePerPerson', p.pricePerPerson, 500], ['tastingLunchPricePerPerson', p.tastingLunchPricePerPerson, 100], ['registrationPrice', p.registrationPrice, 100]] as [string, number, number][]) {
      if (!Number.isInteger(v)) findings.push({ table: 'Price', column: col, id: p.id, value: v, note: 'fractional tetri' })
      else if (v > 0 && v < floor) findings.push({ table: 'Price', column: col, id: p.id, value: v, note: `under ${formatTetri(asTetri(floor))}` })
    }
  }

  const vintages = await db.wineVintage.findMany({ select: { id: true, price: true } })
  stat('WineVintage.price', vintages.map(v => v.price), 500)
  for (const v of vintages) {
    if (!Number.isInteger(v.price)) findings.push({ table: 'WineVintage', column: 'price', id: v.id, value: v.price, note: 'fractional tetri' })
    else if (v.price > 0 && v.price < 500) findings.push({ table: 'WineVintage', column: 'price', id: v.id, value: v.price, note: 'under ₾5' })
  }

  const items = await db.wineOrderItem.findMany({ select: { id: true, priceSnapshot: true } })
  stat('WineOrderItem.priceSnapshot', items.map(i => i.priceSnapshot), 500)
  const extras = await db.orderExtra.findMany({ select: { id: true, amount: true } })
  stat('OrderExtra.amount', extras.map(e => e.amount), 100)
  const pays = await db.payment.findMany({ select: { id: true, amount: true } })
  stat('Payment.amount', pays.map(p => p.amount), 500)

  const snaps = await db.order.findMany({ where: { companyId: { not: null } }, select: { id: true, tastingRateSnapshot: true } })
  const missing = snaps.filter(o => o.tastingRateSnapshot == null).length
  console.log(`\n  Company orders with NO rate snapshot (bug #47 shape): ${missing} of ${snaps.length}`)

  console.log(`\n${'='.repeat(60)}`)
  if (!findings.length) console.log('No implausible or fractional money values found.')
  else {
    console.log(`${findings.length} suspect value(s):\n`)
    for (const f of findings) console.log(`  ${f.table}.${f.column}  ${f.id}  ${f.value}  — ${f.note}`)
  }
  await db.$disconnect()
}
main()
