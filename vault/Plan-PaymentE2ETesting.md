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
| **4** | Book & Pay Later — reservation → invoice → manual bank transfer, full cross-view check | ✅ Done (2026-09-24) |
| **5** | Admin-created order — parity with guest orders, then manual payment | ✅ Done (2026-09-24) |
| **6** | Edit after the fact — stale-money check on an already-paid order | ✅ Done (2026-09-25) — real bug found, `KnownBugs.md` #64 |
| **7** | Idempotency, forged callback, tampered amount — driven through the real staging route | ⬜ Not started |
| **8** | Docs: `playwright/README.md`/`ARCHITECTURE.md`, `Progress.md`, vault entries for the reversal-sync gap and the Pay-by-Link idea | ⬜ Not started |

Status values: ⬜ Not started · 🚧 In progress · ✅ Done · ⏸ Paused

**Overall resume point:** 🔜 Chunks 0–6 are done. The real settle loop is proven live
on staging (see Chunk 1's result log below), the race-condition it surfaced is fixed and
verified (see "Incident and fix" below), Staging Winery runs **permanently** on Flitt's public
test merchant (`1549901`/`test` — see Ground Rule 1), the shared scaffolding (staging
config + `flittPayment.ts` helper) is built and live-verified (see Chunk 2's result log below),
Chunk 3 closed the single biggest gap from §3 — a real approved settlement and a real
decline, both checked across every §4 surface (see Chunk 3's result log below) — Chunk 4
closed the "book & pay later" loop, finding and fixing a real, standing app bug along the way
(the manual-payment "Paid" picker closing itself instantly — see Chunk 4's result log below),
and Chunk 5 confirmed an admin-created order has genuine parity with a guest-created one
across every §4 surface once both are paid, finding no app divergence but two real bugs in
the test itself along the way (see Chunk 5's result log below). **Chunk 6 (Edit after the
fact) is done and found the real bug this whole plan flagged as likely** — editing an
already-paid order's guest count reprices `Order.totalPrice` everywhere while `Payment.amount`
stays frozen at the original charge, with nothing anywhere surfacing the disagreement. Logged
as `KnownBugs.md` #64, not fixed (see Chunk 6's result log below).
**Chunk 7 (Idempotency, forged callback, tampered amount) is next**, and per
[[ClaudeInstructions]] Rule 8 still gets called out for confirmation as it comes up, not
assumed from this plan alone.

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

**Continuation (2026-09-24) — the first fix (`45f8629`) had its own bug, now corrected.**
That fix closed the concurrent-double-callback race by gating the atomic claim on
`status: 'created'`. That gate was wrong: `status` is flipped away from `'created'` by the
*first* callback of *any* kind, including a non-final `processing` one — and Flitt can
legitimately send `processing` before the real, final `approved`/`declined` callback (this
file's own comment on `processing`, further down `settle.ts`, already said it "is still in
flight and may yet approve"). Under that gate, a first `processing` callback permanently
claimed the row, and a later genuine final callback was silently rejected as
`already-settled` — a customer who actually paid could have their order stuck unpaid
forever, with nothing anywhere surfacing that this happened. This was **not** caught by
inspection; it was caught by Chunk 3's own live decline test observing Flitt report
`status: 'processing'` for a card that should decline immediately — a non-terminal value
where a clean one was expected, which is what prompted a re-read of the whole gate's logic.

**Corrected fix (commit `46cf7c2`, 2026-09-24, on `staging`):** the claim's `where` clause is
now `{ id: payment.id, settledAt: null }` instead of `{ id: payment.id, status: 'created' }`.
`settledAt` is the one fact that actually needs to be atomic — "has this payment ever truly,
finally succeeded" — set exactly once, only on approval. A `processing` callback never sets
it, so a later genuine `approved`/`declined` callback still passes the gate; two truly
simultaneous `approved` deliveries still can't both win, since Postgres serializes the
concurrent `updateMany`s on the same row and the loser finds `settledAt` already non-null —
closing the *original* race this gate exists for, same as before. Full reasoning, written
into the code comment at the claim site in `saas/lib/payments/settle.ts`, including the one
accepted trade-off (a genuine duplicate of the same *non-final* status in the same race
window can still double-write an `OrderEvent` — cosmetic, audit-log only, pre-existing, not
solved here). Also logged as `KnownBugs.md` #60.

Verified two ways, both required for a logic change like this: (a) a deterministic
sequential script (`npx tsx`, not committed) — a signed `processing` callback followed by a
signed `approved` callback for one fresh `Order`+`Payment` on Staging Winery's dev DB —
confirming the `approved` call actually settles (`outcome: 'settled'`, not
`'already-settled'`), `Order.paidAt` gets set, and exactly one `OrderEvent(PAID)` exists;
this is the regression test the first fix would have failed. (b) the same concurrency test
the first fix was verified with — two simultaneous `approved` calls for one fresh payment —
re-run against the corrected gate: exactly one `'settled'` + one `'already-settled'`, exactly
one `OrderEvent(PAID)`, confirming the correction didn't reopen the original race while
closing the new one. Both scripts' throwaway rows were deleted and a follow-up query
confirmed zero left behind.

**Continuation (2026-09-24) — an independent audit, not another incident.** After the
corrected fix (`46cf7c2`) landed, an independent audit reviewed the current state of
`settle.ts`'s idempotency gate — the `tx.payment.updateMany({ where: { id: payment.id,
settledAt: null }, ... })` claim described above — and **confirmed the core
exactly-once-settlement guarantee is correct.** It found two additional, narrowly-scoped
things worth fixing, not a redesign:

1. **The remaining duplicate-event race, now closed.** The trade-off this doc accepted
   above — two simultaneous deliveries of the exact same *non-final* status (two
   `processing` pings, or two genuine `declined` pings) both passing the `settledAt: null`
   gate and both writing a duplicate `OrderEvent` — is fixed by adding `status: { not:
   orderStatus || 'unknown' }` to the claim's `where` clause. A `processing → approved`
   sequence is unaffected (the statuses differ); two identical concurrent pings now have
   their second call find the row's `status` already equal to what it's trying to write,
   so `claim.count === 0` and the duplicate is dropped.
2. **`processing` no longer mislabeled as a decline.** The `!approved` branch used to
   record `OrderEvent(PAYMENT_DECLINED)` for *any* non-approved status, including
   `processing` — which means "still in flight, may yet approve," not an actual decline.
   A `processing → approved` sequence therefore wrote a false "declined, then somehow
   paid" line onto the order's own timeline. Fixed by skipping the `OrderEvent` write
   entirely when `orderStatus === 'processing'` — no new `OrderEventType` added (that
   needs a Prisma migration, a separate workflow per [[ClaudeInstructions]] Rule 10, out
   of scope here). The `Payment` row's `status`/`rawResponse` still update
   unconditionally either way; only the `OrderEvent` recording is conditional.

Both changes made together in commit `317a144`, `staging`. Verified with three scenarios
against Staging Winery's dev DB (throwaway Order+Payment rows per scenario, real signed
callback bodies, `npx tsx` script deleted after use, cleanup confirmed by a follow-up
query showing zero rows left): **(A)** two concurrent identical `processing` calls write
zero `OrderEvent` rows, and a following `approved` call still settles normally
(`outcome: 'settled'`, exactly one `OrderEvent(PAID)`); **(B)** two concurrent identical
genuine `declined` calls now write exactly **one** `OrderEvent(PAYMENT_DECLINED)`, not
two — the actual proof the new `WHERE` condition closes the race; **(C)** two concurrent
identical `approved` calls still produce exactly one `settled` + one `already-settled` +
one `OrderEvent(PAID)` — confirming neither change reopened the original race. `tsc
--noEmit` clean.

**Also flagged by the same audit, deliberately not fixed here — a separate, undecided
feature question:** a genuine gateway-side `reversed` (refund/chargeback) callback would
currently still be silently discarded by the `settledAt: null` gate, since **nothing in
this app reacts to a `reversed` status at all.** This is the same gap §1b above already
documents ("Flitt does support refunds — and our app has no idea when one happens") —
still open, still Max's call whether to build real reversal handling or accept manual
reconciliation (admin refunds in Flitt, then manually un-pays the order here too). Not
duplicated as a new finding; linked here so it isn't lost between the two write-ups.

**Architecture question raised and closed (2026-09-24): should the webhook be prioritized
over the browser redirect, rather than treating both as an equal race with an atomic
tiebreaker?** Max's own instinct was that the webhook — not dependent on the guest's own
browser/connection — should be treated as primary and the redirect as a backup. Both my own
review and a separate independent audit reached the same conclusion: **no** — both channels
carry the identical signature-verified proof once received (this isn't the "don't trust the
client" scenario the industry's usual webhook-over-redirect advice is actually about, since
Flitt's redirect payload is server-signed, not a client claim), so there's nothing genuine to
prioritize. Deliberately trying to prefer one would mean either disabling the redirect's
ability to settle at all (removing real resilience — a customer whose confirmation email
depends on a webhook that's delayed for minutes/hours would wait needlessly) or adding an
artificial wait/verify step (new latency and failure surface, for a race that's already
correctly resolved). **Decision: kept the current symmetric design, no change made.**

The audit's one genuinely new finding from this pass — a real gap neither "keep as-is" nor
"prioritize the webhook" would have caught — is logged as **`KnownBugs.md` #61**: if *both*
channels fail for independent reasons in the same window (rare, no observed instance), a
paid order could sit unresolved indefinitely, since Flitt's own 24-hour webhook retry window
and the redirect's independence from it are the only two safety nets, and there's currently
no third one (e.g. a periodic reconciliation check against Flitt's own status endpoint) for
the case where both are simultaneously unlucky. **Max's call: correct as low priority,
deliberately deferred — not fixed as part of this plan.**

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
**Status:** ✅ Done (2026-09-24).

- Submit a reservation-only booking (payment section off, or hidden price, or a company's
  "Always skip" — pick whichever is simplest to set up cleanly).
- Admin sends the invoice; assert the email's amount/bank details match the order's own
  stored values (§4's `Order.invoiceSentAt` row).
- Admin records a manual bank-transfer payment; assert `Order.paidAt` and the ledger `Payment`
  row (method `BANK_TRANSFER`) agree, and every §4 surface reflects it.
- Note in the spec's own note file: this is confirming the *actual* pay-later flow (invoice +
  manual transfer) — not a resumed Flitt checkout, which doesn't exist (§2b).

**Result log (2026-09-24):** `tests/tier5-payment-e2e/payment-book-later.spec.ts` built and
live-verified against real staging (1/1 passing). Full writeup: `playwright/notes/15-payment-book-later.md`.

- **A real, standing app bug found and fixed, independent of this plan.** Clicking an order's
  "Paid" status option is supposed to open a "Bank Transfer or Cash?" picker
  (`recordManualPayment` in `lib/payments/manualPayment.ts` already supported both methods) —
  but the picker closed itself the instant it opened, on both `/admin/orders`
  (`OrdersTable.tsx`) and an order's own detail page (`OrderDetail.tsx`). Root cause, confirmed
  live by patching `Element.prototype.closest` to log its own calls during a real click (not
  assumed from reading the code): Next's App Router hydrates React at `document`, so the
  outside-click-closes-the-menu listener and React's own delegated click listener are two
  independent listeners on that same node. Clicking "Paid" mounts the picker in place of the
  step list, and React flushes that swap synchronously while dispatching the click to its own
  (earlier-registered) bubble listener — *before* the outside-click handler's turn — so by then
  the clicked button is already detached from the DOM and a bubble-phase containment check on
  it (`e.target.closest(...)`) finds nothing and wrongly closes what the click had just opened.
  A first fix attempt (the containment check alone, still on the bubble phase) was **not**
  enough for exactly this reason, confirmed by the same `closest` patch showing
  `isConnected: false` at the moment the check ran. The real fix: move the listener to the
  **capture** phase, which runs top-down before the click reaches its target, so the
  containment check sees the DOM exactly as clicked. Fixed in both files (commits `b58e9cc`
  then `ac47541` correcting it, `staging`) — `OrdersTable.tsx` was independently confirmed
  broken the same way live, not assumed from `OrderDetail.tsx`'s fix by code similarity.
- **A second, unrelated bug found and deliberately not fixed here.** Live-testing the fix on
  `/admin/orders`' mobile card list (viewport <768px) found the inline status dropdown can be
  clipped by its own card's `overflow-hidden` once it has enough menu items — confirmed via
  `document.elementFromPoint()` at the "Paid" button's own layout coordinates resolving to the
  *next card* instead. Flagged as its own follow-up task (`KnownBugs.md` #62, out of scope for
  this chunk's bug). **Fixed 2026-09-24, commit `7926231` on `staging`** — the mobile trigger now
  shares the desktop table's own `toggleStatusMenu()` + portal path instead of its own inline
  dropdown; see `KnownBugs.md` #62 for the full before/after verification.
- **Independently re-verified against the dev DB directly** — the automated spec deletes its
  own order as part of a passing run, before there was a chance to inspect the DB mid-flight, so
  a second, separate manual pass through the same UI flow was queried directly: `Order.paidAt`
  and `Order.invoiceSentAt` both set and independent of each other, `Payment` row with
  `provider='manual'`, `method='BANK_TRANSFER'`, `status='recorded'`, `settledAt` set, `amount`
  matching `totalPrice` exactly. Both this manual-verification order and the automated spec's
  own order swept to zero afterward. The "Individual bookings" toggle confirmed back at its
  documented resting value (off), both via the spec's own restore and independently via a live
  DOM read (`translateX(2px)` on the Toggle's thumb span).

**Resume point:** Chunk 4 fully closed out. Chunk 5 (Admin-created order) is next.

## Chunk 5 — Admin-created order

**Goal:** parity between an admin-created order and a guest-created one, then getting it paid.
**Status:** ✅ Done (2026-09-24).

- `createOrderAdmin` never touches Flitt (§2d) — create one, confirm it renders identically
  to a guest order on every §4 surface, then run it through the same manual-payment step as
  Chunk 4.

**Result log (2026-09-24):** `tests/tier5-payment-e2e/payment-admin-order.spec.ts` built and
live-verified against real staging (1/1 passing). Full writeup: `playwright/notes/16-payment-admin-order.md`.

- Created an individual order directly through `/admin/orders/new` (date/party size/name/
  phone/email plus a manual "Tasting only ₾/pp" rate — an individual order always shows this,
  since there's no company tier to fall back on). Confirmed absent from `/admin/abandoned` and
  unpaid/un-invoiced on the admin orders table and CSV **immediately** on creation — a
  genuinely different resting state than a guest order that got declined or abandoned at the
  gateway (Chunk 3), since this order never went anywhere to be incomplete from.
- **Parity checked across every §4 surface at three points (just-created, invoiced, paid)** —
  admin orders table, the order's own detail view, and CSV export — using the exact same
  assertions, text, and formatting Chunk 4 already established for a guest-created order in
  the same end states. **No real divergence found.** Independently confirmed via direct SQL
  after a run with cleanup temporarily disabled: `Order.paidAt`/`invoiceSentAt` both set and
  independent, `abandonedAt` null throughout, `Payment{ provider: 'manual', method:
  'BANK_TRANSFER', status: 'recorded', settledAt` set, `amount` matching `totalPrice` exactly
  `}` — byte-for-byte the same shape Chunk 4 found for a guest order. The one actual
  difference — `OrderEvent(CREATED).actorType = 'ADMIN'` vs. `'GUEST'` — is invisible to every
  UI surface checked, exactly as the app's design intends (§4: "CSV/table have no created-by
  column").
- **Two real bugs found and fixed, both in this test, not the app** — worth carrying into
  future chunks:
  1. A URL-match regex reused from this tier's own established pattern
     (`/\/admin\/orders\/[a-zA-Z0-9]+$/`) also matched its own starting page — `/admin/orders/new`
     itself, since "new" is alphanumeric — so the post-creation redirect assertion passed
     instantly, before the real client-side redirect happened, silently capturing the wrong
     URL for every later "detail page" check. This produced a very convincing false app-bug
     signal (the order's real detail page, opened directly, rendered its correct 200₾ total;
     the test's own `page.goto(detailUrl)` showed a stark "0.00₾" for "the same order") that
     took a full debug pass — dumping the failing page's actual HTML — to trace to the test
     re-visiting a blank New Order form, not `OrderDetail.tsx` at all. Fixed with a negative
     lookahead (`/\/admin\/orders\/(?!new$)[a-zA-Z0-9]+$/`). Worth checking if any other chunk's
     spec reuses the un-anchored version of this regex starting from a URL where "new" (or any
     other literal alphanumeric route segment) is reachable.
  2. A small, systematic clock-skew (~380ms) between this machine's local clock and the
     timestamp Resend's send pipeline stamps `created_at` with made an unbuffered `>=`
     timestamp comparison in the Resend-email-content check fail consistently, not
     intermittently — confirmed live via the target email appearing in every single poll's own
     debug output while the comparison still failed. A systematic bias, unlike jitter, cannot
     be fixed by retrying/polling longer. Fixed with a 10-second safety margin on the
     comparison's start time (`new Date(Date.now() - 10_000)`) — costs nothing real, since
     `fetchRecentResendEmails`'s own `limit=100` already scopes the list to "recent sends."
- This spec never touches the "Individual bookings" payment-section toggle at all —
  `createOrderAdmin` doesn't call `shouldTakePayment()`, so the toggle is irrelevant here — and
  is therefore safe to run alongside the other three tier5 specs, not just sequentially with
  them.
- **Cleanup:** the automated spec deletes its own order via the normal admin UI in every run,
  regardless of pass/fail. One extra run had cleanup temporarily disabled on purpose to inspect
  the final paid-state DB row directly (see above); that row was then deleted the same way
  (admin UI), and a follow-up direct-SQL query confirmed zero `Order`/`Payment` rows remain
  matching the `ZZPaymentE2EAdminOrder%` marker.

**Resume point:** Chunk 5 fully closed out. Chunk 6 (Edit after the fact) is next.

## Chunk 6 — Edit after the fact (the stale-money check)

**Goal:** find out whether editing an already-paid order leaves anything showing a stale number.
**Status:** ✅ Done (2026-09-25).

- Take a Chunk 3 order through to `paidAt` set, then use `updateOrderEnhanced` to change
  guest count/extras.
- Check every §4 surface for agreement: does the invoice (if re-sent), the CSV export, and
  the admin table all show the *new* total, or does one of them still show what was actually
  paid? §4 already flags that nothing recomputes `Payment.amount` on an edit — this chunk is
  explicitly going in expecting to find a real discrepancy, not just confirming there isn't one.
- Whatever is found gets written up as a `KnownBugs.md` entry, not just a failing assertion
  quietly adjusted to match reality.

**Result log (2026-09-25):** `tests/tier5-payment-e2e/payment-edit-after-payment.spec.ts` built
and live-verified against real staging (1/1 passing). Full writeup:
`playwright/notes/17-payment-edit-after-payment.md`. **This is the situation the chunk's own
brief called out as the one to expect: a real, previously-undocumented bug, not a clean bill of
health.**

- **Read `updateOrderEnhanced` in full before writing anything**, per this chunk's own
  instruction. Confirmed statically: the function recomputes `totalPrice` and the three rate
  snapshots, but contains no `tx.payment` reference anywhere. `Payment.amount` is written
  exactly once, at `startCheckout()` time (`createBooking.ts`), and afterward is only ever
  *read* — `settle.ts`'s amount-equality gate, checked once, against the *original* settlement
  callback, never re-checked against a later edit.
- **Live-verified, not just read from the code.** A real individual booking (Tasting + Lunch,
  4 guests) went through an actual Flitt settlement on Staging Winery's permanent test
  merchant: `Payment{ provider: 'flitt', method: 'CARD', status: 'approved' }`, `amount` =
  48000 tetri (480₾), agreeing exactly with `Order.totalPrice`. The order's own admin detail
  page was then used to raise the party size and the Tasting+Lunch split from 4 to 6 — the
  ordinary "add two more guests, same agreed rate" edit, not an edge case — and saved.
  Afterward: `Order.totalPrice` = 72000 tetri (720₾) on **every UI surface checked** (admin
  orders table, the order's own "Order Total" card, CSV export, and a freshly re-sent invoice
  email), while the same `Payment` row's `amount` stayed exactly 48000 tetri, `status`/
  `settledAt` byte-for-byte unchanged. **Nothing anywhere flags the ₾240 disagreement** — there
  is no payments-list screen in this app (re-confirmed while investigating: the only UI-adjacent
  read of `Payment` is indirect, via `Order.paidAt`), no reconciliation check, no warning
  banner.
- **This chunk's own note about the guard, found while reading the function, worth carrying
  forward:** `updateOrderEnhanced` only recomputes `totalPrice` when `totalPayingGuests > 0`
  (i.e. the tasting/lunch split is actually filled in). A booking created via the *simple*
  (non-enhanced) form starts with that split at 0/0, so raising only the party-size field with
  the split left at 0/0 silently does **not** reprice at all — the spec had to fill both the
  party size and the split for the edit to take effect, which is itself a real, separate
  nuance of this function's behaviour worth knowing, not a bug this chunk is asserting on.
- **New helper, reusable by future chunks needing a fact with no UI surface:**
  `tests/helpers/orderMoneyDb.ts` — a plain, read-only `PrismaClient` against the same
  `DATABASE_URL` the app itself uses (same pattern as `scripts/audit-money.ts`), because
  `Payment.amount` has no UI surface anywhere to assert against through Playwright alone. The
  spec's own assertions on `Payment.amount` being frozen are therefore a genuine, reproducible
  proof, not an inference from reading the code.
- **The spec's assertions are written against the actual, confirmed behaviour** (`Payment.amount`
  frozen, every UI surface showing the new total, the two disagreeing) — passing, not failing,
  per this chunk's own instruction not to assert on an idealized fix that doesn't exist yet.
- **Four runs before a clean pass — two real test bugs found, not app bugs or flakiness — and
  each failed run independently re-confirmed the finding via direct SQL before either cause was
  found:**
  1. **Runs 1–2 (200s, then 300s timeout, no diagnostic timing yet).** Both hit
     `test.setTimeout` with no useful signal beyond "not a hang" (direct SQL each time showed the
     edit and reprice to 720₾ had already succeeded). Root cause, found once `mark()` timing was
     added: `exportOrdersCsvViaUi`'s own internal `page.goto('/admin/orders')` (run for the
     second, post-edit CSV export) left `page` there, but the very next step tried to click
     "Send Invoice" — a button that only exists on the order's own detail page. Playwright's
     default action timeout is unbounded when neither `use.actionTimeout` nor a per-call
     `timeout` is set (it inherits the *test's own remaining budget*, not a fixed ~30s), so that
     click just retried silently against a button that would never appear, for the rest of the
     run. Fixed with an explicit `await page.goto(detailUrl)` before the invoice section.
  2. **Run 3 (400s timeout, `mark()` timing in place, first bug fixed).** The timings now showed
     every real step finishing by +41s, including the invoice re-send — then nothing. Same
     unbounded-timeout failure shape, different locator: `rowAfter` was built while `page` was on
     `/admin/orders`, but by the time it was read again (deep in the final assertion block)
     `page` had since navigated to the detail page for the invoice re-send in step 1's fix.
     `rowAfter.textContent()` against a `<tr>` that no longer existed on the current page
     silently retried for the rest of the run, identical in shape to bug 1 — which is exactly why
     the `mark()` timings mattered: without them, "some step near the end is slow" and "a stale
     locator on the wrong page is hanging forever" are indistinguishable from the outside. Fixed
     by moving that read to the one point `page` is actually still on `/admin/orders` (right
     after the second CSV export, before the detail-page navigation for the invoice).
  3. **Run 4 — clean pass, both fixes in place.** 1/1 passing in **45.4s** end to end (login →
     real Flitt settlement → edit → both CSV exports → invoice re-send/Resend check → all
     assertions → cleanup) — confirming the earlier "needs 5+ minutes" assumption from runs 1–3
     was itself wrong; the scenario was always fast, those runs were burning their whole budget
     on one broken locator each, not genuine cumulative latency. `test.setTimeout` trimmed back
     down to a still-generous 200 000ms (not tuned to the literal 45s, in case network conditions
     vary).
  Every leftover order and the "Individual bookings" toggle from runs 1–3 were cleaned up by
  hand between attempts — via the real admin UI's delete action and the real Settings toggle,
  the same mechanism the spec's own `finally` block uses — each confirmed via a follow-up
  direct-SQL query before the next run started.
- **Cleanup:** the passing run's own `finally` block deleted the order via the normal admin UI
  and restored the "Individual bookings" toggle to its documented resting value (off), both
  independently confirmed via a follow-up direct-SQL query — zero `Order`/`Payment` rows
  matching the `ZZPaymentE2EEditAfterPay%` marker, `Tenant.paymentEnabledIndividuals = false`.

**Resume point:** Chunk 6 fully closed out. Chunk 7 (Idempotency, forged callback, tampered
amount) is next.

## Design spike (2026-09-25) — stress-testing the proposed bug #64 fix, not building it

**Not one of the numbered chunks above — a research spike** run to check five assumptions
behind the two-part fix design for `KnownBugs.md` #64 (lock price fields once `paidAt` is
set; charge a legitimate post-payment top-up as a second, independent `Payment` row against
the same order) before either part gets built. Nothing was fixed, no Playwright spec was
written. Every finding below is from live evidence against Staging Winery's dev DB — a
throwaway `npx tsx` script using the real `recordManualPayment`/`createCheckout`/
`settlePayment` functions and real signed Flitt callbacks, deleted after use, all rows
confirmed swept to zero afterward.

1. **`recordManualPayment` does silently swallow a second, legitimate payment — confirmed.**
   `hasLivePayment()` (`lib/payments/manualPayment.ts`) checks "does this order have *any*
   settled, non-reversed payment," not "does this specific charge already exist." Took a
   throwaway order through a 48000-tetri manual payment (`BANK_TRANSFER`), then called
   `recordManualPayment` again for a *different*, legitimate 24000-tetri top-up
   (`CASH`, "two more guests at the door"). Result: **still exactly 1 `Payment` row, still
   48000 tetri** — no error, no new row, the second payment vanishes with no trace anywhere.
   This is also what the existing "Paid" picker in the admin UI would do if used a second
   time on the same order — `changeBookingStatus`'s `kind: 'paid'` branch calls the same
   `recordManualPayment`, and `paidPatch` doesn't re-stamp `paidAt` either. **The manual side
   of the "second payment" design does not work today and needs `hasLivePayment` (or its
   caller) changed to reason about a specific charge, not "has this order ever been paid."**

2. **Adding an `OrderExtra` to an already-paid order succeeds today, completely unblocked —
   and immediately reprices `Order.totalPrice` with no gate of any kind.** The mechanism
   already exists (`app/actions/orderExtras.ts`'s `addOrderExtra`, wired to a real "Add
   extra" control in `OrderDetail.tsx`) — this is not a "needs to be built from scratch"
   gap. Live-verified: on an order with `paidAt` already set, adding a 24000-tetri
   `OrderExtra` row went straight through `recalcOrderTotal` and moved `Order.totalPrice`
   from 48000 to 72000 tetri, no different from adding one before payment. **This is the
   same bug #64 already documents (a stale `Payment.amount` vs. a moving `totalPrice`), just
   reachable through the extras path instead of the guest-count path** — and it means
   `addOrderExtra` itself needs new post-payment behaviour (route the extra's amount through
   the new second-`Payment` mechanism instead of silently folding it into `totalPrice`), not
   just "leave it alone because it's a separate action from `updateOrderEnhanced`."

3. **`startCheckout()` cannot literally be scripted outside a real Next.js request — and
   Flitt itself refuses a second checkout that reuses the same `order_id`, a real, previously
   unknown obstacle.** Calling `startCheckout()` from a plain script throws immediately
   (``headers` was called outside a request scope`) — not a design problem, since the real
   built feature would always run from an actual admin server action with real request
   context, but it means this one specific function can't be spike-tested by a bare script;
   the lower-level `createCheckout()` was used directly instead, which is what
   `startCheckout()` calls internally. **The real finding:** `createCheckout()` passes
   `input.orderId` straight through as Flitt's own `order_id` parameter — and Flitt's live
   test-merchant API **rejected a second checkout for the same order_id outright**, even
   though the order's own `payment_id`/status was irrelevant to the rejection:
   `Payment provider rejected the checkout: Duplicate order <id> for merchant 1549901`. This
   happened whether or not the first checkout had already settled — Flitt appears to treat
   `order_id` as a permanent unique reference per merchant, not "one in flight at a time."
   **`startCheckout()`/`createCheckout()` cannot be called a second time for the same order
   unchanged — it needs a distinct Flitt-facing `order_id` per checkout attempt** (nothing in
   our own schema stores Flitt's `order_id` anywhere — only `providerPaymentId`, which Flitt
   generates itself — so minting one, e.g. `${orderId}-2`, costs nothing structurally). Once
   that one change was made (retried with `${orderId}-extra1`), the rest of the round trip
   worked cleanly: a real second Flitt checkout, a real second signed `approved` callback via
   `settlePayment()`, a second genuine `Payment` row (`providerPaymentId` distinct, no
   `@@unique([provider, providerPaymentId])` collision), `status: 'approved'`, its own
   `settledAt`. The order's `stage` was manually advanced to `CONFIRMED` first (simulating an
   admin having moved the booking along before the door-charge arrived) specifically to test
   the `stage: 'NEW'` guard mentioned in the brief — **the guard turned out to be irrelevant
   to recording the second payment correctly**: `OrderEvent(PAID)` was written unconditionally
   both times (2 `PAID` events on the order's timeline after two settlements — a correct,
   if slightly more repetitive, record, not a bug), and the guarded `Order.paidAt`/
   `abandonedAt` write was skipped on the second settlement only because `paidAt` was already
   correctly set from the first — no misfire observed. **What the second-payment mechanism by
   itself does *not* do:** `Order.totalPrice` stayed at 48000 tetri throughout — nothing
   about creating or settling a second `Payment` row touches `totalPrice`. After both real
   Payment rows existed, the order genuinely collected 72000 tetri total while every
   totalPrice-reading surface still said 48000 — meaning the second-payment mechanism *must*
   be paired with something that also moves `totalPrice` (the `OrderExtra` path from finding
   2, deliberately, once it has its own post-payment handling) or the fix trades one
   discrepancy for a different one.

4. **A second real `Payment` row is genuinely invisible almost everywhere — with one
   concrete exception, found live.** Confirmed again: `OrdersTable.tsx`'s `PaymentMark` and
   the CSV export (`exportOrdersCsv`) both derive their "paid" indicator purely from
   `Order.paidAt`/`invoiceSentAt` — the CSV query doesn't even `include` `payments` — so
   neither surface changes at all with one settled payment or two. **The order detail page
   is the one place it does show, and it shows the wrong thing.**
   `app/admin/(panel)/orders/[id]/page.tsx` deliberately queries
   `payments: { where: { settledAt: { not: null }, reversedAt: null }, orderBy: { settledAt:
   'desc' }, take: 1, select: { method: true } }` — the comment says this is "the live
   (settled, not reversed) payment row, newest first in case a reversed one was ever replaced
   by a second," written before any code path could create a *second real, unreversed*
   payment. `OrderDetail.tsx`'s flow-line renders `"Paid · <method>"` from exactly that one
   row. On the two-payment order from finding 3, both settlements happened to be CARD (both
   went through Flitt), so the label itself did not visibly change in that run — this part
   is confirmed by reading the query and component in full, not by observing the label flip
   on screen. But the query's own behaviour is unambiguous: `take: 1` on `orderBy: {
   settledAt: 'desc' }` means whichever payment settled *most recently* is the only one ever
   read, with no aggregation and no "×2" of any kind. The moment a second payment settles
   with a *different* method than the first (the realistic case this whole design exists
   for — a card booking topped up with cash or a bank transfer at the door), the order detail
   page's "Paid · ___" label will silently flip from the method that paid the original,
   larger amount to the method that paid the smaller top-up, with nothing indicating there
   were two payments or two methods at all. Worth a targeted follow-up check (force two
   *different* methods and read the rendered label) before treating this as fully closed,
   but the code path leaves no other outcome possible.

5. **"Edit guest count" and "add an extra" are already two genuinely separate server
   actions today — confirmed by reading both in full.** `updateOrderEnhanced`
   (`app/actions/orders.ts`) only ever writes guest-count/split fields, `hotDish*`/
   `foodNotes`, `totalPrice`, and the three rate snapshots — it reads `order.extras` only to
   fold `extrasAmt` into its own total calculation, never creates/edits/deletes an
   `OrderExtra` row. `addOrderExtra`/`removeOrderExtra` (`app/actions/orderExtras.ts`) are a
   wholly separate file, separate exports, wired to a separate "Add extra" control in
   `OrderDetail.tsx`. **Locking `updateOrderEnhanced`'s price-affecting fields once `paidAt`
   is set is a clean, independent change that would not need to touch the extras action at
   all.** The remaining work is entirely on the extras side (finding 2 above): `addOrderExtra`
   itself has no post-payment behaviour yet and needs it, not a split that doesn't already
   exist.

**Net effect on the two-part design:** part 1 (lock price fields on `updateOrderEnhanced`
once paid) has no code-level obstacle — the action is already cleanly separable from extras.
Part 2 (second `Payment` row for a post-payment top-up) has three real, fixable obstacles
found here that the original design didn't anticipate: `hasLivePayment` blocks a second
manual payment outright, `createCheckout`/`startCheckout` need a distinct Flitt-facing
`order_id` per attempt, and `addOrderExtra` needs to stop unconditionally repricing
`totalPrice` once `paidAt` is set. None of these are large changes, but "`Order.payments` is
already one-to-many so this needs no migration" undersold how much of the actual blocking
logic (not the schema) still needs to change.

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
