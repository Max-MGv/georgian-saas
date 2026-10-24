// KnownBugs #93 + T-152 (Plan-PricingModel Chunk 7): the public booking action must refuse a request that was
// altered on its way to the server — negative or forged guest boxes, a negative masterclass quantity, a visit
// type that contradicts the boxes (Q-3), a product the company does not offer, Lunch only for an individual —
// and must ignore boxes on a layout that does not use them. Each test submits a real booking through the public
// form, rewrites the server-action payload in flight, then reads the DEV database.
//
// Run: npx playwright test tests/tier2-core-flows/booking-tampered-quantities.spec.ts --workers=1
// Needs the dev tenant with the detailed company form ON (enable_enhanced_company_booking=true) — the staging
// resting state (playwright/notes/05). Creates its own throwaway company + cleans every row it made.
import { test, expect, Page } from '@playwright/test'
import * as dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
import { db } from '../../lib/db'

const TENANT = process.env.DEFAULT_TENANT_ID!
const RUN = Date.now()
const COMPANY = `ZZ Tamper ${RUN}`
const CODE = `ZZTMP${String(RUN).slice(-6)}`
let companyId = ''
let mcItemId = ''
let groupId = ''

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  // Tasting only ₾50 and Tasting & Lunch ₾80 on every row; Lunch only NOT offered.
  const c = await db.company.create({ data: {
    tenantId: TENANT, name: COMPANY, isBookingCompany: true, isWineOrderCompany: false, accessCode: CODE,
    prices: { create: { minGuests: 1, maxGuests: 50, tastingOnlyPrice: 5000, lunchOnlyPrice: null, tastingLunchPrice: 8000 } },
  } })
  companyId = c.id
  // Its own throwaway add-on: a PER-PIECE item in a group offered to companies on every visit type. A per-person item
  // would not do for the quantity attack any more — since T-7 the server sets a per-person quantity itself (the paying
  // guests) and ignores whatever the request says, so only a typed (per-piece) quantity can be forged.
  const g = await db.addOnGroup.create({ data: { tenantId: TENANT, nameEn: `ZZ Tamper group ${RUN}`, showToCompanies: true, showToIndividuals: false } })
  groupId = g.id
  const mc = await db.masterclassItem.create({ data: { tenantId: TENANT, groupId, name: `ZZ Tamper piece ${RUN}`, unitType: 'PER_PIECE', pricePerUnit: 1000, active: true } })
  mcItemId = mc.id
})

test.afterAll(async () => {
  await db.order.deleteMany({ where: { tenantId: TENANT, email: { contains: `zz-tamper-${RUN}` } } })
  await db.order.deleteMany({ where: { companyId } })
  await db.company.deleteMany({ where: { id: companyId } })
  await db.masterclassItem.deleteMany({ where: { id: mcItemId } })
  await db.addOnGroup.deleteMany({ where: { id: groupId } })
})

const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 2); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` }

/** Rewrites the first createBooking call's payload (arg 0 of the server-action JSON body). */
async function tamper(page: Page, edit: (d: Record<string, unknown>) => void) {
  const state = { done: false }
  await page.route('**/*', async route => {
    const req = route.request()
    const body = req.postData()
    if (!state.done && req.method() === 'POST' && req.headers()['next-action'] && body?.includes('"timeSlot"')) {
      const args = JSON.parse(body)
      edit(args[0])
      state.done = true
      await route.continue({ postData: JSON.stringify(args) })
      return
    }
    await route.continue()
  })
  return state
}

async function submit(page: Page) {
  await page.getByRole('button', { name: /^(Book & Pay|Request Booking)$/ }).click()
  await expect(page.getByRole('heading', { name: 'Review your visit' })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: /^Confirm & / }).click()
}

/** A valid detailed company booking (4 Tasting & Lunch) up to the point of submitting. */
async function fillCompany(page: Page, email: string) {
  await page.goto('/', { timeout: 90_000 })
  await page.getByRole('button', { name: 'Tour Company' }).click()
  await page.getByRole('combobox').first().selectOption({ label: COMPANY })
  await page.getByRole('heading', { name: 'Enter your company code' }).waitFor()
  await page.getByRole('textbox', { name: 'e.g. MARANI42' }).fill(CODE)
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Enter your company code' })).not.toBeVisible()
  await page.getByRole('button', { name: /^Tasting \+ Lunch/ }).click()
  await page.getByRole('textbox', { name: 'DD/MM/YYYY' }).fill(tomorrow())
  // Boxes in order: Tasting only, Tasting & Lunch, Free (Lunch only is not offered by this company).
  await page.getByRole('spinbutton').nth(1).fill('4')
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('ZZ Tamper Company')
  await page.getByRole('textbox', { name: 'Phone', exact: true }).fill('+995500000193')
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email)
}

async function noOrder(email: string) {
  await new Promise(r => setTimeout(r, 3000))
  return (await db.order.count({ where: { tenantId: TENANT, email } })) === 0
}

const CASES: { name: string; edit: (d: Record<string, unknown>) => void; message: RegExp }[] = [
  { name: 'negative box (the #93 attack: Tasting only −5, Tasting & Lunch 20)', edit: d => { d.boxes = { tastingOnly: -5, lunchOnly: 0, tastingLunch: 20, free: 0 } }, message: /check the number of guests/i },
  { name: 'fractional / string box', edit: d => { d.boxes = { tastingOnly: 0, lunchOnly: 0, tastingLunch: '4', free: 0.5 } }, message: /check the number of guests/i },
  { name: 'negative masterclass quantity', edit: d => { d.masterclassLines = [{ masterclassItemId: mcItemId, quantity: -20, pricePerUnit: 0 }] }, message: /no longer available/i },
  { name: 'unknown masterclass item', edit: d => { d.masterclassLines = [{ masterclassItemId: 'not-a-real-item', quantity: 1 }] }, message: /no longer available/i },
  { name: 'Tasting + Lunch visit with no lunch guest (Q-3)', edit: d => { d.boxes = { tastingOnly: 4, lunchOnly: 0, tastingLunch: 0, free: 0 } }, message: /no one is booked for lunch/i },
  { name: 'a product the company does not offer (Lunch only)', edit: d => { d.boxes = { tastingOnly: 0, lunchOnly: 3, tastingLunch: 4, free: 0 } }, message: /not available/i },
]

for (const [i, c] of CASES.entries()) {
  test(`company: refused — ${c.name}`, async ({ page }) => {
    test.setTimeout(150_000)
    const email = `zz-tamper-${RUN}-c${i}@example.invalid`
    const state = await tamper(page, c.edit)
    await fillCompany(page, email)
    await submit(page)
    await expect(page.getByText(c.message)).toBeVisible({ timeout: 20_000 })
    expect(state.done).toBe(true)
    expect(await noOrder(email)).toBe(true)
  })
}

test('company: an untampered booking is priced on the server (4 × Tasting & Lunch ₾80 = ₾320)', async ({ page }) => {
  test.setTimeout(150_000)
  const email = `zz-tamper-${RUN}-ok@example.invalid`
  await fillCompany(page, email)
  await submit(page)
  await expect(page.getByText('Booking received!')).toBeVisible({ timeout: 30_000 })
  const o = await db.order.findFirst({ where: { tenantId: TENANT, email } })
  expect(o && { total: o.totalPrice, tl: o.tastingLunchGuests, rate: o.tastingLunchRate, guests: o.guestCount }).toEqual({ total: 32000, tl: 4, rate: 8000, guests: 4 })
})

test('individual: forged boxes are ignored — the one guest count is priced (A-4)', async ({ page }) => {
  test.setTimeout(150_000)
  const email = `zz-tamper-${RUN}-ind@example.invalid`
  const state = await tamper(page, d => { d.boxes = { tastingOnly: 1, lunchOnly: 0, tastingLunch: 0, free: 9 } })
  await page.goto('/', { timeout: 90_000 })
  await page.getByRole('textbox', { name: 'DD/MM/YYYY' }).fill(tomorrow())
  await page.getByRole('spinbutton').first().fill('10')
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('ZZ Tamper Individual')
  await page.getByRole('textbox', { name: 'Phone', exact: true }).fill('+995500000194')
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email)
  await Promise.all([page.waitForURL(/flitt|pay\.|checkout/, { timeout: 30_000, waitUntil: 'commit' }).catch(() => {}), submit(page)])
  let o = null
  for (let k = 0; k < 40 && !o; k++) { o = await db.order.findFirst({ where: { tenantId: TENANT, email } }); if (!o) await new Promise(r => setTimeout(r, 500)) }
  expect(state.done).toBe(true)
  expect(o && { guests: o.guestCount, tasting: o.tastingOnlyGuests, free: o.freeGuestCount }).toEqual({ guests: 10, tasting: 10, free: 0 })
  expect(o!.totalPrice).toBe(10 * (o!.tastingOnlyRate ?? -1))
})

test('individual: Lunch only is refused (D-5)', async ({ page }) => {
  test.setTimeout(150_000)
  const email = `zz-tamper-${RUN}-indl@example.invalid`
  const state = await tamper(page, d => { d.visitType = 'LUNCH' })
  await page.goto('/', { timeout: 90_000 })
  await page.getByRole('textbox', { name: 'DD/MM/YYYY' }).fill(tomorrow())
  await page.getByRole('spinbutton').first().fill('4')
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('ZZ Tamper Lunch')
  await page.getByRole('textbox', { name: 'Phone', exact: true }).fill('+995500000195')
  await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email)
  await submit(page)
  await expect(page.getByText(/check the number of guests/i)).toBeVisible({ timeout: 20_000 })
  expect(state.done).toBe(true)
  expect(await noOrder(email)).toBe(true)
})
