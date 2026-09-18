---
tags: [plan, orders, wine-orders, schema, data-model]
---

# Plan: Status data model — process vs financial split

**Status:** ✅ **Complete (2026-09-18).** Chunks 1–4 shipped the two-axis design; **chunk 5 replaced it** with two enums and milestone dates, on Max's call. Verified on the dev DB and driven in a browser. Not on prod — the prod migration is its own deliberate step (Rule 0).

> **Read the chunk 5 section before anything else in this document.** Chunks 1–4 describe a design that no longer exists: two status *reference tables* with an `appliesTo` discriminator, and a financial axis of `unpaid → invoiced → paid`. Both were deliberately retired. The reasoning below is kept because the arguments still hold — including the ones that turned out to point somewhere else.

**The flow-line is now buildable straight off the schema.** Render algorithm, for the record: take `getProcessStatuses(tenantId, kind)` as the spine; if `paidAt` is null append the Paid step last (the pay-later default), otherwise insert it immediately after the step whose `code` equals `paidAtStage`; mark process steps done at or below the current `processStatusId`'s `sortOrder`, and Paid done iff `paidAt` is set. Every input that needs resolves from a column that now exists.
**Trigger:** Max, 2026-09-17: "for many orders first we give the wine or provide the service — and then people pay." B2B customers get wine delivered (or a visit completed) and settle the invoice weeks or months later. A single linear status column cannot represent that.

**The one-line version:** payment comes out of the status column and becomes its own axis, so an order can be *delivered and unpaid* — but the admin still sees **one** flow-line, with the Paid step positioned wherever it actually happened.

---

## The problem, concretely

Both order tables cram fulfilment state and payment state into one column:

| Table | Column | Type today | Problem |
|---|---|---|---|
| `WineOrder` | `status` | bare `String @default("pending")` | `paid` is wedged between `confirmed` and `delivered`. No DB constraint of any kind — a typo inserts successfully. |
| `Order` | `status` | enum `OrderStatus` | `PAID` sits before `COMPLETED`, so a completed-but-unpaid visit has nowhere honest to sit. `INVOICE_SENT` is a billing milestone masquerading as a fulfilment stage. |

The admin stepper (`STAGES = ['pending','confirmed','paid','delivered']`, `WineOrdersClient.tsx:66`) hard-codes the assumption that money arrives before the goods do. For a restaurant on invoice terms that is simply false, and today the only way to move the card forward is to mark it paid when it isn't.

---

## Design decisions

1. **Two independent axes in the database, one merged flow-line in the UI.** Process status (`pending → confirmed → delivered`, + `cancelled`) is physical reality: forward-only, never reordered. Financial status (`unpaid → invoiced → paid`) is its own fact, set by the Flitt gateway automatically or by an admin manually. Neither field knows the other exists — that is what keeps each one correct on its own.

2. **The UI merges them by chronology, not by a fixed slot.** The flow-line is a sorted view: whatever is true shows in the order it *became* true; whatever isn't true yet trails. So an individual who paid at checkout sees `Pending → Paid → Confirmed → Delivered` (Paid second, before Confirmed — it genuinely happened first). A company on invoice terms sees `Pending → Confirmed → Delivered → Paid`, with Paid trailing as not-yet-reached. Marking an order paid mid-flow re-slots the step live.
   - Paid can never be step 1 — an order must exist before there is anything to pay for.
   - Rejected alternative: a fixed "Paid always slot 3" rule (wrong — misplaces prepaid orders) and a decoupled Paid *badge* alongside a fulfilment-only stepper (rejected by Max: payment must be a real step in the same line, not a footnote).

3. **`paidAt` lives directly on the transactional row, not behind a join.** "Is this paid" is checked on every board render, every filter, and in email templates. That hot-path fact stays a plain nullable `DateTime` column. A `paidAtStage` snapshot (which process stage was current the instant payment landed) rides alongside it — that is the minimum needed to place the Paid step correctly without timestamping every other transition.

4. **Two separate dimension tables, not one shared table with a category column.** A real foreign key can then only ever resolve to values valid for its own axis, with no discriminator logic to drift and no schema shape that lets a combined process+financial row sneak back in later. (A shared `StatusDef` table would need application-level checks to stop `processStatusId` pointing at a financial row — Postgres's FK mechanism doesn't know about a category column.)

5. **Why dimension tables rather than two Postgres enums.** Both enforce validity fine. The deciding factor is long-term maintainability at scale (10s–100s of tenants next year): adding a status to an enum is a schema migration, and *removing or renaming* one has no native Postgres support at all — you create a new type and rewrite every row on a live table. With a dimension table, a new status is an `INSERT`. No migration, no downtime, no redeploy.

6. **Globally scoped now, per-tenant-capable later.** Dimension rows carry a **nullable** `tenantId`: `null` = shared, available to every tenant; a real id = belongs to that tenant only. Pickers query `WHERE tenantId IS NULL OR tenantId = :current`. No per-tenant customisation is built now — the column just means we never need another schema change to allow it. This mirrors `BugReport`'s existing pattern (nullable `tenantId`, filtered in application code, no RLS relation).

7. **`sortOrder` is gap-seeded 100 / 200 / 300 / 400.** Gaps exist so a status can later be *inserted between* two existing ones (a tenant's "Packed" step slots in at 250) without renumbering every row after it. Appending at the end never needed gaps; inserting in the middle always would.
   - **Gaps belong on `sortOrder` only, never on primary keys.** Every table in this schema uses `cuid()` — ids are opaque and unordered by design, and the moment an id encodes sequence position you can't reorder a status without rewriting the id every transactional row points at.

8. **~~Board columns stay fixed; an unpaid order skips the Paid column and moves back into it.~~ Superseded 2026-09-17 — board columns are the process axis only.** The original reasoning still holds as far as it goes: a Kanban grid needs one shared left-to-right layout, so it can only group by one axis. What it missed is which axis. Keeping a Paid column means that once a delivered-then-paid order lands in it, the *column* is asserting that the order's stage is "Paid" — which is not a stage at all, and is precisely the conflation this whole redesign exists to remove. Max's call: columns are New / Confirmed / Delivered (or Completed) / Cancelled, payment shows as a ₾✓ marker on the card, and cards only ever move forward. The cost, accepted: you can no longer scan a whole Paid column at a glance — the payment filter answers that instead.

9. **The status dropdown becomes per-order, not a hard-coded constant.** Today `ALL_STATUSES` is a fixed list where every value is always selectable. After the split it must offer only steps *this* order hasn't reached — so a prepaid individual's menu simply has no "Paid" entry to click, which is what stops the flow-line and the menu from contradicting each other. Reversing a mistaken Paid stays a deliberate correction (the existing undo affordance), not an everyday menu option.

10. **`INVOICE_SENT` folds into the financial axis as a sub-state**, not a process stage — it describes whether we've asked for money, not whether the visit happened. `Order`'s process axis becomes `NEW → CONFIRMED → COMPLETED` (+ `CANCELLED`), giving the two order types near-identical shapes.

11. **The payment-limbo values survive untouched.** `pending_payment` / `payment_failed` (and `PENDING_PAYMENT`) mean "went to the card gateway and never came back paid" — an abandoned checkout, not a fulfilment stage. They stay exactly as they are, including their separate tabs and their deliberate never-auto-expire behaviour.

### Target shape

```
ProcessStatus                          FinancialStatus
  id | tenantId | code      | sortOrder   id | tenantId | code     | sortOrder
  .. | null     | pending   | 100         .. | null     | unpaid   | 100
  .. | null     | confirmed | 200         .. | null     | invoiced | 200
  .. | null     | delivered | 300         .. | null     | paid     | 300
  .. | null     | cancelled | 400

WineOrder / Order
  processStatusId   -> ProcessStatus
  financialStatusId -> FinancialStatus
  paidAt            DateTime?     <- hot path, no join
  paidAtStage       String?       <- snapshot for flow-line placement
```

---

## Chunk 1 — tenant indexes ✅ built on dev (standalone, ship first)

Migration `20260917063639_add_tenant_indexes` — 13 `CREATE INDEX` statements, nothing else.

**Independent of everything else in this plan.** Pure additive, no data touched, no behaviour changed, nothing can break. Agreed 2026-09-17 to ship on its own rather than ride behind the status work.

Only 2 of 12 tenant-scoped tables have an index on `tenantId` today (`Payment`, `BugReport`). The other ten have the column and no index — so every RLS-filtered query scans the whole table across all tenants combined. Invisible with one tenant; linear degradation as tenants accumulate.

Missing on: `Company`, `Order`, `MenuItem`, `MasterclassItem`, `WineOrder`, `Setting`, `SiteContent`, `BlockedDate`, `Wine`, `WineVintage`.

> **Correction (2026-09-17, found while building):** an earlier draft of this list included `Price` and omitted `MasterclassItem`. `Price` has no `tenantId` column at all — its RLS is JOIN-to-Company, same as `CompanyGuide`/`CompanyRepresentative`. Still ten tables, but two entries were wrong.

**Non-obvious detail:** `Setting`, `SiteContent` and `BlockedDate` already have `@@unique` constraints that *contain* `tenantId` — but as a trailing column (`[key, tenantId]`, `[key, locale, tenantId]`, `[date, tenantId]`). An index is only usable from its leading column onwards, so none of those help a `WHERE tenantId = X` lookup. They still need a `tenantId`-leading index.

Prefer composite indexes matching real query patterns, following `BugReport`'s existing `@@index([tenantId, status])`:
- `Order`, `WineOrder` → `[tenantId, status]` (every board/filter query) and `[tenantId, createdAt]` (the date-range filters already in the UI)
- the rest → `[tenantId]`

Postgres can add these without locking (`CREATE INDEX CONCURRENTLY`). Dev → staging → prod per Rule 0; dev server stopped first per Rule 10.

---

## Chunk 2 — schema + backfill ✅ built on dev

Migration `20260917063954_add_status_dimensions`. Strictly **additive** — the old `status` columns are untouched and still authoritative.

**Why the old columns survive this chunk** (Max asked, and it's worth not re-deriving): the constraint is *code*, not data. Around forty call sites still read and write `status` — `settle.ts`, `updateWineOrderStatus`, the board columns, the filter pills, the stepper, the CSV export, the invoice-send flow (full list in the breakage inventory below). Nothing reads the new columns yet, so dropping the old ones today would leave every order screen with nothing to render from. They are redundant in *intent* from this chunk onward, but load-bearing in *practice* until chunks 3–5 re-point that code. This is the expand half of expand-migrate-contract, and the reason it's two steps rather than one is that a schema change and forty code changes cannot land atomically.

**Decisions taken while building** (not pre-agreed — flag any you disagree with):

1. **One shared process vocabulary across both order types.** They agree on the first, second and terminal states and differ only on the final fulfilment word, so `delivered` (wine) and `completed` (bookings) are two rows *both at sortOrder 300* — the same position in two domains. Display labels stay per-order-type in the frontend, which is already how it works today.
   - **Corrected by Max, same day** (migration `20260917071500_rename_pending_status_to_new`): the first state is coded **`new`**, not `pending`. I had collapsed `NEW` into `pending`; wrong way round, since `NEW` is a booking's genuine first state and `pending` was only ever the wine-order word for it. The wine UI keeps displaying "Pending" as its label. Done as a rename migration rather than an edit to the migration that seeded it, because that one was already applied and Prisma checksums applied migrations. The id moved with it (`ps_pending` → `ps_new`) so it wouldn't become a lie; both foreign keys are `ON UPDATE CASCADE`, so referencing rows followed automatically — verified by the gaps report staying unchanged.
2. **`ON DELETE RESTRICT` on all four foreign keys**, overriding Prisma's default `SET NULL` for optional relations. Deleting a status that orders still point at must be refused, not silently blank the reference on every one of them.
3. **Partial unique indexes for the global rows.** Postgres treats NULLs as *distinct* in a unique constraint, so `@@unique([tenantId, code])` does **not** prevent duplicate global rows. Added as raw SQL (`CREATE UNIQUE INDEX ... WHERE "tenantId" IS NULL`) since Prisma can't express partial indexes. Without this the "one shared vocabulary" guarantee was unenforced.
4. **Stable readable ids for reference rows** (`ps_pending`, `fs_paid`, …) instead of cuids, so backfill SQL and future migrations can reference them and every environment is byte-identical.
5. **Reference data seeded in the migration**, not a seed script — these rows must exist identically in dev, staging and prod.
6. **`paidAtStage` is a frozen code string, not a foreign key** — following this schema's existing snapshot convention (`wineNameSnapshot`, `priceSnapshot`). History must not change when the referenced row does.
7. **No `colorHex`/`labelKey`/`isTerminal` columns yet** (open question 3 unresolved). Adding a column later is additive and trivial; adding an unused one now is speculative.
8. **No index on the new FK columns yet.** They're low-cardinality and the query patterns don't move until chunks 3–4 — better to add `[tenantId, processStatusId]` then, against real queries, than guess now.

### RLS — a third policy shape, and a trap worth knowing

The dimension tables are in neither `writableTables` nor `tenantedTables` in `setup-rls.ts`. They get their own block:

- **`GRANT SELECT` only.** Status rows are seeded by migrations as superuser; app code must never write them. **A missing grant would be worse than a missing policy** — any `include: { processStatus: true }` inside `withTenantDb` would throw `permission denied`, because that transaction runs as `app_user`.
- **A "global OR own" policy**, not the usual `tenantId = current_setting(...)`. Adding these to the `tenantedTables` loop would have been a silent disaster: every seeded row has `tenantId` NULL, and `NULL = 'some-tenant'` evaluates to NULL (not true), so the policy would have hidden **every status from every tenant** and the app would see an empty vocabulary with no error.

### Verification

`scripts/check-status-backfill.ts` (new) — proves all three things that fail silently: global rows are readable through `withTenantDb` for every real tenant, tenant-specific rows don't leak across tenants (two throwaway tenants, per MaintenanceNotes §10, since `check-rls.ts` only proves a policy *exists*), and `app_user` cannot INSERT reference data. All green on dev. `npx tsc --noEmit` clean, confirming the change is genuinely additive.

### Backfill: deliberately partial

Only the unambiguous half was filled. Where the old single column simply could not say what the other axis was, the row is left NULL — honest, and safe because nothing reads these columns yet. **Current gaps on dev:**

| Table | Old status | Unresolved |
|---|---|---|
| WineOrder | `paid` (7) | process stage unknown |
| WineOrder | `delivered` (28), `cancelled` (11) | financial state unknown |
| Order | `PAID` (31), `INVOICE_SENT` (10) | process stage unknown |
| Order | `COMPLETED` (290), `CANCELLED` (27) | financial state unknown |

> **Correction to this plan's earlier assumption:** it said `paidAt` was "recoverable" from `Payment.settledAt`. **The dev database has zero settled `Payment` rows** — nothing to recover. The migration still attempts the recovery (written for prod, where real Flitt settlements may exist), but on dev it is a no-op, so `paidAt` is NULL everywhere and `paidAtStage` is unset on every row.

> **The finding that makes this much less alarming than it looks:** 290 `COMPLETED` bookings versus 31 `PAID` means **the winery has never used this column to track payment.** Most bookings go straight to COMPLETED without passing through PAID — and the dropdown always allowed that, since every status was freely selectable. So the split isn't destroying payment information; it's creating somewhere to put information that was never captured. NULL is the truthful value for those rows, not a loss.

**Resolved 2026-09-17 — no business rule needed.** Max: there are **zero real orders on either prod or dev**; every row in both databases is test/seed data, and he's happy to wipe and regenerate it. So the ~330 unresolved rows carry no meaning and need no decision. Two consequences:

- Chunks 3–5 don't need a careful historical backfill at all — once the new columns are authoritative, orders can simply be wiped and regenerated.
- Not worth regenerating *now*: the seed scripts (`demoSeed.ts`, `seed-fake-wine-orders-nm.ts`) write the **old** status column, so reseeding today would just produce more rows with NULL in the new columns.

The gaps report in `check-status-backfill.ts` stays useful as a chunk 3–5 completeness check, but its current numbers are noise rather than a to-do list.

## Chunk 3 — writes ✅ built on dev

Every write now sets **both** the old column and the two new axes. The old column stays authoritative because the ~40 read sites still depend on it; the new ones are kept accurate in parallel, so flipping reads over in chunk 4 needs no backfill.

**`lib/statusBridge.ts`** is the single place the translation lives — deliberately one module rather than the same mapping inlined at six call sites, the same reasoning `settle.ts` already documents for its own "one function, two callers" shape.

**The rule that makes it correct:** a legacy status only determines *one* axis, so the bridge returns a **partial** patch and the other axis is left untouched. Setting a wine order to `delivered` says nothing about payment, so `financialStatusId` is absent from the patch and whatever was there survives. Setting `paid` says nothing about fulfilment, so `processStatusId` is absent. Returning a complete pair either way is exactly what the old single column did wrong.

Re-pointed:
- `updateWineOrderStatus` — and its `status: string` parameter is now the legacy union. That was the root cause the audit flagged: nothing in app or DB rejected a retired or mistyped value. Typing it surfaced exactly one caller passing a bare `string` (`WineOrdersClient.tsx:877`), which is the silent failure becoming a compile error. The union is now threaded through `PendingChange`, `handleUpdate`, `requestChange` and both view components' props.
- `updateOrderStatus`, `sendOrderInvoice` (invoice-sent moves the financial axis only).
- `settle.ts` both branches. Also hoisted a single `settledAt` instant shared by the `Payment` row and the order's `paidAt`, so the gateway record and the order can't disagree about when money arrived. `paidAtStage` is `'new'` there because the existing status guards already pin settlement to un-progressed orders.
- All four creation paths (`submitWineOrder`, `createWineOrderAdmin`, `createBooking`, `createOrderAdmin`) now start rows at `NEW_ORDER_STATUS_COLUMNS`.
- Seed data (`demoSeed.ts`, `seed.ts`, `seed-fake-wine-orders-nm.ts`) derives the new columns from its chosen legacy status via `seedStatusColumns()`. Worth noting what falls out and is *correct*: a `COMPLETED` booking seeds as unpaid and a `PAID` one as not-yet-confirmed — the two shapes the old column couldn't represent.

### Verification

`scripts/test-status-bridge.ts` (new) — **20** checks against a real database on a throwaway tenant, proving the property a typecheck cannot. *(Recorded as "21" here and in four other vault files until 2026-09-18, when it was counted and run; the number looks borrowed from `test-rls.ts`'s genuine 21/21. Script retired in chunk 5.)*:

- **Pay-later**: confirmed → delivered leaves it `unpaid` with no invented payment date; paying afterwards keeps `process=delivered` and snapshots `paidAtStage=delivered`.
- **Pay-first**: paid before anything else snapshots `paidAtStage=new`; confirming and delivering afterwards neither clears the payment, moves `paidAt`, nor rewrites the snapshot.
- **Bookings**: `INVOICE_SENT` moves financial only; `COMPLETED` leaves it invoiced rather than paid; settling afterwards keeps the visit completed.
- **Cancelling** a paid order does not erase that it was paid.
- **`ON DELETE RESTRICT`** blocks deleting a status that orders still reference.

`npx tsc --noEmit` clean. One pre-existing lint error remains in `WineOrdersClient.tsx:821` (`set-state-in-effect` on the pack pre-selection) — confirmed present before this chunk by linting the stashed tree, and left alone as chunk 4 work.

## Chunk 3.5 — scoping the vocabulary ✅ built on dev

Migration `20260917080000_add_status_scope`. Adds `appliesTo` (`StatusScope` enum: `BOOKING` / `WINE_ORDER` / `BOTH`) to both dimension tables, plus `lib/statusVocabulary.ts` as the only place the vocabulary is read.

**Why it was needed.** Both order types share `new`/`confirmed`/`cancelled`, but `delivered` is wine-only and `completed` is bookings-only — and nothing in the schema could say so. Query `ProcessStatus` unfiltered and you get all five rows including both 300-slot entries, with no way to tell which belong to you.

**What it is not.** Max's question, worth recording: *doesn't the transactional table already know its type?* It does — but from **which table the row lives in**, not a column (`Order` vs `WineOrder`; `Order.bookingType` is INDIVIDUAL/COMPANY, a different axis). So `appliesTo` does not identify orders. It scopes the *vocabulary*, which is a property of the dimension rows and had nowhere else to live.

**Why not hardcode the two code lists in the frontend.** That genuinely works, and was the alternative. It was rejected because the entire argument for dimension tables over Postgres enums was *a new status is an INSERT, not a migration plus a deploy*. Hardcoding the lists means a newly inserted status stays invisible until someone ships code — paying for the tables without getting what they were bought for.

**Why it isn't "filter every query".** Max's follow-up, and the answer that settled the design: the filter applies only when **listing the vocabulary** (flow-line, dropdown, board columns, filter pills), never when reading an order's own status — that follows the row's foreign key and is already unambiguous. So order reads, board queries, statistics and exports are all untouched. And the decisive part: **a filtered accessor has to exist regardless**, because the nullable-`tenantId` design already requires every vocabulary read to filter `tenantId IS NULL OR tenantId = :current` or one tenant sees another's custom statuses. `appliesTo` adds one condition inside a function that must exist anyway.

Other decisions:
- **An enum, not a third table.** Unlike the statuses themselves this is a fixed code-level concept — a third order type would mean a new table and new code regardless, so there is nothing to gain from making it insertable.
- **No default value.** There is no safe guess, so any future insert must state its scope. Prisma generates this as a bare `ADD COLUMN ... NOT NULL` which cannot run on populated tables; the migration is hand-written as add-nullable → backfill → `SET NOT NULL`, where step 3 fails loudly if step 2 missed a row.
- **`invoiced` is `BOOKING`-only** — only bookings have an invoice-send flow (`sendOrderInvoice`). One row `UPDATE` if open question 2 resolves the other way.
- **Deliberately uncached.** Two tiny tables, and this project has a documented lesson about building for a performance problem before measuring one (`Plan-Performance`). React `cache()` per-request dedup is the obvious move if a page turns out to ask repeatedly.

### Verification

`check-status-backfill.ts` gained a scoping section, all green: wine resolves to `new → confirmed → delivered → cancelled` and excludes `completed`; bookings to `new → confirmed → completed → cancelled` and exclude `delivered`; wine payment states are `unpaid → paid` while bookings get `unpaid → invoiced → paid`. The throwaway custom row in the isolation test now sits at `sortOrder` 250 — the gap-seeding paying off, slotting between `confirmed` (200) and `delivered` (300) with nothing renumbered.

## Chunk 4 — UI ✅ built on dev, pushed to staging

Reads moved onto the new columns across both order screens, and the merged one-line flow built in
`lib/statusFlow.ts`. Full detail in `Features/Feature 191`; what belongs here is the reasoning that
only became visible while building.

**The write path deliberately did not move.** Writes already dual-write correctly (chunk 3), so the
UI speaks vocabulary codes and translates back through new reverse maps at the moment of writing,
rather than a second write path existing alongside the first. The known cost: a status a tenant
inserts later has no legacy equivalent to write, so the flow-line renders it as a position but
cannot make it clickable. Nothing creates tenant rows today; chunk 5 removes the restriction with
the old column.

**Optimistic updates are derived, not re-implemented.** The client applies
`statusPatchCodes(wineOrderStatusPatch(…))` — the same patch the server is about to write, restated
in codes. Two copies of "which axis does this legacy value move" is exactly the drift the bridge
exists to prevent, and an optimistic mirror is where that drift would be invisible.

**Payment limbo is the one read that stays on the old column**, and this is load-bearing rather
than laziness: `pending_payment` / `payment_failed` / `PENDING_PAYMENT` all map to process `new` +
financial `unpaid` by design (decision 11), so the axes genuinely cannot tell them apart. The
legacy value is the only thing that can. It survives chunk 5 for the same reason.

**Two bugs that only driving the screens would have found**, both of the kind a typecheck cannot
see:
- Limbo orders ignored an active process filter on the wine board, so asking for "Delivered" still
  showed abandoned checkouts. They must not come back through the "Pending" pill either — on the
  axes a limbo order *does* sit at `new`, which would read as "the winery has work to do on this",
  the thing holding limbo apart is meant to prevent.
- Booking status counts double-counted limbo: `All statuses (31)` against 21 actual bookings,
  because the same orders were counted under both `new` and `PENDING_PAYMENT`. The process count
  now excludes limbo so the two entries partition rather than overlap.

**The gap that the near-miss below exposed, and how it closed.** Bookings have three payment
states where wine has two, and the first pass treated the financial axis as a boolean: paid or not.
That left `invoiced` — a real `FinancialStatus` row, set automatically whenever an invoice is
emailed — settable and filterable but drawn nowhere, since the pill shows the process axis and the
flow-line's only payment step is Paid. It had previously *been* the pill, so this quietly removed
something the winery could see at a glance. Closed 2026-09-17 on Max's call with a second marker
(`✉`) beside the pill, on every surface that shows a pill. The alternative — putting Invoice Sent on
the flow-line ahead of Paid — was rejected twice over: there is no `invoicedAtStage` snapshot, so
the position would be a guess (an invoice sent before the visit would still draw after Completed),
and it records a step *we* took rather than a state the order reached. Placing it honestly would
need a third snapshot column, which is available if the marker ever proves too quiet.

**One near-miss worth recording.** The bookings dropdown appeared to have lost "Invoice Sent", and
it took a while to see that the row I kept testing was the single already-invoiced order — whose
pill reads "New ▾" because the pill shows the *process* axis. The menu was correctly omitting a
step that order had already reached. But the investigation surfaced a real gap: `invoiced` is a
financial state that sits *before* Paid, so it appears nowhere in the flow-line and would have
become unsettable by hand. `unreachedFinancialSteps` closes that, driven by the vocabulary rather
than by naming the code — so wine orders, whose financial vocabulary is only `unpaid → paid`,
correctly get nothing back and no call site has to know which order type has an invoice flow.

## Chunk 5 — contract ✅ built on dev 2026-09-18

**This chunk did not do what it was scoped to do.** It was meant to retire
`paid`/`PAID`/`INVOICE_SENT` from the old columns and add a CHECK constraint,
leaving the dimension tables in place. Instead, after Max pushed back — *"I feel
like we are over-complicating this... what would the database look like for a
business like this?"* — the reference tables were replaced by two Postgres enums
and a set of milestone timestamps. Net effect: **three columns, two tables and
two enums deleted; one column and two enums added.**

### The argument that changed it

Max's framing, and it is the better one: the business sells two things (wine,
dinner bookings) and has two payment timings (before, after). Against that, the
built design was carrying machinery nobody had asked for. The comparison that
settled it:

| | Reference tables (chunks 1–4) | Enum + dates (chunk 5) |
|---|---|---|
| Tables | 2 extra, plus `StatusScope` to discriminate them | 0 |
| Reading the vocabulary | `statusVocabulary.ts`, two filters that silently return a wrong answer if either is forgotten | it is an enum |
| RLS | a third bespoke policy shape; getting it wrong hides every status from every tenant with no error | nothing to configure |
| Type safety | codes are strings; the hand-written unions this chunk was going to fix | Prisma generates the union |
| Placing Paid on the line | `paidAtStage`, a snapshot that can go stale | compare two timestamps |
| Adding a status | an INSERT | a migration |

The last row was the entire case for the tables, and it was being paid for in
every row above it. **Nobody has ever asked for a per-tenant status**, and
nothing wrote a tenant row in the whole time the tables existed.

### Where this plan was wrong, not merely superseded

1. **The `appliesTo` discriminator never did the job it was built for.** Max
   asked the right question — *why not separate status tables per order type?* —
   and the answer exposed a real hole: `appliesTo` filtered the **dropdown**,
   never the **foreign key**. Nothing in the database stopped a booking being
   assigned `ps_delivered`. Decision 4 claimed two tables meant "a foreign key
   can only ever resolve to values valid for its own axis" — true for the
   process/financial split, false for the booking/wine split, which is the one
   that mattered here. Two enums make it unrepresentable rather than merely
   unoffered.

2. **The financial axis was the wrong shape, independently of tables vs enums.**
   `unpaid → invoiced → paid` is a ladder, so climbing it overwrites the rung
   below: marking an invoiced order paid **erased that an invoice was ever
   sent**. That is not hypothetical — it shipped in chunk 4, vanished from every
   screen, and was patched with a `✉` marker. Two independent dates cannot
   overwrite each other, and the marker's justification disappears with it.

3. **Decision 11 ("the payment-limbo values survive untouched") was the trap,
   not the safe option.** Limbo is cleared today as a *side effect* of writing
   the legacy column — "Mark as paid" writes `status = 'paid'` over
   `'pending_payment'`, and that is the only way out. Chunk 5 was going to delete
   that write path. Keeping a demoted column and mirroring the process axis would
   not have helped: limbo is cleared by a *financial* move, which the mirror
   never sees. **An order marked paid would have stayed in the limbo panel
   permanently, silently.** Nobody had noticed, because the column's clearing
   mechanism was never written down as a mechanism.

4. **Open question 4's CHECK constraint dissolved rather than being answered.**
   `CHECK ((paidAt IS NOT NULL) = (financialStatusId = 'fs_paid'))` existed only
   because paid-ness was stored twice and the two could disagree. With `paidAt`
   as the single place it lives, there is nothing to hold in agreement — and the
   accepted cost, a seeded row id hardcoded into a constraint, is not paid at
   all. (The permissiveness flagged at handover was real: Postgres three-valued
   logic made it pass for a NULL `financialStatusId`. Also real, and missed by
   the gaps report: **38 dev rows were `fs_paid` with no `paidAt`**, because
   `check-status-backfill.ts` only ever looked for NULL foreign keys.)

### What "abandoned" became, and why it is not on either axis

Max's reframing, better than the one it replaced: an abandoned checkout and a
declined card are **the same thing**, and that thing is not a payment state — it
is *an order that never happened*. So it is neither a stage nor a payment word.
It is one nullable `abandonedAt` timestamp, stamped when the guest is sent to the
gateway and cleared the moment the order completes, so it reads literally as
*this order has been incomplete since &lt;date&gt;*.

Three values (`pending_payment`, `payment_failed`, `PENDING_PAYMENT`) collapse to
one. A latent asymmetry disappears for free: only wine orders ever recorded a
declined card, so a refused booking sat in `PENDING_PAYMENT` indefinitely.

**Rejected: a separate table.** It is the obvious reading of "a whole complete
separate thing", and it does not work. We are never told that a customer closed
the tab — there is no event at which anything could be moved — and the row has to
stay where a late Flitt callback can find it (Plan-OnlinePayment §7.2, which is
also why these are never auto-expired). Moving rows would also break recovery,
which Max asked for: a copied row gets a new id and orphans its `Payment`.

**Rejected: deriving it from `Payment`.** Measured rather than assumed — dev had
**83 `created` Payment rows against 13 limbo orders**. Payment rows outlive the
state, so deriving it would have marked live orders abandoned.

So: separate everywhere the winery looks (its own `/admin/abandoned` screen, and
absent from every list, board, filter, count, calendar and export), same table
underneath.

### The target shape that shipped

```
Order                                  WineOrder
  stage          BookingStage            stage        WineOrderStage
    NEW|CONFIRMED|COMPLETED|CANCELLED      NEW|CONFIRMED|DELIVERED|CANCELLED
  confirmedAt    DateTime?               confirmedAt  DateTime?
  completedAt    DateTime?               deliveredAt  DateTime?
  invoiceSentAt  DateTime?               paidAt       DateTime?
  paidAt         DateTime?               abandonedAt  DateTime?
  abandonedAt    DateTime?
```

`stage` is deliberately denormalised — derivable from the timestamps, kept as a
column because the board groups by it and every filter and count reads it. Three
CHECK constraints hold the two in agreement, none of which hardcodes a row id:

- `*_stage_has_timestamp` — the **current** stage must carry its own date. Only
  the current one: a walk-in order entered as already complete never passed
  through Confirmed, and inventing a date for it would be a lie.
- `*_abandoned_is_unpaid` — an order cannot be both abandoned and paid. This is
  what lets every surface test abandonment with a single `abandonedAt IS NULL`
  instead of a compound condition a filter could get half right.

### Decisions taken while building

1. **Two enums, not one shared.** They differ only on the final word, but sharing
   is what forced `appliesTo` last time. A booking is now structurally incapable
   of being DELIVERED.
2. **No `cancelledAt`.** The timestamps exist to order the flow-line, and
   cancelled is not on it. Purely additive if it is ever wanted.
3. **No `invoiceSentAt` on `WineOrder`.** There is no wine invoice flow. A column
   nothing writes is worse than an absent one — the next reader assumes it is
   populated. Same call the plan already made against `invoicedAtStage`, which is
   why that open question is now moot.
4. **Un-paying clears `paidAt` and nothing else.** Under the ladder this was a
   dilemma (whichever rung you fell back to lost information); with dates the
   invoice record simply survives. The audit trail for a reversal is the
   `Payment` row, which already keeps `settledAt` and `rawResponse`. **Gap, not
   built:** a manually-marked-paid order has no `Payment` row, so reversing it
   leaves no trace. That is an `OrderEvent` table and a separate feature.
5. **One tagged action per order type**, not three. `changeBookingStatus(id,
   {kind: 'stage'|'paid'|'invoiceSent'|'restore', ...})` — one place for the
   admin check, tenant scoping, read-before-write and revalidation. The stage
   arrives as a bare `string` and is narrowed by `isBookingStage` **before**
   anything is read or written; Postgres would refuse a bad enum value anyway, so
   this is the second of two nets rather than the only one. Typing the parameter
   as the enum would hide the exact assumption that caused the original bug.
6. **`invoiceSentAt` is stamped at any stage.** The old `INVOICE_SENT` only
   advanced from NEW or CONFIRMED, because it was competing for the fulfilment
   column. Billing a completed visit after the fact is normal and now records
   properly.
7. **Invoice Sent went back on the flow-line.** It was demoted to a marker
   because there was no snapshot to place it with; `invoiceSentAt` places it
   honestly. The marker is kept on the pill-only surfaces (table, board, card
   list, calendar), which have no line. A reversal of a Max decision whose
   premise no longer holds — flagged rather than done quietly.
8. **An unsent invoice disappears from the line once an order is paid.** Found by
   driving the screen: a settled booking was drawing a trailing "Invoice Sent"
   step, which read as unfinished. An invoice that *was* sent always shows; one
   that never was is only a pending step while the money is outstanding.

### Verification

`scripts/test-order-status.ts` (new, replaces both retired scripts) — 43 checks
on a throwaway tenant. It tests what is worth testing now: that the axes move
independently, that **the database refuses what the model forbids** (each of the
three constraints and both enums exercised by trying to violate them), that
milestone dates do not overwrite each other, and that abandoned orders are held
out of every order query.

**It found a real bug on first run.** `paymentFilterWhere('unpaid')` was
`{ paidAt: null }`, which also matched invoiced-but-unpaid orders, so the three
payment filters overlapped instead of partitioning — the same defect as chunk 4's
`All statuses (31)` against 21 bookings. `unpaid` now means "we have not even
asked yet"; the chasing list is `invoiced`.

Also: `npx tsc --noEmit` clean, i18n parity 1079/1079 both dictionaries,
`test-rls.ts` 21/21, `check-rls.ts` unchanged, **and a local production build
(`npm run build`) compiles clean** — which had never been run before this chunk.

Driven in a browser on the dev DB, not inferred from a typecheck: status counts
partition exactly (18+24+282+30 = 354 = the header total, against 199+58+97 = 354
on the payment axis); "Delivered" + "Unpaid" together narrow to the 9 outstanding
wine invoices; marking one of them paid left `stage = DELIVERED` and stamped
`paidAt`; a prepaid booking's line reads New → Paid → Confirmed → Completed with
the pill still reading Completed; the board shows four stage columns and no Paid
column; `/admin/abandoned` lists 39 bookings and 2 wine orders, and "They paid"
stamped the payment and cleared `abandonedAt` in one write.

---

---

## Breakage inventory (audited 2026-09-17)

### ✅ Cleared: no revenue or analytics depends on `paid`
Verified exhaustively — every revenue total sums `totalPrice` over a date/company/visitType slice with **no payment-status predicate**: `statistics/page.tsx:16-20,37-75`, `StatisticsV2.tsx:75-89`, `WineStatistics.tsx:158`, `orders/page.tsx:136,161`. Super-admin has no revenue aggregation. The one nearby status read (`WineStatistics.tsx:159`, `activeOrders`) is an *exclusion* list on `delivered`/`cancelled`, both of which survive.

Also cleared: **nothing reads `Payment.settledAt` to infer paid-ness** except `settle.ts`'s own idempotency gate (`:92`). So there is no existing disagreement to reconcile — but equally, there is no source of payment truth on the read side today. `paidAt` would be the first.

### 🔴 Will break silently — the real danger
The asymmetry that matters: **`Order`'s Postgres enum refuses to drop `PAID` while rows hold it**, which forces the backfill. `WineOrder.status` is a bare `String` and gets no such net.

| What | Where | Silent effect |
|---|---|---|
| Display fallback | `WineOrdersClient.tsx:414`, `:748` | Legacy `paid` wine order renders as **"Pending"** — reads as unstarted work |
| Display fallback | `OrdersTable.tsx:192,659,952,1356`; `CalendarView.tsx:204`; `OrderDetail.tsx:35-42` | Legacy `PAID` booking renders as **"New"** |
| Stepper index | `WineOrdersClient.tsx:154` | `STAGES.indexOf('paid')` → `-1`, so *every* stage reads not-done; a finished order looks brand new |
| **Pack pre-selection** | `WineOrdersClient.tsx:818` | Filters `'confirmed' \|\| 'paid'` — **paid wine silently drops off the packing list** |
| Untyped write | `wineOrders.ts:8` | `status: string`, no validation, app or DB. Any stale caller keeps writing `'paid'` forever |
| Live payment path | `settle.ts:138` | Writes `status: 'paid'` on the wine branch — would stamp an orphan value onto real paying customers |
| Limbo escape hatch | `WineOrdersClient.tsx:177` | "Mark as paid" writes `'paid'`; unre-pointed, abandoned-checkout orders get stuck permanently |
| Optimistic client mirrors | `OrdersTable.tsx:536-539`; `OrderDetail.tsx:259` | Set `'INVOICE_SENT'` against **hand-written** status unions (`OrdersTable.tsx:17`, `OrderDetail.tsx:33`) — not imported from Prisma, so they don't error, they just stay wrong |
| Filter options | `OrdersFilters.tsx:23-30,246,326`; `WineOrdersClient.tsx:72,309-345,478,685,526` | Permanently greyed "Paid (0)" / "Invoice Sent (0)"; an always-empty Paid board column |
| CSV export | `orders.ts:365,384` | `filters.status as OrderStatus` — a stale `?status=PAID` bookmark casts cleanly and returns **zero rows** |

**Worth doing regardless of this plan:** re-point those two hand-written unions at Prisma's generated type. That single change converts a whole class of silent failures into compile errors.

### 🟡 Will break loudly (safe — caught at build/migration time)
`settle.ts:131` (`OrderStatus.PAID`), `demoSeed.ts:418-420`, `orders.ts:466-472`, `orders/page.tsx:221`, `orders/[id]/page.tsx:80`. Plus the enum migration itself failing while rows hold `PAID` — the safety net.

**Tests — all updated 2026-09-18:**
- `tier1-regression/popover-clipping.spec.ts` now asserts over **whatever options
  the menu offers**, rather than a fixed list of status names. The menu is
  per-order, so no row is guaranteed to show any particular option; the spec is
  about clipping, not vocabulary, and hard-coding the words made it fail for a
  reason it does not test.
- `scripts/test-payment-flow.ts` asserts on `paidAt` and `abandonedAt` instead of
  a status. The declined-card branch changed shape entirely: settlement now
  writes **nothing** to the order on a decline, so the assertion is that the
  order is left alone and the gateway's verbatim status lands on the `Payment`
  row.
- `tier2-core-flows/booking-simple.spec.ts` and `wine-catalogue-order.spec.ts`
  both asserted that a redirected-to-gateway order appears on the order screens.
  It no longer does — that is the whole point — so they now assert it appears on
  `/admin/abandoned` **and is absent from `/admin/orders`**, then restore it to
  carry on. That also gets the recovery path under test.

### ⚪ Orphaned
Translation keys, **EN and KA in pairs** or `check-i18n-parity.ts` fails: `orders.status.paid` (`adminT.ts:329` / `:1521`, used by both tables), `orders.status.invoiceSent` (`:327` / `:1519`). `wineOrders.payment.markPaid` (`:642`) survives if the button is re-pointed rather than removed. Note `check-i18n-parity.ts` will *not* catch a key orphaned in both dictionaries.

**Not affected despite the name:** `MessagesPanel.tsx`'s `'paid'` and `DEFAULT_BOOKING_INTRO_PAID*` are an email *variant* driven by a `paid: boolean` prop, not the status column. Leave alone.

**Seed/demo to rewrite:** `demoSeed.ts:418-420` (bookings), `:477-478` (wine orders). `scripts/seed.ts` and `seed-fake-wine-orders-nm.ts` use `'confirmed'` only — unaffected.

**Docs to update after shipping:** `Plan-OnlinePayment.md:82,121,147`, `MigrationNotes.md:173,243`, `Plan-StatusBoard.md:53`, `Plan-SystemMap.md:32,57,65`, `Plan-ManualWineOrderEntry.md:58`, `DemoSite/Plan-DemoRedesign.md:194-195,214`, and `MyToDo.md:868` (Max's own test step says "Order flips to PAID").

---

## MaintenanceNotes that apply

- **§23** — `settle.ts` must keep using `getAllContent(tenantId, locale)` / `getAllSettings(tenantId)`, never the header-resolving `getContent()`/`getSetting()`; a webhook has no request headers. There is no `Order.locale`, so paid-confirmation emails fall back to the tenant default. Adding `paidAt` means revisiting all three locale call sites together.
- **§3** — stop the dev server before any `prisma migrate dev` / `generate` on Windows, or you get `EPERM`, a half-generated client and leaked connections.
- **§10** — `test-rls.ts` silently skips its cross-tenant tests on a one-tenant DB. New tables need the two-throwaway-tenant pattern from `scripts/test-payment-rls.ts`; a green tick from `check-rls.ts` proves nothing.
- **§12** — `data-tour` anchors (`orders-table`, `orders-filters`, `wine-orders-list`) aren't connected to anything type-checked. Grep `data-tour` before and after touching these screens or a demo-tour step dies silently.
- **§17** — the `OrdersTable` status pill has a deliberately invisible expanded hit area (`py-2 -my-2`). Don't "fix" the geometry; verify with `document.elementFromPoint`.
- **§27** — `Tenant` reads use plain `db`, never `withTenantDb` (RLS enabled, zero policies → silent `null`). `settle.ts:59,174` already do this correctly.

**Should be added to MaintenanceNotes:** the three-file coupling with zero type safety across it — `WineOrdersClient`'s `STAGES` array ↔ `updateWineOrderStatus`'s unvalidated `string` param ↔ `settle.ts`'s two string writes.

---

## Open questions

All closed as of 2026-09-18. Kept with their answers, since two of them were
closed by the design changing underneath them rather than by being decided.

1. ~~Does the board's "skip the Paid column, move back into it later" behaviour
   feel right?~~ **No** (2026-09-17). Board columns are the stage axis only;
   payment is a ₾✓ card marker. Survived chunk 5 unchanged.
2. ~~Does `WineOrder` need an `invoiced` sub-state?~~ **Moot** (2026-09-18).
   There is no financial vocabulary to add a row to any more. If a wine invoice
   flow ever appears it is one additive `invoiceSentAt` column, and the flow-line
   picks it up with no other change — which is cheaper than the row would have
   been.
3. ~~Do dimension rows need a `colorHex` / `labelKey` column?~~ **Moot**
   (2026-09-18). There are no dimension rows. Display metadata was always in
   frontend constants and stays there, now keyed by enum value. The "a tenant's
   inserted status renders in neutral grey" fallback is gone with the feature
   that needed it.
4. ~~Should a CHECK constraint hold `paidAt` and `financialStatusId` in
   agreement?~~ **Dissolved** (2026-09-18) — see chunk 5. Paid-ness is stored
   once, so there is nothing to reconcile. Three different constraints shipped
   instead, none of which hardcodes a seeded id.

---

## Still open, deliberately

- **No reversal audit trail for a manual payment.** Un-paying clears `paidAt`;
  for a gateway payment the `Payment` row survives as the record, but an order
  marked paid by hand has no `Payment` row and reversing it leaves no trace. An
  `OrderEvent` table is the answer if this ever matters — a separate feature, not
  a gap in this one.
- **Prod has not been migrated.** Rule 0: `prisma migrate deploy` against
  production is its own deliberate step. The migration deletes all order data,
  which Max confirmed is disposable on both databases — but that confirmation was
  given on 2026-09-17 and should be re-confirmed before it runs.
- **The super-admin cross-tenant orders screen has not been driven in a
  browser.** It was re-pointed (it had been left on the retired column entirely)
  and it typechecks and builds, but verifying it needs the super-admin account.
