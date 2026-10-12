// T-8 admin side (vault/Plan-WineOrderFeatures.md Chunk 6a): the winery sets a delivery fee after
// the fact, sees what a paid order still owes, records it — and "Paid" on an unpaid order records
// wines + fee, not just the wines. Fixture orders are written straight to the DB (the public flow
// that makes them is covered by tier2 wine-order-delivery.spec.ts) and removed afterwards.
import { test, expect, Page, Locator } from '@playwright/test'
import * as dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
import { db } from '../../lib/db'
import { loginAsTenantAdmin } from '../helpers/auth'

test.describe.configure({ mode: 'serial' })

const TENANT = process.env.DEFAULT_TENANT_ID!
const RUN = Date.now()
const PAID_NAME = `ZZ FeeAdmin Paid ${RUN}`
const UNPAID_NAME = `ZZ FeeAdmin Unpaid ${RUN}`
let paidId = ''
let unpaidId = ''

const base = {
  tenantId: TENANT, address: 'ZZ Street 1', contactName: 'ZZ', contactPhone: '+995500000051',
  totalAmount: 3000, // 30₾ of wine
}

test.beforeAll(async () => {
  // Paid online for the wine only; the customer chose "Other", so the fee is still to be set.
  const paid = await db.wineOrder.create({
    data: {
      ...base, businessName: PAID_NAME, deliveryFeePending: true, paidAt: new Date(),
      payments: { create: { tenantId: TENANT, provider: 'flitt', method: 'CARD', status: 'approved', amount: 3000, settledAt: new Date() } },
      wineItems: { create: { wineNameSnapshot: 'ZZ Wine', vintageYearSnapshot: 2024, priceSnapshot: 1500, quantity: 2 } },
    },
  })
  paidId = paid.id
  // Unpaid, with a known 15₾ zone fee.
  const unpaid = await db.wineOrder.create({
    data: {
      ...base, businessName: UNPAID_NAME, deliveryZoneName: 'ZZ Zone', deliveryFee: 1500,
      wineItems: { create: { wineNameSnapshot: 'ZZ Wine', vintageYearSnapshot: 2024, priceSnapshot: 1500, quantity: 2 } },
    },
  })
  unpaidId = unpaid.id
})

test.afterAll(async () => {
  await db.wineOrder.deleteMany({ where: { id: { in: [paidId, unpaidId] } } })
})

function card(page: Page, name: string): Locator {
  return page.locator('div.rounded-xl.border.overflow-hidden.flex.flex-col', { has: page.getByText(name, { exact: true }) })
}

async function openWineOrders(page: Page) {
  await page.goto('/admin/wine-orders')
  if (page.url().includes('/admin/login')) await loginAsTenantAdmin(page)
  await page.goto('/admin/wine-orders', { timeout: 90_000 })
}

test('set a fee on a paid order, see it owed, record it', async ({ page }) => {
  test.setTimeout(120_000)
  await openWineOrders(page)
  const c = card(page, PAID_NAME)
  await expect(c.getByText('Delivery fee to set')).toBeVisible({ timeout: 20_000 })

  await c.getByRole('button', { name: 'Set fee' }).click()
  await c.getByRole('spinbutton', { name: 'Delivery fee' }).fill('15')
  await c.getByRole('button', { name: 'Save' }).click()
  await expect(c.getByText('Owes 15₾').first()).toBeVisible()
  await expect(c.getByText('45₾').first()).toBeVisible() // wines 30 + fee 15

  const afterFee = await db.wineOrder.findUniqueOrThrow({ where: { id: paidId }, include: { events: true } })
  expect(afterFee.deliveryFee).toBe(1500)
  expect(afterFee.deliveryFeePending).toBe(false)
  expect(afterFee.totalAmount, 'wines total untouched').toBe(3000)
  expect(afterFee.events.some(e => e.type === 'DELIVERY_FEE_SET')).toBe(true)

  await c.getByRole('button', { name: 'Record payment' }).click()
  await expect(c.getByRole('spinbutton', { name: 'Amount received' })).toHaveValue('15')
  await c.getByRole('combobox', { name: 'How it was paid' }).selectOption('CASH')
  await c.getByRole('button', { name: 'Save' }).click()
  await expect(c.getByText('Owes 15₾')).toHaveCount(0)

  const payments = await db.payment.findMany({ where: { wineOrderId: paidId }, orderBy: { createdAt: 'asc' } })
  expect(payments.map(p => [p.provider, p.amount])).toEqual([['flitt', 3000], ['manual', 1500]])
  expect(payments[1]!.method).toBe('CASH')
})

test('once nothing is owed, Record payment is no longer offered', async ({ page }) => {
  test.setTimeout(90_000)
  await openWineOrders(page)
  const c = card(page, PAID_NAME)
  // Nothing is owed any more, so the control is gone — the UI cannot even offer it.
  await expect(c.getByRole('button', { name: 'Record payment' })).toHaveCount(0)
})

test('"Paid" on an unpaid order records wines + delivery fee', async ({ page }) => {
  test.setTimeout(120_000)
  await openWineOrders(page)
  const c = card(page, UNPAID_NAME)
  await expect(c.getByText('45₾').first()).toBeVisible({ timeout: 20_000 })
  await c.getByRole('button', { name: /Paid/ }).first().click()
  await c.getByRole('button', { name: 'Bank transfer' }).click()
  await expect.poll(async () => (await db.payment.findFirst({ where: { wineOrderId: unpaidId } }))?.amount ?? null, { timeout: 20_000 }).toBe(4500)
})
