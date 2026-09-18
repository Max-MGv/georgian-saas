---
tags: [plan, schema, data-model, orders, money]
---

# Plan: Transactional data model fixes

**Status:** 🚧 **Chunks 0–6 complete 2026-09-18** (Features 192–197). Money is integer
tetri, proven end to end against the real Flitt gateway; an order's rates are frozen so a
later edit cannot reprice it; orders carry an append-only history; and every payment is a
ledger row whatever channel it arrived through.

**Chunk 7 is deferred by Max's decision** — no status tables for now; labels stay in
constants. Every chunk in this plan is now either complete or deliberately parked.

Everything is on `staging`. **Production is untouched** and internally consistent on the
pre-chunk-5 schema; nothing in this plan has gone near `master`.
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

Max confirmed on 2026-09-18 that wiping the transactional data is acceptable on both dev
and production — all of it is fake.

**Scope as actually executed:** `Payment`, `OrderExtra`, `OrderMasterclass`,
`WineOrderItem`, `Order`, `WineOrder`. **`Company` was deliberately spared**, because
deleting it cascades to `Price`, `CompanyGuide` and `CompanyRepresentative`, and price
tiers are tenant configuration rather than disposable test data ([[Dependencies]]
finding 1).

⚠️ **"With a wipe there is no backfill" was wrong**, and the correction matters: because
`Company` survives, so do 30 `Price` rows, 17 `WineVintage` and 9 `MasterclassItem` — real
money that had to be **converted**, not dropped. That is why Chunk 3's migration is
hand-written.

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
- **3d — Read/display paths, inputs and contracts.** ✅ **Complete 2026-09-18.** See below.
- **3f — Green the Playwright suite.** ✅ **Test 1 passes; tests 2–3 blocked on missing
  fixtures, which predates this work.** See below.

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

### 3d — what happened

Three kinds of change, not one. The sweep started as "198 occurrences of `₾`", but 46 of
those were translation labels in `lib/adminT.ts` (literal `₾` in strings like
"Amount (₾)") which needed **no** change, and a further handful are deliberate
non-money: four `₾✓` paid-marker glyphs, the hardcoded sample prices in
`BookingFormVisualPanel.tsx` and `MessagesPanel.tsx`, and prose in `demoTour.ts`.

| | |
|---|---|
| **Display** | ~150 sites across 30 files onto `formatTetri`. Grouping for the statistics cards and charts — **including the axis `tickFormatter`s**, which would otherwise have read in hundreds of thousands. Leading space for the Georgian invoice print. Forced decimals for invoices and receipts. |
| **Input** | Every form where a human types a price converts with `fromMajor`: company tiers, masterclass items, wine vintages, the onboarding wizard, order extras, manual per-person rates. Those inputs still hold **GEL** — that is what an admin types — and the conversion is the boundary. |
| **Contracts** | Server actions that take money now take `Tetri`: `prices.ts`, `masterclassItems.ts`, `wines.ts`, `onboarding.ts`, `orders.ts`. **Tightening these is what made the compiler useful**, and each tightening surfaced real call sites. |

### 🔴 Two real bugs found in 3d, both invisible to `tsc`

1. **`OrderDetail.tsx` and `NewOrderForm.tsx` mixed units.** Both parsed the manual
   tasting/lunch rates as GEL and then added them to `masterclassAmt` and `extrasAmt`,
   which were already tetri. A manually-priced order would have been wrong by 100× on
   part of its total. Found by tracing what `orders.ts` did with the values, not by any
   tool.
2. **`demoSeed.ts` would have seeded ₾0.55 per person.** Its tier and masterclass literals
   were written straight through. The literals stay readable as GEL; a `tierToTetri`
   helper converts once, at the write.

### 3f — the money path, proven end to end

`tier1-regression/payment-amount-integrity.spec.ts`, test 1 (**individual booking, payment
on/off**) now **passes**. Its output is the proof this chunk needed:

```
ZZPaymentIntegrity On · 19/09/2026 · 13:00 · 4
zz-payment-integrity-on-…@example.invalid
Incomplete since 18/09/2026 · 480 ₾
```

₾480 quoted on the public form → sent to the **real Flitt gateway** → stored as 48000 tetri
→ rendered back as ₾480. The redirect only happens after `createCheckout` accepts the
amount, so the gateway leg is covered too.

#### The spec was stale, and not because of money

It had been broken since Feature 191 landed **the same day**, and nothing re-ran it. It
followed the Flitt redirect and then looked for the order in `/admin/orders` with an
**"Awaiting Payment"** control — but Feature 191 stamps such an order `abandonedAt`, moves
it to `/admin/abandoned`, and removed those limbo statuses entirely. Re-pointed at the
Incomplete screen; the money assertion moved screens unchanged.

Two further fixes worth knowing:
- **An assertion had become vacuous.** The reservation-only branch checked an
  "Awaiting Payment" button had count 0 — trivially true once the control exists nowhere.
  Now asserts the real invariant: such a booking must **not** appear on the Incomplete
  screen.
- **Whitespace is stripped before comparing the amount**, because the Incomplete screen
  renders `480 ₾` and the orders table renders `480₾`. Both come from `formatTetri`, which
  takes the separator as an option; the assertion is about the amount, not the spacing.

#### 🔴 Open, and NOT caused by this work: tests 2–3 cannot run

They require fixture companies **`Test Company # 1`** and **`Wine Test Company`**, each
with a real access code. The dev database holds `demoSeed`'s companies instead —
Individuals, Kakheti Wine Routes, Tbilisi Tour Collective, Caucasus Vine Travel, Alazani
Valley Tours, Silk Road Journeys, Sighnaghi Wine Bar, Restaurant Kakhuri, Vinoteka
Batumi, Marani Import GmbH — **all with `accessCode: null`**. A demo reset replaced the
fixtures at some point before this session.

Chunk 3's migration deletes six tables and `Company` is not one of them, so this is not
fallout from the wipe. **To close it:** create the two fixture companies with access codes
and price tiers, then re-run. Test 2 alone takes ~8 minutes and drives several real Flitt
redirects, so it wants its own pass.

### Verification

`next build` passes · `tsc --noEmit` **0 errors** · `eslint` clean · `test-money.ts`
**47/47** · `test-flitt-signature.ts` **37/37**.

Driven on staging after deploy, with a cache-busting query param:

| Screen | Renders |
|---|---|
| Public booking form | **`70₾ × 4 guests` → `280₾`** — byte-identical to pre-migration |
| Companies | `50₾ / 100₾ defaults` |
| Masterclass | `35₾` |
| Wine catalogue | `15₾` / `40₾` / `22₾` / `25₾` per bottle |

An audit for raw currency interpolation outside `formatTetri` now returns only the
deliberate cases listed above.

> ⚠️ **Deploy timing, again.** The first check after pushing 3d showed `7000₾ × 4 guests`
> and looked like a failed fix. The deployment was still `BUILDING`. **Confirm the Vercel
> deployment reports `READY` before concluding anything from a staging check** — and then
> still cache-bust. This has now cost time twice in one session.

---

## Chunk 4 — Stop `recalcOrderTotal` repricing old bookings ✅ built on dev 2026-09-18

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

### What was built

Migration `20260918142545_order_rate_snapshots` — three nullable tetri columns on `Order`:
`tastingRateSnapshot`, `lunchRateSnapshot`, `registrationFeeSnapshot`. Written wherever an
order is priced: the public booking form, the admin new-order form, and an admin edit.

**The distinction that matters.** An admin editing guest counts or rates **is**
deliberately re-pricing, so the snapshot moves with it. A *line* change — adding an extra
— must never disturb the agreed rates. Opposite intents, and now opposite behaviour.

### Two further bugs fixed in passing

1. **An order priced from hand-typed rates could never be recalculated at all.** Those
   rates were used once and thrown away, so `recalcOrderTotal` bailed out with no company
   tier to read. They are now snapshotted like any other rate.
2. **`if (!tier) return` was a silent no-op** that left the total untouched and gave the
   caller no reason to think anything had gone wrong. It still cannot invent a price, but
   it logs rather than hiding.

### A hole an earlier draft of this chunk introduced, caught by writing the test

Seeding the snapshot from the individuals tier for **every** booking meant a company
booking that no tier prices — total deliberately 0, "confirmed after submission" — would
carry individuals' rates, and a later recalc would **invent a price the winery never
quoted**. Company bookings now keep a `NULL` snapshot unless a company tier actually
prices them. Worth recording: the bug was invisible until the scenario was written down
as a test.

### Verification

New `scripts/test-order-repricing.ts` builds the exact scenario — an order sold at
₾70/head, the winery then raises rates to ₾90, an admin adds a ₾20 extra:

| Assertion | |
|---|---|
| Extra added at the **original** rates | ₾325 ✅ |
| Explicitly **not** repriced | ≠ ₾430 ✅ |
| Snapshot-less order falls back to live tiers (and logs) | ₾410 ✅ |
| Split counts price off the snapshot | ₾295 ✅ |
| Probe data cleaned up | ✅ |

**6/6 passing.** `next build` passes; `tsc --noEmit` 0 errors.

**Resume point:** complete on dev, pushed to `staging`. Chunk 5 may start.

---

## Chunk 5 — `OrderEvent` table ✅ built on dev 2026-09-18

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

### 🔴 Where this plan was wrong

It said to hook the events into `lib/statusWrite.ts`, "the single chokepoint for status
writes". **That module is pure and DB-free on purpose** — its own header says so — so the
client can apply the same patch optimistically and see the flow-line move before the round
trip. Writing to a database from it would have broken that.

The real write sites are the **server actions**, and that is where the events went.
`statusWrite.ts` is untouched.

### Where events are written

All inside the caller's transaction, so an event can never claim a change that was rolled
back, and a change can never happen unrecorded.

| Site | Actor | Records |
|---|---|---|
| `changeBookingStatus` / `changeWineOrderStatus` | ADMIN | from/to stage, paid, unpaid, invoice sent, restored |
| `settle.ts` | GATEWAY | paid, and **declined** |
| `orderExtras` add/remove | ADMIN | label + amount (read **before** the delete) |
| `createBooking` | **GUEST** | the timeline's first row |
| `createOrderAdmin` | **ADMIN** | ‹‹ same, different actor |

The GUEST/ADMIN split on creation is deliberate: a walk-in entered by staff and a guest's
own submission are different facts, and the history should not blur them.

`requireAdmin` now **returns the Supabase user** so an event can record *who* acted. Every
pre-existing caller ignores the return value, so it is additive.

**Never load-bearing:** screens read the columns, not this table. A failed write here is a
lost record, not a broken order.

### Verification

New `scripts/test-order-events.ts` — **12/12**.

It checks **RLS isolation first**, and from a real tenant context rather than as
superuser, because a wrong policy on a new table does not error: it silently hides every
row from every tenant. `Plan-StatusModel.md` records that failing silently once already.
The script asserts both directions — a tenant sees its own events, cannot see another's,
**and** the table is not simply empty for everyone (the inverse failure).

Also covers: the timeline reads back in order, the actor is recorded, and events cascade
away with their order while a different order's are untouched.

Alongside: `test-money` 47/47, `test-order-repricing` 6/6, `test-order-status` green,
`test-rls` 21/21, `next build` passes, `tsc --noEmit` 0 errors. RLS now covers 16 tables.

**Resume point:** complete on dev, pushed to `staging`. Chunk 6 may start.

---

## Chunk 6 — `Payment` becomes a ledger ✅ built on dev 2026-09-18

**Purpose:** close the two-sources-of-truth split. Today `Payment` is a **Flitt attempt
log** — only card payments ever create a row. A manual "mark as paid" writes
`Order.paidAt` directly (`lib/statusWrite.ts:116`) with no `Payment` row at all.

Consequence: `SUM(Payment.amount)` gives card revenue; orders with `paidAt IS NOT NULL`
gives all revenue. Neither is wrong, nothing reconciles them, and nothing in the schema
says so.

**Fix:** add `method` (`CARD | BANK_TRANSFER | CASH | MANUAL`); every payment — including
manual ones — writes a row; `paidAt` becomes a cached convenience derived from the ledger.

**Also closes** the un-pay audit hole listed as "Still open, deliberately" in
`Plan-StatusModel.md` — chunk 5 landed first, so both halves of that trail now exist.

### What was built

`method` (`CARD | BANK_TRANSFER | CASH | MANUAL`) and `reversedAt` on `Payment`, plus
`lib/payments/manualPayment.ts`. Wired into both status actions, so marking an order paid
by hand writes a real row.

`method` defaults to **CARD** because every row that existed before was a Flitt attempt.
Hand-recorded payments land as **MANUAL** rather than being guessed at — the admin is not
asked how the money arrived, so `BANK_TRANSFER` and `CASH` exist for when a picker is
added rather than putting a fact in the ledger nobody asserted.

### Two rules carry it, both easy to get subtly wrong

1. **No double counting.** An order the gateway already settled gains no second, manual
   row when an admin toggles paid off and on. Guarded by checking for an existing settled,
   unreversed payment first.
2. **A real card payment is never marked reversed.** That money is with the gateway;
   saying otherwise would misstate reality. Un-paying a gateway-paid order is an admin
   override, and chunk 5's `OrderEvent` is what records it.

**Reversal, not deletion** — a ledger that can lose rows is not a ledger.

**`paidAt` stays** as the cached current state: read on every board render, every filter,
and enforced by a DB constraint against `abandonedAt`. The ledger sits beside it in
agreement. Making `paidAt` a derived query would put a join on the hot path for no gain.

### Verification

`scripts/test-payment-ledger.ts` — **16/16**, covering both rules above plus a
**reconciliation check**: collected revenue from the ledger agreeing with the orders' own
totals, which was impossible before.

`test-money` 47/47 · `test-order-repricing` 6/6 · `test-order-events` 12/12 · `test-rls`
21/21 · `next build` passes · `tsc --noEmit` 0 errors.

**Resume point:** complete on dev, pushed to `staging`.

---

## Chunk 7 — Display/label tables ⏸️ DEFERRED — Max's call, 2026-09-18

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

### ✅ What shipped instead (Feature 198)

The cheap part of this chunk, done in constants rather than a table:

- Wine orders rendered `NEW` as **"Pending"** while bookings rendered the same enum value
  as **"New"**. Both now read **New**, in English and Georgian.
- The rename was applied to **every place the stage is named**, not just the status badge:
  the filter pills (same map), the Pack-mode help text, and the wine Statistics "Active
  orders" sub-label, which read *"pending · confirmed · paid"*.
- Two keys Feature 191 orphaned and nothing referenced were removed from both locales:
  `wineOrders.status.pending` and `orders.status.pendingPayment` ("Awaiting Payment").

i18n parity **1077/1077**. A sweep for user-facing "Pending" naming this stage now returns
nothing.

What remains is the table itself, and it carries a real trade-off:

| | |
|---|---|
| **Gains** | A winery can rename "Completed" to "Visit finished", translate it, recolour it and reorder the board **without a deploy**. Labels leave frontend constants. |
| **Costs** | A per-request lookup on the hot path — the orders list, board and calendar all render labels. `Perf-Baseline-2026-07-29.md` is the record of what hot-path latency costs here. |
| **Risk** | Without an admin UI it is **a table nothing writes**, which this project has explicitly called out as worse than an absent one (see `WineOrder.invoiceSentAt`). The whole status debate ended by deleting machinery nobody used. |

**Max chose C on 2026-09-18:** *"lets hold off on status tables for now."* No table is
built. Labels stay in `lib/adminT.ts`.

He also settled the vocabulary itself: **the first stage is called "New" on bookings and
wine orders alike.** Applied everywhere it is named, not just on the badge — see below.

**When this is picked up again, build option B** (table *and* admin UI together) rather
than A. A table with no writer is the thing this project has repeatedly found to be worse
than an absent one, and the whole status debate ended by deleting machinery nobody used.

**Resume point:** deferred by decision, not blocked. Nothing depends on it.

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
