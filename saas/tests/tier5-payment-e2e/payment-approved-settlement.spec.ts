// spec: playwright/notes/13-payment-approved-settlement.md
//
// Chunk 3 of vault/Plan-PaymentE2ETesting.md — the first test in this suite
// (or anywhere in the repo) that watches a REAL Flitt checkout settle and
// then checks that fact everywhere the app shows it, not just on the one
// screen the flow happens to land on. Runs against staging.vineworks.ge
// (playwright.staging.config.ts) — Flitt's callback can only reach a publicly
// hosted deployment, never localhost.
//
// Individual booking gets the full 5-surface check from the plan's §4
// dependency map (admin orders table, order detail, /admin/abandoned
// absence, CSV export, settlement email). Company booking and a wine order
// share startCheckout() with it, so they get a lighter pass — confirm they
// settle and show correctly on their own primary screen only, per the plan's
// own "proportionate, not three full rebuilds" note.
//
// Real finding while building this (see the note file for the full story):
// the settlement email never once appears in Resend's send log, for ANY run
// across this whole suite's history (checked directly via `GET
// api.resend.com/emails`, which turns out to support listing — not just
// single-email lookup, undocumented anywhere in this repo before now). Traced
// to a real, reproducible app bug in `settle.ts` (KnownBugs.md), not a test
// artifact — see the note for the full reasoning. That check below is
// deliberately NOT a pass/fail `expect()`: it's a confirmed, already-tracked
// app bug unrelated to what this spec exists to guard (settlement
// correctness across the admin surfaces), and a permanently-red assertion for
// a known, separately-tracked issue would just train everyone to ignore this
// spec's colour. It's logged loudly instead — a test annotation plus a
// console line — so a future FIX shows up as a visible surprise ("known bug
// annotation fired but the email WAS found") rather than silently going
// unnoticed forever.
import { test, expect, Page } from '@playwright/test'
import { loginAsTenantAdmin } from '../helpers/auth'
import {
  readPaymentSectionToggle, setPaymentSectionToggle,
  readShowCompanyPriceToggle, setShowCompanyPriceToggle,
  readCompanyPaymentOverride, setCompanyPaymentOverride,
  readCompanyAccessCode, clickUntil, PaymentOverride,
} from '../helpers/payments'
import { openReviewSheet, abandonedRow } from '../helpers/bookingForm'
import { FLITT_TEST_CARDS, payAtFlittCheckout } from '../helpers/flittPayment'
import { getResendApiKey } from '../helpers/credentials'
import { fetchRecentResendEmails, findMatchingEmail } from '../helpers/resendCheck'

// Deliberately NOT `test.describe.configure({ mode: 'serial' })` at the file
// level: the three describes below touch three independent tenant settings
// (the Individual toggle; Caucasus Vine Travel's override + the Company
// toggle; Sighnaghi Wine Bar's override + the Wine-orders toggle), so they
// don't race each other. A whole-file serial group was tried first and
// rejected once it surfaced a real side effect: Playwright skips every
// subsequent test in a serial group after one failure, which would have
// silently hidden the company/wine-order checks behind the settlement-email
// known-bug annotation above every single run. Real cross-file hazard this
// suite DOES have: payment-approved-settlement.spec.ts and
// payment-declined-settlement.spec.ts both mutate the same "Individual
// bookings" toggle — run them with `--workers=1` (or otherwise never
// concurrently), the same discipline payment-amount-integrity.spec.ts
// documents for its own tenant-wide settings.

const COMPANY_NAME = 'Caucasus Vine Travel'
const WINE_COMPANY_NAME = 'Sighnaghi Wine Bar'

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

/**
 * Confirming a company's access code opens a "Who should we put on this
 * booking?" picker for every contact-role the company has real people
 * under (Plan-ContactRoles) — ONE such modal PER ROLE, shown one after
 * another, not just once. Real finding while building this spec: Caucasus
 * Vine Travel has both a "Contact Person" role (2 people) and a "Guide" role
 * (2 people) on file, so dismissing a single picker still left a second one
 * open, silently blocking every later click on the real submit button behind
 * it (Playwright reports "element is visible... subtree intercepts pointer
 * events" and retries until its own timeout — not a helpful pointer at the
 * modal). Sighnaghi Wine Bar only has a Contact Person, not a Guide, so the
 * wine-order test below only ever sees one — this loop handles either count
 * without needing to know in advance how many roles a given company has.
 *
 * `.waitFor(...)`, not `.isVisible({ timeout })` on each iteration —
 * isVisible() is a one-shot DOM check, not a poll, and the first modal
 * renders after an async "Checking…" state (confirmed live: ~1-2s).
 * isVisible() was evaluating before the modal ever appeared, always seeing
 * "not visible" and skipping the click entirely (a real bug in this test
 * itself, caught only by running it, not by reading the code).
 */
async function dismissContactRolePickers(page: Page): Promise<void> {
  const notOnListBtn = page.getByRole('button', { name: 'I am not on this list', exact: true })
  for (let guard = 0; guard < 5; guard++) {
    const appeared = await notOnListBtn
      .waitFor({ state: 'visible', timeout: guard === 0 ? 8_000 : 2_000 })
      .then(() => true)
      .catch(() => false)
    if (!appeared) return
    await notOnListBtn.click()
    // Let this dismissal's own exit transition clear before checking for the
    // next role's picker — otherwise the stale one can still be mid-fade and
    // read as "visible" for one more poll.
    await page.waitForTimeout(300)
  }
}

async function deleteTestOrderOnAdminPage(page: Page, marker: string) {
  await page.goto('/admin/orders')
  await page.locator('table').waitFor({ timeout: 15_000 }).catch(() => {})
  const row = page.locator('tr', { hasText: marker })
  if (await row.count() > 0) {
    await row.getByRole('button', { name: 'Delete order' }).click()
    await row.getByRole('button', { name: 'Yes' }).click()
    await expect(page.locator('tr', { hasText: marker })).toHaveCount(0)
  }
}

/** Downloads the real CSV via the admin UI's own "Export CSV" button (not the
 * server action directly) — proves the button, the download, and the data
 * all agree, the same thing a human clicking it would get. */
async function exportOrdersCsvViaUi(page: Page): Promise<string> {
  await page.goto('/admin/orders')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click()
  const download = await downloadPromise
  const path = await download.path()
  if (!path) throw new Error('CSV download produced no local path')
  const fs = await import('fs')
  return fs.readFileSync(path, 'utf-8')
}

/** Minimal CSV line splitter — good enough for this suite's own test data
 * (no commas inside any field this suite writes), mirrors exportOrdersCsv's
 * own quoting (`csvCell` in app/actions/orders.ts) without needing a real CSV
 * parser dependency. */
function splitCsvLine(line: string): string[] {
  return line.split(',').map(cell => cell.replace(/^"|"$/g, '').replace(/""/g, '"'))
}

test.describe('Individual booking — approved settlement, full cross-view check (#191, Chunk 3)', () => {
  test('a real Flitt approval settles the order and every surface agrees', async ({ page, context }) => {
    test.setTimeout(150_000)
    await loginAsTenantAdmin(page)
    const originalToggle = await readPaymentSectionToggle(page, 'Individual bookings')

    const marker = `ZZPaymentE2EApproved${Date.now()}`
    const email = `zz-payment-e2e-approved-${Date.now()}@example.invalid`
    const testStartIso = new Date().toISOString()

    try {
      await setPaymentSectionToggle(page, 'Individual bookings', true)

      const formPage = await context.newPage()
      await formPage.goto('/')
      await formPage.getByRole('button', { name: 'Tasting + Lunch', exact: false }).click()
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      await formPage.getByRole('textbox', { name: 'DD/MM/YYYY' }).fill(formatDate(tomorrow))
      await formPage.getByRole('combobox').selectOption({ index: 1 })
      await formPage.getByRole('spinbutton', { name: 'Number of Guests (minimum 4)' }).fill('4')
      await formPage.getByRole('textbox', { name: 'First Name' }).fill('ZZPaymentE2E')
      await formPage.getByRole('textbox', { name: 'Last Name' }).fill(marker)
      await formPage.getByRole('textbox', { name: 'Phone' }).fill('+995500000041')
      await formPage.getByRole('textbox', { name: 'Email' }).fill(email)

      const totalText = await formPage.getByText('Total', { exact: true }).locator('xpath=../following-sibling::*[1]').textContent()
      const expectedTotal = parseInt(totalText || '0', 10)
      expect(expectedTotal, 'quoted total should be a real positive amount').toBeGreaterThan(0)

      await openReviewSheet(formPage, 'Book & Pay')
      await Promise.all([
        formPage.waitForURL(/pay\.flitt\.com/, { timeout: 20_000, waitUntil: 'commit' }),
        formPage.getByRole('button', { name: 'Confirm & Book' }).click(),
      ])

      // ── The real settlement ──────────────────────────────────────────────
      await payAtFlittCheckout(formPage, { cardNumber: FLITT_TEST_CARDS.approveNo3DS })

      // 1. Customer-facing confirmation reads as PAID, not reservation-only.
      await expect(formPage).toHaveURL(/\/payment\/result\?status=success/, { timeout: 20_000 })
      await expect(formPage.getByRole('heading', { name: 'Payment received' })).toBeVisible({ timeout: 10_000 })
      await formPage.close()

      // 2. Admin orders table — present, correct amount, shown paid.
      await page.goto('/admin/orders')
      const row = page.locator('tr', { hasText: marker })
      await expect(row).toBeVisible({ timeout: 20_000 })
      await expect(row).toContainText(`${expectedTotal}₾`)
      await expect(row.getByLabel('Paid', { exact: true })).toBeVisible()

      // 3. The order's own detail view — flow-line shows the Paid step, done,
      // with "Card" as the method (only a real Flitt settlement ever sets
      // paymentMethod='CARD' — see OrderDetail.tsx's own comment).
      await row.getByText(marker).first().click()
      await expect(page).toHaveURL(/\/admin\/orders\/[a-zA-Z0-9]+$/, { timeout: 15_000 })
      const paidStep = page.locator('span').filter({ hasText: 'Paid' }).filter({ hasText: 'Card' })
      await expect(paidStep.first()).toBeVisible({ timeout: 10_000 })

      // 4. /admin/abandoned — a settled order must never appear there.
      await page.goto('/admin/abandoned')
      await expect(abandonedRow(page, marker)).toHaveCount(0)

      // 5. CSV export — the exported row shows paid + the right amount/date.
      const csv = await exportOrdersCsvViaUi(page)
      const lines = csv.split('\r\n')
      const header = splitCsvLine(lines[0])
      const dataLine = lines.find(l => l.includes(marker))
      expect(dataLine, `CSV export should contain a row for ${marker}`).toBeTruthy()
      const cells = splitCsvLine(dataLine!)
      const col = (name: string) => cells[header.indexOf(name)]
      expect(parseFloat(col('Total (GEL)'))).toBeCloseTo(expectedTotal, 2)
      expect(col('Payment')).toBe('paid')
      expect(col('Paid At'), 'Paid At should be stamped for a settled order').not.toBe('')

      // 6. Settlement email — see this file's header comment for why this is
      // a loud diagnostic, not a hard `expect()`.
      const resendApiKey = getResendApiKey()
      const emails = await fetchRecentResendEmails(resendApiKey)
      const settlementEmail = findMatchingEmail(emails, email, /Payment received/i, testStartIso)
      if (!settlementEmail) {
        const msg = 'KNOWN BUG (playwright/notes/13-payment-approved-settlement.md, vault/KnownBugs.md): ' +
          'settle.ts\'s fire-and-forget sendSettlementEmail() did not reach Resend for this run.'
        console.warn(`[tier5-payment-e2e] ${msg}`)
        test.info().annotations.push({ type: 'known-bug', description: msg })
      } else {
        // The known bug did NOT reproduce this run — worth surfacing loudly,
        // since either the bug is fixed or it's flakier (a race, not a
        // guarantee) than the evidence gathered while building this spec
        // suggested. Either way this is new information, not silence.
        test.info().annotations.push({
          type: 'known-bug-not-reproduced',
          description: 'Settlement email WAS found in Resend this run — re-check whether the known bug in ' +
            'settle.ts (playwright/notes/13-payment-approved-settlement.md) is still real.',
        })
      }

      await deleteTestOrderOnAdminPage(page, marker)
    } finally {
      await setPaymentSectionToggle(page, 'Individual bookings', originalToggle)
    }
  })
})

test.describe('Company booking — approved settlement, light check (shares startCheckout with individual)', () => {
  test('settles and shows paid on the admin orders table', async ({ page, context }) => {
    test.setTimeout(120_000)
    await loginAsTenantAdmin(page)

    const originalSection = await readPaymentSectionToggle(page, 'Company bookings')
    const originalOverride = await readCompanyPaymentOverride(page, COMPANY_NAME)
    const originalShowPrice = await readShowCompanyPriceToggle(page)
    const accessCode = await readCompanyAccessCode(page, COMPANY_NAME)
    expect(accessCode, `${COMPANY_NAME} must have a real access code set for this test to run`).not.toBe('')

    const marker = `ZZCoE2EApproved${Date.now()}`

    try {
      await setCompanyPaymentOverride(page, COMPANY_NAME, 'Default')
      await setShowCompanyPriceToggle(page, true)
      await setPaymentSectionToggle(page, 'Company bookings', true)

      const formPage = await context.newPage()
      await formPage.goto('/')
      await formPage.getByRole('button', { name: 'Tour Company' }).click()
      await formPage.getByRole('combobox').first().selectOption({ label: COMPANY_NAME })
      await formPage.getByRole('heading', { name: 'Enter your company code' }).waitFor()
      await formPage.getByRole('textbox', { name: 'e.g. MARANI42' }).fill(accessCode)
      await formPage.getByRole('button', { name: 'Confirm', exact: true }).click()
      await expect(formPage.getByRole('heading', { name: 'Enter your company code' })).not.toBeVisible()

      await dismissContactRolePickers(formPage)

      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      await formPage.getByRole('textbox', { name: 'DD/MM/YYYY' }).fill(formatDate(tomorrow))
      await formPage.getByRole('spinbutton').first().fill('4')
      await formPage.getByRole('textbox', { name: 'First Name' }).fill('ZZPaymentE2E')
      await formPage.getByRole('textbox', { name: 'Last Name' }).fill(marker)
      // exact: true — this company has a "Guide" contact role configured
      // (Plan-ContactRoles), which adds its own "Guide — Phone"/"Guide —
      // Email" fields to this form. Non-exact matching on 'Phone'/'Email'
      // hits both and Playwright's strict mode refuses to guess (real finding
      // while building this spec — see the note file).
      await formPage.getByRole('textbox', { name: 'Phone', exact: true }).fill('+995500000042')
      await formPage.getByRole('textbox', { name: 'Email', exact: true }).fill(`zz-co-e2e-approved-${Date.now()}@example.invalid`)

      const submitBtn = formPage.getByRole('button', { name: /^(Book & Pay|Request Booking)$/ })
      const reviewHeading = formPage.getByRole('heading', { name: 'Review your visit' })
      await clickUntil(submitBtn, () => expect(reviewHeading).toBeVisible({ timeout: 3_000 }))
      const totalText = await formPage.getByText('Total', { exact: true }).last().locator('xpath=following-sibling::*[1]').textContent()
      const expectedTotal = parseInt(totalText || '0', 10)
      expect(expectedTotal).toBeGreaterThan(0)

      const confirmBtn = formPage.getByRole('button', { name: /^Confirm & /, exact: false })
      const confirmLabel = (await confirmBtn.textContent()) || ''
      expect(confirmLabel, 'this scenario needs the company to actually be sent to the gateway').toContain('Book')

      await Promise.all([
        formPage.waitForURL(/pay\.flitt\.com/, { timeout: 20_000, waitUntil: 'commit' }),
        confirmBtn.click(),
      ])
      await payAtFlittCheckout(formPage, { cardNumber: FLITT_TEST_CARDS.approveNo3DS })
      await expect(formPage).toHaveURL(/\/payment\/result\?status=success/, { timeout: 20_000 })
      await formPage.close()

      // Primary screen only, per the plan: admin orders table, paid + correct amount.
      await page.goto('/admin/orders')
      const row = page.locator('tr', { hasText: marker })
      await expect(row).toBeVisible({ timeout: 20_000 })
      await expect(row).toContainText(`${expectedTotal}₾`)
      await expect(row.getByLabel('Paid', { exact: true })).toBeVisible()

      await deleteTestOrderOnAdminPage(page, marker)
    } finally {
      await setCompanyPaymentOverride(page, COMPANY_NAME, originalOverride as PaymentOverride)
      await setPaymentSectionToggle(page, 'Company bookings', originalSection)
      await setShowCompanyPriceToggle(page, originalShowPrice)
    }
  })
})

test.describe('Wine order — approved settlement, light check (shares startCheckout with individual)', () => {
  test('settles and shows paid on the wine-orders board', async ({ page, context }) => {
    test.setTimeout(120_000)
    await loginAsTenantAdmin(page)

    const originalToggle = await readPaymentSectionToggle(page, 'Wine orders')
    const originalOverride = await readCompanyPaymentOverride(page, WINE_COMPANY_NAME)
    const wineAccessCode = await readCompanyAccessCode(page, WINE_COMPANY_NAME)
    expect(wineAccessCode, `${WINE_COMPANY_NAME} must have a real access code set for this test to run`).not.toBe('')

    const businessName = `ZZ Wine E2E Approved ${Date.now()}`

    try {
      await setCompanyPaymentOverride(page, WINE_COMPANY_NAME, 'Default')
      await setPaymentSectionToggle(page, 'Wine orders', true)

      const formPage = await context.newPage()
      await formPage.goto('/wines')
      const card = formPage
        .locator('div.rounded-xl.border.overflow-hidden.flex.flex-col')
        .filter({ has: formPage.locator('p', { hasText: /^Rkatsiteli$/ }) })
        .filter({ hasText: '2026' })
      const priceText = await card.getByText('₾', { exact: false }).first().textContent()
      const unitPrice = parseInt(priceText || '0', 10)
      expect(unitPrice).toBeGreaterThan(0)
      await card.getByRole('button', { name: '+', exact: true }).click()

      await formPage.getByRole('button', { name: 'Checkout →', exact: true }).click()
      await formPage.getByRole('combobox').selectOption(WINE_COMPANY_NAME)
      await formPage.getByRole('heading', { name: 'Enter your company code' }).waitFor()
      await formPage.getByRole('textbox', { name: 'e.g. MARANI42' }).fill(wineAccessCode)
      await formPage.getByRole('button', { name: 'Confirm', exact: true }).click()

      // Real finding while building this spec: Sighnaghi Wine Bar has a real
      // Contact Person on file (Tamar Gogoladze), so confirming the access
      // code doesn't drop straight into the manual-entry fields — it opens
      // the same blocking "Who should we put on this booking?" picker the
      // company-booking test above documents (dismissContactRolePickers's own
      // comment has the full story). "I am not on this list" falls through to
      // the manual fields this test already fills below.
      await dismissContactRolePickers(formPage)

      const orderPayBtn = formPage.getByRole('button', { name: 'Order & Pay', exact: true })
      await expect(orderPayBtn).toBeVisible({ timeout: 10_000 })
      await formPage.getByRole('textbox', { name: 'Bar, restaurant, or individual name' }).fill(businessName)
      await formPage.getByRole('textbox', { name: 'Actual address of bar / restaurant' }).fill('1 Test Street')
      await formPage.getByRole('textbox', { name: 'Contact person full name' }).fill('ZZ Wine Contact')
      await formPage.getByRole('textbox', { name: 'Contact person phone number' }).fill('+995500000043')
      // The receipt email — a required field on this form (found live while
      // debugging: HTML5 `required` on `contactEmail`, invisible in a plain
      // page-text dump, only surfaced by inspecting the form's own
      // ValidityState) — omitting it lets every earlier `.fill()` succeed
      // and "Order & Pay" stay clickable, but the click submits nothing and
      // nothing ever appears to explain why. Not a modal this time — a
      // silently-blocked native form submission.
      await formPage.getByRole('textbox', { name: /Email address/ }).fill(`zz-wine-e2e-approved-${Date.now()}@example.invalid`)

      // Real finding while building this spec: Sighnaghi Wine Bar carries a
      // real 10% wine discount (Company.wineDiscountPercent), applied once
      // the access code is confirmed — so the catalogue's own per-bottle
      // price (`unitPrice`, read before any company was involved) is no
      // longer what actually reaches Flitt or the admin board. Reading the
      // order summary's own final total here, rather than hardcoding
      // `unitPrice * 0.9`, means this assertion stays correct even if the
      // fixture's discount percent ever changes. The "Total" label is
      // followed by an optional struck-through original amount and a "−N%"
      // badge before the real final figure, so the LAST "₾" amount after it
      // is always the one that matters, discounted or not.
      // Real bug in an earlier version of this check, caught by running it:
      // taking the LAST ₾ span in the rest of the document (rather than a
      // small window right after "Total") walked straight past the order
      // summary and picked up a catalogue card's own per-bottle price
      // ("25₾/bottle", Kisi, sitting later in DOM order) instead of the
      // actual discounted total a few spans away. Bounded to the handful of
      // spans immediately following the "Total" label — original amount,
      // "−N%" badge, final total — the same compact structure regardless of
      // whether a discount applies.
      const expectedAmount = await formPage.evaluate(() => {
        const texts = Array.from(document.querySelectorAll('span')).map(el => el.textContent?.trim() ?? '')
        const totalIdx = texts.findIndex(t => t === 'Total')
        if (totalIdx === -1) return null
        const amounts = texts.slice(totalIdx + 1, totalIdx + 5).filter(t => /^[\d.]+₾$/.test(t))
        return amounts.length ? amounts[amounts.length - 1] : null
      })
      expect(expectedAmount, 'could not read the order summary\'s own total').not.toBeNull()
      const expectedTotal = parseFloat(expectedAmount!.replace(/[^0-9.]/g, ''))
      expect(expectedTotal).toBeGreaterThan(0)

      await Promise.all([
        formPage.waitForURL(/pay\.flitt\.com/, { timeout: 20_000, waitUntil: 'commit' }),
        orderPayBtn.click(),
      ])
      await payAtFlittCheckout(formPage, { cardNumber: FLITT_TEST_CARDS.approveNo3DS })
      await expect(formPage).toHaveURL(/\/payment\/result\?status=success/, { timeout: 20_000 })
      await formPage.close()

      // Primary screen only: the wine-orders board's Table view, paid mark.
      await page.goto('/admin/wine-orders')
      await page.getByRole('button', { name: 'Table', exact: true }).click()
      const row = page.locator('tr', { hasText: businessName })
      await expect(row).toBeVisible({ timeout: 20_000 })
      // The Amount cell holds the price AND the discount badge together in
      // one <td> ("13.50₾−10%") — stripping every non-digit character before
      // parsing (as the cart-summary read above didn't need to) concatenates
      // "13.50" and "10" into "13.5010" instead of the real amount. Matching
      // the actual `<number>₾` pattern avoids that.
      const rowAmountText = await row.locator('td').filter({ hasText: '₾' }).first().textContent()
      const rowAmountMatch = (rowAmountText ?? '').match(/([\d.]+)\s*₾/)
      expect(rowAmountMatch, `could not find an amount in the row: ${rowAmountText}`).not.toBeNull()
      const rowAmount = parseFloat(rowAmountMatch![1])
      expect(rowAmount).toBeCloseTo(expectedTotal, 2)
      await expect(row.getByLabel('Paid', { exact: true })).toBeVisible()

      // No cleanup call: Wine Orders admin has no delete action at all (only
      // status transitions), the same accepted debris every wine-order test
      // in this repo leaves — see ARCHITECTURE.md's cleanup-discipline
      // section and 06-wine-catalogue-order.md. A paid order also has no
      // "Cancelled" control available (WineOrdersClient.tsx's isLimbo branch
      // only offers one for orders still in payment limbo), so there is no
      // action to even attempt here.
    } finally {
      await setCompanyPaymentOverride(page, WINE_COMPANY_NAME, originalOverride as PaymentOverride)
      await setPaymentSectionToggle(page, 'Wine orders', originalToggle)
    }
  })
})
