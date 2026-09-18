---
tags: [schema, data-model, definitions, reference]
---

# Definitions — what the transactional tables actually mean

**Written 2026-09-18 (Chunk 2 of [[Plan-DataModel]]).** Every claim here was checked
against the code or the dev database, not assumed.

This file exists because of a specific class of error found on 2026-09-18: not bugs in
the code, but **confident wrong beliefs about what a row means.** A query can be
individually valid and still answer the wrong question. These are the definitions that
stop that.

---

## 1. An order row is an *attempt*, not a sale

`Order` and `WineOrder` rows are created **when the form is submitted**, before any money
moves. A guest who reaches the card page and closes the tab leaves a permanent row behind.

**Realness is `abandonedAt IS NULL`.** Not a flag, not a status — that one column.

Spread the canonical fragment into **every** order query:

```ts
import { NOT_ABANDONED } from '@/lib/orderFilters'
where: { tenantId, ...NOT_ABANDONED }
```

Forgetting it does not error. It quietly puts abandoned rows back into the list, the
counts, the board or the export, looking exactly like fresh orders needing attention.
`lib/orderFilters.ts` calls this "the single most likely silent regression in this
feature", and it has already happened once — the CSV export and the screen it exported
from disagreed, and nothing caught it because both queries were individually valid.

> **The table is a table of intents.** Every revenue question has to filter. That is
> normal and correct — the alternative loses every abandoned cart and cannot support
> invoice-terms customers at all — but it must be conscious.

---

## 2. "Revenue" means three different things right now

This is the one to be careful with. **Two screens compute revenue differently, and
neither is labelled with its definition.**

| Surface | Filter | Counts cancelled? | Counts unpaid? |
|---|---|---|---|
| Orders page — "Future Revenue" (`orders/page.tsx:204`) | `NOT_ABANDONED` + `date >= today` + `stage != CANCELLED` | ❌ No | ✅ Yes |
| Statistics — "Total Revenue" (`statistics/page.tsx:41`) | `NOT_ABANDONED` only | ✅ **Yes** | ✅ Yes |

### 🔴 Measured on the dev tenant, 2026-09-18

| | |
|---|---|
| Statistics reports | **₾208,202** |
| Of which 30 **cancelled** bookings | **₾15,017** |
| Excluding cancelled | ₾193,185 |
| **Overstatement** | **7.2%** |

A cancelled booking is not revenue by any ordinary reading. This is **probably a bug**,
but it is Max's call, not a unilateral fix — it is logged as an open question below rather
than silently changed.

### Whatever is decided: none of these numbers is cash

Every revenue figure in the app is **booked**, not **collected.** An order counts toward
revenue whether or not `paidAt` is set. To ask what was actually collected, filter on
`paidAt IS NOT NULL` — and note that even then the answer is incomplete until Chunk 6,
because manual payments write `paidAt` without creating a `Payment` row.

---

## 3. Grain — what one row means, per table

A **fact** table is not defined by importance; it is defined by its **grain**.

| Table | One row = | Grain |
|---|---|---|
| `Order` | one booking attempt | **header** |
| `WineOrder` | one wine order attempt | **header** |
| `OrderMasterclass` | one masterclass item on one booking | line |
| `OrderExtra` | one ad-hoc charge on one booking | line |
| `WineOrderItem` | one wine on one wine order | line |
| `Payment` | one payment attempt on one order | line |

### The rule that follows

> **Never sum a header amount across a join to a line table.**

`SELECT SUM(o."totalPrice") FROM "Order" o JOIN "OrderMasterclass" m ON m."orderId" = o.id`
counts a booking with three masterclass lines **three times**. The join multiplies rows;
the header amount does not know that.

Header questions ("revenue this month") are answered from header tables. Line questions
("which masterclass sells best") can only be answered from line tables — no amount of
querying `Order` will get you there.

### `totalPrice` already includes the lines

`recalcOrderTotal` (`lib/pricing.ts:4`) sums guest-tier price + masterclass lines +
extras, and `addOrderExtra` / `removeOrderExtra` both call it. So `Order.totalPrice` is
the whole booking. Adding line amounts to it double-counts.

⚠️ It recalculates from the company's **current** `Price` rows, which is the repricing bug
Chunk 4 fixes.

---

## 4. Dimensions vs facts

**Dimensions** — what exists, independent of any order:
`Tenant` · `Company` · `CompanyGuide` · `CompanyRepresentative` · `Wine` · `WineVintage` ·
`MasterclassItem` · `MenuItem` · `Price`

**Facts** — records of something that happened:
`Order` · `WineOrder` · `OrderMasterclass` · `OrderExtra` · `WineOrderItem` · `Payment`

`MasterclassItem` ("Churchkhela making, ₾25/piece") is a dimension. `OrderMasterclass`
("this booking took 4 at ₾25") is a fact. Deleting a booking removes the second and leaves
the first untouched.

**There is no star schema here and there should not be.** These are entity tables in an
OLTP database. Dimensional modelling is a reporting pattern; if a warehouse is ever wanted,
it is derived from these, never a change to them. See [[Research-OrderStatusPatterns]].

### Line tables snapshot their prices — deliberately

`OrderMasterclass.pricePerUnit` and `WineOrderItem.priceSnapshot` (plus
`wineNameSnapshot` / `vintageYearSnapshot`) freeze the value at order time. **A dimension
may change; a fact must not.** `WineOrderItem.wineVintageId` is nullable with
`onDelete: SetNull`, so deleting a vintage from the catalogue leaves historic orders intact
and still readable.

Bookings do **not** yet do this for the guest-tier price. That asymmetry is Chunk 4.

---

## 5. Stage vs money — two different mechanisms, on purpose

| Question | Stored as | Why |
|---|---|---|
| *Where is this order?* | `stage` enum — exactly one value | A position. One answer at a time. |
| *What has happened to it?* | milestone dates — `confirmedAt`, `completedAt` / `deliveredAt`, `invoiceSentAt`, `paidAt`, `abandonedAt` | History. Several are true at once and must not overwrite each other. |

The bug that caused the whole redesign was using one mechanism for both: a payment ladder
(`unpaid → invoiced → paid`) where marking an invoiced order paid **erased that an invoice
was ever sent.**

Dates also answer questions a ladder cannot: *paid before or after the visit?*
(`paidAt` vs `completedAt`), *how long do companies take to pay?*
(`paidAt − invoiceSentAt`), *who is overdue?* (`invoiceSentAt` set, `paidAt` null).

### The payment filter partitions exactly

From `lib/orderFilters.ts` — `paid` / `invoiced` / `unpaid` are mutually exclusive and
cover everything:

- `unpaid` = "we have not even asked yet" — **not** merely "not paid"
- `invoiced` = invoiced **and still outstanding** — the chasing list
- `paid` = `paidAt` set, regardless of whether an invoice preceded it

This matters because the picker shows a count beside each option. A previous release
reported `All statuses (31)` against 21 bookings because two buckets overlapped.

---

## 6. Known column-level traps

| Column | Trap |
|---|---|
| `WineOrder.invoiceSentAt` | Exists since 2026-09-18 but **nothing writes it.** Empty means "no record either way", **not** "no invoice was sent". |
| `Payment.status` | The **gateway's** verbatim string, not ours. Not an enum on purpose — coercing it would lose detail that matters in a dispute. |
| `Payment.settledAt` | Set **only on approval.** A declined attempt keeps its row and its status but never gets a `settledAt`. |
| `Payment` rows | **Card payments only.** Manual "mark as paid" writes `Order.paidAt` with no `Payment` row (`lib/statusWrite.ts:116`). Until Chunk 6, `SUM(Payment.amount)` is card revenue, not all revenue. |
| All money columns | Still `Float` until Chunk 3. Do not trust exact equality comparisons. |
| `Order.guestCount` vs `lunchGuestCount` / `tastingGuestCount` | The latter two are `0` for pre-v1.2 orders, meaning "not set" rather than "zero guests". |

---

## ✅ Resolved 2026-09-18 — cancelled orders no longer count as revenue

Max confirmed the change on the day it was raised. Statistics now excludes cancelled
orders as well as abandoned ones, on **both** the bookings and wine tabs, via the new
`NOT_CANCELLED` fragment in `lib/orderFilters.ts`.

**Excluded at the query, not at each sum.** Every figure on that page derives from one
query, so counts and revenue move together — an average order value built from a revenue
that skips cancellations and a count that does not would simply be wrong.

Verified live on staging against the database, to the exact tetri:

| | Before | After | DB says |
|---|---|---|---|
| Bookings 2026 — monthly chart | ₾112,783 | **₾104,462** | ₾104,462 ✅ |
| Bookings 2026 — company chart | ₾112,783 | **₾104,462** | ₾104,462 ✅ |
| Wine orders 2026 | 39 / ₾111,541 | **38 / ₾106,339** | 38 / ₾106,339 ✅ |

"Future Revenue" on the Orders page was **unchanged**, which is correct — that strip
already excluded cancelled. That is the inconsistency this closed.

**Cancelled orders remain fully visible** in the list, board, calendar and export. They
are real and a winery needs to see them. They are simply not money and not volume.

> ⚠️ **Verification gotcha, cost ~10 minutes.** Re-checking a deployed change in the same
> browser tab showed the **old numbers for several minutes** after the Vercel deployment
> reported READY — Next.js router cache and browser HTTP cache both serve the stale RSC
> payload for a URL already visited. It looked exactly like "the fix does not work."
> **Append a throwaway query param** (`?cb=<something>`) when verifying, or the result is
> untrustworthy.
