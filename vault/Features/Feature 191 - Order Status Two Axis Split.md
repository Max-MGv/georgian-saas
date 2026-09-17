---
tags: [feature, orders, wine-orders, schema, data-model]
---

# Feature 191 — Order status: two-axis split

**Status: chunks 1–3.5 done (schema, dual-write, scoping). Chunks 4–5 (UI, contract) not started.**
Old `status` columns remain authoritative meanwhile. Design log: `Plan-StatusModel.md`.

## What it does

Splits what an order's status means into two facts that move independently:

- **Process** — has the wine gone out / has the visit happened. `new → confirmed → delivered` (wine) or `new → confirmed → completed` (bookings), plus `cancelled`.
- **Financial** — has the money arrived. `unpaid → invoiced → paid`.

The reason, in Max's words: *"for many orders first we give the wine or provide the service — and then people pay."* An individual pays at checkout. A restaurant or hotel gets the wine delivered and settles the invoice weeks or months later. The old single column could not represent that — `paid` sat *between* `confirmed` and `delivered` in the wine stepper, and `PAID` sat before `COMPLETED` in `OrderStatus`, so a delivered-but-unpaid order had nowhere honest to sit and the only way to move the card forward was to mark it paid when it wasn't.

What the winery will eventually see (chunk 4) is still **one** flow-line, not two trackers. The Paid step floats to where it actually happened: a prepaid individual sees `new → paid → confirmed → delivered`, an invoiced company sees `new → confirmed → delivered → paid`.

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

## Still open

- Nothing enforces that `paidAt` is set exactly when `financialStatusId = 'fs_paid'`, so they can drift. Closable with a `CHECK ((paidAt IS NOT NULL) = (financialStatusId = 'fs_paid'))`, at the cost of hardcoding a seeded id in the constraint. **Max's call.**
- Whether display metadata (`labelKey` / `colorHex`) moves into the dimension rows, or stays in the frontend constants. Only worth moving if a tenant should be able to rename a status without a deploy. **Max's call.**
- `cancelled` is still special-cased in the frontend rather than modelled as terminal (`isTerminal`).
- Whether wine orders ever need the `invoiced` sub-state — one row `UPDATE` if so.

## What to test

Nothing is visible in the UI yet — chunks 1–3.5 are schema and write paths only, and the old columns still drive every screen. So the meaningful checks are:

1. `npx tsx scripts/check-status-backfill.ts` — expect all structural checks green, and the per-type flows to read `new → confirmed → delivered → cancelled` (wine) and `new → confirmed → completed → cancelled` (bookings).
2. `npx tsx scripts/test-status-bridge.ts` — expect 21/21 and "Both axes move independently".
3. `npx tsx scripts/check-rls.ts` — the two new tables should show RLS enabled with a policy.
4. **Regression, not new behaviour:** the admin order screens should look and behave exactly as before. Change a wine order's status through the stepper and the dropdown; change a booking's status; send an invoice. All should work identically — the new columns are being written alongside, invisibly.
5. `npx prisma migrate status` — expect no drift, all migrations applied.

Nothing is on staging or prod yet.
