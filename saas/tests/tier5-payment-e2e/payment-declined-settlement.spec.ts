// spec: playwright/notes/14-payment-declined-settlement.md
//
// Chunk 3 of vault/Plan-PaymentE2ETesting.md — the mirror of
// payment-approved-settlement.spec.ts: a REAL Flitt decline, checked
// everywhere the app could mistakenly show it as paid. Per the plan's §2c,
// Feature 191 treats a decline exactly like an abandoned/never-returned
// checkout — the order stays on /admin/abandoned indefinitely until an admin
// restores it, rather than landing anywhere that reads as "this happened".
import { test, expect, Page } from '@playwright/test'
import { loginAsTenantAdmin } from '../helpers/auth'
import { readPaymentSectionToggle, setPaymentSectionToggle } from '../helpers/payments'
import { openReviewSheet, abandonedRow } from '../helpers/bookingForm'
import { FLITT_TEST_CARDS, payAtFlittCheckout } from '../helpers/flittPayment'
import { getResendApiKey } from '../helpers/credentials'
import { fetchRecentResendEmails, findMatchingEmail } from '../helpers/resendCheck'

// Only one test in this file, so no serial-group concern of its own — but it
// mutates the same "Individual bookings" toggle payment-approved-settlement.spec.ts
// does, so the two files must never run concurrently (`--workers=1`, or run
// them as separate invocations) — see that file's own comment for why a
// blanket `test.describe.configure({ mode: 'serial' })` isn't the fix either.

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  return `${dd}/${mm}/${yyyy}`
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

/** Bring an incomplete order back, then delete it from the main table — same
 * pattern as payment-amount-integrity.spec.ts's own helper. */
async function restoreAndDeleteAbandoned(page: Page, marker: string) {
  await page.goto('/admin/abandoned')
  const row = abandonedRow(page, marker)
  if (await row.count() > 0) {
    await row.getByRole('button', { name: 'Restore without payment' }).click()
    await expect(abandonedRow(page, marker)).toHaveCount(0, { timeout: 15_000 })
  }
  await deleteTestOrderOnAdminPage(page, marker)
}

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

test.describe('Individual booking — declined settlement, never mis-read as paid', () => {
  test('a real Flitt decline leaves the order abandoned, nowhere reads it as paid', async ({ page, context }) => {
    test.setTimeout(150_000)
    await loginAsTenantAdmin(page)
    const originalToggle = await readPaymentSectionToggle(page, 'Individual bookings')

    const marker = `ZZPaymentE2EDeclined${Date.now()}`
    const email = `zz-payment-e2e-declined-${Date.now()}@example.invalid`
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
      await formPage.getByRole('textbox', { name: 'Phone' }).fill('+995500000051')
      await formPage.getByRole('textbox', { name: 'Email' }).fill(email)

      const totalText = await formPage.getByText('Total', { exact: true }).locator('xpath=../following-sibling::*[1]').textContent()
      const expectedTotal = parseInt(totalText || '0', 10)
      expect(expectedTotal).toBeGreaterThan(0)

      await openReviewSheet(formPage, 'Book & Pay')
      await Promise.all([
        formPage.waitForURL(/pay\.flitt\.com/, { timeout: 20_000, waitUntil: 'commit' }),
        formPage.getByRole('button', { name: 'Confirm & Book' }).click(),
      ])

      // ── The real decline ─────────────────────────────────────────────────
      // Real finding while building this spec (see flittPayment.ts's own
      // 'declined-inline' comment for the full story): this non-3DS decline
      // card never redirects back to our own site at all — Flitt shows a
      // same-page "Declined" dialog with no "back to merchant" link anywhere
      // on the page, confirmed via a full accessibility-tree dump. The
      // browser is stuck on pay.flitt.com exactly like a guest who closed the
      // tab; the plan's own §2c already treats that as indistinguishable from
      // a decline on the order's side. Settlement itself doesn't depend on
      // this browser ever going anywhere — Flitt's server-to-server webhook
      // fires independently and is what actually writes PAYMENT_DECLINED.
      const result = await payAtFlittCheckout(formPage, { cardNumber: FLITT_TEST_CARDS.declineNo3DS })

      // 2. Customer-facing result does NOT read as a successful payment —
      // checked on whichever screen the guest actually lands on for this
      // card, not assumed to be our own /payment/result.
      if (result.outcome === 'redirected') {
        await expect(formPage).toHaveURL(/\/payment\/result\?status=failed/, { timeout: 20_000 })
        await expect(formPage.getByRole('heading', { name: 'Payment was not completed' })).toBeVisible({ timeout: 10_000 })
      } else {
        await expect(formPage.getByRole('dialog').getByRole('heading', { name: 'Declined' })).toBeVisible()
        expect(formPage.url()).toContain('pay.flitt.com')
      }
      await formPage.close()

      // 3a. Stays on /admin/abandoned — the correct, expected resting place
      // for a declined checkout (plan §2c: same fact as a never-returned one).
      await page.goto('/admin/abandoned')
      const row = abandonedRow(page, marker)
      await expect(row).toBeVisible({ timeout: 20_000 })
      expect(((await row.textContent()) ?? '').replace(/\s+/g, '')).toContain(`${expectedTotal}₾`)

      // 3b. Absent from /admin/orders — never mis-read as a live, paid order.
      await page.goto('/admin/orders')
      await expect(page.locator('tr', { hasText: marker })).toHaveCount(0)

      // 3c. Absent from the CSV export — exportOrdersCsv excludes abandoned
      // orders entirely (NOT_ABANDONED in app/actions/orders.ts), same
      // exclusion the orders table itself applies.
      const csv = await exportOrdersCsvViaUi(page)
      expect(csv.includes(marker), 'a declined/abandoned order must not appear in the CSV export').toBe(false)

      // 3d. No settlement email — settle.ts's own design (§2c: a decline
      // writes PAYMENT_DECLINED and returns, sendSettlementEmail is only ever
      // reached on the 'settled' branch). This is expected behaviour, not the
      // approved-case's known bug, so it's a hard assertion.
      const resendApiKey = getResendApiKey()
      const emails = await fetchRecentResendEmails(resendApiKey)
      const settlementEmail = findMatchingEmail(emails, email, /Payment received/i, testStartIso)
      expect(settlementEmail, 'a declined payment must never trigger the paid-confirmation email').toBeUndefined()

      await restoreAndDeleteAbandoned(page, marker)
    } finally {
      await setPaymentSectionToggle(page, 'Individual bookings', originalToggle)
    }
  })
})
