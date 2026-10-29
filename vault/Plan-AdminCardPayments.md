---
tags: [plan, payments, flitt, orders, wine-orders, active]
---

# Plan — Card as a third way to pay, wherever an admin takes money (T-318, T-321)

> **How to use this plan.** Chunks are **strictly sequential** — do not start chunk N+1 until chunk N's
> Status is ✅ and its "Verify" list is ticked. Every chunk ends with a **Resume point**. Commit to
> **`staging` only**, one commit per chunk, message `T-318 chunk N: …` (Chunk 1: `T-321: …`).
> **Nothing to `master` or the production database without Max's explicit go for that step** (Rule 0).
> **Rule 12:** mockup + Max's decisions before any UI chunk; phone pass (375 px, EN + KA) on localhost
> before staging; release note with screenshots drafted with the merge. **Rule 13:** no unrequested extras.
> **Status: 📋 PLANNING (Max, 2026-10-29: "spend more time planning, scrutinising … intentional and
> targeted").** Nothing built. Open decisions in §3; the scenario walk-through in §4 is the test of the design.

**Tickets:** T-318 (feature) · T-321 (bug — wrong email, on production) · KnownBugs #96.
**Must-read before coding:** `saas/lib/payments/settle.ts` (its comments explain every guard),
`saas/lib/payments/topUpCheckout.ts`, `saas/lib/payments/manualPayment.ts`, `vault/MaintenanceNotes.md`,
`playwright/KNOWN-ISSUES.md`, `vault/Plan-PaymentE2ETesting.md` §1b (Flitt research: Pay by Link, refunds).

---

## 1. Status

| Chunk | What | Release | Status |
|---|---|---|---|
| 0 | Read-only baseline on production | — | ⏸ not now (Max, 2026-10-29) |
| 1 | T-321: stop the wrong "booking confirmed, paid in full" email + result-page wording | **R1** alone | ✅ **built + verified on localhost, on `staging` 2026-10-29 — NOT on production** (see §7 Chunk 1 "Result") |
| 2 | Settlement rules: card money marks Confirmed/Completed orders Paid; cancelled → flagged | R2 | ✅ **built + verified on localhost incl. browser + 375 px EN/KA (commits `b25edb8`, `1d4d420`, local, NOT pushed)** — Q-11 block + shared notice, Q-2 amber notice / no emails / reopen re-marks Paid (see §7 "R2 UI — results") |
| 2b | "Nothing to pay" state for 0 ₾ bookings (Q-12) | R2 | ✅ **built + verified (commit `251bc5b`, local, NOT pushed)** — fourth payment state, grey pill, filter + count, no Paid/Invoice step, CSV |
| 3 | Link basics: 7-day lifetime, Georgian checkout, "open link" awareness, reconcile window | R2 | ✅ **backend built + verified on localhost incl. the real Flitt test merchant (commit local, not pushed)** — the "open link" warning/"valid until" display is UI → Chunk 4/5 |
| 4 | Mockup of the third option (all pickers, desktop + phone, EN + KA) → Max decides | — | ✅ **mockup published; Max answered "as recommended" 2026-10-29** (Card style B; decisions 2–8 as shown); source in `vault/AdminCardPayments-Mockup/` |
| 5 | Shared "Card" step: link + QR + live "Paid ✓", in the booking order page picker | R3 | ✅ **built + verified end-to-end on localhost with a real payment on the Flitt test merchant (commit `cd4dfd6`, local)** |
| 6 | Same step in the other pickers: bookings list, phone card, Abandoned, wine orders | R3 | ✅ **built + verified in every host, wine incl. a real test-merchant payment (commit `b6c00bb`, local)** — the "already-paid booking that owes extras" link keeps its own panel (NOT moved into the popup, see below) |
| 7 | Verification: tier 5 Flitt staging, E2E 1–4, blind review, hand-over | — | 📋 |
| 8 | Production runbook (DRAFT — Max's go per step) + release notes | — | 📋 |
| — | **Not in this plan:** refunds (§5), part-payments/deposits (Q-1 B), charging any amount (§6) | — | 💡 |

---

## 2. What is true today (verified in code / Flitt docs, 2026-10-29)

**Where an admin can take money**

| Place | Bank / Cash | Card link + QR |
|---|---|---|
| Booking order page, unpaid — "How was this paid?" (`OrderDetail.tsx:1296-1313`) | ✅ | ❌ |
| Booking order page, paid but owes extras — Total card (`OrderDetail.tsx:2342-2448`) | ✅ | ✅ Copy / QR / Email |
| Bookings list + phone card (`OrdersTable.tsx:1375`), Abandoned (`AbandonedClient.tsx:87`) | ✅ | ❌ |
| Wine orders, unpaid (`WineOrdersClient.tsx:787, 1079, 1258`) | ✅ | ❌ |
| Wine order, paid but owes a delivery fee (`WineOrdersClient.tsx:375`) | ✅ | ✅ Copy / QR |
| Wine order, pickup (delivery block returns early, `:314`) | ✅ | ❌ |

**What each method does today**

| | Writes | Status | Emails |
|---|---|---|---|
| **Bank / Cash** in the picker (`changeBookingStatus`, `orders.ts:986-1055`) | a "manual" payment row for the **full total** (`:1030`), PAID event | Paid at once | **none** to anyone |
| **Guest's own card at booking** (public form → Flitt) | card payment row, settled by Flitt | Paid when Flitt confirms | guest: booking confirmation; winery: "New paid booking" |
| **Admin card link** (top-up on a paid order) | card payment row, settled by Flitt | already Paid | **same two emails as a new booking — wrong (T-321)** |

**Problems found**

| # | Problem | Reachable today? |
|---|---|---|
| P-1 | Admin card-link payment → guest "your booking is confirmed", Paid = **full total**; winery "New paid booking" (`settle.ts:325-371`; both Flitt routes call it on every settlement). | **Yes — production** (T-321) |
| P-1b | The guest's result page after any card payment says "your booking is confirmed. A confirmation has been sent to you" (`lib/t.ts:296`, KA `:589`; `app/(site)/payment/result/page.tsx`). For an admin link it's the wrong message; for a **wine order** it says "booking". | Yes |
| P-2 | Card money sets Paid only while stage is **New** (`settle.ts:253-262`). A Confirmed/Completed booking (the T-318 screenshot) or Confirmed/Delivered wine order would get the money recorded but stay **Unpaid** — the auto-Paid Max wants would not happen. | Rarely (guest checkout settling after an admin confirmed; the reconcile cron settles up to 7 days late) |
| P-3 | "Mark paid" writes nothing once any settled payment exists (`manualPayment.ts:68`). | Only with P-2 / part-payments |
| P-4 | Links expire after **10 h** (Flitt default `lifetime` 36000 s; max 69 120 000 s). We never set it. Flitt has **no way to cancel an unpaid link early** (docs: only `lifetime`; `cancel_url` is just a redirect). | Yes |
| P-5 | Checkout always English — no language passed (`startCheckout.ts:75`). Flitt supports `ka`. | Yes |
| P-6 | Two open links (or the guest's original 10-h booking checkout + an admin link, or a link + cash) can both be paid → overpaid, and the app has no refund (§5). | Yes, small |
| P-7 | "Mark paid" on a booking with no price yet records a **0 ₾** payment (`orders.ts:1030`, `totalPrice ?? 0`). | Yes — Max: block it (Q-11) |
| P-8 | The daily reconcile job (`app/api/cron/reconcile-payments/route.ts:70`) stops asking Flitt about a payment **7 days** after it was created. With 7-day links, a link paid on day 6–7 whose callbacks all failed would never be caught. | Becomes real with Q-4 |

---

## 3. Decisions

| # | Question | Answer / recommendation |
|---|---|---|
| Q-1 | Can the Card option ask for **less** than what's owed? | ✅ **Max, 2026-10-29: "card should work exactly like bank and cash"** — full amount owed, not editable. Deposits / part-paid = not in this plan. The existing top-up on an already-paid order keeps its editable amount (S-6). |
| Q-2 | Card money arrives on a **Cancelled** order (old link paid late). | ✅ **Max, 2026-10-29: OK** — record it, don't mark Paid, timeline note + warning "₾X received after cancellation — refund it in Flitt". |
| Q-3 | Where does Card sit? | ✅ **Max, 2026-10-29: the third option in "How was this paid?"; once paid it must switch to Paid automatically — "that's the whole point".** Consequences in §4 / Chunk 5: choosing Card does not mark Paid; it shows the link + QR and waits; Flitt's confirmation marks it Paid (needs P-2 fixed) and the open popup shows it within seconds. **P-2 must be fixed:** "just like cash or bank transfer, payment can come after service delivery — often days, weeks or months after, especially for wine orders" (Max). So Paid must work from any stage except Cancelled (Completed bookings, Delivered wine orders). A link paid months later is a new link made then — each link lives 7 days. |
| Q-4 | Link lifetime. | ✅ **Max, 2026-10-29: 7 days** ("valid until <date>" shown). |
| Q-6 | Emails after an admin card-link payment. | ✅ **Max, 2026-10-29: agreed — no emails**, same as Bank/Cash (which send none). Result page for these payments: "Payment received — thank you", without "confirmation sent". Receipts for all three methods = a possible later feature, not here. |
| Q-5 | A second link while one is open / Cash chosen while a link is open. | ✅ **Max, 2026-10-29: yes** — one open link per order (Card again shows the same link until it expires); Bank/Cash while a link is open warns that the link can still be paid until <date> and can't be cancelled. |
| Q-7 | Email button on wine-order links (none today). | ✅ **Max, 2026-10-29: leave it out for now** — wine popup = Copy + QR. Recorded as **T-322** (Backlog, idea) to decide later. The shared popup takes an "email allowed" flag so adding it later is small. |
| Q-8 | Checkout language. | ✅ **Max, 2026-10-29: yes** — the admin's current language, fallback the winery's default. |
| Q-9 | Wine order whose delivery fee is still "to be set". | ✅ **Max, 2026-10-29: yes to the recommendation:** Card does what Bank/Cash already do (`wineOrders.ts:80-81` records wines + fee, fee counted as 0 while unset → order Paid for the wines; when the fee is set later the existing T-8 "owes ₾X" + fee link collects it). The popup says "Delivery fee not set yet — this charges the wines only." Matches Q-1, the public form's own "pay for the wine now, fee later" setting, and reuses built code. |
| Q-10 | Refunds — in scope? | ✅ **Max, 2026-10-29: separate** (§5). Not in this plan; no ticket made yet. |
| Q-11 | "Mark paid" when the total is 0 ₾ or not set (P-7). | ✅ **Max, 2026-10-29: block it — "gotta be a mistake".** Applies to all three methods, bookings and wine orders, enforced on the server (not only a hidden button), with "Set the price first". |
| Q-12 | Follow-on from Q-11: can a booking be **genuinely** free (all guests Free, a partner visit)? If yes it could never be marked Paid and would sit in the "Unpaid" filter count forever (`orders/page.tsx:151-166`). | ✅ **Max, 2026-10-29: (b), "just in case"** — a booking whose total is set and is 0 ₾ shows **"Nothing to pay"**: not Paid, not Unpaid, not in either filter. Not set (null) is different: "Set the price first". Bookings only (a wine order always has priced wines; it just gets the Q-11 block). See Chunk 2b. |
| Q-13 | Follow-on from P-8: the reconcile job must keep asking Flitt for at least the link lifetime + margin. | Recommendation: 9 days (7 + 2). No decision needed unless Max objects. |

---

## 4. Scenario walk-through (the design must answer each one)

| # | Situation | What should happen | Depends on |
|---|---|---|---|
| S-1 | Unpaid booking, guest at the counter. Admin: status → Paid → **Card**. | Popup: amount (full owed), QR, Copy, Email, "Waiting for payment…". Guest scans, pays on phone. Within seconds the popup shows **Paid ✓ (card)**, pill turns Paid. Guest's phone: "Payment received". | P-2 fix, live check |
| S-2 | Admin copies the link into WhatsApp; guest pays 3 days later. | Order turns Paid by itself when Flitt confirms; timeline "Paid by card"; admin sees it next time the list/page loads. | P-2, 7-day lifetime |
| S-3 | Guest never pays. | Nothing changes; after 7 days the link is "expired"; Card again makes a new link. | lifetime |
| S-4 | Link made, then guest pays cash instead. Admin picks Cash. | Warning that the link can still be paid until <date>; Cash proceeds. If the guest pays the link too → S-5. | Q-5 |
| S-5 | Paid twice (link + cash, or two links). | Order shows a **credit** ₾X; refund happens in Flitt (§5). | §5 |
| S-6 | Already-paid booking, extras added later (owes 50). | Existing "Send card-payment link" (editable ≤ 50) stays; same popup component. | — |
| S-7 | Company booking, no price set yet. | None of the three methods allowed — "Set the price first" (Q-11). | Chunk 2 |
| S-14 | Wine order delivered in March, paid by card link in May. | Admin picks Card in May → new 7-day link → paid → order Paid while staying Delivered. | P-2 fix |
| S-8 | Cancelled booking. | No Card option. Old link paid late → recorded, not Paid, warning (Q-2). | Chunk 2 |
| S-9 | Abandoned booking (guest left the checkout at booking time). | Card offered; when paid it leaves Abandoned and is a normal Paid booking. The guest's original checkout may still be alive (≤ 10 h) → double-pay risk, small. | P-2, Q-5 |
| S-10 | Unpaid wine order, delivery / pickup. | Same Card step; amount = wines + fee. Fee "to be set" → Q-9: charges the wines, popup says so, fee collected later by the existing fee link. Popup: Copy + QR, no Email (Q-7, T-322). | Chunk 6 |
| S-15 | Booking where every guest is Free (total 0 ₾). | Pill "Nothing to pay"; no Paid step; not counted as Unpaid. | Chunk 2b |
| S-11 | Admin closes the popup before the guest pays. | Payment still marks the order Paid when it arrives; reopening Card shows the same open link (Q-5). | — |
| S-12 | Admin un-marks Paid on a card-paid order (mistake or refund). | **Today:** status Unpaid but the card money still counts → ledger and status disagree. Belongs to §5. | §5 |
| S-13 | Phone: admin on a 375-px phone shows the QR to a guest. | QR fits, readable, page behind locked; tap targets ≥ 40 px; Georgian text fits. | Chunk 4/5 |

---

## 5. Refunds — how they work today (answer to Max, 2026-10-29)

- **Bank / Cash:** the winery gives the money back outside the app, then un-marks Paid → the manual payment
  row is marked reversed (kept as history) and the order is Unpaid again. Works.
- **Card:** **the app has no refund at all.** The winery refunds in Flitt's merchant portal (Flitt supports
  full and partial refunds, also by API: `POST /api/reverse/order_id`). **The app never hears about it** —
  no code handles a Flitt reversal — so the order keeps showing Paid and the money keeps counting. If the
  admin un-marks Paid, the card row deliberately stays counted (`manualPayment.ts` reverses manual rows only)
  → the order says Unpaid while the ledger says paid (S-12).
- Options (separate ticket, money going **out**): (a) manual — refund in Flitt, then a "Refunded" action here
  that records it properly; (b) a Refund button that calls Flitt's API (needs a permission rule, amount
  limits, idempotency); (c) also listen for Flitt's reversal callback so portal refunds arrive by themselves.

## 6. Charging any amount not tied to an order — parked
Needs a new table (amount, description, payer, created by, link, status), a list screen, settlement +
receipt, history, a permission + limit, and an answer for Statistics. Own plan after T-318 is in use.
Workaround today: add an extra to a booking, then the card link.

---

## 7. Chunks

### Chunk 0 — Read-only baseline (Max's go for the production read)
Production + dev, SELECT only: settled `-topup-` booking payments (= wrong T-321 emails sent); orders with a
settled payment but `paidAt` null (P-2 cases); `-topup-` payments on cancelled orders; manual payments of
0 ₾ (P-7). Results in §8. Any repair is a separate, approved step.

### Chunk 1 — T-321 (Release R1, ships alone)
- `settlePayment` returns whether the payment came from an **admin link** (`flittOrderId` contains
  `-topup-`, the marker the wine page already reads). Nothing it writes changes.
- `sendSettlementEmail`: admin link → per Q-6 (recommended: no emails). Guest's own checkout → unchanged.
- Result page: the return route passes `kind=link` for admin links → "Payment received — thank you" (EN + KA,
  editable message keys like the existing ones). Wine-order wording on that page: ask before changing (Rule 13).
- **Verify:** script on dev settles a fake approved top-up callback (signature with the dev test key, like
  `scripts/test-settle-double-payment.ts`) → no booking confirmation queued; guest checkout path unchanged;
  tier-5 `payment-post-payment-extras.spec.ts` on staging. Review card on T-321.

**Result (2026-10-29) — scope narrowed by Max: BOOKINGS ONLY.** Max: "I want consistency and accuracy, focus on
booking only right now." The wine-order fee link (also `-topup-`) **keeps its receipt**: it is accurate (shows
what has really been paid, no winery alert), so removing it is not part of the bug. Whether wine links stay
silent too is decided with the wine Card step (Chunk 6) — it is a one-condition change (`adminLink && orderId`
in `sendSettlementEmail`).
- **Built:** `ADMIN_LINK_MARKER` + `isAdminLinkPayment()` in `lib/payments/topUpCheckout.ts` (one definition of
  the `-topup-` marker); `settlePayment` returns `adminLink` on every ok result (also `already-settled`);
  `sendSettlementEmail(…, adminLink)` returns early for a booking admin link; both Flitt routes pass it; the
  return route adds `&kind=link` (success + booking + admin link only); the result page shows the new body
  `payment.link_body` (EN "Thank you — your payment went through." / KA "გმადლობთ — გადახდა წარმატებით შესრულდა.",
  Claude's Georgian wording) under the usual "Payment received" heading; editable in Admin → Content → Messages as
  a 4th pill "Paid via a link we sent" (`onsite_payment_link_body`; labels in `lib/adminT.ts`). Files: `settle.ts`,
  `topUpCheckout.ts`, the two `app/api/payments/flitt/*/route.ts`, `app/(site)/payment/result/page.tsx`, `lib/t.ts`,
  `lib/adminT.ts`, `MessagesPanel.tsx`; new `scripts/test-settle-admin-link.ts`. No schema, no money maths, no public form.
  The reconcile cron settles without sending any email (unchanged, pre-existing).
- **Verified:** `tsc` clean. `scripts/test-settle-admin-link.ts --write --http=http://localhost:3100` on the dev
  DB: **16/16** — `adminLink` false for the guest checkout / true for a link / true again on a second delivery;
  guest checkout still attempts both mails, admin-link booking attempts none, wine fee link still attempts its
  receipt; real return route: `kind=link` only for an admin-link booking (also when the webhook settled first),
  nothing for guest checkout, declined link or wine link. No mail could leave (blank `RESEND_API_KEY` via a
  temporary `.env.development.local`, deleted afterwards; dev-server log showed exactly the two expected
  attempts). Regression: `test-settle-double-payment.ts` 11/11, `test-settle-wine-fee-topup.ts` 9/9. Result page
  checked on localhost EN + KA (text matrix for success / link / failed / pending / bogus `kind`, screenshots EN + KA).
- **Tier 5 on staging (real Flitt test merchant), 2026-10-29: ✅** `payment-post-payment-extras.spec.ts` 1/1
  (1.3 min) against `staging.vineworks.ge` at `ca808af`: two real settlements on one booking — the guest checkout,
  then a real card-link top-up. Resend send log for that window: settlement #1 → guest "booking … is confirmed" +
  winery "New booking" (as before); settlement #2 (the top-up) → **no email**; the only later send is the invoice
  the spec re-sends itself. (`payment-approved-settlement.spec.ts` not run separately — #1 above already covers
  the guest-checkout email path.)
- **Staging build failure on the first push (mine):** `160edbf` failed `next build` on Vercel (ERROR) — the app code
  compiled, but the type-check of the NEW script `scripts/test-settle-admin-link.ts` failed (narrowing of `secret`
  lost inside a function declaration). I had run `tsc` before writing the script and not after. Fixed in `ca808af`
  (deploy READY). **Lesson: run the full-project `tsc` as the LAST step before every push, after the final file is
  written; Vercel type-checks `scripts/` too.**
- **Not verified:** the Messages-tab pill (Admin → Content → Messages → "Paid via a link we sent") was not opened
  in a browser (admin login not used on localhost) — tsc only; Max can look at it on staging.
- **Resume point:** Chunk 1 is on `staging` only (`160edbf` + `ca808af`). Next: (a) Max tests T-321 on staging
  ("Waiting for me" on the ticket); (b) his explicit go before R1 goes to master. **Chunk 2 not started** — it
  rewrites the same `settle.ts`, so putting it on staging before R1 is tested would stop R1 shipping alone; start it
  only when Max says so.

### Chunk 2 — Settlement rules (R2)
- `settle.ts:253-262`: `stage: 'NEW'` → `stage: { not: 'CANCELLED' }`, keep `paidAt: null`. Setting `paidAt`
  never changes `stage`. Before changing: list every place the status pill / filters derive from stage +
  paidAt + invoiceSentAt and confirm a Completed + Paid booking displays right.
- Cancelled + approved → Q-2 handling. If that needs a new `OrderEventType` → migration → stop and ask.
- Server rules: on an unpaid order a link = the full amount owed (Q-1 A); none on cancelled orders; none
  without a total.
- `recordManualPayment`: record the remaining balance instead of nothing (P-3), so Bank/Cash after a partial
  or stray card payment comes out right.
- Q-11: `changeBookingStatus` (paid) and the wine-order equivalent refuse Paid when the total is 0 ₾ or not set
  ("Set the price first"); the pickers show the reason instead of failing silently. Q-12 decides the
  genuinely-free case first.
- **Verify:** script on dev: every stage × (unpaid / paid / cancelled) × booking / wine order → `paidAt`,
  events, `abandonedAt`, ledger sum as expected.

**Result (2026-10-29, evening) — backend done; two items held for Max.** Started after Max's "proceed".
- **Built (no schema, no migration):**
  - `lib/payments/settle.ts` — card money marks an order Paid from **any stage except CANCELLED** (was: only `NEW`);
    `paidAt: null` guard (#65) kept; a settlement on a CANCELLED order is recorded (Payment row settles) but the order
    is **not** marked Paid, and its `PAID` event payload carries `afterCancellation: true` (no new `OrderEventType`).
  - `lib/payments/manualPayment.ts` — `recordManualPayment` writes the **remaining balance** (`amount` = full amount due,
    minus every live payment) instead of nothing once any payment exists (P-3); zero when covered / over-covered /
    called twice; re-marking after an un-pay writes again. Side effect: a booking with no price no longer gets a 0 ₾ row
    (P-7 half; the Paid block itself is Q-11, held).
  - `lib/payments/topUpCheckout.ts` — server refusals before any Flitt call, bookings + wine: cancelled → "This order is
    cancelled, so it cannot take a payment."; no price / 0 ₾ → "Set the price first."; on an **unpaid** order the link
    must be the full amount owed (Q-1). The paid-order top-up (editable amount ≤ balance) is unchanged.
- **Verified:** full-project `tsc` clean (run after the script was written). `scripts/test-settle-stages.ts --write`
  **120/120** on the dev DB: every stage (NEW / CONFIRMED / COMPLETED-DELIVERED / CANCELLED) × (unpaid / already paid) ×
  (booking / wine) → settles, stage never moves, Paid only when it should be (never on CANCELLED, `paidAt` untouched when
  already paid), PAID event flagged only on CANCELLED, ledger = card money; abandoned booking that pays leaves Abandoned;
  the Mark-paid ledger cases for both kinds; the eight link refusals. Regression: `test-payment-ledger` 16/16,
  `test-settle-double-payment` 11/11, `test-settle-wine-fee-topup` 9/9, `test-settle-admin-link` 11/11. Dev backups taken by
  the hook before each write (`Downloads\DB_Backups\2026-10-29_170347_dev_auto-write-apply-flag` and earlier).
  Tiers 1–5 deliberately NOT run (Max: E2E only at the end; tier 5 in Chunk 7).
- **Found in the code — contradicts the plan, needs Max (Rule 12 → mockup):**
  1. **Q-2's "timeline note + warning" has no screen to land on.** `OrderEvent` rows are written but **nothing reads them**
     (checked: no `orderEvent.findMany` in `app/` or `lib/`; the order page's flow-line is built from stage dates, not
     events). The flag is recorded; a visible "₾X card money on a cancelled order — refund it in Flitt" needs new UI
     (derivable without events: a CANCELLED order with live card payments). → decide in the Chunk 4 mockup.
  2. **Q-11 "pickers show the reason" cannot work today.** All four callers of `changeBookingStatus` /
     `changeWineOrderStatus` (`OrdersTable.tsx:934`, `OrderDetail.tsx:862`, `WineOrdersClient.tsx:1607`,
     `AbandonedClient.tsx:169`) **ignore the returned `{ error }` and never undo their optimistic patch** — so a server
     block on 0 ₾ / no price would show "Paid" until the next refresh. **Held on purpose:** build the server block together
     with an error display + optimistic revert (4 files, phone pass, EN + KA) after Max decides how it should look. Also
     fixes the same silent failure for the errors that already exist ("Order not found", "Failed to update status").
- **Shipping note:** `staging` will carry R1 (T-321) and R2 together. R1 can still ship alone to `master` by cherry-picking
  `160edbf` + `ca808af` (never a plain merge of `staging`) — only on Max's explicit go.
- **Resume point:** Chunk 2 backend committed locally on `staging` as `T-318 chunk 2: …`, **not pushed** (keeps staging
  = R1 while Max tests T-321; it can be pushed any time, nothing in it is visible to users). Next: Max answers the two
  held items; then Chunk 2b (needs the "Nothing to pay" pill wording → mockup first, Rule 12), Chunk 3 (link lifetime /
  language / one open link / reconcile window — backend, can follow without UI), Chunk 4 mockup.

### Chunk 2b — "Nothing to pay" for 0 ₾ bookings (R2, Q-12)
- One payment state more in `lib/orderFilters.ts`: `paymentStateOf` returns `nothing` when `totalPrice === 0`
  (and not paid); `paymentFilterWhere('unpaid' | 'invoiced')` excludes `totalPrice: 0`. Everything that shows
  the payment pill or counts goes through these two (check: `OrdersTable.tsx`, `CalendarView.tsx`,
  `orders/page.tsx:151-166` counts — the comment "the three partition the total" becomes four).
- Pill label EN + KA ("Nothing to pay" / Georgian to be worded), no Paid step in the status menu for it.
- Check Statistics / CSV / invoice don't treat it as owed. A 0 ₾ booking that was already marked Paid in
  the past stays Paid (don't rewrite history).
- **Verify:** script + screenshots: 0 ₾, null, normal unpaid, paid — each in list, phone card, calendar,
  filters and counts.

### Chunk 3 — Link basics (R2)
- `createCheckout` sends `lifetime` 604 800 s (Q-4); check on the Flitt test merchant it is accepted.
- `lang` per Q-8.
- Reconcile job (`reconcile-payments/route.ts:70`): give-up window ≥ link lifetime + 2 days (Q-13).
- One open link per order (Q-5): a helper "open link for this order" (unsettled, `-topup-`, created within
  the lifetime) used by Card (reuse) and by Bank/Cash (warning). Fix the wine page's pending-link filter to
  ignore expired links.
- **Verify:** staging test merchant: Georgian checkout; reuse; expiry logic by script with a back-dated row.

**Result (2026-10-29, night) — backend done, no schema, no UI.**
- **Built:**
  - `lib/payments/flitt.ts` + `startCheckout.ts` — optional `lifetime` (seconds) passed to Flitt; the guest's own booking checkout sets none (stays 10 h).
  - `lib/payments/openLink.ts` (NEW, leaf module) — owns the `-topup-` marker + `isAdminLinkPayment` (moved here from `topUpCheckout.ts`, so
    settle / return route / wine page / this module share ONE definition), `ADMIN_LINK_LIFETIME_SECONDS` (7 d), `adminLinkExpiresAt`,
    `findOpenAdminLink` (newest unsettled, unreversed, `created`/`processing`, unexpired admin link of an order) and `reconcileCandidateWhere`.
  - `topUpCheckout.ts` — every admin link asks Flitt for 7 days and is minted as `…-topup-7d-<ts>-<rand>`; **the `7d` tag is how a link's lifetime is
    read back without a migration** — links made before this change have no tag and are treated as the 10-hour links they are (P-4). Checkout
    language = the tenant's `admin_language`, else `default_locale`, else English (Q-8; fixes P-5 for both admin actions in one place).
    **One open link per order (Q-5):** asking for the same amount again returns the open link (`reused: true`, `expiresAt`) instead of making a
    second; a different amount makes a new link (the old one stays payable — Flitt cannot cancel). Results now carry `expiresAt`.
  - `app/api/cron/reconcile-payments/route.ts` — window via `reconcileCandidateWhere`: guest checkouts 7 days, **admin links 9 days** (7 + 2, Q-13), nothing younger than 1 h.
  - `app/admin/(panel)/wine-orders/page.tsx` — the "link waiting" mark ignores expired links (was: any unsettled link ever).
- **Verified:** full-project `tsc` clean, ESLint clean on the touched files. `scripts/test-link-basics.ts --write --flitt` **19/19**: lifetime read back from references;
  open-link rules on back-dated rows (expired 7 d, 11-h-old old-style, settled, declined, guest checkout → none open; 2-h-old old-style open; in-flight counts;
  newest wins); same-amount reuse for a booking and a wine order with no second row; the reconcile window on six back-dated rows; **real Flitt test merchant:
  lifetime 604800 + `lang: ka` accepted**. Regression: `test-settle-stages` 120/120, `test-settle-admin-link` 11/11, `test-settle-double-payment` 11/11,
  `test-settle-wine-fee-topup` 9/9, `test-payment-ledger` 16/16, `test-topup-checkout` 3/3. Dev backups by the hook before each write.
- **Proved against Flitt itself (not just "accepted"):** (1) the checkout page opened in Georgian — checkout info says `"lang":"ka"`, page in ქართული;
  (2) Flitt exposes no expiry field and did NOT refuse a lifetime above its documented maximum (69 120 000 s) — so "accepted" proves nothing; therefore a
  60-second link and a default-lifetime control were created together, and after 80 s the 60-s link showed **"Declined — 1035 Token not found"** while the
  control still loaded: **Flitt honours `lifetime`**. The 7-day value itself can only be confirmed by waiting; the mechanism is proven.
- **Behaviour changes to know:** pressing "Send card-payment link" twice for the same amount now hands back the same link (before: a second link each time);
  existing (old-style) open links count as 10-hour links, so the wine "link waiting" mark disappears after 10 h for them.
- **Not done here (UI, Chunk 4/5):** showing "valid until <date>", the "a link is still open" warning on Bank/Cash, and the reuse wording.
- **Resume point:** Chunks 1 (on staging), 2 + 3 (backend, committed locally, not pushed). **Next: Chunk 4 — the mockup** (Card as the third option; the Card popup
  states; the cancelled-order warning (Q-2); the 0 ₾ / no-price error notice (Q-11); the "Nothing to pay" pill (Chunk 2b); the open-link warning; desktop + 375 px, EN + KA)
  for Max to decide before any UI is built (Rule 12). No further code until then.

### Chunk 4 — Mockup → Max decides
Desktop + 375 px, EN + KA: the picker with three options; the Card popup (amount, QR, Copy, Email,
"Waiting…", "valid until", "Paid ✓", open-link and expired states); the Cash-while-link-open warning;
where it appears in each of the six pickers. Max's decisions recorded in §3 before Chunk 5.

**Result (2026-10-29, late night) — mockup published, decisions pending.**
- **Where:** Artifact `https://claude.ai/artifact/JaEfD566pctq5M1Drdg2Ua` (private, Design canvas, 9 boards); **source files** in `vault/AdminCardPayments-Mockup/`
  (`canvas.json`, `mock.css`, one `.dc.html` per board) — to change it, edit those and re-publish to the same URL, do not rebuild. Linked on T-318, with one
  open question there (`tix ask`: Card button style A or B).
- **Boards:** 1 picker (today / A same green / **B outlined + hint, recommended**, EN + KA) · 2 Bank/Cash while a link is open (warning + "link open" pill mark) ·
  3 Card popup desktop (waiting / paid / already open / expired, EN + KA; wine variant with "fee not set", no Email) · 4 popup at 375 px (waiting + paid, EN + KA) ·
  5 cancelled-order notice (Q-2) · 6 "Set the price first" notice (Q-11) · 7 "Nothing to pay" (Chunk 2b) · 8 where Card appears (six pickers) · 9 decisions 1–8 with recommendations.
- **Look:** built from the real admin vocabulary read from the code (status-menu popup, green method buttons, `QrCodeDialog`, link panel buttons, adminT wording);
  placeholder QR (not scannable); sample names/amounts. Green is a slightly darker shade than the app's `#16a34a` so white text passes contrast — the build reuses the existing component colours.
- **Not done / honest limits:** the canvas was **not opened or rendered by me** (the Design type says not to verify unless asked) — layout may need a nudge. Phone sizes are drawn,
  not measured; the real 375 px pass (Rule 12.2) happens on the build. All Georgian is Claude's draft (decision 7).
- **Decisions waiting (board 9):** 1 Card style (A/B, rec. B) · 2 popup · 3 Bank/Cash warning · 4 cancelled notice · 5 price notice · 6 Nothing to pay · 7 Georgian wording ·
  8 release order (R1 T-321 → R2 settlement + notices + Nothing to pay + link basics → R3 Card everywhere).
- **Max's answers (2026-10-29, chat): "as recommended" — the whole board.** Card style **B** (outlined + hint); decisions 2–8 as shown; and the separate
  cancelled-order question (KnownBugs #98) also "as recommended" → **no emails** for card money on a cancelled order; the amber notice + a note carry it;
  **reopening re-marks Paid** when live money covers the total. Recorded on T-318 (both questions answered, one `decide`). Georgian wording stays Claude's draft until a native read.
- **(superseded — answered, see "R2 UI — results" below)** Resume point: wait for Max's answers; record them in §3 (and with `tix decide`); then build **R2 UI** (Chunk 2 Q-11 block with the shared notice, Q-2 notice, Chunk 2b) and,
  after R2, Chunk 5 / 6 (the Card step). No UI code before the answers.

### Blind test of Chunks 1–3 (2026-10-29) — a context-free subagent, fenced off from the vault / git / my tests
Verified manual dev backup first (`2026-10-29_173824_dev_blind-tester-chunks-2-3`, every checksum matched). The tester read the payment code cold, wrote its own throwaway scripts
against the DEV DB (3 scripts, 0 rows left, no Flitt or email calls), and reported. **Every claim below was checked against the code before being relied on.**
- **Found sound (proved by running):** signature → amount → currency gates before any write; 3 concurrent approved callbacks → one settle; replay and cross-payment replay safe;
  declined → processing → declined → approved settles; Delivered wine order gets `paidAt`, written once; the manual-ledger cases (first mark, again, un-pay, re-pay, partial card + mark paid
  writes exactly the rest, raised total writes the difference); 7-day link open at 6.99 d / closed at 7.01 d, legacy untagged link = 10 h, declined/expired not open; money in tetri end to end.
- **Real bugs in my Chunk 2/3 code — FIXED the same night** (`scripts/test-link-basics.ts` 30/30, `test-settle-stages.ts` 123/123, tsc + eslint clean):
  1. Flitt page language fallback was dead code (`settingValue` always returns the built-in `'en'` for `admin_language`) → now reads the STORED setting first (`pickCheckoutLocale`), then the winery default.
  2. "One open link": reuse only looked at the NEWEST open link, so A(5000), B(3000), ask 5000 again made a third link → `findOpenAdminLink(…, { amount })` finds any open link of that amount.
  3. `sendOrderTopUpCheckoutEmail` would email a link that was already paid, expired or on a cancelled order → `linkEmailRefusal` guard.
  4. `recordAdditionalPayment` / the wine twin accepted a Bank/Cash top-up on a CANCELLED order → refused (`CANCELLED_REFUSAL`, one wording).
- **Verified real, NOT changed — need Max (each is in the T-318 decision list or its own ticket):**
  - **Reconcile job sends no email** (pre-existing, on production) → KnownBugs #97 / **T-323**.
  - **Settlement on a CANCELLED order still emails the guest "booking confirmed" and the winery "New paid booking"**, and **reopening** such an order leaves it Unpaid with a full ledger
    (stage patches never touch `paidAt`) → KnownBugs #98; recommendation: skip those emails (the notice on board 5 + the flag carry it) and re-mark Paid on reopen when live payments cover the total.
  - **Admin-link payment on an ABANDONED booking sends no email** (the comment "confirmed when made" is wrong for it) — consistent with Q-6 / Bank-Cash-from-Abandoned (also silent); fine unless Max wants a confirmation there.
  - **Gateway refunds/reversals are never reflected; overpayment is silent; a different-amount link never retires an old one** — all already known and parked (§5, P-6); the proof sharpens why a refunds ticket should
    come before Card links become routine (Chunk 5): after a Flitt-portal refund → un-pay → re-mark cash, the cash is not recorded because the refunded card row still counts as live.
  - Minor, pre-existing: an `expired` gateway status is logged as PAYMENT_DECLINED; the return page shows `processing` as "failed"; the reconcile job only asks about `created` rows (documented in its header);
    two concurrent "Card" clicks can mint two links (no lock); `recordTopUpPayment` on an UNPAID order leaves `paidAt` null (screens only offer it when paid); "Mark paid" on an unpriced order is Q-11 (held).
- **Could not be determined by the tester:** whether Flitt keeps a declined checkout payable for retries; whether Flitt status responses are signed / keep the same `payment_id`; real concurrency of `startCheckout`.
- **Lesson:** the tester found 4 real defects in code I had just verified myself with my own tests — my tests encoded my own assumptions (e.g. "settingValue falls back to the winery default"). Worth repeating a blind pass after the UI chunks and before each production merge.

### Chunk 5 — The Card step, booking order page (R3)
- One shared client component (popup) built from `QrCodeDialog` + the existing link panel; the picker's
  third option opens it.
- **Live "Paid ✓":** while the popup is open it asks the server every ~3 s (a small read-only server action:
  "is this order paid yet, by which payment") and stops on Paid, close, or expiry; then refreshes the page.
- The pill shows that a card link is waiting (per mockup), like the existing "Invoice sent" mark.
- **Verify:** Rule 12.2 edge pass (S-1…S-13 that apply), phone pass, tier-5 staging payment with Flitt's test
  card → popup flips to Paid ✓ without a reload.

### Chunk 6 — The other pickers (R3)
Bookings list, phone card, Abandoned page, the three wine-order pickers: same component, no second copy of
the logic (MaintenanceNotes "phone and desktop halves"). Wine: amount = wines + fee; pickup included; Q-9.
**Verify:** each entry point, phone pass, one tier-5 wine payment.

### Chunk 7 — Verification
Tier 5 on staging; tiers 1–4 on localhost once at the end (KNOWN-ISSUES routine); a fresh blind review of
the diff (settlement + emails + live check); review cards; FeatureLog, MaintenanceNotes (the `-topup-` marker
now means "admin link" in settle, emails, result page, wine filter, open-link helper — change together),
SessionLog, Roadmap.

### Chunk 8 — Production runbook (DRAFT — Max's go per step)
R1 can ship alone after Max's staging test. R2 and R3 each their own merge. No migrations expected (re-check).
Each merge: automatic backups, merge + push, deploy READY, runtime errors, `tix live`, release-note draft on
the **production** board with screenshots and where the admin finds it.

---

## 8. Baseline results (Chunk 0)
_Not run yet._

### R2 UI — results (2026-10-29, after Max's "as recommended")

**Release R2 is now complete in `staging`-branch commits that are LOCAL ONLY (not pushed, nothing on production, no migration).** Commits: `b25edb8` (slice A), `1d4d420` (B), `251bc5b` (C), on top of `7297fcd`.

- **A — "Set the price first" (Q-11/Q-12, decision 5).** `lib/statusRefusal.ts` (rules + `StatusChangeResult`); `changeBookingStatus` / `changeWineOrderStatus` refuse *Paid* (bookings: no price → `NO_PRICE`, exactly 0 ₾ → `NOTHING_TO_PAY`, which also refuses *invoice sent*; wine: nothing priced → `NO_PRICE`) **before any write**, returning a `code`. One shared red dismissible `components/StatusChangeNotice.tsx` (+ `useStatusNotice`) in all four callers (OrdersTable, OrderDetail, WineOrdersClient, AbandonedClient): the optimistic patch is put back and the reason shown. This also fixes the old silent failures ("Order not found", "Failed to update status"). Names go in brackets so the Georgian needs no name inflection.
- **B — cancelled order (Q-2, Max "as recommended").** `sendSettlementEmail` is silent for a CANCELLED booking / wine order (no "booking confirmed", no "New paid booking", no wine receipt). Amber `CardMoneyOnCancelledNotice` on the booking page and the wine card, **derived** from live card payments (works for old orders; not in lists). **Reopening re-marks Paid** when live money covers the total (`liveMoneyCovers`, server, same transaction; never for abandoned rows); the action returns `reopenedPaid` so the three screens mirror it instead of drifting.
- **C — Nothing to pay (Chunk 2b, decision 6).** `PAYMENT_FILTERS` = paid / invoiced / unpaid / **nothing**; `paymentStateOf` + `paymentFilterWhere` are NULL-safe (`OR [null, > 0]`, because SQL `<> 0` drops NULL) and the four buckets partition; a 0 ₾ booking already marked Paid stays Paid. Grey ₾0 mark, phone chip, "Nothing to pay (n)" filter option, no Paid / Invoice step in the menu (list + order page), CSV payment column says "nothing to pay", super-admin type widened.
- **Verified.** Full `tsc` clean (run last). New scripts on the dev DB, rows deleted: `test-status-refusal` 15/15 (pure truth table), `test-cancelled-money --write` 16/16 (no mail on cancelled; controls DO send; liveMoneyCovers; PAID event flagged), `test-nothing-to-pay --write` 20/20 (pill + filters against the real DB incl. NULL totals). Regression: `test-settle-stages` 123/123, `test-settle-admin-link` 11/11, `test-link-basics` 30/30, `test-order-status` green. **Browser (localhost, dev DB, throwaway "ZZ R2" rows):** Mark paid on a no-price booking → server refused, flow-line snapped back, red notice, DB unchanged (0 payments, paidAt null); cancelled booking with 250 ₾ card money → amber notice; reopening it → "Paid · Card" and `paidAt` set in the DB; free booking → grey ₾0 mark, filter "Nothing to pay (1)", menu = Completed / Cancelled only; wine no-price → refused with the notice; cancelled wine card → amber notice. **Phone pass 375 px, EN + KA** (temporary scratch page, deleted): no horizontal overflow (page width 375), every Dismiss target 40 px tall, Georgian wraps cleanly. Dev server log: no errors.
- **Not verified / honest limits.** KA was checked on a scratch page, **not** by switching the winery's admin language (a shared tenant setting). The phone **orders list** (MobileOrderCard chip) was not opened at phone size, only the notice components were measured. All Georgian is Claude's draft (decision 7). The cancelled wine card's notice is dimmed along with the rest of the faded card.
- **Found, left alone (Rule 13):** "Send invoice" on the order page still emails a 0 ₾ invoice (the menu step is gone, the button is not); the wine phone *compact* card shows no notice (only the opened full card); Flitt refunds are still not reflected anywhere.
- **Resume point:** R2 is code-complete locally. Nothing is pushed: staging = R1 (T-321) while Max tests it. **Next (needs Max):** (a) when to push R2 to `staging` for him to test there, (b) R3 — Chunk 5 (Card step on the booking order page: popup, live "Paid ✓" polling, open-link warning, "valid until") then Chunk 6 (other pickers + wine), (c) T-323 (reconcile cron sends no email). Production steps only on his explicit go per step.

### R2 — blind review of the UI work + fixes (2026-10-29, same night)
A context-free reviewer (no vault, no git history, no DB) read the R2 code against a short behaviour spec. **Confirmed correct:** the refusal order (inside the transaction, before any write), the cancelled-order settle guard, email silence, reopen logic (abandoned-row guard, `paidAt` once), the four-bucket partition and every consumer of the payment state. **Real defects found and fixed** (commit after `ac2de43`): (1) no row lock — a settling card payment and an admin reopen / Mark-paid could interleave → `SELECT … FOR UPDATE` now in both status actions and in the settle transaction; (2) an optimistic revert restored the whole old row and could undo a LATER change → `lib/revertPatch.ts` puts back only the fields that change touched, and only if they still hold its value; (3) a thrown server action (expired session, dropped connection) left the optimistic patch with no notice → try/catch in all four callers; (4) a crafted `{kind:'paid', value:1}` skipped the refusal but still wrote Paid, an unknown `kind` cleared `abandonedAt` → `malformedChange` validates kind + boolean at runtime; (5) the "no email on a cancelled order" decision was made at send time → `settlePayment` now returns `afterCancellation`, decided inside the settling transaction under the row lock, and passed to the sender; (6) `NOT_FREE` now `not: 0` (negative totals stay in a bucket); a refusal notice is only cleared by a success on the SAME row; reopen-to-Paid now also writes a PAID event. **Left as is:** manual Paid is still allowed on a cancelled order (top-ups refuse it) — a separate decision; the reconcile cron sends no email (T-323). **Re-verified:** pure tests 23/23, `test-cancelled-money` 18/18, `test-nothing-to-pay` 20/20, `test-settle-stages` 123/123, admin-link 11/11, link-basics 30/30, double-payment 11/11, wine-fee-topup 9/9, ledger 16/16, `tsc` clean; browser: reopen → Paid + PAID event with `reopenedAfterCancellation`, no-price refusal → snap-back + notice.

### R3 — Chunks 5 + 6 results (2026-10-29, night) — built and verified on localhost; commits local, NOT pushed

**What exists now.** "How was this paid?" has a third, outlined option **Card — "Guest pays now — link or QR"** (mockup option B) in every place an admin takes money. It makes (or re-opens) a card link for the **full amount still owed** (server-computed: total − live settled payments; wine = wines + fee, fee "to be set" counts as 0 and the popup says "this charges the wines only"), shows it in one shared popup (QR, Copy, Email, Open, "valid until <Tbilisi time>"), polls every 3 s while the tab is visible and flips to **"Paid by card — ₾X received. The booking is now marked Paid."** by itself when Flitt confirms; the page behind updates without a reload. Closing the popup cancels nothing. **Bank / Cash while a link is open** asks the server first and warns ("a card link for ₾X is still open until … charged twice — a link can't be cancelled"; **Record cash anyway** / **Card: show the open link again** / Back); if the guest already paid, nothing is recorded. The booking page shows a **"Card link open · until 5 Nov"** mark beside the status pill.
- **Server (no schema):** `startOrderCardPayment`, `getOrderCardState` (orders.ts); `startWineOrderCardPayment`, `getWineOrderCardState` (wineOrders.ts). Refusals before any Flitt call: already paid, cancelled, no price / 0 ₾, nothing left to collect; reuse of an open link for the same amount (Chunk 3 helper).
- **Shared UI — one copy each:** `components/PaymentMethodChoices.tsx` (the picker + warning), `PaymentMethodDialog.tsx` (the same picker as a dialog), `CardPaymentFor.tsx` (popup wired to a booking or wine order; one in-flight start request), `CardPaymentPopup.tsx`, `lib/formatLinkMoment.ts`. Hosts: booking order page + bookings list (picker inline in their menus — the list's desktop menu and phone pill are the same one), **Abandoned** and **all three wine views** (their old inline button strips had no room for the warning → they open the dialog; the strips were deleted). **Deviation from the board to tell Max:** wine and Abandoned now open a small dialog for "How was this paid?" instead of an inline strip.
- **Verified (localhost, dev DB, throwaway "ZZ R2" rows, Flitt TEST merchant, sandbox card, a Playwright script played the guest):** booking order page, bookings list, wine order (fee not set → 300 ₾ "wines only" note, no Email), Abandoned booking — each: choose Card → popup → guest pays → popup flips to Paid → the screen behind shows Paid; DB: payment `approved`/`CARD`, `paidAt` set, stage untouched. Bank/Cash warning on the booking page and the wine dialog; "Card — show the open link again" reuses the same link (one payment row). **Phone 375 px** (booking page popup + warning, Abandoned dialog; EN real, KA + wine variant via a temporary scratch page): no horizontal overflow, popup/dialog inside the viewport, every tap target ≥ 40 px (three 36 px buttons raised to 40). Pure tests: `test-link-moment` 6/6. Full `tsc` clean.
- **Found and fixed while testing:** (1) React's development double-mount asked for the link twice, the second reply came back "already open" → the start request is shared in flight; (2) the list's local mirror lacked the received money → a stray "balance due" ⚠ after a card payment → `markPaidLocally` sets `paymentsSettledTotal`; (3) the browser's Georgian locale data may be missing → Georgian month names are now from a table; (4) a leftover service worker from an unrelated project on `localhost:3000` served stale scripts in the test pane (unregistered there; not a code issue); (5) polling pauses in a hidden tab by design and now also fires the moment the tab becomes visible.
- **Honest limits / not done:** wine admin-link payments still send the wine **receipt** email (decided for wine in T-321 scope; the result page for them has no "link" wording either) — revisit with T-322; the "already-paid booking that owes extras" link panel and the paid-wine fee link are **unchanged and not moved into the popup** (that was a nice-to-have on board 8; they work today) — say so if Max wants them moved; the bookings list shows no "link open" mark per row (only the order page does; the warning covers the list); the **expired** popup state and the "Make a new link" button were exercised in Georgian on the scratch page only, not waited out for 7 days; Email button not clicked (dev server is mail-proof); Georgian wording is Claude's draft.
- **Resume point:** blind review of R3 running (result below when in); then push R3 to `staging` for Max to test, then Chunk 7 (tier-5 suite + tiers 1–4 once at the end, MaintenanceNotes) and Chunk 8 (production runbook + release notes — each step only on Max's explicit go). Nothing on production.

### R3 — blind review of the Card step + what was done with it (2026-10-29, after midnight)
A context-free reviewer (no vault / git history / DB) read Chunks 5–6 against a short behaviour spec. **Confirmed correct:** every action calls `requireAdmin()` and scopes by tenant; the amount is never client-supplied (server re-reads and requires the exact balance); all refusals; wine fee "to be set" = 0; reuse keyed by exact amount; settle verifies signature/amount, is idempotent and does not mark a cancelled order Paid; popup unmount/once-only-paid guards; Tbilisi dates.
**Fixed (commit after `b6c00bb`):** (1) a **stale admin link** (price changed after the link was made — an extra, a removed guest, a fee set later) could mark an order Paid with money still owed → `settle.ts`: an ADMIN link marks the order Paid only when the live ledger now covers the total, otherwise the payment is recorded and the order keeps a balance that Bank / Cash / a new link complete (`test-link-coverage` 8/8; all settlement regressions unchanged); (2) the picker **failed open** — if the open-link check errored, or the admin had already cancelled the picker, it still recorded the cash → now fail-closed with a message ("couldn't check … nothing was recorded") and nothing is recorded after the picker is gone; (3) popup: overlapping polls, a failed start replayed to "Make a new link", an unhandled rejection, and no last paid-check when the popup is closed (a payment in the last seconds now still updates the page behind); (4) **phone**: the bookings-list menu was sized for the old two-button picker (180 px wide, 170 px tall) → now 260 × 290, clamped inside the screen, scrolls if taller — measured at 375 px: picker and open-link warning both fit, all targets 40 px.
**Parked on purpose (need Max / separate ticket, nothing silently dropped):** (a) **server-side** Bank / Cash is not blocked while a card link is open — only the picker warns (a hard block would break "Record cash anyway"); an overpayment after that is silent (same family as "Flitt refunds / overpayment aren't reflected", parked since Chunk 1); (b) two admins pressing Card at the same instant can still mint two links (no lock around "find open link → Flitt → insert"; a Flitt call inside a DB lock is a design decision); (c) the popup says "Paid by card" for any paid state, so if another admin records cash while it is open it would be worded wrong; (d) a popup left open on an order that is cancelled meanwhile keeps polling until the link expires; the "link open" mark on the order page does not clear on expiry without a reload; (e) reviewer's unverifiable points: whether Flitt lets a guest retry a *declined* link (then it is payable but looks closed), and whether the guest's own 10-h checkout on an abandoned order can still be paid next to an admin link; (f) emailing a live link for an order already marked Paid by cash is still allowed (the paid-order extras flow legitimately emails links for paid orders, so it cannot be refused on `paidAt`).
