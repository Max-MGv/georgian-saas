---
tags: [feature, orders, wine-orders, schema, data-model]
---

# Feature 191 — Order status: two-axis split

**Status: chunks 1–4 done (schema, dual-write, scoping, UI). Chunk 5 (contract) not started.**
Reads now come off the new columns on both order screens; the old `status` column survives for
payment limbo and is still dual-written until chunk 5 retires it. Design log: `Plan-StatusModel.md`.

## What it does

Splits what an order's status means into two facts that move independently:

- **Process** — has the wine gone out / has the visit happened. `new → confirmed → delivered` (wine) or `new → confirmed → completed` (bookings), plus `cancelled`.
- **Financial** — has the money arrived. `unpaid → invoiced → paid`.

The reason, in Max's words: *"for many orders first we give the wine or provide the service — and then people pay."* An individual pays at checkout. A restaurant or hotel gets the wine delivered and settles the invoice weeks or months later. The old single column could not represent that — `paid` sat *between* `confirmed` and `delivered` in the wine stepper, and `PAID` sat before `COMPLETED` in `OrderStatus`, so a delivered-but-unpaid order had nowhere honest to sit and the only way to move the card forward was to mark it paid when it wasn't.

What the winery sees is **one** flow-line, not two trackers. The Paid step sits where it actually
happened: a prepaid individual sees `new → paid → confirmed → delivered`, an invoiced company sees
`new → confirmed → delivered → paid` — both from the same function, off the same two columns.

## The flow-line (chunk 4)

`lib/statusFlow.ts` is pure and DB-free: it takes the vocabulary as an argument rather than
fetching it, so both order types share it, the server resolves the vocabulary once per page, and
it is testable without a database.

```
spine   = getProcessStatuses(tenantId, kind), minus `cancelled`
done    = every spine step at or below the current processStatusId's sortOrder
Paid    = done iff paidAt is set
placed  = paidAt null   → appended last (the pay-later default)
          paidAt set    → spliced in immediately after the step named by paidAtStage
```

Decisions inside that, worth not re-deriving:

- **`active` is always a process step, never Paid.** "Where is this order" is a question about
  fulfilment; an order that has been paid and delivered is *at* delivered. Paid is only ever done
  or not yet done.
- **`cancelled` is not the end of the line.** It comes back from `getProcessStatuses` like any
  other row (the dropdown needs it), but a cancelled order has not progressed to the end of the
  flow — it left it. Rendering it as the final step would read as success, so the whole line greys
  out and the undo affordance appears instead.
- **A `paidAtStage` that no longer resolves appends rather than drops.** Losing the placement is a
  display imperfection; losing the fact that money arrived would be a lie.
- **Paid is never un-done from the line.** Reversing a payment is a deliberate correction, not a
  click away from a step label, so a done Paid step is not clickable.

## What chunk 4 changed beyond the line

- **Per-order dropdowns.** `unreachedSteps` offers only what this order has not reached, which is
  what stops the menu and the line contradicting each other. `unreachedFinancialSteps` keeps
  bookings' "Invoice Sent" settable by hand without putting it in the line — driven by the
  vocabulary, not by naming the code, so wine orders (whose financial vocabulary is only
  `unpaid → paid`) correctly get nothing and no call site has to know which type has an invoice flow.
- **Filters gained a second axis, AND-combined with the first.** Pills OR within a group, AND
  across groups. "Delivered" + "Unpaid" is the list of invoices still outstanding — which the old
  single column could not express at all, since an order was either delivered or paid, never both
  facts at once. Bookings get the same thing as two `<select>`s and two URL params (`status`,
  `payment`).
- **Boards regrouped onto the process axis only** (Max, 2026-09-17). A grid has one shared
  left-to-right layout, so it can only group by one axis. Giving Paid a column meant an unpaid
  order skipping over it to Delivered and then moving *back* into it once paid — at which point
  the column asserts that a delivered order's stage is "Paid", the exact conflation the split
  exists to remove. Payment is a ₾✓ marker on the card instead, and cards only ever move forward.
- **Writes still go through the legacy path.** `updateWineOrderStatus` / `updateOrderStatus`
  already dual-write, so the UI translates its vocabulary codes back through new reverse maps
  (`legacyWineStatusForCode` / `legacyOrderStatusForCode`) rather than a second write path existing
  alongside the first. Optimistic client updates are derived from `statusPatchCodes(…)` applied to
  the same bridge patch the server is about to write, so the two cannot drift.
  **Known limitation, gone in chunk 5:** a status a tenant inserts later has no legacy equivalent
  to write, so it renders as a position on the line but cannot be clicked. Nothing creates tenant
  rows today, so this is a guard rather than a live path.

## Key design decisions

1. **Two separate dimension tables, not one with a `category` column.** A foreign key can then only ever resolve to a value valid for its own axis — no discriminator to drift, and no schema shape that would let a combined process+financial row reappear (which is the original bug wearing a new hat).
2. **Tables rather than Postgres enums.** Both enforce validity fine; the deciding factor was evolution. Adding an enum value is a migration and *removing* one has no native Postgres support at all (new type, rewrite every row on a live table). Here a new status is an `INSERT`. That matters going from one tenant to many.
3. **Globally scoped now, per-tenant-capable later.** Dimension rows carry a nullable `tenantId`: `null` = shared, an id = that tenant's own. Nothing writes tenant rows yet — the column means enabling it later needs no schema change. Same shape as `BugReport`'s nullable `tenantId`.
4. **`sortOrder` gap-seeded 100/200/300/400.** Gaps exist so a status can be *inserted between* two existing ones later (a tenant's "Packed" at 250) without renumbering everything after it. Appending never needed gaps; inserting always would. **Gaps belong on `sortOrder` only, never on primary keys** — every table here uses `cuid()`, and an id that encodes sequence position can't be reordered without rewriting what every order points at.
5. **`appliesTo` scopes the vocabulary.** Both types share `new`/`confirmed`/`cancelled`, but `delivered` is wine-only and `completed` bookings-only. This is *not* a discriminator for orders — an order's type is already unambiguous from which table it lives in. It exists because the alternative (hardcoding each type's code list in the frontend) would mean an inserted status stays invisible until someone ships code, defeating decision 2.
6. **`financialStatusId` is the truth for paid-ness; `paidAt` answers *when*.** An earlier draft justified `paidAt` as the join-free hot-path fact — that was wrong: `financialStatusId` is a column *on the order row*, so testing it against a known id needs no join either. The join is only needed for the *label*. So there is no paid boolean, and shouldn't be: the FK carries three states a boolean couldn't.
7. **`paidAtStage` is a frozen code string, not a foreign key.** Follows this schema's existing snapshot convention (`wineNameSnapshot`, `priceSnapshot`) — history must not change when the referenced row does. It's what lets the flow-line place Paid where it genuinely happened.
8. **`ON DELETE RESTRICT`, overriding Prisma's default `SET NULL`.** Deleting a status that orders still reference must be refused, not silently blank the reference on every one of them.
9. **Dual-write, not a cutover.** The constraint is code, not data: ~40 call sites still read the old column, so a schema change and forty code changes cannot land atomically. Expand → migrate → contract.
10. **`INVOICE_SENT` folds into the financial axis** as a sub-state rather than staying a fulfilment stage — it records that we asked for money, not that the visit happened.

## Two traps that would have failed silently

**RLS needed a third policy shape.** Adding these tables to `setup-rls.ts`'s normal `tenantedTables` loop would have applied `tenantId = current_setting('app.tenant_id', true)`. Every seeded row has `tenantId` NULL, and `NULL = 'some-tenant'` evaluates to NULL — not true — so the policy would have hidden **every status from every tenant**, with no error, and the app would have seen an empty vocabulary. They instead get a SELECT-only grant (reference data is seeded by migrations, never written by app code) plus a "global OR own" policy. A missing grant would have failed differently but just as importantly: any `include: { processStatus: true }` inside `withTenantDb` throws `permission denied`, because that transaction runs as `app_user`.

**Postgres treats NULLs as distinct in a unique constraint**, so `@@unique([tenantId, code])` does *not* prevent duplicate *global* rows. Closed with hand-written partial unique indexes (`CREATE UNIQUE INDEX ... WHERE "tenantId" IS NULL`), since Prisma cannot express partial indexes. Without them the "one shared vocabulary" guarantee was unenforced.

## Files touched

**Schema / migrations**
- `prisma/schema.prisma` — `ProcessStatus`, `FinancialStatus`, `StatusScope` enum; four new columns on `Order` and `WineOrder`; 13 `@@index` additions
- `migrations/20260917063639_add_tenant_indexes` — indexes only
- `migrations/20260917063954_add_status_dimensions` — tables, columns, partial uniques, seeded reference rows, partial backfill
- `migrations/20260917071500_rename_pending_status_to_new` — `ps_pending` → `ps_new`, id moved too (FKs are `ON UPDATE CASCADE`)
- `migrations/20260917080000_add_status_scope` — `appliesTo`, hand-written as add-nullable → backfill → `SET NOT NULL`

**New modules**
- `lib/statusBridge.ts` — the single place legacy status translates to the two axes. Its rule: a legacy value determines only ONE axis, so it returns a **partial** patch and leaves the other alone. Setting `delivered` keeps whatever payment state existed; setting `paid` keeps whatever fulfilment existed.
- `lib/statusVocabulary.ts` — the only place the vocabulary is read, owning both required filters (scope, and global-or-own tenant rows) so no call site has to remember either.

**Re-pointed writes**
- `lib/payments/settle.ts` — both gateway branches; also hoisted one `settledAt` instant shared by the `Payment` row and the order's `paidAt`, so the two can't disagree about when money arrived
- `app/actions/wineOrders.ts` — `updateWineOrderStatus`'s `status: string` is now the legacy union (the audit's root cause); `createWineOrderAdmin` starts rows at `NEW_ORDER_STATUS_COLUMNS`
- `app/actions/orders.ts` — `updateOrderStatus`, `sendOrderInvoice` (invoice-sent moves financial only), `createOrderAdmin`
- `app/actions/createBooking.ts`, `app/actions/submitWineOrder.ts` — creation paths
- `app/admin/(panel)/wine-orders/WineOrdersClient.tsx` — type-only: the legacy union threaded through `PendingChange`, `handleUpdate`, `requestChange` and both view components' props
- `lib/demoSeed.ts`, `scripts/seed.ts`, `scripts/seed-fake-wine-orders-nm.ts` — derive the new columns via `seedStatusColumns()`
- `scripts/setup-rls.ts` — the status-dimension block

**Chunk 4 — UI (reads moved onto the new columns)**
- `lib/statusFlow.ts` (new) — the flow-line algorithm, `unreachedSteps`, `unreachedFinancialSteps`.
  Pure and DB-free so both order types share it and it is testable without a database.
- `lib/statusBridge.ts` — reverse maps (`legacyWineStatusForCode` / `legacyOrderStatusForCode`,
  narrowed to the settable subset so the machine-only limbo values can't be written by hand) and
  `statusPatchCodes`, which restates a bridge patch in codes for optimistic client updates.
- `app/admin/(panel)/wine-orders/page.tsx` — includes both status relations, resolves the
  vocabulary once, flattens to plain codes at the boundary
- `app/admin/(panel)/wine-orders/WineOrdersClient.tsx` — `VerticalStepper` → `FlowLine`;
  `STATUS_COLOR` re-keyed to vocabulary codes with a neutral fallback; pill, label, dimming, card
  sort, counts and filters all off the new columns; two-axis filter pills; process-only board with
  the ₾✓ marker; pack pre-selection fixed and its `set-state-in-effect` lint error removed
- `app/admin/(panel)/orders/page.tsx` — two `groupBy`s for two axes, `status` + `payment` params,
  limbo excluded from the process counts and filter so the two entries partition rather than overlap
- `app/admin/(panel)/orders/OrdersFilters.tsx` — options come from the vocabulary, not a constant;
  second Payment select
- `app/admin/(panel)/orders/OrdersTable.tsx` — table, list, board and card list; per-order menus;
  ₾✓ markers. The card-list pill's invisible expanded hit area (MaintenanceNotes §17) was left
  alone — the marker sits outside that wrapper.
- `app/admin/(panel)/orders/CalendarView.tsx` — label/colour off the process axis, paid marker
- `app/admin/(panel)/orders/[id]/OrderDetail.tsx` + `page.tsx` — a horizontal flow-line, which this
  screen never had, plus the per-order dropdown
- `app/actions/orders.ts` — `exportOrdersCsv` filters on both axes and exports Status, Payment and
  Paid At as three columns; the `filters.status as OrderStatus` cast is gone
- `lib/adminT.ts` — `orders.status.unpaid`, `wineOrders.status.unpaid`,
  `wineOrders.stepNotSettable`, `orders.filters.payment`, `orders.filters.allPayments`, EN and KA

**Verification scripts (new)**
- `scripts/check-status-backfill.ts` — RLS read path, per-type vocabulary scoping, cross-tenant isolation with two throwaway tenants, `app_user` write refusal, remaining backfill gaps
- `scripts/test-status-bridge.ts` — 21 checks proving the axes move independently

## Edge cases handled

- **A legacy write only moves one axis.** Setting `delivered` does not clear a payment; setting `paid` does not reset fulfilment; cancelling a paid order does not erase that it was paid. All asserted in `test-status-bridge.ts`.
- **`paidAt` is never re-stamped.** A second paid write keeps the original date, so the moment money arrived can't drift.
- **`paidAtStage` is never rewritten** by later progress — a prepaid order that then gets confirmed and delivered keeps `paidAtStage = new`.
- **Payment limbo is pre-fulfilment.** `pending_payment` / `payment_failed` map to process `new`, not a stage of their own — an abandoned checkout leaves the order where it started. These values survive the whole redesign untouched.
- **Settlement can only land on un-progressed orders**, since `settle.ts`'s existing status guards already pin it there — which is why `paidAtStage` is `'new'` on that path without needing an extra read.
- **Backfill is deliberately partial.** Where the old column could not say what the other axis was, the row is left NULL rather than guessed. Safe because nothing reads these columns yet, and moot in the end: both databases hold zero real orders.
- **A `COMPLETED` booking seeds as unpaid and a `PAID` one as not-yet-confirmed.** Looks odd, is correct — those are exactly the two shapes the old column couldn't represent, so demo data now exercises them.

## Decided by Max, 2026-09-17

- **Board columns are the process axis only**, payment as a ₾✓ card marker. See above for why the
  plan's original "skip the Paid column and move back into it" proposal was dropped.
- **The `CHECK ((paidAt IS NOT NULL) = (financialStatusId = 'fs_paid'))` constraint is approved**,
  deferred to chunk 5 so it rides with the contract migration instead of adding one mid-UI-work.
  Cost, accepted: the seeded id `fs_paid` gets hardcoded into a constraint.
- **Display metadata stays in frontend code.** `STATUS_COLOR` (wine) and `STATUS_CONFIG`
  (bookings) were re-keyed from legacy values to vocabulary codes rather than moved into the
  dimension rows. The consequence is a deliberate fallback: a status a tenant inserts later renders
  in neutral grey under its own raw code until someone ships a label for it. Adding
  `labelKey`/`colorHex` columns later is purely additive, so nothing is foreclosed.

## Still open

- `cancelled` is still special-cased in the frontend rather than modelled as terminal (`isTerminal`).
- Whether wine orders ever need the `invoiced` sub-state — one row `UPDATE` if so. Until then
  `unreachedFinancialSteps` correctly returns nothing for them, with no call site knowing why.

## What to test

Chunk 4 is user-visible, so the browser checks below matter more than the scripts.

**On `/admin/wine-orders`:**
1. A prepaid order's card reads `Pending → Paid → Confirmed → Delivered`; an invoiced one reads
   `Pending → Confirmed → Delivered → Paid` with Paid not yet done. Same screen, same code.
2. Mark a delivered, unpaid order Paid. The pill must stay **Delivered** and gain a ₾✓ — it must
   not become "Paid". That single behaviour is the whole point of the split.
3. Open the dropdown on an already-paid order: no "Paid" entry.
4. Filter pills: "Delivered" + "Unpaid" together should narrow, not widen.
5. Board: no Paid column; paid cards carry ₾✓; the Awaiting Payment column disappears when a
   process pill is active.
6. Pack mode pre-selects confirmed orders (and no longer misses paid ones).

**On `/admin/orders`:**
7. Status and Payment are two separate selects whose counts partition the total.
8. A booking's detail page shows the flow-line; marking one Paid puts Paid second (after New).
9. "Invoice Sent" is offered on an unpaid booking and absent on one already invoiced.

**Scripts:**

1. `npx tsx scripts/check-status-backfill.ts` — expect all structural checks green, and the per-type flows to read `new → confirmed → delivered → cancelled` (wine) and `new → confirmed → completed → cancelled` (bookings).
2. `npx tsx scripts/test-status-bridge.ts` — expect 21/21 and "Both axes move independently".
3. `npx tsx scripts/check-rls.ts` — the two new tables should show RLS enabled with a policy.
4. **Regression check:** sending an invoice, printing, editing and deleting orders should behave exactly as before — none of those paths moved.
5. `npx prisma migrate status` — expect no drift, all migrations applied.

Pushed to `staging` 2026-09-17. Not on prod.

**Dev data note:** chunk 2's backfill was deliberately partial, which left rows the new columns
could not render. Those were completed on dev from each row's legacy status (the same derivation
`seedStatusColumns` uses) and four wine orders were arranged into the shapes worth looking at by
eye — prepaid, delivered-unpaid, delivered-then-paid, paid-then-cancelled. `check-status-backfill.ts`
now reports no gaps on either table. Throwaway data; chunk 5's plan is wipe-and-regenerate.
