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
| **T-13** | Several delivery addresses per company; customer picks one | In progress (Chunks 1–3) |
| **T-8** | Minimum order, pickup vs delivery, delivery zones + fees | In progress (Chunks 4–6) |
| **T-14** | Preferred delivery/pickup date + admin calendar | In progress (Chunks 7–8) |
| **T-12** | Negotiated price per vintage per company + exporter flag | **Backlog — blocked on Max** (storage approach) |
| **T-9** | Individual vs Company wine orders (like bookings) | **Inbox — blocked on Max** (include? same rules?) |

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
  - `contact-orphan-safety.spec.ts` failed once under load, **passed alone** (known pattern).
  - My first version of the new spec deleted its order while `submitWineOrder` was still
    writing `abandonedAt` → P2025 in the server log. Spec now waits for the action to finish.
**Resume point:** done.

### Chunk 4 — T-8 data + Settings
**Status:** 🚧 next
- [ ] `DeliveryZone` model: `id, tenantId, nameEn, nameKa, fee Int (tetri), sortOrder,
      isActive, createdAt, updatedAt`; RLS direct-tenantId policy; both setup-rls lists.
- [ ] `CompanyAddress.deliveryZoneId String?` (SetNull).
- [ ] `WineOrder`: `fulfilment` enum `DELIVERY | PICKUP` (default DELIVERY — every existing
      order was a delivery), `deliveryZoneId` (SetNull), `deliveryZoneName` snapshot,
      `deliveryFee Int?` (tetri; **null on a DELIVERY order = fee not decided yet**).
- [ ] **Money rule to settle in this chunk:** `totalAmount` stays **wines only** (statistics
      and packing read it as wine revenue); amount due = `totalAmount + (deliveryFee ?? 0)`
      through **one helper** used by checkout, cards, emails, CSV. Verify every reader of
      `totalAmount` against this before building (list them in this file).
- [ ] Settings keys (per tenant, `Setting` table): `wine_min_order_type` (`off|bottles|amount`),
      `wine_min_order_value`, `wine_pickup_enabled`, `wine_unknown_zone_payment`
      (`pay_wine_now|reservation`).
- [ ] Settings → Wine orders card: minimum order, pickup toggle, zones list (add / edit /
      deactivate), unknown-zone policy (shown only when online payment is on).
- [ ] Companies edit panel: each address gets an optional zone dropdown.
**Resume point:** —
**Production steps (later):** migration (additive).

### Chunk 5 — T-8 forms: pickup/delivery, zone, fee, minimum
**Status:** ⏳
- [ ] Public wine form: Delivery / Pickup selector (pickup only when enabled). Delivery → zone
      dropdown (pre-selected from the company address's zone) + "Other – we'll contact you".
      Total shows wines + fee, or "+ delivery fee to be confirmed".
- [ ] Minimum order: message + disabled submit on the client; **enforced in `submitWineOrder`**.
- [ ] `submitWineOrder`: re-reads zone fee from DB; snapshot zone name + fee; payment gate:
      known zone → charge wines + fee; "Other" → follow `wine_unknown_zone_payment`
      (charge wines only, fee null; or no checkout → reservation).
- [ ] Admin manual wine order form: same fields (admin may type a fee directly).
- [ ] Customer receipt / admin notification emails show fulfilment, zone and fee
      (`lib/emails/templates/wineOrderReceiptTemplate.ts` — MaintenanceNotes §23).
- [ ] Playwright: pickup order; delivery with a zone fee (amount sent to checkout correct);
      "Other" zone in both policy modes; minimum blocks below and passes at the limit.
**Resume point:** —

### Chunk 6 — T-8 admin: see it, set the fee later, collect it
**Status:** ⏳
- [ ] Wine Orders cards (desktop + phone) + Pack view: Delivery/Pickup badge, zone, fee;
      amber "Delivery fee to set" when DELIVERY + fee null.
- [ ] Admin can set/edit the fee on an order (logged as an `OrderEvent`).
- [ ] If the wine is already paid: the fee is a **balance due**. Extend
      `lib/payments/manualPayment.ts` second-payment path to `wineOrderId` (today Order-only)
      and allow a card-link top-up for wine orders (mirror Plan-PostPaymentExtras Chunks 3–4).
      Investigate first; if large, split into its own chunk and tell Max.
- [ ] Filters: Delivery / Pickup.
**Resume point:** —

### Chunk 7 — T-14 preferred date
**Status:** ⏳
- [ ] `WineOrder.preferredDate DateTime? @db.Date` + index `[tenantId, preferredDate]`.
- [ ] Public form: required date field, label "Preferred delivery date" / "Preferred pickup
      date" + small note "We'll confirm the exact day". Closed Days + lead time enforced on the
      client **and** in `submitWineOrder`. Shared `DateInput` (Feature 221) for phones.
- [ ] Admin manual form: optional date, no restrictions (admin tool, like bookings).
- [ ] Admin can change the date on an order (`OrderEvent`).
- [ ] Shown on cards (desktop + phone), Pack view, emails.
**Resume point:** —
**Production steps (later):** migration (additive).

### Chunk 8 — T-14 calendar view in Wine Orders
**Status:** ⏳
- [ ] View toggle on Wine Orders: Cards / Calendar (by preferred date).
- [ ] Reuse `app/admin/(panel)/orders/CalendarView.tsx` (generalise its order type) rather
      than copy it; keep its hover-vs-tap split (MaintenanceNotes §33).
- [ ] "No date" list for orders without a preferred date. `NOT_ABANDONED` on the query.
**Resume point:** —

### Chunk 9 — Verify, review, hand to Max
**Status:** ⏳
- [ ] `tsc`, lint, i18n parity, full `next build`.
- [ ] Playwright wine specs + new specs; phone 390/320 + desktop screenshots of every changed
      screen (EN + KA).
- [ ] Blind context-free sub-agent code review (fenced off from the vault — see memory
      `feedback_blind_reviews`).
- [ ] Vault: FeatureLog #225, SessionLog, MaintenanceNotes (new couplings), MyToDo checklist,
      Feature note `Features/Feature 225 - Wine order delivery features.md`.
- [ ] Tickets T-13, T-8, T-14 → Ready to test with review cards.
- [ ] Production runbook drafted (migrations order) — **waits for Max's go**.
**Resume point:** —

---

## Blocked — waiting for Max

### T-12 — negotiated prices (Chunk 10 once unblocked)
Open: **storage approach.** Claude recommended *exceptions only* (store just the negotiated
prices; everything else falls back to the standard price + company %), with an admin screen
that lists every vintage pre-filled with the standard price so it *feels* like a full copy.
Reason: a full copy silently freezes old prices when the standard price goes up. Waiting for
Max to confirm. Sketch: `CompanyWinePrice(companyId, wineVintageId, price, updatedAt)`
unique per pair; `Company.isExporter Boolean`; resolver returns prices only on the code-gated
path; `submitWineOrder` re-reads them (never trust the client).

### T-9 — Individual vs Company wine orders (Chunk 11 once unblocked)
Open: include it in this work (Claude recommends yes — it reshapes the same form Chunks 5 and
7 rebuild), and should individuals have the same minimum order and delivery fees (Claude's
default: yes).

---

## Log
- 2026-10-12 — plan written; Max's answers recorded on T-8/T-13/T-14 (comments); T-8, T-13,
  T-14 moved to In progress. Chunk 1 started.
