---
tags: [plan, schema, data-model, orders, money]
---

# Plan: Transactional data model fixes

**Status:** 🚧 **Chunk 0 complete 2026-09-18.** Next: Chunk 1 (timestamps). No schema or
application code has changed yet — Chunk 0 was verification plus a push of work that
already existed.
**Prerequisite reading:** [[Dependencies]] — do not start Chunk 3 without it.
**Depends on:** `vault/Plan-StatusModel.md` chunk 5 (the `stage` enums + milestone dates).

---

## Why this exists

A brainstorming session on 2026-09-18 interrogated the transactional schema from
scratch — what the tables mean, what the grain is, what industry practice looks like.
The status design came out of it validated (see [[Research-OrderStatusPatterns]]).
Four things underneath it did not.

| # | Problem | Severity |
|---|---|---|
| 1 | Every money column is `Float`. Floating point cannot represent 0.10 exactly. | 🔴 Silent corruption |
| 2 | `recalcOrderTotal` reads **live** `Price` rows, so adding an extra to an old booking reprices the whole thing at today's rates. | 🔴 Live bug |
| 3 | `OrderExtra`, `OrderMasterclass`, `WineOrderItem`, `Price` have **no timestamps at all**. `Order`, `WineOrder`, `Payment`, `Company` have no `updatedAt`. | 🟡 Unrecoverable history |
| 4 | No event/history table. Un-paying an order by hand leaves no trace — already logged as open in `Plan-StatusModel.md`. | 🟡 Audit gap |

---

## The window, and why sequencing matters

Max confirmed on 2026-09-18 that a **complete wipe of orders, wine orders, line items,
payments and companies is acceptable on both dev and production** — all of it is fake.

That is what makes Chunk 3 (money) affordable. With a wipe there is no backfill, no
dual-write, no migration of historical amounts. **Do the destructive schema work while
that is true.** Once a real customer booking exists, the same change costs an order of
magnitude more.

Chunks are **strictly sequential.** Each has a resume point so a fresh session can pick
up mid-flight.

---

## Chunk 0 — Baseline and unblock ✅ complete 2026-09-18

**The suspicion was correct.** Dev was migrated; staging was running pre-chunk-5 code
against it. Pushing the commits was the fix.

### What was found

**Dev database** — `npx prisma migrate status`: all 16 migrations applied, through
`20260917120000_status_stages_and_dates`. Column-level check against
`information_schema`:

| Confirmed | Detail |
|---|---|
| `Order.status`, `WineOrder.status` | **Dropped.** Only `stage` remains. |
| `ProcessStatus` / `FinancialStatus` / `StatusScope` | **All dropped.** |
| `Payment.status` | Still present — correct, that is the provider's verbatim string. |
| `Order` / `WineOrder` / `Payment` | **No `updatedAt`.** |
| `Price`, `OrderExtra` | **Zero timestamp columns of any kind.** Chunk 1's gap, confirmed empirically rather than inferred. |
| `OrderEvent` | Does not exist. |

**So before the push, staging was reading a column that no longer existed.** It had been
broken since the dev migration ran on 2026-09-17 and nobody had looked.

### What was done

Pushed `staging` → `origin/staging` (`5b68eec..70abd94`) — the two chunk-5 commits plus
one new vault commit. **No code changed**, and nothing went near `master`.

### Verification after deploy

Driven in a browser, logged in as the dev-project tenant admin:

- **`/admin/orders`** — renders. Stage badges (`New`, `Confirmed`) correct, revenue strip
  intact, 42 upcoming bookings, all four view toggles present.
- **`/admin/wine-orders`** — renders. Flow-line, stage filter pills, prices.
- **`/admin/abandoned`** — renders. 39 bookings / 2 wine orders, with "They paid" and
  "Restore without payment" actions.

### Environment map, true as of 2026-09-18

| | Schema | Code |
|---|---|---|
| Dev DB | chunk 5 | — |
| `staging.vineworks.ge` | (reads dev DB) | chunk 5 ✅ **fixed by this chunk** |
| Production | **pre-chunk-5** | **pre-chunk-5** — `master` is 38 commits behind |

Production is internally consistent and untouched. It stays that way until Max
deliberately merges `staging` → `master` per Rule 0.

### Minor find, not blocking

The wine-order filter pill reads **"Pending"** while the booking stage badge reads
**"New"** — same underlying `NEW` enum value, two different display labels. Cosmetic, and
exactly the kind of inconsistency Chunk 7's display table would centralise.

**Resume point:** complete. Chunk 1 may start.

---

## Chunk 1 — Timestamps ✅ built on dev 2026-09-18

**Purpose:** the zero-risk additive change. Pure schema, no application code changes
required, no behaviour change. Ship it first to prove the migration path works before
the risky chunk rides on it.

**Add `updatedAt DateTime @updatedAt`:**
- `Order`
- `WineOrder`
- `Payment`
- `Company`

**Add `createdAt DateTime @default(now())`:**
- `OrderExtra`
- `OrderMasterclass`
- `WineOrderItem`
- `Price` — **and `updatedAt` too.** Max, 2026-09-18: *"yes, both, because why not."*
  Pricing is edited in place by `app/actions/prices.ts`, so without `updatedAt` there is
  no record of when rates changed.

**Add `invoiceSentAt DateTime?` to `WineOrder`** — Max's call, 2026-09-18. Closes the
asymmetry with `Order`, which already has it. Note the original reasoning in
`schema.prisma` for leaving it out ("a column nothing writes is worse than an absent one")
— so either the wine-order invoice-send flow gets built, or this column is knowingly
inert until it does. **Flag it in the schema comment as intentionally unwritten for now.**

**Add `onDelete: Cascade` to `Payment.order` and `Payment.wineOrder`** — Max, 2026-09-18,
accepting finding 2 in [[Dependencies]]. Today both default to `SetNull`, so deleting an
order leaves an orphaned payment row with null foreign keys, carrying a real amount and
invisible to every screen. Doing it here means Chunk 3's wipe is safe by construction
rather than by remembering to delete payments first.

**Why now and not later:** timestamps cannot be obtained retroactively. Every day without
them is history that does not exist. They are one line each.

### What was built

Migration `20260918120357_add_timestamps_and_payment_cascade`, applied to dev.

| Table | Added |
|---|---|
| `Order`, `WineOrder`, `Payment`, `Company` | `updatedAt` |
| `Price` | `createdAt` **and** `updatedAt` |
| `OrderExtra`, `OrderMasterclass`, `WineOrderItem` | `createdAt` |
| `WineOrder` | `invoiceSentAt` (nullable, **nothing writes it yet** — warned in-schema) |
| `Payment` | `onDelete: Cascade` on both `orderId` and `wineOrderId` |

**No application code changed.** Purely additive schema.

### The detail that made it safe

`@default(now())` alongside `@updatedAt` is what let a `NOT NULL` column be added to
populated tables — Prisma emitted `DEFAULT CURRENT_TIMESTAMP`, so existing rows got a
value instead of the migration failing. Without the default this would have errored on
every table that already had rows. **Repeat this pattern for any future `updatedAt`.**

### Verification

- `npx prisma format` + `validate` — schema valid.
- `npx prisma migrate dev` — applied, and output ended with `✔ Generated Prisma Client`
  (Rule 10 satisfied; dev server confirmed not running beforehand via `Get-Process node`
  and a port-3000 check).
- `npx tsc --noEmit` — **zero errors.**
- Direct `information_schema` query — all 11 columns present on dev.
- `pg_constraint.confdeltype` for both `Payment` foreign keys now reports **`c`**
  (CASCADE), previously `n` (SET NULL).

### RLS — nothing to do, and why that is worth knowing

`scripts/setup-rls.ts:49` grants at **table** level
(`GRANT SELECT, INSERT, UPDATE, DELETE ON "<table>" TO app_user`), not column level.
Postgres table grants automatically cover columns added later, so **adding a column never
needs an RLS change.** Only adding a *table* does. Recorded here so no future chunk
re-investigates it.

**Resume point:** complete on dev. Pushed to `staging`. Chunk 2 may start.

---

## Chunk 2 — Write down the definitions ⬜ not started

**Purpose:** free, no code, and it is the cheapest defence against the class of error
this whole session uncovered. Produces [[Definitions]].

**Content:**
- `Order` / `WineOrder` rows are **attempts, not sales.** Realness is `abandonedAt IS NULL`.
- Statistics revenue is **booked, not collected** — `statistics/page.tsx` sums every
  non-abandoned order regardless of `paidAt`. That is a definition, not a bug, but it
  must not be read as cash.
- **Grain rules.** Header facts (`Order`, `WineOrder`) vs line facts (`OrderExtra`,
  `OrderMasterclass`, `WineOrderItem`, `Payment`). Never sum a header amount across a
  join to a line table — a booking with three masterclass lines would contribute its
  total three times.
- Which tables are dimensions (`Wine`, `WineVintage`, `MasterclassItem`, `MenuItem`,
  `Price`, `Company`, `CompanyGuide`, `Tenant`) and which are facts.

**Resume point:** _(none — not started)_

---

## Chunk 3 — Money off `Float` 🔴 the big one ⬜ not started

**Purpose:** store money as an integer number of **tetri**, never a float.

**⚠️ Read [[Dependencies]] first.** 58 files touch money fields; 38 touch currency
formatting. This chunk is split into sub-steps for that reason — do not attempt it in
one pass.

### The decision, and the recommendation

| Option | Verdict |
|---|---|
| **Integer tetri** (`Int`, 4500 = ₾45.00) | ✅ **Recommended.** Matches what Flitt already receives — `toMinorUnits` in `lib/payments/flitt.ts:76` already does `Math.round(amountMajor * 100)`. Same approach as Stripe. No new dependency. |
| `Decimal` (Postgres `numeric`) | Correct too, but drags `Decimal.js` objects into every React component that renders a price. Heavier for no gain at this scale. |

**Percentages stay as they are** — `discountPercent`, `wineDiscountPercent` are not money.

### Columns to convert

`Order.totalPrice` · `WineOrder.totalAmount` · `Payment.amount` ·
`Price.pricePerPerson` · `Price.tastingLunchPricePerPerson` · `Price.registrationPrice` ·
`OrderMasterclass.pricePerUnit` · `OrderExtra.amount` · `WineOrderItem.priceSnapshot` ·
`WineVintage.price` · `MasterclassItem.pricePerUnit`

### Sub-steps

- **3a — Build the seam.** New `lib/money.ts`: a `Tetri` branded type, `formatTetri()`
  for display, `parseMajorToTetri()` for form input. Nothing else changes yet. Ship and
  verify in isolation.
- **3b — Schema + destructive migration.** Convert the columns. Wipe transactional data
  per the authorisation above. Dev first, always.
- **3c — Write paths.** `createBooking.ts`, `submitWineOrder.ts`, `pricing.ts`,
  `pricingUtils.ts`, `orders.ts`, `wineOrders.ts`, admin new-order/new-wine-order forms,
  onboarding, seeds.
- **3d — Read/display paths.** Admin tables, calendar, order detail, statistics,
  `InvoicePrint.tsx`, the four email templates, public site, wine catalogue.
- **3e — The Flitt boundary.** `toMinorUnits` becomes a no-op or is deleted; amounts
  arrive already in tetri. **This is the single highest-risk edit in the chunk** — get
  it wrong by a factor of 100 and guests are charged 100× or 1/100×.
- **3f — Green the suite.** Especially `tier1-regression/payment-amount-integrity.spec.ts`,
  which already drives quoted-amount → Flitt → admin across every toggle combination.
  That test is the safety net; if it passes, the conversion is sound.

**Resume point:** _(none — not started)_

---

## Chunk 4 — Stop `recalcOrderTotal` repricing old bookings ⬜ not started

**Purpose:** fix a live bug. `lib/pricing.ts:4` recalculates from the company's **current**
`Price` rows. Change a company's pricing in March, add a ₾20 extra to their February
booking, and the whole booking silently reprices at March rates.

**Fix:** snapshot the tier onto the `Order` at booking time —
`ratePerPersonSnapshot`, `registrationPriceSnapshot` — and have `recalcOrderTotal` use
those instead of looking up `Price`. This is the pattern `OrderMasterclass.pricePerUnit`
and `WineOrderItem.priceSnapshot` already use; it makes bookings consistent with wine
orders rather than inventing anything.

**Bonus:** also fixes the silent `if (!tier) return` at `pricing.ts:31`, which today
means "no matching price tier → total quietly unchanged, no error, no log."

**Ordering:** must come **after** Chunk 3, so the new snapshot columns are created as
integer tetri rather than being converted twice.

**Resume point:** _(none — not started)_

---

## Chunk 5 — `OrderEvent` table ⬜ not started

**Purpose:** the history layer. Every mature platform has one — Saleor has a model
literally called `OrderEvent`, Magento has `sales_order_status_history`. See
[[Research-OrderStatusPatterns]].

**Shape** (follows the existing `Payment` pattern — nullable `orderId` / `wineOrderId`,
exactly one set):

```
OrderEvent
  id           cuid
  tenantId     String?
  orderId      String?       → Order       (exactly one of these two)
  wineOrderId  String?       → WineOrder
  type         OrderEventType
  actorType    ActorType       SYSTEM | ADMIN | GUEST | GATEWAY
  actorId      String?
  fromStage    String?
  toStage      String?
  payload      Json?
  occurredAt   DateTime

  @@index([tenantId, orderId, occurredAt])
  @@index([tenantId, wineOrderId, occurredAt])
```

**Append-only.** Nothing ever updates or deletes a row.

**It does not replace the milestone columns.** `paidAt` stays as the hot-path current
state; events are history. Collapsing the two would be event sourcing, which is genuinely
over-complicated here.

**Cheap because the chokepoint already exists:** `lib/statusWrite.ts` is the single place
stage and milestone writes go. Three call sites total — plus `settle.ts` for gateway
outcomes and `orderExtras.ts` for line changes.

**Must satisfy:** the new-table checklist in `vault/RLS-Architecture.md`.

**Resume point:** _(none — not started)_

---

## Chunk 6 — `Payment` becomes a ledger ⬜ not started

**Purpose:** close the two-sources-of-truth split. Today `Payment` is a **Flitt attempt
log** — only card payments ever create a row. A manual "mark as paid" writes
`Order.paidAt` directly (`lib/statusWrite.ts:116`) with no `Payment` row at all.

Consequence: `SUM(Payment.amount)` gives card revenue; orders with `paidAt IS NOT NULL`
gives all revenue. Neither is wrong, nothing reconciles them, and nothing in the schema
says so.

**Fix:** add `method` (`CARD | BANK_TRANSFER | CASH | MANUAL`); every payment — including
manual ones — writes a row; `paidAt` becomes a cached convenience derived from the ledger.

**Also closes** the un-pay audit hole listed as "Still open, deliberately" in
`Plan-StatusModel.md`, if Chunk 5 lands first.

**Resume point:** _(none — not started)_

---

## Chunk 7 — Display/label tables ⬜ not started, low priority

**Purpose:** what Max asked for on 2026-09-18 — *"we can add tables just for display, so
it's comfy for us."*

A `StatusDisplay` table: `stage`, `tenantId?`, `label`, `labelKa`, `color`, `sortOrder`.
Lets a tenant rename "Completed" to "Visit finished", translate it, recolour it and
reorder the board **without a deploy** — while the enum stays fixed and code keeps
branching on it.

**This is the Magento pattern** (fixed `state` in code, customisable `status` in a table).
See [[Research-OrderStatusPatterns]].

**Hard rule, non-negotiable:** code branches on the **enum**, never on this table. The
moment a `switch` reads a label row, the type safety this design exists to protect is
gone.

**Touches roughly one file** (the display layer) versus the ten that a dynamic status
table would touch.

**Resume point:** _(none — not started)_

---

## Deferred, deliberately

- **`Invoice` entity.** `invoiceSentAt` currently has nothing behind it — no invoice
  number, amount, recipient or line snapshot. This is where the schema diverges most
  from industry norm. Build it when the B2B side justifies it.
- **`Customer` entity.** Name/surname/email/phone are already on every `Order` row, so
  nothing is lost and building it later is a backfill, not a recovery. Max: not a
  priority.
- **Reporting views / dimensional layer.** Max: not a priority. Chunk 5's event table is
  the natural source when it is.

---

## Questions — all answered 2026-09-18

1. ~~**`OrderExtra.label` — ad-hoc or recurring?**~~ **Accepted as unanswerable from
   data.** All current data is fake and the wipe removes it. Carried forward as a
   question for Nikalas Marani: what do they actually type in there? Five recurring
   strings → it wants a dimension table. Genuinely free-text → leave it alone. **Not a
   blocker for any chunk.**
2. ~~**Does `Price` want `updatedAt` as well as `createdAt`?**~~ **Both.** → Chunk 1.
3. ~~**Should `WineOrder` get `invoiceSentAt`?**~~ **Yes, add it.** → Chunk 1.

### Wipe scope — settled, but re-confirm on the day

Max accepted finding 1 in [[Dependencies]]. **The wipe covers `Payment`, `OrderExtra`,
`OrderMasterclass`, `WineOrderItem`, `Order` and `WineOrder`. `Company` is left alone**,
because deleting it cascades to `Price`, `CompanyGuide` and `CompanyRepresentative` — and
price tiers are tenant configuration, not fake transactional data.

**Still re-confirm with Max on the day Chunk 3's migration actually runs.** It is
destructive and the authorisation is now over a day old.
