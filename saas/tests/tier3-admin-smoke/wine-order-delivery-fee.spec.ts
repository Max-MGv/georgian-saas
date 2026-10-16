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
const OWES_NAME = `ZZ FeeAdmin Owes ${RUN}`
const PICKUP_NAME = `ZZ FeeAdmin Pickup ${RUN}`
let paidId = ''
let unpaidId = ''
let owesId = ''
let pickupId = ''

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
  // Paid for the wine; the 15₾ fee was set afterwards and is still owed (Chunk 6b's card link).
  const owes = await db.wineOrder.create({
    data: {
      ...base, businessName: OWES_NAME, deliveryZoneName: 'ZZ Zone', deliveryFee: 1500, paidAt: new Date(),
      payments: { create: { tenantId: TENANT, provider: 'flitt', method: 'CARD', status: 'approved', amount: 3000, settledAt: new Date() } },
      wineItems: { create: { wineNameSnapshot: 'ZZ Wine', vintageYearSnapshot: 2024, priceSnapshot: 1500, quantity: 2 } },
    },
  })
  owesId = owes.id
  const pickup = await db.wineOrder.create({
    data: {
      ...base, address: '', businessName: PICKUP_NAME, fulfilment: 'PICKUP',
      wineItems: { create: { wineNameSnapshot: 'ZZ Wine', vintageYearSnapshot: 2024, priceSnapshot: 1500, quantity: 2 } },
    },
  })
  pickupId = pickup.id
})

test.afterAll(async () => {
  await db.wineOrder.deleteMany({ where: { id: { in: [paidId, unpaidId, owesId, pickupId] } } })
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

test('a card payment link for an owed fee creates a checkout for exactly that amount', async ({ page }) => {
  test.setTimeout(120_000)
  await openWineOrders(page)
  const c = card(page, OWES_NAME)
  await expect(c.getByText('Owes 15₾').first()).toBeVisible({ timeout: 20_000 })
  await c.getByRole('button', { name: 'Card payment link' }).click()
  await expect(c.getByRole('button', { name: 'Copy link' })).toBeVisible({ timeout: 30_000 })
  await expect(c.getByRole('button', { name: 'Show QR code' })).toBeVisible()

  // A real (test-merchant) Flitt checkout for the balance only, waiting for the customer — the
  // balance does not move until Flitt settles it.
  const checkout = await db.payment.findFirst({ where: { wineOrderId: owesId, provider: 'flitt', settledAt: null } })
  expect(checkout?.amount).toBe(1500)
  expect(checkout?.checkoutUrl).toMatch(/flitt/)
  expect(checkout?.flittOrderId, 'a fresh Flitt reference, never the order id itself').toMatch(new RegExp(`^${owesId}-topup-`))
})

test('an unpaid card link is shown on the card, so it is not collected twice by accident', async ({ page }) => {
  test.setTimeout(90_000)
  await openWineOrders(page) // a fresh load: the link from the test above is read back from the DB
  const c = card(page, OWES_NAME)
  await expect(c.getByText(/A card link for 15₾ was created on .* and is not paid yet/)).toBeVisible({ timeout: 20_000 })
})

test('paying more than is owed shows as a credit, not as "nothing owed" (blind review 2026-10-13)', async ({ page }) => {
  test.setTimeout(120_000)
  await openWineOrders(page)
  // PAID_NAME: wine 30₾ by card + the 15₾ fee recorded in cash above → 45₾ paid. Lower the fee to 10₾.
  const c = card(page, PAID_NAME)
  await c.getByRole('button', { name: 'Change fee' }).click()
  await c.getByRole('spinbutton', { name: 'Delivery fee' }).fill('10')
  await c.getByRole('button', { name: 'Save' }).click()
  await expect(c.getByText('Credit (overpaid) 5₾').first()).toBeVisible()
  // …and it survives a reload (the server's figure, not just the optimistic one).
  await openWineOrders(page)
  await expect(card(page, PAID_NAME).getByText('Credit (overpaid) 5₾').first()).toBeVisible({ timeout: 20_000 })
  await expect(card(page, PAID_NAME).getByRole('button', { name: 'Record payment' })).toHaveCount(0)
})

test('the Delivery / Pickup filter narrows the list', async ({ page }) => {
  test.setTimeout(90_000)
  await openWineOrders(page)
  await expect(page.getByText(PICKUP_NAME, { exact: true })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Pickup', exact: true }).first().click()
  await expect(page.getByText(PICKUP_NAME, { exact: true })).toBeVisible()
  await expect(page.getByText(UNPAID_NAME, { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Pickup', exact: true }).first().click() // toggle off
  await page.getByRole('button', { name: 'Delivery', exact: true }).first().click()
  await expect(page.getByText(UNPAID_NAME, { exact: true })).toBeVisible()
  await expect(page.getByText(PICKUP_NAME, { exact: true })).toHaveCount(0)
})

test('the winery can set and change the preferred date on an order (T-14)', async ({ page }) => {
  test.setTimeout(90_000)
  await openWineOrders(page)
  const c = card(page, UNPAID_NAME)
  await expect(c.getByText('No date')).toBeVisible({ timeout: 20_000 })
  await c.getByRole('button', { name: 'Set date' }).click()
  await c.getByPlaceholder('DD/MM/YYYY').fill('15/11/2030')
  await c.getByRole('button', { name: 'Save' }).click()
  await expect(c.getByText('15 Nov 2030').first()).toBeVisible()

  const o = await db.wineOrder.findUniqueOrThrow({ where: { id: unpaidId }, include: { events: true } })
  expect(o.preferredDate?.toISOString().slice(0, 10)).toBe('2030-11-15')
  const ev = o.events.find(e => e.type === 'PREFERRED_DATE_CHANGED')
  expect(ev?.payload).toEqual({ from: null, to: '2030-11-15' })
})
