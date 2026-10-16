// T-8 (vault/Plan-WineOrderFeatures.md Chunk 5): minimum order, delivery zones with fees,
// "Other" area in both of the winery's modes, and pickup — on the public /wines form, with the
// amount that actually reaches the payment gateway read back from the Payment row.
//
// ⚠️ Changes TENANT-WIDE settings (rules + zones) on Staging Winery while it runs, so the tests
// in this file run one after another, and everything is put back in afterAll. Do not run it in
// parallel with other /wines specs: with zones present the public form asks for a delivery area,
// which those specs do not answer (the same hazard payment-amount-integrity.spec.ts documents
// for its payment toggles).
import { test, expect, Page } from '@playwright/test'
import * as dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
import { db } from '../../lib/db'
import { fillPreferredWineDate } from '../helpers/wineForm'

test.describe.configure({ mode: 'serial' })

const TENANT = process.env.DEFAULT_TENANT_ID!
const RUN = Date.now()
const RULE_KEYS = ['wine_min_order_type', 'wine_min_order_value', 'wine_pickup_enabled', 'wine_unknown_zone_payment']
const ZONE_FEE = 1500 // 15₾, tetri

let originalRules: { key: string; value: string }[] = []
let zoneId = ''

async function setRules(rules: Record<string, string>) {
  for (const [key, value] of Object.entries(rules)) {
    await db.setting.upsert({
      where: { key_tenantId: { key, tenantId: TENANT } },
      update: { value },
      create: { key, value, tenantId: TENANT },
    })
  }
}

test.beforeAll(async () => {
  originalRules = await db.setting.findMany({ where: { tenantId: TENANT, key: { in: RULE_KEYS } }, select: { key: true, value: true } })
  const zone = await db.deliveryZone.create({ data: { tenantId: TENANT, nameEn: `ZZ Zone ${RUN}`, fee: ZONE_FEE } })
  zoneId = zone.id
})

test.afterAll(async () => {
  await db.wineOrder.deleteMany({ where: { tenantId: TENANT, businessName: { startsWith: `ZZ Delivery ${RUN}` } } })
  await db.deliveryZone.deleteMany({ where: { id: zoneId } })
  await db.setting.deleteMany({ where: { tenantId: TENANT, key: { in: RULE_KEYS } } })
  if (originalRules.length) await setRules(Object.fromEntries(originalRules.map(r => [r.key, r.value])))
})

/** Adds `bottles` of the first wine on the page and opens the order drawer. Returns its unit price (tetri). */
async function openDrawerWith(page: Page, bottles: number): Promise<number> {
  await page.goto('/wines', { timeout: 90_000 })
  const plus = page.getByRole('button', { name: '+', exact: true }).first()
  for (let i = 0; i < bottles; i++) await plus.click()
  const vintage = await db.wineVintage.findFirst({ where: { tenantId: TENANT, active: true, wine: { active: true } }, orderBy: [{ wine: { sortOrder: 'asc' } }, { year: 'desc' }] })
  await page.getByRole('button', { name: /^(Checkout|Place Reservation) →$/ }).click()
  return vintage!.price
}

async function fillContact(page: Page, tag: string, { pickup = false } = {}) {
  await page.getByPlaceholder('Bar, restaurant, or individual name').fill(`ZZ Delivery ${RUN} ${tag}`)
  // A delivery with no company needs a typed address (the browser's own `required` check blocks
  // the submit otherwise — what this spec's first version tripped on). A pickup has no box.
  if (!pickup) await page.getByPlaceholder('Actual address of bar / restaurant').fill('ZZ Street 1')
  await page.getByPlaceholder('Contact person full name').fill('ZZ Delivery Tester')
  await page.getByPlaceholder('Contact person phone number').fill('+995500000041')
  await fillPreferredWineDate(page) // T-14: the form requires a preferred date
  await page.getByPlaceholder(/Email address/).fill(`zz-delivery-${RUN}@example.invalid`)
}

/** Submits and waits for the server action to finish either way (gateway redirect or success). */
async function submit(page: Page): Promise<'paid' | 'reserved'> {
  const button = page.getByRole('button', { name: /^(Order & Pay|Place Reservation)$/ })
  if ((await button.textContent())?.trim() === 'Order & Pay') {
    await Promise.all([page.waitForURL(/pay\.flitt\.com/, { timeout: 30_000, waitUntil: 'commit' }), button.click()])
    return 'paid'
  }
  await button.click()
  // Not "the button is gone": while pending it reads "Sending...", which matched before the order
  // existed. The "Place another order" success screen only appears once the action has returned.
  await expect(page.getByText(/Place another|order received|reservation received/i).first()).toBeVisible({ timeout: 30_000 })
  return 'reserved'
}

async function orderFor(tag: string) {
  return db.wineOrder.findFirstOrThrow({
    where: { tenantId: TENANT, businessName: `ZZ Delivery ${RUN} ${tag}` },
    include: { payments: true },
  })
}

test('a minimum order blocks submitting below it', async ({ page }) => {
  test.setTimeout(120_000)
  await setRules({ wine_min_order_type: 'bottles', wine_min_order_value: '3' })
  await openDrawerWith(page, 2)
  await expect(page.getByText('Minimum order: 3 bottles').first()).toBeVisible()
  await expect(page.getByRole('button', { name: /^(Order & Pay|Place Reservation)$/ })).toBeDisabled()
  await setRules({ wine_min_order_type: 'off', wine_min_order_value: '' })
})

test('a delivery zone adds its fee to the total and to the amount charged', async ({ page }) => {
  test.setTimeout(120_000)
  const unit = await openDrawerWith(page, 2)
  await page.getByRole('combobox', { name: 'Choose your delivery area' }).selectOption(zoneId)
  await expect(page.getByText(`Delivery — ZZ Zone ${RUN}`)).toBeVisible()
  await fillContact(page, 'zone')
  const mode = await submit(page)

  const o = await orderFor('zone')
  expect(o.fulfilment).toBe('DELIVERY')
  expect(o.deliveryZoneId).toBe(zoneId)
  expect(o.deliveryZoneName).toBe(`ZZ Zone ${RUN}`)
  expect(o.deliveryFee).toBe(ZONE_FEE)
  expect(o.deliveryFeePending).toBe(false)
  expect(o.totalAmount, 'totalAmount stays wines-only').toBe(unit * 2)
  if (mode === 'paid') expect(o.payments[0]?.amount, 'gateway amount = wines + fee').toBe(unit * 2 + ZONE_FEE)
})

test('"Other" area, winery lets them pay for the wine now: fee pending, wines-only charge', async ({ page }) => {
  test.setTimeout(120_000)
  await setRules({ wine_unknown_zone_payment: 'pay_wine_now' })
  const unit = await openDrawerWith(page, 2)
  await page.getByRole('combobox', { name: 'Choose your delivery area' }).selectOption('other')
  await expect(page.getByText('fee to be confirmed')).toBeVisible()
  await fillContact(page, 'other-pay')
  const mode = await submit(page)

  const o = await orderFor('other-pay')
  expect(o.deliveryFeePending).toBe(true)
  expect(o.deliveryFee).toBeNull()
  if (mode === 'paid') expect(o.payments[0]?.amount).toBe(unit * 2)
})

test('"Other" area, winery takes it as a reservation: no checkout at all', async ({ page }) => {
  test.setTimeout(120_000)
  await setRules({ wine_unknown_zone_payment: 'reservation' })
  await openDrawerWith(page, 2)
  await page.getByRole('combobox', { name: 'Choose your delivery area' }).selectOption('other')
  // The button no longer offers to pay, whatever the payment toggle says.
  await expect(page.getByRole('button', { name: 'Place Reservation', exact: true })).toBeVisible()
  await fillContact(page, 'other-reserve')
  expect(await submit(page)).toBe('reserved')

  const o = await orderFor('other-reserve')
  expect(o.deliveryFeePending).toBe(true)
  expect(o.abandonedAt, 'never sent to the gateway').toBeNull()
  expect(o.payments).toHaveLength(0)
})

test('pickup needs no address and records no delivery', async ({ page }) => {
  test.setTimeout(120_000)
  await setRules({ wine_pickup_enabled: 'true' })
  await openDrawerWith(page, 2)
  await page.getByRole('radio', { name: 'Pickup at the winery' }).click()
  await expect(page.getByPlaceholder('Actual address of bar / restaurant')).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: 'Choose your delivery area' })).toHaveCount(0)
  await fillContact(page, 'pickup', { pickup: true })
  await submit(page)

  const o = await orderFor('pickup')
  expect(o.fulfilment).toBe('PICKUP')
  expect(o.address).toBe('')
  expect(o.deliveryFee).toBeNull()
  expect(o.deliveryZoneId).toBeNull()
})

test('preferred date: a Closed Day is refused, and the chosen day is stored (T-14)', async ({ page }) => {
  test.setTimeout(120_000)
  const iso = (daysAhead: number) => {
    const d = new Date(); d.setDate(d.getDate() + daysAhead)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const closed = iso(20)
  // Reuse the winery's own Closed Day if it already has one there; otherwise add and remove ours.
  const existing = await db.blockedDate.findFirst({ where: { tenantId: TENANT, date: new Date(closed) } })
  const made = existing ? null : await db.blockedDate.create({ data: { tenantId: TENANT, date: new Date(closed), reason: 'ZZ test' } })
  try {
    await openDrawerWith(page, 2)
    // Zones exist in this file, so the (required) area must be answered or the browser blocks submit.
    await page.getByRole('combobox', { name: 'Choose your delivery area' }).selectOption(zoneId)
    await fillContact(page, 'date')
    await fillPreferredWineDate(page, 20)
    await expect(page.getByText('We are closed on that day — please choose another.')).toBeVisible()
    await expect(page.getByRole('button', { name: /^(Order & Pay|Place Reservation)$/ })).toBeDisabled()

    await fillPreferredWineDate(page, 21)
    await expect(page.getByText('This is your preferred day — we will confirm the exact day with you.')).toBeVisible()
    await submit(page)
    const o = await orderFor('date')
    expect(o.preferredDate?.toISOString().slice(0, 10)).toBe(iso(21))
  } finally {
    if (made) await db.blockedDate.delete({ where: { id: made.id } })
  }
})

test("a saved address's delivery area is used, not chosen — even by a doctored request (Max, 2026-10-14)", async ({ page }) => {
  test.setTimeout(150_000)
  await setRules({ wine_min_order_type: 'off', wine_pickup_enabled: 'false' })
  const code = `ZZAREA${String(RUN).slice(-5)}`
  const company = await db.company.create({ data: {
    tenantId: TENANT, name: `ZZ Delivery ${RUN} Area Co`, isWineOrderCompany: true, isBookingCompany: false, accessCode: code,
    addresses: { create: { label: 'Main bar', address: 'ZZ Area Street 7', deliveryZoneId: zoneId } },
  } })
  try {
    await openDrawerWith(page, 2)
    await page.locator('select').filter({ has: page.locator('option', { hasText: company.name }) }).selectOption({ label: company.name })
    await page.getByRole('textbox', { name: 'e.g. MARANI42' }).fill(code)
    await page.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Enter your company code' })).not.toBeVisible()

    // The one saved address is chosen, and its area is shown as fact, not offered as a choice.
    await expect(page.getByText(`Delivery area: ZZ Zone ${RUN} — 15₾`)).toBeVisible({ timeout: 20_000 })
    await expect(page.getByRole('combobox', { name: 'Choose your delivery area' })).toHaveCount(0)

    await page.getByPlaceholder('Contact person full name').fill('ZZ Area Tester')
    await page.getByPlaceholder('Contact person phone number').fill('+995500000042')
    await page.getByPlaceholder(/Email address/).fill(`zz-area-${RUN}@example.invalid`)
    await fillPreferredWineDate(page)
    // A doctored request: "Other" would mean no fee now. The server must use the address's area.
    await page.locator('input[name="deliveryZone"]').evaluate((el: HTMLInputElement) => { el.value = 'other' })
    await submit(page)

    const o = await db.wineOrder.findFirstOrThrow({ where: { companyId: company.id } })
    expect(o.deliveryZoneId).toBe(zoneId)
    expect(o.deliveryFee).toBe(ZONE_FEE)
    expect(o.deliveryFeePending).toBe(false)
  } finally {
    await db.wineOrder.deleteMany({ where: { companyId: company.id } })
    await db.company.delete({ where: { id: company.id } })
  }
})
