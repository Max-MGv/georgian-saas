// T-12 (vault/Plan-WineOrderFeatures.md Chunk 9): negotiated prices per company.
// - The admin sets / resets one on Companies → Edit → Wine prices.
// - A company proven by its access code SEES its price on /wines, and is charged exactly it.
// - A company with no code is charged its price too, but never online (the customer could not be
//   shown it) — the order is a reservation, and the form says the agreed prices will apply.
import { test, expect, Page } from '@playwright/test'
import * as dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
import { db } from '../../lib/db'
import { loginAsTenantAdmin } from '../helpers/auth'
import { fillPreferredWineDate } from '../helpers/wineForm'

test.describe.configure({ mode: 'serial' })

const TENANT = process.env.DEFAULT_TENANT_ID!
const RUN = Date.now()
const CODED = `ZZ Negotiated Coded ${RUN}`
const OPEN = `ZZ Negotiated Open ${RUN}`
const CODE = `ZZNEG${String(RUN).slice(-5)}`
let codedId = ''
let openId = ''
let vintageId = ''
let standard = 0
let negotiated = 0

test.beforeAll(async () => {
  // The first wine card on /wines (same ordering as the page: wine sortOrder, newest vintage).
  const v = await db.wineVintage.findFirstOrThrow({
    where: { tenantId: TENANT, active: true, wine: { active: true } },
    orderBy: [{ wine: { sortOrder: 'asc' } }, { year: 'desc' }],
  })
  vintageId = v.id
  standard = v.price
  negotiated = Math.max(100, v.price - 500)
  const coded = await db.company.create({ data: { tenantId: TENANT, name: CODED, isBookingCompany: false, isWineOrderCompany: true, accessCode: CODE, wineDiscountPercent: 10 } })
  const open = await db.company.create({ data: { tenantId: TENANT, name: OPEN, isBookingCompany: false, isWineOrderCompany: true,
    winePrices: { create: { wineVintageId: vintageId, price: negotiated } } } })
  codedId = coded.id
  openId = open.id
})

test.afterAll(async () => {
  await db.wineOrder.deleteMany({ where: { companyId: { in: [codedId, openId] } } })
  await db.company.deleteMany({ where: { id: { in: [codedId, openId] } } })
})

async function addTwoAndOpenDrawer(page: Page) {
  await page.goto('/wines', { timeout: 90_000 })
  const plus = page.getByRole('button', { name: '+', exact: true }).first()
  await plus.click(); await plus.click()
  await page.getByRole('button', { name: /^(Checkout|Place Reservation) →$/ }).click()
}

async function fillRest(page: Page) {
  await page.getByPlaceholder('Actual address of bar / restaurant').fill('ZZ Street 9')
  await page.getByPlaceholder('Contact person full name').fill('ZZ Buyer')
  await page.getByPlaceholder('Contact person phone number').fill('+995500000061')
  await page.getByPlaceholder(/Email address/).fill('zz-negotiated@example.invalid')
  await fillPreferredWineDate(page)
}

test('admin sets and resets a negotiated price on the Companies screen', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/admin/companies')
  if (page.url().includes('/admin/login')) await loginAsTenantAdmin(page)
  await page.goto(`/admin/companies?edit=${codedId}`, { timeout: 90_000 })
  const panel = page.locator('div.fixed.top-0.right-0')
  await panel.getByText(/^Wine prices$/).waitFor({ timeout: 20_000 })
  const input = panel.getByRole('spinbutton', { name: /negotiated price$/ }).first()
  await input.fill(String(negotiated / 100))
  await input.blur()
  await expect.poll(async () => (await db.companyWinePrice.findFirst({ where: { companyId: codedId, wineVintageId: vintageId } }))?.price ?? null, { timeout: 15_000 }).toBe(negotiated)

  // Reset → back to standard (row deleted), then set it again for the next test.
  await panel.getByRole('button', { name: 'Standard' }).first().click()
  await expect.poll(async () => db.companyWinePrice.count({ where: { companyId: codedId } }), { timeout: 15_000 }).toBe(0)
  await input.fill(String(negotiated / 100))
  await input.blur()
  await expect.poll(async () => db.companyWinePrice.count({ where: { companyId: codedId } }), { timeout: 15_000 }).toBe(1)
})

test('a company proven by its code sees and is charged its negotiated price (no % on it)', async ({ page }) => {
  test.setTimeout(120_000)
  await addTwoAndOpenDrawer(page)
  await page.locator('select').filter({ has: page.locator('option', { hasText: CODED }) }).selectOption({ label: CODED })
  await page.getByRole('textbox', { name: 'e.g. MARANI42' }).fill(CODE)
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Enter your company code' })).not.toBeVisible()
  // Shown: 2 × the negotiated price, and the company's 10% is NOT taken off it.
  await expect(page.getByText(`${(negotiated * 2) / 100}₾`).first()).toBeVisible()
  await fillRest(page)
  const button = page.getByRole('button', { name: /^(Order & Pay|Place Reservation)$/ })
  if ((await button.textContent())?.trim() === 'Order & Pay') {
    await Promise.all([page.waitForURL(/pay\.flitt\.com/, { timeout: 30_000, waitUntil: 'commit' }), button.click()])
  } else {
    await button.click()
    await expect(page.getByText(/Order received/i)).toBeVisible({ timeout: 30_000 })
  }
  const o = await db.wineOrder.findFirstOrThrow({ where: { companyId: codedId }, include: { wineItems: true, payments: true } })
  expect(o.wineItems[0]!.priceSnapshot).toBe(negotiated)
  expect(o.totalAmount).toBe(negotiated * 2)
  expect(o.discountPercent, 'the % applied to nothing').toBeNull()
  if (o.payments.length) expect(o.payments[0]!.amount).toBe(negotiated * 2)
})

test('a request naming a coded company with the wrong code is refused by the server (KnownBugs #78)', async ({ page }) => {
  test.setTimeout(120_000)
  const before = await db.wineOrder.count({ where: { companyId: codedId } })
  await addTwoAndOpenDrawer(page)
  await page.locator('select').filter({ has: page.locator('option', { hasText: CODED }) }).selectOption({ label: CODED })
  await page.getByRole('textbox', { name: 'e.g. MARANI42' }).fill(CODE)
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Enter your company code' })).not.toBeVisible()
  await fillRest(page)
  // What a crafted request looks like: the company named, but not proven. The form only ever
  // sends the code the guest confirmed; the server must not take the company's word for it.
  await page.locator('input[name="companyCode"]').evaluate((el: HTMLInputElement) => { el.value = 'ZZWRONG' })
  await page.getByRole('button', { name: /^(Order & Pay|Place Reservation)$/ }).click()
  await expect(page.getByText('Please enter your company code again.')).toBeVisible({ timeout: 30_000 })
  expect(page.url()).not.toMatch(/flitt/)
  expect(await db.wineOrder.count({ where: { companyId: codedId } }), 'no order was created').toBe(before)
})

test('a request naming a booking-only company is refused (blind review 2026-10-13)', async ({ page }) => {
  test.setTimeout(120_000)
  // No code, a discount, and not a wine-order company: it is in the public BOOKING dropdown, so
  // its id is easy to find — it must not be usable to file a discounted wine order.
  const bookingOnly = await db.company.create({ data: { tenantId: TENANT, name: `ZZ Booking Only ${RUN}`,
    isBookingCompany: true, isWineOrderCompany: false, wineDiscountPercent: 50 } })
  try {
    await addTwoAndOpenDrawer(page)
    await page.getByPlaceholder('Bar, restaurant, or individual name').fill('ZZ Crafted')
    await fillRest(page)
    await page.locator('input[name="companyId"]').evaluate((el: HTMLInputElement, id: string) => { el.value = id }, bookingOnly.id)
    await page.getByRole('button', { name: /^(Order & Pay|Place Reservation)$/ }).click()
    await expect(page.getByText('Please choose your company again.')).toBeVisible({ timeout: 30_000 })
    expect(await db.wineOrder.count({ where: { companyId: bookingOnly.id } })).toBe(0)
  } finally {
    await db.wineOrder.deleteMany({ where: { companyId: bookingOnly.id } })
    await db.company.delete({ where: { id: bookingOnly.id } })
  }
})

test('a fractional bottle count gets an answer, not a crash (blind review 2026-10-13)', async ({ page }) => {
  test.setTimeout(120_000)
  let tampered = false
  // The cart is sent as JSON inside the server action's form body; alter it in flight.
  await page.route('**/*', async route => {
    const body = route.request().postData()
    if (route.request().method() === 'POST' && route.request().headers()['next-action'] && body?.includes('"quantity":2')) {
      tampered = true
      await route.continue({ postData: body.replace('"quantity":2', '"quantity":0.3') })
      return
    }
    await route.continue()
  })
  await addTwoAndOpenDrawer(page)
  await page.getByPlaceholder('Bar, restaurant, or individual name').fill('ZZ Fraction')
  await fillRest(page)
  await page.getByRole('button', { name: /^(Order & Pay|Place Reservation)$/ }).click()
  await expect(page.getByText('Please check the number of bottles.')).toBeVisible({ timeout: 30_000 })
  expect(tampered).toBe(true)
})

test('a code-less company gets its price applied, but never charged online', async ({ page }) => {
  test.setTimeout(120_000)
  await addTwoAndOpenDrawer(page)
  await page.locator('select').filter({ has: page.locator('option', { hasText: OPEN }) }).selectOption({ label: OPEN })
  await expect(page.getByText('Your company’s agreed prices will be applied — we will confirm the total with you.')).toBeVisible({ timeout: 20_000 })
  // The page never learned the negotiated amount: it still shows the standard price…
  await expect(page.getByText(`${(standard * 2) / 100}₾`).first()).toBeVisible()
  // …and does not offer to charge it.
  await expect(page.getByRole('button', { name: 'Place Reservation', exact: true })).toBeVisible()
  await fillRest(page)
  await page.getByRole('button', { name: 'Place Reservation', exact: true }).click()
  await expect(page.getByText(/Order received/i)).toBeVisible({ timeout: 30_000 })

  const o = await db.wineOrder.findFirstOrThrow({ where: { companyId: openId }, include: { wineItems: true, payments: true } })
  expect(o.wineItems[0]!.priceSnapshot, 'charged the negotiated price').toBe(negotiated)
  expect(o.totalAmount).toBe(negotiated * 2)
  expect(o.payments).toHaveLength(0)
})

test('exporter flag: set on the company, shown and filterable on Wine Orders', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/admin/companies')
  if (page.url().includes('/admin/login')) await loginAsTenantAdmin(page)
  await page.goto(`/admin/companies?edit=${codedId}`, { timeout: 90_000 })
  const panel = page.locator('div.fixed.top-0.right-0')
  await panel.getByRole('checkbox', { name: 'Exporter' }).check()
  await panel.getByRole('button', { name: 'Save changes' }).click()
  await expect.poll(async () => (await db.company.findUnique({ where: { id: codedId } }))?.isExporter, { timeout: 15_000 }).toBe(true)

  // Plain orders for both companies (the paying one from the test above sits on Incomplete, which
  // Wine Orders deliberately never shows).
  const base = { tenantId: TENANT, address: 'ZZ', contactName: 'ZZ', contactPhone: '0', totalAmount: 1000 }
  await db.wineOrder.create({ data: { ...base, businessName: CODED, companyId: codedId } })
  await db.wineOrder.create({ data: { ...base, businessName: OPEN, companyId: openId } })

  await page.goto('/admin/wine-orders', { timeout: 90_000 })
  // The exporter company's order carries the badge…
  const c = page.locator('div.rounded-xl.border.overflow-hidden.flex.flex-col', { has: page.getByText(CODED) })
  await expect(c.getByText('Exporter')).toBeVisible({ timeout: 20_000 })
  // …and the Exporter pill keeps it while hiding the non-exporter company's order.
  await page.getByRole('button', { name: 'Exporter', exact: true }).click()
  await expect(page.getByText(CODED).first()).toBeVisible()
  await expect(page.getByText(OPEN)).toHaveCount(0)
})
