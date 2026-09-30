---
tags: [playwright, test, tier5, payment, flitt]
---

# 14. Declined settlement — never mis-read as paid (Chunk 3)

**Status:** ✅ Passing (1/1)
**Tier:** 5 — real Flitt payment E2E (`playwright.staging.config.ts`, targets `https://staging.vineworks.ge`, dev DB)
**Regression guard for:** the plan's §2c decline path — confirming a real decline is never mis-read as paid on any surface, and stays exactly where a never-returned checkout would.
**File:** `tests/tier5-payment-e2e/payment-declined-settlement.spec.ts`
**Helpers:** same as [[13-payment-approved-settlement]], plus `flittPayment.ts`'s new `'declined-inline'` outcome (see below).
**Run with:** `npx playwright test --config=playwright.staging.config.ts tests/tier5-payment-e2e/payment-declined-settlement.spec.ts --workers=1` — never concurrently with `payment-approved-settlement.spec.ts` (both mutate the "Individual bookings" toggle).

## Why this exists

Chunk 2 built and live-verified `payAtFlittCheckout` against the two *approve* cards only, flagging explicitly that the decline cards were "not exercised live in this chunk... that's Chunk 3's job." This is that job: prove a real decline never reads as a successful payment anywhere, and never becomes visible as a live order.

## What this checks

1. Individual booking, "Individual bookings" toggle ON (same setup as note 13).
2. Pays with `FLITT_TEST_CARDS.declineNo3DS`.
3. Customer-facing result does **not** read as a successful payment.
4. `/admin/abandoned`: still there, correct amount — the plan's §2c point: a decline is treated exactly like a closed-tab/never-returned checkout, not a distinct state.
5. `/admin/orders`: absent.
6. CSV export: absent (same `NOT_ABANDONED` exclusion the orders table itself applies).
7. No settlement email sent — `settle.ts` only ever reaches `sendSettlementEmail()` on the `'settled'` branch, so this is a **hard** assertion (unlike note 13's known-bug soft check on the *approved* path — a decline never sending this email is correct, tracked behaviour, not a bug).
8. Cleanup: `restoreAndDeleteAbandoned` (same pattern `payment-amount-integrity.spec.ts` uses).

## Real finding while building this — the decline card never redirects at all

The single biggest discovery of this chunk. `payAtFlittCheckout` was written (Chunk 2) assuming every card eventually redirects back to our own site — "approved or declined both redirect, only the destination's own content differs." That assumption held for the **3DS** decline card (Chunk 2 didn't test it live either, but the challenge iframe always resolves to a redirect). It does **not** hold for `declineNo3DS` (`4444111155556666`):

- Submitting it shows a same-page **dialog** (`role="dialog"`, heading "Declined", body "2000 Payment declined by issuing bank. Possibly internet payments not allowed for this card...") rendered directly on `pay.flitt.com` — never a redirect.
- The only control on the dialog is a Close (×) button, which dismisses it back to the same card-entry form for a retry.
- A full accessibility-tree dump of the entire page (`read_page` with `filter: 'all'`) confirms there is **no "back to merchant" link anywhere** — the guest is left exactly where a closed tab would leave them, on Flitt's own domain, indefinitely, unless they retry or navigate away themselves.
- The original test built around this hung for the full 25s timeout waiting for a redirect that was never coming — twice, identically, on two different scenarios (this decline, and once — a genuine flake, confirmed by an isolated rerun passing — on the *approved* company-booking scenario), which read exactly alike and cost real debugging time distinguishing a real behavioural difference from ordinary Flitt/network flakiness.

**This is not a gap in the order's own correctness.** `settlePayment()` is reached via Flitt's **server-to-server webhook** (`server_callback_url`), which fires independently of whatever the guest's browser is doing — confirmed live via direct SQL immediately after: `Payment.status` recorded (see below), exactly one `OrderEvent(PAYMENT_DECLINED)`, `Order.paidAt` still null, `abandonedAt` still set. The order settles (into its correct, declined, still-abandoned state) whether or not the browser ever leaves Flitt's page.

**Fixed in `flittPayment.ts`, not worked around locally** — this is real, load-bearing, live-verified behaviour of this test merchant, worth having correctly in shared infrastructure for any later chunk that also drives a decline (Chunk 7's forged-callback/idempotency work, for one). `payAtFlittCheckout` now races the redirect against the inline "Declined" dialog appearing and returns `outcome: 'redirected' | 'declined-inline'` so callers can assert on whichever screen the guest actually lands on, instead of assuming one shape for every card. This spec branches on it: `'redirected'` checks `/payment/result?status=failed`; `'declined-inline'` checks the dialog directly on `pay.flitt.com`.

## A second, smaller finding — Flitt's own webhook body doesn't literally say "declined"

Independent SQL verification (see below) found `Payment.status = 'processing'` and the `OrderEvent(PAYMENT_DECLINED)` payload's own `status` field also reading `"processing"` — not `"declined"` or `"failed"`, despite the browser-side UI clearly showing "Declined" with reason code `2000`. Not a bug: `settle.ts`'s own logic (`approved = orderStatus === 'approved'`) treats *any* non-`'approved'` gateway status as "not approved" and writes it verbatim, exactly as the plan's §2c table describes ("Payment.status recorded" — the gateway's own word, whatever it is). Worth knowing for anyone reading `OrderEvent`/`Payment` rows later and expecting the literal word "declined" to appear — it doesn't, for this card, on this merchant.

## Independent verification (2026-09-24)

Ran once with cleanup disabled, then queried the dev DB directly:

- `Order`: `paidAt` null, `abandonedAt` set (stage `NEW`) — never advanced past the incomplete state a gateway-bound checkout starts in.
- `Payment`: `status='processing'` (Flitt's own verbatim value — see above), `amount` matches the quoted total, `settledAt` null.
- `OrderEvent`: exactly two rows — `CREATED` (actor `GUEST`) then `PAYMENT_DECLINED` (actor `GATEWAY`), no `PAID` event anywhere. No duplicates.

Deleted directly via SQL after verifying (equivalent end state to the UI's restore-then-delete, without needing the intermediate restore step). Re-queried afterward — zero rows for this run's marker.
