// spec: playwright/notes/16-payment-admin-order.md
//
// Chunk 5 of vault/Plan-PaymentE2ETesting.md — the "admin-created order" gap.
// Per the plan's §2d (confirmed by reading createOrderAdmin in
// app/actions/orders.ts before this chunk started): an order typed directly
// into /admin/orders/new never calls startCheckout() at all — it always
// starts completely unpaid, with no Flitt involvement possible, ever. This
// is a genuinely different resting state than a guest order that got
// declined or abandoned at the gateway (Chunk 3): this order was never
// "incomplete" in the first place, because it never went anywhere to be
// incomplete from.
//
// This spec checks two things in one pass: does an admin-created order
// render with true parity to a guest-created one everywhere the app shows
// order data (same OrdersTable/OrderDetail/CSV code paths — there is no
// "created by" branch anywhere in them, so parity is mostly structural, but
// this is the first chunk in the plan to actually prove that rather than
// assume it), and can it still be paid through the same manual-payment path
// Chunk 4 already proved works (send invoice, then record a manual
// BANK_TRANSFER payment via the "Paid" picker).
//
// Runs against staging.vineworks.ge (dev DB), same as the rest of this tier.
// Unlike payment-approved-settlement.spec.ts / payment-declined-settlement.spec.ts /
// payment-book-later.spec.ts, this spec never touches the "Individual bookings"
// payment-section toggle — createOrderAdmin doesn't call shouldTakePayment()
// at all, so the toggle's state is irrelevant here. Safe to run alongside
// those three, not just sequentially with them.
import { test, expect, Page } from '@playwright/test'
import { loginAsTenantAdmin } from '../helpers/auth'
import { readPaymentBankDetails } from '../helpers/payments'
import { abandonedRow } from '../helpers/bookingForm'
import { getResendApiKey } from '../helpers/credentials'
import { fetchRecentResendEmails, findMatchingEmail, fetchResendEmailBody } from '../helpers/resendCheck'

function toISODate(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
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
 * pattern payment-book-later.spec.ts uses. */
function csvRowFor(csv: string, marker: string): (col: string) => string {
  const lines = csv.split('\r\n')
  const header = splitCsvLine(lines[0])
  const dataLine = lines.find(l => l.includes(marker))
  expect(dataLine, `CSV export should contain a row for ${marker}`).toBeTruthy()
  const cells = splitCsvLine(dataLine!)
  return (name: string) => cells[header.indexOf(name)]
}

test.describe('Admin-created order — parity with a guest order, then manual payment (Chunk 5)', () => {
  test('an order typed into /admin/orders/new renders identically to a guest order and can still be paid', async ({ page }) => {
    // Generous, matching payment-book-later.spec.ts's budget for a similarly
    // round-trip-heavy scenario: admin order creation, two CSV exports, two
    // Resend API calls, two admin status-change writes, plus the §4 checks
    // at three separate points (just-created, invoiced, paid).
    test.setTimeout(300_000)
    const t0 = Date.now()
    const mark = (label: string) => console.log(`[timing] +${((Date.now() - t0) / 1000).toFixed(1)}s ${label} — url=${page.url()}`)
    await loginAsTenantAdmin(page)
    mark('logged in')

    // Read the real bank-transfer details live, before creating anything —
    // same reasoning as payment-book-later.spec.ts: these are what
    // sendOrderInvoice() actually prints into the email.
    const bankDetails = await readPaymentBankDetails(page)
    for (const [field, value] of Object.entries(bankDetails)) {
      expect(value, `Settings → Payment details → ${field} should not be empty for this check to mean anything`).not.toBe('')
    }
    mark('bank details read')

    const marker = `ZZPaymentE2EAdminOrder${Date.now()}`
    const email = `zz-payment-e2e-admin-order-${Date.now()}@example.invalid`
    const firstName = 'ZZPaymentE2E'
    const phone = '+995500000063'
    const tastingRate = '50'
    const guestCount = 4
    const expectedTotal = guestCount * parseInt(tastingRate, 10) // 200 — individual, TASTING visit, manual rate

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const dateIso = toISODate(tomorrow)

    let detailUrl = ''
    let detailPath = ''

    try {
      // ── 1. Create the order directly through the admin UI ────────────────
      // NOT the public booking form — this is createOrderAdmin, a completely
      // separate code path (plan §2d) that never calls startCheckout(). An
      // individual booking, matching the plan's established "simplest case"
      // pattern from Chunks 3/4.
      await page.goto('/admin/orders/new')
      const dateInput = page.locator('input[type="date"]')
      // Same hydration-timing bug documented in tier3-admin-smoke/admin-orders.spec.ts
      // (08-admin-orders.md): filling the date input right after goto() can
      // silently get reset by a late-finishing React hydration. Fix carried
      // over verbatim: re-fill and re-verify the date as the LAST action
      // immediately before submit.
      await expect(dateInput).toBeVisible({ timeout: 15_000 })
      await dateInput.fill(dateIso)
      await page.getByRole('textbox').nth(1).fill(String(guestCount)) // Party size / guest count
      await page.getByRole('textbox').nth(2).fill(firstName) // First name
      await page.getByRole('textbox').nth(3).fill(marker) // Last name (the unique marker)
      await page.locator('input[type="tel"]').fill(phone)
      await page.locator('input[type="email"]').fill(email)
      // Manual tasting rate — an individual order always shows this (no
      // company tier to fall back on). Located by its label rather than a
      // positional textbox index, since several more text inputs sit between
      // the contact fields and this one (notes textarea) that a plain nth()
      // chain would have to account for.
      await page
        .locator('label', { hasText: 'Tasting only ₾/pp' })
        .locator('xpath=following-sibling::input[1]')
        .fill(tastingRate)
      await dateInput.fill(dateIso)
      await expect(dateInput).toHaveValue(dateIso)
      await page.getByRole('button', { name: 'Create order', exact: true }).click()
      // expect: redirected to the new order's detail page — confirms
      // creation succeeded server-side, not just that the form submitted.
      // Real bug found building this spec: a plain /\/admin\/orders\/[a-zA-Z0-9]+$/
      // also matches the literal starting URL /admin/orders/new (since "new" is
      // itself alphanumeric) — so this assertion was passing instantly, before
      // the real client-side router.push() redirect had happened, capturing
      // `detailUrl` as still "/admin/orders/new". Every later "detail page"
      // check then silently re-visited the blank New Order form instead of the
      // real order, which is why the Order Total row read "0.00₾" (the form's
      // own unfilled preview) rather than the order's real 200₾ — a bug in this
      // test, not the app (independently confirmed live: the exact same order
      // id, opened directly, renders "200.00₾" correctly). The negative
      // lookahead below excludes that one literal segment.
      await expect(page).toHaveURL(/\/admin\/orders\/(?!new$)[a-zA-Z0-9]+$/, { timeout: 15_000 })
      detailUrl = page.url()
      detailPath = new URL(detailUrl).pathname
      mark('admin order created')

      // ── 2. Confirm it never touched Flitt and started unpaid ─────────────
      // A different resting state than a guest order that got declined or
      // abandoned at the gateway (Chunk 3): this order was never "incomplete"
      // in the first place, since it never went anywhere to be incomplete
      // from. `Payment` row / `abandonedAt` / `paidAt` all confirmed absent
      // via direct SQL after this run — the checks below are the UI-visible
      // consequences of that same fact.
      await page.goto('/admin/abandoned')
      await expect(abandonedRow(page, marker)).toHaveCount(0)
      mark('2: confirmed absent from /admin/abandoned')

      // ── 3. Parity check #1 — admin orders table, just-created ────────────
      // Same OrdersTable component a guest-created order renders through —
      // no admin-origin branch anywhere in it. Checking the exact cell
      // content/format Chunks 3/4 already established for a guest order:
      // the "Individual" type badge, the contact name, the ₾ total with no
      // decimals when the amount is whole, and no Paid/Invoice Sent marks yet.
      await page.goto('/admin/orders')
      const row = page.locator('tr', { hasText: marker })
      await expect(row).toBeVisible({ timeout: 20_000 })
      await expect(row).toContainText(`${firstName} ${marker}`)
      await expect(row).toContainText('Individual')
      await expect(row).toContainText(`${expectedTotal}₾`)
      await expect(row.getByLabel('Paid', { exact: true })).toHaveCount(0)
      await expect(row.getByLabel('Invoice Sent', { exact: true })).toHaveCount(0)
      mark('3: admin orders table checked (unpaid, un-invoiced, Individual badge)')

      // ── 3b. Parity check #2 — the order's own detail view, just-created ──
      await page.goto(detailUrl)
      const totalValue = page.getByText('Total', { exact: true }).locator('xpath=following-sibling::span[1]')
      await expect(totalValue).toHaveText(`${expectedTotal}.00₾`)
      await expect(page.getByLabel('Invoice Sent', { exact: true })).toHaveCount(0)
      // The Invoice History card itself always renders (same as a guest order)
      // — it's the "No invoices sent yet." empty state that says nothing has
      // gone out yet, not the heading's absence.
      const invoiceHistoryCard = page
        .getByRole('heading', { name: 'Invoice History' })
        .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
      await expect(invoiceHistoryCard).toContainText('No invoices sent yet.')
      mark('3b: order detail checked (correct total, no invoice/payment marks)')

      // ── 3c. Parity check #3 — CSV export, just-created ────────────────────
      const csvBeforeInvoice = await exportOrdersCsvViaUi(page)
      const colBeforeInvoice = csvRowFor(csvBeforeInvoice, marker)
      expect(colBeforeInvoice('Payment')).toBe('unpaid')
      expect(colBeforeInvoice('Paid At'), 'Paid At should be empty').toBe('')
      expect(colBeforeInvoice('Invoice Sent At'), 'Invoice Sent At should be empty').toBe('')
      expect(parseFloat(colBeforeInvoice('Total (GEL)'))).toBeCloseTo(expectedTotal, 2)
      expect(colBeforeInvoice('Booking Type')).toBe('INDIVIDUAL')
      mark('3c: csv export #1 checked')

      // ── 4. Send the invoice, from the order's own detail page ────────────
      // Same real admin flow payment-book-later.spec.ts already proved works
      // — reused verbatim, not re-derived, since this is the exact same
      // sendOrderInvoice() code path regardless of how the order was created.
      await page.goto(detailUrl)
      // A 10s safety margin, not the literal moment: real finding while
      // building this spec — this machine's local clock and the timestamp
      // Resend's send pipeline stamps `created_at` with differ by a few
      // hundred ms (confirmed live: a genuine, correctly-sent invoice email's
      // `created_at` read as ~380ms *before* an un-buffered `new Date()`
      // captured here), which is small but systematic, not jitter — so no
      // amount of retrying `findMatchingEmail`'s `>=` check would ever pass
      // without a buffer. `limit=100` already scopes the list to "recent
      // sends"; this timestamp is just an extra sanity filter, so a 10s
      // margin costs nothing real.
      const testStartIso = new Date(Date.now() - 10_000).toISOString()
      const sendInvoiceBtn = page.getByRole('button', { name: 'Send Invoice', exact: true })
      await expect(sendInvoiceBtn).toBeEnabled({ timeout: 10_000 })
      await Promise.all([
        page.waitForResponse(res => res.url().includes(detailPath) && res.request().method() === 'POST'),
        sendInvoiceBtn.click(),
      ])
      await expect(page.getByText('Sent ✓', { exact: true })).toBeVisible({ timeout: 20_000 })
      mark('4: invoice sent')

      // 4a. Order detail's own two independent facts, right after sending.
      await expect(page.getByLabel('Invoice Sent', { exact: true })).toBeVisible({ timeout: 10_000 })
      await expect(invoiceHistoryCard).toContainText(email)
      await expect(invoiceHistoryCard).toContainText(`${expectedTotal}₾`)
      mark('4a checked (invoice-sent mark + history)')

      // 4b. Admin orders table shows "Invoice Sent", not yet "Paid".
      await page.goto('/admin/orders')
      const rowAfterInvoice = page.locator('tr', { hasText: marker })
      await expect(rowAfterInvoice.getByLabel('Invoice Sent', { exact: true })).toBeVisible({ timeout: 15_000 })
      await expect(rowAfterInvoice.getByLabel('Paid', { exact: true })).toHaveCount(0)
      mark('4b checked (orders table)')

      // 4c. CSV export: 'invoiced', Invoice Sent At stamped, Paid At still empty.
      const csvAfterInvoice = await exportOrdersCsvViaUi(page)
      const colAfterInvoice = csvRowFor(csvAfterInvoice, marker)
      expect(colAfterInvoice('Payment')).toBe('invoiced')
      expect(colAfterInvoice('Invoice Sent At'), 'Invoice Sent At should be stamped').not.toBe('')
      expect(colAfterInvoice('Paid At'), 'Paid At should still be empty — no payment recorded yet').toBe('')
      mark('4c checked (csv export #2)')

      // 4d. Still never on /admin/abandoned.
      await page.goto('/admin/abandoned')
      await expect(abandonedRow(page, marker)).toHaveCount(0)
      mark('4d checked (still not abandoned)')

      // 4e. The email actually reached Resend, and its CONTENT matches the
      // order's own stored total and the live bank-transfer settings — same
      // hard assertion payment-book-later.spec.ts makes, since sendOrderInvoice()
      // is awaited directly (orders.ts), not fire-and-forget. Polled rather
      // than fetched once, on general principle (list-endpoint indexing lag
      // is plausible even though the clock-skew margin above is this run's
      // actual, confirmed cause).
      const resendApiKey = getResendApiKey()
      let invoiceEmail: Awaited<ReturnType<typeof fetchRecentResendEmails>>[number] | undefined
      await expect(async () => {
        const emails = await fetchRecentResendEmails(resendApiKey)
        invoiceEmail = findMatchingEmail(emails, email, new RegExp(marker), testStartIso)
        expect(invoiceEmail, 'the invoice email should have reached Resend').toBeTruthy()
      }).toPass({ timeout: 20_000 })
      const body = await fetchResendEmailBody(resendApiKey, invoiceEmail!.id)
      const html = body.html ?? ''
      expect(html, 'invoice email should carry the recipient name from Settings').toContain(bankDetails.recipientName)
      expect(html, 'invoice email should carry the personal number from Settings').toContain(bankDetails.personalNumber)
      expect(html, 'invoice email should carry the bank name from Settings').toContain(bankDetails.bankName)
      expect(html, 'invoice email should carry the bank code from Settings').toContain(bankDetails.bankCode)
      expect(html, 'invoice email should carry the IBAN from Settings').toContain(bankDetails.iban)
      expect(html, "invoice email's amount should match the order's own stored total").toContain(String(expectedTotal))
      mark('4e checked (resend list + body content)')

      // ── 5. Record the manual bank-transfer payment ───────────────────────
      // The exact "Paid" → "Bank transfer" picker payment-book-later.spec.ts
      // proved works (commits b58e9cc/ac47541 fixed it closing itself
      // instantly) — reused verbatim.
      await page.goto(detailUrl)
      mark('5: back on detail page')
      await page.getByRole('button', { name: /▾$/ }).first().click()
      await page.getByRole('button', { name: 'Paid', exact: true }).click()
      const bankTransferBtn = page.getByRole('button', { name: 'Bank transfer', exact: true })
      await bankTransferBtn.waitFor({ state: 'visible', timeout: 8_000 })
      await Promise.all([
        page.waitForResponse(res => res.url().includes(detailPath) && res.request().method() === 'POST', { timeout: 20_000 }),
        bankTransferBtn.click(),
      ])
      mark('5: bank transfer recorded')

      // ── 6. Parity re-check, now paid — the point of this step is proving
      // there is no divergence between the two origins once both are paid.
      // Every assertion below matches, value-for-value and format-for-format,
      // what payment-book-later.spec.ts asserted for a guest-created order in
      // this exact same end state (paid + invoiced, bank transfer).
      const paidStep = page.locator('span').filter({ hasText: 'Paid' }).filter({ hasText: 'Bank transfer' })
      await expect(paidStep.first()).toBeVisible({ timeout: 10_000 })
      await expect(page.getByLabel('Invoice Sent', { exact: true })).toHaveCount(0)
      await expect(invoiceHistoryCard).toContainText(email)
      await expect(invoiceHistoryCard).toContainText(`${expectedTotal}₾`)
      mark('6a: order detail checked (paid + bank transfer, invoice history intact)')

      await page.goto('/admin/orders')
      const rowAfterPaid = page.locator('tr', { hasText: marker })
      await expect(rowAfterPaid).toContainText(`${expectedTotal}₾`)
      await expect(rowAfterPaid).toContainText('Individual')
      await expect(rowAfterPaid.getByLabel('Paid', { exact: true })).toBeVisible({ timeout: 15_000 })
      await expect(rowAfterPaid.getByLabel('Invoice Sent', { exact: true })).toHaveCount(0)
      mark('6b: admin orders table checked (paid, Individual badge unchanged)')

      const csvAfterPaid = await exportOrdersCsvViaUi(page)
      const colAfterPaid = csvRowFor(csvAfterPaid, marker)
      expect(colAfterPaid('Payment')).toBe('paid')
      expect(colAfterPaid('Paid At'), 'Paid At should now be stamped').not.toBe('')
      expect(colAfterPaid('Invoice Sent At'), 'Invoice Sent At must still be stamped — being paid must not erase having been invoiced').not.toBe('')
      expect(parseFloat(colAfterPaid('Total (GEL)'))).toBeCloseTo(expectedTotal, 2)
      expect(colAfterPaid('Booking Type')).toBe('INDIVIDUAL')
      mark('6c: csv export #3 checked')

      await page.goto('/admin/abandoned')
      await expect(abandonedRow(page, marker)).toHaveCount(0)
      mark('6d: still absent from /admin/abandoned')

      await deleteTestOrderOnAdminPage(page, marker)
      mark('cleanup done')
    } finally {
      // Safety net in case the happy-path cleanup above didn't run (e.g. an
      // assertion failed before reaching it) — no toggle to restore here,
      // unlike payment-book-later.spec.ts, since createOrderAdmin never
      // consults the payment-section toggle at all.
      await deleteTestOrderOnAdminPage(page, marker).catch(() => {})
    }
  })
})
