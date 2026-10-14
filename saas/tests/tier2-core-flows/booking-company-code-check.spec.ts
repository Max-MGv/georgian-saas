// KnownBugs #78, booking half: a company booking must prove its company on the SERVER.
// The form asks for the company's code, but the booking request itself only names the company;
// before the fix, a request naming a coded company with no (or a wrong) code was priced at that
// company's tiers. Here the guest confirms the right code on the form, and the request is then
// altered in flight to carry a wrong one — what a crafted request looks like.
import { test, expect } from '@playwright/test'
import * as dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
import { db } from '../../lib/db'

const TENANT = process.env.DEFAULT_TENANT_ID!
const RUN = Date.now()
const COMPANY = `ZZ Code Check ${RUN}`
const CODE = `ZZCHK${String(RUN).slice(-5)}`
let companyId = ''

test.beforeAll(async () => {
  const c = await db.company.create({ data: {
    tenantId: TENANT, name: COMPANY, isBookingCompany: true, isWineOrderCompany: false, accessCode: CODE,
    prices: { create: { minGuests: 1, maxGuests: 50, pricePerPerson: 4321, tastingLunchPricePerPerson: 2000 } }, // 4321: easy to spot
  } })
  companyId = c.id
})

test.afterAll(async () => {
  await db.order.deleteMany({ where: { companyId } })
  await db.company.deleteMany({ where: { id: companyId } })
})

function formatDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

test('a company booking whose code was changed in flight is refused, and nothing is booked', async ({ page }) => {
  test.setTimeout(150_000)
  let tampered = false
  // Booking is a server action: a POST carrying a `next-action` header and the payload as JSON.
  await page.route('**/*', async route => {
    const req = route.request()
    const body = req.postData()
    if (req.method() === 'POST' && req.headers()['next-action'] && body?.includes(`"companyCode":"${CODE}"`)) {
      tampered = true
      await route.continue({ postData: body.replace(`"companyCode":"${CODE}"`, '"companyCode":"ZZWRONG"') })
      return
    }
    await route.continue()
  })

  await page.goto('/', { timeout: 90_000 })
  await page.getByRole('button', { name: 'Tour Company' }).click()
  await page.getByRole('combobox').first().selectOption({ label: COMPANY })
  await page.getByRole('heading', { name: 'Enter your company code' }).waitFor()
  await page.getByRole('textbox', { name: 'e.g. MARANI42' }).fill(CODE)
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Enter your company code' })).not.toBeVisible()

  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  await page.getByRole('textbox', { name: 'DD/MM/YYYY' }).fill(formatDate(tomorrow))
  await page.getByRole('spinbutton').first().fill('4')
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill(`ZZCodeCheck ${RUN}`)
  await page.getByRole('textbox', { name: 'Phone', exact: true }).fill('+995500000078')
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(`zz-code-check-${RUN}@example.invalid`)

  await page.getByRole('button', { name: /^(Book & Pay|Request Booking)$/ }).click()
  await expect(page.getByRole('heading', { name: 'Review your visit' })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /^Confirm & / }).click()

  await expect(page.getByText('Incorrect code — please try again or contact the winery.').first()).toBeVisible({ timeout: 30_000 })
  expect(tampered, 'the request carried the confirmed code, and the test replaced it').toBe(true)
  expect(page.url()).not.toMatch(/flitt/)
  expect(await db.order.count({ where: { companyId } }), 'no booking was created').toBe(0)
})

test('a company with no code is not offered, and a booking naming it is refused (Max, 2026-10-14)', async ({ page }) => {
  test.setTimeout(150_000)
  // Booking tiers but no access code: an unknown company — "otherwise the code loses meaning".
  const bare = await db.company.create({ data: {
    tenantId: TENANT, name: `ZZ No Code ${RUN}`, isBookingCompany: true, isWineOrderCompany: false,
    prices: { create: { minGuests: 1, maxGuests: 50, pricePerPerson: 100, tastingLunchPricePerPerson: 200 } },
  } })
  try {
    let tampered = false
    // Book as the coded company with its right code, then swap in the code-less company's id.
    await page.route('**/*', async route => {
      const req = route.request()
      const body = req.postData()
      if (req.method() === 'POST' && req.headers()['next-action'] && body?.includes(`"companyId":"${companyId}"`) && body.includes(`"companyCode":"${CODE}"`)) {
        tampered = true
        await route.continue({ postData: body.replace(`"companyId":"${companyId}"`, `"companyId":"${bare.id}"`).replace(`"companyCode":"${CODE}"`, '"companyCode":""') })
        return
      }
      await route.continue()
    })

    await page.goto('/', { timeout: 90_000 })
    await page.getByRole('button', { name: 'Tour Company' }).click()
    await expect(page.locator('option', { hasText: COMPANY })).toHaveCount(1)
    await expect(page.locator('option', { hasText: bare.name }), 'not offered without a code').toHaveCount(0)
    // The page source no longer carries any company's price tiers. The public (Individuals) tiers
    // ARE there — proof this check can see a tier in whatever escaping the page uses.
    const html = await page.content()
    expect(html).toMatch(/pricePerPerson[^:]{0,3}:/)
    expect(html, "the coded company's tier is not in the page before its code").not.toMatch(/pricePerPerson[^:]{0,3}: *4321[^0-9]/)
    expect(html, "nor the code-less company's").not.toMatch(/pricePerPerson[^:]{0,3}: *100[^0-9]/)

    await page.getByRole('combobox').first().selectOption({ label: COMPANY })
    await page.getByRole('textbox', { name: 'e.g. MARANI42' }).fill(CODE)
    await page.getByRole('button', { name: 'Confirm', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Enter your company code' })).not.toBeVisible()
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    await page.getByRole('textbox', { name: 'DD/MM/YYYY' }).fill(formatDate(tomorrow))
    await page.getByRole('spinbutton').first().fill('4')
    await page.getByRole('textbox', { name: 'Name', exact: true }).fill(`ZZNoCode ${RUN}`)
    await page.getByRole('textbox', { name: 'Phone', exact: true }).fill('+995500000079')
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill(`zz-no-code-${RUN}@example.invalid`)
    await page.getByRole('button', { name: /^(Book & Pay|Request Booking)$/ }).click()
    await expect(page.getByRole('heading', { name: 'Review your visit' })).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: /^Confirm & / }).click()

    await expect(page.getByText('Incorrect code — please try again or contact the winery.').first()).toBeVisible({ timeout: 30_000 })
    expect(tampered).toBe(true)
    expect(await db.order.count({ where: { companyId: bare.id } }), 'no booking for the code-less company').toBe(0)
  } finally {
    await db.order.deleteMany({ where: { companyId: bare.id } })
    await db.company.delete({ where: { id: bare.id } })
  }
})
