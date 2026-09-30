// spec: playwright/notes/15-payment-book-later.md
//
// Chunk 4 of vault/Plan-PaymentE2ETesting.md — the "book & pay later" loop.
// Per the plan's §2b (confirmed by reading createBooking.ts/submitWineOrder.ts
// before this chunk started): this is NOT a resumed Flitt checkout. There is
// no second payment link, no "resume checkout" feature, nothing that ever
// touches pay.flitt.com. The actual flow is: a reservation-only booking (the
// payment section toggle off, or any of the other hard-block paths in
// shouldTakePayment.ts) → an admin manually sends an invoice email carrying
// the winery's bank-transfer details → an admin manually records the bank
// transfer once it arrives, choosing BANK_TRANSFER on the "how was this
// paid?" picker. This spec still runs under playwright.staging.config.ts to
// keep the whole tier on one config/DB, even though nothing here ever leaves
// our own domain.
//
// Runs against staging.vineworks.ge (dev DB) — never localhost, matching the
// rest of this tier (shared login/toggle/booking-form helpers with
// payment-approved-settlement.spec.ts / payment-declined-settlement.spec.ts).
import { test, expect, Page } from '@playwright/test'
import { loginAsTenantAdmin } from '../helpers/auth'
import { readPaymentSectionToggle, setPaymentSectionToggle, readPaymentBankDetails } from '../helpers/payments'
import { openReviewSheet, abandonedRow } from '../helpers/bookingForm'
import { getResendApiKey } from '../helpers/credentials'
import { fetchRecentResendEmails, findMatchingEmail, fetchResendEmailBody } from '../helpers/resendCheck'

// Only one test in this file, mutating the same "Individual bookings" toggle
// payment-approved-settlement.spec.ts and payment-declined-settlement.spec.ts
// do — never run concurrently with those two (`--workers=1`, or a separate
// invocation), same discipline the rest of this tier documents.

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

function splitCsvLine(line: string): string[] {
  return line.split(',').map(cell => cell.replace(/^"|"$/g, '').replace(/""/g, '"'))
}

/** Reads a CSV export's row for `marker` into a column-name lookup, same
 * pattern payment-approved-settlement.spec.ts uses. */
function csvRowFor(csv: string, marker: string): (col: string) => string {
  const lines = csv.split('\r\n')
  const header = splitCsvLine(lines[0])
  const dataLine = lines.find(l => l.includes(marker))
  expect(dataLine, `CSV export should contain a row for ${marker}`).toBeTruthy()
  const cells = splitCsvLine(dataLine!)
  return (name: string) => cells[header.indexOf(name)]
}

test.describe('Individual booking — reservation → invoice → manual bank transfer, full cross-view check (Chunk 4)', () => {
  test('a reservation-only booking gets invoiced then paid by bank transfer, every surface agrees', async ({ page, context }) => {
    // Generous even against payment-approved-settlement.spec.ts's 150s for its
    // individual-booking scenario: this test does noticeably more real round
    // trips against the live staging deployment — bank-details read, two full
    // CSV exports (before and after payment), two Resend API calls (list +
    // single-email body fetch), and two separate admin status-change writes
    // (send invoice, then mark paid) on top of the booking submission and the
    // 5-surface checks. A first run at 180s ran out of budget deep into the
    // scenario (invoice already sent and verified, mid-way into the "mark
    // paid" step) — not a hang, just not enough room for this many real trips.
    test.setTimeout(300_000)
    const t0 = Date.now()
    const mark = (label: string) => console.log(`[timing] +${((Date.now() - t0) / 1000).toFixed(1)}s ${label} — url=${page.url()}`)
    await loginAsTenantAdmin(page)
    mark('logged in')

    const originalToggle = await readPaymentSectionToggle(page, 'Individual bookings')
    // Ground truth per the plan: this toggle rests OFF (confirmed at the end
    // of Chunk 3). Verified here, not assumed — a "book & pay later" scenario
    // needs it off to even reach the reservation-only path, and a drift here
    // is worth surfacing loudly rather than silently forcing past it.
    expect(originalToggle, 'Individual bookings toggle should be OFF at rest, per its documented resting state (end of Chunk 3)').toBe(false)

    // Read the real bank-transfer details live, before creating anything —
    // these are what sendOrderInvoice() actually prints into the email, and
    // what this test's own email-content check is compared against below.
    const bankDetails = await readPaymentBankDetails(page)
    for (const [field, value] of Object.entries(bankDetails)) {
      expect(value, `Settings → Payment details → ${field} should not be empty for this check to mean anything`).not.toBe('')
    }
    mark('bank details read')

    const marker = `ZZPaymentE2EBookLater${Date.now()}`
    const email = `zz-payment-e2e-book-later-${Date.now()}@example.invalid`

    try {
      // ── 1. Reservation-only booking ──────────────────────────────────────
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
      await formPage.getByRole('textbox', { name: 'Phone' }).fill('+995500000061')
      await formPage.getByRole('textbox', { name: 'Email' }).fill(email)

      const totalText = await formPage.getByText('Total', { exact: true }).locator('xpath=../following-sibling::*[1]').textContent()
      const expectedTotal = parseInt(totalText || '0', 10)
      expect(expectedTotal, 'quoted total should be a real positive amount').toBeGreaterThan(0)

      await openReviewSheet(formPage, 'Request Booking')
      await formPage.getByRole('button', { name: 'Confirm & Request Booking' }).click()
      // No Flitt anywhere in this flow — the toggle being off means the order
      // never reaches the gateway at all (shouldTakePayment.ts's hard block).
      await expect(formPage.getByRole('heading', { name: 'Booking received!' })).toBeVisible({ timeout: 15_000 })
      expect(formPage.url()).not.toMatch(/pay\.flitt\.com/)
      await formPage.close()
      mark('reservation booking submitted')

      // ── 2a. Never on /admin/abandoned — it never touched a gateway ───────
      await page.goto('/admin/abandoned')
      await expect(abandonedRow(page, marker)).toHaveCount(0)

      // ── 2b. Admin orders table — live order, unpaid, un-invoiced ─────────
      await page.goto('/admin/orders')
      const row = page.locator('tr', { hasText: marker })
      await expect(row).toBeVisible({ timeout: 20_000 })
      await expect(row).toContainText(`${expectedTotal}₾`)
      await expect(row.getByLabel('Paid', { exact: true })).toHaveCount(0)
      await expect(row.getByLabel('Invoice Sent', { exact: true })).toHaveCount(0)
      mark('admin orders table checked (unpaid, un-invoiced)')

      // ── 3. Send the invoice, from the order's own detail page ────────────
      await row.getByText(marker).first().click()
      await expect(page).toHaveURL(/\/admin\/orders\/[a-zA-Z0-9]+$/, { timeout: 15_000 })
      const detailUrl = page.url()
      const detailPath = new URL(detailUrl).pathname

      const testStartIso = new Date().toISOString()
      const sendInvoiceBtn = page.getByRole('button', { name: 'Send Invoice', exact: true })
      await expect(sendInvoiceBtn).toBeEnabled({ timeout: 10_000 })
      await Promise.all([
        page.waitForResponse(res => res.url().includes(detailPath) && res.request().method() === 'POST'),
        sendInvoiceBtn.click(),
      ])
      await expect(page.getByText('Sent ✓', { exact: true })).toBeVisible({ timeout: 20_000 })
      mark('invoice sent')

      // 3a. The order detail page's own two independent facts, right after
      // sending: the small "Invoice Sent" mark beside the status pill (shown
      // only while unpaid — OrderDetail.tsx's own InvoiceSentMark condition),
      // and the permanent Invoice History card (shown regardless of paid
      // state — this is the one that survives the "paid" step below).
      await expect(page.getByLabel('Invoice Sent', { exact: true })).toBeVisible({ timeout: 10_000 })
      const invoiceHistoryCard = page
        .getByRole('heading', { name: 'Invoice History' })
        .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
      await expect(invoiceHistoryCard).toContainText(email)
      await expect(invoiceHistoryCard).toContainText(`${expectedTotal}₾`)
      mark('3a checked (invoice-sent mark + history)')

      // 3b. Admin orders table shows "Invoice Sent", not yet "Paid".
      await page.goto('/admin/orders')
      const rowAfterInvoice = page.locator('tr', { hasText: marker })
      await expect(rowAfterInvoice.getByLabel('Invoice Sent', { exact: true })).toBeVisible({ timeout: 15_000 })
      await expect(rowAfterInvoice.getByLabel('Paid', { exact: true })).toHaveCount(0)
      mark('3b checked (orders table)')

      // 3c. CSV export: 'invoiced', Invoice Sent At stamped, Paid At still empty.
      const csvAfterInvoice = await exportOrdersCsvViaUi(page)
      const colAfterInvoice = csvRowFor(csvAfterInvoice, marker)
      expect(colAfterInvoice('Payment')).toBe('invoiced')
      expect(colAfterInvoice('Invoice Sent At'), 'Invoice Sent At should be stamped').not.toBe('')
      expect(colAfterInvoice('Paid At'), 'Paid At should still be empty — no payment recorded yet').toBe('')
      mark('3c checked (csv export #1)')

      // 3d. Still never on /admin/abandoned.
      await page.goto('/admin/abandoned')
      await expect(abandonedRow(page, marker)).toHaveCount(0)
      mark('3d checked (still not abandoned)')

      // 3e. The email actually reached Resend — a direct `sendInvoiceEmail()`
      // await inside a try/catch (orders.ts), not settle.ts's fire-and-forget
      // pattern from Chunk 3, so this is a hard assertion, not a diagnostic.
      const resendApiKey = getResendApiKey()
      const emails = await fetchRecentResendEmails(resendApiKey)
      // The marker is unique and appears in the subject regardless of send
      // locale (OrderDetail.tsx's "Send Invoice" button calls sendOrderInvoice()
      // with no locale argument, which defaults to 'ka' — a real finding: this
      // invoice always sends in Georgian from this control, unlike the
      // English-language admin UI around it), so matching on the marker itself
      // rather than a language-specific subject word is what stays correct
      // either way.
      const invoiceEmail = findMatchingEmail(emails, email, new RegExp(marker), testStartIso)
      expect(invoiceEmail, 'the invoice email should have reached Resend').toBeTruthy()
      mark('3e checked (resend list)')

      // 3f. The email's actual CONTENT — not just that one went out — matches
      // the order's own stored total and the live bank-transfer settings.
      const body = await fetchResendEmailBody(resendApiKey, invoiceEmail!.id)
      const html = body.html ?? ''
      expect(html, 'invoice email should carry the recipient name from Settings').toContain(bankDetails.recipientName)
      expect(html, 'invoice email should carry the personal number from Settings').toContain(bankDetails.personalNumber)
      expect(html, 'invoice email should carry the bank name from Settings').toContain(bankDetails.bankName)
      expect(html, 'invoice email should carry the bank code from Settings').toContain(bankDetails.bankCode)
      expect(html, 'invoice email should carry the IBAN from Settings').toContain(bankDetails.iban)
      expect(html, "invoice email's amount should match the order's own stored total").toContain(String(expectedTotal))
      mark('3f checked (resend body content)')

      // ── 4. Record the manual bank-transfer payment ───────────────────────
      // Clicking "Paid" swaps the menu to the Bank Transfer/Cash picker in
      // place — see the fix in OrderDetail.tsx/OrdersTable.tsx (commits
      // b58e9cc/ac47541) for why this used to close itself instantly instead.
      await page.goto(detailUrl)
      mark('4: back on detail page')
      await page.getByRole('button', { name: /▾$/ }).first().click()
      mark('4: status dropdown clicked')
      await page.getByRole('button', { name: 'Paid', exact: true }).click()
      mark('4: "Paid" menu item clicked')
      const bankTransferBtn = page.getByRole('button', { name: 'Bank transfer', exact: true })
      await bankTransferBtn.waitFor({ state: 'visible', timeout: 8_000 })
      mark('4: "Bank transfer" button visible')
      await Promise.all([
        page.waitForResponse(res => res.url().includes(detailPath) && res.request().method() === 'POST', { timeout: 20_000 }),
        bankTransferBtn.click(),
      ])
      mark('4: "Bank transfer" clicked + POST resolved')

      // 4a. Order detail — the flow-line's Paid step, done, with "Bank transfer"
      // as the method (only a real Flitt settlement ever sets "Card" — see
      // paymentMethodLabel's own comment). The Invoice Sent mark beside the
      // pill disappears once paid (OrderDetail.tsx's own condition), but the
      // Invoice History card is untouched — this IS the "two independent
      // facts, neither overwrites the other" check the plan calls for.
      const paidStep = page.locator('span').filter({ hasText: 'Paid' }).filter({ hasText: 'Bank transfer' })
      await expect(paidStep.first()).toBeVisible({ timeout: 10_000 })
      await expect(page.getByLabel('Invoice Sent', { exact: true })).toHaveCount(0)
      await expect(invoiceHistoryCard).toContainText(email)
      await expect(invoiceHistoryCard).toContainText(`${expectedTotal}₾`)

      // 4b. Admin orders table — now shows Paid, not Invoice Sent (paid wins,
      // per PaymentMark's own precedence comment in OrdersTable.tsx).
      await page.goto('/admin/orders')
      const rowAfterPaid = page.locator('tr', { hasText: marker })
      await expect(rowAfterPaid).toContainText(`${expectedTotal}₾`)
      await expect(rowAfterPaid.getByLabel('Paid', { exact: true })).toBeVisible({ timeout: 15_000 })
      await expect(rowAfterPaid.getByLabel('Invoice Sent', { exact: true })).toHaveCount(0)

      // 4c. CSV export: 'paid', Paid At now stamped, AND Invoice Sent At still
      // stamped — the exact two-independent-facts assertion in the one place
      // an accountant would actually look.
      const csvAfterPaid = await exportOrdersCsvViaUi(page)
      const colAfterPaid = csvRowFor(csvAfterPaid, marker)
      expect(colAfterPaid('Payment')).toBe('paid')
      expect(colAfterPaid('Paid At'), 'Paid At should now be stamped').not.toBe('')
      expect(colAfterPaid('Invoice Sent At'), 'Invoice Sent At must still be stamped — being paid must not erase having been invoiced').not.toBe('')
      expect(parseFloat(colAfterPaid('Total (GEL)'))).toBeCloseTo(expectedTotal, 2)

      // 4d. Still never on /admin/abandoned — a manually-paid reservation
      // never touched a gateway at any point in this flow.
      await page.goto('/admin/abandoned')
      await expect(abandonedRow(page, marker)).toHaveCount(0)

      await deleteTestOrderOnAdminPage(page, marker)
    } finally {
      await setPaymentSectionToggle(page, 'Individual bookings', originalToggle)
    }
  })
})
