---
tags: [playwright, test, tier5, payment, admin-order]
---

# 16. Admin-created order — parity with a guest order, then manual payment (Chunk 5)

**Status:** ✅ Passing (1/1)
**Tier:** 5 — real staging E2E (`playwright.staging.config.ts`, targets `https://staging.vineworks.ge`, dev DB).
**File:** `tests/tier5-payment-e2e/payment-admin-order.spec.ts`
**Helpers:** existing `auth.ts`/`payments.ts` (`readPaymentBankDetails`)/`bookingForm.ts` (`abandonedRow`)/`credentials.ts`/`resendCheck.ts` — no new helpers added.
**Run with:** `npx playwright test --config=playwright.staging.config.ts tests/tier5-payment-e2e/payment-admin-order.spec.ts --workers=1` — unlike the other three tier5 specs, this one never touches the "Individual bookings" payment-section toggle (`createOrderAdmin` doesn't call `shouldTakePayment()` at all), so it's safe to run alongside them, not just sequentially.

## Why this exists

Per the plan's §2d (confirmed by reading `createOrderAdmin` in `app/actions/orders.ts` before this chunk started): an order typed directly into `/admin/orders/new` never calls `startCheckout()` — it always starts completely unpaid, with no Flitt involvement ever possible. This is a genuinely different resting state than a guest order that got declined or abandoned at the gateway (Chunk 3): this order was never "incomplete" in the first place, since it never went anywhere to be incomplete from.

This chunk checks two things in one pass:
1. Does an admin-created order render with true parity to a guest-created one everywhere the app shows order data (admin orders table, order detail, CSV export)?
2. Can it still be paid through the same manual-payment path Chunk 4 already proved works (send invoice → record a manual `BANK_TRANSFER` payment via the "Paid" picker)?

## What this checks

1. **Creates an individual order directly via `/admin/orders/new`** — date, party size, first/last name (the marker), phone, email, and a manual "Tasting only ₾/pp" rate (50₾ × 4 guests = 200₾ total; individual orders always show manual rate fields since there's no company tier to fall back on).
2. **Confirms it never touched Flitt and started unpaid**: absent from `/admin/abandoned` (a genuinely different resting state than a guest decline — never went to a gateway at all), unpaid/un-invoiced on the admin orders table and CSV export. `Payment` row absence, `abandonedAt`/`paidAt` null independently confirmed via direct SQL after the run (not asserted in the spec itself, which only checks the UI-visible consequences).
3. **Parity check across every §4 surface, at three points** (just-created, invoiced, paid): the admin orders table (same "Individual" type badge, same ₾ formatting, same Paid/Invoice Sent marks a guest order would show), the order's own detail view (same Order Total row, same Invoice History card — present but empty before any invoice, exactly as a guest order's would be), and the CSV export (`unpaid`/`invoiced`/`paid`, `Paid At`/`Invoice Sent At`, `Total (GEL)`, `Booking Type`).
4. **Sends the invoice and records a manual bank-transfer payment**, reusing the exact same admin flow `payment-book-later.spec.ts` (Chunk 4) already proved works — same "Send Invoice" button, same email-content check against Settings → Payment details, same "Paid" → "Bank transfer" picker.
5. **Re-checks every §4 surface once paid**, using the identical assertions/text/format Chunk 4 used for a guest-created order in the same end state — this is the actual parity proof, not just "does it look okay."
6. Cleans up via the normal admin UI's delete action, in a `finally` block, regardless of pass/fail.

## Parity result: no divergence found

Every assertion in step 5/6 above uses the exact same locators, text, and formatting Chunk 4 already established for a guest-created order in the paid+invoiced end state, and all of them passed against the admin-created order. Independently re-verified via direct SQL (see below): the final `Order`/`Payment`/`OrderEvent` shape is byte-for-byte the same shape Chunk 4 found for a guest order, with the one (invisible-to-any-UI-surface) difference being `OrderEvent(CREATED).actorType = 'ADMIN'` instead of `'GUEST'` — exactly what the app's own design intends (§4's dependency map: "since CSV/table have no created-by column, just confirm the actual money/status fields are correct"). **No real divergence found.**

## Two real findings from building this spec — both in the test, not the app

**1. A URL-match regex that also matched its own starting page.** The first working draft asserted `await expect(page).toHaveURL(/\/admin\/orders\/[a-zA-Z0-9]+$/)` right after clicking "Create order," expecting it to wait for the client-side `router.push()` redirect to the new order's detail page. It didn't wait for anything: `/admin/orders/new` (the form's own URL, before any redirect) *also* matches that regex, since "new" is itself alphanumeric — so the assertion passed instantly, at 0ms, capturing `detailUrl` as `/admin/orders/new` rather than the real detail URL. Every subsequent `page.goto(detailUrl)` then silently reloaded the blank New Order form instead of the real order — which is why the "Order Total" row read a stark "0.00₾" (the form's own unfilled rate-input preview) instead of the real 200₾. This looked exactly like a data/rendering bug at first (identical DB row, live-verified via the admin UI directly and via SQL, rendering correctly at its real URL — 200.00₾ — while the test's own `page.goto(detailUrl)` showed 0.00₾ for "the same order"), and took a full debug pass (an HTML dump of the failing page, which turned out to contain a `<button>Create order</button>` and `Enter rates:` prompt — the New Order form, not `OrderDetail.tsx` at all) to actually locate. Fixed with a negative lookahead: `/\/admin\/orders\/(?!new$)[a-zA-Z0-9]+$/`.

**2. A small, systematic clock-skew between this machine and Resend's send pipeline.** The email-content check (step 4e) failed consistently — not intermittently — even after adding a 20-second poll, with the target email visibly present in every single poll's own debug output. The actual cause: this machine's local clock and the timestamp Resend's send pipeline stamps `created_at` with differ by a few hundred milliseconds (confirmed live: one genuinely, correctly-sent invoice email's `created_at` read as ~380ms *before* an un-buffered `new Date()` captured moments before triggering the send). Retrying a `>=` comparison against a systematic bias — not jitter — can never succeed no matter how long you wait. Fixed by giving `testStartIso` a 10-second safety margin (`new Date(Date.now() - 10_000)`) rather than the literal moment; `fetchRecentResendEmails`'s own `limit=100` already scopes the list to "recent sends," so this timestamp is only ever an extra sanity filter, and a 10s margin costs nothing real.

**3. (Minor, not a bug) The Invoice History card always renders, even with zero invoices.** The first draft asserted `getByRole('heading', { name: 'Invoice History' })` had count 0 before any invoice was sent — wrong assumption, since the card (with a "No invoices sent yet." empty state) is unconditional, same as a guest order's. Fixed to assert the empty-state text instead.

## Independent verification (2026-09-24)

Ran once with the spec's own cleanup temporarily disabled to inspect the final paid state directly, via `npx tsx` against the dev DB, before deleting the row through the normal admin UI and re-confirming zero rows left:

```
Order.totalPrice = 20000 (200₾)
Order.abandonedAt = null
Order.paidAt = 2026-09-24T15:32:02.812Z (set)
Order.invoiceSentAt = 2026-09-24T15:31:56.771Z (set, independent of paidAt — both present)
Payment: provider='manual', method='BANK_TRANSFER', status='recorded', amount=20000, settledAt set, reversedAt null
OrderEvent: [CREATED (actorType=ADMIN, toStage=NEW), PAID (actorType=ADMIN)]
InvoiceSent: recipientEmail matches the order's email, totalPrice=20000
```

This is exactly the shape Chunk 4 found for a guest-created order in the same end state, with the one difference — `OrderEvent(CREATED).actorType = 'ADMIN'` rather than `'GUEST'` — being invisible to every UI surface this chunk checked, by design.

Both this manual-verification order and the automated spec's own runs (several, while chasing the two findings above) were swept via the admin UI's delete action; a final direct-SQL query confirmed zero `Order`/`Payment` rows remain matching the `ZZPaymentE2EAdminOrder%` marker.
