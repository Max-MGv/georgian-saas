// T-13 (vault/Plan-WineOrderFeatures.md Chunk 3): a wine-order company with two saved delivery
// addresses — the customer picks the second one, and the order records that address (link +
// snapshot), not the first one and not the typed boxes.
import { test, expect } from '@playwright/test'
import * as dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
import { db } from '../../lib/db'
import { fillPreferredWineDate } from '../helpers/wineForm'

const TENANT = process.env.DEFAULT_TENANT_ID!
const COMPANY = `ZZ Address Test ${Date.now()}`

let companyId = ''
let firstId = ''
let secondId = ''

test.beforeAll(async () => {
  // Test fixture, written directly: no access code and no people, so selecting it opens no
  // popup — this spec is about the address picker only.
  const company = await db.company.create({
    data: {
      name: COMPANY, tenantId: TENANT, isBookingCompany: false, isWineOrderCompany: true,
      addresses: {
        create: [
          { label: 'ZZ Vake', address: 'ZZ Chavchavadze Ave 1', workingHours: '10-22', sortOrder: 0 },
          { label: 'ZZ Saburtalo', address: 'ZZ Pekini Ave 2', workingHours: '12-24', sortOrder: 1 },
        ],
      },
    },
    include: { addresses: { orderBy: { sortOrder: 'asc' } } },
  })
  companyId = company.id
  firstId = company.addresses[0]!.id
  secondId = company.addresses[1]!.id
})

test.afterAll(async () => {
  // Orders first (Payment/OrderContact/items cascade from WineOrder), then the company, whose
  // addresses cascade with it.
  await db.wineOrder.deleteMany({ where: { companyId } })
  await db.company.deleteMany({ where: { id: companyId } })
})

test('picking the second saved address files the order against it', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/wines', { timeout: 90_000 })

  // Any wine will do — the first card's "+" (the named fixture wine can be inactive on dev,
  // see playwright/KNOWN-ISSUES.md).
  await page.getByRole('button', { name: '+', exact: true }).first().click()
  await page.getByRole('button', { name: /^(Checkout|Place Reservation) →$/ }).click()

  await page.locator('select').filter({ has: page.locator('option', { hasText: COMPANY }) }).selectOption({ label: COMPANY })

  // Two saved addresses → a required picker, nothing chosen yet, typed boxes hidden.
  const picker = page.getByRole('combobox', { name: 'Choose a delivery address' })
  await expect(picker).toBeVisible({ timeout: 20_000 })
  await expect(picker).toHaveValue('')
  await expect(page.getByPlaceholder('Actual address of bar / restaurant')).toHaveCount(0)

  // "Other address…" shows the typed boxes; switching back to a saved one hides them again.
  await picker.selectOption({ label: 'Other address…' })
  await expect(page.getByPlaceholder('Actual address of bar / restaurant')).toBeVisible()
  await picker.selectOption({ label: 'ZZ Saburtalo — ZZ Pekini Ave 2' })
  await expect(page.getByPlaceholder('Actual address of bar / restaurant')).toHaveCount(0)
  await expect(page.getByText('Delivering to')).toBeVisible()

  await page.getByPlaceholder('Contact person full name').fill('ZZ Address Tester')
  await page.getByPlaceholder('Contact person phone number').fill('+995500000013')
  await fillPreferredWineDate(page) // T-14: the form requires a preferred date
  await page.getByPlaceholder(/Email address/).fill('zz-address-test@example.com')

  // Online payment may be on or off for this tenant; either way the order exists before any
  // redirect (submitWineOrder creates it first). Never enters card details.
  const submit = page.getByRole('button', { name: /^(Order & Pay|Place Reservation)$/ })
  const paying = (await submit.textContent())?.trim() === 'Order & Pay'
  // Wait for the server action to FINISH, not just for the row to appear: on the paying path
  // it still writes `abandonedAt` after starting checkout, and cleaning up before that lands
  // made it fail with P2025 (seen in the dev-server log on this spec's first version).
  if (paying) {
    await Promise.all([
      page.waitForURL(/pay\.flitt\.com/, { timeout: 30_000, waitUntil: 'commit' }),
      submit.click(),
    ])
  } else {
    await submit.click()
    await expect(page.getByRole('button', { name: /^(Order & Pay|Place Reservation)$/ })).toHaveCount(0, { timeout: 30_000 })
  }
  await expect.poll(async () => db.wineOrder.count({ where: { companyId } }), { timeout: 30_000 }).toBe(1)

  const order = await db.wineOrder.findFirstOrThrow({ where: { companyId } })
  expect(order.companyAddressId).toBe(secondId)
  expect(order.companyAddressId).not.toBe(firstId)
  expect(order.address).toBe('ZZ Pekini Ave 2')
  expect(order.workingHours).toBe('12-24')
  expect(order.addressLabel).toBe('ZZ Saburtalo')
})
