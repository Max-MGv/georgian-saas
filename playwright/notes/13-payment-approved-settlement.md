---
tags: [playwright, test, tier5, payment, flitt]
---

# 13. Approved settlement — full cross-view check (Chunk 3)

**Status:** ✅ Passing (3/3) — individual, company, wine order
**Tier:** 5 — real Flitt payment E2E (`playwright.staging.config.ts`, targets `https://staging.vineworks.ge`, dev DB)
**Regression guard for:** the single biggest gap Chunk 0's research found — nothing in the repo had ever watched a real Flitt checkout actually *settle* and then checked that fact everywhere the app shows it.
**File:** `tests/tier5-payment-e2e/payment-approved-settlement.spec.ts`
**Helpers:** `tests/helpers/flittPayment.ts` (`FLITT_TEST_CARDS`, `payAtFlittCheckout`), `tests/helpers/payments.ts`, `tests/helpers/bookingForm.ts`, `tests/helpers/credentials.ts` (`getResendApiKey`, new), `tests/helpers/resendCheck.ts` (new)
**Run with:** `npx playwright test --config=playwright.staging.config.ts tests/tier5-payment-e2e/payment-approved-settlement.spec.ts --workers=1` — `--workers=1` matters (see below).

## Why this exists

Chunks 0–2 of `vault/Plan-PaymentE2ETesting.md` established that a real Flitt settlement is only observable from a publicly reachable deployment (the callback URL is built from the request's own host header, which can never resolve to `localhost`), built the staging config + `flittPayment.ts` helper, and live-verified the loop closes. This chunk is the first to turn that into a permanent regression test, and per the plan's §4 dependency map, to check the settlement fact on every surface that renders it in one test rather than five.

## What this checks

**Individual booking** (the full 5-surface check):
1. Turns the "Individual bookings" payment toggle ON (verified OFF at rest, restored after).
2. Submits a real Tasting + Lunch booking, pays with `FLITT_TEST_CARDS.approveNo3DS`.
3. Customer-facing `/payment/result?status=success` reads "Payment received" — not reservation-only.
4. Admin orders table: row present, correct amount, `Paid` mark.
5. The order's own detail page (`/admin/orders/<id>`): flow-line shows "Paid · Card" — `paymentMethod='CARD'` only ever comes from a real Flitt settlement.
6. `/admin/abandoned`: absent — a settled order must never sit there.
7. CSV export (via the real "Export CSV" button + a captured download, not calling the server action directly): row shows `paid`, the right `Total (GEL)`, a non-empty `Paid At`.
8. Settlement email — see "Real finding" below.

**Company booking** and **wine order** (lighter, per the plan's own "proportionate, not three full rebuilds" note): same settle-and-verify shape, checked only on their own primary screen (admin orders table / wine-orders board Table view).

## Real findings while building this

**1. The settlement email never once reaches Resend — a real, reproducible app bug, not a test artifact.** Chunk 1's manual proof-of-loop had already flagged this as unconfirmed ("no email found, could be this one order"). This chunk nails it down: `GET api.resend.com/emails` (Resend's send-log **list** endpoint — undocumented anywhere in this repo before now, confirmed live via `curl`) shows **zero** attempts, ever, for a "Payment received —" subject, across the entire account history this session could see, including every fresh run of this spec today. Contrast: `createBooking.ts`'s own fire-and-forget confirmation email (the reservation-only path) reliably shows up in the same log — bounced, since it's sent to a fake `@example.invalid` address, but *attempted*. The difference: `createBooking.ts`'s send is the last, single-hop action in an already-executing request; `settle.ts`'s `sendSettlementEmail()` needs several sequential DB round trips (tenant, settings, site content, the order itself) *before* it ever reaches Resend's API, and neither `/api/payments/flitt/return` nor `/api/payments/flitt/callback` awaits it or wraps it in `waitUntil()`/`unstable_after()` — nothing guarantees the serverless function survives long enough to finish once the HTTP response is already out the door. Logged as `KnownBugs.md` #53. The spec's own check for this is deliberately **not** a hard `expect()` — see the spec file's header comment for why (a permanently-red assertion for an already-tracked, separately-owned bug trains everyone to ignore this file's colour) — it's a loud `console.warn` + a `test.info().annotations.push(...)` instead, so a future fix shows up as a visible surprise ("known-bug-not-reproduced") rather than silent drift.

**2. Confirming a company's access code can open more than one blocking "contact-role picker" — one per role with real people on file, not just one.** Caucasus Vine Travel has both a "Contact Person" role (2 people) and a "Guide" role (2 people); confirming its code opens "Who should we put on this booking?" for Contact Person, and dismissing that ("I am not on this list") immediately opens a **second** one for Guide. Sighnaghi Wine Bar only has a Contact Person, so the wine-order test only ever sees one. Left unhandled, the second modal silently intercepted every later click on the real submit button — Playwright's own error ("element is visible... subtree intercepts pointer events", retried for the full timeout) reads exactly like the page's own known lost-click bugs elsewhere in this admin, and was only traced to the real cause via a live accessibility-tree dump mid-flow. Fixed with `dismissContactRolePickers()`, a small loop rather than a single dismiss.

**3. A same-mechanism bug in the fix's first version: `.isVisible({ timeout })` does not poll.** The first attempt at handling the picker checked `notOnListBtn.isVisible({ timeout: 8_000 })`, which evaluates once, immediately — it isn't a wait. Since the picker renders after Flitt's own async "Checking…" state (~1-2s), the check always ran before the modal existed, always saw "not visible," and silently skipped the dismissal it existed to do. Fixed with `.waitFor({ state: 'visible', timeout })`, the same pattern `flittPayment.ts`'s own 3DS-challenge detection already used correctly.

**4. Two contact-role fields shadow the primary ones under the same non-exact name.** Once Caucasus Vine Travel's Guide role is on the form, `getByRole('textbox', { name: 'Phone' })` (no `exact`) matches both the real "Phone" field and "Guide — Phone" — Playwright's strict mode refuses to guess. Fixed with `exact: true` on `Phone`/`Email`.

**5. Sighnaghi Wine Bar's wine order form has a required `contactEmail` field that produced no visible error when left blank.** Every earlier `.fill()` succeeds, "Order & Pay" stays clickable and gets clicked, and nothing happens — no navigation, no error text anywhere in the DOM. Only a live `page.evaluate()` reading each input's own `ValidityState` (`required: true`, `validationMessage: "Please fill out this field."`) explained it: this is HTML5 native validation blocking the submit silently, not a modal or a server rejection. Fixed by filling the email field (it was already read as a locator target correctly — the missing piece was ever reaching it, since the contact-role picker above needed dismissing first).

**6. Sighnaghi Wine Bar's live 10% wine discount broke a naive amount assertion, twice over, in two different ways.**
   - First cut: read the catalogue's own per-bottle price (`unitPrice`) before any company was involved, and asserted the admin board showed that figure. Real: the discount only applies once the access code is confirmed, so the admin board showed `13.50₾`, not `15₾`.
   - Fix attempt 1 (still wrong): read the *last* `₾`-suffixed `<span>` anywhere later in the DOM after the "Total" label. This walked straight past the order summary into the wine catalogue grid still rendered below it and picked up a different wine's own per-bottle price (`25₾/bottle`, Kisi) as the "total."
   - Fix attempt 2 (correct): bound the search to the handful of spans immediately following "Total" (original amount, "−N%" badge, final total — always that shape, discount or not) and take the last one *within that window*.
   - A third, separate parsing bug surfaced checking the admin board's own row: its Amount cell holds the price and the discount badge in the *same* `<td>` (`"13.50₾−10%"`), so stripping every non-digit character before parsing concatenates `"13.50"` and `"10"` into `13.5010`. Fixed by matching the actual `<number>₾` pattern instead of blind digit-stripping.

## Cleanup discipline

Individual and company scenarios delete their own order via the real admin "Delete order" action, in a `finally` block, regardless of pass/fail. The wine-order scenario deliberately does **not** attempt cleanup — Wine Orders admin has no delete action at all (a standing, already-documented limitation, `06-wine-catalogue-order.md`), and a *paid* wine order additionally has no "Cancelled" control (`WineOrdersClient.tsx`'s `isLimbo` branch only offers one for orders still in payment limbo). Every paid run of this scenario leaves one permanent row; swept via direct SQL as part of closing out this chunk, and will need the same manual sweep on any future run — same accepted debris shape the rest of this suite already lives with for wine orders.

## Why not `test.describe.configure({ mode: 'serial' })`

Tried first, for the same reason `payment-amount-integrity.spec.ts` uses it (shared tenant settings). Rejected once it surfaced a real side effect specific to this file: a whole-file serial group means Playwright skips every *subsequent* test after one failure — and the settlement-email known-bug annotation, by design, makes the individual-booking test's own soft check "fail" in spirit (though not via `expect()`) far too often to gate the company and wine-order scenarios behind it. The three describes touch three independent tenant settings and don't need serialising against each other; the real hazard is this file racing **`payment-declined-settlement.spec.ts`** (both mutate "Individual bookings") — run with `--workers=1`, or otherwise never concurrently.

## Independent verification (2026-09-24)

Ran with cleanup temporarily disabled once for each of the individual and wine-order scenarios, then queried the dev DB directly:

- Individual: `Payment.status='approved'`, `settledAt` set, `providerPaymentId` populated; `Order.paidAt` set, `abandonedAt` null; exactly **one** `OrderEvent(PAID)` row (confirming the Chunk-2 idempotency fix still holds — no duplicate). Deleted after.
- Wine order: exactly one `OrderEvent(PAID)`, `WineOrder.paidAt` set. Deleted after (Payment + OrderEvent + WineOrderItem + WineOrder, direct SQL — no admin UI action exists for this).

All ZZ-marker test rows swept to zero afterward (`Order`, `WineOrder`) — confirmed via a final `count(*)` query.
