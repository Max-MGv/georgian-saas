---
tags: [plan, playwright, payments, flitt]
---

# Plan — Payment E2E Testing (real Flitt checkout, staging.vineworks.ge)

> **This is the live task tracker for this work.** Update the checkboxes and each chunk's
> Status line as work happens. **Chunks are strictly sequential — do not start chunk N+1
> until chunk N's Status is ✅.** If a session ends mid-chunk, that chunk's "Resume point"
> line says exactly where to pick up.

Started 2026-09-24, from Max asking whether we can leave localhost and test payments 100%
as a guest would, with real end-to-end Flitt checkouts. Answers three questions along the
way: can we use a real Flitt test merchant, what payment scenarios actually exist in this
app, and what's already covered by `playwright/` vs what's a genuine gap. Folds in "same
data viewed elsewhere" as a first-class dependency, not an afterthought — every scenario
checks every screen that renders the same fact, in one test, not five.

Related: [[Plan-OnlinePayment]] (the original payment design), [[DataModel/Plan-DataModel]]
chunks 3/4/5/6 (tetri, rate snapshots, OrderEvent, Payment-as-ledger), `playwright/ARCHITECTURE.md`
(suite conventions this extends, not replaces).

---

## Current status

| Chunk | What | Status |
|---|---|---|
| **0** | Research — scenario matrix, coverage gaps, dependency map, Flitt product research (test merchant, Pay by Link, reversals), live-verified `createCheckout()` against the test merchant | ✅ Done (2026-09-24) |
| **1** | One live, manual proof-of-loop on staging before writing any test code | ✅ Done (2026-09-24) |
| **2** | Scaffolding: `playwright.staging.config.ts`, `tier5-payment-e2e/` | ✅ Done (2026-09-24) |
| **3** | Book & Pay Now — approved + declined, full cross-view check | ✅ Done (2026-09-24) |
| **4** | Book & Pay Later — reservation → invoice → manual bank transfer, full cross-view check | ⬜ Not started |
| **5** | Admin-created order — parity with guest orders, then manual payment | ⬜ Not started |
| **6** | Edit after the fact — stale-money check on an already-paid order | ⬜ Not started |
| **7** | Idempotency, forged callback, tampered amount — driven through the real staging route | ⬜ Not started |
| **8** | Docs: `playwright/README.md`/`ARCHITECTURE.md`, `Progress.md`, vault entries for the reversal-sync gap and the Pay-by-Link idea | ⬜ Not started |

Status values: ⬜ Not started · 🚧 In progress · ✅ Done · ⏸ Paused

**Overall resume point:** 🔜 Chunks 0–3 are done. The real settle loop is proven live
on staging (see Chunk 1's result log below), the race-condition it surfaced is fixed and
verified (see "Incident and fix" below), Staging Winery runs **permanently** on Flitt's public
test merchant (`1549901`/`test` — see Ground Rule 1), the shared scaffolding (staging
config + `flittPayment.ts` helper) is built and live-verified (see Chunk 2's result log below),
and Chunk 3 has closed the single biggest gap from §3 — a real approved settlement and a real
decline, both checked across every §4 surface (see Chunk 3's result log below).
**Chunk 4 (Book & Pay Later) is next**, and per [[ClaudeInstructions]] Rule 8 still
gets called out for confirmation as it comes up, not assumed from this plan alone.

### Incident and fix (2026-09-24) — read before touching credentials again

While proving Chunk 1's loop, a sub-agent found a real bug: Flitt notifies this app of a
settlement through two channels (a browser redirect and a server webhook) that can land
within milliseconds of each other, and `settle.ts`'s idempotency check read `Payment.settledAt`
*before* its own transaction wrote it — so both near-simultaneous calls could see "not yet
settled" and both proceed. Confirmed live: one real settlement produced two `OrderEvent(PAID)`
rows. Money was never double-counted, only the audit trail. **Fixed** in `saas/lib/payments/settle.ts`
(commit `45f8629`, on `staging`, not `master`): the check and the write are now one atomic
conditional update gated on `Payment.status = 'created'`, closing the gap for both the approved
and declined case. Verified two ways — a deterministic concurrency script and a second live
staging run — both showing exactly one `OrderEvent(PAID)` now, not two.

**A second, more consequential mistake happened verifying that fix.** `Tenant.flittSecretKey`
is write-only (see Ground Rule 1's reasoning) — before swapping it to test the fix, a sub-agent
captured only a hash of the real secret rather than the actual value, intending that as "enough
to verify a restore." It is not: a hash can confirm a match, it cannot restore a value. Once the
test secret overwrote the real one, the original became unrecoverable through any tool available
in this session (production, where an identical copy likely exists — this merchant ID also
appears in this repo's own reference test fixtures tied to `nikalasmarani.ge` — was deliberately
never read, on the standing rule to leave production alone). The agent's one good decision under
the circumstances: it removed the mismatched secret rather than leave a silently-broken
half-state, so Staging Winery read as an honest "card payments not configured" rather than a
confusing failure.

**Max's call (2026-09-24), once told): don't chase the original value at all — put Staging
Winery on Flitt's own public test merchant permanently instead.** Since this tenant has no real
customers, there was never a strong reason for it to hold real production-equivalent credentials
in the first place. Done: `flittMerchantId='1549901'`, `flittSecretKey='test'`, verified both via
the real admin UI and an independent SQL read. This is now Staging Winery's standing
configuration, not a per-chunk swap — see Ground Rule 1 below, rewritten accordingly.

**The process lesson, worth carrying into every future chunk that touches a write-only field
anywhere in this app:** a hash or a length is not a backup. If a value cannot be read back
through the UI, the only real backup is the plaintext itself, held only in working memory and
never printed — anything less is a false sense of safety that fails at the exact moment it's
needed.

---

## Ground rules for every chunk

1. **Staging Winery runs permanently on Flitt's public test merchant — `flittMerchantId=1549901`,
   `flittSecretKey=test`.** This is deliberate and durable (see "Incident and fix" above), not a
   per-test swap. Future chunks should assume it's already configured correctly and never need to
   change it — if a chunk finds it changed, that's worth investigating before proceeding, not
   silently re-setting it. The three payment-section toggles (Individual/Company/Wine orders) and
   any company-level override remain ordinary, cheap-to-reverse settings — those still get
   flipped per-test via the existing `helpers/payments.ts` pattern, restored after, exactly as
   the localhost suite already does. **If any future work ever needs a tenant on its own real
   (non-test) Flitt credentials again, treat a write-only secret field the same way this incident
   should have been treated: capture the actual plaintext value first, hold it only in working
   memory, never a hash, never print it.**
2. **Dev DB only, same as the rest of this suite** — Staging Winery (`cmrxb85wo0000vlc0d964nzf8`),
   never `master`/production, per [[ClaudeInstructions]] Rule 0.
3. **Follow `playwright/ARCHITECTURE.md`'s existing conventions** — one `.spec.ts` per
   scenario under `saas/tests/tier5-payment-e2e/`, a matching `playwright/notes/NN-name.md`,
   `credentials.ts`-style secret handling (nothing written outside `credentials.txt`), cleanup
   in every test regardless of pass/fail.
4. **Test code is not app code** — it never ships to `master` and carries none of Rule 0's
   staging→master gate. It still goes through the same git workflow (commit to `staging`)
   as everything else in the repo, just without a deploy step that matters for it.
5. **Every scenario checks every surface from §4's dependency map**, in the same test — admin
   orders table (or wine-orders board), the order's own detail/edit view, `/admin/abandoned`
   (confirm absence when it should be absent), CSV export, and email content where one fires.
   Not one spec per screen.

---

## Appendix — Chunk 0's research (background for the chunks above)

Numbered "1"–"4" below, not to be confused with the Chunk 1–8 tracker above — this is
reference material the chunks draw on, not further sequential steps.

### 1. Flitt test merchant — confirmed working, live-checked today

`docs.flitt.com/api/testing` publishes a universal test merchant: **ID `1549901`, secret `test`** — no account needed, usable by anyone. Test cards with predictable outcomes:

| Card | 3DS | Result |
|---|---|---|
| `4444555566661111` | yes | approved |
| `4444111166665555` | yes | declined |
| `4444555511116666` | no | approved |
| `4444111155556666` | no | declined |

**Live-verified today** (throwaway script, deleted after, not part of the repo): called this project's actual `createCheckout()` (`saas/lib/payments/flitt.ts`) with merchant `1549901`/`test` and got real checkout URLs + payment IDs back, in **GEL, UAH, and USD alike** — so no currency workaround is needed, Staging Winery can stay on GEL. Confirms the plumbing (signature, param shape) is compatible with the test merchant, not just the real one.

**Not yet verified:** an actual card entry → callback → settle round trip. That requires the checkout to be created *through the real app* (so a `Payment` row exists in the DB for `settlePayment()` to find) with the response/callback URLs pointing at a reachable host — i.e. it requires staging, and requires Staging Winery's tenant record to actually hold `1549901`/`test` as its `flittMerchantId`/`flittSecretKey`, not just a standalone script call. That's the next concrete step once this plan is agreed (§5).

### 1b. Flitt's own product research (2026-09-24) — test-card mechanics, Pay by Link, reversals

### How the test merchant actually works — no real card needed

Confirmed on `docs.flitt.com/api/testing`: the test cards take **"any" expiry date and "any" CVV** — made-up values are accepted, nothing has to resemble a real card. The checkout page itself is the exact same hosted page and `pay.flitt.com/api/checkout/url` endpoint as production (already live-verified in §1) — there is no separate sandbox subdomain, "test mode" is purely a property of which merchant ID you sign with.

One wrinkle for automating this in Playwright: cards flagged 3DSecure trigger a "frictionless" or "challenge" step, and the docs mention an **OTP of `111111`** for at least one scenario. So the two non-3DS cards (`4444555511116666` approve / `4444111155556666` decline) are the simpler ones to automate first — no extra step to script. The 3DS cards are still useful (they're closer to what a real Georgian card actually does), but the test needs to fill in `111111` at an OTP prompt rather than expecting an immediate result.

### "Pay by Link" — real, but it's Flitt's dashboard product, not our API

`flitt.com/pay-by-link` — a no-code feature in Flitt's own merchant portal (`portal.flitt.com`) for generating a shareable payment link for a custom amount, one-time or recurring, shared via email/SMS/chat/QR/invoice. Two things worth flagging:

- **This is not something our backend calls.** Nothing in `docs.flitt.com`'s API reference exposes a "create a payment link" endpoint — Pay by Link appears to be generated by a human logging into Flitt's own portal, not something `lib/payments/flitt.ts` could trigger programmatically. If that's wrong (Flitt does sometimes expose portal features via a separate private API), confirming it would need Flitt's own merchant support or the portal's own docs — not something visible from the public API reference.
- **This is the actual answer to the "book & pay later" gap from §2b below.** Rather than us building a "resume checkout" feature, the winery could generate a Pay-by-Link from Flitt's portal directly and send it to a guest with an outstanding balance — using tooling Flitt already built, instead of new code here. Worth raising with Max as a real option, separate from anything Playwright would test (a human using Flitt's own portal is out of scope for this app's test suite).
- Standard merchant requirements apply (business registered in Georgia/Uzbekistan/Armenia/Moldova, active TBC bank account) — same account Staging Winery/Nikalas Marani would already need for normal checkout, not a separate approval.

### Flitt does support refunds — and our app has no idea when one happens

Real endpoint, confirmed: `POST https://pay.flitt.com/api/reverse/order_id`, signature-authenticated the same way as checkout, examples in the docs use the same `1549901` test merchant. **Partial reversals are supported** — multiple partial reverses are allowed as long as their sum stays ≤ the order's `actual_amount`; a full reversal is just `amount = actual_amount`. A `reverse_id` param makes retries idempotent.

**This exposes a real gap, not just a documentation curiosity.** I checked `lib/payments/*` and `app/api/payments/*` — there is no code anywhere that calls `/api/reverse`, and no callback handler for a reversal event. `Payment.reversedAt` is written in exactly one place (`manualPayment.ts`'s `reverseManualPayments`), and its own comment says explicitly it's "only ever set on payments WE recorded" — a real card payment reversed directly through Flitt's portal or API has **no path back into this database at all**. If Nikalas ever refunds a guest through Flitt directly, this app would keep showing that order as paid, on every screen, indefinitely, with nothing to catch it. Worth deciding whether that's an accepted manual-reconciliation process (admin refunds in Flitt, then manually un-pays the order here too) or a feature gap to close — either way, it's a decision for Max, not something to silently test around.

### 2. Every way money moves in this app — the full scenario matrix

Traced from `shouldTakePayment.ts`, `settle.ts`, `manualPayment.ts`, `createBooking.ts`, `submitWineOrder.ts`, `createOrderAdmin`, `sendOrderInvoice`.

### 2a. Decision: does this order even go to the gateway?

`shouldTakePayment()`'s precedence, in order — **hard blocks first, nothing below can override them**:
1. Module off (`x-tenant-modules-online-payment` header) → reservation-only.
2. Missing `flittMerchantId`/`flittSecretKey` → reservation-only, even with everything else on.
3. Price is null/≤0 → reservation-only.
4. Price hidden from the customer (`priceShown: false`) → reservation-only, even if the company override says "always require."
5. Then, only if none of the above fired: `Company.skipPayment` (`true`=always skip, `false`=always require, `null`=fall through) → else the tenant's per-section toggle (Individual / Company / Wine order).

### 2b. The channels money actually arrives through

| Channel | Where it's triggered | `Payment.provider`/`method` | Reaches `settle.ts`? |
|---|---|---|---|
| Card via Flitt, individual booking | `createBooking.ts` → `startCheckout()` | `flitt` / `CARD` | Yes |
| Card via Flitt, company booking | same | `flitt` / `CARD` | Yes |
| Card via Flitt, wine order | `submitWineOrder.ts` → `startCheckout()` | `flitt` / `CARD` | Yes |
| Manual bank transfer | admin "mark as paid" picker → `recordManualPayment` | `manual` / `BANK_TRANSFER` | No — never touches Flitt |
| Manual cash | same | `manual` / `CASH` | No |
| Admin correction (no channel specified) | same, default | `manual` / `MANUAL` | No |
| Un-pay / reversal | admin toggles paid off → `reverseManualPayments` | sets `reversedAt` on **manual rows only** — a real card settlement can never be reversed this way, by design | N/A |

**No refund flow exists anywhere in the app** (confirmed by search) — out of scope because there's nothing to test.

**"Book & pay later" is not a resumed card checkout.** Confirmed by reading `createBooking.ts`/`submitWineOrder.ts`: `startCheckout()` is only ever called once, at initial submission. A reservation-only order has no way to later generate a second Flitt link — "pay later" in this app means reservation → `sendOrderInvoice()` (HTML email with your bank IBAN/personal number) → admin manually records the bank transfer once it arrives. If Max wants an actual "resume and pay by card" flow, that's a feature gap to raise separately, not something to test as if it exists.

### 2c. Outcome states after a gateway checkout is created

| Outcome | Trigger | What `settle.ts` writes |
|---|---|---|
| Approved | callback `order_status=approved`, signature valid, amount matches | `Payment.settledAt`, `Order.paidAt`/`abandonedAt=null` (guarded: only if `stage='NEW'`, so a human-advanced order can't be dragged backwards), `OrderEvent(PAID)`, settlement email |
| Declined | callback `order_status` anything else | `Payment.status` recorded, `OrderEvent(PAYMENT_DECLINED)`, **order stays abandoned** — no email |
| Never returns (closed tab, no callback at all) | guest abandons at Flitt's page | Order stays `abandonedAt`-stamped indefinitely until an admin restores it — indistinguishable from a decline from the order's own point of view (deliberate, per the schema comment) |
| Forged/tampered callback | signature mismatch, or amount/currency mismatch | Rejected outright, nothing written — this is what `verifyCallbackSignature` and the amount-equality check in `settle.ts` exist for |
| Duplicate callback (Flitt retries, or both `response_url` and `server_callback_url` fire) | `payment.settledAt` already set | No-op (`already-settled`) — must not double-send email |
| Late callback after admin already advanced the order | `stage != 'NEW'` | `updateMany` guard means paidAt/abandonedAt are **not** touched — order keeps whatever state the admin put it in |

### 2d. Order-creation paths (Max's four)

| Path | Function | Can reach Flitt? | Notes |
|---|---|---|---|
| Book & Pay (guest, individual) | `createBooking.ts` | Yes | |
| Book & Pay (guest, company) | `createBooking.ts` | Yes, subject to company override | |
| Request Booking / reservation-only | `createBooking.ts` | No — by construction | |
| Wine order, pay now | `submitWineOrder.ts` | Yes | |
| Wine order, reserve | `submitWineOrder.ts` | No | |
| Admin-created order | `createOrderAdmin` | **Never** — doesn't call `startCheckout` at all, always starts unpaid | Getting one paid requires a separate manual-payment step afterward |
| Edit after the fact | `updateOrderEnhanced` / `changeBookingStatus` | N/A — modifies an existing order, any origin | The real risk here is **stale money**: editing guest counts/extras after payment without a repricing+reconciliation step |

### 3. What's already covered vs. genuinely untested

`saas/tests/tier1-regression/payment-amount-integrity.spec.ts` and `payment-label-precedence.spec.ts` are thorough on **the decision layer** (§2a) — every toggle × override × hidden-price combination, for individual/company/wine-order alike, cross-checked against the amount that reaches Flitt. That work does not need repeating.

What neither file — nor anything else in the suite — touches, because it's structurally impossible from localhost (§ from last message: the callback URL is built from the request's own host header, which Flitt can never reach at `localhost`):

- [ ] A checkout that actually **settles** — `Payment.status` becoming `approved`, `settledAt`/`paidAt` getting written, the order leaving `/admin/abandoned` on its own (not via the manual "Restore" button).
- [ ] A checkout that is **declined at the gateway** (not just "never redirected") — proving a real decline doesn't get mis-read as paid anywhere.
- [ ] The **post-payment confirmation email** (`sendSettlementEmail` / `sendBookingConfirmation` / `sendWineOrderReceipt`) actually being sent with `paid: true` and the right amount.
- [ ] **Book & pay later** end to end: reservation → invoice email content correctness → manual bank-transfer recording → every screen agreeing.
- [ ] **Admin-created order** rendering identically to a guest-created one everywhere, and being payable via the manual path afterward.
- [ ] **Edit after payment**: does changing guest count/extras on an already-paid order leave the invoice, CSV export, and admin table agreeing, or does one of them go stale? (Real candidate for a bug — nothing recomputes `Payment.amount` when `Order.totalPrice` changes post-payment.)
- [ ] Idempotency/duplicate-callback and forged-signature behavior, driven through the real route rather than only through `settle.ts`'s own unit-style checks in `scripts/test-flitt-signature.ts`.

### 4. Dependency map — every place the *same* payment fact is rendered

This is the part Max specifically asked to fold in: a booking's price/payment status is one fact, but it is read and re-rendered in enough places that a bug can make exactly one of them wrong while the others stay right. Each scenario test below should check **all** of these, not just the one screen the flow happens to land on.

| Fact | Written by | Read by |
|---|---|---|
| `Order.totalPrice` / rate snapshots | `createBooking`/`createOrderAdmin` at creation time only (snapshotted — never re-read from live `Price` rows, chunk 4) | Admin orders table, admin order detail/edit panel, `/admin/abandoned` row, CSV export (`exportOrdersCsv`), calendar day-hover popover, invoice email, booking-confirmation email, statistics revenue aggregation |
| `Order.paidAt` / `abandonedAt` | `settle.ts` (gateway) or `recordManualPayment`/admin toggle (manual) | Admin orders table (paid/unpaid coloring), `/admin/abandoned` (presence/absence), CSV export's derived `paid`/`invoiced`/`unpaid` column, statistics revenue-by-status |
| `Order.invoiceSentAt` | `sendOrderInvoice` | Admin order detail, CSV export (separate column from Payment — an order can be both invoiced *and* paid, deliberately not collapsed) |
| `Payment.amount`/`status`/`settledAt` | `startCheckout` (created) → `settle.ts` (settled) | Nowhere in the current UI directly (no payments list screen found) — only indirectly via `Order.paidAt`. **This itself is worth confirming**: if `Payment` and `Order.paidAt` can ever disagree (e.g. the `stage != 'NEW'` guard in §2c), nothing on screen would show it. Worth a dedicated check: force that guard to fire, then verify via direct SQL that `Payment.settledAt` is set while `Order.paidAt` is not, and decide if that's acceptable or worth surfacing somewhere. |
| `Order` money fields after an edit | `updateOrderEnhanced` | Same list as `totalPrice` above — this is the "edit after the fact" consistency check |
| Wine order equivalents (`WineOrder.totalAmount`, `WineOrderItem.priceSnapshot`) | `submitWineOrder` | Admin wine-orders board, wine-order receipt email, statistics wine-mode |

**Practical rule for every scenario built under this plan:** after the payment/order action, check the admin orders table (or wine-orders board), the order's own detail/edit view, `/admin/abandoned` (confirm absence if it should be absent), the CSV export row, and — where an email fires — the email content, all in the same test, all against the one number the flow itself produced. Not five separate specs each checking one screen.

---

## Chunk 1 — One live, manual proof-of-loop (no Playwright yet)

**Goal:** prove the real settle loop works on staging before investing in test code around it.
**Status:** ✅ Done (2026-09-24).

1. **Back up the real credentials first, via direct DB read (Supabase MCP), not the admin UI.**
   Read `Tenant.flittMerchantId` and `Tenant.flittSecretKey` for Staging Winery
   (`cmrxb85wo0000vlc0d964nzf8`) from the dev project and record both values before touching
   anything. This is the only point at which the real secret can still be captured — see
   Ground Rule 1.
2. Log into `staging.vineworks.ge/admin/settings` and set the Flitt merchant ID/secret to
   `1549901`/`test`.
3. Submit one real individual booking on `staging.vineworks.ge`, follow it to Flitt's real
   hosted checkout, pay with the non-3DS approved test card (`4444555511116666`, any
   expiry/CVV — no OTP step to worry about on this card).
4. Confirm the loop actually closed: `Payment.status = 'approved'`, `settledAt` set,
   `Order.paidAt` set and `abandonedAt` cleared, `OrderEvent(PAID)` written, settlement email
   received — checked directly in the DB, not just "did the browser redirect back."
5. Restore the two original values (typing the backed-up secret back into the write-only
   field) and **verify the restore via a second direct DB read** — comparing against the
   Chunk 0 backup, not assuming the UI save worked.
6. Delete the test booking via the normal admin flow.

**Result log (2026-09-24):** The loop settled end to end on the first live attempt. Individual
booking, Tasting + Lunch, 4 guests, 480₾, confirmed via Flitt's real hosted checkout
(`pay.flitt.com`, merchant `1549901`) with the non-3DS approved test card. Customer-facing
redirect showed "Payment received." DB confirmed `Payment.status='approved'`, `settledAt` set,
`providerPaymentId` populated, `Order.paidAt` set / `abandonedAt` null / `stage='NEW'`. Test
order + Payment + OrderEvent rows all cascade-deleted cleanly via the admin Orders UI's
delete action. Credential swap and restore both verified byte-for-byte against the Chunk 0
DB backup (merchant ID plaintext-compared, secret compared by exact equality in SQL, not
just length).

**Two things worth carrying into later chunks, found incidentally:**
- **Duplicate `OrderEvent(PAID)` on a single settlement.** ✅ **Fixed 2026-09-24** — see the
  "Incident and fix" section above for the full story. Exactly one settlement had produced
  *two* `OrderEvent` rows of type `PAID` (36ms apart, both `actorType='GATEWAY'`), consistent
  with Flitt firing both `response_url` and `server_callback_url` this close together. The
  idempotency check has since been made atomic; re-verified via both a deterministic
  concurrency script and a second live run, both showing exactly one row.
- **No settlement email found.** Checked Resend's send log directly (`api.resend.com/emails`)
  for the ~4-minute window around this booking/settlement — no email to the test address or
  matching subject appears at all, not even a bounced/delayed one (contrast with this same
  tenant's other recent test bookings, which do show up, bounced, when sent to
  `@example.invalid` addresses). Not confirmed as a bug from this single manual run — could be
  the settlement email path specifically, or could be something about this exact order — but
  worth a deliberate check in Chunk 3, where the approved case already plans to assert on
  email content.

**Resume point:** Chunk 1 fully closed out. Chunk 2 (scaffolding) is next.

## Chunk 2 — Scaffolding

**Goal:** the infrastructure every later chunk's spec files share.
**Status:** ✅ Done (2026-09-24).

- `saas/playwright.staging.config.ts` — `baseURL: https://staging.vineworks.ge`, no
  `webServer` block, same reporter/output conventions as `playwright.config.ts`.
- No credential-swap helper needed any more — Staging Winery's test-merchant credentials are
  now permanent (see Ground Rule 1). A small `saas/tests/helpers/flittPayment.ts` is still
  worth adding, but only for what actually varies per test: driving Flitt's real hosted
  checkout page (entering a given test card/expiry/CVV, handling the `111111` OTP step for
  3DS cards) and the payment-section-toggle helpers already in `helpers/payments.ts`.
- `saas/tests/tier5-payment-e2e/` directory + matching `playwright/notes/` numbering
  continuing from the existing suite's `12-payment-label-precedence.md`.

**Result log (2026-09-24):** Both pieces built and live-verified against the real staging
site, not written from guesswork.

- `playwright.staging.config.ts` confirmed via a throwaway smoke spec (`page.goto('/')`,
  asserted the response's own host was `staging.vineworks.ge`) — passed, deleted after.
- `flittPayment.ts`'s selectors were found live via the accessibility tree, not assumed from
  the docs: the hosted checkout's visible "card mock-up" graphic is pure decoration (a static
  preview that never reflects what's typed) — the real inputs are `input[name="f-card_number"]`
  / `f-expiry_date` / `f-cvv2`, elsewhere in the DOM. Typing into them without `.fill('')` first
  produces concatenation garbage on top of a sandbox-supplied default value, confirming the
  plan's suspicion above.
- **Real finding, corrects this plan's own assumption:** the 3DS challenge for both 3DS test
  cards (`4444555566661111` approve, `4444111166665555` decline) never showed an OTP field at
  all — it's a "Bank Server Emulation" page with a single "Continue" button
  (`id="submit__button"`), rendered inside a same-origin iframe Flitt injects client-side after
  the Pay click (`iframe.flitt-modal-iframe`, `src="about:blank"` — never present before the
  click, never part of the top frame's own content, and not picked up by a page-level
  accessibility-tree read for that reason). It also auto-submits itself after 10 seconds via
  its own inline script even if nothing clicks it. `payAtFlittCheckout` handles both shapes
  defensively (looks for an OTP-style input first, falls back to the Continue button) but the
  111111 OTP path itself was never actually exercised — nothing in this merchant's sandbox
  triggered it.
- The helper was proven end to end twice, via real Playwright runs against
  `playwright.staging.config.ts` (not just manual browser-tool clicks): once with the non-3DS
  approve card, once with the 3DS approve card. Both settled — confirmed via direct SQL
  (`Payment.status='approved'`, `settledAt` set, `Order.paidAt` set) — and both test orders were
  deleted via the admin UI afterward, with the Individual-bookings toggle (verified OFF at
  rest beforehand, matching its documented resting state) restored to OFF in every run's
  `finally` block, reload-verified after the last one.
- The decline cards and the OTP-fill path were **not** exercised live in this chunk — per this
  plan's own note, that's Chunk 3's job. `FLITT_TEST_CARDS` exports all four so Chunk 3 doesn't
  need to re-derive them.

## Chunk 3 — Book & Pay Now (the core happy/unhappy path)

**Goal:** close the single biggest gap from §3 — an actual settlement, and an actual decline.
**Status:** ⬜ Not started.

- Approved: non-3DS card first (simpler to automate), then the 3DS card — Chunk 2 found this
  merchant's "3DS" challenge is actually a same-origin iframe with a "Continue" button, not an
  OTP field (`flittPayment.ts`'s `payAtFlittCheckout` already handles both shapes) — for an
  individual booking.
- Declined: non-3DS decline card — confirm the order is **not** mis-read as paid anywhere,
  stays on `/admin/abandoned`, no settlement email sent.
- Both checked across every surface in §4: admin orders table, order detail, `/admin/abandoned`,
  CSV export, and the settlement email's content (approved case only).
- Repeat once for a company booking and once for a wine order, reusing the same helper —
  these three share `startCheckout()`, so one thorough individual-booking spec plus two
  lighter confirmation passes is proportionate, not three full rebuilds.

**Result log (2026-09-24):** Both specs built and live-verified against real staging, not
written from guesswork — `tests/tier5-payment-e2e/payment-approved-settlement.spec.ts` (3/3:
individual full check, company + wine order light checks) and `payment-declined-settlement.spec.ts`
(1/1). Full writeups: `playwright/notes/13-payment-approved-settlement.md`,
`playwright/notes/14-payment-declined-settlement.md`.

- **The settlement email question from Chunk 1 is now answered, not left inconclusive.** It
  never reaches Resend at all — checked via `GET api.resend.com/emails` (Resend's send-log
  **list** endpoint, undocumented anywhere in this repo before now, confirmed live) both across
  this whole suite's entire history and freshly after every one of today's approved-settlement
  runs: zero attempts, not even a bounced one, for a "Payment received —" subject. Root cause
  suspected via code reading, not yet proven or fixed: `settle.ts`'s `sendSettlementEmail()` is
  fired `void ...().catch(...)` after the response has already gone out, with no `waitUntil()`/
  `unstable_after()` keeping the serverless function alive — and unlike `createBooking.ts`'s own
  fire-and-forget confirmation email (a single-hop send that reliably shows up, bounced, in the
  same log), this one needs several sequential DB round trips before it ever reaches Resend's
  API, giving the function far more chances to be torn down first. Logged as `KnownBugs.md` #53.
  The spec's own check is deliberately a loud diagnostic (console line + test annotation), not a
  hard `expect()` — see the spec file's header comment for why a permanently-red assertion for an
  already-tracked, separately-owned bug would be worse than useful here.
- **Real, load-bearing finding about the test merchant itself, fixed in shared infra:** the
  non-3DS decline card never redirects back to the site — Flitt shows an inline "Declined"
  dialog on its own page with no way back to the merchant at all (confirmed via a full
  accessibility-tree dump). `flittPayment.ts`'s `payAtFlittCheckout` now returns
  `outcome: 'redirected' | 'declined-inline'` instead of assuming every card eventually
  redirects — worth having correct in shared infrastructure before Chunk 7 (forged/duplicate
  callbacks) also needs to drive a decline. The order still settles correctly regardless, since
  Flitt's server-to-server webhook fires independently of what the browser shows.
- **A second, smaller finding:** Flitt's own webhook body reports this decline's `order_status`
  as `"processing"`, not literally `"declined"` — `settle.ts` handles it correctly regardless
  (anything not `'approved'` is not-approved), but anyone reading `Payment`/`OrderEvent` rows
  later should not expect to see the literal word "declined" for this card.
- **Independently re-verified against the dev DB directly**, not just a green Playwright run:
  approved case — `Payment.status='approved'`, `settledAt` set, `Order.paidAt` set, exactly one
  `OrderEvent(PAID)` (no duplicate — the Chunk-2 idempotency fix still holds); declined case —
  `Payment.status='processing'`, `Order.paidAt` null/`abandonedAt` set, exactly one
  `OrderEvent(PAYMENT_DECLINED)`, no `PAID` event anywhere. Both rows deleted after verifying.
- **Several test-building findings, not app bugs**, fully written up in the two note files:
  confirming a company's access code can open more than one blocking contact-role picker (one
  per role with real people on file — Caucasus Vine Travel has two); `.isVisible({ timeout })`
  does not poll and silently no-ops if the awaited state doesn't exist yet; a required
  `contactEmail` field on the wine-order form fails HTML5 validation with zero visible error;
  and a live per-company wine discount broke two different amount-parsing assumptions before
  landing on a correct one.
- **Cleanup:** individual and company orders deleted via the real admin UI in every run,
  regardless of pass/fail. Wine-order settlements have no delete action at all (standing,
  already-documented admin limitation) — swept via direct SQL as part of closing out this
  chunk; the same manual sweep will be needed after any future run. All ZZ-marker rows
  independently confirmed at zero afterward. Every toggle and company override read before
  being touched and restored after, verified via a fresh DB read post-cleanup (`Individual
  bookings`=false, `Company bookings`=false, `Wine orders`=true — matching what was live
  before this chunk started; both fixture companies' overrides back to `null`/Default).

**Resume point:** Chunk 3 fully closed out. Chunk 4 (Book & Pay Later) is next.

## Chunk 4 — Book & Pay Later

**Goal:** the reservation → invoice → manual-payment loop, end to end.
**Status:** ⬜ Not started.

- Submit a reservation-only booking (payment section off, or hidden price, or a company's
  "Always skip" — pick whichever is simplest to set up cleanly).
- Admin sends the invoice; assert the email's amount/bank details match the order's own
  stored values (§4's `Order.invoiceSentAt` row).
- Admin records a manual bank-transfer payment; assert `Order.paidAt` and the ledger `Payment`
  row (method `BANK_TRANSFER`) agree, and every §4 surface reflects it.
- Note in the spec's own note file: this is confirming the *actual* pay-later flow (invoice +
  manual transfer) — not a resumed Flitt checkout, which doesn't exist (§2b).

## Chunk 5 — Admin-created order

**Goal:** parity between an admin-created order and a guest-created one, then getting it paid.
**Status:** ⬜ Not started.

- `createOrderAdmin` never touches Flitt (§2d) — create one, confirm it renders identically
  to a guest order on every §4 surface, then run it through the same manual-payment step as
  Chunk 4.

## Chunk 6 — Edit after the fact (the stale-money check)

**Goal:** find out whether editing an already-paid order leaves anything showing a stale number.
**Status:** ⬜ Not started.

- Take a Chunk 3 order through to `paidAt` set, then use `updateOrderEnhanced` to change
  guest count/extras.
- Check every §4 surface for agreement: does the invoice (if re-sent), the CSV export, and
  the admin table all show the *new* total, or does one of them still show what was actually
  paid? §4 already flags that nothing recomputes `Payment.amount` on an edit — this chunk is
  explicitly going in expecting to find a real discrepancy, not just confirming there isn't one.
- Whatever is found gets written up as a `KnownBugs.md` entry, not just a failing assertion
  quietly adjusted to match reality.

## Chunk 7 — Idempotency, forged callback, tampered amount

**Goal:** drive `settle.ts`'s existing defenses (§2c) through the real staging route, not
just `scripts/test-flitt-signature.ts`'s unit-style checks.
**Status:** ⬜ Not started.

- A genuine duplicate callback (both `response_url` and `server_callback_url` firing for one
  real payment) → confirm no double-send of the settlement email.
- A replayed/forged callback body against a real `payment_id` with a bad signature → confirm
  rejection, confirm nothing changes.
- A late callback after the order's `stage` has already moved past `NEW` → confirm `paidAt`/
  `abandonedAt` are correctly left untouched.

## Chunk 8 — Documentation

**Goal:** leave this discoverable the way the rest of the suite is.
**Status:** ⬜ Not started.

- `playwright/README.md` / `ARCHITECTURE.md` — document the second config, when to run which
  suite, and the credential-swap helper's safety rule.
- `playwright/Progress.md` — fold tier5 into the tracker.
- `vault/KnownBugs.md` — log the refund-sync gap from §1b (a Flitt-side reversal never
  reaches this app) as an open item, separate from whatever Chunk 6 finds.
- `vault/Roadmap.md` — note the Pay-by-Link idea from §1b as a possible answer to a "resume
  and pay by card" feature request, if one ever comes in.
