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
    prices: { create: { minGuests: 1, maxGuests: 50, pricePerPerson: 1000, tastingLunchPricePerPerson: 2000 } },
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
