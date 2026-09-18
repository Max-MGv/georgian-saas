---
tags: [schema, data-model, dependencies, risk]
---

# Dependencies and blast radius

**Written 2026-09-18, before any code changed.** Read before starting [[Plan-DataModel]]
Chunk 3. Every claim here was checked against the code, not assumed.

---

## 🔴 Two hazards found in the wipe itself

Max authorised "a complete transactions / orders / companies wipe, since all data is fake
on both prod and dev." Two consequences of that are **not obvious from the sentence** and
need an explicit decision before anything is deleted.

### 1. Wiping `Company` destroys all pricing configuration

`schema.prisma:208` — `Price.company` is `onDelete: Cascade`. So is `CompanyGuide`
(`:101`) and `CompanyRepresentative` (`:115`).

**Deleting a company deletes its price tiers, its guides and its representatives.**

Price tiers are **configuration, not transactional data.** They are what the onboarding
wizard exists to set up, they are per-company, and they are what every booking is priced
from. "The orders are fake" is true; "the prices are fake" is a different claim and
probably not one Max meant to make.

| Cascades away with a Company | Is it really disposable? |
|---|---|
| `Price` rows (tiers, lunch add-on, registration fee) | ❌ **No — this is tenant setup** |
| `CompanyGuide` (access codes people actually use) | ⚠️ Maybe not |
| `CompanyRepresentative` (invoice recipients) | ⚠️ Maybe not |

**Recommendation:** wipe `Order`, `WineOrder`, their line tables and `Payment`. **Leave
`Company` alone** unless Max specifically wants the companies gone too — and if he does,
export the `Price` rows first so they can be re-inserted.

### 2. Wiping orders orphans `Payment` rows instead of deleting them

`Payment.order` (`:316`) and `Payment.wineOrder` (`:318`) have **no `onDelete`**. For an
optional relation Prisma defaults to **`SetNull`**, not `Cascade`.

So deleting orders does not delete their payments — it leaves `Payment` rows with
`orderId = NULL` and `wineOrderId = NULL`. Unattributable, invisible to every screen, and
still carrying `amount` and `rawResponse`. They would then be silently converted by
Chunk 3 and sit in the table forever.

**Fix:** delete `Payment` rows **first**, explicitly, before deleting orders. Or add
`onDelete: Cascade` to both relations as part of Chunk 1.

Same shape applies to `Order.company` (`:179`) and `Order.guide` (`:184`) — both
`SetNull` by default. Harmless here only because the orders are being deleted anyway.

### Safe wipe order

```
Payment  →  OrderExtra / OrderMasterclass / WineOrderItem  →  Order / WineOrder
```

(The line tables do cascade correctly — `:249`, `:258`, `:434` are all explicit
`onDelete: Cascade` — so deleting the order headers is enough for those. `Payment` is
the one that needs doing by hand.)

---

## Money change — what breaks loudly vs silently

**58 files** reference money fields. **38 files** reference currency formatting. Heavy
overlap.

### 🔴 CORRECTION 2026-09-18 — the compiler catches NOTHING

**The section below was wrong and is kept only so the mistake is legible.** Prisma maps
both `Float` and `Int` to TypeScript `number`, so changing the column type produced
**zero type errors across the entire project**. There is no compiler safety net for a
unit change of this kind, and every affected site is a silent breakage.

What actually provided coverage was the `Tetri` branded type in `lib/money.ts`: typing
`CreateCheckoutInput.amount` surfaced three real call sites immediately, and each
subsequent tightening of a server action's signature found more. **Extend the brand
outward to get coverage; grep is the only alternative.**

Two bugs that no tool found, and that a careful reading of the money flow did:
`OrderDetail`/`NewOrderForm` mixed GEL rates into tetri totals, and `demoSeed` would have
seeded the sales demo at 1/100 of every price.

### ~~✅ Breaks loudly — safe, the compiler catches it~~ (WRONG — see above)

Anything that reads a money field into typed code. Changing `Float` → `Int` in Prisma
regenerates the client, and every arithmetic or assignment mismatch becomes a TypeScript
error at build time.

Covers most of `app/actions/*`, `lib/pricing.ts`, `lib/pricingUtils.ts`, the admin
components, and the server-side render paths. **This is the bulk of the 58 files and it
is the easy part** — tedious, mechanical, verified by `tsc`.

### 🔴 Breaks silently — the real danger

These take a number and do something with it without any type crossing a boundary the
compiler checks:

| Surface | Why it is silent |
|---|---|
| **`lib/payments/flitt.ts:76` — `toMinorUnits()`** | Already does `Math.round(amount * 100)`. After conversion, amounts arrive **already in tetri** — leaving this in place charges guests **100×**. Removing it too early charges **1/100×**. Neither is a type error. **The single highest-risk line in the whole plan.** |
| **The four email templates** | `bookingConfirmationTemplate`, `newBookingNotificationTemplate`, `invoiceEmailTemplate`, `wineOrderReceiptTemplate` — string interpolation into HTML. A raw `4500` renders as "4500 GEL" and looks plausible enough to ship. |
| **`InvoicePrint.tsx`** | Same, and it is a printed legal-ish document. |
| **`Payment.rawResponse` (Json)** | Existing rows hold Flitt's own amounts in tetri as strings. Untyped `Json`. Nothing converts, nothing warns. |
| **`lib/demoSeed.ts`** | Hardcoded amounts plus its own revenue rollups (`:619-650`). Feeds `demo.vineworks.ge`. Wrong numbers here are a **sales-facing** bug, not an internal one. |
| **`scripts/seed.ts`, `seed-fake-wine-orders-nm.ts`** | Hardcoded money literals. |
| **Playwright specs with hardcoded expected amounts** | `payment-amount-integrity.spec.ts`, `booking-enhanced.spec.ts`, `wine-catalogue-order.spec.ts`. These will fail — which is *good*, they are the safety net — but they must be updated deliberately, not just made green. |

### ⚪ Confirmed NOT affected

- **`lib/settings.ts`** — checked. No money values in `SETTING_DEFAULTS`; the only
  price-adjacent key is `show_company_price_after_booking`, a boolean string.
- **RLS policies** (`scripts/setup-rls.ts`) — they filter on `tenantId` and JOIN keys
  only. No policy references a money column, so a type change touches none of them.
- **Percentages** — `discountPercent`, `wineDiscountPercent` are not money and stay
  `Float`.

---

## What the new tables need

Any table added in Chunk 5 (`OrderEvent`) or Chunk 7 (`StatusDisplay`) must be wired into
**`scripts/setup-rls.ts`**, which is where every policy lives. `vault/RLS-Architecture.md`
has the checklist.

Note the three policy shapes already in that file: direct `tenantId` (most tables),
JOIN-to-parent (`Price`, `OrderMasterclass`, `OrderExtra`, `WineOrderItem`), and
application-filtered-only (`BugReport`). `OrderEvent` carries its own `tenantId`, so it
takes the **first, simplest** shape. `Plan-StatusModel.md` records that getting this wrong
hides every row from every tenant **with no error** — it fails silent, so verify with a
real cross-tenant read.

---

## ✅ Environment risk — resolved 2026-09-18 (Chunk 0)

**The suspicion was correct.** The dev DB had been migrated to chunk 5 on 2026-09-17
while the staging site still ran pre-chunk-5 code, so `staging.vineworks.ge` had been
broken for a day — reading `Order.status`, a column that no longer existed. Nobody had
looked.

Fixed by pushing the two commits (`5b68eec..70abd94`). Orders, Wine Orders and
`/admin/abandoned` all verified rendering in a browser afterwards. Full detail and the
environment map in [[Plan-DataModel]] Chunk 0.

**Production is untouched and internally consistent** — pre-chunk-5 schema, pre-chunk-5
code. It stays that way until Max deliberately merges `staging` → `master`.

---

## Ordering constraints, as a graph

```
Chunk 0 (baseline)
   └─> Chunk 1 (timestamps + Payment onDelete)
         ├─> Chunk 2 (definitions — no code, can run in parallel)
         └─> Chunk 3 (money)              ← wipe happens here
               └─> Chunk 4 (price snapshot)   ← must follow 3, or the new
                     └─> Chunk 5 (OrderEvent)    columns get converted twice
                           └─> Chunk 6 (Payment ledger)  ← needs 5 for the audit trail
                                 └─> Chunk 7 (display tables — independent, any time)
```

**Chunk 4 after Chunk 3** is the one non-obvious edge: `ratePerPersonSnapshot` and
`registrationPriceSnapshot` are money columns, so creating them before the type change
means converting them again.

---

## Rules that apply to every chunk

- **Rule 0** — staging first, never straight to `master`. The `staging → master` merge is
  the action that ships to real customers.
- **Rule 10** — stop the dev server before `prisma migrate dev`, and confirm the output
  ends with `✔ Generated Prisma Client`. On Windows it fails silently otherwise.
- **Rule 6** — read `vault/MaintenanceNotes.md` before touching the booking form, the
  admin content editor or the public-site layout. Chunk 3 touches the booking form.
- **Rule 8** — state the plan and wait for Max's confirmation before editing code.
