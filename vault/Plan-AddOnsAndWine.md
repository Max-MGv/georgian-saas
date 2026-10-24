---
tags: [plan, booking, wine, add-ons]
status: 📋 Plan re-based on the three-product pricing model 2026-10-24 — awaiting Max's answers (§0b); nothing built
tickets: T-7, T-22
---

# Plan — Booking add-ons (T-7) + wine on bookings (T-22)

## 0. Update 2026-10-24 — what changed since 19 Oct (read this before the rest)

T-7 and T-22 went to **In progress** on 2026-10-24. Since this plan was written, **T-152 (three products) is on
production** (`Plan-PricingModel.md`, D-1…D-17) and T-215 rebuilt the order page. The plan below is still right
about *what* to build; these are the places where its *wording* no longer matches the code. **Read every
"visit type", "per person" and `priceBooking` below through this table.**

| Plan says | Code / decision today | Effect on this plan |
|---|---|---|
| Visit types "tasting / tasting + lunch" (D-4, `AddOnGroup.visitTypes`) | `VisitType` = `TASTING` · `TASTING_LUNCH` · **`LUNCH`** (company simple form, shown as "Lunch"). Companies' detailed form has 3 product boxes + Free. | `AddOnGroup.visitTypes` takes all three values (empty = all). A group limited to "Tasting + Lunch" does **not** show on a Lunch-only visit — see **Q-A**. |
| "Per person" = all paying guests (D-11 / C-3), "tasting + lunch on detailed bookings, else guest count" | Paying guests = Tasting + Lunch + Tasting & Lunch (`payingGuests(counts)`, `lib/pricingUtils.ts:79`); Free guests never pay. The admin screens already pre-fill a PER_PERSON line with that number (`NewOrderForm.tsx:215`, `OrderDetail.tsx:926`) but store a fixed quantity — it does **not** follow later guest changes today. | C-3 stays "all paying guests", now = the three boxes. "Follow automatically" (D-11) is therefore **new behaviour**, not a fix. A masterclass for only one product's guests = a per-piece item. |
| `priceBooking({ addOns, wine, extras })` (§4.5) | `priceBooking` is gone. Pricing is `priceCounts(rates, counts, lines: { masterclass, extras })` (`pricingUtils.ts:183`), `adminQuote()` for the admin screens, `lib/adminOrderView.ts` for what they show. Add-on lines are checked by `checkMasterclassLines()` (`lib/bookingInput.ts:250`) — #93 is **fixed**. | `LineTotals` becomes `{ addOns, wine, extras }`; `checkMasterclassLines` becomes `checkAddOnLines`. Same plan, new names. |
| "Line sums hand-written in ~10 places" | Still true, plus `adminOrderView.ts:127` and `lib/demoSeed.ts:726` — **re-count in Chunk 0** (grep `masterclass` + `extras` in `lib/` and `app/`). | Chunk 0 unchanged. |
| E1 "company with no price tier" | A-9: admins type three rates; `adminQuote` returns `unpriced` when nothing is typed. | Same outcome — confirm in Chunk 0 that add-ons on an `unpriced` order stay the only stored total. |
| Order page / New Order screens (§5) | T-215: click-to-edit order page (`1a34c4e`), mirrors the public form (Plan-OrderPageMirror). | Chunk 6 builds the add-on / wine cards **on the new order page**; the 19 Oct mockup (A) shows the old layout. Rule 12: re-check the screen against its siblings first. |
| KnownBugs #93 "fixed separately first" | Fixed by T-152 (Chunks 7–8). | Chunk 0 first bullet is done. |

### 0a. Review before building (ClaudeInstructions Rule 12) — 2026-10-24

Refreshed mockup on today's order page: `vault/addons-order-page.html` → https://claude.ai/artifact/PDr9prJjGNtC2uxVYZyJ4B
(interactive: pencil → draft → Save/Cancel; guests card drives per-person lines). Gap list G-1…G-8:

- **G-1 (needs Max):** only the detailed company form shows masterclass today; individuals and the simple company form see
  nothing. Proposal: every form shows each group the admin ticked for that audience. Recommended: yes.
- **G-2 (customer-visible, release note):** public form today charges a per-person item × the quantity the guest typed
  (default 1); flat items show a quantity box. New: per person × paying guests, flat has no box. Chunk 0 counts real
  production lines first (read-only, Max's go).
- **G-3:** order page — per-person quantity read-only, follows the guest card on Save, history event.
- **G-4:** both new cards use T-215's pencil → draft → Save/Cancel; New Order keeps lines in the browser until Create.
- **G-5:** wine add-line = wine → vintage → qty like New Wine Order, price reason shown; public form uses the +/− list.
- **G-6:** empty states link to Add-ons admin / Wines; empty values "—".
- **G-7:** Orders list — column id `masterclass` kept (saved in browsers), renamed Add-ons; new Table wine column; print sheet lists both.
- **G-8:** content-editor booking-form preview mirrors the group rows (MaintenanceNotes §1).
- Layout change inside the card: the Unit column folds into the item's second line so the table fits a 390 px phone
  (to be checked on the real page in Chunk 6 QA).

### 0c. Build log (localhost only until Max says "push to staging"; nothing on staging or production)

Max, 2026-10-24: *"build it on localhost, I'll tell you what to change before we push to staging."* Dev server for it:
`saas-3100` entry in `C:\Users\Max\.claude\launch.json` (port 3000 is the MaxFinances app). Build order changed from §7 to
show screens early: **Part A = add-ons (T-7) end to end, then Part B = wine (T-22)**. Model names are NOT renamed
(`MasterclassItem` / `OrderMasterclass` stay in code; screens say Add-ons) — saves touching ~25 files for no visible gain.

- ✅ **Chunk 0** `657f5c2` — `lib/orderLines.ts`: every hand-written line sum goes through it (14 copies). tsc 0, pricing tests 123/123.
- ✅ **Chunk 1 (Part A)** `dea57c3` — migration `20261024200000_addon_groups` on the **dev DB**: `AddOnGroup` (RLS), item `groupId`/`nameKa`,
  line snapshots, item FK RESTRICT → SET NULL (#94 fixed). Backfill: one "Masterclass" group per winery with items; 172 lines
  snapshotted, ₾36,000 line total unchanged. `test-ordermasterclass-rls` 14/14. Not yet on production.
- ✅ **Chunk 3 (admin page)** — `/admin/add-ons` (old `/admin/masterclass` redirects): groups with EN/KA names, who sees them
  (companies / individuals), visit types (Tasting · Tasting + Lunch · Lunch, all three = "every type"), items with KA name,
  move-to-group for ungrouped items. Verified in the browser pane: create group, edit group, add item.
- ⏭ **Next:** public booking form (group rows, per-person × paying guests, individuals + simple form), then the order page
  and New Order cards, invoice, then Part B (wine).

### 0b. Questions for Max — ✅ ALL ANSWERED 2026-10-24: "all as recommended"

C-1…C-5 and Q-A are **decided as recommended** below (they are now decisions D-17…D-22). Text kept for the record.

| # | Decision (Max, 2026-10-24) |
|---|---|
| D-17 = C-1 | Wine orders switch to per-line rounding too. |
| D-18 = C-2 | A company that is both booking + wine company shares one set of wine terms. |
| D-19 = C-3 | "Per person" = all paying guests (the three boxes, never Free); partial-group items = per piece. |
| D-20 = C-4 | Phone optional on guest-purchase pickup orders. |
| D-21 = C-5 | Print booking sheet lists add-ons + table wine. |
| D-22 = Q-A | Visit-type choices per group: Tasting · Tasting + Lunch · Lunch (own tick box, default ticked wherever Tasting + Lunch is). |

Original wording:

- **C-1** Wine orders also round per line (so table wine and wine orders calculate alike; totals may move ≤ 1 tetri per line, past orders unchanged). *Recommend: yes.*
- **C-2** A company ticked as **both** booking and wine-order company shares one set of wine terms. *Recommend: yes — simplest; split later if a winery asks.*
- **C-3** "Per person" = all paying guests (the three boxes, not Free); a masterclass for only some guests = a "per piece" item. *Recommend: yes.*
- **C-4** Phone number optional when staff record a guest purchase. *Recommend: yes — these are people standing at the winery.*
- **C-5** The staff booking sheet (print) lists add-ons and table wine (it shows neither today). *Recommend: yes.*
- **Q-A (new)** A group limited to a visit type: should "Tasting + Lunch" groups show on a **Lunch** visit? Lunch follows the Tasting + Lunch rules for lead time / hot dish (A-5 of the pricing plan). *Recommend: yes — the group's visit-type choices stay "Tasting", "Tasting + Lunch" and "Lunch", and Lunch is its own tick box, default ticked wherever Tasting + Lunch is.*


> **Status 2026-10-24: see §0 first** (re-based on the three-product pricing; T-7/T-22 now In progress).
> **Status 2026-10-19:** design settled with Max over three rounds of questions, one blind review
> and one round of mockups. **No code written. Nothing approved to build yet** — Max is reviewing
> the summary page (`vault/addons-summary.html`). Chunks are strictly sequential; each one is
> verified before the next starts. Production steps each need Max's explicit go (Rule 0).
>
> Related: mockups `vault/addons-layout-options.html`
> (https://claude.ai/artifact/N5JNWe76EUyqEY9ghbkbbf) · bug fix ahead of this plan: KnownBugs #93
> (session "Fix negative quantities in public booking").

---

## 1. What we are building

1. **Add-ons (T-7).** "Masterclass" becomes one group of **add-ons**. The admin creates groups
   (Masterclass, Food, …) with English + Georgian names, decides who sees each group (companies,
   individuals) and for which visit type (tasting, tasting + lunch), and fills them with items priced
   per person / per piece / flat — exactly the three units masterclass has today.
2. **Wine for the table (T-22 part 1).** The admin marks which wines can be added to bookings.
   Guests add bottles on the booking form; staff can also add them from the booking page later
   (e.g. during the dinner). The bottles go on the booking's total and invoice, and **count as wine
   sold**, in the same table as every other bottle.
3. **Guest purchases (T-22 part 2).** When a guest of a booking buys wine for themselves, staff
   press "Record guest purchase" on the booking: it creates a normal **pickup** wine order for that
   guest, **linked** to the visit, never on the visit's invoice.

## 2. Decisions log (all Max's, 2026-10-18/19)

| # | Question | Decision |
|---|---|---|
| D-1 | Build T-7 and T-22 together? | Yes. |
| D-2 | Group names translated? | Yes, EN + KA. Item names too (KA optional, falls back to EN). |
| D-3 | Add-ons for individuals? | Yes — per group: companies and/or individuals. |
| D-4 | Groups limited by visit type? | Yes — per group, any of the visit types (Tasting / Tasting + Lunch / Lunch since T-152; empty = all). See §0 / Q-A. |
| D-5 | Table-wine price | Website price by default. A **booking company** can have its own table-wine terms on the Companies tab: a % discount and/or agreed per-wine prices (the same mechanism wine-order companies already use). Max: booking companies and wine companies are separate entities. |
| D-6 | Does table wine count as wine sold? | Yes — "they are indeed wine orders"; one system, the source differs. |
| D-7 | Where is it stored? | In the one existing wine-line table; each line belongs to a wine order **or** a booking (§4.3). |
| D-8 | Booking statistics | Three levels: **visit only** (incl. add-ons) · **+ table wine** · **+ guest purchases** (linked, not invoiced). |
| D-9 | Date table wine counts on | The visit day. |
| D-10 | Table wine on the packing list? | **No** — the packing list is for packing. (Staff see it on the booking sheet instead, §6.6.) |
| D-11 | Per-person items when guest numbers change | Follow automatically, recorded in the booking's history. |
| D-12 | Old statistics | All current data is test data, no discounted wines exist → no history repair needed; must be right going forward. |
| D-13 | Guests add wine where? | Both: on the public form, and staff from the booking page after confirmation. |
| D-14 | Wine removed after payment | Shows "Credit (overpaid)" like extras today; winery settles by hand. No refund flow. |
| D-15 | Guest purchases | Only the at-the-winery case is supported: staff record a pickup order from the booking. |
| D-16 | Mockups | **A, A, A, A**: wine as a row like masterclass · one row per group · admin booking page with one card per kind · invoice shows the discount inside each line. |

**Still to confirm (in the summary page):**
- **C-1** D-16 (invoice discount per line) means each bottle line is rounded on its own. To keep
  wine orders and table wine calculating the same way, **switch wine orders to per-line rounding
  too** (future totals may move by ≤ 1 tetri per line; past orders don't change). Recommended.
- **C-2** A company ticked as **both** a booking and a wine-order company would share one set of
  wine terms. Fine given D-5? (Alternative: separate terms per role — more columns, more UI.)
- **C-3** "Per person" = **all paying guests** (D-11). A masterclass for only part of the group is
  then set up as a "per piece" item. OK?
- **C-4** Recording a guest purchase: phone number optional for these pickup orders (today the
  admin wine form requires it)?
- **C-5** The staff booking sheet (print) shows add-ons and table wine — it shows neither today.

## 3. What exists today (verified in code)

| Thing | Where | Notes |
|---|---|---|
| Add-on catalogue | `MasterclassItem` | Admin → Masterclass (`saas\app\admin\(panel)\masterclass\`). One name, unit PER_PERSON/PER_PIECE/FLAT, price. |
| Add-on lines | `OrderMasterclass` | Price snapshot, **no name snapshot**; FK to item `ON DELETE RESTRICT`. |
| Extras | `OrderExtra` | Admin-typed one-offs. Unchanged by this plan. |
| Booking total | `priceBooking()` `saas\lib\pricingUtils.ts:148`; `recalcOrderTotal()` `saas\lib\pricing.ts` | base + registration + masterclass + extras. |
| Line sums | hand-written in ~10 places | createBooking, orders.ts ×3, pricing.ts, OrderDetail, NewOrderForm, BookingForm, InvoicePrint, invoiceEmailTemplate, OrdersTable. |
| Public form | `saas\components\BookingForm.tsx` | Masterclass row only on the detailed company form (T-21 collapsed row). Header = site content `form_masterclass_header`. |
| Wine lines | `WineOrderItem` under `WineOrder` | `priceSnapshot` = unit price before the order's %. RLS JOIN→WineOrder only. Only read through the parent (except 2 scripts). |
| Wine pricing | `priceWineOrder()` `saas\lib\winePricing.ts` | Agreed price replaces standard; % once on the standard subtotal. |
| Company wine terms | `Company.wineDiscountPercent` + `CompanyWinePrice` | UI only for wine-order companies (`CompaniesClient.tsx:704–732`). A company row can be both booking + wine (two checkboxes, :685/:694). |
| Wine statistics | `statistics\page.tsx`, `WineStatistics.tsx` | Revenue = `totalAmount`; top wines = qty × `priceSnapshot` (ignores %); grouped by **name** (language-dependent). |
| Booking statistics | `StatisticsClient.tsx` / `StatisticsV2.tsx`, `orders\RevenueStrip.tsx` | Sum `totalPrice`. |
| Invoice | `InvoicePrint.tsx`, `invoiceEmailTemplate.ts`, `OrdersTable.tsx` print, `sendOrderInvoice` + `InvoiceSent` snapshot | "Booking amount" = total − masterclass − extras. |
| CSV export | `exportOrdersCsv` in `saas\app\actions\orders.ts` | Total + balance only. |
| Staff sheet | `orders\BookingSheetPrint.tsx` | No add-ons, no extras today. |
| Payments | `shouldTakePayment` | No payment unless a price is shown and total > 0. Top-ups: `runTopUpCheckout`, manual `recordAdditionalPayment` (row lock, §35). |
| Guest-count edits | `updateOrderEnhanced` (`orders.ts:98`), simple update (`orders.ts:~46`), `createOrderAdmin` | Where per-person lines must follow (D-11). |

## 4. Design

### 4.1 Add-ons
```
AddOnGroup (new, own tenantId, RLS direct)
  id, tenantId, nameEn, nameKa?, kind ITEMS | WINE
  showToCompanies Boolean, showToIndividuals Boolean
  visitTypes VisitType[]  (empty = both)
  active, sortOrder, createdAt, updatedAt
  partial unique: one WINE group per tenant

AddOnItem   ← model rename of MasterclassItem, @@map("MasterclassItem")
  + groupId? → AddOnGroup        (required after the backfill — later contract step)
  + nameKa?
  unitType: enum AddOnUnit @@map("MasterclassUnit")  (PER_PERSON | PER_PIECE | FLAT, unchanged)

OrderAddOn  ← model rename of OrderMasterclass, @@map("OrderMasterclass")
  masterclassItemId → nullable, ON DELETE SET NULL      (fixes "can't delete a used item")
  + nameSnapshot, nameKaSnapshot?, unitSnapshot, groupId? (SET NULL), groupNameSnapshot
```
- **Units, enforced on the server** (one helper, `addOnQuantity()`): PER_PERSON = paying guests
  (tasting + lunch on detailed bookings, else guest count) — no quantity box; FLAT = 1 — no box;
  PER_PIECE = typed, whole number 1–999.
- **Per-person lines follow the party** (D-11): every action that changes guest counts re-syncs
  PER_PERSON lines in the same transaction and writes an `OrderEvent`.
- Items are never hard-deleted once used: the line keeps its snapshot, the link goes null.
- Groups with lines are deactivated, not deleted.

### 4.2 Wine for the table — catalogue + prices
```
WineVintage + bookable Boolean @default(false)
  Admin sees one "Offer on bookings" switch per wine (PRODUCT level) or per vintage (VINTAGE level).
```
Price: `WineVintage.price` (website price), unless the booking's company has terms
(`wineDiscountPercent` / `CompanyWinePrice`) — then `priceWineOrder` rules apply.
Company terms are only applied after the company is proved (access code) — the existing
"no code = unknown company" rule (MaintenanceNotes §35). New-company requests and individuals pay
website prices.

### 4.3 Wine sold — one table, two parents
```
WineOrderItem
  wineOrderId → nullable
  + orderId?  → Order, ON DELETE CASCADE, @@index([orderId])
  + CHECK (num_nonnulls("wineOrderId","orderId") = 1)
  + negotiated Boolean @default(false)   -- "agreed price" label
  + discountPercent Float?               -- % applied to THIS line (null = none)
  + lineTotal Int                        -- tetri actually charged for this line, rounded per line
```
- **`lineTotal` is the revenue truth for every bottle.** Statistics sum `lineTotal`; nobody
  multiplies `priceSnapshot` by anything again (fixes the "top wines ignores the %" bug).
- Wine order total = Σ its `lineTotal` (needs **C-1**). Booking's wine = Σ its `lineTotal`.
- Pattern already in the schema: `Payment` / `OrderEvent` / `OrderContact` (nullable `orderId` /
  `wineOrderId`, exactly one).
- RLS policy replaced: EXISTS (WineOrder of this tenant) OR EXISTS (Order of this tenant).

### 4.4 Guest purchases
```
WineOrder + sourceOrderId? → Order, ON DELETE SET NULL; @@index([tenantId, sourceOrderId])
```
Created only through the admin wine-order path (`createWineOrderAdmin`), so every §35 helper
applies. Pre-filled: INDIVIDUAL, PICKUP, guest name. Never touches the booking's total or invoice.

### 4.5 Booking total — one helper for all line sums
New `saas\lib\orderLines.ts`: `lineTotals(order) → { addOns, wine, extras }` and
`bookingBreakdown(order) → { visit, addOns, wine, extras, total }`. `priceBooking` takes
`{ addOns, wine, extras }`. **All ~10 hand-written sums are replaced by it before anything new is
added** (blind review R6) — invoice "booking amount" can then never forget a line kind.

### 4.6 Statistics
- `saas\lib\wineSales.ts` → `loadWineSales(tenantId)`: the **only** reader of wine sold across
  sources. One row per line: `{ source: WINE_ORDER | TABLE | GUEST_PURCHASE, parentId, date,
  vintageId, wineId, name, qty, lineTotal, customer, companyId, bookingId? }`. Excludes abandoned /
  cancelled parents by each parent's own rule. Table wine dated by the **visit day** (Tbilisi
  time); wine orders by `createdAt` (unchanged). Groups by vintage/wine id, not by name (fixes the
  language split).
- Wine statistics: a **Source** filter (all / wine orders / table wine / guest purchases).
- Booking statistics + Orders revenue strip: a 3-level switch (D-8): visit only · + table wine ·
  + guest purchases.
- **Written rule (MaintenanceNotes):** booking revenue and wine revenue overlap by design — never
  add the two.

### 4.7 Invoice
- Sections in order: visit · each add-on group · wine for the table · extras · total · paid ·
  balance/credit. Wine lines show the price charged with its reason ("40.00 agreed",
  "38.00 −10% = 34.20") — D-16.
- `InvoiceSent` + `addOnLines Json @default("[]")`, `wineLines Json @default("[]")`. Old rows keep
  `masterclassLines` and are never rewritten; the reader accepts both shapes.
- Detailed-invoice setting off → total only, as today.

### 4.8 History events
`OrderEventType` + `ADDON_ADDED`, `ADDON_REMOVED`, `ADDON_QTY_SYNCED`, `WINE_ADDED`,
`WINE_REMOVED`, `GUEST_PURCHASE_LINKED`. Added in the migration, **written only once the new code
is live** (an old Prisma client crashes on an unknown enum value → rollback safety).

## 5. Screens (mockup choices A/A/A/A)

| Screen | Change |
|---|---|
| Public booking form (company + individual) | One collapsible row per visible group (D-2/D-3/D-4); per-person shows "35 ₾ × 12 guests = 420 ₾", flat has no box; "Wine for the table" row with +/− per bottle; prices with company terms after the code is proved; visit-type change clears add-ons that no longer apply; review sheet + confirmation popup list every line. |
| Admin → Add-ons (was Masterclass; old URL redirects) | Groups in order, EN/KA names, who sees it, visit types, items underneath; the Wine group (rename / move / switch off) when the wine module is on. |
| Admin → Wines | "Offer on bookings" switch. |
| Admin → Companies (booking companies) | "Table wine prices": % and agreed per-wine prices, website price when empty. Only when the wine module is on. |
| Admin → Booking page | Cards: Add-ons (grouped) · Wine for the table (+ Add wine) · Extras · **Sales from this visit** (dashed, "not on the invoice", + Record guest purchase). Totals + balance from the shared helper. |
| Admin → New booking | Add-ons + wine, priced by the server. |
| Admin → Orders list | Masterclass column → Add-ons; new Table wine column; CSV gets "Add-ons (GEL)" and "Table wine (GEL)". |
| Booking sheet (print) | Add-ons + table wine listed for staff (C-5). |
| Invoice print + email | §4.7. |
| Wine orders list / detail | "From the visit of 24 Oct · Caucasus Travel" link on guest purchases. Not on the packing list (D-10 — table wine is never a wine order). |
| Statistics | §4.6. |
| Content editor → Booking form preview | Shows the group rows; the masterclass header text moves to the Add-ons page (group name). |
| Onboarding wizard | Masterclass step creates items in the Masterclass group. |

## 6. Dependencies and blind spots

### 6.1 Couplings that must stay in sync (→ new MaintenanceNotes §38)
1. **Line sums** — only `lib/orderLines.ts`. A new line kind is added there or it is missed on
   invoices, totals, CSV and statistics.
2. **Wine sold** — only `lib/wineSales.ts` reads across sources; `WineOrderItem` lines may have a
   booking parent. Any new reader that goes straight to `WineOrderItem` must handle both parents.
3. **Booking revenue vs wine revenue** overlap — never summed.
4. **Write paths** that must call the same helpers (units, wine pricing, company proof, events):
   public `createBooking`, admin `createOrderAdmin`, Order Detail add-line actions, guest-count
   edits. A future import/duplicate button too.
5. **BookingForm ↔ content-editor preview** (MaintenanceNotes §1).
6. **RLS**: new `AddOnGroup` policy + grant + anon revoke in the migration **and** both lists of
   `scripts\setup-rls.ts`; `WineOrderItem` policy rewritten in both places; `check-rls.ts`,
   `test-wineorderitem-rls.ts` extended (H18).

### 6.2 Blind spots and edge cases — how each is handled
| # | Case | Handling |
|---|---|---|
| E1 | Company booking with **no price tier** (total "confirmed after submission") | Today its stored total is only the add-ons. Stays so; online payment isn't taken (price not shown); the invoice breakdown uses the helper so the visit line can't go negative (blind review R2). Staff set rates as today. |
| E2 | Company ticked as both booking + wine company | Shares one set of wine terms (C-2). |
| E3 | Wine module switched off | No Wine group on the form/admin; past table-wine lines still show on their bookings and invoices. |
| E4 | Wine / vintage deactivated or deleted after being booked | Line keeps name, year, price (snapshots); vanishes from the form. Statistics fall back to name + year when the vintage link is gone. |
| E5 | Item / group deleted or renamed after being booked | Snapshots keep the invoice as billed; used items/groups are deactivated, not deleted. |
| E6 | Visit type changed after add-ons were chosen | Public form clears add-ons not allowed for the new type. Admin: lines stay, with a warning — staff decide. |
| E7 | Guest count changed | Per-person lines follow + history event (D-11). Per-piece and flat untouched. |
| E8 | Wine removed after payment | Credit shown; settled by hand (D-14). Added after payment → balance due → existing top-up link. |
| E9 | Booking cancelled | Its table wine leaves statistics with it; guest purchases are their own orders and stay. |
| E10 | Booking abandoned (closed card page) | Its lines exist but every reader excludes abandoned bookings (§28) — `loadWineSales` included. |
| E11 | Booking deleted (staging wipe, demo reseed) | Table wine deleted with it (cascade); guest purchases lose the link only (SET NULL). |
| E12 | Individual paying online | The card payment now includes wine and add-ons; no-show refunds stay manual, as today. |
| E13 | Company terms leaking to the public page | Never on page props; only from the resolver after code proof (§35). |
| E14 | Georgian name missing | Falls back to the English name. |
| E15 | Table wine dated by visit day | Future bookings' wine shows in future months; wine orders stay on order date. Different clocks, by decision (D-9). |
| E16 | `@@map` names | Code says `AddOnItem`, SQL says `"MasterclassItem"`. Documented on the models and in RLS-Architecture. |
| E17 | Renamed menu for Nikalas Marani | Release note ("Masterclass is now Add-ons") + the per-person fix changes how per-person items are charged on the public form (now × guests, as the admin screen always said). |
| E18 | Per-line rounding | Sum of rounded lines; wine orders switched too (C-1). |
| E19 | Old invoices | `InvoiceSent` rows from before render from `masterclassLines`. |
| E20 | Order Detail balance from live tiers (blind review R3) | Fixed while rebuilding the page: preview from the snapshot. |

### 6.3 Existing bugs folded in
KnownBugs #94 (delete used item), #95 (wine statistics name split + ignored %), name snapshot,
unit enforcement, review R2/R3/R5 (missing masterclass events, admin trusting the browser's
masterclass price, remove-line not checking the order). **#93 is fixed separately first.**

## 7. Chunks

Strictly sequential. Every chunk: dev DB + localhost, verified (specs + screenshots), committed to
`staging`, vault updated. Production only in chunk 12, step by step on Max's go.

**Chunk 0 — Groundwork, no visible change**
- #93 fix merged on `staging` (separate session) — this plan builds on its `createBooking`.
- Reproduce #94, R2, R3 on dev; write them down.
- Read-only production counts (**Max's go**): masterclass items/lines, wine lines, any
  `WineOrder.discountPercent` / `CompanyWinePrice` (confirms D-12), companies with both flags.
- `lib/orderLines.ts` + replace the ~10 hand-written sums. Prove nothing moved:
  `audit-money.ts`, `test-pricing-agreement.ts`, booking specs green.

**Chunk 1 — Schema + migration (dev)**
- All of §4 in one additive migration: new table, new nullable columns, relaxed NOT NULL, CHECK
  (`NOT VALID` then `VALIDATE`), enum values, indexes, RLS + grants + revokes.
- Backfill: one Masterclass group per tenant with items (names from that tenant's
  `form_masterclass_header` EN/KA, else defaults), visible to companies only (today's behaviour),
  both visit types; items → group; line snapshots from current names; a Wine group per tenant with
  the wine module on, **inactive** until switched on; `lineTotal`/`negotiated`/`discountPercent`
  for every existing wine line.
- Totals audit: every `Order.totalPrice` and `WineOrder.totalAmount` before = after (0 diffs).
- RLS tests: booking-parent wine line isolated per tenant; `check-rls` clean.

**Chunk 2 — Pricing core**
- `addOnQuantity`, per-person sync on guest edits (+ events), `priceWineOrder` per-line output
  (`lineTotal`, C-1), `priceBooking` with wine, events for add-on/wine lines, remove-line checks.
- Unit tests for every unit type, company terms combos, rounding.

**Chunk 3 — Admin → Add-ons**
- Groups + items CRUD, EN/KA, visibility, visit types, order, Wine group; route rename + redirect;
  nav; deactivate-not-delete.

**Chunk 4 — Wines + Companies**
- "Offer on bookings" switch (PRODUCT/VINTAGE). Booking companies: table-wine prices section.

**Chunk 5 — Public booking form**
- Group rows (company + individual forms), units, visit-type filtering, wine row, company prices
  after code proof, review sheet + confirmation popup; `createBooking` re-prices and validates
  everything server-side.

**Chunk 6 — Admin booking surfaces**
- Booking page cards (A), add wine during the dinner, Sales from this visit (read-only until
  chunk 9), totals/balance from the snapshot (R3); New booking form; Orders list columns + CSV;
  booking sheet (C-5).

**Chunk 7 — Invoice**
- Print + email + `InvoiceSent` new columns; old rows still render.

**Chunk 8 — Statistics**
- `loadWineSales`, Source filter, booking 3-level switch + revenue strip, grouping by wine id.

**Chunk 9 — Guest purchases**
- "Record guest purchase" → pre-filled pickup wine order (C-4), link + badge both ways, event.

**Chunk 10 — Everything around it**
- Onboarding step, demo seed + DemoExplore copy, staging wipe + Clear staging data, clone scripts,
  content-editor preview, translations + `check-i18n-parity`, super-admin activity, release note
  draft (Super Admin → Releases).

**Chunk 11 — QA + review**
- New Playwright specs (add-ons per unit/visit type/audience, table wine public + admin, invoice,
  statistics sources, guest purchase); full tiers 1–4; a blind review of the whole diff;
  MaintenanceNotes §38, RLS-Architecture, FeatureLog, Feature note, SessionLog; Max tests on
  staging with a test checklist on T-7/T-22.

**Chunk 12 — Production (each step on Max's go)**
1. Read-only checks on Nikalas Marani; backup / restore point.
2. `prisma migrate deploy` on production (additive — live code unaffected); totals audit = 0 diffs.
3. Merge `staging` → `master`; verify on production (booking with add-ons + wine, invoice, stats).
4. Publish release note.
5. Later, separate: contract migration (`groupId` NOT NULL).

## 8. Not doing
Merging extras into add-ons · stock/inventory (one wine table makes it easy later) · guests
linking their own later online orders to a visit (D-15) · physical table renames · a refund flow.

## 9. History
- 2026-10-18: first exploration (T-22 alone), then T-7 + T-22 together.
- 2026-10-19: Max's answers; blind review (agreed on almost everything; preferred a separate
  booking-wine table — kept one table because Max wants wine sold in one place; found #93, R2–R8);
  mockups `addons-layout-options.html`; this plan.
