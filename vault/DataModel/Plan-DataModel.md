---
tags: [plan, schema, data-model, orders, money]
---

# Plan: Transactional data model fixes

**Status:** 📋 Written 2026-09-18, **nothing built.** Awaiting Max's go on Chunk 0.
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

## Chunk 0 — Baseline and unblock ⬜ not started

**Purpose:** find out what state the environments are actually in before changing
anything. There is a suspected inconsistency.

**The suspicion:** `Plan-StatusModel.md` records the **dev database** as already migrated
to the chunk-5 schema (old `status` column dropped), while the **staging site** is still
running the pre-chunk-5 code that reads that column — because the two commits were never
pushed. If both are true, `staging.vineworks.ge` is broken right now and nobody has
noticed.

**Steps:**
1. Load `staging.vineworks.ge` and open the Orders screen. Does it render or error?
2. Confirm against the dev DB which columns actually exist on `Order` / `WineOrder`.
3. If staging is broken: push the two commits to `staging` — that is the fix, not a
   new change.
4. Record the true state of dev / staging / prod schemas in this file before moving on.
5. Re-confirm with Max that the wipe is still authorised **on the day it runs** (the
   original confirmation was 2026-09-17).

**Do not start Chunk 1 until the environment map here is written down.**

**Resume point:** _(none — not started)_

---

## Chunk 1 — Timestamps ⬜ not started

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
- `Price`

**Why now and not later:** these cannot be obtained retroactively. Every day without
them is history that does not exist. They are one line each.

**Watch for:** `Price` is edited in place by `app/actions/prices.ts`; adding `updatedAt`
there too is worth considering, but `createdAt` is the one that unblocks Chunk 4.

**Verification:** `prisma migrate dev` against dev (Rule 10 — stop the dev server first),
confirm `✔ Generated Prisma Client`, then create a booking and an extra through the UI
and check both rows carry timestamps.

**Resume point:** _(none — not started)_

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

## Open questions for Max

1. **`OrderExtra.label` — ad-hoc or recurring?** The original plan was to check this
   against real data. **That check is impossible:** all current data is fake, and the
   wipe removes it anyway. So this has to be answered by asking Nikalas Marani what they
   actually type in there. If it is five recurring strings it wants a dimension table; if
   it is genuinely free-text, leave it alone.
2. **Does `Price` want `updatedAt` as well as `createdAt`?** (Chunk 1.) Pricing is edited
   in place, so without it there is no record of when rates changed — but Chunk 4's
   snapshot makes that less load-bearing than it sounds.
3. **`WineOrder` has no `invoiceSentAt`** while `Order` does. Deliberate today (no wine
   invoice flow exists). Confirm that is still right, or fold it into Chunk 1 as one
   additive column.
