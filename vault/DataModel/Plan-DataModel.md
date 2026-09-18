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

## Chunk 2 — Write down the definitions ✅ complete 2026-09-18

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

### Delivered

[[Definitions]] — six sections plus a column-level trap table. Everything in it was
checked against code or the dev DB rather than written from memory.

### 🔴 Found while writing it: two screens disagree about revenue

Not a doc problem — a real inconsistency, measured on the dev tenant:

| Surface | Excludes cancelled? | |
|---|---|---|
| Orders page, "Future Revenue" (`orders/page.tsx:204`) | ✅ yes | `stage != CANCELLED` |
| Statistics, "Total Revenue" (`statistics/page.tsx:41`) | ❌ **no** | `NOT_ABANDONED` only |

Statistics reports **₾208,202**, of which **₾15,017 across 30 cancelled bookings** —
a **7.2% overstatement**, if a cancelled booking is agreed not to be revenue.

**✅ Fixed same day** — Max confirmed ("definitely change it, good catch"). New
`NOT_CANCELLED` fragment in `lib/orderFilters.ts`, applied to both queries in
`statistics/page.tsx`. Verified live against the DB to the exact tetri: bookings 2026
₾112,783 → **₾104,462** (both the monthly and the company chart, independently), wine
orders 2026 39/₾111,541 → **38/₾106,339**. `WineStatistics.tsx` had been contradicting
itself on one screen — revenue summed cancelled orders while the "active orders" count
beside it already excluded them. Full detail in [[Definitions]].

**Resume point:** complete. Chunk 3 may start — but see the wipe re-confirmation note.

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

### ✅ Assumptions verified 2026-09-18, before starting

Six checks run against the schema, the database and the test runner. **Two of them
changed the plan.**

| # | Assumption | Verdict |
|---|---|---|
| 1 | "The wipe means no backfill" | 🔴 **WRONG — see below** |
| 2 | Surviving price data is clean to 2dp | ✅ **0 rows** with >2 decimals in `Price`, `WineVintage`, `MasterclassItem`. Conversion is exact and lossless. |
| 3 | The money-column list is complete | ✅ Confirmed from the schema: **11 money Floats**. Four Floats correctly stay: `Company.wineDiscountPercent`, `WineOrder.discountPercent` (percentages) and `Wine.alcoholLevel`, `WineVintage.alcoholLevel` (not money at all). |
| 4 | Chunk 1's `Payment` cascade works | ✅ **Proven functionally**, not assumed — created an order + payment, deleted the order, payment was gone. Probe rows cleaned up. |
| 5 | `payment-amount-integrity.spec.ts` is a usable safety net | ✅ **4 tests**, listable, and `playwright.config.ts` auto-starts its own dev server (`reuseExistingServer: true`). |
| 6 | Display goes through some formatter | 🔴 **WRONG — see below** |

### 🔴 Correction 1 — the wipe does *not* remove all money data

Three **catalog** tables survive the wipe (`Company` is excluded, and `Price` hangs off it)
and carry **real prices that must be converted, not dropped**:

| Table | Rows on dev | Columns |
|---|---|---|
| `Price` | 30 | `pricePerPerson`, `tastingLunchPricePerPerson`, `registrationPrice` |
| `WineVintage` | 17 | `price` |
| `MasterclassItem` | 9 | `pricePerUnit` |

**Consequence for 3b:** Prisma will not generate a correct `Float → Int` migration on its
own — a plain type change casts and loses the ×100. The migration SQL must be hand-edited
to `ALTER TABLE ... TYPE INTEGER USING ROUND(column * 100)`. Check 2 is what makes that
safe: no value has sub-tetri precision to lose.

`Payment` is **empty (0 rows)** on dev, so its column converts with nothing to migrate.

### 🔴 Correction 2 — there is no formatter to switch over; every site interpolates raw

Confirmed across the admin table, the booking form, the invoice print and the email
templates: money is rendered as bare interpolation — `${order.totalPrice}₾`,
`${totalPrice} ₾`, `${data.totalPrice}₾`.

**So after conversion `4500` renders as "4500₾"** — no type error, no crash, just a
plausible wrong number on a customer's invoice. This is the single biggest silent-failure
surface in the chunk and it is why 3a builds `formatTetri` *first*.

Real scope is **49 application files** under `app/`, `lib/` and `components/` (the earlier
"58" counted tests, scripts and the schema).

### Sub-steps

- **3a — Build the seam.** ✅ **Complete 2026-09-18.** New `lib/money.ts` — `Tetri` branded
  type, `asTetri` / `fromMajor` / `toMajor`, `formatTetri`, `parseMajor`, `sumTetri`,
  `multiplyTetri`, `applyPercent`. Nothing else changed; purely additive.
  - **The brand is the point.** `Tetri` is a plain integer at runtime (round-trips through
    Prisma, JSON and React props untouched) but is not assignable from a bare `number`, so
    the 100× error becomes a compile error rather than a wrong invoice.
  - **`formatTetri`'s default output is byte-identical to today's** for whole-GEL amounts
    (`4500` → `"45₾"`), which is what keeps 3d invisible on screens that were already
    right. Options cover the three formats actually in use: grouping (`"24,301₾"`,
    Statistics), leading space (`"45 ₾"`, the Georgian invoice print), and forced decimals
    (invoices).
  - **Verified:** `scripts/test-money.ts`, **47/47 passing**, no database needed. Includes
    the property the whole change exists for — a hundred ₾0.10 amounts sum to exactly
    ₾10.00, where the float equivalent does not — plus the `49.985` truncation case that
    `toMinorUnits` was already guarding against. `tsc --noEmit` and `eslint` clean.
- **3b — Schema + destructive migration.** ✅ **Complete 2026-09-18.** See below.
- **3c — Write / compute paths + the Flitt boundary.** ✅ **Complete 2026-09-18.** (3e was
  folded in here — the boundary and the writes are the same money path and splitting them
  would have left an incoherent intermediate state.)
- **3d — Read/display paths.** ⬜ **NOT STARTED. This is the current resume point.**
- **3f — Green the Playwright suite.** ⬜ Not started. Blocked on 3d.

### 🔴 The biggest finding of the chunk: `tsc` catches nothing

[[Dependencies]] claimed most of the affected files would "break loudly… verified by
`tsc`". **That was wrong.** Prisma maps both `Float` and `Int` to TypeScript `number`, so
changing the column type produced **zero type errors** across the entire project.

There is no compiler safety net for this change. Every call site is a silent breakage.

What *did* work is the `Tetri` brand from 3a: typing `CreateCheckoutInput.amount` as
`Tetri` immediately surfaced three real call sites (`startCheckout.ts`,
`createBooking.ts`, `submitWineOrder.ts`) that the plain type change had left invisible.
**That is the entire justification for the branded type, demonstrated.** Extend the brand
outward to get coverage; grep is the only alternative.

### 3b — what happened

Migration `20260918124045_money_to_tetri`, **hand-written**. `prisma migrate dev` refused
to run non-interactively, and its warning confirmed why the file had to be written by
hand anyway: it generates a plain `ALTER TABLE ... TYPE INTEGER` cast, which turns `45.0`
into `45`, not `4500` — **silently dividing every catalog price by 100.**

Applied with `prisma migrate deploy`, then `prisma generate` (`✔ Generated Prisma Client`
confirmed, Rule 10).

**Verified:**
- **116 catalog values compared against a pre-migration dump, 0 mismatches.** Every
  surviving price is exactly ×100 (e.g. `25` → `2500`).
- Transactional tables all empty: `Order`, `WineOrder`, `Payment`, `OrderExtra`,
  `OrderMasterclass`, `WineOrderItem` = 0.
- `Company` (22) and `Price` (30) survived, as designed.

### 3c — what happened

- **`toMinorUnits` deleted** from `payments/flitt.ts`. `CreateCheckoutInput.amount` is now
  `Tetri` and passes through unconverted. Deleted rather than left as a no-op on purpose:
  a surviving call against an already-tetri amount would charge **100×** and neither the
  compiler nor Flitt would object.
- `settle.ts`'s amount gate is now an integer-to-integer comparison, no conversion.
- `startCheckout.ts`'s `amount` typed `Tetri`; both callers assert with `asTetri()`.
- **`pricing.ts` and `pricingUtils.ts` needed no logic change at all** — every input is
  now tetri and integer arithmetic keeps it there (`4 × 7000 = 28000`). Worth knowing
  before anyone "fixes" them.
- `scripts/test-flitt-signature.ts` re-pointed at `fromMajor`, keeping its IEEE-754 trap
  cases verbatim.

**Verified:** `tsc --noEmit` **0 errors** project-wide; `test-money.ts` **47/47**;
`test-flitt-signature.ts` **37/37**.

### ⚠️ Resume point — READ BEFORE CONTINUING

**3d has not started, so every screen currently renders raw tetri** — a ₾45 booking shows
as `4500₾`. Staging is mid-migration and *looks* broken. It is not data loss; it is
formatting.

**The sweep:** 198 occurrences of `₾` across 33 files. Replace raw interpolation
(`${order.totalPrice}₾`) with `formatTetri(asTetri(...))`. `formatTetri`'s default output
is byte-identical to the old rendering for whole-GEL amounts, so correct screens should
not visibly change.

Largest first: `lib/adminT.ts` (46 — mostly translation strings, check before touching),
`OrderDetail.tsx` (21), `NewOrderForm.tsx` (15), `BookingForm.tsx` (13),
`OrdersTable.tsx` (11), `StatisticsClient.tsx` (10), `InvoicePrint.tsx` (10).

**Also still to do in 3d:** admin forms where a human *types* a price
(`prices.ts`, `masterclassItems.ts`, wines/vintages, onboarding) must convert input with
`fromMajor()`, and `lib/demoSeed.ts` + `scripts/seed*.ts` hold hardcoded major-unit
literals that now mean 1/100 of what they say.

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
