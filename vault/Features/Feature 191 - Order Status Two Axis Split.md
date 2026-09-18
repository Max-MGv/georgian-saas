---
tags: [feature, orders, wine-orders, schema, data-model]
---

# Feature 191 — Order status: stage + milestone dates

**Status: built on dev and committed locally (2026-09-18). Not pushed, not on prod — and the chosen shape is contested.**

> **⚠️ OPEN, NOT SETTLED (2026-09-18).** This document describes chunk 5 as decided.
> It is not. Max picked "enums + dates" from a menu of options, then asked — as a
> follow-up, with *"i want feedback on this too"* — why the two order types did not
> each get their own pair of status tables (four in total). Claude **argued against
> that and then built enums without checking whether the argument was accepted.**
> Max's position on reading the result: *"that isn't what we discussed earlier in
> the session, we said 2 status table per transactional table."*
>
> So the shape below is built, verified and committed, but the choice between it
> and the four-table version is still Max's to make. Nothing is pushed. The three
> live options:
>
> - **A** — four tables: process + financial, per order type (what Max described).
> - **B** — two process tables, one per order type; money stays as dates.
> - **C** — two enums, money as dates (what is built and described below).
>
> A and B both keep the per-type split Max asked for and both drop `appliesTo`.
> The real difference from C is whether a winery can add its own fulfilment step
> without a deploy. The difference between A and B is whether the payment ladder
> comes back — and with it the bug where marking an invoiced order paid erases
> the invoice record.


> **The name is now half wrong, and kept for continuity.** This began as a
> two-axis split (process status / financial status, as two reference tables)
> and was built that way through chunks 1–4. Chunk 5 replaced the second axis
> with dates and the reference tables with enums, on Max's call that the design
> was over-complicated for the business. The *idea* survived — payment came out
> of the status column — but almost none of the machinery did. Design log and
> the full argument: `Plan-StatusModel.md`.

## What it does

An order carries two independent kinds of fact:

- **A stage** — where it is. `NEW → CONFIRMED → COMPLETED` (bookings) or
  `NEW → CONFIRMED → DELIVERED` (wine), plus `CANCELLED`. A Postgres enum,
  one per order type.
- **Milestone dates** — when money things happened. `invoiceSentAt`, `paidAt`.
  Plus `abandonedAt` for an order that never became one.

The reason, in Max's words: *"for many orders first we give the wine or provide
the service — and then people pay."* An individual pays at checkout. A restaurant
gets the wine delivered and settles the invoice weeks later. The old single
column could not represent that — `paid` sat *between* `confirmed` and
`delivered` — so the only way to move a card forward was to mark it paid when it
wasn't.

**"Paid before or after" is not stored.** It is the answer you get by comparing
`paidAt` with `confirmedAt` / `completedAt`. The database does not need to be
told which kind of customer this is; it can see it.

## The flow-line

`lib/statusFlow.ts` is pure and DB-free — both order types share it and it is
testable without a database.

```
spine   = the stage enum, minus CANCELLED
done    = every spine step at or below the current stage's position
events  = invoiceSentAt, paidAt
placed  = an event with a date is spliced in after the last stage step that had
          already happened when it did; an event with no date trails the line
```

A prepaid individual reads `New → Paid → Confirmed → Completed`. A company on
invoice terms reads `New → Confirmed → Completed → Invoice Sent → Paid`. Same
function, same columns.

Decisions inside that, worth not re-deriving:

- **Done is decided by stage position, not by whether a date is present.** An
  admin entering a walk-in order as already complete never passed through
  Confirmed, so `confirmedAt` is legitimately null while the step is behind it.
  Inventing a date would be a lie; treating the step as not-done would draw a
  finished order as unfinished.
- **`active` is always a stage, never an event.** "Where is this order" is a
  question about fulfilment; a paid, delivered order is *at* delivered.
- **`CANCELLED` is not the end of the line.** It comes back from the enum like
  any other stage (the dropdown needs it), but a cancelled order left the flow
  rather than finishing it, so the whole line greys out and the undo affordance
  appears instead.
- **Paid is never un-done from the line.** Reversing a payment is a deliberate
  correction, not a click away from a step label.
- **An unsent invoice disappears once the order is paid.** An invoice that *was*
  sent always shows — it happened. One that never was is only a pending step
  while the money is outstanding; drawing it on a settled order made it look
  unfinished. (Found by driving the screen, not by a typecheck.)

## Incomplete orders

An order sent to the card gateway that never completed. One nullable
`abandonedAt`, stamped at redirect and cleared the moment the order completes, so
it reads literally as *incomplete since &lt;date&gt;*.

- **A closed tab and a declined card are the same thing** (Max). Three legacy
  values collapse to one. A latent asymmetry goes with them: only wine orders
  ever recorded a declined card, so a refused booking sat in `PENDING_PAYMENT`
  indefinitely.
- **It is not a status.** Not a stage, not a payment word — an order that never
  happened. So it is neither axis, and it has no place in either vocabulary.
- **Its own screen** (`/admin/abandoned`, nav label "Incomplete"), and absent
  from every order list, board, filter, count, calendar and export. The nav link
  hides entirely when the tenant has no card gateway, since no abandoned order
  can ever exist.
- **Two ways back in**, because an abandoned checkout is not the end of the
  story: *They paid* (the common case — abandoned the card, paid by transfer)
  stamps the payment and clears the flag in one write; *Restore without payment*
  puts it back unpaid, for someone who will pay on arrival. Without these, that
  customer's order — with their date, slot, guest count and contact details
  already in it — would have to be re-typed by hand.
- **Same table, not a separate one.** We are never told that someone closed the
  tab, so there is no event at which anything could be moved; and the row has to
  stay where a late Flitt callback can find it. Moving rows would also break
  recovery — a copied row gets a new id and orphans its `Payment`.

## Key design decisions

1. **Two enums, one per order type.** They agree on three of four words and
   differ on the fourth. Sharing a vocabulary is what forced the previous
   design's `appliesTo` discriminator — which filtered the *dropdown* but never
   the *foreign key*, so nothing in the database actually stopped a booking being
   marked DELIVERED. Two enums make it unrepresentable rather than merely
   unoffered.
2. **Milestone dates, not a payment status.** The previous financial axis was a
   ladder (`unpaid → invoiced → paid`), so climbing it overwrote the rung below:
   marking an invoiced order paid erased that an invoice had ever been sent. That
   shipped, vanished from every screen, and was patched with a marker.
   Independent dates cannot overwrite each other.
3. **`stage` is deliberately denormalised** against those dates — derivable, kept
   as a column because the board groups by it and every filter and count reads
   it. Three CHECK constraints hold the two in agreement (MaintenanceNotes §29),
   none of which hardcodes a row id.
4. **The current stage's own timestamp is required; earlier ones are not.** A
   walk-in order entered as already complete never passed through Confirmed.
5. **Un-paying clears `paidAt` and nothing else.** `invoiceSentAt` survives, so
   reversing a payment still leaves the record that an invoice was sent. Under
   the ladder this was a genuine dilemma.
6. **One tagged action per order type**, not three: `changeBookingStatus(id,
   {kind, ...})`. One place for the admin check, tenant scoping,
   read-before-write and revalidation. The stage arrives as a bare `string` and
   is narrowed by `isBookingStage` **before** anything is read or written —
   typing the parameter as the enum would hide the exact assumption that caused
   the original bug (an unvalidated `status: string` nothing rejected).
7. **Abandoned orders are excluded by a shared `where` fragment**, not by each
   query writing its own. See MaintenanceNotes §28 — this is the one thing here
   that fails silently.

## What it replaced, and what was deleted

Deleted: `Order.status`, `WineOrder.status`, the `OrderStatus` enum, the
`ProcessStatus` and `FinancialStatus` tables, the `StatusScope` enum,
`paidAtStage`, `lib/statusBridge.ts`, `lib/statusVocabulary.ts`,
`scripts/check-status-backfill.ts`, `scripts/test-status-bridge.ts`, and the
bespoke RLS block those tables needed.

Added: two enums, `stage` + `confirmedAt` + `completedAt`/`deliveredAt` +
`invoiceSentAt` (bookings) + `abandonedAt`, `lib/statusWrite.ts`,
`lib/orderFilters.ts`, `scripts/test-order-status.ts`, and the
`/admin/abandoned` screen.

## Files touched

**Schema / migration**
- `prisma/schema.prisma` — `BookingStage` / `WineOrderStage` enums, the new
  columns, reworked indexes (`[tenantId, stage]`, `[tenantId, abandonedAt]`)
- `migrations/20260917120000_status_stages_and_dates` — wipes order data (both
  DBs held only test rows; Max confirmed), swaps the columns, drops the
  reference tables and both retired enums, adds the three CHECKs

**Modules**
- `lib/statusFlow.ts` — rewritten: the stage sequences, the flow-line,
  `unreachedStages`
- `lib/statusWrite.ts` (new) — the patch functions, the runtime stage guards,
  and the tagged change unions. Types live here and not beside the action
  because a `'use server'` file may export async functions and nothing else
  (MaintenanceNotes §24 — exporting a type there crashes every action in the
  bundle at module load)
- `lib/orderFilters.ts` (new) — `NOT_ABANDONED`, `ONLY_ABANDONED`,
  `paymentFilterWhere`, `paymentStateOf`

**Writes**
- `app/actions/orders.ts` — `changeBookingStatus` replaces `updateOrderStatus`;
  `sendOrderInvoice` stamps `invoiceSentAt` at any stage; `exportOrdersCsv`
  gained the abandoned exclusion it was missing and exports Invoice Sent At
- `app/actions/wineOrders.ts` — `changeWineOrderStatus` replaces
  `updateWineOrderStatus` (the unvalidated `status: string` that started this)
- `lib/payments/settle.ts` — settles on `paidAt` + clearing `abandonedAt`; the
  guard is now `stage: 'NEW'`, which says what the old
  `status IN (NEW, PENDING_PAYMENT)` was reaching for through a mixed column. A
  declined card writes **nothing** to the order
- `app/actions/createBooking.ts`, `app/actions/submitWineOrder.ts` — stamp
  `abandonedAt` at gateway redirect

**Screens**
- `app/admin/(panel)/abandoned/` (new) — page + client
- `app/admin/(panel)/orders/` — page, `OrdersTable`, `OrdersFilters`,
  `CalendarView`, `[id]/page` + `OrderDetail`
- `app/admin/(panel)/wine-orders/` — page, `WineOrdersClient`, `PackingView`
- `app/super-admin/orders/OrdersActivityClient.tsx` + `app/actions/superAdmin.ts`
  — **had never been re-pointed**; it was still rendering labels and filter pills
  off the retired column, and the breakage inventory had only cleared super-admin
  for *revenue*, not status
- `app/admin/(panel)/layout.tsx` — the "Incomplete" nav link
- `app/admin/(panel)/statistics/` — abandoned orders excluded from revenue

**Seeds / tests**
- `lib/demoSeed.ts` — rolls payment **independently of stage**, which is the
  whole point: it produces completed-but-unpaid and paid-before-confirmed rows
  rather than reproducing the old model in new columns. Abandonment is rolled
  before the stage, since it is a slice of every attempt rather than a fraction
  of the orders that happened to stay NEW
- `scripts/seed-demo-data.ts` — `--tenant=<slug>` to refill a throwaway tenant
- `scripts/test-order-status.ts` (new), `scripts/test-payment-flow.ts`,
  `scripts/test-rls.ts`, `scripts/setup-rls.ts`, `scripts/seed.ts`,
  `scripts/seed-fake-wine-orders-nm.ts`
- `tests/tier1-regression/popover-clipping.spec.ts`,
  `tests/tier2-core-flows/booking-simple.spec.ts`,
  `tests/tier2-core-flows/wine-catalogue-order.spec.ts`
- `lib/adminT.ts` — the abandoned-screen vocabulary, EN + KA

## Edge cases handled

- **A stage change only moves the stage.** Delivering does not pay; paying does
  not fulfil; cancelling erases neither.
- **`paidAt` is never re-stamped.** A second paid write keeps the original date.
- **Moving backwards clears what you moved back past.** Undoing a completion
  removes `completedAt`, or the row keeps claiming a completion that was taken
  back.
- **Cancelling touches no dates at all.** A cancelled order that was delivered
  was still delivered.
- **A settlement can only land on an un-progressed order** (`stage: 'NEW'`), so a
  late callback cannot drag a completed or cancelled order backwards.
- **Paying clears `abandonedAt` in the same write**, which the database requires
  anyway — a paid write that forgot it fails loudly.
- **The three payment filters partition exactly**, so the picker's counts cannot
  double-count. `unpaid` means "we have not even asked yet"; the chasing list is
  `invoiced`.

## What to test

**Scripts**
1. `npx tsx scripts/test-order-status.ts` — expect 43/43 and "Stage and payment
   move independently, and the database enforces it."
2. `npx tsx scripts/test-rls.ts` — expect 21/21 (needs a tenant with orders; the
   migration wipes them, so reseed first).
3. `npx tsx scripts/check-i18n-parity.ts` — expect parity.
4. `npx tsc --noEmit` and `npm run build`.

**On `/admin/orders`**
1. Status and Payment are two selects whose counts each partition the total.
2. "Completed" + "Unpaid" together narrow to the visits still owing.
3. A prepaid booking's detail page reads `New → Paid → Confirmed → Completed`,
   with the pill still reading **Completed**, not Paid.
4. A paid booking's line has no trailing "Invoice Sent" step.
5. The dropdown on a New unpaid booking offers Confirmed, Completed, Invoice
   Sent, Paid, Cancelled — and no "New".

**On `/admin/wine-orders`**
6. Mark a delivered, unpaid order Paid: the pill must stay **Delivered** and gain
   a ₾✓. That single behaviour is the whole point of the feature.
7. Board shows four stage columns and no Paid column.
8. Pack mode pre-selects confirmed orders.

**On `/admin/abandoned`**
9. Two tabs with counts; no abandoned order appears on any other screen.
10. "They paid" stamps the payment and moves the order back; "Restore without
    payment" moves it back unpaid at New.

**Regression:** sending an invoice, printing, editing and deleting orders should
behave exactly as before.

## Verified 2026-09-18 (dev, driven in a browser)

Status counts 18+24+282+30 = 354 = header total; payment 199+58+97 = 354; the 39
abandoned bookings absent from all of it. "Delivered" + "Unpaid" gave the 9
outstanding wine invoices; marking one paid left `stage = DELIVERED` with
`paidAt` stamped. A prepaid booking read `New → Paid → Confirmed → Completed`.
The board showed four columns with ₾✓ marks. `/admin/abandoned` listed 39 + 2,
and "They paid" cleared `abandonedAt` and stamped `paidAt` in one write.

**Not driven:** the super-admin cross-tenant orders screen (needs that account).
It typechecks and builds.
