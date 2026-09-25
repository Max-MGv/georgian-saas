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
| **3** | New function for a genuine additional manual payment (don't touch `hasLivePayment`) | ✅ Done |
| **4** | Card-link top-up: decouple Flitt's `order_id`, new admin action, email delivery | ✅ Done |
| **5** | Fix the order-detail page's multi-payment display (finding 4) | ✅ Done |
| **6** | End-to-end Playwright regression, extending `saas/tests/tier5-payment-e2e/` | ⬜ Not started |
| **7** | Docs: close out `KnownBugs.md` #64, `FeatureLog.md`, `Roadmap.md` | ⬜ Not started |

Status values: ⬜ Not started · 🚧 In progress · ✅ Done · ⏸ Paused

**Resume point:** Chunk 5 done and verified live on `staging.vineworks.ge`, commit `9dff238`.
Chunk 6 next (end-to-end Playwright regression). `KnownBugs.md` #65 (`settle.ts` dragging
`Order.paidAt` forward on a second settlement while stage stays `NEW`) is still open — deliberately
not touched in Chunk 5 either, since it's out of scope for a display-only fix and deserves its own
dedicated pass, per Chunk 4's Result section and the bug's own entry.

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
**Status:** ✅ Done, 2026-09-25. Commit `9e64241` on `staging`.

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

### Result (2026-09-25)

**What was built.** `recordAdditionalPayment` (`lib/payments/manualPayment.ts`) is a new,
standalone function appended after `reverseManualPayments` — `hasLivePayment`,
`recordManualPayment` and `reverseManualPayments` are **byte-for-byte unchanged** (confirmed by
`git diff` between the Chunk 2 and Chunk 3 commits; only the import line at the top of the file
changed, to pull in `balanceDue`/`formatTetri`). It always creates a new `Payment` row — no
`hasLivePayment` check anywhere in it — and validates the requested amount against the current
balance due, computed **fresh inside the same transaction**: a real `tx.order.findFirst` for
`totalPrice` and a real `tx.payment.aggregate` sum of every settled, non-reversed payment
already on the order, fed through Chunk 2's own `balanceDue()` helper rather than re-deriving
the arithmetic. Reading the balance inside the transaction rather than trusting a value the
caller computed earlier matters for exactly the case this chunk exists for: two top-ups
recorded in quick succession must each be checked against the balance as it stood at that
moment, not both against the balance from before either of them landed.

**Amount validation, and the reasoning behind it.** An amount of zero or less is rejected
outright with `"Enter an amount greater than zero."`. An amount **greater than the current
balance** is also rejected outright — deliberately not silently clamped to the balance. Clamping
would record an amount the admin never actually typed without telling them, and letting the
top-up path itself manufacture an overpaid-looking balance would recreate a version of bug #64
with the money moving the other way (a screen — the ledger, this time — disagreeing with what
was actually collected). The error text names the real balance and points at the alternative
("add it as an extra first" if more is genuinely owed) rather than just saying no. **Partial
collection needed no special-casing at all** — any amount `0 < amount <= balance` is accepted
unconditionally, which is what makes recording less than the full balance not an error case to
avoid but simply the normal path through the same one check.

**Scope decision: real orders only, not the module's usual `wineOrderId` half of `OrderRef`.**
Every other function in `manualPayment.ts` accepts either half of `OrderRef` (an order or a
wine order). `recordAdditionalPayment` only accepts a real `orderId: string`. Reason: it
validates against `balanceDue()`, and Chunk 2 never wired a balance-due concept up for wine
orders anywhere in the app — accepting a `wineOrderId` here would silently validate against a
concept that doesn't exist for that order type (in practice, `tx.order.findFirst` would simply
never match a wine order's id and every call would fail with "Order not found," which is honest
but not a real feature). Extending this to wine orders is out of scope until Chunk 2's balance
concept itself is.

**UI decision: order detail page only, not the orders table.** The order detail page is where
Chunk 2's balance-due figure already lives and where extras are added — the natural place for a
multi-field action (amount entry, then a payment-method choice) that doesn't fit the orders
table's already-dense row layout, especially after bug #63's documented mobile row-size
trade-off. A "Record payment" link appears under the balance-due row, shown only when
`isPaid && balance > 0` (never for the rarer credit/overpaid case — there's nothing to collect a
payment against there); clicking it reveals an amount field prefilled with the full balance
(editable down for a partial top-up) and reuses the exact "How was this paid? Bank transfer /
Cash" picker component pattern from bug #62/Feature 205, both buttons submitting directly with
no separate confirm step, matching that picker's own UX. On success the page calls
`router.refresh()` rather than patching local state to reflect the new payment — the same
pattern `assignOrderCompany`'s handler already uses in this file — so the balance the admin sees
next always comes from a fresh server read of every settled payment, not a client-side running
total that could drift from it.

**`OrderEvent`: new enum value, real migration needed.** Added `ADDITIONAL_PAYMENT_RECORDED` to
the `OrderEventType` enum, matching the `addOrderExtra`/`removeOrderExtra` pattern of recording
one event per meaningful money-affecting action, inside the same transaction as the payment it
describes (via a new `recordTopUpPayment` server action in `orders.ts` that wraps
`recordAdditionalPayment` + `recordOrderEvent` in one `withTenantDb` call). Checked the schema
before assuming a migration was needed: Prisma maps a schema `enum` to a **native Postgres
enum type**, not a `CHECK` constraint or a string column, so adding a value is a real DDL change
(`ALTER TYPE "OrderEventType" ADD VALUE 'ADDITIONAL_PAYMENT_RECORDED';`) — confirmed by finding
the exact same pattern in an existing migration (`20260729131800_add_online_payment` added
`OrderStatus.PENDING_PAYMENT` the same way). Ran `npx prisma migrate dev` against the dev
database only (`jpbkkngpgtvqmsocitjx`, matching `saas/.env`'s `DATABASE_URL`), after confirming
no local dev server was running (Rule 10) — produced migration
`20260925123830_add_additional_payment_event_type`, applied cleanly, Prisma Client regenerated.

**Verification — done live on `staging.vineworks.ge` against the dev DB, not just read from
code:**
1. `npx tsc --noEmit` clean (after the migration — the enum value doesn't exist in the
   generated client until `prisma migrate dev`/`generate` runs, so this failed with a real type
   error first, confirming the check wasn't a no-op). `scripts/check-i18n-parity.ts`: 1123/1123
   both languages (2 new keys per locale: `orderDetail.recordPayment.button`/`savedOk`; the
   amount field and the "How was this paid?"/"Bank transfer"/"Cash"/"Cancel" copy were
   deliberately **reused** from `orderDetail.extras.amount` and the existing `paymentMethod.*`
   keys rather than duplicated, per the plan's own instruction to reuse the established
   convention).
2. Created a throwaway individual order on Staging Winery (`cmugyb0fs0000jr046zb9jfyd`,
   "ZZChunk3Test PostPaymentTopUp", 4 guests × ₾100 tasting rate = ₾400) through the real
   `/admin/orders/new` form, marked it Paid · Bank transfer through the real status-picker UI.
3. Added a real ₾240 extra ("2 additional guests") through the actual "+ Add extra charge"
   form — Total ₾640, Balance due ₾240, matching Chunk 2's already-verified behaviour.
4. **Partial top-up, real UI:** clicked "Record payment" (prefilled ₾240), changed the amount
   to ₾100, clicked "Bank transfer". Balance due recomputed live to ₾140.00 and "Payment
   recorded ✓" appeared. **Independent direct SQL read** against the dev project
   (`jpbkkngpgtvqmsocitjx`, via `mcp__a9e48394-...`) confirmed **two** `Payment` rows for this
   order: the original (`amount: 40000, method: BANK_TRANSFER, status: recorded, settledAt`
   unchanged from before this chunk's action ran, `reversedAt: null`) completely untouched, and
   a genuinely new second row (`amount: 10000, method: BANK_TRANSFER, settledAt` a minute
   later, `reversedAt: null`).
5. **Second top-up for the rest, a different method (Cash) to also exercise that path:**
   recorded the remaining ₾140. Balance due and the entire "Balance due"/"Record payment"
   section **disappeared** from the page (the `balance > 0`/`balance !== 0` gates both correctly
   go false at exactly zero) — Total still correctly read ₾640.00 at this point (the ₾50 extra
   below came after). Direct SQL confirmed **three** `Payment` rows
   (₾400 + ₾100 + ₾140 = ₾640, exactly `Order.totalPrice`), all settled, none reversed, the
   original still byte-for-byte unchanged.
6. **Over-payment rejection, verified live:** added a further ₾50 extra ("Late checkout fee",
   Total → ₾690, Balance due → ₾50), clicked "Record payment", typed ₾100 (more than the ₾50
   balance), clicked "Bank transfer". The page rendered, verbatim: *"That's more than the
   outstanding balance of 50.00₾. Record at most the balance due — if more than that is
   genuinely owed, add it as an extra first."* Balance due stayed at ₾50.00. **Direct SQL
   confirmed no new row was created** — still exactly 3 `Payment` rows summing to ₾640, not 4.
7. **Boundary case — exactly the balance:** recorded exactly ₾50 (Bank transfer). Succeeded;
   balance/record-payment section disappeared again. Final direct SQL read: **four** `Payment`
   rows (₾400 + ₾100 + ₾140 + ₾50 = ₾690, exactly `Order.totalPrice`), all `settledAt` set,
   all `reversedAt` null. `OrderEvent` history read back in order: `CREATED`, `PAID`,
   `EXTRA_ADDED` (₾240), `ADDITIONAL_PAYMENT_RECORDED` (₾100, BANK_TRANSFER),
   `ADDITIONAL_PAYMENT_RECORDED` (₾140, CASH), `EXTRA_ADDED` (₾50),
   `ADDITIONAL_PAYMENT_RECORDED` (₾50, BANK_TRANSFER) — exactly one event per successful
   top-up, **none** for the rejected over-payment attempt, each payload carrying the right
   amount and method.
8. **Chunk 1's lock reconfirmed intact:** a live DOM check of every input/select/textarea in
   the Guest Breakdown card (7 elements) read `disabled: true` for all of them, after all of
   this chunk's payments and extras had been recorded on the same order.
9. **The unrelated "mark as paid" toggle — sanity-checked, with a documented limitation.**
   Tried to reach a live re-toggle of "Paid" on this already-paid order through both the order
   detail page's status dropdown and the orders table's own dropdown; neither exposes an
   "un-pay" action once the Paid step is already reached (`menuSteps` only offers *unreached*
   steps — a pre-existing UI shape, not something this chunk touched or needs to). Lacking a
   live path to force a second `recordManualPayment` call through the UI, verified this the
   other rigorous way available: `git diff e78f1a1 9e64241 -- saas/lib/payments/manualPayment.ts`
   and `-- saas/app/actions/orders.ts` show `hasLivePayment`/`recordManualPayment`/
   `reverseManualPayments` and all of `changeBookingStatus` (the function that calls them)
   **completely unchanged** — the only edits in either file are one import line and a new
   function appended after the existing code, never inside it. Flagging this per the task's own
   instruction to report anything that deviated from the letter of the verification plan: this
   is a diff-based sanity check, not a live behavioural one, because the live path doesn't exist
   in the current UI to exercise.
10. **Cleanup:** deleted the throwaway order's 7 `OrderEvent` rows, 4 `Payment` rows, 2
    `OrderExtra` rows and the `Order` row itself (direct SQL, since by this point the row counts
    were verification subjects in their own right); a follow-up query confirmed all four tables
    at 0 rows for this order id, and the order no longer appears in the live `/admin/orders`
    list. No throwaway scripts were written to disk this session (all verification used the
    live browser session plus direct SQL reads).

**Deviations from the plan worth recording:** (1) item 9 above — the "mark as paid" sanity
check ended up diff-based rather than a live UI toggle, because no live path to re-trigger
"Paid" on an already-paid order exists in the current admin UI (an existing constraint, not one
this chunk introduced or needs to fix). (2) The plan's own Chunk 3 bullets didn't call out an
`OrderEvent`/migration decision explicitly (Chunk 2's bullets didn't either, for a different
reason — it added no enum value) — recorded here since the task instructions asked for it:
yes, a migration was needed, because Prisma enums are native Postgres types, and it was run
against the dev database only, verified by an existing precedent migration doing the identical
`ALTER TYPE ... ADD VALUE` for a different enum.

## Chunk 4 — Card-link top-up

**Goal:** let a guest pay their own balance by card, without the admin handling it.
**Status:** ✅ Done, 2026-09-25. Commit `d331c66` on `staging`.

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

### Result (2026-09-25)

**What was built.** `startCheckout()` (`saas/lib/payments/startCheckout.ts`) gained an optional
`flittOrderId` override — when omitted, behaviour is byte-for-byte what it always was
(`input.orderId`/`input.wineOrderId` sent straight through as Flitt's own `order_id`, exactly
as every existing booking/wine-order checkout still does); only a caller that supplies one gets
different behaviour. `Payment.orderId` is untouched by this — it's set separately, a few lines
below, from `input.orderId` alone, same as before. A new file,
`saas/lib/payments/topUpCheckout.ts`, is the one caller that supplies an override:
`mintTopUpFlittOrderId(orderId)` returns `` `${orderId}-topup-${Date.now().toString(36)}-${random 6 chars}` ``
— traceable by eye back to the real order, guaranteed distinct from both the original checkout's
own reference (which is just the plain order id, never suffixed) and any earlier top-up attempt
for the same order (timestamp + random). `startTopUpCheckout()` in that file does the actual
work: validates the requested amount against a fresh read of the balance
(`balanceDue(totalPrice, settled sum)`, same arithmetic as Chunk 3's `recordAdditionalPayment`,
duplicated rather than shared — see "scope decisions" below), reads Flitt credentials directly
off `Tenant` (not through `shouldTakePayment()`/`isPaymentConfigured()`, per ground rule 5 — no
module toggle, no section toggle, no company override applies), then calls `startCheckout()`
with the minted override. Confirmed before writing any of this, by reading the `Payment` model
in `schema.prisma` in full: nothing in the schema stores Flitt's own `order_id` string anywhere
— only `providerPaymentId`, which Flitt generates and returns — so this decoupling really does
cost nothing structurally, exactly as finding 3 said.

Two new server actions in `saas/app/actions/orders.ts`:
- `startOrderTopUpCheckout(orderId, { amount })` — `requireAdmin`, builds an `orderDesc` from
  the real order's name/date/time, calls `startTopUpCheckout()`, returns the checkout URL and
  the new `Payment` row's id. No `revalidatePath` — nothing display-relevant changes until the
  checkout actually settles through the real Flitt callback, same as any other checkout.
- `sendOrderTopUpCheckoutEmail(orderId, paymentId, locale)` — looks the `Payment` row up by the
  id the previous action returned (never trusts a client-supplied checkout URL or amount, same
  reasoning as `startTopUpCheckout()`'s own re-read of its just-created row), then calls
  `sendTopUpCheckoutEmail()` (`saas/lib/emails/topUpCheckoutEmail.ts`), a thin wrapper around
  `sendTenantEmail()` — same sender/suppression infrastructure `sendInvoiceEmail` uses, new
  `fromLocalPart: 'payments'`. The template, `saas/lib/emails/templates/topUpCheckoutEmailTemplate.ts`,
  is bilingual (en/ka) and structurally modelled on `invoiceEmailTemplate.ts` (same theme
  resolution, same header/footer wrapper) but deliberately much shorter — one amount, one
  "Pay now" button, one fallback plain-text link — since a top-up has one job, unlike a full
  itemised invoice.

**Decision: checkout generation and emailing are two separate actions, not one blind
"generate and send" click.** The plan's own wording ("generates... and it's emailed") reads as
one step. Built as two for two reasons, one architectural and one about this task's own
verification boundary: (1) a real Flitt API call that creates a real `Payment` row and a real
email send to a guest are different kinds of action with different blast radii — separating them
lets the admin see and copy the real link before deciding to email it (or hand it to the guest
some other way — WhatsApp, SMS, read aloud on the phone), rather than an unreviewable one-click
send; (2) this task's own hard boundary on real email sends required generating a checkout to be
independently testable from sending mail, so the two could not be one inseparable server action
without either violating the boundary or leaving the checkout-generation half unverified. UI:
clicking "Send card-payment link" (gated identically to Chunk 3's "Record payment" —
`isPaid && balance > 0`) reveals an amount field prefilled with the full balance (editable down,
matching Chunk 3's partial-collection UX below); "Generate link" calls the first action and, on
success, swaps the field for the real checkout URL (read-only, selectable) plus "Copy link"
(`navigator.clipboard`), "Email to guest" (hidden if the order has no email address, with an
explanatory line instead), and "Done".

**Decision: partial collection by card is supported, matching Chunk 3.** The plan flagged this
as open ("decide"). Went with "yes, support it" for the same reason Chunk 3 did: an admin who
can only collect part of the balance right now (a guest paying for their own top-up but not a
companion's) shouldn't be blocked or forced into a full-balance link, and the validation is the
identical one check Chunk 3 already proved sufficient (`0 < amount <= balance`, reject anything
else with an error naming the real balance). No new reasoning needed — same shape as Chunk 3's
own amount box, prefilled with the full balance and editable down.

**Scope decision: balance validation duplicated, not shared with `recordAdditionalPayment`.**
Chunk 3's balance check runs inside a single atomic DB transaction alongside the payment write
it guards. This chunk's "write" is an external HTTP call to Flitt's checkout API, which cannot
itself run inside a database transaction — so `startTopUpCheckout()` reads the balance fresh
immediately before calling `startCheckout()`, same arithmetic, but as a plain read-then-call, not
a transaction. This is a best-effort UX guard, not the final authority on what gets collected —
Flitt's own signed settlement callback through `settle.ts` remains the one place that decides
what actually happens to the guest's money, exactly as it already was for the original checkout
flow (which never wrapped `shouldTakePayment()` + `startCheckout()` in a transaction either).
Chunk 3's `recordAdditionalPayment` was left completely untouched (not refactored to share this
logic) — same reasoning as Chunk 3's own "byte-for-byte unchanged" discipline for
`manualPayment.ts`: a small amount of duplicated arithmetic is cheaper than adding a shared
dependency between a DB-transaction path and an external-API path that fail in different ways.

**Verification — done live on `staging.vineworks.ge` against the dev DB, not just read from
code:**
1. `npx tsc --noEmit` clean. `scripts/check-i18n-parity.ts`: 1132/1132 both languages (9 new
   `orderDetail.topUpCheckout.*` keys per locale).
2. Created a throwaway individual order on Staging Winery (`cmuh3evgv0000jy04q88csx69`,
   "ZZChunk4Test PostPaymentCardLink", 4 guests × ₾100 tasting rate = ₾400, with a real
   `zzchunk4test@example.invalid` email address so the "has email" UI path could be exercised)
   through the real `/admin/orders/new` form, marked it Paid · Bank transfer through the real
   status-picker UI, then added a real ₾150 extra ("2 additional guests") — Total ₾550, Balance
   due ₾150, both buttons ("Record payment", "Send card-payment link") visible side by side as
   designed.
3. **First card-link top-up, ₾100 of the ₾150 balance:** clicked "Send card-payment link",
   changed the prefilled amount from ₾150 down to ₾100, clicked "Generate link" — a real
   checkout URL came back (`pay.flitt.com/merchants/6aa79957f6f8336b820e6c82b7634f0c/...`,
   `token=38f3638a...`). **Independent direct SQL read** (dev project `jpbkkngpgtvqmsocitjx`, via
   `mcp__a9e48394-...`) immediately after, before paying anything: a new `Payment` row
   (`provider: 'flitt', method: 'CARD', status: 'created', amount: 10000` tetri,
   `providerPaymentId: '1017624934'`, `checkoutUrl` matching what the UI showed,
   `orderId: 'cmuh3evgv0000jy04q88csx69'` — **the real internal order id**, not Flitt's minted
   reference), sitting alongside the original manual `Payment` row completely unchanged
   (`amount: 40000, method: BANK_TRANSFER, status: 'recorded'`, same `settledAt` as before this
   chunk's action ran). Nothing in the `Payment` row or anywhere else in the schema stores the
   Flitt-facing `order_id` string itself — by design (finding 3) — so the URL's own `token` value
   and the two checkouts never colliding is the direct evidence the mint worked, not a stored
   column read.
4. **Actually paid the first checkout for real**, via the browser tools, using Flitt's real
   hosted checkout page and the non-3DS approve test card from `Plan-PaymentE2ETesting.md`
   (`4444555511116666`, expiry/CVV left at the sandbox's own pre-filled `09/26`/`111`) — a real
   end-to-end payment, not a simulated callback. Redirected back to
   `staging.vineworks.ge/payment/result?status=success`. **Direct SQL confirmed real settlement:**
   the new `Payment` row's `status` flipped to `'approved'`, `settledAt` set — and the original
   manual `Payment` row still exactly as it was (`40000`, `recorded`, unchanged `settledAt`,
   `reversedAt: null`), byte-for-byte. Balance due on the real page recomputed live to ₾50.00.
5. **Second card-link top-up, the remaining ₾50 — the crux test for finding 3.** Clicked "Send
   card-payment link" again; typed ₾100 first (more than the ₾50 balance) and got the real
   rejection message verbatim: *"That's more than the outstanding balance of 50.00₾. Generate a
   link for at most the balance due — if more than that is genuinely owed, add it as an extra
   first."* Then generated for exactly ₾50 — **a second real Flitt checkout succeeded with no
   "Duplicate order" rejection**, a different `token` in its URL from the first. This is the
   direct, repeated-not-just-once proof finding 3 asked for: two genuinely separate checkout
   attempts for the *same* order, each minting its own Flitt-facing reference, neither colliding
   with the other or with anything before it. Paid this one too, same test card, same real
   redirect-back confirmation. **Final direct SQL read:** three `Payment` rows total —
   `40000` (manual, untouched throughout), `10000` (flitt, approved, `providerPaymentId
   1017624934`), `5000` (flitt, approved, `providerPaymentId 1017626556` — genuinely distinct) —
   summing to exactly `55000`, `Order.totalPrice`. The live order-detail page showed no
   "Balance due" row and neither top-up section at all (both gates correctly go false at exactly
   zero, same as Chunk 3's own boundary case), Total still correctly ₾550.00.
6. **Chunk 1's lock and Chunk 3's manual-payment path reconfirmed intact:** the page's own text
   after all of this still read "This order is already paid. Guest counts, the tasting/lunch
   split, rates, and food details are locked..." (Chunk 1), and "Record payment" remained present
   and correctly gated alongside "Send card-payment link" throughout every step above (Chunk 3's
   own code path — `recordAdditionalPayment`/`recordTopUpPayment` — was not touched by this
   chunk's diff at all, confirmed by the diff itself, not re-tested live end to end since nothing
   in it changed).
7. **Live-confirmed, not just reasoned about: finding 4 (the order-detail page's "Paid · method"
   label) really does flip.** The flow-line read "Paid · Card" after the two Flitt top-ups landed
   — this order's *first* payment was Bank transfer, but the page's single-newest-payment query
   (unchanged by this chunk) now shows the newest method instead. This is exactly what
   Plan-PaymentE2ETesting's design spike predicted from reading the code but had not actually
   observed rendering (its own two-payment test happened to use CARD both times). Confirms
   Chunk 5's job is real and unstarted, not already incidentally fixed by anything in this chunk.
8. **A new, real, previously-unknown bug found live — not fixed here, logged as `KnownBugs.md`
   #65.** While reading `Order.paidAt` after each top-up to confirm the balance/UI figures, found
   that it had moved: after the ₾100 top-up, `paidAt` read the *first* top-up's settlement
   timestamp, not the original manual payment's; after the ₾50 top-up, it moved again to the
   *second* top-up's timestamp. Root cause, read in `settle.ts`: the write that sets `paidAt` is
   guarded on `tx.order.updateMany({ where: { id, stage: 'NEW' }, data: { paidAt: settledAt, ... } })`
   — gated on booking **stage**, not on whether `paidAt` was already set. This throwaway order's
   stage was never advanced past `NEW` (an ordinary, ungimmicked case — nothing in this chunk's
   test deliberately induced it), so every real settlement, first or later, satisfied the guard
   and rewrote `paidAt` to its own time. The design spike behind this whole plan
   (Plan-PaymentE2ETesting.md, "Design spike (2026-09-25)" §3) tested a second settlement too and
   reported "no misfire observed" — true only because that spike deliberately advanced the
   order's stage to `CONFIRMED` first, specifically to test this exact guard, which is what made
   the guard correctly block the second write *there*. It's the same class of lesson bug #60's
   own writeup names directly: a guard has to gate on the one fact that actually must never
   change twice — here that fact is `paidAt` itself, not `stage`, which protects a different,
   real concern (a human-advanced order shouldn't be dragged backwards by a late callback) that
   just happens to share one `updateMany` call with this one. Not fixed in this chunk: `settle.ts`
   is the shared, heavily-hardened settlement file behind bug #60's whole saga, and a fix here
   deserves the same dedicated care and its own live verification, not a rushed addition to this
   commit. Full detail in `KnownBugs.md` #65; flagged in this plan's "Resume point" above so
   Chunk 5 (already working in this exact "more than one payment landed" territory) sees it
   before starting.
9. **Email content verified by calling the real, deployed `renderTopUpCheckoutEmail()` function
    directly** with this order's real second-top-up data (₾50.00, the real second checkout URL)
    via a throwaway `npx tsx` script, in both `en` and `ka` — chosen over an actual send for the
    same reason Chunk 2's invoice-email verification was, and because this task's own hard
    boundary explicitly required it: **no real email send was performed at any point in this
    chunk's verification** — the "Email to guest" button was never clicked. The rendered HTML in
    both locales correctly showed the amount ("Amount due — 50.00 ₾" / "გადასახდელი თანხა —
    50.00 ₾"), a working "Pay now"/"გადახდა ახლავე" button linking to the real checkout URL, and
    a plain-text fallback link identical to the button's href. The throwaway script
    (`scripts/_tmp-render-topup-email.ts`) was deleted immediately after and never committed.
    **This means the actual send path — `sendTenantEmail()`'s wiring, the `fromLocalPart:
    'payments'` sender address, Resend delivery itself — is unverified**, exactly the same
    documented gap Chunk 2 left for the invoice email's own send path, not a new or different
    limitation. Flagging this explicitly, as instructed: if Max wants proof the email actually
    arrives (headers and all), it's a short follow-up using the account's own address.
10. **Cleanup:** deleted the throwaway order's 3 `Payment` rows, 4 `OrderEvent` rows (`CREATED`,
    `PAID` ×2 — one per real settlement, matching finding 3's own observation that this is
    expected, not a bug — and `EXTRA_ADDED`), 1 `OrderExtra` row, and the `Order` row itself via
    direct SQL; a follow-up query confirmed all four tables at 0 rows for this order id. No
    throwaway scripts remain on disk.

**Deviations from the plan worth recording:** (1) the email-send boundary above — deliberate,
required by this task's own instructions, and the same shape as Chunk 2's own documented
deviation. (2) Discovering and not fixing `KnownBugs.md` #65 — a real bug this chunk's own
verification surfaced live, in a file (`settle.ts`) explicitly out of this chunk's scope to edit;
logged rather than silently worked around or ignored. (3) The plan's verification bullet says
"confirm `settle.ts` handled the second callback correctly... it already should, per finding 3" —
it handled the **money** correctly (both settlements, both correct `Payment` rows, original
untouched, balance reaching zero) but did *not* handle `Order.paidAt` correctly, which finding 3's
own spike had not actually proven either way (its setup avoided the exact condition that
triggers it). This chunk's verification is more thorough than the finding it was built on, which
is the point of live-testing rather than trusting a prior read.

## Chunk 5 — Fix the multi-payment display

**Goal:** close finding 4 — stop a second payment from misrepresenting the first.
**Status:** ✅ Done, 2026-09-25. Commit `9dff238` on `staging`.

- Replace `app/admin/(panel)/orders/[id]/page.tsx`'s single-newest-payment query with a real
  list of every settled, non-reversed payment for the order.
- `OrderDetail.tsx`: render each payment (amount, method, date) rather than one collapsed
  "Paid · method" label once there's more than one — decide the single-payment case should
  still render essentially as it does today, so this isn't a regression for the common case.
- **Verify with two genuinely different methods** (e.g. original CARD via Flitt, top-up CASH)
  — the spike's own two-payment test happened to use the same method both times, so this
  exact scenario was never actually observed rendering, only reasoned about from the query.

### Result (2026-09-25)

**What was built.** `page.tsx`'s `payments` query (already narrowed to settled, non-reversed
rows by Chunk 2) now also selects `settledAt`, not just `method`/`amount`, and passes the whole
list down instead of collapsing it to `order.payments[0]?.method` — the exact line finding 4
named. `OrderDetail.tsx`'s `OrderProp.paymentMethod: Method | null` became
`payments: PaymentRow[]` (`{ method, amount, settledAt }`), and `FlowLine` takes that list
instead of a single method. **The single/multi split, and the reasoning behind it:**

- **Exactly one payment** (the overwhelming majority of orders) — the flow-line's "Paid" step
  shows the inline "· <method>" suffix exactly as it always has, with nothing else added. This
  was a deliberate choice over the plan's own illustrative example ("Paid · Card · 25/09/2026",
  i.e. with a date). Adding a date would have been a small, defensible enhancement, but the
  plan's own wording — "the single-payment case must render essentially as it does today" — is
  most literally satisfied by *no visual change at all* for the common case, which is also the
  version with zero regression risk to weigh against a cosmetic gain. Recorded here since the
  task explicitly asked this judgment call be decided and documented, not left implicit.
- **Two or more payments** — the flow-line's "Paid" step now shows bare "Paid", no method at
  all, because there is no single correct method to show and showing any one of them is exactly
  the bug. A new "Payments received" block appears in the Total card instead (only when
  `payments.length > 1`, so it never duplicates the single-payment case): each payment on its
  own line, `<method> · <date>` on the left (reusing the existing `paymentMethodLabel()` helper
  and the file's own `formatDate()` — the same `'en-GB'`-locale, day-first formatter already
  used for the invoice-history list, deliberately not locale-sensitive per `KnownBugs.md` #37's
  lesson about `ka-GE` silently reordering fields on this Vercel deployment's ICU data), amount
  on the right via the existing `formatTetri`. New `orderDetail.total.paymentsTitle` key, both
  locales ("Payments received" / "მიღებული გადახდები").

**Why the Total card, not somewhere new.** The itemised list is money detail, and the Total
card already holds every other money-detail addition this plan has made (Chunk 2's balance-due
row, Chunk 3's "Record payment", Chunk 4's "Send card-payment link") — adding a fourth,
differently-located card for one more money fact would fragment a screen that already reads
top-to-bottom as "what this costs → what's been collected → what's still owed → how to collect
it." Placed directly under the Total row/live-preview note and above Balance due, so the
reading order is Total → Payments received → Balance due → collection actions.

**Verification — done live on `staging.vineworks.ge` against the dev DB, not just read from
code:**
1. `npx tsc --noEmit` clean (needed one fix along the way: the `payments` query's own
   `where: { settledAt: { not: null } }` guarantees `settledAt` is never actually null at that
   point, but Prisma's generated type doesn't narrow on a `where` clause, so `page.tsx` asserts
   it non-null with `p.settledAt!` and a comment explaining why). `scripts/check-i18n-parity.ts`:
   1133/1133 both languages (1 new key/locale). `eslint` on both touched files: the only findings
   (2 pre-existing `react/no-unescaped-entities` errors elsewhere in `OrderDetail.tsx`, 1
   pre-existing unused-import warning in `page.tsx`) confirmed unchanged by diffing against a
   `git stash` of this chunk's changes — none introduced by this chunk.
2. **Single-payment regression check, real UI, not just reasoned about:** created a throwaway
   individual order on Staging Winery (`cmuh4bhyg0000jq04f6gfbkcb`, "ZZChunk5Test SinglePayment",
   4 guests × ₾100 = ₾400) through the real `/admin/orders/new` form, marked Paid · Bank transfer
   through the real status-picker UI. Read the live rendered page text afterward: flow-line read
   exactly `Paid · Bank transfer`, no "Payments received" section anywhere on the page, Total
   card showed only `Base price (original) 400.00₾ / Total 400.00₾` — byte-for-byte what this
   screen showed before this chunk, confirming no regression for the common case. Independent
   direct SQL (dev project `jpbkkngpgtvqmsocitjx`, via `mcp__a9e48394-...`) confirmed exactly one
   `Payment` row (`amount: 40000, method: BANK_TRANSFER, status: recorded, settledAt` set,
   `reversedAt: null`), matching the rendered label exactly.
3. **The actual bug fix, with two genuinely different methods — the plan's own required test.**
   Created a second throwaway individual order (`cmuh4dbua0007jq0469swiwqi`, "ZZChunk5Test
   TwoMethods", same ₾400 base), marked Paid · **Bank transfer** through the real UI, added a
   real ₾150 extra ("2 additional guests", Total → ₾550, Balance due → ₾150), then used Chunk 3's
   real "Record payment" UI to collect the full ₾150 balance in **Cash** — a genuinely different
   method from the original, unlike the design spike's own two-payment test (which used CARD
   both times) and Chunk 4's own two-payment test (both CARD via Flitt). **Live page read
   immediately after, not a screenshot guess:** the flow-line read bare `Paid` (no method
   suffix) followed by `→ Confirmed → Completed`, and a new "Payments received" section listed
   both lines exactly: `Cash · 25 Sept 2026 — 150.00₾` then `Bank transfer · 25 Sept 2026 —
   400.00₾` (newest first, matching the query's `orderBy: settledAt desc`). The Balance due row
   and both "Record payment"/"Send card-payment link" affordances had correctly disappeared
   (balance reached exactly zero). Critically: **the original Bank transfer payment's amount/
   method/date rendered correctly and were completely unaffected by the later Cash payment
   existing** — the exact property finding 4 said was broken.
4. **Independent direct DB read**, confirming the rendered page matches the real `Payment` rows
   exactly (dev project `jpbkkngpgtvqmsocitjx`, via `mcp__a9e48394-...`, not the generic
   `mcp__supabase__*` tool): two rows for the second order — `{ method: BANK_TRANSFER, amount:
   40000, status: recorded, settledAt: 15:32:42, reversedAt: null }` and `{ method: CASH,
   amount: 15000, status: recorded, settledAt: 15:33:21, reversedAt: null }` — summing to 55000
   tetri, exactly `Order.totalPrice` (55000). Both rows' `settledAt` timestamps matched the dates
   shown on-screen (same calendar day, so `formatDate`'s day-granularity display was consistent
   with both).
5. **Quick sanity check that Chunks 1/3/4 are all still intact** (not a full re-verification):
   both throwaway orders showed the Chunk 1 lock note ("This order is already paid...") with the
   Guest Breakdown fields disabled; Chunk 3's "Record payment" button was used successfully and
   for real on the second order; Chunk 4's "Send card-payment link" button rendered correctly
   alongside it (not clicked — no need to re-exercise a real Flitt checkout for a sanity check
   this narrow). Nothing in this chunk's diff touches any of `updateOrderEnhanced`,
   `recordManualPayment`, `recordAdditionalPayment`, `startCheckout`, or `settle.ts` — confirmed
   by the diff itself, which touches only `page.tsx`, `OrderDetail.tsx`, and `adminT.ts`.
6. **Cleanup:** deleted both throwaway orders' `OrderEvent` rows (2 + 4), `Payment` rows (1 + 2),
   `OrderExtra` rows (0 + 1) and the `Order` rows themselves via direct SQL; a follow-up query
   confirmed all four tables at 0 rows for both order ids, and navigating directly to the second
   order's old URL rendered nothing (the page's own `notFound()` firing). No throwaway scripts
   were written to disk this session — all verification used the live browser session, direct
   SQL, and the deployed Vercel API to confirm the build had actually gone live before testing.

**Deviations from the plan worth recording:** (1) the single-payment rendering decision above —
the plan's own example included a date, this chunk deliberately did not add one, for the reason
given. (2) The plan's verification bullet suggested "e.g. original CARD via Flitt, top-up CASH";
this chunk used Bank transfer → Cash instead (both via Chunk 3's manual path) rather than
exercising Chunk 4's real Flitt checkout again — the property under test (two *different*
methods correctly both rendering, independently) doesn't depend on which two methods, or on one
of them being a real gateway call, and Chunk 4 already proved the Flitt-specific mechanics
(minted `order_id`, no collision, real settlement) in its own verification; re-running a real
card payment here would have re-tested Chunk 4 rather than Chunk 5. Flagging this as a
conscious scope choice rather than a shortfall.

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
