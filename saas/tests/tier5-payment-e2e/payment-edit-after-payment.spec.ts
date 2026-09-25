// spec: playwright/notes/17-payment-edit-after-payment.md
//
// Chunk 6 of vault/Plan-PaymentE2ETesting.md — "edit after the fact", the
// stale-money check. §4's dependency map already flagged the suspect:
// `updateOrderEnhanced` (app/actions/orders.ts) recomputes `Order.totalPrice`
// (and the rate snapshots) whenever an admin edits guest counts on an
// existing order, but never once touches the `Payment` row — confirmed by
// reading the function in full before writing this spec: there is no
// `tx.payment` reference anywhere in it. `Payment.amount` is written exactly
// once, at `startCheckout()` time (createBooking.ts), and after that is only
// ever READ (settle.ts's own amount-equality gate, checked once, at the
// original settlement callback — never re-checked against a later edit).
//
// This chunk goes in expecting to find that gap, not to confirm there isn't
// one — per the plan's own instruction. It does: see the result below.
//
// Real, gateway-settled money in, then a real edit through the real admin UI,
// then every §4 surface checked side by side, before and after — including
// the one fact with literally NO UI surface anywhere in this app
// (`Payment.amount` — confirmed again while building this spec: not one grep
// hit for `payment.amount` outside settle.ts/manualPayment.ts/a read-only
// audit script). That one fact is read directly from the dev DB via
// `helpers/orderMoneyDb.ts` (a plain, read-only PrismaClient against the same
// `DATABASE_URL` the app itself uses — the only way to prove the divergence
// is real and reproducible, not just assumed from reading the code).
//
// Per vault/ClaudeInstructions.md Rule 8: this spec TESTS AND DOCUMENTS the
// gap. It does not fix app code — see vault/KnownBugs.md #64 and this file's
// own assertions, which assert on the actual (buggy) behavior, not an
// idealized one.
import { test, expect, Page } from '@playwright/test'
import { loginAsTenantAdmin } from '../helpers/auth'
import { readPaymentSectionToggle, setPaymentSectionToggle } from '../helpers/payments'
import { openReviewSheet, abandonedRow } from '../helpers/bookingForm'
import { FLITT_TEST_CARDS, payAtFlittCheckout } from '../helpers/flittPayment'
import { getResendApiKey } from '../helpers/credentials'
import { fetchRecentResendEmails, findMatchingEmail, fetchResendEmailBody } from '../helpers/resendCheck'
import { readOrderMoneyState, orderIdFromDetailUrl, disconnectOrderMoneyDb } from '../helpers/orderMoneyDb'

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

function csvRowFor(csv: string, marker: string): (col: string) => string {
  const lines = csv.split('\r\n')
  const header = splitCsvLine(lines[0])
  const dataLine = lines.find(l => l.includes(marker))
  expect(dataLine, `CSV export should contain a row for ${marker}`).toBeTruthy()
  const cells = splitCsvLine(dataLine!)
  return (name: string) => cells[header.indexOf(name)]
}

test.describe('Edit after the fact — the stale-money check (#191, Chunk 6)', () => {
  test('editing a card-paid order reprices Order.totalPrice everywhere but never touches the frozen Payment.amount', async ({ page, context }) => {
    // Three prior runs (200s, 300s, then 400s) all hit test.setTimeout
    // mid-flight, and the `mark()` timings below (added after the first
    // failure) found the real cause on the second failure: a locator
    // (`rowAfter`) built while `page` was on /admin/orders got read again
    // after `page` had since navigated to the order's own detail page for
    // the invoice re-send — a locator action's default timeout is unbounded
    // (it inherits the whole test's remaining budget rather than failing in
    // ~30s), so it silently retried for the rest of the run instead of
    // failing fast. Fixed by capturing that read at the one point `page` is
    // actually still on /admin/orders (see the comment at that capture
    // site). The real work itself only takes ~45s end to end (Flitt
    // checkout, the edit, both CSV exports, the Resend round trip) — kept
    // at a still-generous 200_000ms rather than trimming right to that
    // number, in case network conditions vary between runs.
    test.setTimeout(200_000)
    const t0 = Date.now()
    const mark = (label: string) => console.log(`[timing] +${((Date.now() - t0) / 1000).toFixed(1)}s ${label}`)
    await loginAsTenantAdmin(page)
    mark('logged in')
    const originalToggle = await readPaymentSectionToggle(page, 'Individual bookings')

    const marker = `ZZPaymentE2EEditAfterPay${Date.now()}`
    const email = `zz-payment-e2e-edit-after-pay-${Date.now()}@example.invalid`
    const originalGuestCount = 4
    const newGuestCount = 6

    let detailUrl = ''
    let orderId = ''

    try {
      await setPaymentSectionToggle(page, 'Individual bookings', true)

      // ── 1. A REAL gateway settlement — same shape as Chunk 3's individual
      // scenario, reused verbatim so this chunk starts from a genuinely
      // card-paid order, not a manually-recorded one (the plan is explicit
      // that this has to be a gateway-settled Payment with its own frozen
      // `amount`, not the manual-payment path). ──────────────────────────────
      const formPage = await context.newPage()
      await formPage.goto('/')
      await formPage.getByRole('button', { name: 'Tasting + Lunch', exact: false }).click()
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      await formPage.getByRole('textbox', { name: 'DD/MM/YYYY' }).fill(formatDate(tomorrow))
      await formPage.getByRole('combobox').selectOption({ index: 1 })
      await formPage.getByRole('spinbutton', { name: 'Number of Guests (minimum 4)' }).fill(String(originalGuestCount))
      await formPage.getByRole('textbox', { name: 'First Name' }).fill('ZZPaymentE2E')
      await formPage.getByRole('textbox', { name: 'Last Name' }).fill(marker)
      await formPage.getByRole('textbox', { name: 'Phone' }).fill('+995500000064')
      await formPage.getByRole('textbox', { name: 'Email' }).fill(email)

      const totalText = await formPage.getByText('Total', { exact: true }).locator('xpath=../following-sibling::*[1]').textContent()
      const chargedTotal = parseInt(totalText || '0', 10)
      expect(chargedTotal, 'quoted total should be a real positive amount').toBeGreaterThan(0)

      await openReviewSheet(formPage, 'Book & Pay')
      await Promise.all([
        formPage.waitForURL(/pay\.flitt\.com/, { timeout: 20_000, waitUntil: 'commit' }),
        formPage.getByRole('button', { name: 'Confirm & Book' }).click(),
      ])
      await payAtFlittCheckout(formPage, { cardNumber: FLITT_TEST_CARDS.approveNo3DS })
      await expect(formPage).toHaveURL(/\/payment\/result\?status=success/, { timeout: 20_000 })
      await expect(formPage.getByRole('heading', { name: 'Payment received' })).toBeVisible({ timeout: 10_000 })
      await formPage.close()
      mark('1: real Flitt settlement confirmed (customer-facing)')

      // ── 2. Find the order, confirm it really is gateway-settled (Card,
      // not a manual record), and capture its id for the direct DB reads
      // below. ───────────────────────────────────────────────────────────────
      await page.goto('/admin/orders')
      const row = page.locator('tr', { hasText: marker })
      await expect(row).toBeVisible({ timeout: 20_000 })
      await expect(row).toContainText(`${chargedTotal}₾`)
      await row.getByText(marker).first().click()
      await expect(page).toHaveURL(/\/admin\/orders\/(?!new$)[a-zA-Z0-9]+$/, { timeout: 15_000 })
      detailUrl = page.url()
      orderId = orderIdFromDetailUrl(detailUrl)
      const paidStepCard = page.locator('span').filter({ hasText: 'Paid' }).filter({ hasText: 'Card' })
      await expect(paidStepCard.first()).toBeVisible({ timeout: 10_000 })
      mark('2: order found, confirmed Card-settled')

      // ── 3. BEFORE snapshot — every §4 surface, plus the one fact none of
      // them show: Payment.amount, read straight from the DB. ────────────────
      const beforeDetailTotal = await page.getByText('Total', { exact: true }).locator('xpath=following-sibling::span[1]').textContent()
      expect(beforeDetailTotal).toBe(`${chargedTotal}.00₾`)

      const csvBefore = await exportOrdersCsvViaUi(page)
      const colBefore = csvRowFor(csvBefore, marker)
      expect(parseFloat(colBefore('Total (GEL)'))).toBeCloseTo(chargedTotal, 2)
      expect(colBefore('Payment')).toBe('paid')

      const beforeDb = await readOrderMoneyState(orderId)
      expect(beforeDb.totalPrice, 'Order.totalPrice should be in tetri (×100 of the GEL quote)').toBe(chargedTotal * 100)
      expect(beforeDb.paidAt, 'Order.paidAt should be set — this really settled').not.toBeNull()
      expect(beforeDb.abandonedAt).toBeNull()
      expect(beforeDb.payments, 'exactly one Payment row — the real Flitt settlement').toHaveLength(1)
      const payment = beforeDb.payments[0]
      expect(payment.provider, 'this has to be a gateway settlement, not a manual record').toBe('flitt')
      expect(payment.method).toBe('CARD')
      expect(payment.status).toBe('approved')
      expect(payment.settledAt, 'Payment.settledAt should be set by the real callback').not.toBeNull()
      // The whole reason this baseline is worth recording: right now, before
      // any edit, the two money facts agree exactly.
      expect(payment.amount, 'before the edit, Payment.amount and Order.totalPrice should agree exactly').toBe(beforeDb.totalPrice)
      mark('3: BEFORE snapshot captured (detail/CSV/DB all agree)')

      // ── 4. THE EDIT — through the real admin "Guest Breakdown" panel,
      // exactly the flow a real admin would use. Raises the party size and
      // moves the whole party into the Tasting+Lunch bucket (this order was
      // originally unsplit — 0/0 — so the split has to be filled in for
      // updateOrderEnhanced's own `totalPayingGuests > 0` guard to actually
      // recompute anything at all; leaving the split at 0/0 and only raising
      // the party size would silently NOT reprice, which is itself a real
      // nuance of this function worth knowing but not what this chunk is
      // testing). The manual per-person rate boxes are left untouched — they
      // are pre-filled from this order's own frozen rate snapshot (confirmed
      // by reading OrderDetail.tsx before writing this: `manualLunchRateStr`
      // initialises from `order.lunchRateSnapshot`, not a fresh tier lookup —
      // an individual order has no company tier to look up in the first
      // place), so this edit charges MORE GUESTS AT THE SAME AGREED RATE, the
      // most realistic and most sympathetic version of this edit a real
      // admin would make (adding two more people to an existing booking),
      // not a rate change on top of it. ───────────────────────────────────────
      await page.goto(detailUrl)
      await page
        .locator('label', { hasText: 'Total guests in the party' })
        .locator('xpath=following-sibling::input[1]')
        .fill(String(newGuestCount))
      await page
        .locator('label', { hasText: 'Tasting+Lunch guests' })
        .locator('xpath=following-sibling::input[1]')
        .fill(String(newGuestCount))
      await page.getByRole('button', { name: 'Save changes', exact: true }).click()
      await expect(page.getByText('Saved ✓', { exact: true })).toBeVisible({ timeout: 10_000 })
      mark('4: edit saved (guest count 4 -> 6)')

      // ── 5. AFTER snapshot — the identical checks, on the identical order,
      // after nothing but a guest-count edit through the app's own UI. ───────
      await page.goto('/admin/orders')
      const rowAfter = page.locator('tr', { hasText: marker })
      await expect(rowAfter).toBeVisible({ timeout: 20_000 })
      // Still marked Paid — the edit does not touch payment status at all.
      await expect(rowAfter.getByLabel('Paid', { exact: true })).toBeVisible()

      // A fresh cross-page navigation back to the detail page (not a same-URL
      // page.goto(), which ARCHITECTURE.md/theme.ts's own note documents as a
      // soft client-side nav that can silently reuse a stale RSC payload) —
      // this has to be what the server actually persisted, not the page's own
      // still-live client state from the edit above.
      await rowAfter.getByText(marker).first().click()
      await expect(page).toHaveURL(detailUrl, { timeout: 15_000 })
      const afterDetailTotal = await page.getByText('Total', { exact: true }).locator('xpath=following-sibling::span[1]').textContent()
      const afterPaidStepCard = page.locator('span').filter({ hasText: 'Paid' }).filter({ hasText: 'Card' })
      await expect(afterPaidStepCard.first()).toBeVisible({ timeout: 10_000 })
      mark('5a: back on detail page, fresh nav confirmed')

      const csvAfter = await exportOrdersCsvViaUi(page)
      const colAfter = csvRowFor(csvAfter, marker)
      expect(colAfter('Payment'), 'still shown as paid after the edit — nothing here flags a mismatch').toBe('paid')
      mark('5b: CSV export #2 done')

      // `exportOrdersCsvViaUi` leaves `page` on /admin/orders — the ONLY point
      // after the edit where that is still true, since the invoice re-send
      // below has to navigate to the detail page. `rowAfter` (defined above,
      // bound to /admin/orders) has to be read HERE, not later: a real bug
      // caught the hard way in an earlier run — reading `rowAfter.textContent()`
      // after navigating away to `detailUrl` for the invoice step left the
      // locator pointing at a `<tr>` that no longer exists on the current
      // page, and since a locator action's default timeout is unbounded
      // (inherits the whole test's remaining budget, not a fixed 30s), it
      // silently retried for the rest of the test instead of failing fast —
      // indistinguishable from a hang without the `mark()` timings above to
      // show exactly which step never printed.
      const rowAfterText = (await rowAfter.textContent()) ?? ''
      const rowAfterMatch = rowAfterText.match(/([\d.]+)\s*₾/)

      const afterDb = await readOrderMoneyState(orderId)
      mark('5c: AFTER DB read done')

      // ── 6. Re-send the invoice — the one remaining §4 surface — and read
      // what amount it actually states. `exportOrdersCsvViaUi` above left the
      // page on /admin/orders (its own internal `page.goto`), and "Send
      // Invoice" only exists on the order's own detail page — found the hard
      // way in an earlier run: without this nav, Playwright's actionability
      // wait on that button just retries silently for the rest of the test's
      // budget instead of failing fast, which is what actually produced two
      // consecutive "test timeout exceeded" failures (200s, then 300s) even
      // though the DB showed every real step — the settlement, the edit, the
      // re-price — had already succeeded both times. ─────────────────────────
      await page.goto(detailUrl)
      mark('5d: back on detail page for the invoice re-send')
      const invoiceStartIso = new Date(Date.now() - 10_000).toISOString() // clock-skew margin, per 16-payment-admin-order's own finding
      await page.getByRole('button', { name: 'Send Invoice', exact: true }).click()
      await expect(page.getByText('Sent ✓', { exact: true })).toBeVisible({ timeout: 15_000 })
      const resendApiKey = getResendApiKey()
      let invoiceEmail: Awaited<ReturnType<typeof fetchRecentResendEmails>>[number] | undefined
      await expect(async () => {
        const emails = await fetchRecentResendEmails(resendApiKey)
        invoiceEmail = findMatchingEmail(emails, email, new RegExp(marker), invoiceStartIso)
        expect(invoiceEmail, 'the invoice email should have reached Resend').toBeTruthy()
      }).toPass({ timeout: 20_000 })
      const invoiceBody = await fetchResendEmailBody(resendApiKey, invoiceEmail!.id)
      const invoiceHtml = invoiceBody.html ?? ''
      mark('6: invoice re-sent, found in Resend, body fetched')

      // ── 7. THE ACTUAL FINDING — assert on it directly, not around it. ──────
      const afterTotalMajor = (afterDb.totalPrice ?? 0) / 100

      // A real repricing genuinely happened — this is not a no-op edit.
      expect(afterDb.totalPrice).not.toBe(beforeDb.totalPrice)
      expect(afterTotalMajor).toBeGreaterThan(chargedTotal)
      // Same order, same single Payment row — the edit created nothing new.
      expect(afterDb.payments).toHaveLength(1)
      expect(afterDb.payments[0].id).toBe(payment.id)
      // THE BUG: Payment.amount — the actual amount charged and settled at
      // the gateway — is frozen exactly where it was before the edit.
      expect(afterDb.payments[0].amount, 'Payment.amount must not change on an order edit — confirming it stays frozen at the original charge').toBe(payment.amount)
      expect(afterDb.payments[0].status).toBe('approved')
      expect(afterDb.payments[0].settledAt?.toISOString()).toBe(payment.settledAt?.toISOString())
      // The two money facts now disagree, and nothing anywhere reconciles them.
      expect(afterDb.totalPrice).not.toBe(afterDb.payments[0].amount)

      // Every UI surface shows the NEW total — none of them show what was
      // actually charged, and none of them flag the disagreement. Parsed
      // numerically rather than matched against a constructed string:
      // `formatTetri` only shows decimals when the tetri amount doesn't
      // divide evenly into whole GEL, and this edit's arithmetic (originalRate
      // × newGuestCount) isn't guaranteed to stay whole just because the
      // original amount was — a brittle exact-string match would fail on a
      // tenant/tier configuration this suite doesn't control, for a reason
      // that has nothing to do with the bug this spec exists to prove.
      // (rowAfterText/rowAfterMatch captured earlier, while `page` was still
      // actually on /admin/orders — see the comment at that capture site.)
      expect(rowAfterMatch, `admin orders table row should show a ₾ total: ${rowAfterText}`).not.toBeNull()
      expect(parseFloat(rowAfterMatch![1]), 'admin orders table shows the new total').toBeCloseTo(afterTotalMajor, 2)
      // The detail page's own Total card always renders with 2 decimals
      // (`formatTetri(..., { decimals: true })`), so this one format IS safe
      // to match exactly.
      expect(afterDetailTotal, "order detail's own Total card shows the new total").toBe(`${afterTotalMajor.toFixed(2)}₾`)
      expect(parseFloat(colAfter('Total (GEL)')), 'CSV export shows the new total').toBeCloseTo(afterTotalMajor, 2)
      expect(invoiceHtml, 'the re-sent invoice states the NEW total, not what was actually charged').toContain(String(afterTotalMajor))
      mark('7: all assertions checked')

      // Never appears on /admin/abandoned throughout any of this.
      await page.goto('/admin/abandoned')
      await expect(abandonedRow(page, marker)).toHaveCount(0)

      await deleteTestOrderOnAdminPage(page, marker)
      mark('8: cleanup done')
    } finally {
      await setPaymentSectionToggle(page, 'Individual bookings', originalToggle)
      await deleteTestOrderOnAdminPage(page, marker).catch(() => {})
      await disconnectOrderMoneyDb()
      mark('finally: toggle restored, DB disconnected')
    }
  })
})
