---
tags: [plan, wine-orders, companies, delivery]
---

# Plan — Wine order features (tickets T-13, T-8, T-14; later T-12, T-9)

> **This is the live task tracker for this work.** Update the checkboxes and each chunk's
> Status line as work happens. **Chunks are strictly sequential — do not start chunk N+1
> until chunk N's Status is ✅.** If a session ends mid-chunk, that chunk's "Resume point"
> line says exactly where to pick up.
>
> **Rule 0 applies to every chunk:** all work goes to `staging` + the **dev** database only.
> Nothing reaches `master` or the production database without Max's explicit go for that
> specific step. Each chunk that adds a migration lists it under "Production steps (later)".

Started 2026-10-12. Max moved T-8, T-12, T-13, T-14 to Backlog and answered the review
questions the same day (decisions below). Tickets: `cd saas && npx tsx scripts/tix.ts show T-n`.

| Ticket | What | Status on the board |
|---|---|---|
| **T-13** | Several delivery addresses per company; customer picks one | Built on staging (Chunks 1–3) |
| **T-8** | Minimum order, pickup vs delivery, delivery zones + fees | In progress (Chunks 4–6) |
| **T-14** | Preferred delivery/pickup date + admin calendar | In progress (Chunks 7–8) |
| **T-12** | Negotiated price per vintage per company + exporter flag | In progress (Chunk 9) |
| **T-9** | Individual vs Company wine orders (like bookings) | In progress (Chunk 10) |

---

## Decisions (Max, 2026-10-12)

### T-13 — company addresses
- A company can have several **delivery addresses**. Each = optional **name** ("Vake branch")
  + **address** + optional **working hours** (the two fields that autofill today).
- The existing `Company.address` becomes that company's first address (backfill).
- The customer can still type an **"Other address"** (like "I am not on this list").
- Contact persons stay company-wide (not per address).
- Claude's suggestions Max did not object to: the picker is **hidden when a company has only
  one address** (it just fills in); the option text is "Vake branch — 12 Chavchavadze Ave";
  each address can be linked to a **delivery zone** (T-8) so the fee fills in by itself.

### T-8 — minimum order, pickup/delivery, delivery fees
- Everything is **per winery** (multi-tenant settings), not global.
- **Minimum order:** off by default; the admin chooses **bottles or lari** and a value. Applies
  to pickup too.
- **Delivery zones:** the admin defines a list (e.g. "Tbilisi – 0₾", "Mtskheta – 15₾"), one
  fee **per order**. The customer picks one; anything else is **"Other – we'll contact you
  about delivery"**. No free-delivery threshold for now.
- **Pickup:** "Pickup at the winery", no address needed.
- **Unknown zone ("Other") + online payment — a winery toggle:**
  (a) the customer **pays for the wine now** and the delivery fee is **added afterwards** by the
  admin, or (b) the order is taken as a **reservation** (no online payment).

### T-14 — preferred date
- **Required**, date only, for delivery **and** pickup. The label must say **"preferred"** —
  it is not a guarantee.
- Same date rules as bookings: lead time + Closed Days.
- Admin calendar copies the Orders calendar (month grid, tap a day → that day's list under the
  grid). Admin can change the date. Old orders without a date appear in a "No date" list.

### T-12 — negotiated prices (partly decided — see "Blocked" below)
- Per **vintage**, negotiated per company. A negotiated price **replaces** the standard price
  and the company's % discount is **not** applied on top of it; other wines still get the %.
- Negotiated prices are only shown after the company's **access code** is entered; companies
  without a code just get them on their order.
- **Exporter** = a label on the company and its orders + an admin filter. Nothing else.

---

## Current state — what the code does today (read before building)

- `WineOrder` (`saas/prisma/schema.prisma`) stores `address` and `workingHours` as **free text
  snapshots**; `totalAmount` = wines after the company % discount, in **tetri** (Int).
- `Company.address` is a single nullable string. Used only to **autofill** the two wine forms
  (`WineCatalogueClient.tsx` `applyCompanyProfile`, `NewWineOrderForm.tsx`) and in the
  "is this company set up" checks (`CompaniesClient.tsx` `missingDetails`,
  `app/actions/onboarding.ts`, `app/admin/onboarding/page.tsx`).
- Today `/wines` puts every wine-order company's `address` and `wineDiscountPercent` in the
  page source (the `companies` prop). The **resolver** (`lib/contactResolution.ts`
  `resolveCompanyContacts`) is the code-gated path — new per-company data (addresses,
  negotiated prices) should travel **through the resolver**, not the public prop.
- **Four forms** attach data to an order and must stay consistent (MaintenanceNotes §30): public
  booking, **public wine order** (`app/(site)/wines/WineCatalogueClient.tsx`), admin booking,
  **admin manual wine order** (`app/admin/(panel)/wine-orders/new/NewWineOrderForm.tsx`).
  This plan touches both wine forms every time.
- The server re-fetches prices and discount — never trusts the client (`submitWineOrder.ts`,
  KnownBugs #22). Every new money value (fee, minimum) must be re-checked server-side too.
- Wine Orders admin has a **phone half and a desktop half** (MaintenanceNotes §33:
  `CompactWineCard` vs full card, `PackingView`). New fields go on both.
- Every admin `WineOrder` query spreads `NOT_ABANDONED` (MaintenanceNotes §28).
- New tenanted tables go in **both** lists in `scripts/setup-rls.ts` (MaintenanceNotes §26 H18).
- `lib/payments/manualPayment.ts` second-payment support is **Order-only** (comment at line
  ~124) — collecting a delivery fee after the wine was paid needs that extended (Chunk 6).
- Public wine drawer strings are mostly hardcoded English today; new strings go through
  `t()` (site) / `adminT()` (admin) with en/ka parity (`scripts/check-i18n-parity.ts`).

---

## Chunks

### Chunk 1 — T-13 data: `CompanyAddress` table + backfill
**Status:** ✅ 2026-10-12 (dev DB only)
- [x] `CompanyAddress` model: `id, companyId (Cascade), label String?, address String,
      workingHours String?, sortOrder Int, isActive Boolean, createdAt, updatedAt`. No own
      tenantId (RLS JOIN-to-Company, same shape as `CompanyPerson` / `Price`).
- [x] `WineOrder.companyAddressId String?` (relation `onDelete: SetNull`) +
      `addressLabel String?` snapshot. `WineOrder.address`/`workingHours` stay the snapshot of
      the facts (same rule as `OrderContact`).
- [x] Migration `20261012121359_company_addresses` (dev DB): table, RLS on, JOIN policy, grant
      to `app_user`, **revoke anon/authenticated** (KnownBugs #73 pattern) — all inside the
      migration so production needs only `migrate deploy`. Backfill: **18 of 18** dev companies
      with an address got one `CompanyAddress` row. Past orders deliberately not linked.
- [x] `scripts/setup-rls.ts` — added to `writableTables` + its own JOIN policy block.
- [x] New `scripts/test-company-addresses-rls.ts`: **13/13 pass** (each tenant sees exactly its
      own row, direct-id read/update/delete/insert across tenants all refused, deleting an
      address leaves the order + its snapshot, deleting a company cascades its addresses).
      Anon REST key → **HTTP 401** on `CompanyAddress`. `tsc` clean.
- [x] `Company.address` column **kept for now** with a ⚠️ comment — dropped in a later cleanup
      migration once production has run the backfill.
**Resume point:** done.
**Production steps (later):** `prisma migrate deploy` (additive + backfill + RLS in one file).

### Chunk 2 — T-13 admin: Addresses on the Companies screen
**Status:** ✅ 2026-10-12 (staging)
- [x] `app/actions/companyAddresses.ts`: create / update / delete — `requireAdmin()`, tenant
      check through the company (same shape as `companyPeople.ts`). **Delete is a real delete**:
      safe because `WineOrder.companyAddressId` is SetNull and orders keep their snapshot.
- [x] Companies edit panel: the single "Address" field is now an **Addresses** list (name /
      address / working hours; add / edit / delete; live-saved like the people lists, and
      propagated to the parent so close + reopen shows the change). Shown for every company.
      Removed a pre-existing empty block that drew a double divider under it.
- [x] `updateCompany` no longer writes `Company.address` (field removed from `CompanyProfile`).
- [x] "Is this company set up" checks read addresses: `missingDetails` (CompaniesClient),
      `getFinishDetailsStatus` (`app/actions/onboarding.ts`), onboarding wizard page.
- [x] Demo seed (`lib/demoSeed.ts`) creates `CompanyAddress` rows instead of `Company.address`;
      Restaurant Kakhuri gets **two branches** (Vake, Old Tbilisi) so the demo shows the picker
      after the next demo reset.
- [x] adminT `companies.addresses.*` en + ka (Georgian drafted by Claude); old
      `companies.editPanel.address/addressPh` removed. Parity ✅, `tsc` ✅.
- [x] Verified on localhost (headless, suite credentials helper): desktop 1280, iPhone 13 (390),
      320 — no horizontal overflow; add → edit → close/reopen → delete each confirmed against the
      dev DB; no test rows left behind.
- Known, not mine: `CompaniesClient.tsx` has one pre-existing `react-hooks/set-state-in-effect`
  lint error (the `?expand=first` effect) — present before this chunk.
**Resume point:** done.

### Chunk 3 — T-13 forms: pick an address
**Status:** ✅ 2026-10-12 (staging)
- [x] `lib/orderAddress.ts` → `resolveOrderAddress()`: the one place both write paths turn the
      form's address into order columns. A saved address sends **only its id**; the server
      re-reads text/hours/name from the row, which must be active and belong to the order's
      company under the tenant. Typed address stored as typed. `formatAddressOption()` shared by
      both forms ("Vake branch — 12 Chavchavadze Ave").
- [x] Resolver (`ResolvedCompany`) returns `addresses` (active, list order) on both paths;
      `address` removed. `useContactSelection` now types its outcome as `ResolvedCompany`.
      `/wines` companies prop no longer carries `address` (it was public page source).
- [x] Public wine form: 0 saved → typed boxes (as before); 1 → "Delivering to …" card + "Use
      another address"; 2+ → required picker + "Other address…". Cleared on every company
      change, "not on this list", direct-code clear and after submit. A late resolver answer
      for a company the customer already left is ignored.
- [x] Admin manual wine order form: same choices as a dropdown; typed boxes only for "Other".
- [x] `submitWineOrder` + `createWineOrderAdmin` call `resolveOrderAddress`; write
      `companyAddressId` + `addressLabel` + snapshot.
- [x] Wine Orders card shows "**Vake branch** — address". (Compact phone card and Pack view
      show no address at all — unchanged.) Emails show only the winery's own address — unchanged.
- [x] Tests: `scripts/test-order-address.ts` **8/8** (tampered text ignored; other company /
      other tenant / inactive / no-company ids refused). New spec
      `tests/tier2-core-flows/wine-order-company-address.spec.ts` **passes** (2 saved addresses →
      picker, "Other" shows boxes, picks the 2nd → DB has link + snapshot of the 2nd).
- [x] **Found while re-running related specs (not caused by T-13):**
  - **T-6 bug, fixed:** after "Add company" opened the edit form, `?edit=<id>` came **back**
    into the URL on the next save (e.g. a price tier). Cause: `replaceState(window.history.state…)`
    — Next.js treats its own state object as an internal call and never updates its router.
    Fixed to `replaceState(null, …)` (the documented form). Reproduced before, gone after.
  - `companies-crud.spec.ts` had not been run since T-6 (create now opens the edit panel) —
    updated; **2 clean passes**.
  - `payment-amount-integrity.spec.ts` hung 180 s on `'Number of Guests (minimum 4)'`: Staging
    Winery's `min_guests_tasting_lunch` is **2** on the dev DB (data, left as found). Locator
    made minimum-independent in that spec. **Same exact string is in** `booking-simple`,
    `booking-enhanced` and 4 tier-5 specs — not touched; tell Max (either set the minimum back
    to 4 or let me loosen them too).
  - `wine-catalogue-order.spec.ts` fails as before — dev wine "Rkatsiteli" inactive (known).
    **Same cause** stops `payment-amount-integrity`'s wine test (it waits 480 s for the
    "Rkatsiteli 2026" card — confirmed from a trace) before it reaches the company step, so the
    wine-payment path is covered only by the new address spec until that wine is active again.
    The company step needs no change (it never typed an address; the saved one fills in).
  - Phone screenshots (390, 320) of the picker + "Delivering to" card: no horizontal overflow.
  - Lint: no new errors (the 4 in WineCatalogueClient and 1 in WineOrdersClient pre-date this).
  - Commits: `0c26ac9` (chunk 3), `926b572` (T-6 fix + spec fixes).
  - `contact-orphan-safety.spec.ts` failed once under load, **passed alone** (known pattern).
  - My first version of the new spec deleted its order while `submitWineOrder` was still
    writing `abandonedAt` → P2025 in the server log. Spec now waits for the action to finish.
**Resume point:** done.

### Chunk 4 — T-8 data + Settings
**Status:** ✅ 2026-10-12 (staging; migration on the dev DB only)
- [x] Migration `20261012141158_delivery_zones` (additive): `DeliveryZone` (own tenantId, fee in
      tetri), enum `WineFulfilment` (DELIVERY default), `CompanyAddress.deliveryZoneId` (SetNull),
      `WineOrder.fulfilment / deliveryZoneId (SetNull) / deliveryZoneName / deliveryFee /
      deliveryFeePending`. CHECKs: zone fee ≥ 0, order fee ≥ 0, a PICKUP order has no fee, zone
      or pending flag. RLS direct policy + app_user grant + anon/authenticated revoke inside the
      migration; also added to **both** `setup-rls.ts` lists. Anon REST → **401**.
- [x] Why `deliveryFeePending` and not "fee IS NULL": every pre-T-8 order has a null fee and
      must not show up as "fee to set".
- [x] **Money rule** (Max 2026-10-12): `totalAmount` = wines only; `lib/wineOrderMoney.ts`
      `wineOrderAmountDue()` = wines + fee — the only place the two are added. Readers of
      `totalAmount` to route through it in Chunks 5–6: `submitWineOrder`, `wineOrders.ts`,
      `wineOrderReceiptTemplate`, `invoiceEmailTemplate`, `settle.ts`, `abandoned/page`,
      `wine-orders/page` + `WineOrdersClient`, `superAdmin.ts`, `MessagesPanel` (preview);
      `statistics/page` deliberately stays wines-only.
- [x] `lib/wineOrderRules.ts` — `parseWineOrderRules()` (unset/garbage → off; only the exact
      value 'reservation' selects reservation) + `meetsMinimum()`. Keys: `wine_min_order_type`,
      `wine_min_order_value` (bottles, or tetri for amount), `wine_pickup_enabled`,
      `wine_unknown_zone_payment`. Defaults = today's behaviour (no minimum, no pickup).
- [x] `app/actions/deliveryZones.ts` — zone CRUD + `saveWineOrderRules()` (validated; not the
      generic `updateSetting`).
- [x] Settings → new panel **"Wine Orders — Delivery & Minimum"** (`WineOrderSettingsPanel.tsx`,
      sibling of ContactRolesPanel; only with the wine module): minimum (off / bottles / ₾),
      pickup switch, unknown-zone choice (only with online payment), zone list.
- [x] Companies → each address gets an optional **Delivery zone** dropdown (shown once zones
      exist); server checks the zone is this tenant's.
- [x] Tests: `scripts/test-delivery-zones.ts` **20/20** (isolation, DB money guards, SetNull,
      parser fallbacks, minimum maths). Browser (localhost, suite login): zone 12.50₾ → 1250
      tetri in DB; rules saved + survive reload; address zone saved; desktop/390/320 no overflow.
      Test data removed afterwards (4 rule settings + ZZ zone) — Staging Winery is back to
      "nothing configured".
- The intermittent hydration warning seen at 320px was traced in Chunk 5 to Playwright's own
  screenshot caret-hiding style — not an app issue.
**Resume point:** done.

### Chunk 5 — T-8 forms: pickup/delivery, zone, fee, minimum
**Status:** ✅ 2026-10-12 (staging)
- [x] `lib/wineOrderDelivery.ts` — one server loader for rules + active zones (public page,
      admin form, Settings, `submitWineOrder` all use it). `lib/orderDelivery.ts` —
      `resolveOrderDelivery()` (pure; the browser names a zone, the fee comes from the zone row;
      pickup refused unless offered, except `admin`; no zones → exactly pre-T-8) and
      `minimumOrderError()`.
- [x] Public form: Delivery / Pickup buttons (only when pickup is on); pickup hides every
      address field; zone picker "Tbilisi — 15₾" + "Other — we will contact you about delivery"
      (only when zones exist), pre-selected from the chosen saved address's zone; summary shows
      Wines / Delivery — zone / Total, "fee to be confirmed", "Pickup — free"; minimum shown,
      turns red + disables submit below it; "Other" + reservation mode → button says
      "Place Reservation".
- [x] `submitWineOrder`: re-reads rules + zones; pickup stores address `''`; minimum enforced on
      wines-after-company-pricing; **charges `wineOrderAmountDue()` = wines + fee**; "Other" +
      reservation mode → no checkout. `totalAmount` stays wines-only.
- [x] Admin manual form: Delivery/Pickup select, zone select incl. "Other — set the fee later",
      fee line + total; server uses the same helper with `admin: true`; no minimum (admin tool).
- [x] Receipt email (`wineOrderReceiptTemplate` + `settle.ts`): Pickup / Delivery — zone + fee /
      "to be confirmed" row; "Paid" = wines + fee. Pre-T-8 orders render as before.
- [x] Tests: `scripts/test-order-delivery.ts` **13/13**; new spec
      `tests/tier2-core-flows/wine-order-delivery.spec.ts` **5/5 twice** (minimum blocks; zone fee
      → Payment.amount = wines + fee, totalAmount wines-only; Other+pay → wines-only charge,
      pending; Other+reservation → no checkout, no Payment; pickup → no address, no fee). It sets
      tenant-wide rules, runs serially and restores them. Regression: `wine-catalogue-order` ✅
      (runs again now Rkatsiteli is active), payment-amount-integrity wine test ✅, address spec ✅.
      Phone 390/320 drawer screenshots (below minimum, zone, pickup): no overflow.
- [x] Found: the "hydration mismatch" warnings seen earlier come from **Playwright's screenshot
      caret-hiding** (`caret-color: transparent` injected before hydration) — not an app bug.
**Resume point:** done.

### Chunk 6 — T-8 admin: see it, set the fee later, collect it
**Status:** ✅ 2026-10-12 (6a `b9bf820`, 6b — staging)
Split in two (allowed by this plan): **6a** display + set fee + manual collection; **6b** card
payment link for an owed fee.
- [x] 6a — migration `…_order_event_delivery_fee_set` (adds `OrderEventType.DELIVERY_FEE_SET`),
      applied to the **dev DB**.
- [x] 6a — `lib/payments/manualPayment.ts`: `wineOrderBalance()` (wines + fee − live settled
      payments) and `recordAdditionalWinePayment()` (never above the balance).
- [x] 6a — `app/actions/wineOrders.ts`: "Paid" now records **wines + fee**
      (`wineOrderAmountDue`); new `setWineOrderDeliveryFee()` (refuses pickup; clears pending;
      DELIVERY_FEE_SET event) and `recordWineOrderFeePayment()` (cash / bank transfer).
- [x] 6a — Wine Orders page: card total = wines + fee; `feeOwed` per paid order. Cards (full,
      phone compact, table, board, pack) show a Delivery/Pickup badge, "Delivery fee to set",
      "Owes X₾"; full card has "Set fee / Change fee" and "Record payment". Incomplete page and
      super-admin activity totals use `wineOrderAmountDue`; statistics stays wines-only.
- [x] 6a tests: `scripts/test-wine-fee-payment.ts` 7/7; new spec
      `tests/tier3-admin-smoke/wine-order-delivery-fee.spec.ts` 3/3; screenshots desktop / 390 /
      320 OK.
- [x] 6a — regression **10/10** (wine-catalogue-order, payment-amount-integrity wine test, both
      delivery specs); lint: no new errors; test data cleaned (no rules, zones or ZZ orders left).
- [x] 6b — `lib/payments/topUpCheckout.ts`: the Flitt call + own-row lookup moved into a shared
      `runTopUpCheckout(target)`; new `startWineTopUpCheckout()` (balance = `wineOrderBalance`).
      Booking top-up unchanged (checked through the real Order detail UI: 50₾ checkout on the
      order, fresh `…-topup-` reference). Action `startWineOrderFeeCheckout()`; full card's
      "Card payment link" → Copy link / Show QR code (`QrCodeDialog`, client-only). No email from
      here (no wine template) — noted for Max. Settling re-sends the wine receipt, now showing
      Paid = wines + fee (same as bookings re-send their confirmation).
- [x] 6b — Delivery / Pickup filter pills (third axis, AND'd like payment).
- [x] 6b tests: spec now **5/5** (+ card link creates a 15₾ test-merchant checkout with a fresh
      Flitt ref; filter narrows); `scripts/test-settle-wine-fee-topup.ts` **9/9** (signed
      settlement of a fee top-up: settles, nothing owed, first paidAt unmoved, wines total
      untouched, wrong amount refused); `scripts/test-topup-checkout.ts` **3/3** (pre-checkout
      guards: over-balance for both, other tenant). Lint: no new errors.
**Resume point:** done.

### Chunk 7 — T-14 preferred date
**Status:** ✅ 2026-10-12 (staging; migration on the dev DB only)
- [x] Migration `…_wine_order_preferred_date`: `WineOrder.preferredDate DATE` + index
      `[tenantId, preferredDate]`; `OrderEventType.PREFERRED_DATE_CHANGED`.
- [x] `lib/wineOrderDate.ts` (pure, client-safe): `earliestPreferredDate` (calendar day of now +
      lead time), `checkPreferredDate` (missing / invalid / too_soon / closed), `wineLeadHours`
      (single value, or the shorter of the split pair), `formatPreferredDate` (UTC, no day slip).
      Same local-calendar convention as lib/bookingHours.ts. Weekly working-hours "closed" days
      are **not** applied — Max approved lead time + Closed Days only; worth asking.
- [x] `loadWineOrderDelivery` now also returns `dateRules` (booking lead-time settings +
      Closed Days from yesterday on).
- [x] Public form: required "Preferred delivery date" / "Preferred pickup date" (shared
      `DateInput`, min = earliest day) with "This is your preferred day — we will confirm the
      exact day with you."; Closed Day / too soon messages; submit disabled until valid.
      `submitWineOrder` refuses missing / invalid / too soon / Closed Day.
- [x] Admin manual form: optional date, no restrictions. Cards: full card "📅 Preferred: 20 Oct
      2026 · Change / Clear" (`setWineOrderPreferredDate`, PREFERRED_DATE_CHANGED event); a date chip
      on the phone card, table, board and pack. Receipt email: "Preferred … date: … — we will
      confirm the exact day with you."
- [x] **Every existing spec that submits the wine form now chooses a date** via
      `tests/helpers/wineForm.ts` `fillPreferredWineDate()` (payment-amount-integrity ×3,
      wine-catalogue-order, both new wine specs, and tier-5 payment-approved-settlement — the
      tier-5 one is staging-only and **not re-run**).
- [x] Tests: `scripts/test-wine-order-date.ts` **13/13**; delivery spec +1 (Closed Day refused,
      chosen day stored); admin fee spec +1 (set date → DB + event). Full local wine run 12/12
      before the two new tests; both new pass after fixes.
- [x] **Found + fixed by the admin date test:** the card's date box spilled past its 160px
      wrapper and covered the Save button (unclickable). Input now fills its box.
- Phone 320/390 + desktop screenshots: no overflow.
**Resume point:** done.

### Chunk 8 — T-14 calendar view in Wine Orders
**Status:** ✅ 2026-10-12 (staging)
- [x] The month grid moved out of `app/admin/(panel)/orders/CalendarView.tsx` into a generic
      `components/MonthCalendar.tsx` (items by day, caller renders rows; mouse = hover popover +
      `onDayClick`, touch = tap → day panel; MaintenanceNotes §33's input-device rule kept).
      `CalendarView` is now a thin booking wrapper — same props, same behaviour (click a day →
      table filtered to it; tap → bookings under the grid). The one lint error (`setCanHover` in
      an effect) moved with the code — it was already there.
- [x] Wine Orders gets a **Calendar** tab (Cards / Table / Board / Calendar / Pack): orders on their
      preferred date (stage, paid mark, delivery badge, total); clicking a day lists them under
      the grid (no navigation — wine orders have no detail page); **"No preferred date (N)"**
      list below (cancelled ones left out). Choosing any order switches to Cards and scrolls to
      it (`#wine-order-<id>` on both card kinds). The filter pills still apply.
- [x] Tests: new `tests/tier3-admin-smoke/wine-order-calendar.spec.ts` ✅ (count on the right day,
      day panel, undated list, back to the card); booking regression `admin-orders.spec.ts` ✅.
      Desktop + 320px screenshots, booking calendar at 320: no overflow.
- Note: test orders left by older specs (payment-amount-integrity, wine-catalogue-order cancel but
  never delete theirs — KNOWN-ISSUES #3) now carry a date 14 days out, so they appear on the
  calendar on that day in the dev DB.
**Resume point:** done.

---

## Decisions added 2026-10-12 (second round)
- **T-12:** Max approved **exceptions only** — store just the negotiated prices; everything
  else = standard price + company %. Admin screen lists every vintage pre-filled with the
  standard price; "Reset to standard" removes an exception.
- **T-9:** include it; individuals follow the **same** minimum order and delivery fees.
- **Money rule (Chunk 4):** `WineOrder.totalAmount` stays **wines only**; the delivery fee is a
  separate column; amount due = wines + fee through one helper.
- Dev data: Max OK'd re-activating "Rkatsiteli" (done 2026-10-12) and loosening the six specs
  that hard-coded "Number of Guests (minimum 4)" (done; his `min_guests_tasting_lunch` = 2 stays).

### Chunk 9 — T-12 negotiated prices + exporter flag
**Status:** ✅ 2026-10-12 (staging; migration on the dev DB only)
- [x] Migration `…_company_wine_prices`: `CompanyWinePrice(companyId Cascade, wineVintageId
      Cascade, price Int tetri, unique per pair)` — **exceptions only**; CHECK price ≥ 0; RLS
      JOIN-to-Company + app_user grant + anon/authenticated revoke inside the migration (anon REST
      → 401), and in `setup-rls.ts`. `Company.isExporter Boolean @default(false)`.
- [x] `lib/winePricing.ts` `priceWineOrder()` — the one pricing function (public form, admin form,
      both server paths): negotiated price replaces the standard one, the company % applies only to
      the standard lines (once, on their sum — so an order with no negotiated prices totals to
      the same tetri as before; tested for 0/10/15/33.3%). `priceSnapshot` = price actually charged.
- [x] **Visibility rule** (Max: shown only after the code): the resolver returns `winePrices`
      only for a company proven by its access code, a person's code, or an admin (trusted);
      a code-less company picked from the public list gets `winePrices: null` +
      `hasNegotiatedPrices: true`.
- [x] **Decision taken here, flag to Max:** a code-less company with negotiated prices is still
      CHARGED its negotiated price, but **never online** — its total was never shown, and charging
      an unseen amount is the chargeback risk bookings already refuse (§7.4, `priceShown: false`).
      The form says "Your company's agreed prices will be applied — we will confirm the total with
      you." and the button becomes "Place Reservation".
- [x] Companies → Edit (wine-order companies): **Exporter** checkbox + "Exporter" badge on the row;
      **Wine prices** list — every active vintage, standard price greyed (struck through when
      negotiated), type a price (bold) or "Standard" to remove it; saved per row on blur.
      Discount hint reworded to "Applied to every wine … except wines with a negotiated price".
- [x] Wine Orders: "Exporter" mark next to the company on full + phone cards; "Exporter" filter
      pill (from the company, live — it is a label).
- [x] Admin manual form: line prices and total via `priceWineOrder` (also retires a lari-era
      `Math.round(x*100)/100` that no longer matched the server).
- [x] Tests: `scripts/test-wine-pricing.ts` **13/13**; `scripts/test-company-wine-prices.ts`
      **12/12** (isolation, guards, resolver visibility, cascades); new spec
      `tests/tier2-core-flows/wine-order-negotiated-prices.spec.ts` **4/4** (admin set/reset; coded
      company sees + is charged negotiated, % not applied; code-less → reservation at negotiated
      price, no payment; exporter flag + badge + filter). 320px panel screenshot OK.
**Resume point:** done. Wine regression after T-12: **16/16** (all wine specs incl. payment wine test).

### Chunk 10 — T-9 Individual vs Company on the wine form
**Status:** ✅ 2026-10-12 (staging; migration on the dev DB only)
- [x] Migration `…_wine_order_customer_type`: `WineOrder.customerType BookingType @default(COMPANY)`
      (reuses the booking vocabulary; every pre-T-9 order was taken on the business form).
- [x] Public form: **Company / Individual** switch at the top (default **Company**, so the form
      existing B2B customers use is unchanged — bookings default to Individual; flag to Max if he
      wants the other default). Individual hides the company dropdown, business name, LLC fields
      and working hours, and asks "Your full name" / "Phone number" / "Delivery address"; the
      company-discount note is hidden. Switching to Individual drops a company already chosen.
- [x] `submitWineOrder`: INDIVIDUAL → no company, no LLC, no saved address, no company contacts
      (a crafted request cannot attach them); `businessName` = the person's name. Same minimum
      order, delivery, fees and date rules (Max).
- [x] Admin manual form: "Ordering as" select; Individual hides the company card + business/LLC
      fields; `createWineOrderAdmin` applies the same normalisation.
- [x] Wine Orders cards (full + phone): "Individual" mark next to the name.
- [x] Tests: new spec `tests/tier2-core-flows/wine-order-individual.spec.ts` ✅ (fields hidden,
      chosen company dropped, stored INDIVIDUAL with the person's name, mark in admin); full wine
      regression **20/20** after the change; 320px screenshot OK.
**Resume point:** done.

### Chunk 11 — Verify, review, hand to Max
**Status:** ✅ 2026-10-13 (staging) — only Max's decisions + the production runbook remain
- [x] `tsc` clean; i18n parity ✅; **full `next build` ✅**.
- [x] Whole-project lint: **83 errors = 83 at the starting commit `dbfa5d1`** (re-measured after the #78 fix: still 83).
- [x] Vault: Feature note `Features/Feature 225 - Wine order delivery features.md`;
      MaintenanceNotes **§35**; FeatureLog #225; MyToDo 2026-10-12 checklist; KnownBugs #76–#78;
      production runbook (below).
- [x] Full local Playwright suite (tiers 1–4, `--workers=1`, 42.9 min): 51 passed, 5 failed, 2 did not run.
      **Investigated 2026-10-13** — toggles checked first (Individuals on, Companies off, Wine on, no
      overrides: correct), dev server restarted with `.next` wiped and routes warmed, each spec alone:
      1. `wine-catalogue-order` → passes alone (environmental).
      2. `tickets.spec` token test → 4/4 alone (environmental; its leftover T-73 closed OBSOLETE).
      3. `onboarding-wizard` → documented "needs reset"; reset via `lib/onboardingWizardReset.ts` → passes.
      4+5. `payment-label-precedence` + `payment-amount-integrity` company test → **reproduced; time budget,
         not the app.** Trace: every step passes, but ~13 / ~50 admin page loads at 5–10 s (dev DB round
         trip ~360 ms = July baseline) end at ~185 s / ~530 s vs 180 s / 480 s, so `finally` never ran
         and left Alazani Valley Tours / Caucasus Vine Travel on "Always require" (restored to Default).
         This work's Companies (+~1.6 s/load) and Settings (+~0.7 s/load) reads tipped them over → those
         reads now run in parallel; budgets 300 s / 720 s, measurements in the comments. Both pass; all 4
         payment-amount tests pass.
- [x] **Security fix KnownBugs #78, wine half** (`f7ad134`): `companyCodeMatches()` in
      `lib/contactResolution.ts` (company code, or — person codes on — an active person's code at that
      company with the resolver's PER_ORDER/module role filter); hidden `companyCode` on `/wines`;
      `submitWineOrder` refuses "Please choose your company again." / "Please enter your company code
      again."; `pricesShown` counts negotiated lines. `scripts/test-company-code-check.ts` **24/24** (each
      case also asked of the resolver — they agree); new browser test (tampered code refused, no order
      created) — **fails with the check removed**. Wine specs **21/21** + wine payment test.
      Bookings (`createBooking`) had the same gap — Max said fix it (2026-10-13): **done**, `ac9316d`
      (`companyCode` in `buildBookingPayload`, re-checked in `createBooking`; new spec
      `booking-company-code-check` alters the code in flight → refused, fails with the check removed;
      booking + payment regression 14/14).
- [x] Review cards posted: **T-13, T-8, T-14, T-12, T-9 → Ready to test** (open decisions in the cards).
- [x] SessionLog 2026-10-12/13 entry finished.
- [x] Blind, context-free sub-agent code review — Max said yes 2026-10-13. Results below.
- [ ] Production stays untouched until Max's go (runbook below).
**Resume point:** Max's answers on the review's 4 decision items (below), then the runbook step by step
on his go. Max still to confirm (b) code-less negotiated prices = reservation only and (c) Company default
(he asked "which choices?" — explained 2026-10-13). Local helper `saas/scripts/_scratch_shot.ts`
(untracked; never commit).

### Blind review 2026-10-13 (dbfa5d1..f7ad134) — every finding checked against the code
Reviewer had no vault, no commit messages. Fixed on staging (same day):
1. **Fee top-up re-sent the full receipt with "Paid" = whole order** → `settle.ts` passes the settled,
   unreversed payment sum; the receipt shows it, plus "Still to pay" when short. `scripts/test-wine-receipt.ts` 7/7.
3. **Wine order could name a booking-only (or Individuals) company** → lookup now requires
   `isWineOrderCompany: true, isIndividual: false`, like the form's resolver. Spec test added.
4. **Person code at a code-less company: form showed prices + "pay", server took a reservation** →
   `companyCodeProof()` returns 'company' | 'person' | 'named' | null; `pricesShown` is false only for
   'named'. `test-company-code-check.ts` now 32/32 (proof type, and the resolver really shows the prices).
8. **Fractional / huge quantities crashed pricing** → whole bottles 0–1000 on both write paths; a bad
   `wines` JSON gets an answer too. Spec test (quantity altered in flight).
9. **Minimum checked against different totals when prices are withheld; "−10%" overstated with negotiated
   lines** → server holds the minimum to the total the form showed; badge + receipt show the amount off.
10. **Address backfill window** → runbook step 4b (idempotent catch-up copy).
**Decisions for Max (not changed):**
2. Overpayment: the balance counts settled payments only — two card links (or link + cash) can both be
   paid; no row lock between read and insert; a fee lowered below what was paid is clamped to "owes 0" and
   the overpayment shows nowhere. Same design as bookings' top-ups ("UX guard, not final authority").
   Proposed: show "Overpaid X₾" instead of clamping, and warn when an unpaid link already exists.
5. A saved address's delivery zone is only pre-selected; the customer can pick a cheaper zone or "Other".
   Enforce it for saved addresses?
6. "Mark unpaid" reverses every manual payment, including a separately recorded delivery fee; re-marking
   paid does not restore it (fee shows owed again). Proposed: "Mark unpaid" leaves fee payments alone.
11. The date check uses the server clock (UTC on Vercel), so 00:00–04:00 Georgian time a crafted request
   can still pick "yesterday's" earliest day. Bookings work the same way (checked: `slotMeetsLeadTime`
   builds the slot with server-local `new Date(y, m, d, h)`, so on Vercel the server-side lead-time check
   is 4 h too lenient; the form filters slots in the guest's own time, so ordinary guests are unaffected) —
   KnownBugs #79. Proposed: a small separate fix for both to use Georgian time.
Accepted as is: 7 (stale page data → "please choose again" / generic error; Flitt shows the amount).

## Round 2 — Max's decisions 2026-10-13/14
- Review #2 overpayment → **show it to the admin** (yes). #5 saved-address zone → **enforce it** (yes).
  #11 server clock → **Georgian time** (yes). #6 "Mark unpaid" → investigated: no screen offers un-pay on
  bookings or wine orders (the step only offers *unreached* steps; the wine card's comment says reversal is
  a deliberate correction) — the server branch is dormant. **No change**; if an "undo payment" button is ever
  built, it undoes one chosen payment, not "all manual ones", on both.
- **T-12 rethink (Max):** a company with no access code is an **unknown entity** — "fill nothing without an
  access code" (a), and **bookings follow the same rule** (b) "otherwise the code loses meaning".
  The dropdown → code popup flow stays as on dinner booking. T-9 default (Company) confirmed fine.
- T-79 (Settings page in one read) built 2026-10-14, `b7b15f8`: **no measurable speed gain** (5.27 → 5.50 s,
  control page drifted the same); kept for 1 pooled connection instead of 33. Ready to test.

### Chunk 12 — Overpayment visible on wine orders
**Status:** ✅ 2026-10-14 `f4b8755` (staging) — wine-order-delivery-fee spec 8/8 (2 new)
- [x] `wine-orders/page.tsx`: keep the signed balance (due − settled), not `Math.max(0, …)`. Card shows
      "Owes X" when > 0 and **"Credit (overpaid) X"** when < 0 (the wording bookings already use,
      `orders.credit`, EN+KA). Optimistic patches in `WineOrdersClient` stop clamping too.
- [x] Unpaid card link warning: a `Payment` row for the order with `status 'created'`, not settled → the card
      shows "Card link for X sent <date>, not paid yet", so a second link / cash record is a conscious choice.
- [x] Test: spec — record a fee payment, lower the fee below it → "Credit" shows; create a link → warning.

### Chunk 13 — A saved address's delivery area is enforced
**Status:** ✅ 2026-10-14 `5f091b4` (staging) — test-order-delivery 18/18, specs 8/8
- [x] `lib/orderDelivery.ts` `resolveOrderDelivery`: when the order uses a saved `CompanyAddress` that has a
      `deliveryZoneId`, that zone is used (an active zone of this tenant) and `zoneChoice` is ignored;
      if that zone is no longer active → "Please choose your delivery area" fallback stays as today.
      Saved address **without** a zone, or a typed "Other address" → the customer chooses, as today
      (assumption told to Max 2026-10-14).
- [x] Public form: the area shows as fixed text ("Delivery area: X — fee"). Admin form unchanged — the admin
      may still choose (trusted; `opts.admin`).
- [x] Tests: script (address zone wins over a crafted `zoneChoice`, incl. "other"; switched-off zone → choice;
      admin may choose; pickup unaffected); spec (fixed text, doctored "other" still gets the fee).

### Chunk 14 — Date checks in Georgian time (wine + bookings) — KnownBugs #79
**Status:** ✅ 2026-10-14 `f292703` (staging) — 20/20 in local time and TZ=UTC; old code shown wrong under UTC
- [x] One helper `lib/tbilisiTime.ts`: today's date / an instant's wall-clock parts in `Asia/Tbilisi`
      (Intl, no DST in Georgia but don't hard-code +4).
- [x] `wineOrderDate.earliestPreferredDate` and `bookingHours.slotMeetsLeadTime` / `createBooking`'s
      "future date" check use it. The forms use the same helpers, so they now also work in Georgian time.
- [x] Tests: script with fixed `now` values around 00:00–04:00 Tbilisi (= 20:00–24:00 UTC the day before),
      run with `TZ=UTC` to mimic Vercel.

### Chunk 15 — No access code = unknown company (wine orders AND bookings)
**Status:** ✅ 2026-10-14 `2affd7d` (staging) — 44/44 regression; no production read needed (Max)
**Rule:** a company is only *known* to a customer who proved it — its access code, or (person codes on) a
person's own code. Until then: no autofill (people, addresses), no special prices (wine discount %,
negotiated wine prices, booking price tiers), not even the company's name in a list it can't be proven from.
- [x] **Dropdown lists only provable companies:** has an access code, or (person codes on) has an active
      person with a code. Picking one opens the code popup (as now). Code-less companies disappear from
      both public dropdowns; their customers use "Individual / no company" or "New company?" until the
      winery gives them a code. Hide-dropdown mode is unchanged (already code-only).
- [x] **Nothing about a company reaches the page before its code.** Today the booking page ships every
      company's **price tiers** in the page source and the wine page every company's **discount %** —
      both move behind the resolver (returned only with proof). The form shows company pricing only after
      the code; until then, standard/individual prices.
- [x] **Server:** `companyCodeProof` 'named' is no longer enough — both `submitWineOrder` and `createBooking`
      refuse it ("Please enter your company code again."). The T-12 "withheld prices → reservation" branch
      (`pricesShown` false) then cannot occur and is removed — simpler.
- [x] Resolver: a code-less company named without a code returns an error (no people, no addresses) —
      check what else calls `resolveCompanyContactsFor` without a code (admin screens pass `trusted`).
- [x] **Admin Companies screen:** a company with a discount, negotiated prices, price tiers, people or
      addresses but **no access code** shows a warning: "Customers can't choose this company until it has
      an access code" + the existing Generate button. (Warn, don't block.)
- [x] Tests: update the specs that pick a code-less company (negotiated "open" company, any booking spec that
      uses one); new spec: code-less company not in either dropdown; crafted request naming it is refused.
- [x] **Production impact — settled by Max 2026-10-14: no production read.** The one live customer, Nikalas
      Marani, hides the company dropdown (code box only), so code-less companies were already unreachable on
      their forms; they manage their own codes. Dev check: Staging Winery 11/11 companies have codes; the 9
      code-less ones are all in **Vineworks Demo** (deliberately seeded without codes — `lib/demoSeed.ts` — and
      `hide_company_dropdown` is on there too, so nothing changes for it). (Earlier I mislabelled that tenant
      "the dev copy of Nikalas Marani".)

### Chunk 16 — QA + stress test, and its fixes
**Status:** ✅ 2026-10-14 (staging) — Max: "stress test it and QA test it", then "apply any fixes to bugs you found"
Full report: [[QA-WineOrderFeatures-2026-10-14]]. Migration rehearsal on a production-shaped copy (all 7
pending migrations apply in 9.5 s, backfill right, no schema drift, step 4b idempotent); ~90 crafted
requests; load test vs the pre-feature build; full suite 63/65 (the 2 environmental, pass alone twice).
- [x] F1 Georgian dates without ICU (`formatIsoDay`) — receipt email + Wine Orders hydration (KnownBugs #80)
- [x] F2 "No preferred date" = open orders only (#82)
- [x] F3–F7 public wine order: date ≤ 1 year, name/year from DB, active wines only, clean errors, length caps (#83)
- [x] F8/F9 manual top-ups: whole tetri, order row locked (bookings + wine) (#84)
- [x] F10 hand-set access codes ≥ 6 chars, typed-code lookup throttled (#85)
- [x] F11/F12 wine drawer through `t()`; "— Not on the list —" (#86)
- [x] F13 `/wines` delivery setup loaded in parallel; calendar "today" in Georgian time
- [x] F14 runbook 4b note (below)
**Resume point:** done. Max: check the Georgian drawer wording on staging.

---

## Production runbook — DRAFT, needs Max's explicit go for each step (Rule 0)

**What `staging` holds that production does not:** this plan (T-13, T-8, T-14, T-12, T-9), the
2026-10-08 easy wins (T-5, T-23, T-6 + its `?edit=` fix, T-11, T-21), and the internal ticket tool
(Feature 222, which has its own runbook in [[Plan-VerifyBeforeProduction]]: migration + the
`ticket-attachments` bucket **before** the code merge). A `staging → master` merge ships all of it.

0. ~~Read-only list of production companies without a code~~ — not needed (Max, 2026-10-14): Nikalas Marani
   hides the company dropdown and manages its own codes. If the live demo shows a company dropdown, its
   (code-less) demo companies disappear from it — check the demo on staging first.

**Order (migrations first — all additive, so today's production code keeps working on the new
schema: `Company.address` still exists, every new column is nullable or has a default):**
1. Production DB: `prisma migrate deploy` (rehearsed 2026-10-14 on a production-shaped copy — 9.5 s, see [[QA-WineOrderFeatures-2026-10-14]]) — applies, in order, `20261007143059_add_tickets` (ticket
   tool) and this plan's six: `20261012121359_company_addresses` (also **backfills**
   `CompanyAddress` from `Company.address`), `…141158_delivery_zones`,
   `…144005_order_event_delivery_fee_set`, `…155548_wine_order_preferred_date`,
   `…162751_company_wine_prices`, `…165501_wine_order_customer_type`.
2. Check on production: the 4 new tables refuse the anon key (401); `CompanyAddress` row count =
   production companies with an address; `select count(*) from "WineOrder" where "customerType" <> 'COMPANY'` = 0.
3. Ticket tool's bucket step (its own runbook).
4. Merge `staging → master`, push; wait for the Vercel deploy.
4b. **Catch-up address copy** (blind review 2026-10-13): between step 1 and the new code going live, the
   old code still writes `Company.address` only, so a company created or edited in that window has no
   `CompanyAddress`. Right after the deploy, copy those (idempotent — only companies with an address
   and no saved address yet):
   ```sql
   INSERT INTO "CompanyAddress" ("id","companyId","label","address","workingHours","sortOrder","isActive","createdAt","updatedAt")
   SELECT gen_random_uuid()::text, c."id", NULL, btrim(c."address"), NULL, 0, true, c."createdAt", CURRENT_TIMESTAMP
   FROM "Company" c
   WHERE c."address" IS NOT NULL AND btrim(c."address") <> ''
     AND NOT EXISTS (SELECT 1 FROM "CompanyAddress" a WHERE a."companyId" = c."id");
   ```
   Expect 0 rows unless an admin edited companies during the window.
   Note (QA 2026-10-14 F14): this only fills companies with **no** saved address. A company that already
   had one and whose address an admin *changed* during the window keeps the old text in `CompanyAddress` —
   check the Companies screen if anyone edited addresses during the deploy. Rehearsed: 0 rows → 1 after a
   simulated old-code edit → 0 again.
5. Live check on nikalasmarani.vineworks.ge: `/wines` renders, a reservation order with a preferred
   date goes through, Wine Orders shows it; Companies → Edit shows Addresses + Wine prices;
   Settings shows the new panel (nothing configured → form as before).
6. Later, separately: a cleanup migration dropping `Company.address` (no code reads it).

**✅ DONE 2026-10-16** — steps 1–5 run on Max's go (step 4b catch-up: 0 rows; step 5 live checks passed; the real test
reservation was skipped on purpose — live winery). Step 6 (drop `Company.address`) still open, needs Max's OK.
Log: [[QA-Manual-ReadyToTest-2026-10-15]] → "Production release".

---

## Log
- 2026-10-13 — Chunk 11 done: 5 suite failures explained (3 environmental, 2 test budgets), #78 wine fix
  (`f7ad134`), five review cards posted.
- 2026-10-12 — Max unblocked T-12 + T-9 (moved to In progress); verify chunk renumbered 11.
- 2026-10-12 — plan written; Max's answers recorded on T-8/T-13/T-14 (comments); T-8, T-13,
  T-14 moved to In progress. Chunk 1 started.
