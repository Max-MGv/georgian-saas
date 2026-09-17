---
tags: [plan, orders, wine-orders, schema, data-model]
---

# Plan: Status data model — process vs financial split

**Status:** 🚧 **Chunks 1–2 built and verified on the dev DB (2026-09-17). Not yet on staging or prod.** Chunks 3–5 (writes + UI) not started — Max: "we will do the statuses front ui stuff later."
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

8. **Board columns stay fixed; the flow-line is what reorders.** A Kanban grid needs one shared left-to-right layout — the same column can't mean different positions for different cards. So the board keeps its columns, and an unpaid order simply skips over the Paid column on its way to Delivered, then moves back into it once marked paid. (The board already supports moving a card to a non-adjacent status, so this is not a new interaction.)

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

## Chunks 3–5 — writes and UI (not started)

3. **Re-point every write** — `settle.ts`, `updateWineOrderStatus`, `updateOrderStatus`, `sendOrderInvoice`, the limbo escape hatch. Also re-point the two hand-written status unions at Prisma's generated type.
4. **UI** — merged flow-line, per-order dropdown options, board column skip/backfill, filters.
5. **Tests, seed data, docs**, then the contract step: retire `paid`/`PAID`/`INVOICE_SENT` from the old columns.

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

**Tests to update:** `tier1-regression/popover-clipping.spec.ts:36,40` (asserts Paid/Invoice Sent options visible), `scripts/test-payment-flow.ts:106,124,146` (asserts `status === PAID` / `'paid'` — must assert on `paidAt` instead; this is the script that proves the whole Flitt path). `payment-amount-integrity.spec.ts:284-293,386` asserts on limbo statuses which survive, but its cleanup helper (`:82`) touches the stepper and needs re-verifying.

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

1. Does the board's "skip the Paid column, move back into it later" behaviour feel right in practice, or should the board never show a card moving leftward into an earlier column?
2. Does `WineOrder` need an `invoiced` financial sub-state like bookings have, or is `unpaid → paid` enough for wine? (No invoice-sending flow exists for wine orders today.)
3. Do dimension rows need a `colorHex` / `labelKey` column (moving display metadata out of the frontend constants), or does that stay in code for now?
