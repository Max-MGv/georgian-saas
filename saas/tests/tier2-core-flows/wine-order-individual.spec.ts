// T-9 (vault/Plan-WineOrderFeatures.md Chunk 10): ordering wine as a private person.
// The Individual switch hides every business field, drops a company chosen before switching,
// and the order is stored as INDIVIDUAL with the person's name — and shown so in admin.
import { test, expect } from '@playwright/test'
import * as dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
import { db } from '../../lib/db'
import { loginAsTenantAdmin } from '../helpers/auth'
import { fillPreferredWineDate } from '../helpers/wineForm'

const TENANT = process.env.DEFAULT_TENANT_ID!
const RUN = Date.now()
const PERSON = `ZZ Individual ${RUN}`
const COMPANY = `ZZ Individual Co ${RUN}`
let companyId = ''

test.beforeAll(async () => {
  companyId = (await db.company.create({ data: { tenantId: TENANT, name: COMPANY, isBookingCompany: false, isWineOrderCompany: true } })).id
})
test.afterAll(async () => {
  await db.wineOrder.deleteMany({ where: { tenantId: TENANT, businessName: PERSON } })
  await db.company.deleteMany({ where: { id: companyId } })
})

test('an individual wine order: business fields hidden, stored as INDIVIDUAL, marked in admin', async ({ page }) => {
  test.setTimeout(150_000)
  await page.goto('/wines', { timeout: 90_000 })
  const plus = page.getByRole('button', { name: '+', exact: true }).first()
  await plus.click(); await plus.click()
  await page.getByRole('button', { name: /^(Checkout|Place Reservation) →$/ }).click()

  // Company first (the default), pick one, then switch: the company must not ride along.
  await page.locator('select').filter({ has: page.locator('option', { hasText: COMPANY }) }).selectOption({ label: COMPANY })
  await page.getByRole('radio', { name: 'Individual' }).click()
  await expect(page.getByPlaceholder('Bar, restaurant, or individual name')).toHaveCount(0)
  await expect(page.getByPlaceholder('LLC identification number')).toHaveCount(0)
  await expect(page.locator('select').filter({ has: page.locator('option', { hasText: COMPANY }) })).toHaveCount(0)

  await page.getByPlaceholder('Delivery address').fill('ZZ Home Street 3')
  await page.getByPlaceholder('Your full name').fill(PERSON)
  await page.getByPlaceholder('Phone number').fill('+995500000071')
  await page.getByPlaceholder(/Email address/).fill('zz-individual@example.invalid')
  await fillPreferredWineDate(page)

  const button = page.getByRole('button', { name: /^(Order & Pay|Place Reservation)$/ })
  if ((await button.textContent())?.trim() === 'Order & Pay') {
    await Promise.all([page.waitForURL(/pay\.flitt\.com/, { timeout: 30_000, waitUntil: 'commit' }), button.click()])
  } else {
    await button.click()
    await expect(page.getByText(/Order received/i)).toBeVisible({ timeout: 30_000 })
  }

  const o = await db.wineOrder.findFirstOrThrow({ where: { tenantId: TENANT, businessName: PERSON } })
  expect(o.customerType).toBe('INDIVIDUAL')
  expect(o.companyId, 'the company chosen before switching is dropped').toBeNull()
  expect(o.contactName).toBe(PERSON)
  expect(o.llcName).toBeNull()
  expect(o.address).toBe('ZZ Home Street 3')

  // Admin: the order (restored from Incomplete if it went to the gateway) carries the mark.
  if (o.abandonedAt) await db.wineOrder.update({ where: { id: o.id }, data: { abandonedAt: null } })
  await page.goto('/admin/wine-orders')
  if (page.url().includes('/admin/login')) await loginAsTenantAdmin(page)
  await page.goto('/admin/wine-orders', { timeout: 90_000 })
  const card = page.locator(`#wine-order-${o.id}`)
  await expect(card.getByText('Individual', { exact: true })).toBeVisible({ timeout: 20_000 })
})
