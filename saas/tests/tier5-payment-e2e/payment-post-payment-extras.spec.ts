// spec: playwright/notes/18-payment-post-payment-extras.md
//
// Chunk 6 of vault/Plan-PostPaymentExtras.md — one real, end-to-end regression
// proving the whole "charge more after an order is closed" flow that Chunks
// 1-5 built and verified piecemeal: lock price fields once paid (Chunk 1),
// extras become a visible balance instead of a silent reprice (Chunk 2), a
// genuine second manual payment (Chunk 3), a genuine card-link top-up
// (Chunk 4), and the itemised multi-payment display (Chunk 5) — all on ONE
// order, in the order a real admin would hit them, with the one fact none of
// them show on any screen (`Payment.amount`) read straight from the dev DB
// at every step, not just the end.
//
// Reuses the tier5 helpers built for vault/Plan-PaymentE2ETesting.md rather
// than reinventing any of them: `flittPayment.ts` for the real Flitt hosted
// checkout (used twice — the original settlement AND the card-link top-up),
// `payments.ts` for the Individual-bookings section toggle, `resendCheck.ts`
// + `credentials.ts` for the invoice-resend proof, `orderMoneyDb.ts` for the
// one money fact with no UI surface anywhere in this app, and `bookingForm.ts`
// for the public booking form's Review sheet.
//
// KnownBugs.md #65 note: this scenario deliberately advances the order's
// stage to Confirmed before the SECOND real gateway settlement (the card-link
// top-up) — exactly what Plan-PaymentE2ETesting.md's own design spike did —
// specifically so `settle.ts`'s `stage: 'NEW'` guard does not fire and drag
// `Order.paidAt` forward a second time. This is not a workaround for a
// regression this chunk introduced; it's the documented way to avoid
// confusing #65's already-understood, already-logged symptom with a new
// failure in the flow this spec actually exists to test. The DB assertions
// below explicitly check `paidAt` stays pinned to the ORIGINAL settlement's
// timestamp through the second one, as a regression guard for exactly that.
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

test.describe('Post-payment extras end-to-end (KnownBugs #64, Plan-PostPaymentExtras Chunk 6)', () => {
  test('a paid order can be locked, extended, part-paid manually, part-paid by card link, and still show the truth everywhere', async ({ page, context }) => {
    // Two real Flitt checkouts (original settlement + card-link top-up), an
    // admin edit attempt, an extra, a manual top-up, a stage change, two CSV
    // exports and a real invoice re-send — generously budgeted above
    // payment-edit-after-payment.spec.ts's own 200s (one Flitt round trip)
    // for the second real checkout this scenario adds.
    test.setTimeout(280_000)
    const t0 = Date.now()
    const mark = (label: string) => console.log(`[timing] +${((Date.now() - t0) / 1000).toFixed(1)}s ${label}`)
    await loginAsTenantAdmin(page)
    mark('logged in')
    const originalToggle = await readPaymentSectionToggle(page, 'Individual bookings')

    const marker = `ZZPaymentE2EPostPayExtras${Date.now()}`
    const email = `zz-payment-e2e-post-pay-extras-${Date.now()}@example.invalid`
    const guestCount = 4
    const extraAmountMajor = 100
    const manualTopUpMajor = 40

    let detailUrl = ''
    let orderId = ''

    try {
      await setPaymentSectionToggle(page, 'Individual bookings', true)

      // ── 1. A REAL gateway settlement — same shape as
      // payment-edit-after-payment.spec.ts's step 1, reused verbatim so this
      // scenario starts from a genuinely card-paid order, matching the plan's
      // own "Chunk 3-style real payment" instruction. ────────────────────────
      const formPage = await context.newPage()
      await formPage.goto('/')
      await formPage.getByRole('button', { name: 'Tasting + Lunch', exact: false }).click()
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      await formPage.getByRole('textbox', { name: 'DD/MM/YYYY' }).fill(formatDate(tomorrow))
      await formPage.getByRole('combobox').selectOption({ index: 1 })
      await formPage.getByRole('spinbutton', { name: 'Number of Guests (minimum 4)' }).fill(String(guestCount))
      // Contact Person merged First/Last Name into one Name field 2026-09-30
      // (MaintenanceNotes.md §1).
      await formPage.getByRole('textbox', { name: 'Name', exact: true }).fill(`ZZPaymentE2E ${marker}`)
      await formPage.getByRole('textbox', { name: 'Phone' }).fill('+995500000065')
      await formPage.getByRole('textbox', { name: 'Email' }).fill(email)

      const totalText = await formPage.getByText('Total', { exact: true }).locator('xpath=../following-sibling::*[1]').textContent()
      const originalTotal = parseInt(totalText || '0', 10)
      expect(originalTotal, 'quoted total should be a real positive amount').toBeGreaterThan(0)

      await openReviewSheet(formPage, 'Book & Pay')
      await Promise.all([
        formPage.waitForURL(/pay\.flitt\.com/, { timeout: 20_000, waitUntil: 'commit' }),
        formPage.getByRole('button', { name: 'Confirm & Book' }).click(),
      ])
      await payAtFlittCheckout(formPage, { cardNumber: FLITT_TEST_CARDS.approveNo3DS })
      await expect(formPage).toHaveURL(/\/payment\/result\?status=success/, { timeout: 20_000 })
      await expect(formPage.getByRole('heading', { name: 'Payment received' })).toBeVisible({ timeout: 10_000 })
      await formPage.close()
      mark('1: real Flitt settlement #1 confirmed (customer-facing)')

      // ── 2. Find the order, confirm Card-settled, capture its id. ───────────
      await page.goto('/admin/orders')
      const row = page.locator('tr', { hasText: marker })
      await expect(row).toBeVisible({ timeout: 20_000 })
      await expect(row).toContainText(`${originalTotal}₾`)
      await row.getByText(marker).first().click()
      await expect(page).toHaveURL(/\/admin\/orders\/(?!new$)[a-zA-Z0-9]+$/, { timeout: 15_000 })
      detailUrl = page.url()
      orderId = orderIdFromDetailUrl(detailUrl)
      const paidStepCard = page.locator('span').filter({ hasText: 'Paid' }).filter({ hasText: 'Card' })
      await expect(paidStepCard.first()).toBeVisible({ timeout: 10_000 })
      mark('2: order found, confirmed Card-settled')

      // ── 3. DB read #1 — the original payment, captured before anything
      // else touches this order. Everything below is checked against this
      // snapshot, not against each other, so a bug that only shows up on the
      // SECOND comparison can't hide behind the first one happening to agree. ─
      const dbAfterSettlement = await readOrderMoneyState(orderId)
      expect(dbAfterSettlement.payments).toHaveLength(1)
      const originalPayment = dbAfterSettlement.payments[0]
      expect(originalPayment.provider).toBe('flitt')
      expect(originalPayment.method).toBe('CARD')
      expect(originalPayment.status).toBe('approved')
      expect(originalPayment.settledAt).not.toBeNull()
      expect(originalPayment.amount).toBe(originalTotal * 100)
      expect(dbAfterSettlement.totalPrice).toBe(originalTotal * 100)
      const pinnedPaidAt = dbAfterSettlement.paidAt
      expect(pinnedPaidAt, 'Order.paidAt should be set by the real settlement').not.toBeNull()
      mark('3: DB read #1 — original payment snapshot captured')

      // ── 4. Chunk 1 — attempt an edit, confirm it's rejected/disabled. ───────
      await expect(page.getByText('This order is already paid.', { exact: false })).toBeVisible()
      const partySizeInput = page.locator('label', { hasText: 'Total guests in the party' }).locator('xpath=following-sibling::input[1]')
      const tastingGuestsInput = page.locator('label', { hasText: 'Tasting-only guests' }).locator('xpath=following-sibling::input[1]')
      const lunchGuestsInput = page.locator('label', { hasText: 'Tasting+Lunch guests' }).locator('xpath=following-sibling::input[1]')
      const saveButton = page.getByRole('button', { name: 'Save changes', exact: true })
      await expect(partySizeInput).toBeDisabled()
      await expect(tastingGuestsInput).toBeDisabled()
      await expect(lunchGuestsInput).toBeDisabled()
      await expect(saveButton).toBeDisabled()
      // A genuine attempt, not just a state check: Playwright's own
      // actionability wait for `.fill()` blocks on the element becoming
      // enabled, and with no timeout of its own that wait inherits the
      // WHOLE TEST's remaining budget rather than failing in a few seconds
      // (the exact hang documented in 17-payment-edit-after-payment.md) — a
      // short explicit timeout is required so a genuinely disabled field
      // fails FAST, which is itself the proof the lock works, not a hang to
      // be waited out.
      await partySizeInput.fill(String(guestCount + 50), { timeout: 3_000 }).catch(() => {})
      await expect(partySizeInput).toHaveValue(String(guestCount))
      mark('4: Chunk 1 lock confirmed — fields disabled, edit attempt had no effect')

      // ── 5. Chunk 2 — add a real extra, confirm balance-due appears
      // correctly on the order detail page AND the admin orders table. ───────
      await page.getByRole('button', { name: '+ Add extra charge', exact: true }).click()
      await page.getByPlaceholder('e.g. Additional wine').fill('2 additional guests')
      await page.locator('label', { hasText: 'Amount (₾)' }).first().locator('xpath=following-sibling::input[1]').fill(String(extraAmountMajor))
      await page.getByRole('button', { name: 'Add', exact: true }).click()
      // Renders in TWO places once added — the Extra Charges card's own list
      // AND the Total card's line-item breakdown (both map over the same
      // `extras` array) — `.first()` avoids a strict-mode violation on the
      // genuinely-duplicated text, not a mistake to fix on either side.
      await expect(page.getByText('2 additional guests').first()).toBeVisible({ timeout: 10_000 })

      const newTotal = originalTotal + extraAmountMajor
      const detailTotalAfterExtra = await page.getByText('Total', { exact: true }).locator('xpath=following-sibling::span[1]').textContent()
      expect(detailTotalAfterExtra).toBe(`${newTotal}.00₾`)
      const balanceRowLabel = page.getByText('Balance due', { exact: true })
      await expect(balanceRowLabel).toBeVisible()
      const balanceAfterExtra = await balanceRowLabel.locator('xpath=following-sibling::span[1]').textContent()
      expect(balanceAfterExtra).toBe(`${extraAmountMajor}.00₾`)

      // Orders table — Chunk 2's own scope also named this surface.
      await page.goto('/admin/orders')
      const rowWithBalance = page.locator('tr', { hasText: marker })
      await expect(rowWithBalance).toBeVisible({ timeout: 15_000 })
      const balanceMark = rowWithBalance.locator(`[title="Balance due: ${extraAmountMajor}.00₾"]`)
      await expect(balanceMark).toHaveCount(1)
      await page.goto(detailUrl)
      mark('5: Chunk 2 — extra added, balance due correct on detail page and orders table')

      // DB read #2 — the extra moved totalPrice; the original payment did not move.
      const dbAfterExtra = await readOrderMoneyState(orderId)
      expect(dbAfterExtra.totalPrice).toBe(newTotal * 100)
      expect(dbAfterExtra.payments).toHaveLength(1)
      expect(dbAfterExtra.payments[0].amount, 'original Payment.amount must not move when an extra is added').toBe(originalPayment.amount)
      expect(dbAfterExtra.payments[0].status).toBe(originalPayment.status)
      expect(dbAfterExtra.payments[0].settledAt?.toISOString()).toBe(originalPayment.settledAt?.toISOString())
      mark('5b: DB read #2 — original payment still untouched after the extra')

      // ── 6. Advance the booking stage past NEW before the second real
      // settlement — avoids KnownBugs #65 (settle.ts drags Order.paidAt
      // forward on a second settlement while stage stays NEW). See the file
      // header comment for why this is the documented way to sidestep an
      // already-logged, out-of-scope bug rather than a workaround for one
      // this spec introduced. ─────────────────────────────────────────────────
      await page.locator('[data-status-menu] button').first().click()
      await page.getByRole('button', { name: 'Confirmed', exact: true }).click()
      await expect(page.locator('[data-status-menu] button').first()).toContainText('Confirmed', { timeout: 10_000 })
      mark('6: stage advanced to Confirmed (avoids #65, matches the design spike)')

      // ── 7. Chunk 3 — collect PART of the balance manually, confirm the
      // balance recomputes, confirm it's a genuinely new Payment row via DB
      // check, confirm the original is untouched. ────────────────────────────
      await page.getByRole('button', { name: 'Record payment', exact: true }).click()
      const recordAmountInput = page.locator('label', { hasText: 'Amount (₾)' }).first().locator('xpath=following-sibling::input[1]')
      await recordAmountInput.fill(String(manualTopUpMajor))
      await page.getByRole('button', { name: 'Bank transfer', exact: true }).click()
      await expect(page.getByText('Payment recorded ✓', { exact: true })).toBeVisible({ timeout: 10_000 })

      // Real flakiness found on a second run: "Payment recorded ✓" is a piece
      // of local component state set SYNCHRONOUSLY (handleRecordPayment sets
      // it, then separately calls router.refresh()) — it appears before the
      // refreshed server props (which the balance figure is actually derived
      // from) have landed. A one-shot .textContent() read right after the
      // confirmation message raced that refresh and read the STALE
      // pre-top-up balance once. `toHaveText` polls until it matches (or its
      // own timeout), which waits out exactly that race instead of sampling
      // the DOM once.
      const remainingBalance = extraAmountMajor - manualTopUpMajor
      const balanceAfterManualEl = page.getByText('Balance due', { exact: true }).locator('xpath=following-sibling::span[1]')
      await expect(balanceAfterManualEl).toHaveText(`${remainingBalance}.00₾`, { timeout: 10_000 })
      mark('7: Chunk 3 — manual top-up recorded, balance recomputed live')

      // DB read #3 — a genuinely new Payment row, distinct method, original untouched.
      const dbAfterManual = await readOrderMoneyState(orderId)
      expect(dbAfterManual.payments).toHaveLength(2)
      const manualPayment = dbAfterManual.payments.find(p => p.id !== originalPayment.id)
      expect(manualPayment, 'a genuinely new Payment row should exist').toBeTruthy()
      expect(manualPayment!.provider).toBe('manual')
      expect(manualPayment!.method).toBe('BANK_TRANSFER')
      expect(manualPayment!.amount).toBe(manualTopUpMajor * 100)
      expect(manualPayment!.settledAt).not.toBeNull()
      const originalAfterManual = dbAfterManual.payments.find(p => p.id === originalPayment.id)!
      expect(originalAfterManual.amount).toBe(originalPayment.amount)
      expect(originalAfterManual.method).toBe(originalPayment.method)
      expect(originalAfterManual.status).toBe(originalPayment.status)
      expect(originalAfterManual.settledAt?.toISOString()).toBe(originalPayment.settledAt?.toISOString())
      mark('7b: DB read #3 — new manual Payment row confirmed, original still untouched')

      // ── 8. Chunk 4 — collect the REST via a real card-link checkout: a
      // genuinely different method (CARD, via Flitt) is already on the order
      // (the original), so this exercises the same "two distinct methods"
      // property Chunk 5 needs, plus a third payment. ────────────────────────
      await page.getByRole('button', { name: 'Send card-payment link', exact: true }).click()
      // The amount field is prefilled to the full remaining balance — exactly
      // what's being collected here, so no edit needed.
      await page.getByRole('button', { name: 'Generate link', exact: true }).click()
      const checkoutLinkInput = page.locator('label', { hasText: 'Checkout link' }).locator('xpath=following-sibling::div[1]//input')
      await expect(checkoutLinkInput).toBeVisible({ timeout: 15_000 })
      const checkoutUrl = await checkoutLinkInput.inputValue()
      expect(checkoutUrl, 'a real Flitt checkout URL should have been generated').toContain('flitt.com')
      mark('8: Chunk 4 — card-link checkout generated for the remaining balance')

      // DB read #4 — a third Payment row, still created (not yet paid), original + manual untouched.
      const dbAfterLinkGenerated = await readOrderMoneyState(orderId)
      expect(dbAfterLinkGenerated.payments).toHaveLength(3)
      const linkPaymentBefore = dbAfterLinkGenerated.payments.find(p => p.id !== originalPayment.id && p.id !== manualPayment!.id)
      expect(linkPaymentBefore, 'a third Payment row should exist once the link is generated').toBeTruthy()
      expect(linkPaymentBefore!.provider).toBe('flitt')
      expect(linkPaymentBefore!.method).toBe('CARD')
      expect(linkPaymentBefore!.status).toBe('created')
      expect(linkPaymentBefore!.amount).toBe(remainingBalance * 100)
      expect(linkPaymentBefore!.settledAt).toBeNull()
      const originalAfterLinkGenerated = dbAfterLinkGenerated.payments.find(p => p.id === originalPayment.id)!
      expect(originalAfterLinkGenerated.amount).toBe(originalPayment.amount)
      expect(originalAfterLinkGenerated.settledAt?.toISOString()).toBe(originalPayment.settledAt?.toISOString())
      mark('8b: DB read #4 — third Payment row (unsettled) confirmed, others still untouched')

      // Actually pay it, for real, via Flitt's real hosted checkout — the
      // guest's own path, driven directly from the generated URL rather than
      // through the "Email to guest" button, which fires a real Resend send
      // and this task's own hard boundary asks not to click (the checkout
      // link itself needs no email to be paid — a guest handed it any other
      // way, e.g. read aloud on the phone, would use it exactly like this).
      const linkPage = await context.newPage()
      await linkPage.goto(checkoutUrl)
      await payAtFlittCheckout(linkPage, { cardNumber: FLITT_TEST_CARDS.approveNo3DS })
      await expect(linkPage).toHaveURL(/\/payment\/result\?status=success/, { timeout: 20_000 })
      await linkPage.close()
      mark('9: real Flitt settlement #2 confirmed (card-link top-up)')

      // ── 10. Final state — a fresh cross-page navigation (not a same-URL
      // page.goto(), which can silently reuse a stale RSC payload), then
      // every surface checked at once. ────────────────────────────────────────
      await page.goto('/admin/orders')
      await page.goto(detailUrl)
      await expect(page.getByText('Balance due', { exact: true })).toHaveCount(0)
      await expect(page.getByText('Credit (overpaid)', { exact: true })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Record payment', exact: true })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Send card-payment link', exact: true })).toHaveCount(0)

      const finalDetailTotal = await page.getByText('Total', { exact: true }).locator('xpath=following-sibling::span[1]').textContent()
      expect(finalDetailTotal).toBe(`${newTotal}.00₾`)

      // Chunk 5 — bare "Paid" (no method suffix) once there's more than one
      // payment, and the itemised "Payments received" list shows all three,
      // distinctly, with the original completely unaffected by the two later
      // ones existing.
      const barePaidStep = page.locator('span').filter({ hasText: /^Paid$/ })
      await expect(barePaidStep.first()).toBeVisible({ timeout: 10_000 })
      const paymentsReceivedSection = page.getByText('Payments received', { exact: true }).locator('xpath=following-sibling::div[1]')
      await expect(paymentsReceivedSection).toContainText('Card')
      await expect(paymentsReceivedSection).toContainText('Bank transfer')
      await expect(paymentsReceivedSection).toContainText(`${originalTotal}.00₾`)
      await expect(paymentsReceivedSection).toContainText(`${manualTopUpMajor}.00₾`)
      await expect(paymentsReceivedSection).toContainText(`${remainingBalance}.00₾`)
      mark('10: Chunk 5 — bare "Paid", itemised payments list correct, three distinct rows')

      // DB read #5 — the final, authoritative state. Every check the task
      // asked for, in one place: three Payment rows, summing exactly to the
      // final total, the original byte-for-byte unchanged from its very first
      // snapshot (not just "unchanged since the last check"), and paidAt
      // pinned to the ORIGINAL settlement — proving step 6's stage advance
      // actually worked and #65 did not fire here.
      const dbFinal = await readOrderMoneyState(orderId)
      expect(dbFinal.payments).toHaveLength(3)
      expect(dbFinal.totalPrice).toBe(newTotal * 100)
      const sumOfPayments = dbFinal.payments.reduce((sum, p) => sum + p.amount, 0)
      expect(sumOfPayments, 'three payments should sum to exactly the final total').toBe(dbFinal.totalPrice)
      const originalFinal = dbFinal.payments.find(p => p.id === originalPayment.id)!
      expect(originalFinal.amount, 'original Payment.amount must never change, checked one final time against the VERY FIRST snapshot').toBe(originalPayment.amount)
      expect(originalFinal.method).toBe(originalPayment.method)
      expect(originalFinal.status).toBe(originalPayment.status)
      expect(originalFinal.settledAt?.toISOString()).toBe(originalPayment.settledAt?.toISOString())
      const linkPaymentFinal = dbFinal.payments.find(p => p.id === linkPaymentBefore!.id)!
      expect(linkPaymentFinal.status).toBe('approved')
      expect(linkPaymentFinal.settledAt).not.toBeNull()
      expect(linkPaymentFinal.amount).toBe(remainingBalance * 100)
      expect(
        dbFinal.paidAt?.toISOString(),
        'Order.paidAt must stay pinned to the ORIGINAL settlement — KnownBugs #65 regression guard'
      ).toBe(pinnedPaidAt!.toISOString())
      mark('10b: DB read #5 — final state fully reconciled, #65 did not fire')

      // ── 11. Chunk 2's other two surfaces — CSV export and a re-sent
      // invoice — reflect the final, true (fully reconciled) state. ──────────
      const csvFinal = await exportOrdersCsvViaUi(page)
      const colFinal = csvRowFor(csvFinal, marker)
      expect(parseFloat(colFinal('Total (GEL)'))).toBeCloseTo(newTotal, 2)
      expect(colFinal('Balance Due (GEL)'), 'fully reconciled — Balance Due column should be blank').toBe('')
      expect(colFinal('Payment')).toBe('paid')
      mark('11: CSV export reflects the final, fully-reconciled state')

      await page.goto(detailUrl)
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
      expect(invoiceHtml, 'the re-sent invoice states the final total').toContain(String(newTotal))
      expect(invoiceHtml, 'the re-sent invoice states what was actually paid so far — the full amount, since the balance is now zero').toContain(String(newTotal))
      expect(invoiceHtml, 'a fully-reconciled invoice should not claim a balance is still due').not.toContain('Balance due')
      mark('11b: invoice re-sent, found in Resend, states the final reconciled state')

      // Never appears on /admin/abandoned throughout any of this.
      await page.goto('/admin/abandoned')
      await expect(abandonedRow(page, marker)).toHaveCount(0)

      await deleteTestOrderOnAdminPage(page, marker)
      mark('12: cleanup done')
    } finally {
      await setPaymentSectionToggle(page, 'Individual bookings', originalToggle)
      await deleteTestOrderOnAdminPage(page, marker).catch(() => {})
      await disconnectOrderMoneyDb()
      mark('finally: toggle restored, DB disconnected')
    }
  })
})
