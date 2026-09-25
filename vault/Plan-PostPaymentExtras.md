---
tags: [plan, payments, orders]
---

# Plan — Post-Payment Extras (charge more after an order is closed, without lying about money)

> **This is the live task tracker for this work.** Update the checkboxes and each chunk's
> Status line as work happens. **Chunks are strictly sequential — do not start chunk N+1
> until chunk N's Status is ✅.** If a session ends mid-chunk, that chunk's "Resume point"
> line says exactly where to pick up.

Started 2026-09-25, directly out of `KnownBugs.md` #64 and the design spike logged in
`vault/Plan-PaymentE2ETesting.md` (search that file for "Design spike (2026-09-25)" for the
full, detailed evidence behind every claim below — this document summarizes it, doesn't
repeat it verbatim).

## Business need

An admin needs to charge a guest more *after* their order has already been paid — the
ordinary real-world case is two extra guests joining at the door and paying the difference.
Today this is handled by editing the paid order's guest count directly, which silently moves
the displayed total (`Order.totalPrice`) without touching the amount actually charged
(`Payment.amount`) — every screen an admin or guest could look at (orders table, order
detail, CSV export, a re-sent invoice) ends up agreeing with *itself* but not with what the
gateway actually processed, with nothing anywhere to notice the gap. That's `KnownBugs.md`
#64. This plan replaces that silent edit with a deliberate, visible flow: lock the original
paid amount as a historical fact, let the admin describe what changed as a new charge, and
collect payment for *just that charge* — by card (the guest may only have a card, not cash)
or manually (cash/bank transfer) — without ever touching the original payment record.

## What's already confirmed true — read before building anything

A stress-test spike (not a build) already checked five assumptions this design depends on,
against real Flitt settlements on Staging Winery's dev tenant. Full evidence is in
`vault/Plan-PaymentE2ETesting.md`'s "Design spike (2026-09-25)" section. Short version:

1. **The existing "record a manual payment" function silently swallows a second payment.**
   `hasLivePayment()` in `saas/lib/payments/manualPayment.ts` checks "does this order have
   *any* settled payment," not "does this specific charge exist yet" — so calling it a second
   time for a genuine top-up does nothing at all: no error, no new row. This needs a new,
   separate code path, not a patch to the existing guard (which correctly protects its
   original, different purpose — don't weaken it).
2. **Adding an `OrderExtra` to an already-paid order already works today, completely
   unblocked** (`saas/app/actions/orderExtras.ts`'s `addOrderExtra`) — and it already
   reprices `Order.totalPrice` immediately, with zero payment attached. This is bug #64's
   exact failure mode, reachable through a second door. Locking `updateOrderEnhanced` alone
   (guest count edits) does **not** close this bug — extras need the same treatment.
3. **Flitt itself refuses to let a second checkout reuse the same `order_id`** — confirmed
   live: `Payment provider rejected the checkout: Duplicate order <id> for merchant 1549901`,
   regardless of the first payment's settlement state. Flitt's `order_id` is a permanent,
   per-merchant-unique reference, not "one in flight at a time." `createCheckout()`
   (`saas/lib/payments/flitt.ts`) currently passes `input.orderId` straight through as both
   Flitt's reference *and* our own `Payment.orderId` — these need to be decoupled: mint a
   fresh string for Flitt each time (nothing in our schema stores Flitt's `order_id`
   anywhere, only the `providerPaymentId` Flitt generates back — so this costs nothing
   structurally), while `Payment.orderId` always carries the real internal order id. Once
   decoupled, a second real checkout, a second real signed callback, and a second genuine
   `Payment` row all worked correctly and cleanly — `settle.ts`'s per-payment atomic
   settlement logic (already hardened earlier the same day, see that plan's "Incident and
   fix" section) needed zero changes to handle this; it was never order-scoped to begin with.
4. **A second payment is invisible almost everywhere except one place — where it's actively
   wrong.** The admin orders table and the CSV export derive "paid" purely from
   `Order.paidAt`, unaffected by how many `Payment` rows exist. But
   `app/admin/(panel)/orders/[id]/page.tsx` queries only the single *most recently settled*
   payment (`orderBy: { settledAt: 'desc' }, take: 1`) to render `OrderDetail.tsx`'s
   "Paid · <method>" label. The moment a second payment settles with a *different* method
   than the first (a card booking topped up with cash — the exact realistic case this plan
   exists for), that label will silently flip to the top-up's method, misrepresenting how the
   original, larger amount was actually paid. Not yet confirmed with two genuinely different
   methods in the same run (the spike's second payment happened to also be CARD) — confirm
   this for real as part of Chunk 5, don't just trust the code read.
5. **Guest-count edits and extras are genuinely separate code paths** (`updateOrderEnhanced`
   never touches `OrderExtra`) — locking one doesn't entangle with the other, so Chunks 1 and
   2 below can be built and tested independently.

## The agreed design

- **Once `Order.paidAt` is set, price-affecting fields on the order itself become
  read-only**: guest count, the tasting/lunch split, rate fields, hot-dish selections.
  Nothing about the *original, already-collected* amount can be edited after the fact.
- **Adding an extra stays allowed** — it's the legitimate way to describe what changed
  ("2 additional guests," with a comment). `Order.totalPrice` **still updates immediately**
  when an extra is added, even post-payment — consistent with how `totalPrice` already
  behaves everywhere else in this app (it's always "what this order costs," not "what's been
  collected so far"). The gap between total and collected becomes a visible **balance due**
  (`totalPrice` − sum of settled, non-reversed `Payment.amount` for the order), shown
  wherever the total is shown once it's nonzero — never a silent disagreement.
- **Collecting the balance is a deliberate, separate action**, with two options, both writing
  a **second, independent `Payment` row** tied to the same order (never editing the first):
  - **Manual** (cash/bank transfer) — a new function, not a patch to `hasLivePayment`.
  - **Card, by link** — the admin generates a real Flitt checkout for just the outstanding
    amount and it's emailed to the guest, so they can pay with their own card without the
    admin ever handling it. This is this app's own minimal version of Flitt's "Pay by Link"
    product (which turned out not to be usable via API — see `Plan-PaymentE2ETesting.md`
    §1b) built from pieces already proven to work.
- **This does not go through `shouldTakePayment()`'s toggles/overrides** — those govern
  whether a *guest's own booking* gets a payment step; a top-up is the admin's own deliberate
  choice, made after the fact, independent of what the tenant's general booking-form settings
  say.
- **The order detail page gets a minimal, real multi-payment view** — every `Payment` row for
  the order, not just the newest one — closing finding 4 above and giving the admin actual
  visibility into partial/multi-payment orders for the first time anywhere in this app.

## Alternatives considered and rejected

- **Refund the original payment and re-charge the full new total as one payment.** Rejected:
  turns one small incremental charge into a real refund plus a full fresh charge — two
  transactions on the guest's card statement instead of one, worse for reconciliation, and
  depends on the refund-handling this app doesn't have (`KnownBugs.md` #61's neighboring gap).
- **Create a second, separate order for the addition.** Rejected: fragments one visit into
  two records, complicating invoicing and history for no real benefit.

---

## Current status

| Chunk | What | Status |
|---|---|---|
| **1** | Lock price-affecting order fields once `paidAt` is set | ✅ Done |
| **2** | Decouple `addOrderExtra` from a free total bump; add computed balance-due | ✅ Done |
| **3** | New function for a genuine additional manual payment (don't touch `hasLivePayment`) | ⬜ Not started |
| **4** | Card-link top-up: decouple Flitt's `order_id`, new admin action, email delivery | ⬜ Not started |
| **5** | Fix the order-detail page's multi-payment display (finding 4) | ⬜ Not started |
| **6** | End-to-end Playwright regression, extending `saas/tests/tier5-payment-e2e/` | ⬜ Not started |
| **7** | Docs: close out `KnownBugs.md` #64, `FeatureLog.md`, `Roadmap.md` | ⬜ Not started |

Status values: ⬜ Not started · 🚧 In progress · ✅ Done · ⏸ Paused

**Resume point:** Chunk 2 done and verified live on `staging.vineworks.ge`, commit `763a2f1`.
Chunk 3 next (a real second manual payment).

---

## Ground rules for every chunk

1. **Never weaken `hasLivePayment`/`recordManualPayment`'s existing guard.** It correctly
   protects its own original purpose (don't double-record the *same* payment). Build a new,
   separate function for "record an additional, genuinely different payment" instead.
2. **`Order.totalPrice` moves immediately when an extra is added; `Payment.amount` never
   moves once written.** The balance-due is a *computed* value (`totalPrice` − sum of settled
   payments), not a new stored column — don't add one unless a real performance reason shows
   up later.
3. **Dev DB only** — Staging Winery (`cmrxb85wo0000vlc0d964nzf8`), never `master`/production,
   per `vault/ClaudeInstructions.md` Rule 0. This tenant permanently runs Flitt's public test
   merchant (`1549901`/`test`) — see `Plan-PaymentE2ETesting.md` Ground Rule 1. Never touch
   the production Supabase project (`dshsfkffcsgerdqinqst`).
4. **Every checkout attempt needs its own Flitt-facing reference string**, distinct from any
   prior attempt for the same order — Flitt rejects a reused one outright (finding 3).
   `Payment.orderId` always carries the real internal order id regardless of what string was
   sent to Flitt.
5. **A top-up is an admin-initiated action and does not consult `shouldTakePayment()`** — no
   module toggle, no section toggle, no company override applies to it.
6. **Follow `playwright/ARCHITECTURE.md`'s conventions** for Chunk 6's test work — one
   `.spec.ts` per scenario, a matching `playwright/notes/NN-name.md`, cleanup regardless of
   pass/fail, `credentials.ts`-style secret handling.
7. **Confirm before editing app code**, per `vault/ClaudeInstructions.md` Rule 8 — each chunk
   below is app-code work, not research; get a clear go-ahead per chunk rather than assuming
   this plan alone authorizes all of it in one pass.

---

## Chunk 1 — Lock price-affecting fields once paid

**Goal:** close bug #64's original path.
**Status:** ✅ Done, 2026-09-25. Commit `f2149e7` on `staging`.

- In `updateOrderEnhanced` (`saas/app/actions/orders.ts`), reject changes to guest count, the
  tasting/lunch split, rate fields, and hot-dish selections when `Order.paidAt` is not null.
  Decide server-side rejection shape (silently ignore the changed fields vs. return an error)
  — erring toward an explicit error is probably right, so the UI can explain why.
- In the admin UI (order detail's edit form), show these fields as disabled/read-only once
  paid, with a short explanation pointing at "add an extra" as the alternative.
- Verify: attempt an edit via the UI and via a direct action call on a paid order; confirm
  both are correctly blocked, and that a *matching* wine-order flow (if one exists — check)
  gets the same treatment or is confirmed out of scope.

### Result (2026-09-25)

**What was built.** `updateOrderEnhanced` now checks `order.paidAt` immediately after fetching
the order, before any of its pricing/repricing logic runs, and returns
`{ error: '...' }` unconditionally when the order is already paid — every field this
function's `data` parameter accepts (`guestCount`, `tastingGuestCount`/`lunchGuestCount`/
`freeGuestCount`, `hotDishVegetable`/`hotDishMeat`, `foodNotes`, `manualTastingRate`/
`manualLunchRate`) is one of the fields the plan says to lock, so there is nothing left for
this action to safely do once paid — an unconditional reject is the correct, simplest
interpretation, not a partial field-by-field diff. The error text is written for an admin to
read directly (Rule 2 spirit): it names what's locked and points at "add an extra" as the
alternative. In `OrderDetail.tsx`, a new `isPaid` flag (`order.paidAt != null`) disables the
party-size input, the three split inputs, the "Edit rates" button and both manual rate inputs,
both hot-dish selects, the food-notes textarea, and the Save button itself, and a yellow note
("This order is already paid…") renders at the top of the Guest Breakdown & Dishes card. Two
new i18n keys (`orderDetail.guestBreakdown.lockedTitle`/`lockedDetail`) added in both `en` and
`ka`, parity confirmed by `scripts/check-i18n-parity.ts` (1117/1117 both languages).

**Wine orders confirmed out of scope.** Read `saas/app/actions/wineOrders.ts` in full: it
exports only `changeWineOrderStatus` (stage/paid toggles, no price fields) and
`createWineOrderAdmin` (creation only). There is no action anywhere that edits an existing wine
order's line items or price after creation, so there is nothing to lock on that side — matches
the prior session's read.

**Verification — done live on `staging.vineworks.ge` against the dev DB, not just read from
code:**
1. `npx tsc --noEmit` clean before and after.
2. Created a throwaway individual order on Staging Winery (`cmugvom6j0000jy04hblzs97a`,
   "ZZChunk1Test PostPaymentLock", 4 guests × ₾100 tasting rate = ₾400).
3. **Unpaid regression check, real UI:** edited party size 4 → 5 through the actual admin
   detail page while unpaid — "Saved ✓", total recalculated live to ₾500 once the tasting
   split was populated, confirming ordinary edits are completely unaffected by this change.
4. Marked the order Paid · Bank transfer through the real status-picker UI (the manual-payment
   flow bug #62 already fixed), which wrote a real `Payment` row (`amount: 40000` tetri,
   `status: 'recorded'`, `settledAt` set) and `Order.paidAt`.
5. **UI lock confirmed by direct DOM inspection, not a screenshot guess:** after the deploy
   landed on staging, a JS check of every input/select/textarea/button inside the Guest
   Breakdown card confirmed all 9 are `disabled: true`, and the yellow lock note is present.
6. **Server-side rejection confirmed with a real request, not a script standing in for one.**
   Attempting to defeat the *client-side* disabled state by flipping the raw DOM `disabled`
   attribute and dispatching clicks did **not** work — discovered live that React's own event
   system tracks `disabled` from its last committed render (not the live DOM attribute) and
   refuses to dispatch synthetic click handlers to an element it believes is disabled, an
   extra layer of protection beyond styling that wasn't specifically designed for but is a
   welcome side effect. Worked around this for a true test by reading the button's real
   `onClick` handler off its React fiber props (`element[reactPropsKey].onClick`) and invoking
   it directly with the party size and tasting-guest count changed to 123/77 — this runs the
   exact same `handleSave()` a genuinely-enabled button would, through the real authenticated
   session, hitting the real deployed server. **Server response, captured via a `fetch`
   interceptor:** `{"error":"This order has already been paid, so its guest count,
   tasting/lunch split, rates, and food details are locked — changing them here would silently
   disagree with the amount already charged to the guest. To bill for something that changed
   (e.g. extra guests joining after payment), add it as an extra on this order instead."}` —
   the exact string written into `orders.ts`. The UI's `saveMsg` rendered this same text.
7. **Independent DB read after the rejected attempt** (direct Prisma query against the dev
   project, not the action's return value): `guestCount` still `5` (not `123`),
   `tastingGuestCount` still `0` (not `77`), `totalPrice` still `40000`, and the `Payment` row
   completely untouched (`amount: 40000`, `status: 'recorded'`, same `settledAt`) — proving the
   reject happened before any write, not just that the response said so.
8. **Cleanup:** deleted the throwaway order's 2 `OrderEvent` rows, 1 `Payment` row, and the
   `Order` row itself; a follow-up query confirmed all three gone. Throwaway scripts
   (`scripts/_tmp-check-chunk1-order.ts`, `scripts/_tmp-cleanup-chunk1-order.ts`) were deleted
   from disk, never committed.

**Deviation from the plan worth recording:** the plan's own verification bullet says "attempt
an edit via... a direct action call" as if that's a simple standalone-script affair. In
practice `updateOrderEnhanced` depends on `next/headers` (`getTenantId`) and a real Supabase
auth cookie (`requireAdmin`), both of which only exist inside a live Next.js request — a bare
`npx tsx` script cannot construct that context. The real equivalent that still proves the
server (not just the UI) enforces the lock turned out to be invoking the action through the
live browser session while bypassing React's own click-dispatch gate, as described above. Future
chunks that want a "call the action directly" check should expect the same constraint.

## Chunk 2 — Extras become visible balance, not silent repricing

**Goal:** close bug #64's second path (finding 2), and introduce the balance-due concept.
**Status:** ✅ Done, 2026-09-25. Commit `763a2f1` on `staging`.

- `addOrderExtra` keeps updating `Order.totalPrice` immediately (per the agreed design) —
  no change needed there structurally.
- Add a computed "balance due" wherever the total is shown once nonzero: order detail page,
  and decide whether the admin orders table needs it too (a small badge/indicator) or whether
  that's over-scoping this chunk.
- Verify live: add an extra to a paid order, confirm the balance-due appears with the correct
  amount, confirm nothing else in the app silently treats the order as "fully collected" when
  it isn't (re-check CSV export and invoice content for anything that needs the same
  treatment).

### Result (2026-09-25)

**What was built.** A single new helper, `balanceDue(totalPrice, settledPaid)` in
`lib/money.ts`, computes `totalPrice − settledPaid` and returns it branded as `Tetri`. It does
no DB reads itself — every call site sums its own `Payment` rows (`where: settledAt not null,
reversedAt: null`) and passes the sum in — so the exact same arithmetic runs in a server
component, a client component, the CSV export and an email template, with no risk of the
five call sites drifting into disagreement with each other. **No new stored column**, per
ground rule 2 — confirmed no performance reason has shown up to justify one.

Shown in five places, all gated the same way (`paidAt != null` **and** the balance is
nonzero — an order that's never been paid has a "balance" equal to its whole total, which
the existing Total figure already says, so repeating it would be noise, not new information):

1. **Order detail page** (`OrderDetail.tsx`) — a row under the Total card, amber "Balance due"
   for the ordinary case (owes more), muted "Credit (overpaid)" for the rarer case where a
   post-payment extra was added then removed. Uses `computedTotal ?? order.totalPrice`, the
   same fallback the Total row itself uses, so the balance can never disagree with the total
   displayed right above it.
2. **Admin orders table** (`OrdersTable.tsx`) — a new `BalanceDueMark` component, styled exactly
   like the existing `PaymentMark` (`Mark` component, same amber palette used for "Invoice
   Sent"), placed next to every one of the five existing `PaymentMark` call sites: the desktop
   list view, the board/kanban card, the mobile card, the desktop table row, and the
   hover-preview card (which also gained its own "Balance due" line in its itemised amount
   breakdown, after Total). `page.tsx`'s main orders query now also fetches each order's
   settled/non-reversed payments (`select: { amount: true }` only — cheap, same `include`
   shape the query already had for `extras`).
3. **CSV export** (`exportOrdersCsv` in `orders.ts`) — a new "Balance Due (GEL)" column, right
   after "Total (GEL)", blank for every unpaid or fully-reconciled row.
4. **Invoice email** (`sendOrderInvoice` → `renderInvoiceEmail`) — a new optional
   `paymentsSettledTotal` field on `InvoiceEmailData` (defaults to 0, so every pre-existing
   call site is unaffected). Only when it's nonzero does the email say anything extra: a
   "Paid so far" row, then "Balance due" (or "Credit") if the two don't fully reconcile. This
   is exactly bug #64's own live-reproduced scenario — a re-sent invoice after a post-payment
   extra — so it was the one piece of "invoice content" that genuinely needed the same
   treatment, not just the CSV.
5. **On-page printable invoice** (`InvoicePrint.tsx`, used both from `OrderDetail.tsx`'s Print
   button and `OrdersTable.tsx`'s print/email preview) — the same balance line as the email,
   gated on `paymentsSettledTotal > 0` (this component isn't given `paidAt`, so "has actually
   been paid something" stands in for it).

**Decision: admin orders table gets the indicator.** The plan's own bug #64 write-up names the
orders table as one of the screens that disagreed with reality, and threading a `paymentsSettledTotal`
sum through the existing `include` was genuinely cheap (one extra relation select, no N+1,
no new query). Reused the codebase's own established pattern instead of inventing a new one —
`BalanceDueMark` is structurally identical to `PaymentMark`.

**Decision: CSV and invoice email both got the treatment; the `InvoiceSent` audit table and
Calendar view did not.** CSV and the invoice email are named directly in the plan's own
verification bullet, and both are real customer/accountant-facing money statements — leaving
them silent would recreate exactly the "screen disagrees with reality" problem bug #64 is
about. The `InvoiceSent` table (Feature 203) stores a historical snapshot of what an invoice
said *at send time*; giving it a `paymentsSettledTotal` column too would be a schema
migration and a materially bigger change than "add a computed display value" — out of scope
for this chunk, not attempted, and not blocking (the live email/print at send time is
correct; only a *later* look-back at that historical row wouldn't show the balance that
existed at the time). Calendar view (`CalendarView.tsx`) shows `totalPrice` in a compact day-hover
card with no room budgeted for a second money figure and wasn't named in the plan's bug
write-up or its Chunk 2 bullet — left untouched.

**Verification — done live on `staging.vineworks.ge` against the dev DB, not just read from
code:**
1. `npx tsc --noEmit` clean. `scripts/check-i18n-parity.ts`: 1121/1121 both languages (4 new
   keys per locale: `orderDetail.total.balanceDue`/`credit`, `orders.balanceDue`/`credit`).
2. Created a throwaway individual order on Staging Winery (`cmugxbq7z0000k004z84agvz6`,
   "ZZChunk2Test PostPaymentBalance", 4 guests × ₾100 tasting rate = ₾400) through the real
   `/admin/orders/new` form.
3. Marked it Paid · Bank transfer through the real status-picker UI, then added a real
   ₾240 extra ("2 additional guests") through the actual admin UI's "+ Add extra charge"
   form — not a script.
4. **Order detail page, read live, not guessed from a screenshot:** the page text after
   adding the extra read `...Total 640.00₾ Balance due 240.00₾` — the exact figure a
   ₾400-paid, ₾640-total order should show.
5. **Orders table mark, confirmed by reading the DOM's actual `title` attributes** (not a
   screenshot guess): `{"text":"⚠","title":"Balance due: 240.00₾"}` sitting next to
   `{"text":"₾✓","title":"Paid"}` on the real table row.
6. **CSV export, read from the real network response**, not trusted from the button existing:
   clicked "Export CSV" for real and read the actual response body via the browser's network
   inspector rather than saving the file — the row for this order read
   `...,640,240,NEW,paid,25/09/2026,,,,` (Total 640, Balance Due 240), while every other,
   fully-reconciled paid row on the page had an empty Balance Due cell as designed.
7. **Invoice email content verified by calling the real, deployed `renderInvoiceEmail()`
   function directly** with this order's real numbers (total 64000, settled 40000, one extra
   of 24000) via a throwaway `npx tsx` script — chose this over an actual `sendOrderInvoice()`
   send because sending a real email is outside what this verification pass needed to
   settle (the shared `balanceDue()` arithmetic was already proven correct against the DB in
   step 9, and this exercises the exact same production template code, just without a
   network send); the rendered HTML's amount section read exactly `Total amount: 640.00 ₾
   Paid so far 400.00 ₾ Balance due: 240.00 ₾`. The throwaway script was deleted immediately
   after and never committed. **Flagging this as a deviation worth a second look:** the plan's
   own instruction was to "generate/send one for this order" — an actual send through the
   real UI to a real inbox was deliberately not done this session; if Max wants that specific
   proof (the email as it actually arrives, headers and all) it's a five-minute follow-up
   using the account's own address, which Resend's sandbox mode already permits.
8. **On-page printable invoice, read from the live rendered DOM** (clicked the real "Print
   invoice" button, then read the print portal's `innerText` rather than relying on the print
   dialog rendering): `...ჯამური თანხა: 640.00 ₾ გადასახდელი ნაშთი: 240.00 ₾` — Total then
   Balance due, both correct.
9. **Independent DB read**, direct SQL against the dev Supabase project (`jpbkkngpgtvqmsocitjx`,
   via `mcp__a9e48394-...`, not the generic `mcp__supabase__*` tool): `Order.totalPrice` =
   64000, one `Payment` row (`amount: 40000, status: 'recorded', settledAt` set,
   `reversedAt: null`), one `OrderExtra` (`amount: 24000`) — 64000 − 40000 = 24000, reconciling
   exactly with every UI/CSV/email figure above.
10. **Chunk 1's lock reconfirmed unaffected:** after adding the extra to this same paid order,
    a live DOM check of the party-size input read `disabled: true` — the guest-count lock is
    untouched by this chunk's changes, as expected (genuinely separate code paths, per the
    plan's finding 5).
11. **Nothing found silently treating a partial collection as full.** `paymentStateOf()`
    (the function behind the "Paid"/"Invoiced"/"Unpaid" tag everywhere) still keys off
    `paidAt` alone, which is correct for "has this order been paid *something*" — it's now
    paired with the balance-due mark rather than replaced by it, exactly the "flag it, don't
    hide it" design. No other `paidAt`-gated logic was found in this chunk's scope that
    assumes full collection; Chunks 3–4 (a real second payment) are the ones that will need to
    consult the balance rather than just `paidAt` when deciding whether more can be collected.
12. **Cleanup:** deleted the throwaway order's 3 `OrderEvent` rows, 1 `Payment` row, 1
    `OrderExtra` row and the `Order` row itself; a follow-up query confirmed all four tables at
    0 rows for this order id, and the order no longer appears in the live `/admin/orders` list.
    The throwaway invoice-render script was deleted from disk, never committed.

**Deviation from the plan worth recording:** step 7 above — an actual email send was skipped
in favor of exercising the real template function directly. This proves the content is
correct but not that `sendOrderInvoice()`'s wiring (the new `payments` include, the
`paymentsSettledTotal` sum, passing it through) is connected correctly end to end in
production. That wiring *was* read and is structurally identical to the CSV export's (already
live-verified end to end via the real "Export CSV" button), so confidence is high, but this is
the one place in this chunk where "live-verified" means "the template's output was proven
right," not "an email was proven to arrive right." Flagged per the task's own instruction to
report anything that deviated.

## Chunk 3 — A real second manual payment

**Goal:** make the manual side of "collect the balance" actually work (finding 1).
**Status:** ⬜ Not started.

- New function alongside (not inside) `recordManualPayment` — e.g. `recordAdditionalPayment`
  — that always creates a new `Payment` row for a specified amount/method, independent of
  whether the order already has a settled payment. Reuse `manualPayment.ts`'s existing
  shape/conventions (provider `'manual'`, method `BANK_TRANSFER`/`CASH`).
- Wire it into the UI: once there's a balance due, an admin action lets them record how it
  was paid, for up to the outstanding amount (support partial collection — someone paying
  only part of the balance should just reduce it, not be blocked or forced to pay in full).
- Verify: full path — pay an order, add an extra, record a manual top-up payment, confirm the
  balance recomputes correctly (to zero for a full payment, to a smaller nonzero value for a
  partial one), confirm the original `Payment` row is completely untouched.

## Chunk 4 — Card-link top-up

**Goal:** let a guest pay their own balance by card, without the admin handling it.
**Status:** ⬜ Not started.

- Decouple `createCheckout()`/`startCheckout()`'s Flitt-facing reference from
  `Payment.orderId` (finding 3) — mint a fresh string per checkout attempt (e.g. tied to a
  timestamp or the specific `OrderExtra`'s id), while the `Payment` row's own `orderId`
  always points at the real order.
- New admin-initiated server action: start a checkout for the outstanding balance (or an
  admin-specified amount, if partial collection by card should be supported — decide), tied
  to the real order, **not** gated by `shouldTakePayment()`.
- Deliver the checkout link to the guest by email (reuse the existing email-sending
  infrastructure the same way `sendOrderInvoice` does) — a short message with the amount and
  a real, working Flitt checkout link.
- Verify live, end to end, through Flitt's real test merchant: generate the link, actually
  pay it (test card), confirm settlement, confirm the balance recomputes to zero, confirm the
  original payment is untouched, confirm `settle.ts` handled the second callback correctly
  (it already should, per finding 3 — re-confirm through the real UI path, not just a script).

## Chunk 5 — Fix the multi-payment display

**Goal:** close finding 4 — stop a second payment from misrepresenting the first.
**Status:** ⬜ Not started.

- Replace `app/admin/(panel)/orders/[id]/page.tsx`'s single-newest-payment query with a real
  list of every settled, non-reversed payment for the order.
- `OrderDetail.tsx`: render each payment (amount, method, date) rather than one collapsed
  "Paid · method" label once there's more than one — decide the single-payment case should
  still render essentially as it does today, so this isn't a regression for the common case.
- **Verify with two genuinely different methods** (e.g. original CARD via Flitt, top-up CASH)
  — the spike's own two-payment test happened to use the same method both times, so this
  exact scenario was never actually observed rendering, only reasoned about from the query.

## Chunk 6 — End-to-end regression test

**Goal:** one real Playwright scenario proving the whole flow, extending the existing tier.
**Status:** ⬜ Not started.

- New spec under `saas/tests/tier5-payment-e2e/`, reusing `flittPayment.ts`/`payments.ts`/
  `resendCheck.ts` helpers already built during `Plan-PaymentE2ETesting.md`'s Chunks 2–5.
- Scenario: pay an order for real (Chunk 3-style approved settlement) → confirm price fields
  are locked → add an extra → confirm balance-due appears correctly everywhere → collect part
  of it manually → collect the rest via a real card-link checkout → confirm balance reaches
  zero, confirm both payments show correctly and distinctly on the order detail page, confirm
  the original payment's amount/method were never altered, confirm CSV/invoice reflect the
  final, true state.
- Independently verify final DB state via direct SQL (dev Supabase project
  `jpbkkngpgtvqmsocitjx` only — confirm you're using the correct MCP tool, `mcp__a9e48394-...`,
  not the generic `mcp__supabase__*` one, which has been found scoped to an unrelated account
  in this session before; falling back to an `npx tsx` script against `saas/.env`'s real
  `DATABASE_URL` is an equally valid alternative if needed).

## Chunk 7 — Documentation

**Goal:** leave this discoverable, close the loop on the bug that started it.
**Status:** ⬜ Not started.

- `vault/KnownBugs.md` #64 — mark resolved, link the fix commits and this plan.
- `vault/FeatureLog.md` — new row for post-payment extras/top-up payments.
- `vault/Roadmap.md` — tick off if it's tracked there.
- `playwright/README.md`/`ARCHITECTURE.md` — mention the new spec if it needs any convention
  note beyond what's already documented for tier5.
