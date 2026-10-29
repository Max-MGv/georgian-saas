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
| 2 | Settlement rules: card money marks Confirmed/Completed orders Paid; cancelled → flagged | R2 | 📋 |
| 2b | "Nothing to pay" state for 0 ₾ bookings (Q-12) | R2 | 📋 |
| 3 | Link basics: 7-day lifetime, Georgian checkout, "open link" awareness, reconcile window | R2 | 📋 |
| 4 | Mockup of the third option (all pickers, desktop + phone, EN + KA) → Max decides | — | 📋 |
| 5 | Shared "Card" step: link + QR + live "Paid ✓", in the booking order page picker | R3 | 📋 |
| 6 | Same step in the other pickers: bookings list, phone card, Abandoned, wine orders | R3 | 📋 |
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
- **Not verified:** the Messages-tab pill was not opened in a browser (admin login not used on localhost) — tsc only;
  tier 5 on staging — see Resume point.
- **Resume point:** Chunk 1 is on `staging` only. Next: (a) tier 5 against staging once its deploy is READY
  (`payment-post-payment-extras.spec.ts` + `payment-approved-settlement.spec.ts`, Resend log shows no booking
  mail for the top-up); (b) Max tests T-321 on staging ("Waiting for me"); (c) his explicit go before R1 goes to
  master. **Do not start Chunk 2** until Max says so.

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

### Chunk 4 — Mockup → Max decides
Desktop + 375 px, EN + KA: the picker with three options; the Card popup (amount, QR, Copy, Email,
"Waiting…", "valid until", "Paid ✓", open-link and expired states); the Cash-while-link-open warning;
where it appears in each of the six pickers. Max's decisions recorded in §3 before Chunk 5.

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
