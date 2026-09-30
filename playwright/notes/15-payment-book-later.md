---
tags: [playwright, test, tier5, payment, manual-payment]
---

# 15. Book & pay later — reservation → invoice → manual bank transfer (Chunk 4)

**Status:** ✅ Passing (1/1)
**Tier:** 5 — real staging E2E (`playwright.staging.config.ts`, targets `https://staging.vineworks.ge`, dev DB). Nothing in this scenario ever reaches Flitt — see "Why this exists" below.
**File:** `tests/tier5-payment-e2e/payment-book-later.spec.ts`
**Helpers:** `tests/helpers/payments.ts` (`readPaymentBankDetails`, new), `tests/helpers/resendCheck.ts` (`fetchResendEmailBody`, new), plus the existing `auth.ts`/`bookingForm.ts`/`credentials.ts`/`resendCheck.ts` shared by the rest of this tier.
**Run with:** `npx playwright test --config=playwright.staging.config.ts tests/tier5-payment-e2e/payment-book-later.spec.ts --workers=1` — mutates the same "Individual bookings" toggle `payment-approved-settlement.spec.ts`/`payment-declined-settlement.spec.ts` do, same discipline.

## Why this exists

Per the plan's §2b (confirmed by reading `createBooking.ts`/`submitWineOrder.ts` before this chunk started): "book & pay later" is **not** a resumed Flitt checkout. `startCheckout()` is only ever called once, at initial submission — a reservation-only order has no way to later generate a second Flitt link. The actual flow is reservation → `sendOrderInvoice()` (an HTML email with the winery's own bank-transfer details) → an admin manually records the bank transfer once it arrives, via the "Paid" status option's Bank Transfer/Cash picker. This is the first test in the suite to drive that whole loop end to end and check every §4 surface agrees, both right after invoicing and again right after payment.

## A real, confirmed app bug found and fixed along the way

Building this chunk's manual-payment step reproduced a genuine bug, independent of this testing plan: clicking an order's "Paid" status option is supposed to open a "Bank Transfer or Cash?" picker (`recordManualPayment` in `lib/payments/manualPayment.ts` already supported both methods) — but the picker closed itself the instant it opened, on both `/admin/orders` (`OrdersTable.tsx`) and an order's own detail page (`OrderDetail.tsx`).

**Root cause**, confirmed live by patching `Element.prototype.closest` to log its own calls during a real browser click (not just read from the code): Next's App Router hydrates React at `document`, so React's own delegated click listener and each component's manual "close the menu on outside click" `document.addEventListener('click', ...)` are two independent listeners on the same node. Clicking "Paid" mounts the picker in place of the step list; React flushes that swap synchronously while dispatching the click to its own (earlier-registered) bubble listener — *before* the outside-click handler's turn on that same `document` node. By then, `e.target` (the old "Paid" button) had already been removed from the DOM, so `.closest('[data-status-menu]')` on a detached node found nothing, and the handler wrongly treated the click as "outside" and closed what it had just opened. A first fix attempt (bubble-phase containment check alone) was not enough for exactly this reason — confirmed by the same `closest` patch showing `isConnected: false` at the moment the check ran. The real fix: run the outside-click listener in the **capture** phase, which fires top-down before the click ever reaches its target, so the containment check runs while the DOM is still exactly as clicked.

Fixed in `saas/app/admin/(panel)/orders/[id]/OrderDetail.tsx` and `saas/app/admin/(panel)/orders/OrdersTable.tsx` (commits `b58e9cc`, `ac47541` on `staging`) — both files needed the identical fix; `OrdersTable.tsx` was independently confirmed broken the same way, not assumed from `OrderDetail.tsx`'s fix by code similarity alone.

## A separate, real bug found and *not* fixed here — flagged for its own session

While live-testing the fix on `/admin/orders`' mobile card list (viewport <768px), the inline status dropdown can get clipped by its own card's `overflow-hidden` once it has enough menu items (e.g. Confirmed/Completed/Invoice Sent/Paid/Cancelled) — confirmed via `document.elementFromPoint()` at the "Paid" button's own layout coordinates resolving to the *next card* instead. A real tap there hits the wrong element. Unrelated to the picker-closing bug above (this is a clipping/paint issue, not a listener-timing one) — flagged as its own follow-up task rather than fixed as a detour from this chunk.

## What this checks

1. Reservation-only individual booking (payment toggle off) — confirms it never reaches Flitt, never appears on `/admin/abandoned`, and starts unpaid/un-invoiced on the admin orders table.
2. Sends the invoice from the order's own detail page — checks the "Invoice Sent" mark and the permanent Invoice History card, the admin orders table's mark, the CSV export's `invoiced`/`Invoice Sent At`/empty `Paid At`, absence from `/admin/abandoned`, and the actual email content against Settings → Payment details (recipient name, personal number, bank name, bank code, IBAN, amount) — not just that an email went out.
3. Records the manual bank-transfer payment via the now-fixed "Paid" → "Bank transfer" picker — checks the flow-line's done "Paid · Bank transfer" step, that the Invoice Sent mark disappears from the pill (paid wins) while the Invoice History card is untouched (the two-independent-facts guarantee the plan calls for), the admin orders table, the CSV export's `paid`/stamped `Paid At`/**still-stamped** `Invoice Sent At`, and absence from `/admin/abandoned`.

## Independent verification (2026-09-24)

The automated spec above deletes its own order as part of a passing run, before there was a chance to inspect the DB mid-flight — so the manual-payment DB write was verified with a second, separate live pass through the same UI flow (marker `ZZManualVerify0924`), queried directly against the dev DB, then deleted the same way:

```
Order.paidAt = 2026-09-24 10:28:10.213 (set)
Order.invoiceSentAt = 2026-09-24 10:27:52.265 (set, independent of paidAt — both present)
Payment: provider='manual', method='BANK_TRANSFER', status='recorded', amount=48000 (tetri, matches totalPrice), settledAt set, reversedAt null
```

Both this manual-verification order and the automated spec's own order confirmed swept to zero afterward (`Order`/`Payment` joined on surname `ZZPaymentE2E%`/`ZZManualVerify%`). The "Individual bookings" toggle confirmed back at its documented resting value (off) both via the spec's own restore and independently via the live DOM (`translateX(2px)` on the Toggle's thumb span — the same mechanism `helpers/payments.ts` itself reads).
