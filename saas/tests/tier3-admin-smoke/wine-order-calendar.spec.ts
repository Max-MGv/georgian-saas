// T-14 (vault/Plan-WineOrderFeatures.md Chunk 8): Wine Orders → Calendar shows orders on their
// PREFERRED date, lists undated ones under the grid, and opens the order's card from either.
import { test, expect } from '@playwright/test'
import * as dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
import { db } from '../../lib/db'
import { loginAsTenantAdmin } from '../helpers/auth'

const TENANT = process.env.DEFAULT_TENANT_ID!
const RUN = Date.now()
const DATED = `ZZ Cal Dated ${RUN}`
const UNDATED = `ZZ Cal Undated ${RUN}`
const ids: string[] = []

// The 25th of the current month (or the 3rd, near month end) — always on the grid that opens.
const now = new Date()
const day = now.getDate() > 24 ? 3 : 25
const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

test.beforeAll(async () => {
  const base = { tenantId: TENANT, address: 'ZZ', contactName: 'ZZ', contactPhone: '0', totalAmount: 3000,
    wineItems: { create: { wineNameSnapshot: 'ZZ Wine', vintageYearSnapshot: 2024, priceSnapshot: 1500, quantity: 2 } } }
  ids.push((await db.wineOrder.create({ data: { ...base, businessName: DATED, preferredDate: new Date(iso) } })).id)
  ids.push((await db.wineOrder.create({ data: { ...base, businessName: UNDATED } })).id)
})
test.afterAll(async () => { await db.wineOrder.deleteMany({ where: { id: { in: ids } } }) })

test('calendar by preferred date, undated list, and back to the card', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/admin/wine-orders')
  if (page.url().includes('/admin/login')) await loginAsTenantAdmin(page)
  await page.goto('/admin/wine-orders', { timeout: 90_000 })

  await page.getByRole('button', { name: 'Calendar', exact: true }).click()
  await expect(page.getByRole('button', { name: '‹', exact: true })).toBeVisible()

  // The day cell for the preferred date carries a count; clicking it lists the order.
  const cell = page.locator('div.grid.grid-cols-7.relative > button').filter({ has: page.locator('span', { hasText: new RegExp(`^${day}$`) }) })
  await expect(cell.locator('span.rounded-full')).toBeVisible({ timeout: 20_000 })
  await cell.click()
  await expect(page.getByText(DATED, { exact: true }).last()).toBeVisible()

  // Undated orders are listed under the grid.
  await expect(page.getByText('No preferred date', { exact: false })).toBeVisible()
  await expect(page.getByText(UNDATED, { exact: true })).toBeVisible()

  // Opening one goes back to Cards with that order's card on screen.
  await page.getByText(UNDATED, { exact: true }).click()
  await expect(page.locator(`#wine-order-${ids[1]}`)).toBeVisible({ timeout: 15_000 })
})
