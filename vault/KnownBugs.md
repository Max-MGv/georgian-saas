---
tags: [bugs]
---

# Known Bugs

| # | Description | Area | Status |
|---|---|---|---|
| 1 | Date filters don't work on orders admin panel | Admin / Orders | 🟢 Resolved |
| 2 | Guest count input: backspace resets to 0, typing prepends to 0 instead of replacing | Public / Booking form | 🟢 Resolved |
| 3 | Time slot picker allows selecting past hours on today's date | Public / Booking form | 🟢 Resolved |
| 4 | Supabase connection pool exhaustion (session mode) — production risk | Infrastructure | 🟢 Resolved |
| 5 | RLS policies deployed but never enforced — withTenantDb is a stub | Security / DB | 🟢 Resolved |
| 6 | Vercel functions ran in `iad1` while databases are in `eu-central-1` — every page ~3s | Infrastructure | 🟢 Resolved |
| 7 | Click-reveal popover silently clipped by an `overflow-hidden` ancestor (2nd instance of this pattern) | Admin / Onboarding | 🟢 Resolved |
| 8 | Flex children don't shrink below content width — Georgian step labels overflowed into neighboring columns | Admin / Onboarding | 🟢 Resolved |
| 9 | Orders page header (title + view toggle + New Order button) had no `flex-wrap` — overflowed at 375px in Georgian | Admin / Orders | 🟢 Resolved |
| 10 | Onboarding wizard's Contact step wrote to the wrong database table (`SiteContent`, feeds only the public `/contact` page) instead of the `Setting` table that actually feeds the sitewide footer/nav and invoice return address | Admin / Onboarding | 🟢 Resolved |
| 11 | Onboarding wizard's company creation ignored the tenant's actual modules — always defaulted `isBookingCompany:true, isWineOrderCompany:false` regardless of what the tenant had enabled | Admin / Onboarding | 🟢 Resolved |
| 12 | `getFinishDetailsStatus()`'s "needs pricing" check applied to ALL companies, including wine-order-only ones that never use price tiers — false-positive nudge | Admin / Onboarding | 🟢 Resolved |
| 13 | Real Companies list page (`/admin/companies`) had zero visual indicator for missing identificationCode/contact/pricing — same underlying data as the nudge banner, just never surfaced per-row | Admin / Companies | 🟢 Resolved |
| 14 | Enhanced-booking and wine-catalogue "code confirmed"/"no rate for guest count"/discount badges hardcode light green/red colors that don't respect the tenant's theme (`BookingForm.tsx`, `WineCatalogueClient.tsx`) — would clash on dark presets | Public / Booking, Wine Catalogue | 🟢 Resolved |
| 15 | `CompaniesClient.tsx` nests a `<button>` (`HelpHint`'s "?" trigger) inside another `<button>` (the row summary) — invalid HTML, hydration mismatch on every `/admin/companies` load | Admin / Companies | 🟢 Resolved |
| 16 | `/wines` Grid view / List view toggle buttons are hardcoded English literals with no `t()` key backing — never translate in any locale | Public / Wine Catalogue | 🟢 Resolved |
| 17 | `app/actions/prices.ts` — `createPrice`/`updatePrice`/`deletePrice` bypassed tenant isolation entirely (raw `db` instead of `withTenantDb`), letting a tenant-A admin write/delete another tenant's pricing data by passing a cross-tenant `companyId`/`priceId` | Security / DB | 🟢 Resolved |
| 18 | Public site nav bar (`SiteNav.tsx`) — Georgian's two-word labels ("ჩვენ შესახებ"/About, "ღვინის შეკვეთა"/Order Wine) wrapped onto 2 lines at desktop widths, uneven with the single-word labels that couldn't wrap | Public / Nav | 🟢 Resolved |
| 30 | Nightly demo reseed did not run — `demo.vineworks.ge` still shows a hand-made booking ("Luka Testashvili") and 395 orders after the 2026-09-12 03:00 UTC window closed, on a stable deployment with `CRON_SECRET` correctly configured | Demo / Infrastructure | 🔴 Open |
| 19 | No protection against concurrent-traffic bursts — production hits a hard 200-connection DB ceiling around 100-150 simultaneous visitors, causing a whole-site outage (including tenant routing) that outlasted the burst by several minutes; zero rate limiting anywhere in the app | Infrastructure | 🔴 Open |
| 20 | Admin panel (`/admin`) doesn't respect tenant theme presets — the nav shell, page background, banners and most UI are hardcoded to the "Cream & wine" preset's exact hex values instead of the `--site-*` CSS vars; only isolated spots (e.g. `var(--color-brand)`) pick up the tenant's actual theme | Admin (all pages) | 🟢 Resolved |
| 21 | Same bug as #20, one level down: nearly every individual admin page body (`CompaniesClient.tsx`, `ContentClient.tsx`, `WinesClient.tsx`, `SettingsClient.tsx`, `OrdersTable.tsx` and ~15 other admin files) independently defines its own hardcoded cream-preset color constant for cards/tables/borders; two shared components used during admin editing (`HelpHint.tsx`, `EditableLongText.tsx`) carry the same bug onto tenant-facing pages too | Admin (nearly all pages) / Shared components | 🟢 Resolved |
| 22 | `app/actions/submitWineOrder.ts` computes the wine-order total entirely from client-supplied `price`/`discountPercent` values (parsed straight out of submitted form JSON) with zero server-side lookup against real `WineVintage.price`/`Company.wineDiscountPercent` — a tampered request can fabricate any total, which also becomes the literal amount charged via Flitt once a tenant has online payment enabled. Same bug class as the already-fixed masterclass-pricing issue (`Plan-SecurityAndBugFixes.md` #3) and #17, never applied here. Found via a dedicated penetration test, confirmed by direct code read. | Security / Wine Orders | 🟢 Resolved |
| 23 | `/admin` main content container hardcoded `max-w-6xl` (1152px) regardless of viewport — on wide monitors every admin page (Orders table especially) rendered narrower than the screen with wasted margin on both sides, while the table still needed its own internal horizontal scroll for its wider content | Admin (all pages) | 🟢 Resolved |
| 24 | Live mirror's "landing moment" never lands — new booking row renders **4,769px below the fold** inside the admin pane (table sorts by visit date, not creation) and the Phase 4.3 row outline is **not applied at all**. The flagship feature's payoff resolves to a counter incrementing by one | Demo / Live mirror | 🟢 Resolved |
| 25 | Spotlight tour draws **no ring on 6 of 7 steps** — `data-tour` anchors fail to resolve and degrade silently to a centred tooltip with no ring, plus the desktop tooltip falls back to the mobile full-width bottom dock at 1440px. Step 4 works, proving the machinery is fine  — **fix on `staging` (`9d3a2b2`), awaiting the `master` merge.** Root cause was not missing anchors (all seven existed) but a single 60 ms measurement racing the route paint; see the 2026-09-11 update below | Demo / Tour | 🟢 Resolved |
| 26 | Starting the spotlight tour from any admin page immediately shows "Tour paused · step 1 of 7" — step 1 declares the guest-site route and the never-dim-a-screen-they-chose rule fires on an explicit press of the start button | Demo / Tour | 🟢 Resolved |
| 27 | Feature rail's deep-link callouts pin to nothing (same anchor-resolution bug as #25) and land on collapsed data — "Per-company price ladders" arrives at `/admin/companies` with every ladder collapsed to "2 tiers" microtext, proving nothing  — **fix on `staging` (`9d3a2b2`), awaiting the `master` merge.** Same root cause as #25; the collapsed-data half fixed via `?expand=first`; see the 2026-09-11 update below | Demo / Feature rail | 🟢 Resolved |
| 28 | `/admin/onboarding` renders outside the admin panel layout, so no demo chrome mounts — front-door path 4 of 4 silently drops the visitor out of the guided demo, and the wizard shows 4/7 steps already complete, disproving its own "how fast is setup?" promise | Demo / Onboarding | 🟢 Resolved |
| 29 | `BugReportWidget` is not suppressed inside `/live` panes (`isEmbeddedPane()` covers the other demo components but not this one), so the flagship screen shows **two** floating red bug buttons; it also overlaps the tour's Next button, the feature rail's list and the mobile front door | Demo / Live mirror | 🟢 Resolved |
| 31 | Company booking form had no way to submit a real booking without an access code — hard-blocked with an error (direct-code tenants) or looped on the browser's own "please select an item" prompt with no escape (dropdown tenants), even though the only alternative ("New Company?") discarded whatever booking details had already been entered | Public / Booking form | 🟢 Resolved |
| 32 | `createBooking.ts` silently priced a `COMPANY` booking with no `companyId` using the *individuals* pricing table (per-person rate × guest count) instead of confirming the price manually, same as any other unpriced company booking | Public / Booking form | 🟢 Resolved |
| 33 | Public booking submission crashed with a 500 (error digest `2710274906`) and the UI hung on "Submitting…" forever — no order was created. Same digest on the "New Company?" registration request path | Public / Booking form | 🟢 Resolved |
| 34 | Admin Messages tab (Site Content → Messages) crashed with a 500 (error digest `3471338459`) on `/admin/wines`, `/admin/content`, `/admin/onboarding` | Admin / Site Content | 🟢 Resolved |
| 35 | Booking Confirmation message edits in the admin Messages tab appeared not to persist reliably — text reverted to the default after a reload | Admin / Site Content | 🟢 Resolved (unconfirmed root cause) |
| 36 | Booking Confirmation email's summary block (labels + the date value itself) stayed in English even with the Georgian toggle selected — `bookingConfirmationTemplate.ts` had no `locale` param at all | Admin / Site Content, Public / Booking form | 🟢 Resolved |
| 37 | Invoice email date rendered as an invalid `MM.DD.YYYY` in Georgian (e.g. `09.14.2026` for 14 September) instead of the day-first format used everywhere else — `toLocaleDateString('ka-GE', ...)` silently falls back to an en-US field order on this Vercel deployment's ICU data | Admin / Site Content, Public / Invoice | 🟢 Resolved |
| 38 | Booking form's Time Slot dropdown said "No slots available today" before any date was even picked — `slotsForDate('')` returns `[]`, and the empty-slots fallback text didn't distinguish "no date chosen yet" from "this date is genuinely full" | Public / Booking form | 🟢 Resolved |
| 39 | On mobile, tapping the booking form's Date field (or its calendar icon) did nothing — no native picker opened, only manual DD/MM/YYYY typing worked. The real `<input type="date">` behind the styled field was hidden with a 0×0 box and relied on a JS `.showPicker()` call, which is unreliable on some mobile engines | Public / Booking form | 🟢 Resolved |
| 40 | Settings → Booking Rules has no validation that a visit type's maximum guest count is ≥ its minimum. Found live on Staging Winery: Wine Tasting minimum is 4, maximum is 3 — any Wine Tasting booking for 4 or 5 guests is silently clamped down to 3 server-side before pricing (confirmed: a 5-guest submission settled at 150GEL/3 guests, not 250GEL/5), with no warning to the admin who set it or the guest who booked it | Admin / Settings, Public / Booking form | 🟢 Resolved |
| 41 | `scripts/test-rls.ts` depends on ambient seeded data: three of its checks assert `rows.length > 0` on `Order`, so they fail whenever the orders table is empty. Chunk 3's authorised wipe emptied it, and the suite went 21/21 → 18/3 with **no RLS regression at all** — proven by inserting two throwaway orders, re-running to 21/21, and removing them again. It is a false alarm that looks exactly like a security failure, which is the worst kind. Fix is to have the test create its own fixture rather than rely on whatever happens to be in the database. | Testing / RLS | 🔴 Open |
| 42 | Demo seed mixed units after the tetri conversion: `demoSeed.ts`'s tier literals are written in GEL, and chunk 3 converted them with `fromMajor` where they are written to `Price` — but `computeTotal` reads the **same literals a second time** for seeded order totals and adds `masterclassAmt`, which comes back from the database already in tetri. Seeded bookings came out at ~1/100 of their intended total with a full-size masterclass line on top. **Sales-facing** — it is the data behind `demo.vineworks.ge`'s admin screens, and Max hit it the first time he pressed Reset Demo after the release. **Third instance of one pattern** (after `OrderDetail.tsx` and `NewOrderForm.tsx`): a Float→integer unit change is invisible to the compiler, so every site doing arithmetic on money must be found by reading, not tooling. Fixed and verified by running the real `seedDemoTenant` against dev: 393 bookings ₾180–₾2,875 (avg ₾580), 45 wine orders ₾163–₾7,079. | Demo / Seeding | 🟢 Resolved |
| 43 | Booking form's success screen rendered `Order.totalPrice` raw — `{confirmedPrice}` with no `formatTetri` (`BookingForm.tsx:628`). A ₾280 booking told the guest **"28000"** under "Estimated total". **Customer-facing.** Reachable on the reservation-only path (an order with a `checkoutUrl` redirects before this screen paints). The same file formats correctly 120 lines earlier when building `confirmTotalValue`, so it was one missed site out of two, not a misunderstanding. Regression introduced by the 2026-09-18 tetri conversion. | Public / Booking form | 🟢 Resolved |
| 44 | Both wine-order paths kept `Math.round(subtotal * (1 - discountPercent / 100) * 100) / 100` (`submitWineOrder.ts:87`, `wineOrders.ts:149`). That expression meant "round to two decimals of lari" and was **correct** while subtotal was a Float of lari; against tetri it rounds at the wrong scale and leaves a fraction, which the `Int` column rejects. Measured: 4550 at 15% → 3867.5, 8999 at 12% → 7919.12, 1999 at 5% → 1899.05, 9900 at 12.5% → 8662.5 — 4 of 5 realistic cases fail the write. **So every discounted B2B company was silently unable to place a wine order**, and `submitWineOrder.ts`'s bare `catch {}` swallowed the throw with no logging, leaving only "Something went wrong. Please try again." Dormant only while all wine prices are whole lari *and* all discounts whole percents. Fixed with `applyPercent`, which rounds at tetri scale; the bare catch now logs. Regression guard added to `scripts/test-money.ts`. | Public / Wine orders, Admin / Wine orders | 🟢 Resolved |
| 45 | Order detail's "add extra" wrote lari into a tetri column — `parseFloat(newExtraAmount) \|\| 0` with no `fromMajor` (`OrderDetail.tsx:542`), against a field labelled "Amount (₾)". Typing `20` stored 20 tetri (**₾0.20**) and dragged the order total down with it; typing `20.50` failed the `Int` write outright. **This one corrupts data — rows written before the fix stay wrong.** The sibling screen (`NewOrderForm.tsx:212`) always did it correctly. Root cause of the escape: `orderExtras.ts:12` declared `data: { label: string; amount: number }` rather than `Tetri`, so the brand had nothing to catch. Both retyped; the same untyped parameter in `manualPayment.ts:61` was closed at the same time (no live bug behind that one, but it was the last unbranded money parameter in the codebase). | Admin / Orders | 🟢 Resolved |
| 46 | Orders CSV export shipped raw tetri under a header reading **"Total (GEL)"** (`orders.ts:468`, `o.totalPrice ?? ''`) — every exported row 100× high in a file an accountant opens in Excel. Fixed with `toMajor`, deliberately not `formatTetri`: a `₾` in the cell makes it text and breaks the column's arithmetic. Regression introduced by the 2026-09-18 tetri conversion. | Admin / Orders | 🟢 Resolved |
| 47 | `assignOrderCompany()` (`orders.ts`) wrote `totalPrice` but **not** `tastingRateSnapshot` / `lunchRateSnapshot` / `registrationFeeSnapshot`, so linking a no-company order to a company produced a brand-new order with null snapshots. Those columns are nullable only to mean "created before the columns existed" — `recalcOrderTotal` therefore fell into its legacy branch on the next extra or masterclass line and re-priced the whole booking off whatever the company's tiers said that day. **This is precisely the repricing bug chunk 4 was written to close, reintroduced through a path chunk 4 did not touch.** Not a money-units bug — it would have existed without the tetri conversion. Both branches now write the three snapshots, matching `createBooking.ts:307-309`. Verified equivalent: `VisitType` has only `TASTING`/`TASTING_LUNCH`, so the branch's rate selection and `recalcOrderTotal`'s reproduce the same total. | Admin / Orders | 🟢 Resolved |
| 48 | Booking form's company price preview dropped the lunch add-on: `estimatedTotal` used `matchedTier.pricePerPerson * guestCount` for the COMPANY branch while `matchedTierRate` — computed two lines above, and what `createBooking.ts:317-320` actually charges — selects `comboRatePerPerson(tier)` for `TASTING_LUNCH`. So a company `TASTING_LUNCH` quote **under-stated** the total the server then stored, visible whenever `showCompanyPrice` is on. Not a money-units bug; drift between two of the five copies of the tier-pricing formula (see [[MaintenanceNotes]] §22). The INDIVIDUAL branch was already correct. | Public / Booking form | 🟢 Resolved |
| 49 | `demoSeed.ts` never wrote `tastingRateSnapshot`/`lunchRateSnapshot`/`registrationFeeSnapshot`, so **all 393 seeded demo orders were snapshot-less** — the #47 shape at 100% of the demo data. Those columns are nullable only to mean "created before the columns existed", so `recalcOrderTotal` took its legacy branch for every demo booking and would reprice the whole thing off live tiers the moment a visitor added an extra. Found by auditing the dev database rather than by reading code. `computeTotal` now returns the three rates alongside the total instead of discarding them. Verified: re-seeded dev, snapshot coverage 0/393 → **393/393**, and the refactor proven arithmetically identical to its predecessor across **1,944 input combinations, 0 differences**. | Demo / Seeding | 🟢 Resolved |
| 50 | `/admin/orders/<id>` invents a ₾50 per-person rate and can silently destroy the real one. `OrderDetail.tsx:303-304` initialises both manual rate boxes to `useState('50')` — not seeded from the order's `tastingRateSnapshot` — and the `customRates` flag only toggles the UI (lines 845/868); it does **not** gate the send. `handleSave` ships the rates whenever `prices.length === 0 && payingGuests > 0`, so an admin who types a guest count into an individual order and presses Save re-prices it at ₾50: a booking sold at ₾70/pp goes **₾280 → ₾200 and its 7000 snapshot is overwritten with 5000 — the original rate is gone**. The screen also *displays* "Rate: 50/50" for every individual order as if that were what it was sold at. Directly contradicts the "No invented 50/100 defaults" rule `createBooking.ts:242` states for itself. `NewOrderForm.tsx:114-115` correctly defaults to `'0'`. | Admin / Orders | 🟢 Resolved |
| 51 | `createOrderAdmin` (`orders.ts:231,239`) never consults `visitType`, unlike `createBooking.ts:259`. An admin-entered walk-in for an individual is always charged the **tasting** rate even when the visit is TASTING_LUNCH. Individual, TASTING_LUNCH, 4 guests, rates 50/80: the public site stores **₾280**, the identical admin walk-in stores **₾200**. Worse second-order effect: the snapshots written at `orders.ts:235-237` *are* visit-type aware even though the creation formula that produced the total was not, so the row describes two different orders — adding a ₾10 extra makes `recalcOrderTotal` recompute from the snapshots and the order **jumps ₾200 → ₾330**. | Admin / Orders | 🟢 Resolved |
| 52 | Order detail double-counts line items on every individual order. `OrderDetail.tsx:441` falls back to `legacyBase = order.totalPrice ?? 0` — which already contains extras and masterclass lines — and line 458 adds `masterclassAmt + extrasAmt` on top. Hits every individual order, since `prices` comes from `order.company?.prices` and individuals carry no company. Individuals tier ₾50/pp, 4 guests, one ₾40 extra: the database, the orders table and the invoice all say **₾240**; the detail screen says **₾280**. The "Live preview — click Save to persist" caveat (line 1359) is gated on `payingGuests > 0` so it is **not shown** on this path, and the number reads as fact. Related: `computedTotal` is typed `number | null` but every branch returns a number, making the `order.totalPrice` fallback at line 1353 unreachable — the detail screen never displayed the stored total at all. | Admin / Orders | 🟢 Resolved |
| 53 | `settle.ts`'s post-settlement email (`sendSettlementEmail`, fired via `void ...().catch(...)` after `settlePayment`'s transaction commits) never once reached Resend's send log, across every live approved settlement checked — Chunk 1's manual proof-of-loop (2026-09-24) and every run of Chunk 3's `payment-approved-settlement.spec.ts` (2026-09-24), independently confirmed each time via `GET api.resend.com/emails` in the minutes right after settlement: zero attempts, not even a failed/bounced one. Root cause suspected, not yet fixed or 100% proven: neither `/api/payments/flitt/return` nor `/api/payments/flitt/callback` awaits this call or wraps it in Vercel's `waitUntil()`/Next's `unstable_after()`, so nothing guarantees the serverless function stays alive long enough to finish it once the HTTP response (a redirect or a JSON body) has already gone out. `sendSettlementEmail` also needs several sequential DB round trips (tenant, settings, site content, the order itself) before it ever reaches the actual Resend API call — unlike `createBooking.ts`'s own fire-and-forget confirmation email, which is the last, single-hop action in an already-executing request and reliably shows up (bounced, but attempted) in the same send log. Likely fix: wrap `void sendSettlementEmail(...)` in `waitUntil()` so the platform keeps the function alive until it resolves. | Payments / Email | 🔴 Open |
| 53 | The admin rate boxes and the company price ladder used **opposite meanings of the same word** with nothing to tell them apart. The tier field is labelled "+Lunch ₾/person (add-on)" and `comboRatePerPerson` adds it to the tasting rate; the manual boxes on the walk-in form and order detail said only "Lunch ₾/pp", but every consumer (`updateOrderEnhanced`, `recalcOrderTotal`, and `lunchRateSnapshot = comboRatePerPerson(tier)`) treats that slot as the **all-in** per-person price for a Tasting+Lunch guest. Two screens, two clicks apart, same word, opposite meaning. Max read it the natural way — as an add-on — which is exactly how an admin would **undercharge every lunch guest by the tasting rate**. No arithmetic was wrong; the labels were. Relabelled as a pair so the inclusion is self-evident: "Tasting only ₾/pp" and "Tasting+Lunch ₾/pp", plus the guest-count fields and the rate badge, EN and KA. No stored data changed. | Admin / Orders | 🟢 Resolved |
| 54 | `Order.guestCount` silently drifts from the tasting/lunch split on **edit**. `NewOrderForm` derives it (`guestCount: totalGuestCount`, i.e. tasting + lunch + free) when an order is **created**, but `OrderDetail`'s Save sends only the three split counts and `updateOrderEnhanced` never writes `guestCount`. So changing the split on an existing order re-prices from the new split while `guestCount` keeps its old value — and `guestCount` is what the orders table, the invoice and the confirmation email display. An order can therefore **bill 14 paying guests while every document says 10**. Nothing validated that tasting + lunch + free stayed under `guestCount`. **Fixed 2026-09-19 together with the tier-rule change:** the party size is now an editable field on both admin screens rather than a derived byproduct, `updateOrderEnhanced` takes and writes it, and both server actions plus both forms reject a split that exceeds the party. | Admin / Orders | 🟢 Resolved |
| 55 | Adding a guide to a company **silently retires that company's access code**, with nothing in the admin panel saying so. `verifyBookingCode()` falls back to `Company.accessCode` only when the company has zero guides — deliberate and documented (Plan-CompanyGuidesAndReps Chunk 1 & 5), so the logic is correct. The problem is the UI: `CompaniesClient.tsx` renders the access-code field identically whether it still works or not. A winery that hands `MARANI42` to a tour operator and later adds one guide turns that code dead — every guest using it gets "Incorrect code" — while the panel keeps displaying it as live. Nobody would connect "added a guide" to "partner says the code is broken". **Fixed 2026-09-19 (Feature 201):** the company code now works and the guest picks which guide they are. | Public / Booking form | 🟢 Resolved |
| 56 | Deleting a guide **silently erases which guide was on every past order**. `Order.guide` is an optional relation with no `onDelete`, and Prisma defaults that to `SetNull` — so removing a guide in the Edit Company panel nulls `Order.guideId` across every historical order, with no warning and no trace. Same failure shape as the `Payment` orphaning recorded in `DataModel/Dependencies.md` finding 2. Currently invisible because **nothing reads `guideId` at all** (see #57's sibling finding, logged in [[Plan-ContactRoles]] as F1) — but it becomes a live data-loss bug the moment any screen displays it. **Fix is designed, not built:** [[Plan-ContactRoles]] replaces `guideId` with `OrderContact` rows carrying name/phone/email snapshots, so deleting a person loses the link but never the facts — the same rule `WineOrderItem.priceSnapshot` and `Order`'s rate snapshots already follow. | Admin / Companies | 🟢 Resolved — `Order.guideId` is gone; `OrderContact` carries name/phone/email snapshots, so deleting a person loses the link and never the facts ([[Plan-ContactRoles]] chunk 1). Regression-tested (`tests/tier2-core-flows/contact-orphan-safety.spec.ts`, chunk 13). `staging` → `master` merged and the production migration + RLS setup run 2026-09-23; verified live on production. |
| 58 | A wine order that goes to the Flitt card-payment gateway and never pays writes its `WineOrder` row correctly (confirmed via direct DB query — `abandonedAt` set, correct `businessName`) but never appears on `/admin/abandoned` — the winery has no way to see or restore-without-payment an incomplete wine order. Found 2026-09-23 running `tests/tier2-core-flows/wine-catalogue-order.spec.ts` for Contact Roles chunk 13 (unrelated to that plan — a pre-existing, separately-scoped issue). Booking-form abandoned orders were not checked for the same gap. Not investigated further — spawned as its own follow-up task rather than fixed in passing. | Admin / Wine orders | 🔴 Open |
| 60 | **A same-day fix for a real race condition (bug below it, the "duplicate `OrderEvent(PAID)`" incident) introduced a worse bug than the one it fixed.** The original bug: Flitt delivers a settlement through two channels (browser redirect + server webhook) that can land milliseconds apart, and `settle.ts` read `Payment.settledAt` *before* its own transaction wrote it, so both near-simultaneous callbacks could see "not yet settled" and both proceed — confirmed live, one settlement produced two `OrderEvent(PAID)` rows. **First fix (commit `45f8629`, 2026-09-24):** made the check-and-write one atomic conditional update, `tx.payment.updateMany({ where: { id, status: 'created' }, ... })`, treating `claim.count === 0` as "already handled." **This was wrong, and worse than the original bug.** `status` starts at `'created'` and is flipped away from it by the *first* callback of *any* kind — including a non-final `processing` one. Flitt can legitimately send `processing` before the real, final `approved`/`declined` callback (the file's own comment on `processing` already said so — "still in flight and may yet approve"). Under the `status: 'created'` gate, that first `processing` callback permanently claimed the row, and the later genuine final callback was silently rejected as `already-settled` — **a customer who actually paid could have their order stuck unpaid forever, with nothing anywhere surfacing that this happened.** Caught not by inspection but by Chunk 3's own live decline test observing Flitt report `status: 'processing'` for a card that should decline immediately — a non-terminal value where a clean one was expected. **The lesson this entry exists to teach:** wrapping a check-and-write in a transaction or an atomic `updateMany` does not, by itself, fix a race condition — the *fix has to reason about which single fact is actually the one that must never change twice*, and gate on exactly that fact. `status` looked like "has this payment been handled" but was actually "has this payment received any callback at all," a different and much broader condition. **Corrected fix (commit `46cf7c2`, 2026-09-24):** gate on `settledAt: null` instead. `settledAt` is the one fact that actually matters — "has this payment ever truly, finally succeeded" — set exactly once, only on approval, and once set nothing should ever act on the payment again. A `processing` callback never sets it, so a later genuine `approved`/`declined` still passes the gate; two truly simultaneous `approved` deliveries still can't both win, because Postgres serializes the concurrent `updateMany`s on the same row and the loser finds `settledAt` already non-null. **Accepted, documented trade-off:** if Flitt ever delivers the exact same *non-final* status twice in the same race window (two simultaneous `processing` or two simultaneous `declined` pings), both could still pass this gate and both would record an `OrderEvent` — a duplicate audit-log row. Not solved here, deliberately: nothing in the app reads or acts on that event count, it's human-readable history only, and this exact weakness already existed, unremarked, before either fix touched this function. Verified two ways (both required by design, not just one): (a) a deterministic sequential script — `processing` then `approved` for one fresh Payment on Staging Winery's dev DB — asserting the `approved` call actually settles (it would have failed under the first fix); (b) a re-run of the original concurrency test (two simultaneous `approved` calls for one payment), confirming the corrected gate still closes the *original* race too. Both throwaway scripts (`npx tsx`, not committed), all test rows cleaned up and confirmed gone by a follow-up query. **Follow-up (2026-09-24) — independent audit, not another incident:** a separate audit reviewed the corrected `settledAt: null` gate above and confirmed the core exactly-once-settlement guarantee is sound, then found two narrowly-scoped things still worth closing — not a redesign. **(1)** The accepted trade-off this entry documented above — two simultaneous deliveries of the exact same *non-final* status (two `processing` pings, or two genuine `declined` pings) both passing the gate and both writing a duplicate `OrderEvent` — is now closed: the claim's `where` also requires `status: { not: orderStatus || 'unknown' }`, so the second of two identical concurrent pings finds the row's `status` already equal to what it's trying to write and gets `claim.count === 0`. A `processing → approved` sequence is untouched, since the statuses differ. **(2)** The `!approved` branch used to record `OrderEvent(PAYMENT_DECLINED)` for *any* non-approved status, including `processing` — which is not a decline, just "still in flight." A `processing → approved` sequence therefore wrote a false "declined, then somehow paid" line onto the order's own timeline. Fixed by skipping the `OrderEvent` write entirely when `orderStatus === 'processing'` (no new `OrderEventType` — that needs a migration, out of scope here); the `Payment` row's `status`/`rawResponse` still update unconditionally either way. Both changes made together in commit `317a144` on `staging`. Verified with three scenarios against Staging Winery's dev DB (throwaway Order+Payment rows, signed bodies, cleaned up after): (A) two concurrent identical `processing` calls write zero `OrderEvent` rows, and a following `approved` call still settles normally with exactly one `OrderEvent(PAID)`; (B) two concurrent identical genuine `declined` calls now write exactly **one** `OrderEvent(PAYMENT_DECLINED)`, not two; (C) two concurrent identical `approved` calls still produce exactly one `settled` + one `already-settled` + one `OrderEvent(PAID)` — confirming neither change reopened the original race. The audit's other finding — a genuine gateway-side `reversed` (refund/chargeback) callback is still silently discarded, since nothing in this app reacts to that status at all — is a separate, undecided feature question, not fixed here; see `Plan-PaymentE2ETesting.md` §1b and its "Incident and fix" continuation. | Payments / Settlement | 🟢 Resolved |
| 59 | **Every seeded demo order had zero `OrderContact` rows** — `lib/demoSeed.ts` wrote `Order.name/surname/phone/email`/`WineOrder.contactName/Phone/Email` directly from the seed spec via `db.order.create()`/`db.wineOrder.create()`, but never called the real write path (`writeOrderContacts()`) or wrote any `contacts` relation at all, despite `CompanyPerson` rows (with real codes) being correctly seeded for the same companies since chunk 12. Confirmed on the dev DB before the fix: 0 of 125 demo-tenant company bookings and 0 of 45 demo wine orders had any `OrderContact` row. Consequence: opening any seeded company booking or wine order in the public demo tenant's admin panel (`demo.vineworks.ge`) showed no Guide/Contact Person on the Contacts card, even though the feature is fully built and every other tenant's real orders work correctly. Found by a 2026-09-23 blind audit (vault fenced off, [[Plan-ContactRoles]] Chunk 14) — it also flagged this as decision 4's "written in exactly one place" being violated by a fourth, silent write site. **Fixed same day:** the company/wine-company seed loops now keep each seeded person's id alongside the spec, and both order-writing loops attach a nested `contacts: { create: [...] }` using that same person's id and current name/phone/email — so the `OrderContact` snapshot always agrees with the columns it mirrors, exactly as decision 4 requires. Verified by re-seeding the dev demo tenant for real: 135/135 company bookings now carry a `contact_person` row, all 135 also carry a `guide` row (every company has a guide since chunk 12), 45/45 wine orders carry a `contact_person` row, 258/258 individual bookings correctly carry none (matches real app behaviour), 0 dangling `personId` references, and a spot-checked sample order's `Order.name/surname/phone/email` match its `OrderContact` snapshot exactly. `tsc` 0, parity 173/173+1109/1109, `test-order-contacts.ts` 36/36, `audit-money.ts` clean — all unchanged. | Demo / Seeding | 🟢 Resolved |
| 57 | **Every company's access code is served in the public homepage's HTML.** `app/(site)/page.tsx:52` selects whole `Company` rows and passes them to `BookingForm`, a client component whose `Company` type declares `accessCode: string | null` — so all booking companies' codes are in the page payload and readable with View Source, defeating the code gate entirely. The form only ever uses the value as a boolean (`if (!company.accessCode)`), so nothing needs the real code client-side. `app/(site)/wines/page.tsx` needs the same check. On `master` now. Related but lower severity: `app/admin/(panel)/orders/page.tsx:289` passes full representative rows *including their codes* into `OrdersTable` when only id/name/email are used. **Fix:** send `hasAccessCode: boolean` instead — one line per page. | Security / Public site | 🟢 **Resolved — merged to `master` and verified live 2026-09-23.** ⚠️ **A second, deeper leak of the same family was found by an audit on 2026-09-22 and fixed the same day** — `resolveCompanyContacts`, an unauthenticated server action, returned a company's entire staff directory (names, phones, emails) when given a company id and **no access code**, because the code check only ran when a code was supplied. Company ids are in the public homepage's HTML. The gate is now enforced server-side whenever the company has a code; see [[Plan-ContactRoles]] §9b A1. The form asked for the code; the server never insisted — **a gate only the client enforces is not a gate.** [[Plan-ContactRoles]] chunk 7 (2026-09-22): both pages now send `hasAccessCode: boolean` and never the code. Verified live on the dev tenant with a check built to tell the two outcomes apart — the homepage carries 5 companies that *do* have codes, `hasAccessCode` is present in the payload, and none of the 5 codes appears anywhere in the page source. `WineCatalogueClient.tsx`’s own `accessCode` field went with it. The admin-side half (F4, representatives' codes reaching `OrdersTable`) closed in chunk 10. Production migration + RLS setup run 2026-09-23; production homepage/wines page confirmed rendering correctly post-cutover. |
| 62 | **Mobile admin orders card list: the "Paid" status option (and anything below it) can be clipped and unclickable.** `OrdersTable.tsx`'s mobile card list (`<768px`) renders each booking as a `<div className="rounded-xl border overflow-hidden">`; the status trigger's inline dropdown is a plain `position: absolute` sibling inside that same card, not a portal like the desktop table's equivalent dropdown further down the same file. For an order early in its lifecycle (5 menu rows: Confirmed/Completed/Invoice Sent/Paid/Cancelled), the dropdown's real layout height can exceed the remaining space inside the card's own box, and the card's `overflow-hidden` clips it — invisibly and unclickably, since a real tap at the "Paid" button's own `getBoundingClientRect()` coordinates was confirmed live (`document.elementFromPoint()`) to resolve to the *next card* instead. Found 2026-09-24 while live-testing the fix for the unrelated "Paid picker closes itself instantly" bug ([[Plan-PaymentE2ETesting]] Chunk 4) — this is a separate, pre-existing bug the same testing pass happened to surface, not something that fix introduced. | Admin / Orders (mobile) | 🟢 **Resolved 2026-09-24, commit `7926231` on `staging`.** The mobile card's trigger now calls the same `toggleStatusMenu()` used by the desktop table/list/board views, which sets `statusMenuRect` from the trigger's own `getBoundingClientRect()` and renders through the one shared `createPortal(..., document.body)` at the bottom of the component — the mobile-only inline `position: absolute` dropdown was deleted outright rather than patched. **Verified live on `staging.vineworks.ge` at a 375px viewport**, before and after: on the pre-fix deploy, `document.elementFromPoint()` at the "Paid" button's own coordinates resolved to `ZZPaymentIntegrity OffNew ▾` (the next card) — reproducing this entry exactly; after the fix, the same check on a fresh short NEW/unpaid/uninvoiced order resolved to the "Paid" button itself, `ancestorChain: ["BUTTON.w-full", "DIV.rounded-lg"]` (i.e. two levels from `<body>`, not nested inside the clipped card at all). Clicked "Paid", confirmed the "How was this paid?" Bank Transfer/Cash sub-picker also renders fully via the same portal and is genuinely clickable (`elementFromPoint` check passed there too), then clicked "Bank transfer" for real and confirmed end-to-end against the dev DB directly: `Order.paidAt` set, `Payment{ provider: 'manual', method: 'BANK_TRANSFER', status: 'recorded', settledAt` set, `amount` matching `totalPrice` exactly `}`. Desktop table, list, and board dropdowns, plus the order-detail page's own dropdown, re-checked live and unaffected. Test order and its `Payment`/`OrderEvent` rows deleted after verification, confirmed gone by a follow-up query. `tsc --noEmit` clean. |
| 63 | **Not a bug — a design trade-off worth a deliberate decision later.** Fixing #62 (mobile orders dropdown clipping) meant routing the mobile card's status dropdown through the same shared portal desktop already uses, rather than keeping a separate mobile implementation. A side effect: mobile dropdown rows now render at desktop's smaller size (`text-xs`/`py-1.5`) instead of the larger, more thumb-friendly size they had before (`text-sm`/`py-2.5`) — smaller tap targets on the one surface (phones) where tap-target size matters most. Nothing is broken; every row is fully visible and clickable, just smaller than before. **Options, not yet decided:** (a) leave it — one implementation is simpler to maintain and the rows are still usable; (b) give the shared portal a size variant so mobile can request larger rows without forking the dropdown logic again. **Max's call (2026-09-24): record for later, revisit when convenient** — not urgent, purely a polish question. | Admin / Orders (mobile) | 🔴 Open — low priority, deferred |
| 61 | **No safety net if BOTH of Flitt's settlement notifications fail to arrive.** Every real settlement is confirmed through two independent, equally-authenticated channels (the browser redirect and the server webhook — see bug #60 for the full story of getting *that* race right). Flitt retries the webhook automatically for up to 24 hours if it's not acknowledged, and the browser redirect is a completely independent path, so this requires both to fail for unrelated reasons in the same window — genuinely rare. But if it happens (e.g. a guest's browser crashes right after paying *and* something blocks our server from ever successfully acknowledging the webhook across all 6 retries), the order just sits there unpaid forever, with nothing anywhere to notice or fix it — surfaced 2026-09-24 by an independent architecture audit while evaluating whether one channel should be prioritized over the other (it shouldn't be — see [[Plan-PaymentE2ETesting]]'s "Incident and fix" section). **Not a live incident, no evidence this has ever actually happened** — logged because the failure mode is real and worth having on record, not because anything has been observed to go wrong. **Proposed (not built) fix:** a periodic reconciliation job that queries Flitt's own order-status endpoint (`GET .../api/status/order_id`) for any payment still unresolved past some threshold (e.g. an hour) and settles it for real if Flitt says it actually went through. **Max's call (2026-09-24): correctly low priority, deliberately deferred** — genuinely rare, no known instance, revisit much later rather than now. | Payments / Settlement | 🔴 Open — low priority, deferred |
| 64 | **Editing an already-paid order silently detaches its displayed total from the amount actually charged — and nothing anywhere can tell.** `updateOrderEnhanced` (`app/actions/orders.ts`) recomputes `Order.totalPrice` (and the rate snapshots) whenever an admin edits guest counts/extras, but never once references `tx.payment` — confirmed by reading the function in full, then proving it live (Plan-PaymentE2ETesting Chunk 6, 2026-09-25). `Payment.amount` is written exactly once, at `startCheckout()` time, and after that is only ever *read* (`settle.ts`'s amount-equality gate, checked once, against the *original* callback — never re-checked against a later edit). **Live-verified, not just read from the code:** a real individual booking (Tasting + Lunch, 4 guests) was taken through an actual Flitt settlement on Staging Winery's permanent test merchant — `Payment{ provider: 'flitt', method: 'CARD', status: 'approved' }`, `amount` = 48000 tetri (480₾), agreeing exactly with `Order.totalPrice` at that point. The order's own admin detail page was then used to raise the party size and the Tasting+Lunch split from 4 to 6 (the ordinary "add two more guests" edit, at the *same* per-person rate the order was already sold at — the most sympathetic version of this edit, not an edge case) and saved. Afterward: `Order.totalPrice` = 72000 tetri (720₾) on **every single UI surface checked** — the admin orders table, the order's own detail page ("Order Total": 720.00₾), the CSV export, and a freshly re-sent invoice email (720 stated, sent to the guest's real address) — while a direct read of the same `Payment` row shows `amount` still exactly 48000 tetri, `status='approved'`, `settledAt` unchanged, byte-for-byte identical to before the edit. **A real customer whose card was charged ₾480 now has an order that says, everywhere an admin or the customer themselves could look, that ₾720 is owed/was paid — with no way to notice the ₾240 discrepancy short of directly querying the database.** There is no payments-list screen anywhere in this app (confirmed again while investigating this — the only UI-adjacent read of `Payment` is indirect, via `Order.paidAt`), no reconciliation check, no warning banner, nothing that ever compares these two numbers. Real-world impact: an admin re-sending an invoice or reading the order detail page after any post-payment edit (a very ordinary thing to do — adding a guest, a masterclass line, or an extra to a booking that already has a deposit or full payment on file) would confidently tell a customer the wrong amount is owed, in either direction (undercharging or overcharging, symmetrically — the bug is "the two facts stop being the same," not that the total always moves one way), and neither the admin nor the customer has any way to catch it, since every screen agrees with every other screen, just not with what the gateway actually processed. **Not fixed here, per [[ClaudeInstructions]] Rule 8** — this chunk's job was to test and document, not to patch `updateOrderEnhanced`. Live-verified reproducible test: `saas/tests/tier5-payment-e2e/payment-edit-after-payment.spec.ts`; full write-up: `playwright/notes/17-payment-edit-after-payment.md`. | Payments / Orders | 🔴 Open |

---

## Bug #55 — Adding a guide silently retires a company's access code, and the admin panel doesn't say so

**Severity:** Medium-High — no data loss, but it breaks a code already in circulation with a real partner, gives the guest a flatly wrong error ("Incorrect code" for a code the panel still shows), and gives the admin no way to connect cause to effect
**Found:** 2026-09-19, while seeding guides onto Playwright fixture companies · **Status:** 🟢 Resolved 2026-09-19

**This is not a logic bug.** `verifyBookingCode()` (`app/actions/companies.ts`) falls back to the company-level
`accessCode` **only when the company has zero guides**, which is exactly what its own comment says and exactly
what `Plan-CompanyGuidesAndReps` specifies in two places (Chunk 1 and Chunk 5). The rule is deliberate: once a
company has guides, every booking should be attributable to a named person rather than a shared code. Changing
the fallback would undo a real product decision, and it should not be changed.

**The problem is that the UI does not reflect the rule.** `CompaniesClient.tsx` (~line 573) renders the access-code
field unconditionally, with a static hint, no awareness of whether the company has guides. So:

1. A winery gives `MARANI42` to a tour operator.
2. Months later they add one guide to that company.
3. `MARANI42` stops working that instant. Every guest using it is told "Incorrect code."
4. `/admin/companies` still shows `MARANI42`, still lets you edit it, still looks live.

Nobody would connect step 2 to step 3.

**✅ FIXED — Max's design, built and verified on dev the same day. See [[Feature 201 - Guide Picker After Company Code]].**

**The fix: keep the company code alive and disambiguate with a picker.**

The company code continues to work even when guides exist. Entering it opens a second popup — "Which guide are
you?" — listing the company's guides; the chosen one populates `matchedGuideId` exactly as a direct guide-code
match does today. Guide codes remain the shortcut for anyone who has one.

This is better than the alternative below because it keeps the code *useful* instead of merely admitting it is
dead, while still satisfying the reason the rule exists: the booking is still attributed to a specific guide.
It also removes the path asymmetry noted at the end of this entry — `findBookingCodeByCode()` already accepts a
company code unconditionally, so under this design both entry points agree.

**The one trade-off to decide deliberately.** Today a guide code *proves* identity: only that guide holds it.
With a picker, anyone holding the company code can select any guide, so attribution becomes self-declared rather
than authenticated — someone could pick a colleague and put that colleague's phone on the booking sheet. Whether
that matters depends on what guide attribution is *for*. The plan's own rationale ("the printed booking sheet can
show that guide's phone") reads as operational labelling, in which case the trade-off costs nothing real. It
would matter if guide identity ever gates commissions or per-guide reporting.

**Two details to settle when building it:**
- An **"I'm not on this list"** option falling back to the company's own contact details, so a guide who has not
  been added yet is not stuck.
- The picker shows every guide's name to anyone holding the company code. Fine for a partner agency, but worth a
  conscious decision rather than a surprise.

**Weaker alternative, recorded for completeness (Claude's first suggestion — UI only, no behavioural change):**
- When a company has ≥1 guide, render its access code as **superseded**: greyed, with a line such as "Not in use —
  guests book with a guide's code." Keep the value visible for reference so it stops looking like a live credential.
- Warn at the moment it happens: adding a company's **first** guide should say plainly that the shared company code
  will stop working and anyone already holding it will be turned away.
- Rejected in favour of the picker: it documents the trap instead of removing it.

**Why it went unseen:** every fixture company had zero guides, so the interaction was never exercised — the
Plan's own Chunk 5 checklist notes the specs "needed no changes" for exactly that reason. It surfaced only when
seeded data was made more realistic. A documentation-based system map would not have caught it either: both
files describe themselves accurately, and the hazard lives in the *interaction* between them.

**Asymmetry worth noting separately (not part of this bug):** `findBookingCodeByCode()` — the direct-code-entry
path, where the visitor types a code with no company selected — falls back to `findCompanyByCode` unconditionally.
So the same company code can be rejected on the dropdown path and accepted on the direct-entry path. Both
comments claim the two "mirror" each other. Worth a deliberate decision about which is right.

---

## Bugs #43–#52 — the tetri conversion's residue, found 2026-09-18, fixed 2026-09-19

Found by a deliberately **uninformed** review. Max asked for a second opinion on the money
design and specified the reviewer be given no context — no decisions, no thought process,
just "examine how this codebase handles money." It went looking for live defects rather
than design quality and found five; a sixth (#48) surfaced while verifying its claims.
Every one was confirmed against the source before being written down here.

### They are not all the same kind of thing

Max's question on reading them — *"is the point that some actions don't treat our values as
tetri? we simply forgot to update the code?"* — is right for three of the six, and the
exceptions are the interesting part.

| Kind | Bugs | Where the wrong value lands | What prevents it |
|---|---|---|---|
| Missed a **display** conversion | #43, #46 | On a screen or in a file. DB is fine. | The lint rule below |
| Missed an **input** conversion | #45 | **Written to the database, permanently** | Typing the parameter `Tetri` |
| **Stale logic** that was correct before | #44 | Throws — the app fails rather than lies | Nothing mechanical. Only reading. |
| Not a money-units bug at all | #47, #48 | Repricing / a wrong quote | A shared pricing helper (§22) |

**#44 is the one worth understanding.** Nobody forgot to convert anything. The line
`Math.round(x * (1 - p/100) * 100) / 100` was *correct, deliberate* code meaning "round to
two decimals of lari". Under tetri it is not a missing conversion — it is an operation whose
**purpose evaporated** while it kept running and kept returning a number. No conversion
audit finds this: grep every money site for a missing `fromMajor` and this line passes,
because nothing is missing. Finding these requires asking "why does this line exist?",
not "is this converted?".

### Why the original sweep missed them

`Plan-DataModel.md` records the conversion's own biggest finding: **`tsc` catches nothing.**
Prisma maps both `Float` and `Int` to `number`, so changing every money column produced
**zero** type errors across the codebase. The remediation was a grep anchored on the `₾`
character — 198 occurrences.

Its blind spot is exactly *a money site with no `₾` next to it*. All four
display/IO defects sat in it. That is not bad luck; it is the shape of residue that method
leaves, and it was predictable from the method.

### What now holds the line

`saas/eslint.config.mjs` gained a `no-restricted-syntax` rule rejecting money identifiers
rendered directly as JSX children — `<p>{confirmedPrice}</p>`, `<p>{order.totalPrice}</p>`,
`` <p>{`${total} GEL`}</p> ``. It exists because the compiler provably cannot help here.

Two design notes, both learned by testing rather than assumed:

- **The identifier list is explicit**, not a `/price|amount|total/` pattern, so it does not
  fire on `totalOrders` or `priceLabel`.
- **Every selector is rooted at `JSXElement >`** — only money *rendered as a child*. An
  attribute (`value={price}` on an admin input, `total={x}` passed to a component) is not
  flagged: passing tetri to a prop is correct, and those inputs hold an editable lari
  *string*. Without that root the rule reported **9 false positives and zero real defects**.

Verified against a probe covering all three bad forms plus four good ones, then run across
the codebase: **0 violations** once #43 was fixed.

### The database audit — what was actually damaged

Max authorised inspecting and repairing dev data directly ("all data is fake anyway; we
aren't taking real orders yet"). Built `saas/scripts/audit-money.ts` — a read-only
plausibility sweep over every money column looking for the two shapes a unit error leaves:
a value ~100x too small, and a non-integer (what #44's stale rounding produced).

**Result: no damaged rows anywhere.**

| Column | n | min | max | under floor | fractional |
|---|---|---|---|---|---|
| `Order.totalPrice` | 393 | ₾180 | ₾2,875 | 0 | 0 |
| `OrderMasterclass.pricePerUnit` | 73 | ₾25 | ₾60 | 0 | 0 |
| `WineOrder.totalAmount` | 45 | ₾163.20 | ₾7,078.80 | 0 | 0 |
| `Price.pricePerPerson` | 30 | ₾25 | ₾90 | 0 | 0 |
| `WineVintage.price` | 17 | ₾15 | ₾40 | 0 | 0 |
| `WineOrderItem.priceSnapshot` | 109 | ₾15 | ₾40 | 0 | 0 |
| `OrderExtra.amount` | **0 rows** | — | — | — | — |

**#45 never wrote a bad row** — `OrderExtra` is empty, because nobody has used the admin
"add extra" button since the migration. The bug was real and would have corrupted the first
row it touched; it simply never got the chance.

The non-round wine totals (₾163.20, ₾7,078.80) are the useful signal in that table:
discounts *are* being applied and *are* landing on exact tetri, which is #44's fix working
on real data rather than in a test.

The audit's one genuine finding was #49, which no amount of code-reading had surfaced:
393 of 393 orders missing their rate snapshots. Keep `audit-money.ts` — it is read-only and
is the cheapest way to answer "did anything get written wrong" after future money work.

### The second blind review — pricing, 2026-09-19

Max asked for an independent read of *pricing* specifically, again with no context, and this
time with the `vault/` directory explicitly fenced off — by then it held the whole prior
analysis, which would have anchored the reviewer instead of testing it.

It counted **nine** places that decide what a booking costs, not the five §22-plus-my-own-count
had reached: five server sites that write `Order.totalPrice` (`createBooking`,
`updateOrderEnhanced`, `createOrderAdmin`, `assignOrderCompany`, `recalcOrderTotal`), three
client sites that display a total (`BookingForm`, `NewOrderForm`, `OrderDetail`), and the seed.
Six of the nine agree. Three disagreements were real and are #50–#52 above.

**It also corrected the previous conclusion about consolidation.** The stated obstacle had been
that a shared helper must take rates as arguments because the browser preview cannot see
snapshots — framed as a design decision needing Max's sign-off. Checking the import graph
settles it: `lib/pricingUtils.ts` has no `'use server'` and no server-only imports, and is
already imported by eight files spanning both sides (`BookingForm.tsx`, `OrderDetail.tsx`,
`NewOrderForm.tsx`, `CompaniesClient.tsx`, `createBooking.ts`, `orders.ts`, `pricing.ts`,
`app/(site)/page.tsx`). There is no boundary to cross. Taking rates as arguments is the
obvious shape, not a hard call.

The better framing, which replaces §22's: **the sites do not disagree about pricing, they
disagree about where rates come from.** Three ask "what is this worth at the agreed rates"
(`createBooking`, `recalcOrderTotal`, `assignOrderCompany`); two ask "what should this be
re-priced to now" (`updateOrderEnhanced`, `createOrderAdmin`). That entire distinction
collapses into which rate resolver you call — one arithmetic function plus three or four
resolvers, with the one genuine policy asymmetry (individuals do not pay the tier's
registration fee) living in a resolver rather than in the arithmetic.

**Sequencing, which is the part that matters.** Extraction will change behaviour at exactly
these three sites, because they have drifted — so extracting first buries three fixes in a
mechanical diff where a fix and a fresh bug look identical. Tests first, then fix, then
extract.

### Still open

The tier-pricing formula is copy-pasted in **nine** places (see the second blind review above).
#48 and #50–#52 are that drift already having happened, four times. Extracting a single
`priceBooking()` plus rate resolvers into `lib/pricingUtils.ts` is the outstanding item — see
§22, updated 2026-09-19. There is no technical obstacle; the only caveat is sequencing.

Also outstanding: `findTier` silently falls back to the highest tier for an out-of-range guest
count. That is deliberate, documented and covered by
`tests/tier2-core-flows/booking-enhanced.spec.ts:186-204` — but the name hides it. Renaming it
`findTierOrHighest` (behaviour unchanged) would make the fallback visible at all eight call
sites.

---

## Bugs #38–#39 — booking form Date/Time Slot fixes, 2026-09-15

Found by Max on `staging.vineworks.ge` (#38 from a screenshot, #39 by testing on a real phone).
Both live in `saas/components/BookingForm.tsx` / `saas/components/DateInput.tsx`.

> 🟢 **#38 RESOLVED.** Added a new `form.select_date_first` string (`lib/t.ts`, both locales) and
> made the Time Slot `<option>` pick between it and `form.no_slots` based on whether
> `selectedDate` is set (`BookingForm.tsx:840`). No change to slot-availability logic itself —
> purely which message explains an empty list.

> 🟢 **#39 RESOLVED.** `DateInput.tsx` used to keep the real `<input type="date">` at
> `width:0; height:0` and open it only via `.showPicker()` triggered from `onFocus`/`onClick` on
> the styled text field — confirmed via `getBoundingClientRect()` on a mobile-emulated session
> that the hidden input really was 0×0, a known trigger for `showPicker()` misbehaving on mobile
> engines (notably iOS Safari, which is stricter about the user-gesture requirement than desktop
> Chrome). Rebuilt so the real date input is sized to exactly cover the calendar-icon hit zone
> (40px, confirmed by measuring both elements' rects after the fix) and positioned on top of it —
> tapping that zone now hits the native input directly, so the browser opens its own picker via
> normal default behavior, no JS trigger needed at all. The rest of the field (the typing area)
> is left uncovered, verified by typing a full date there after the fix and confirming it still
> populates Time Slot correctly, both on a mobile viewport and on desktop. `showPicker()` calls
> removed entirely — nothing left that can throw or no-op.

---

## Bugs #33–#37 — 2026-09-14 staging QA report on the Messages tab + real booking/invoice flow

Found by Max driving the actual staging site end-to-end (real login, real booking submission, real
invoice send) — not a code read. Report: full transcript given inline in that session.

> 🟢 **#33 and #34 RESOLVED 2026-09-14.** Both looked, from the report alone, like they needed a
> guess at a fix — `createBooking.ts`'s whole body is already wrapped in a catch-all that returns
> `{success:false}`, so it structurally cannot itself surface a raw 500, and nothing in
> `MessagesPanel.tsx` obviously throws for one specific variant. Guessing was skipped in favor of
> pulling the real Vercel runtime-error clusters for the project (`get_runtime_errors`, 7-day
> window) and matching the two reported digests directly — both resolved to real, unrelated causes
> in under a minute of log reading:
>
> **#33 (digest `2710274906`, "the booking submission itself crashed"):**
> `ReferenceError: NotifyNewCompanyData is not defined` at module evaluation of the `(site)/page`
> server-actions bundle — meaning **every** server action reachable from the home/booking page
> failed to even load, which is why both the plain booking submit and the "New Company?" popup
> submit (different UI paths, same page, same actions bundle) crashed identically. Root cause:
> `app/actions/notifyNewCompany.ts` (a `'use server'` file) had `export type { NotifyNewCompanyData }`
> — re-exporting anything besides an async function from a Server Actions module is invalid in this
> Next.js version, and the compiler left a dangling runtime reference to an identifier that should
> have been erased as type-only. Nothing actually imported that re-export (`BookingForm.tsx` just
> calls `notifyNewCompany()` with an inline object and lets TypeScript infer the type), so the fix
> is a pure deletion — no behavior to preserve. Verified: `next build` no longer contains the string
> `NotifyNewCompanyData` anywhere in the compiled server chunks (previously present, confirmed by
> reproducing the same grep before removing the line).
>
> **#34 (digest `3471338459`, admin Messages-panel crash on `/admin/wines`, `/admin/content`,
> `/admin/onboarding`):** nothing to do with the Messages tab's variant-switching logic at all —
> `Error: Could not load the "sharp" module using the linux-x64 runtime: ERR_DLOPEN_FAILED:
> libvips-cpp.so.8.18.3: cannot open shared object file`. `app/actions/uploadImage.ts` imports
> `sharp` at module scope; its native `.node`/`.so` binaries (in separate `@img/sharp-<platform>`
> packages, not inside `sharp` itself) weren't being picked up by Next's build-time file tracing for
> routes that only reach `uploadImage.ts` transitively through the server-actions layer. Fixed with
> the documented remedy (`node_modules/next/dist/docs/.../output.md`, "Common include patterns for
> native/runtime assets"): `outputFileTracingIncludes: { '/*': ['node_modules/sharp/**/*',
> 'node_modules/@img/**/*'] }` in `next.config.ts`. Verified by inspecting the actual `.nft.json`
> trace files after a local `next build` — before this config, `admin/(panel)/content` and
> `admin/(panel)/wines`'s traces did not reliably carry the platform binary directory; after, both
> do (checked against the locally-installed `@img/sharp-win32-x64` — the same glob picks up whatever
> `@img/sharp-linux-x64`/`@img/sharp-libvips-linux-x64` npm installs on Vercel's build).
>
> The report's own repro steps for #34 ("edit a message, then click New company request") were a
> red herring — any of the three affected routes could trigger it depending on whether that
> particular request happened to load the actions chunk fresh; it wasn't actually about the
> variant. Worth remembering next time a repro looks oddly specific to one UI action: check whether
> the *page*, not the *action*, is the common factor.
>
> **#35 (edits not persisting) could not be reproduced after the #33/#34 fixes** — edited the
> Booking Confirmation textarea with a distinctive marker, blurred it, did a full hard reload, and
> the edit was still there. Most likely explanation: bug #34's crash was corrupting the admin
> panel's render/save cycle during the original testing session (every third-or-so page load
> throwing a 500 would be very consistent with "edits I definitely blurred cleanly still reverted"),
> not an independent bug. Marked resolved but flagged **unconfirmed** since the original broken
> state was never directly reproduced to compare against — worth Max double-checking on staging
> after the other fixes land, just in case there's a second cause hiding behind the first.
>
> **Not yet pushed to `staging`** — fixed and verified locally (`tsc --noEmit` clean, `next build`
> clean, both root causes confirmed absent from the build output); pending Max's go-ahead per the
> Rule 0 workflow, then a live staging re-check of both flows before merging to `master`.

> 🟢 **#36 and #37 RESOLVED 2026-09-14.** See `SessionLog.md` 2026-09-14 (2) for the full detail —
> `bookingConfirmationTemplate.ts` gained a `locale` param and label table (it had none at all,
> unlike `invoiceEmailTemplate.ts`'s existing one), and both templates' date formatting moved off
> `toLocaleDateString('ka-GE', ...)` (unreliable field order on this deployment's ICU data) onto a
> new `lib/emails/templates/dateFormat.ts` that builds the string explicitly and can't drift by
> runtime. Verified live on the local dev server against both locales; no regression to the English
> side of either template.

---


> 🟢 **#15 RESOLVED 2026-09-12.**
>
> `HelpHint` renders a `<button>`, and `CompaniesClient`'s row summary wrapped it in another
> one. A button inside a button is invalid HTML: the parser relocates the inner one, so the
> server's tree and the client's disagree.
>
> **Why it went unnoticed for so long:** the nested hint only renders when a company is
> *missing details*. On a healthy tenant — the demo included — there is nothing to flag, no
> hint, and no error. It fires precisely for the tenants whose data is incomplete, which is to
> say for new clients during onboarding.
>
> The fix closes the summary `<button>` before the hint and lets the badge, the hint and the
> tiers/orders count sit beside it inside a `flex-1` wrapper. **Visual order is unchanged**; the
> only behaviour lost is that the "3 tiers · 14 orders" text no longer expands the row when
> clicked. The Individuals row directly above already used exactly this shape — the fix makes
> the two consistent rather than inventing anything.
>
> **Measured before and after**, on `/admin/companies` with a company deliberately left without
> an identification code so the hint rendered:
>
> | | `button button` in the DOM | console |
> |---|---|---|
> | before | **1** | `<button> cannot contain a nested <button>` — and `Hydration failed… this tree will be regenerated on the client` |
> | after | **0** | clean |
>
> The before-state was taken by stashing the fix and re-running the same check, not by reasoning
> about the diff.


## Bugs #24–#29 — demo flow failures found by teardown, 2026-09-11

All six were found by driving the live demo end to end in a real browser (Playwright, production
site, desktop 1440×900 and mobile 360×732, one real booking submitted and traced to its row).

**Full detail, measurements, and the fix plan live in [[DemoSite/Plan-DemoFlowFixes]]** — not
duplicated here, so there is one source of truth. Report with screenshots:
https://claude.ai/code/artifact/72a9a58c-7a3b-4ce6-8ad3-4abc08c32026

**The shared root cause behind #24, #25 and #27** is worth stating on its own, because it is one
bug wearing three coats: **three separate components locate their target element and then fail to
show it to the viewer**, and in every case the failure mode is silent. The tour degrades to "no
ring" when an anchor misses; the rail's callout floats unpinned; the mirror styles a row 4,769px
off-screen without scrolling to it. Nothing logs, nothing throws, so all three shipped and passed
a casual look. **The first fix in that plan is to make anchor failure loud in dev** — otherwise
the next one ships the same way.

**Relationship to the hydration bug below:** #24's missing outline is the same shape as a problem
[[Plan-DemoRedesign]] Phase 4.3 already fought once and "fixed" by re-asserting marks every tick
for 20 seconds. If React is discarding server HTML and re-rendering, anything written to the DOM
before hydration settles is thrown away. That is why the hydration bug is sequenced second in the
fix plan rather than last — it may be on the critical path for the flagship.

> 🟢 **#24 RESOLVED 2026-09-11** (Chunk 1 of [[DemoSite/Plan-DemoFlowFixes]], shipped to `master`
> as `9959711`, verified on production with a real booking at 1440×900). **And the hypothesis in
> the paragraph directly above was wrong** — it was not hydration.
>
> `/admin/orders` renders its orders twice, a table (`hidden md:block`) and a card list
> (`md:hidden`), and Tailwind picks between them on the **pane's** width. The mirror's admin pane
> is a **691px** iframe on a 1440×900 desktop — below the 768px `md` breakpoint — so the table is
> `display:none` and the cards are what the visitor sees. All 394 `tbody tr` rows measured 0×0.
> The Phase 4.3 code found its row, outlined it and scrolled to it exactly as written, on an
> element in a hidden subtree, where an outline is unobservable and `scrollIntoView` is a no-op.
> There was never anything for hydration to discard. Confirmed twice over: the fixed highlight now
> holds for its full 20s window on production **while React #418 is still firing on that page**.
>
> Fixed by resolving whichever list is actually rendered, pinning the matched card to the head of
> its container (it now lands at index 0 instead of 4,769px down a 74,000px list), and identifying
> the new order from a snapshot of the pane taken before the reload rather than from the guest's
> name — which also closes a latent bug, since the demo seed data reuses guest names and the old
> `.find()` returned the first booking under that name.
>
> **#29 is NOT fixed and was not touched** — the flagship screen still shows two floating red bug
> buttons. It is Chunk 6, and it needs the `staging` pass because `BugReportWidget` is shared.
> **The shared root cause above still stands for #25 and #27**, and gains a fourth failure mode
> worth adding to the list: *found the target, showed it, but showed the copy nobody is looking
> at.* Any code reaching into the admin pane must resolve which representation is **rendered**.

> 🟢 **#26 RESOLVED 2026-09-11** (Chunk 3 of [[DemoSite/Plan-DemoFlowFixes]], shipped to `master`
> as `e44e519`, verified on production). This is the "Tour paused · step 1 of 7" dead end: press
> the start pill on `/admin/orders` and the tour answers that it is paused.
>
> **It was a good rule misfiring, not a broken tour.** Step 1 declares the guest-site route, and
> the tour deliberately refuses to dim a screen the visitor navigated to themselves — a constraint
> from [[Plan-DemoRedesign]] Phase 2 that is right and **stays**. It was simply also applying to an
> explicit press of the start button. Now any deliberate tour control (start, replay, back, next)
> goes to the step's screen; only wandering off mid-tour pauses. `back()` had the same misfire from
> the other direction — stepping back from `/admin/orders` to the `/wines` step left the visitor on
> the admin page staring at the pause pill — and was fixed with it.
>
> Shipped alongside it: the tour auto-starts once per browser on the "I run a winery" path only,
> and step 7 now hands off (live mirror + a mailto) instead of ending on a bare "Done".
>
> **#25 is NOT fixed and was deliberately not touched** — 6 of the 7 steps still draw no spotlight
> ring, because the `data-tour` anchors fail to resolve. That is Chunk 4, it is **shared** (it means
> adding anchors to admin pages every tenant renders), and it needs the `staging` pass. The shared
> root cause above therefore still stands for **#25 and #27**.

---

---

> **Update, 2026-09-11 — Chunk 4 fixes #25 and #27, and the "shared root cause" above turns out
> to have been diagnosed wrongly.** On `staging` as `9d3a2b2`; **not yet on `master`**, so both
> stay 🔴 Open until that merge lands and production is walked.
>
> **The anchors were never missing.** All seven `data-tour` attributes existed and always had —
> the premise that this was "anchors that fail to resolve" was wrong. Measured on production at
> 1440×900 before any code changed: on step 3 the anchor sat in the DOM with a rect of
> `{top: 322, left: 24, 1377×700}` while the tooltip rendered 1401 px wide, which is the `!rect`
> branch. The component believed it had no target while the target was right there. One
> synthetic `resize` event re-ran the measurement and **the ring appeared immediately**.
>
> **The actual cause is one line.** `DemoTour` measured its target once, on a 60 ms `setTimeout`
> after the route changed — a race against the destination painting. Every step reached by a
> navigation lost it; step 4 was the only one that worked because it is the only step that
> shares a route with its predecessor and therefore involves no navigation at all. That single
> fact explains the exact 6-of-7 pattern, and it also explains why step 7 resolved in local dev
> and not on production: the RSC fetch returns in well under 60 ms from localhost and does not
> over the network. Same code, same viewport, different latency.
>
> **The fix** is a shared `useAnchorRect()` hook (`saas/lib/demoAnchor.ts`) used by both the tour
> and the rail, so the two cannot drift apart again. It polls **and** runs a `MutationObserver`
> with no deadline, because any fixed budget is a guess about how long a route takes to paint and
> a wrong guess about exactly that is this bug. A cold Turbopack compile during local testing ran
> past the poll budget and the anchor still resolved — the observer earned its place the same day.
>
> **#27's second half** (deep links landing on collapsed data) is fixed separately: the rail's
> "Per-company price ladders" entry now deep-links to `/admin/companies?expand=first` with a new
> `company-rates` anchor, so it arrives on an open rate ladder. The other fifteen destinations
> were checked and none needed the same treatment.
>
> **And the class of bug is now visible.** `useAnchorRect` logs a dev-only console warning when
> an anchor genuinely cannot be resolved — the silent degradation is *why this shipped*, and it
> caught a real problem on the first local run.



> 🟢 **#28 RESOLVED 2026-09-11** (Chunk 8 of [[DemoSite/Plan-DemoFlowFixes]], shipped to
> `master` as `0919a6a`, verified on production).
>
> Two separate faults wearing one bug number, and only one of them was fully fixable.
>
> **The chrome is back.** `/admin/onboarding` renders outside the `(panel)` layout, which is
> where every demo component is mounted — so one of the four front-door paths dropped the visitor
> out of the guided demo with only a small "← Back to admin" link. It now has its own route
> layout (`saas/app/admin/onboarding/layout.tsx`) mounting the banner, the tour and the rail.
> **Not** `app/admin/layout.tsx`, which wraps `(panel)` too and would have double-mounted every
> demo component on every other admin page. Verified on production: demo banner, "Customer View",
> tour pill and feature rail all present, and no bug button.
>
> **The "4/7 already complete" half is only partly fixable, and that is worth knowing.** The
> nightly reseed now clears the four Setting rows that hold the wizard's *answers*, so the wizard
> opens on the Companies question again rather than on a review screen someone else filled in.
> But wizard completeness is **computed live from real data**, never stored as a flag — so Wines,
> Payment info, Contact and Photos stay ticked because the demo genuinely has wines, an IBAN,
> contact details and a hero photo. Unticking them means deleting the content the rest of the
> demo exists to show. **If the fourth card's promise must be literally true, the answer is a
> disposable tenant per visitor**, which [[DemoSite/Plan-DemoRedesign]] still carries as open.
>
> Checked rather than assumed, per the task's own warning: clearing those settings does **not**
> bring the setup banners back on the demo. They are gated off for the demo tenant in
> `app/admin/(panel)/layout.tsx`, and independently `getFinishDetailsStatus` reports nothing
> outstanding while `readyToLaunch` is false.

> 🟢 **#29 RESOLVED 2026-09-11** (Chunk 6 of [[DemoSite/Plan-DemoFlowFixes]], shipped to
> `master` as `8e5203c`, verified on production).
>
> One line, inside `BugReportWidget` itself: `if (tenantId === DEMO_TENANT_ID) return null`.
>
> Guarded at the component rather than at its three mount sites, for the same chokepoint reason
> the demo's outbound-email suppression already uses — a future mount cannot forget to opt out.
> The super-admin mount passes no `tenantId`, so Max's own reporting is untouched. And because
> both `/live` panes *are* the demo tenant, the duplicate FAB died as a side effect: no
> `isEmbeddedPane()` change was needed at all.
>
> **Measured on production:** 0 bug buttons on `/`, 0 on `/admin/orders`, 0 on
> `/admin/onboarding`, and on `/live` 0 at the top level plus 0 in *each* of the two panes —
> where there used to be two. Staging Winery still shows exactly one, checked on the staging
> preview before the merge.
>
> **The trade-off Max accepted** (*"it's really a nice to have"*): bug reports from the demo were
> deliberately exempted from the demo's email suppression and did reach the super-admin inbox, so
> this gives up a working channel for hearing about demo breakage. The middle option, if he
> changes his mind, is to hide it on the demo's **public** side only and keep it in the demo
> admin.


## ✅ RESOLVED — Hydration mismatch on public site pages (observed 2026-09-11, fixed and shipped 2026-09-11)

> **Update, 2026-09-11 (teardown session):** confirmed live on **production**, on **every** route
> checked — `/`, `/wines`, `/admin/orders`, `/admin/statistics`, `/live` — not just local dev and
> not just public pages. **New and useful:** the minified error carries `args[]=text`, which
> narrows it from "some hydration mismatch" to **a text node** whose server-rendered content
> differs from the client's — not an attribute or structural mismatch. Prime suspects are
> therefore values formatted at render time from `new Date()` or a locale-dependent formatter,
> where the server (UTC, `fra1`) and the browser disagree; this app renders dates, times and ₾
> amounts on every screen. **Do not keep chasing this in production** — it has now cost time in
> three separate sessions. Reproduce locally in **dev mode**, where React prints the exact
> mismatching text side by side. Tracked as Chunk 2 of [[DemoSite/Plan-DemoFlowFixes]].

**Symptom:** `Hydration failed because the server rendered text ...` in the browser console
on public-site routes (`/`, `/wines`) in local dev.

**Not caused by the demo work**, though that is how it was noticed. Confirmed by loading
`/wines` on **Staging Winery**, where no demo component renders at all — the error still
appears. So it predates the demo redesign and affects real tenants too.

**Why it matters beyond a console warning:** React discards the server HTML and re-renders
on the client when this happens. Anything that manipulates or measures server-rendered DOM is
exposed to it.

> **Correction, 2026-09-11:** this section previously claimed the bug "cost real debugging time
> on the live mirror, where highlighting a row in the server-rendered table was silently undone
> the moment the pane hydrated." **That was never true.** Chunk 1 measured it: the mirror was
> marking a `display:none` copy of the orders list, so nothing was ever undone. The fixed
> highlight holds on production while this error is still firing. The hazard described above is
> genuine in principle; it just has no confirmed victim yet, and this bug's priority should be
> judged on its own merits rather than on the live mirror.

> **Update, 2026-09-11 (Chunk 2, diagnosis session) — the bug is real but NOT universal, and it
> does not currently fire.** Measured across local dev (`/`, `/wines`, `/admin/orders`,
> `/admin/statistics`, Staging Winery) and production (all five routes, two browsers): **no
> hydration error anywhere**, console capture verified working first. A direct SSR-vs-DOM text
> diff — fetch the server HTML, walk both trees, compare every text node — found **0 differences
> across 12,582 text nodes** on production `/admin/orders` and 0 across 85 on `/wines`.
>
> **Why three sessions missed it:** the server renders in **UTC / en-US**; every browser
> available here is **en-US / Asia/Tbilisi**. That pairing hides both mechanisms — `ka-GE` and
> `en-GB` group digits identically to `en-US`, and Tbilisi's **+4** offset never carries a
> midnight-UTC date back over midnight. The bug was being hunted from the one timezone and
> locale that cannot see it.
>
> **The two call sites, named at last** (both `toLocale*` at render time in a client component,
> neither pinned):
> - `saas/app/admin/(panel)/orders/OrdersTable.tsx:94` — `toLocaleDateString('en-GB', …)` with
>   **no `timeZone`**. Breaks for any viewer at a negative UTC offset (the Americas), and breaks
>   **from Georgia** for any timestamp in the **20:00–24:00 UTC** window. Demonstrated:
>   `2026-10-20T00:00:00Z` → "20 Oct 2026" (UTC) vs "19 Oct 2026" (New York);
>   `2026-09-10T21:30:00Z` → "10 Sept 2026" (UTC) vs "11 Sept 2026" (Tbilisi).
> - `saas/app/admin/(panel)/statistics/StatisticsV2.tsx:152, 216, 221, 242, 247` —
>   `Number(v).toLocaleString()` with **no locale argument at all**. Breaks for any viewer whose
>   browser groups digits differently (`de-DE`, `ru-RU`, …).
>
> **"Fires on every route" should be treated as unproven.** Console buffers persist across
> same-origin navigations — demonstrated this session, an injected `console.error` survived three
> full navigations — so one occurrence reads as five routes. Independently, `/`, `/wines` and
> `/live` contain **no** date or locale formatting at all (verified by grep), so the stated
> mechanism cannot apply on three of the five. The bug is **intermittent and data-dependent**
> (which rows land in the 20:00–24:00 UTC window changes with the nightly 03:00 UTC reseed), not
> universal.
>
> **Status: diagnosed, not yet fixed.** The fix is two one-line pins, but it touches shared files
> and needs one product decision from Max — which timezone is authoritative for a booking date.
> Tracked as Chunk 2 tasks 2.3–2.5 of [[DemoSite/Plan-DemoFlowFixes]].

### ✅ Resolved and live on production, 2026-09-11

**Root cause:** two `toLocale*` calls in `'use client'` components that did not pin the setting
they depend on, so the server render and the hydration render used different ones.

- `saas/app/admin/(panel)/orders/OrdersTable.tsx` — `toLocaleDateString('en-GB', …)` had no
  `timeZone`, so it used UTC on the server and the viewer's zone in the browser.
- `saas/app/admin/(panel)/statistics/StatisticsV2.tsx` — five `toLocaleString()` calls had no
  locale at all, so en-US on the server and the viewer's in the browser.

**Fix:** `timeZone: 'Asia/Tbilisi'` on the date formatter — the winery's own zone, so a booking
for 20 Oct reads "20 Oct" to everyone including an owner abroad — and an explicit `'en-US'` on
all five number formatters, which is what they already rendered, so nothing changed visually.
Both sites carry a comment explaining the pin so it does not get tidied away. Commit `30bbcc7`.

**Verified on `staging` against Staging Winery**, which is the check that crosses the boundary
the bug lives on: the server renders UTC (`fra1`), the browser ran Asia/Tbilisi. `/admin/orders`
— all 10 distinct dates present on both the server HTML and the hydrated DOM, none one-sided,
and byte-identical to what a Tbilisi-based dev server produced from the same database.
`/admin/statistics`, `/` and `/wines` consoles clean; no demo chrome on Staging Winery;
`tsc --noEmit` clean.

**Shipped to production** on Max's explicit go-ahead, merged `staging` → `master` as `e64ccbb`,
Vercel production build in `fra1`. **Verified on production**, a far stronger sample than staging
because the demo tenant carries 395 orders to Staging Winery's 17: `/admin/orders` compared
server HTML against the hydrated DOM and found **260 distinct dates, none appearing on only one
side**, with the server in UTC and the browser in Asia/Tbilisi. Consoles clean across `/`,
`/wines`, `/admin/orders`, `/admin/statistics` and `/live`. **Regression-checked on
`nikalasmarani.vercel.app`** — the real tenant's live site — clean and free of demo chrome.

**One gap, stated plainly:** Chunk 1's row outline was re-checked structurally (the mirror
assembles, both panes load) but not by submitting another booking, which would be a production
write. The change does not touch `LiveMirrorClient.tsx`.

**Worth keeping in mind:** the same unpinned pattern exists in other admin and super-admin files
(`CalendarView`, `OrderDetail`, `WineOrdersClient`, `StatisticsClient`, `WineStatistics`,
`PackingView`, the `super-admin/*` clients). None of them are on the five routes this bug was
reported against, so they were deliberately left alone rather than swept up in a fix that needed
a focused staging check — but they carry the same latent risk and are a sensible follow-up.

**Not investigated:** the specific mismatching text was not identified — likely a
date/locale or price format rendered differently on server and client. Worth a dedicated
look; start by expanding the full error in the browser console on `/wines`.

---

## Bug #30 — The 03:00 UTC scheduled reseed did not run; manual trigger works fine (2026-09-12)

**Status: 🔴 Open, narrowed.** This is the check [[SessionLog]]'s 2026-09-12 entry asked for, and
it failed — but the manual trigger (Max, via super-admin's "Reset demo now") succeeded cleanly
right after, which rules out the handler itself and points at the **schedule**, not the code.

### What the previous session established

It argued — correctly — that the earlier "the reseed is broken" claim did not hold up, because
the test booking was created on 2026-09-11 during Tbilisi daytime and **no reseed window had
occurred since**. It set an explicit criterion: *"The next run is 03:00 UTC and should clear both
extra rows. If they survive **that**, it is a real bug."*

### The criterion is now met

Measured 2026-09-12 at ~06:55 UTC — i.e. after the 02:00–04:00 UTC window (Hobby crons fire
within ±1 hour, [[MaintenanceNotes]] §14):

| Check | Result |
|---|---|
| Bookings on production demo | **395** — unchanged from before the window |
| "Luka Testashvili" present | **yes** |
| Is that name generator output? | **No.** `lib/demoSeed.ts` `GUEST_LAST` has no `Testashvili`; `GUEST_FIRST` has `Lukas`, not `Luka`. It is hand-made. |
| Was the deployment stable overnight? | **Yes.** Production deploy 2026-09-11 21:46 UTC held until 05:45 UTC today; the window fell entirely inside it. |
| Is `CRON_SECRET` configured? | **Yes.** Unauthenticated GET returns **401**, not the 503 the route emits when the variable is missing. |

`seedDemoTenant` does `db.order.deleteMany({ where: { tenantId } })` — there is no filter that
could spare one row. So either the cron never fired, or the handler fired and failed.

### The manual trigger, and what it settles

Max pressed "Reset demo now" in `/super-admin/tenants` (production, logged in as
`max.mghvdliashvili@gmail.com` — a real production super-admin account, contradicting an earlier
guess in this same session that no such login existed; worth adding to `credentials.txt` once he
shares it). The panel reported success immediately: *"Rebuilt Vineworks Estate: 393 bookings and
45 wine orders (393 bookings total, 238,258₾) in 2.2s."* Re-measured on the live demo right after:
**393 bookings, "Testashvili" gone.**

Both the button and the cron call the identical `seedDemoTenant()` — the button through a server
action, the cron through the route with a bearer token. So **the handler works.** This rules out
the "handler fired and threw" branch entirely. What's left is narrower: the 03:00 UTC schedule
itself either didn't fire, or fired against something that made it a no-op (wrong secret in that
one invocation, a cold-start timeout, a Vercel Hobby cron quirk).

### What was NOT ruled out, and how to rule it out

- **Whether the cron fired at all last night.** Vercel Hobby retains runtime logs for **1 hour**,
  so by the time anyone looks in the morning the evidence is already gone. This is the single
  biggest obstacle to diagnosing this bug and it will recur on every attempt — the manual trigger
  working does not tell us why the automatic one didn't.
- **Whether tonight's 03:00 UTC run fires.** This is now the cleanest test available: the handler
  is proven good, so if bookings are back above 393 (or a fresh stray row appears) tomorrow
  morning, the schedule is working and last night was a one-off. If the count is still 393 with
  no new activity, the schedule itself is broken.

### The fix that matters more than diagnosing last night

Whether or not last night's miss repeats, the log-retention blind spot is the real problem — it
turned a two-minute question ("did the cron run?") into a session-length investigation with an
inconclusive middle. Have the handler write its own last-run result somewhere durable (a
`Setting` row on the demo tenant: timestamp, counts, success/failure) so the next check is one
query instead of a race against a 1-hour log window.


## Bug #19 — No protection against concurrent-traffic bursts; production hits a hard DB connection ceiling around 100–150 simultaneous visitors, causing a whole-site outage that outlasts the burst

> **Partially addressed 2026-09-10 (demo only).** `lib/demoRateLimit.ts` caps public writes
> (bookings, wine orders) at 5 per IP per 10 minutes **on the demo tenant only**, so
> `demo.vineworks.ge` can be shared publicly. Real tenants are deliberately untouched: a
> winery's booking form is their livelihood, and throttling a shared office IP or a coach
> party booking together would cost them money. The demo limiter is also per-instance and
> in-memory, which is fine for a sandbox but not for a real tenant. **This bug stays open**
> for the app at large — a proper fix needs a durable, cross-instance store.

**Severity:** Medium-High — not an active incident with ~1 real tenant today, but a real, unguarded ceiling with no warning system between "fine" and "site down for everyone." Confirmed directly against **live production**, not just estimated from localhost.
**Found:** 2026-08-12, dedicated stress test (Max's request, `FeatureLog.md` #129), first pass on localhost then repeated directly against `nikalasmarani.vercel.app` with Max's explicit go-ahead (confirmed all 61 existing production orders are fake/seed data, and production's payment module has no Flitt credentials configured) · **Status:** 🔴 Open (measured and documented, not fixed)

**Symptom, measured on live production:** read-path (page loads) stayed error-free up to 50 concurrent visitors (0.4–1.0s typical), then 7% failed at 100 concurrent and **70% failed at 150 concurrent** — worse, 67 of those failures were inside the tenant-routing middleware itself, meaning *every* route fails during the spike, not just database-heavy ones. **The site kept returning 500s for a few minutes after the test traffic had already stopped**, confirmed by a direct `pg_stat_activity` query showing the database itself back to a normal connection count (29 of 200) while the app was still erroring — some of Vercel's running app instances had their database client left in a broken state by the spike and didn't self-heal as fast as the database did. It recovered on its own within several minutes. Write-path (booking submissions) tested more conservatively up to 30 concurrent given the above — mostly stable, a few 50+ second outliers, no sustained outage at that level (not pushed further on live production).

**Root cause:** the database (Supabase) enforces a hard cap of **200 total client connections, project-wide**. `DATABASE_URL` caps each running instance of the app to `connection_limit=20` through PgBouncer. On Vercel, a traffic burst causes multiple serverless instances to spin up in parallel, each opening its own 20-connection pool — enough concurrent instances pushes the *combined* total past the database's absolute 200-connection ceiling, which then flatly refuses new connections (`FATAL: (EMAXCONN) max client connections reached, limit: 200`) rather than the softer per-instance "wait then time out" behavior (`P2028`) that a single localhost process shows. Every `withTenantDb()` call (`lib/db.ts`) opens its own transaction; a single Home page load fans out to ~8 *parallel* calls, a single booking submission chains up to 5 *sequential* calls — both draw from this same shared, cross-instance ceiling.

**Compounding factor:** confirmed by code search — there is **no rate limiting, throttling, or abuse protection anywhere in the app** (booking form, wine orders, admin login all unprotected). Nothing softens a burst before it reaches the ceiling above.

**Localhost comparison:** an earlier localhost-only pass (production-mode build, **dev** database, run from a machine geographically far from the database) showed errors starting much lower — around 50 concurrent — because of the added network latency holding each connection open longer. Production's real ceiling is meaningfully higher in absolute terms (confirmed above), but fails in a more totalizing way once reached, and the post-burst "hangover" outage was not visible at all in the localhost pass (a single local process doesn't have the multi-instance dynamic that caused it).

**Not fixed here** — this was a measurement/report pass only. See [[StressTest-2026-08-12]] for the recommended next steps (basic per-IP rate limiting, graceful failure messaging, investigating why the app's DB client doesn't self-heal as fast as the database does, and only if real traffic approaches these numbers, revisiting the pooling/scaling configuration).

---

## Bug #18 — Georgian nav labels wrapping onto 2 lines

> 🟢 **RESOLVED same day found, 2026-08-12.** Max flagged it from a screenshot of the staging Georgian homepage; diagnosed live via the dev server before touching source.

**Root cause:** same shape as bugs #8/#9 (Georgian text runs longer than English, hitting a width constraint) but manifesting as wrapping instead of overflow this time. `SiteNav.tsx`'s header content sat in a `max-w-4xl` (896px) container — enough room for English's nav labels, not quite enough for Georgian's once the full row (logo + links + book button + divider + language switcher + divider + social icons) is accounted for. When the row doesn't fit, the browser's default flex-shrink lets any label containing a space wrap onto 2 lines to save width; single-word labels (Home, Contact) have no space to wrap at, so they stayed put — producing the lopsided look in the screenshot.

**Fix:** widened the header's container `max-w-4xl` → `max-w-5xl` (896px → 1024px) and added `whitespace-nowrap` to the nav links and Book button, so a future translation running long can't silently wrap again — it would need the container to genuinely run out of room, which the width bump prevents down to the `md:` breakpoint (768px) where the layout falls back to the mobile hamburger menu anyway. Confirmed safe to widen: the homepage's own content sections use `max-w-xl`/`max-w-2xl` (576–672px), narrower than the nav already — the nav bar is already the widest element on the page independent of body content width, so this doesn't introduce any new inconsistency.

**Verified live** (dev server, DOM measurements before writing to source): no wrapping and no horizontal overflow in either locale at 768px, 900px, or 1280px viewport width — the full range the desktop nav is shown at. `tsc --noEmit` clean.

---

## Bug #10 — Onboarding Contact step targeted the wrong store

> 🟢 **RESOLVED same day found, 2026-08-07.** Found during a first-principles audit of what the onboarding wizard actually covers vs. what a tenant needs.

**Root cause:** Two separate database tables both use the field names `contact_phone`/`contact_email`/`contact_address`. `SettingsClient.tsx`'s Contact Info section (pre-existing, long-standing) writes to the `Setting` table — this is what feeds the sitewide footer/nav and the invoice email's return address. The onboarding wizard's Contact step (`saveOnboardingContactInfo()` in `app/actions/onboarding.ts`) instead wrote to the `SiteContent` table, which only ever fed the public `/contact` page's info cards. A tenant could complete the wizard's Contact step and see it marked "done" while the footer, nav, and every invoice's return address stayed blank.

**Why it went unnoticed:** real tenants (Nikalas Marani, and Staging Winery as its clone) already had the `Setting`-store fields populated through ordinary Settings-page use, predating the wizard — so the mismatch was invisible on the only two tenants that exist. It would only bite a genuinely new tenant who fills in the wizard before ever touching Settings.

**Fix:** repointed `saveOnboardingContactInfo()`'s write path and `getOnboardingStatus()`'s `contactInfoStepDone`/initial-value read path to `getSetting()`/`updateSetting()`. No backfill needed — confirmed no live tenant is in the broken state. Verified live: the wizard's Contact & Site Info step now correctly pre-fills Staging Winery's real phone/email/address (previously would have shown blank).

---

## Bug #9 — Orders page header overflow at mobile width in Georgian

> 🟢 **RESOLVED same day found, 2026-08-07.** Found incidentally while verifying the new [[Plan-OnboardingFlow|Phase 3 finish-details banner]] on mobile — unrelated to that banner itself (confirmed via element-by-element inspection, and `/admin/wines` at the same width had no overflow).

**Root cause:** `app/admin/(panel)/orders/page.tsx`'s header row (`flex items-center justify-between`, no `flex-wrap`) held the page title, the Table/Calendar toggle, and the "+ New Order" button. Georgian's longer, un-hyphenated strings for all three pushed the row to 424px against a 375px viewport — same underlying cause as bug #8, different file.

**Fix:** added `flex-wrap gap-y-2` to the outer row and `flex-wrap` to the inner button group, so the row wraps onto multiple lines instead of overflowing. Verified: `scrollWidth === clientWidth` (375 vs 375) at 375px in Georgian, screenshot-confirmed clean wrap (title → toggle → button, each on its own line).

---

## Bug #4 — Supabase connection pool exhaustion (session mode)

> 🟢 **RESOLVED.** Everything below is the original write-up, kept as history — it is written in the present tense as an open bug, so read it as "what was true then", not as current state. **Current state:** `DATABASE_URL` uses the transaction pooler (port 6543, `pgbouncer=true`) on both environments; local dev additionally sets `connection_limit=20&pool_timeout=30`. Related: Bug #6 (2026-07-29) explains why this hurt more than expected — each transaction was holding its connection for 3–4 *transatlantic* round trips. The 2026-07-29 batching refactor also cut the Home page from ~24 transactions to ~8, specifically for headroom here.

**Severity:** High — can bring down the live site under load

**Root cause:**  
`DATABASE_URL` uses port **5432** (PgBouncer session mode). In session mode, each `PrismaClient` instance holds a real Postgres connection open for its entire lifetime — it is never returned to the pool until `$disconnect()` is called, which almost never happens in a Node app.

Supabase caps session mode at **15 concurrent connections** on the current plan.

**Why it surfaced in dev:**  
Next.js hot reloading creates new module instances repeatedly without closing old ones. Each new instance creates a new `PrismaClient` → new connection → connection never released → pool fills up in ~15 hot reloads.

**Why it's a production risk:**  
Vercel deploys as serverless functions. Each cold start creates a new process → new `PrismaClient` → new connection held open. 15 simultaneous cold starts (e.g. right after a deploy) would exhaust the pool and return `EMAXCONNSESSION` to real users. With the multi-tenant model (all clients on one URL), traffic multiplies across tenants making this more likely.

**Additional contributor:**  
`proxy.ts` creates its own `new PrismaClient()` at module level (separate from the singleton in `lib/db.ts`). In dev this means 2 connections burned per hot reload instead of 1.

**Fix:**  
Switch `DATABASE_URL` to port **6543** (PgBouncer transaction mode). In transaction mode, connections are returned to the pool immediately after each query/transaction — the pool can serve hundreds of concurrent requests from 15 physical connections.

Add `?pgbouncer=true` to the URL so Prisma disables prepared statements (which don't work in transaction mode).

`DIRECT_URL` stays on port 5432 — it's only used by `prisma db push` / migrations which run once and don't need pooling.

```
DATABASE_URL="postgresql://...@aws-1-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://...@aws-1-eu-central-1.pooler.supabase.com:5432/postgres"
```

**Resolution steps:**
1. In Supabase dashboard → Project Settings → Database, copy the **Transaction pooler** connection string (port 6543)
2. Update `saas/.env` and the matching Vercel environment variables:
   ```
   DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-1-eu-central-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
   DIRECT_URL="postgresql://postgres.[ref]:[password]@aws-1-eu-central-1.pooler.supabase.com:5432/postgres"
   ```
3. Confirm `saas/prisma/schema.prisma` datasource block has `directUrl = env("DIRECT_URL")` — if missing, add it
4. Run `npx prisma db push` (from `saas/`) to confirm it still works via the direct URL
5. Start the dev server and verify normal queries work (admin orders page is a good smoke test)
6. In `saas/proxy.ts`, replace `new PrismaClient()` at module level with the shared singleton imported from `@/lib/db` — this eliminates the second connection that bypasses the singleton guard

**Note on Bug #5 compatibility:** `SET LOCAL ROLE` and `set_config(..., true)` are transaction-scoped — they revert at `COMMIT`, the same moment PgBouncer reclaims the connection. Fixing this bug does not conflict with implementing Bug #5.

---

## Bug #5 — RLS policies deployed but never enforced (withTenantDb is a stub)

> 🟢 **RESOLVED — and the description below is now factually wrong about current code.** It states `withTenantDb` "is a stub" that "never opens a transaction". That has not been true since Sprint 3A was completed: `saas/lib/db.ts` today opens a real `$transaction`, calls `set_config('app.tenant_id', …)` and `SET LOCAL ROLE app_user`, with `{ timeout: 15000, maxWait: 10000 }` (verified by reading the file 2026-07-29). RLS is genuinely enforced. Everything below is kept as the historical write-up of the bug — do not read it as current state. Architecture reference: [[RLS-Architecture]].

**Severity:** Medium — tenant isolation is still enforced by query scoping, but the DB-level safety net is silently absent

**Background:**  
Sprint 3A (2026-06-22) deployed RLS infrastructure to Supabase via `setup-rls.ts`:
- Created `app_user` Postgres role (NOLOGIN)
- Granted SELECT/INSERT/UPDATE/DELETE on all 12 tenanted tables to `app_user`
- Created `tenant_isolation` RLS policies on all 12 tables that check `current_setting('app.tenant_id')`

The plan was for `withTenantDb` to open a `$transaction`, call `SET LOCAL ROLE app_user` + `set_config('app.tenant_id', tenantId, true)`, then run the query — forcing Postgres to enforce RLS.

**What actually happened:**  
`withTenantDb` in `saas/lib/db.ts` is a stub. It never opens a transaction and never calls `SET LOCAL ROLE`. The app connects as `postgres` (Supabase superuser), which **bypasses RLS by design** in Postgres — superusers are exempt from all row-level security policies.

```ts
// saas/lib/db.ts — current state
export async function withTenantDb<T>(tenantId, fn) {
  // comment says "future enhancement" — the $transaction + SET LOCAL ROLE was never written
  return fn(db)   // ← just passes the PrismaClient directly
}
```

**Current protection:**  
Tenant isolation relies entirely on `where: { tenantId }` in every query (one layer). The RLS second layer is set up in Supabase but dormant.

**Risk:**  
If a query somewhere accidentally omits the `tenantId` filter, it would return cross-tenant data with no DB-level catch. With one client this is undetectable; with multiple clients this is a data leak.

**Fix:**  
Implement `withTenantDb` properly in `saas/lib/db.ts`. `SET LOCAL ROLE` and `set_config(..., true)` are transaction-scoped and revert at `COMMIT` — fully compatible with PgBouncer transaction mode (Bug #4). No special handling needed.

**Resolution steps:**
1. Apply Bug #4 fix first (switch to PgBouncer transaction mode) — `withTenantDb` uses `$transaction`, which requires a pooled connection that supports transactions; transaction mode on port 6543 satisfies this
2. Replace the stub body in `saas/lib/db.ts` with the full implementation:
   ```typescript
   export async function withTenantDb<T>(
     tenantId: string,
     fn: (tx: TxClient) => Promise<T>
   ): Promise<T> {
     return db.$transaction(async (tx) => {
       await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`
       await tx.$executeRaw`SET LOCAL ROLE app_user`
       return fn(tx)
     }, { timeout: 15000 })
   }
   ```
3. Run `npx tsx scripts/check-rls.ts` from `saas/` — confirms RLS is ON and `tenant_isolation` policies exist on all 12 tables (already deployed in Sprint 3A; this step just verifies nothing changed)
4. Smoke-test: load `/admin/orders`, create a booking on the public form, check `/admin/statistics` — confirm normal operation under the new transaction wrapper
5. If a second tenant is available, verify cross-tenant isolation: query an order ID belonging to tenant A while authenticated as tenant B — should return 0 rows

**Note:** Query-level `where: { tenantId }` scoping stays in place. RLS is the second enforcement layer, not a replacement.

---

## Bug #6 — Vercel functions ran in the wrong region (every page ~3s)

**Severity:** High — affected every page view for every visitor, on every tenant, since launch
**Found + fixed:** 2026-07-29 · **Status:** 🟢 Resolved

**Symptom:** every public page took ~2.9–3.4s before the first byte arrived, regardless of page, tenant, or cache state. Long assumed to be "normal for this app" — `Plan-DevProdEnvironments.md` even documented "~6s page renders are NORMAL", and a 2026-07-23 note filed it as a future optimization item.

**Root cause:** no function region was pinned (no `vercel.json`, nothing in `next.config.ts`), so Vercel's default applied and functions executed in **`iad1` (Washington DC)**. Both Supabase projects live in **`eu-central-1` (Frankfurt)**. Every database round trip crossed the Atlantic (~90ms), and `withTenantDb` needs 3–4 *sequential* round trips per transaction (`set_config`, `SET LOCAL ROLE`, the query, `COMMIT`).

**Evidence that isolated it:** a real 36-row `findMany` cost **666ms** while an *empty* transaction cost **680ms** — i.e. ~100% network latency, ~0% database work. That ruled out query design and pointed at distance. `X-Vercel-Id` confirmed it: `fra1::iad1::…` — edge in Frankfurt, compute in Washington.

**Fix:** `saas/vercel.json` with `{"regions": ["fra1"]}`. **Home TTFB ~2.93s → ~0.40s (7×); full load 5.8s → 0.49s (10×).**

**How to detect a regression:**
```bash
curl -s -D - -o /dev/null https://nikalasmarani.vercel.app/ | grep -i x-vercel-id
```
Expect `fra1::fra1::…`. A second segment of `iad1` means the region pin was lost — see MaintenanceNotes §8 for why the file's location makes that easy to do by accident.

**Related:** this also explains why Bug #4's pool pressure hurt more than expected — each transaction held its connection for 3–4 transatlantic round trips instead of microseconds.

**Wrong turn worth remembering:** the first diagnosis was that ~24 per-request DB transactions caused the delay. A batching refactor was built and **measurably changed nothing** (1,581ms → ~1,620ms), because those queries already ran in parallel. Measuring, rather than reasoning from plausibility, is what found the real cause. Full record: [[Plan-Performance]], [[Perf-Baseline-2026-07-29]].

---

## Bug #7 — Click-reveal popover clipped by an `overflow-hidden` ancestor

**Severity:** Low — cosmetic (content invisible except a 1px sliver), no data risk
**Found + fixed:** 2026-08-04 (same session as #139 Guide Mode) · **Status:** 🟢 Resolved

**Symptom:** the first version of `components/HelpHint.tsx`'s popover rendered as a plain nested `position: absolute` `<div>`. Placed inside the onboarding wizard's Individuals-pricing row (`rounded-xl border overflow-hidden` container), the popover was silently clipped by that ancestor's `overflow-hidden` — visible only as a 1px sliver at the row's bottom edge.

**This is the second occurrence of this exact bug shape** — the first was Bug-shaped issue #140 (`OrdersTable.tsx`'s status dropdown, clipped by the Orders table's `overflow-auto max-h-[70vh]` scroll wrapper). Any *new* absolutely-positioned popover/dropdown nested inside a card, scroll container, or anything with `overflow-hidden`/`overflow-auto` is at risk of this — it is not specific to onboarding or to tables.

**Fix (same as #140):** render the popover via a `document.body` portal (`createPortal`) as `position: fixed`, computed from the trigger element's own `getBoundingClientRect()`, clamped to stay within the viewport. `HelpHint.tsx` now does this by default — any future call site gets the fix for free, no special handling needed.

**How to detect a regression:** if you ever build a new popover/dropdown/tooltip from scratch instead of reusing `HelpHint.tsx` or copying its portal pattern, and it's nested inside anything with `overflow-hidden` or a bounded-scroll wrapper, check it renders fully on screen — don't assume a plain nested `absolute` div is safe.

---

## Bug #8 — Flex children don't shrink below content width (Georgian step labels overflowed into neighboring columns)

**Severity:** Low — cosmetic, mobile + Georgian only
**Found + fixed:** 2026-08-04 (same session, onboarding wizard visual redesign) · **Status:** 🟢 Resolved

**Symptom:** `StepNav.tsx`'s step icons gained always-visible labels underneath (e.g. "Companies," "Wines"). In English this fit fine. In Georgian, longer un-hyphenated words (e.g. "საკონტაქტო ინფორმაცია" for "Contact info") ran into the neighboring step's label instead of wrapping, because flexbox children default to a minimum width equal to their content's natural width — they don't shrink below that just because the parent says `flex: 1`, so the label text pushed past its column's allotted share of the row.

**Fix:** added `min-width: 0` to each step's flex column (the standard fix for this well-known flexbox default) plus `w-full break-words` on the label span itself, so long labels wrap inside their own column instead of overflowing into the next one.

**How to detect a regression:** any time a flex-row layout with `flex: 1` children holds text that varies in length by locale (Georgian text is often meaningfully longer than its English source), check Georgian at mobile width (375px) specifically — English fitting is not evidence Georgian will too. This is now the *second* Georgian-specific layout bug found this way in the onboarding wizard alone (the first was the Simple-mode `flex-wrap` overflow found in the Companies step's original UI review, same day) — worth treating "check Georgian at mobile width" as a standard step for any new admin-panel layout, not an afterthought.

---

## Bug #11 — Onboarding wizard's company creation ignored the tenant's actual modules

> 🟢 **RESOLVED same day found, 2026-08-07.** Found by Max, hands-on, testing the wizard from a genuinely fresh tenant with both Bookings and Wine Orders enabled.

**Root cause:** `createOnboardingCompany()` in `app/actions/onboarding.ts` called `createCompany(name)` with no module flags at all, so every company the wizard created silently defaulted to `isBookingCompany: true, isWineOrderCompany: false` — regardless of which modules the tenant actually had on. A tenant with only Wine Orders enabled (booking off) would still get booking-only companies from the wizard, useless for their actual purpose; a tenant with both enabled had no way to mark a company as wine-order (or both) at all.

**Fix:** `createOnboardingCompany()` now takes an explicit `{isBookingCompany, isWineOrderCompany}` argument. `CompaniesStep.tsx` only asks (a small pill selector, "Bookings"/"Wine Orders", multi-select) when the tenant has both modules on — with just one, the answer is obvious and it's set silently, no extra clicking. Verified live: a company added with both pills selected shows "Both modules" on the real `/admin/companies` page, matching exactly what manual creation there produces.

---

## Bug #12 — Post-launch nudge false-positived "needs pricing" on wine-order-only companies

> 🟢 **RESOLVED same day found, 2026-08-07.** Found while fixing #11 — pricing tiers are a booking concept (guest counts, visit pricing); wine-order companies don't use them at all, so `getFinishDetailsStatus()`'s blanket "0 price tiers → needs details" check would have flagged every wine-order-only company as incomplete forever, with no way to ever satisfy it.

**Fix:** the pricing condition in `getFinishDetailsStatus()` (`app/actions/onboarding.ts`) and the equivalent per-row check in `CompaniesClient.tsx` (`missingDetails()`) now only apply when `isBookingCompany` is true. `identificationCode` and contact-info checks stay unconditional (relevant to both company types).

---

## Bug #13 — Real Companies list page had no visual indicator for missing details

> 🟢 **RESOLVED same day found, 2026-08-07.** Max flagged this directly: clicking the finish-details banner's link lands on `/admin/companies`, but the list itself gave no way to tell which company the banner meant — "2 tiers · 0 orders" text doesn't say what's *missing*. Deliberately deferred earlier this session (see [[Plan-OnboardingFlow]] Phase 3 section) until the full scope was known, rather than patching it twice.

**Fix:** `CompaniesClient.tsx` now computes the same `missingDetails()` check used by the nudge banner (identificationCode / contact info / pricing, the last one booking-only per #12) and renders a small amber "⚠ Needs details" badge per row, with a click-reveal `HelpHint` listing exactly what's missing (e.g. "Still missing: ID code, contact info") — reusing the accessible click-reveal component already built for #139 rather than a new hover-only tooltip. No new server round-trip: the page already fetched every field needed.

---

## Bug #14 — Enhanced-booking/wine-catalogue status colors don't respect the tenant's theme

> 🟢 **RESOLVED same day found, 2026-08-07.** Max asked directly whether the public site fully respects all 10+ super-admin theme presets — audited rather than assumed (see [[Plan-OnboardingFlow]] part 12 for the full audit). Structural theming (backgrounds, borders, text, brand color) was confirmed solid everywhere; this was the one real, narrower gap found.

**Root cause:** `components/BookingForm.tsx`'s company-code-confirmed box, its "no rate for this guest count" alert, and all its plain error text — plus the same UI copy-pasted into `app/(site)/wines/WineCatalogueClient.tsx`, including its discount badge — hardcoded literal hex colors (`#f0fdf4`/`#86efac`/`#16a34a`/`#15803d` for success, `#fff8f0`/`#fca5a5`/`#b91c1c` for error). Everything else in both files was already correctly theme-aware (`var(--site-*)`) — these were the one class of exception. The theme system (`lib/themePresets.ts`) has no dedicated success/error tokens to begin with, only `bg`/`surface`/`text`/`muted`/`border`/`secondary`/`brand`.

**Fix:** rather than hand-authoring success/error color pairs for all 16 presets (11 light, 5 dark), each file now defines a small `STATUS` object that blends the semantic hue into the theme's own surface/border/text via CSS `color-mix()` — e.g. `color-mix(in srgb, #16a34a 12%, var(--site-surface))` for the success background. This keeps every status color recognizably green/red while automatically adapting to whatever tone the active preset actually has, light or dark, with no per-preset authoring needed and no new theme architecture. Verified the mechanism resolves correctly against real computed CSS on both the light default ("Cream & wine") and a dark preset ("Midnight cellar," switched on the actual test tenant via super-admin, then reverted) — on dark, the mix correctly produced a dark-green-tinted background with a bright, readable green text/border instead of the old fixed light-mint box. `tsc --noEmit` clean.

**Not fixed, deliberately out of scope:** the admin panel's own separate (and much larger, pre-existing) pattern of only theming the `--color-brand` accent and hardcoding everything else — confirmed this is consistent across every admin page, not specific to this bug, and a different-sized problem. A `hover:bg-gray-50` Tailwind literal on both files' "Enter Manually" button was also left as-is (low severity, a brief hover flash; fixing it would need JS-driven state since inline `style` can't express `:hover`).

---

## Bug #15 — Nested `<button>` on `/admin/companies` causes a hydration mismatch

**Severity:** Medium — no data loss by itself, but cost multiple clicks their effect unpredictably (row expand, tab toggle, "+ Add Booking Company") and once contributed to a stale-element-reference incident that briefly overwrote real Cookie Company data during manual testing (caught and reverted)
**Found:** 2026-08-10, while building the Playwright suite's companies-CRUD test (#147 Phase 3) · **Status:** 🟢 Resolved 2026-09-12

> **Reconciled 2026-09-19.** This entry still read 🔴 Open a week after the fix shipped, while the
> resolved banner higher up this same file already said 2026-09-12 — one file contradicting itself.
> Verified against the code before changing it: `CompaniesClient.tsx` now closes the row-summary
> `<button>` before the `HelpHint`, and all four other `HelpHint` sites in that file sit in plain
> `<div>` wrappers or as a sibling after `</button>`. The "Recommended fix" below is the fix that
> was actually applied. Left in place rather than deleted because the incident it describes (the
> accidental Cookie Company edit) is worth keeping findable.

**Root cause:** `CompaniesClient.tsx`'s per-company row summary is a `<button onClick={() => setExpandedId(...)}>` (`app/admin/(panel)/companies/CompaniesClient.tsx` ~line 733) wrapping the row's whole content, including a conditionally-rendered `<HelpHint text={...} />` (~line 757) whenever the row has a "needs details" warning. `HelpHint.tsx` itself renders its "?" trigger as its own `<button type="button">` (~line 69) — so a `<button>` ends up nested inside another `<button>`, which is invalid HTML. Browsers correct this at parse time, so React's server-rendered markup and the DOM the browser actually builds disagree, producing a hydration mismatch on every page load, in any locale. (The similarly-structured Individuals row, ~line 664-685, is safe — its `HelpHint` sits as a sibling *after* the closing `</button>`, not inside it.)

**Observed impact:** React periodically discards/rebuilds the affected DOM subtrees client-side to reconcile the mismatch, which cost clicks their effect unpredictably across the page — not one flaky element, a property of the whole page. Worked around in the Playwright test with a click-and-verify retry helper (`clickUntil()`) before being fixed at the source on 2026-09-12. While diagnosing this live via `playwright-cli`, a stale cached element reference (pointing at a row that had just been rebuilt) briefly caused a real accidental edit to Cookie Company's live data — caught via the actual POST body and reverted via direct SQL, confirmed restored.

**Fix applied (2026-09-12):** moved the row's `HelpHint` outside the row-summary `<button>`, the same pattern the Individuals row already used correctly. (The alternative considered — making the row summary a `<div role="button" tabIndex={0}>` so the hint could stay visually inside — was not needed.) Originally flagged as task chip `task_b2b8da79`.

**Consequence still outstanding for the test suite:** `clickUntil()`, the retry-until-verified click helper, was introduced *because* of this bug and is still wrapped around most meaningful clicks in `saas/tests/helpers/payments.ts` and `companies-crud.spec.ts`. With the cause gone, those retries will now mask a genuine regression — a click that truly stopped working is indistinguishable from one that was merely slow. Worth re-examining deliberately rather than stripping out blindly (clicks on this UI may still be slow for unrelated reasons).

---

## Bug #16 — `/wines` Grid/List view toggle buttons are hardcoded English, no i18n

> 🟢 **RESOLVED 2026-08-12.** Fixed as part of [[Plan-I18nIntegrity]] part A, item 1 (the plan's first, well-scoped fix).

**Severity:** Low — cosmetic, Georgian-only gap; no functional impact
**Found:** 2026-08-11, while building the Playwright suite's locale-integrity test (#147 Phase 4) · **Status:** 🟢 Resolved

**Root cause:** `app/(site)/wines/WineCatalogueClient.tsx`'s view-toggle buttons (~line 726-742) set `title="Grid view"` and `title="List view"` as plain string literals — neither calls `t()` against `lib/t.ts`, so there is no Georgian (or any other locale) translation to fall back to or leak from. This is a different failure shape than the #131-class bug the new locale-integrity test guards against (a dictionary key existing but missing a `ka` row, which falls back to raw-key text or English) — here there is no key at all, so the test's raw-key-leak and console-error assertions never trip on it.

**Impact:** these two labels stay in English even when a visitor has switched the whole `/wines` page to Georgian — everything else on the page translates correctly.

**Fix:** added `wines.view.grid`/`wines.view.list` keys to `lib/t.ts` in both `en` ("Grid view"/"List view") and `ka` ("ბადის ხედი"/"სიის ხედი"), and swapped the two literal `title` strings for `t(locale, 'wines.view.grid')`/`t(locale, 'wines.view.list')` calls — `locale` was already in scope in the component. Verified directly: a standalone script importing `lib/t.ts` confirmed both keys resolve correctly for `en` and `ka`. `npx tsc --noEmit` clean. New `scripts/check-i18n-parity.ts` (built same session, part B1 of the same plan) confirms `t.ts` is at full 119/119 key parity, including these two. Originally flagged as task chip `task_c0ea7d95`, found and documented in `playwright/notes/11-locale-integrity.md` and `playwright/KNOWN-ISSUES.md`.

---

## Bug #17 — `prices.ts` bypassed tenant isolation (raw `db` instead of `withTenantDb`)

> 🟢 **RESOLVED same day found, 2026-08-12.** Found during the full architecture/flow review earlier this session ([[ArchitectureReview-2026-08-12]] section 1), flagged as task chip `task_262c73ba`, then fixed with Max's explicit go-ahead.

**Severity:** High — a real cross-tenant write path, not a hypothetical. Would have let any tenant-A admin write or delete another tenant's pricing data today, with 2 real tenants on the platform.

**Root cause:** `app/actions/prices.ts` — `createPrice`, `updatePrice`, `deletePrice` — called the raw Prisma client (`db.price.*`) directly instead of going through `withTenantDb` (`lib/db.ts`), the tenant-isolation wrapper every other tenant-scoped action uses (see [[RLS-Architecture]]). They were guarded only by `requireAdmin()` (`lib/requireAdmin.ts`), which takes no arguments and only checks that the *calling admin's own* tenant matches the current request's domain — it never validated that the `companyId`/`priceId` *argument* passed into these functions belonged to that tenant. `Price` has no `tenantId` column of its own; its RLS policy is JOIN-based against `Company.tenantId`. Because these three functions never called `withTenantDb` (which does `SET LOCAL ROLE app_user` before querying), they ran as the raw `postgres`-role connection, which bypasses RLS by design (superuser). Only `setDisplayPrice` in the same file already did this correctly (`price.company.tenantId !== tenantId` check) — that was the reference pattern for the fix. `onboarding.ts`'s `createOnboardingCompany()`/`addIndividualsPriceTier()` both call into `createPrice`, so they inherited the gap without knowing it (harmless in practice there, since both always pass a same-tenant `companyId` — the risk was a direct/crafted call, e.g. via devtools network tab).

**Adversarial verification (same review session, before the fix):** a second agent was sent specifically to try to disprove the finding and could not — confirmed these are real Next.js Server Actions, directly invocable by an authenticated tenant-A admin with an arbitrary tenant-B ID, bypassing the UI entirely. That pass also surfaced that `scripts/setup-rls.ts` only ever runs `ENABLE ROW LEVEL SECURITY`, never `FORCE ROW LEVEL SECURITY` — investigated as part of this fix, see below.

**Fix:** `createPrice`, `updatePrice`, `deletePrice` now all run inside `withTenantDb(tenantId, ...)` using the admin's own resolved `tenantId` (from `getTenantId()`). Since `Price`'s RLS policy requires `EXISTS (Company WHERE company.id = price.companyId AND company.tenantId = current_setting('app.tenant_id'))`, a cross-tenant `companyId`/`priceId` argument now fails RLS automatically. On top of that, each function does an explicit ownership check before touching anything (mirrors `setDisplayPrice`'s pattern) so a cross-tenant attempt returns a friendly `{ error: 'Not found.' }` instead of a thrown Postgres RLS exception. `validateTier()` (the overlap-check helper) was also changed to take the transaction client instead of the raw `db`, so its read is tenant-scoped too.

**`FORCE ROW LEVEL SECURITY` investigation:** the review session's adversarial pass had flagged this as a second, independent reason unwrapped queries bypass RLS (Postgres `ENABLE` without `FORCE` exempts a table's *owner* role, and the app's Prisma connection owns every table). Queried `pg_roles` against the **dev** database directly: `postgres` has `rolbypassrls = true`. A Postgres role with `rolbypassrls = true` ignores RLS regardless of `FORCE` — `FORCE` only removes the owner-exemption, it does not touch genuine `BYPASSRLS`/superuser status. So adding `FORCE ROW LEVEL SECURITY` to `setup-rls.ts` would change **nothing** for this connection today — it was **not** added. This corrects the review doc's speculation, which had correctly identified the mechanism but hadn't yet confirmed which case actually applies here. If `DATABASE_URL` is ever pointed at a role without `BYPASSRLS` (a real superuser-status change, not something planned), this should be revisited.

**Verification:** `npx tsc --noEmit` clean. `npx tsx scripts/check-rls.ts` confirms all 14 tenanted tables still have RLS on with policies intact (unchanged by this fix). New `scripts/test-price-rls.ts` (two-tenant pattern, modeled on `scripts/test-payment-rls.ts` per `MaintenanceNotes.md` §10 — the general `test-rls.ts` suite doesn't reliably catch a JOIN-policy miss like this one) — 10/10 checks pass, covering both the raw RLS policy directly and the fixed action functions' explicit ownership checks. Kept as a permanent addition.

**Status:** fixed and pushed to `staging` (dev database, `georgian-saas-git-staging-...vercel.app`). **Not yet merged to `master`/production** — awaiting Max's review on staging per the standing git workflow (Rule 0).

---

## Bug #20 — Admin panel (`/admin`) doesn't respect tenant theme presets

> 🟢 **RESOLVED same day found, 2026-08-13.** Fixed together with Bug #21 in one combined pass — see the shared fix write-up after #21's root-cause section below.

**Severity:** Medium — cosmetic only (no data/security impact), but real and reproducible: a tenant on any dark preset gets a jarring light-cream admin panel, the opposite of what the super-admin theme picker promises ("Everything but the brand color is fixed by the theme").
**Found:** 2026-08-13, Max asked to verify directly after noticing it was called out (but never given its own tracked bug) inside [[KnownBugs]] Bug #14's write-up — that fix's "not fixed, deliberately out of scope" note flagged this exact gap on 2026-08-07 without logging it as its own bug · **Status:** 🟢 Resolved

**Reproduced live:** on the local dev server (Staging Winery tenant, dev DB), switched the tenant's theme in `/super-admin/tenants/[id]` from "Cream & wine" to the dark "Deep harbor" preset, saved, restarted the dev server to clear the 5-minute tenant cache, then logged into `/admin` as the tenant admin. Confirmed via computed styles: the root CSS vars updated correctly (`--site-bg: #131A22`, `--site-surface: #1B242E`, `--color-brand: #3E7FB0`), but the admin nav bar (`app/admin/(panel)/layout.tsx`) rendered with `background-color: rgb(255, 249, 243)` (`#FFF9F3`) and border `rgb(224, 212, 192)` (`#E0D4C0`) — the literal "Cream & wine" preset's surface/border hex, unchanged from before the switch. Nav link text, the page shell background, and onboarding-banner styling were all similarly hardcoded. Reverted the tenant back to "Cream & wine" afterward — no lasting change to tenant data.

**Root cause:** `app/admin/(panel)/layout.tsx` hardcodes literal hex colors for the entire admin shell (`backgroundColor: '#f0ebe3'` on the page wrapper; `#fff9f3`/`#e0d4c0` on the nav; `#a89070`/`#6b5a47` on nav text) instead of the `var(--site-bg)`/`var(--site-surface)`/`var(--site-border)`/`var(--site-muted)` tokens that `app/layout.tsx` already injects globally from `resolveTenantTheme()` (confirmed those vars *are* present and correct on `/admin` pages — only the shell ignores them). Individual admin pages follow the same pattern: a grep across `app/admin/**` found `var(--color-brand)` used in isolated spots (buttons, accent text) but almost no use of `var(--site-*)` — most page bodies rely on plain Tailwind grays/whites instead, so cards/banners/dividers stay light regardless of preset. This is the same "admin theming gap" flagged narratively (not as its own bug) inside Bug #14's write-up on 2026-08-07: "the admin panel's own separate (and much larger, pre-existing) pattern of only theming the `--color-brand` accent and hardcoding everything else — confirmed this is consistent across every admin page."

**Fixed same session** — see combined write-up after #21 below.

---

## Bug #21 — Same hardcoded-cream bug as #20, repeated independently across nearly every admin page body

> 🟢 **RESOLVED same day found, 2026-08-13.**

**Severity:** Medium — same class as #20 (cosmetic, no data/security impact), but far larger in surface area: this is the *dominant* styling pattern across the admin panel, not a handful of stragglers.
**Found:** 2026-08-13, same session as #20 — Max asked for a second subagent to specifically hunt for more theming bugs beyond the admin shell. Delegated a read-only investigation (no edits, no dev server) scoped to skip the already-known #14 (resolved) and #20 (shell) findings · **Status:** 🟢 Resolved

**Root cause:** #20 covers `app/admin/(panel)/layout.tsx` (the shared nav/shell). This bug is the same pattern one level down — nearly every individual admin page component independently defines its own local `const C = { text: '#1c1008', muted: '#6b5a47', faint: '#a89070', border: '#e0d4c0', bg: '#fff9f3', ... }` (the "Cream & wine" preset's literal token values) and uses it for real chrome — card backgrounds, borders, tab bars, input backgrounds, table rows — instead of the `var(--site-*)` tokens already available globally. Confirmed present (with line numbers) in: `companies/CompaniesClient.tsx`, `content/ContentClient.tsx`, `masterclass/MasterclassClient.tsx`, `wines/WinesClient.tsx`, `wine-orders/PackingView.tsx` + `WineOrdersClient.tsx`, `settings/SettingsClient.tsx`, `orders/CalendarView.tsx` + `OrdersFilters.tsx` + `OrdersTable.tsx` + `ViewToggle.tsx` + `[id]/OrderDetail.tsx` + `new/NewOrderForm.tsx` (plus their thin server-wrapper `page.tsx` files), `menu-items/MenuItemsClient.tsx`, `statistics/StatisticsClient.tsx` + `StatisticsV2.tsx` + `WineStatistics.tsx` + `SearchableSelect.tsx`, `app/admin/(panel)/loading.tsx` (even the loading skeleton clashes), and `app/admin/(panel)/LogoutButton.tsx`.

**Two shared components used from tenant-facing pages during admin inline-editing carry the same bug:** `components/HelpHint.tsx` (its trigger button and popover both hardcode cream hex) and `components/EditableLongText.tsx` (textarea/save/cancel/read-mode card all hardcoded) — notably its sibling `components/EditableText.tsx` already does this correctly via `var(--site-*)`, so `EditableLongText` is an inconsistency within the same component family, not a from-scratch gap.

**A working fix template already exists in the codebase:** two files in `content/` — `BackgroundsTab.tsx` and `BookingFormVisualPanel.tsx` — define the identical-shaped `C` object but point every value at `var(--site-*)`/`var(--color-brand)` instead of hex. Whoever fixes #20/#21 can copy that pattern rather than invent one.

**Also found, smaller and separate:** `components/BookingForm.tsx` and `app/(site)/wines/WineCatalogueClient.tsx`'s "Enter Manually" button uses a correctly-themed resting state but an untthemed `hover:bg-gray-50` Tailwind literal for its hover state (distinct from the already-fixed Bug #14 status badges in the same two files) — medium confidence, cosmetic, hover-only. And `components/AdminBar.tsx` uses a fixed dark-maroon edit-mode strip that never references any theme token — flagged as a product-judgment call (may be intentionally constant, like the super-admin panel's own fixed theme) rather than an assumed bug, since no doc/comment establishes intent either way.

**Confirmed clean by the same investigation:** the public-facing site (`app/(site)/**`, `SiteNav.tsx`, legal pages, `payment/result/page.tsx`) is close to fully theme-aware — the one hardcoded value found (`page.tsx`'s hero-gradient dark end) is explicitly commented in-code as deliberate.

**Fix (both #20 and #21, same combined pass, 2026-08-13):** scoped the ~36 affected files into 6 non-overlapping chunks (shell + shared components; Companies/Content/Settings; Orders — 10 files; Wines/Wine-orders/Menu-items/Masterclass; Statistics; Onboarding wizard) and ran 6 parallel subagents, each given the exact same hex→CSS-var mapping table (`#f5efe6`/`#f0ebe3`→`var(--site-bg)`, `#fff9f3`/`#fffdf9`→`var(--site-surface)`, `#1c1008`→`var(--site-text)`, `#6b5a47`→`var(--site-muted)`, `#e0d4c0`→`var(--site-border)`, `#a89070`→`var(--site-secondary)`, `#7c1d23`→`var(--color-brand)`, `#9b2429`→`var(--color-brand-hover)`), the already-correct `BackgroundsTab.tsx`/`BookingFormVisualPanel.tsx` files as a reference pattern to copy, and a strict "leave any non-table hex alone" rule to protect semantic status/success/error/warning colors and Recharts series colors from being touched. Pure color-value substitution — no logic, structure, or prop changes; final diff was exactly 185 insertions / 185 deletions across 36 files, confirming no line-count drift.

One agent made a good independent catch: `wine-orders/PackingView.tsx`'s printed packing-sheet HTML is built as a separate `window.open()` document that doesn't inherit `app/layout.tsx`'s CSS vars, so it correctly left that block's hex alone rather than silently breaking the print sheet (same "print views are intentionally plain" exception as `InvoicePrint.tsx`/`BookingSheetPrint.tsx`).

**Review pass caught 3 classes of issues the mapping table missed, all fixed by hand afterward:**
1. **A real mapping bug:** the Statistics chunk resolved `bg: '#fff9f3'` to `var(--site-bg)` instead of `var(--site-surface)` in `StatisticsClient.tsx`/`StatisticsV2.tsx`/`WineStatistics.tsx` — inconsistent with how the same `C.bg` field is used elsewhere (a card/panel surface, not the page background) and with every other file's mapping. Corrected in all three.
2. **A recurring near-miss color, `#8b4513`:** several agents independently flagged this "rust" section-header/badge accent as clearly the same bug (it plays the identical role `ContentClient.tsx`'s own `rust` field already names, which the reference files map to `var(--site-secondary)`) but didn't touch it since it wasn't an exact match to the given table. Confirmed via grep it's used identically as a section-header label color 21 times across 8 files (`MenuItemsClient.tsx`, `ContentClient.tsx`'s `rust` field, `SettingsClient.tsx` ×12, `MasterclassClient.tsx` ×2, `wine-orders/page.tsx`'s order-count badge paired with `#f5ede0`, `NewOrderForm.tsx` ×3, `OrderDetail.tsx` ×4) — mapped all of them to `var(--site-secondary)` (and `#f5ede0`→`var(--site-bg)` for the one paired badge). Similarly, `HelpHint.tsx`'s "?" trigger button used near-miss tones (`#f0e6d8`/`#8b7355`/`#d9c7a8`) for its closed state that the chunk-1 agent correctly left alone — mapped these to the same `var(--site-surface)`/`var(--site-muted)`/`var(--site-border)` its own popover already used, for consistency within the same small component.
3. **A scoping mistake, not an agent error:** I told the onboarding-wizard agent that step files (`PaymentInfoStep.tsx`, `ContentPhotosStep.tsx`, `ReviewStep.tsx`, etc.) only contained semantic colors on top of the shared `C` import, so left them out of its file list — wrong for 3 files, which had 5 more exact-table-match hardcoded surface colors alongside their semantic ones. Found via a full server-rendered-HTML sweep of every fixed route (`fetch()` + regex for the mapped hex, run against actual response bodies rather than relying on client-side rendering) and fixed directly.

**Verification:** `npx tsc --noEmit` clean throughout (before and after the manual corrections above). Live-tested on the dev server (Staging Winery tenant): confirmed the default "Cream & wine" preset renders unchanged (computed nav/shell colors matched the original hardcoded values, since the token resolves to the same hex by design — the sole visible exception being the outer page-wrapper background moving from a bespoke `#f0ebe3` to the shared `var(--site-bg)` token's `#f5efe6`, a ~2% lightness shift that aligns the admin shell with the same background used everywhere else on the "Cream & wine" preset rather than a one-off custom shade — judged a correct side-effect of the fix, not a regression). Then switched the tenant to the dark "Midnight cellar" preset (restarting the dev server to clear the 5-min tenant cache) and confirmed via computed styles that the shell, nav, and page-body cards across Orders/Companies/Statistics now correctly render dark surface/border/text (`#262220`/`#3A332C`/`#F1E9DD`). Ran a server-HTML sweep across all 10 fixed routes (`orders`, `companies`, `wines`, `wine-orders`, `menu-items`, `masterclass`, `statistics`, `content`, `settings`, `onboarding`) for any remaining mapped hex — zero unintended matches; the only hits were already-documented intentional exceptions (`WinesClient.tsx`'s `BLANK_PRODUCT` default wine-swatch color, `WineStep.tsx`'s `TYPE_COLOR` per-wine-type swatch map, both print views) plus one false positive (a real seeded wine's own data color, `"Kisi": #6b5a47`, coincidentally matching the muted-text hex). Reverted the test tenant back to "Cream & wine" afterward — no lasting change to tenant data. No console errors introduced; the only console noise throughout was expected local dev-server HMR websocket messages.

**Deliberately left out of this fix, still open:**
- `components/AdminBar.tsx`'s fixed dark-maroon edit-mode strip — ambiguous whether intentionally constant (like the super-admin panel's own fixed theme) or a bug; no doc/comment establishes intent either way, flagged for Max's call rather than guessed at.
- `app/admin/login/LoginForm.tsx` — pre-tenant-identity screen, wasn't part of the original Bug #14/#20/#21 audit scope, left alone.
- `BookingForm.tsx`/`WineCatalogueClient.tsx`'s untethered `hover:bg-gray-50` on the "Enter Manually" button (noted in #21's original write-up) — still not fixed; inline `style` can't express `:hover`, would need JS-driven state, judged not worth the added complexity for a hover-only cosmetic flash.
- Plain white (`#ffffff`) stat-card backgrounds in the Statistics pages, and `ContentClient.tsx`'s tab-strip track background (`#ede5d8`) — both flagged by review as plausibly the same bug class but lower-confidence/lower-impact judgment calls, left untouched rather than guessed at.

**Committed** 2026-09-06 in `3777b04` on `staging` (dev database), alongside the Bug #22 fix below. Not yet merged to `master`/production — pending Max's review on staging per the standing git workflow (Rule 0).

---

## Bug #22 — Wine-order checkout trusts client-supplied price/discount, no server-side revalidation

> 🟢 **RESOLVED same day found, 2026-09-06.**

**Severity:** Critical — a customer-facing money path with zero server-side validation. Not yet live-exploitable for real payment on production specifically (Nikalas Marani's Flitt module has no credentials configured today, per Bug #19's write-up), but the stored order/total is fabricated regardless, and the payment-amount risk activates the moment any tenant turns on online payment.
**Found:** 2026-09-06, dedicated penetration test (Max's request) — see [[penetration test]] for full test design and findings. Confirmed independently by direct code read, not just the tester's report · **Status:** 🟢 Resolved

**Root cause:** `app/actions/submitWineOrder.ts` parses the submitted wine list straight from client JSON (`JSON.parse(winesJson)`, line 44) — each item carries its own client-supplied `price`, and the order subtotal is computed directly from it (`sum + w.quantity * w.price`, line 51). `discountPercent` is read the same way, straight off form data (lines 37-38), with no lookup against the real `Company.wineDiscountPercent` and no clamp (a value over 100 makes the total go negative). Neither value is ever checked against the database's real `WineVintage.price`. The resulting `totalAmount` is written to the `WineOrder` row, snapshotted per-line into `WineOrderItem.priceSnapshot`, and — for any tenant with online payment enabled — passed as the literal `amount` to `startCheckout()` (line 117), which is what Flitt actually charges. Same bug class as the already-fixed masterclass-pricing trust issue (`Plan-SecurityAndBugFixes.md` #3, "Masterclass price trusted from client") and structurally similar to #17 (a money/pricing path that skipped a server-side check) — just never applied to wine orders specifically.

**Reproduced:** a hand-crafted request (captured from the real `/wines` form's request shape, then replayed via `curl` with `price: 0.01` and `discountPercent: 99` on 5 units of a real 15₾ wine) created a real `WineOrder` row at an effectively-zero total. Test data was tagged `PENTEST-*` and deleted afterward, confirmed empty by follow-up query.

**Fix:** `submitWineOrder.ts` now fetches the real `WineVintage.price` for every `vintageId` in the order (tenant-scoped, inside the existing pattern of a `withTenantDb` call) and the company's real `wineDiscountPercent` (also tenant-scoped), and computes `subtotal`/`totalAmount` from those server-fetched values instead of the client's `w.price`/raw `discountPercent` field — mirroring the fix already applied to masterclass pricing in `createBooking.ts`. `priceSnapshot` on each `WineOrderItem` now stores the server-verified price, not the client-submitted one. Discount is clamped to 0–100 (`Math.min(realCompany.wineDiscountPercent, 100)`) as defense in depth. If a submitted `vintageId` doesn't resolve to a real, active, tenant-owned vintage, the whole order is now rejected with "One or more selected wines are no longer available" rather than silently pricing it at 0.

**Verified:** `npx tsc --noEmit` clean. Live-tested end-to-end on the dev server: installed a `window.fetch` hook (same technique the pentest used) that rewrote the outgoing request's `price` to `0.01` and `discountPercent` to `99` on a real 5-bottle order of a 15₾ wine, submitted it through the real UI, and confirmed directly in the database that the resulting order stored `totalAmount: 75` (5 × the real 15₾ price) and `discountPercent: null` — the tampered values were completely ignored, exactly as intended. Test order tagged `PENTEST-VerifyFix`, deleted afterward, confirmed removed by follow-up query.

Full write-up with all findings (including 5 lower-severity/infrastructure items and a "tested and not vulnerable" section covering cross-tenant IDOR, auth/access control, SQL injection, and XSS): [[findings]].

**Committed** 2026-09-06 in `3777b04` on `staging` (dev database), alongside the Bug #20/#21 fix. Not yet merged to `master`/production — pending Max's review on staging per the standing git workflow (Rule 0).

---

## Bug #23 — Admin panel content container didn't stretch to full screen width

> 🟢 **RESOLVED same day found, 2026-09-09.** Max flagged it via a screenshot of `/admin/orders` on a wide monitor.

**Severity:** Low — cosmetic, no data impact, but affects every admin page.
**Found:** 2026-09-09, Max's bug list this session · **Status:** 🟢 Resolved

**Root cause:** `app/admin/(panel)/layout.tsx`'s `<main>` wrapper hardcoded `max-w-6xl` (1152px) regardless of viewport width. On a wide monitor this centered every admin page's content in a ~1152px column with large wasted margins on both sides. Separately, the Orders table's own row content (whitespace-nowrap across ~10 default columns) needs ~1411px — wider than even the 1152px cap — so the table's own `overflow-auto` wrapper also kicked in its own horizontal scrollbar. That's the "narrower AND still scrolls" symptom in Max's screenshot: two independent width constraints stacking. `OrdersTable.tsx` itself was already correct (`w-full` table inside `overflow-auto`, with the existing mobile-card fallback from Bug #9) — no changes needed there.

**Fix:** widened the container: `max-w-6xl` → `max-w-screen-2xl` (1152px → 1536px), a standard Tailwind step. Other admin pages that scope their own content narrower (e.g. Settings' inner `max-w-2xl`) are unaffected since they nest their own width inside this shared outer container.

**Verified:** measured via `getBoundingClientRect()` in the browser at 1920px (main: 1152px→1536px, table now fills width with no internal scroll for the default column set), 1280px (table fills width, internal scroll appears only where content genuinely doesn't fit — expected), 768px and 375px (no page-level horizontal overflow, mobile card view unaffected, Georgian nav labels still fine). Columns dropdown (show/hide columns) still functions correctly at the new width. `npx tsc --noEmit` clean.

**Committed** 2026-09-09 in `fee8362` on `staging`. Not yet merged to `master`/production — pending Max's review on staging per the standing git workflow (Rule 0).

---

## Bug #24 — Bug-report button overlapped the wine cart's sticky bottom bar

> 🟢 **RESOLVED same day found, 2026-09-09.** Max flagged this happening during a wine-buying flow.

**Severity:** Low — cosmetic, no data impact.
**Found:** 2026-09-09, Max's bug list this session · **Status:** 🟢 Resolved

**Root cause:** `components/BugReportWidget.tsx`'s floating trigger button (`fixed bottom:20px, right:20px`, z-index 8900) sits at the same bottom-right corner as `app/(site)/wines/WineCatalogueClient.tsx`'s sticky "add to cart" bar (`fixed bottom-0 left-0 right-0 z-40`, ~65px tall), which only appears once the cart has items. Because the widget's z-index is far higher, once the cart bar appeared the bug-report button rendered directly on top of the bar's checkout button/price text instead of clearing it.

**Fix:** the cart bar now publishes its own live height (via `ResizeObserver`, not a hardcoded number, since the bottle-list text can wrap) to a `--cart-bar-offset` CSS var on `document.documentElement`, reset to `0px` whenever the cart is empty or the component unmounts. `BugReportWidget.tsx`'s button offset changed from `bottom: 20` to `bottom: calc(20px + var(--cart-bar-offset, 0px))` — defaults to unchanged everywhere else, only lifts on the wines page when the bar is actually showing. Chosen over a global fixed offset (would waste space on every other page for a collision that only exists in one place) and over prop/context plumbing (the widget is a shared, page-unaware component mounted once per surface — a CSS var bridge is the lighter-weight fix).

**Verified:** confirmed the exact overlap first (button 652–700px vs bar 655–720px, same vertical span) at desktop and 375px mobile widths, then after the fix measured a clean ~32px gap at both. Confirmed no change with an empty cart, and confirmed the bug-report panel itself still opens/closes correctly with the cart bar showing. Grepped the app for other full-width `fixed bottom-0` bars — this cart bar is the only one; admin slide-overs and the wine drawer are all side/full-screen overlays, unaffected. `npx tsc --noEmit` clean.

**Committed** 2026-09-09 in `3c38a2d` on `staging`. Not yet merged to `master`/production — pending Max's review on staging per the standing git workflow (Rule 0).

---

## Bug #25 — Wine catalogue Type/Style/Year filters didn't respect each other

> 🟢 **RESOLVED same day found, 2026-09-09.**

**Severity:** Low-Medium — no data impact, but a confusing dead click for real customers on `/wines`.
**Found:** 2026-09-09, Max's bug list this session · **Status:** 🟢 Resolved

**Root cause:** `app/(site)/wines/WineCatalogueClient.tsx`'s 3 filter pill groups (Type, Style, Year) each computed their available options from the FULL wine list independently of the other two active filters. Example: a winery with Red-2023 but no Red-2022 — selecting Type=Red still showed "2022" as a normal clickable Year pill (some wine somewhere is 2022), and clicking it silently produced zero results.

**Fix:** added 3 cross-filter matcher helpers, each checking only the OTHER two dimensions (never its own), and a `disabled` flag per pill option computed against them. Disabled options stay visible with their label (not hidden) but render grayed (`opacity: 0.4`, `cursor: not-allowed`, themed via the same `C.border`/`C.muted` tokens already used for inactive pills) and their click is a no-op. The active pill and "All" are hardcoded never-disabled.

**Verified:** live on the dev server with a real cross-filter gap (one Red/2026/Dry/Sparkling wine, separate White/Amber wines in other years) — selecting Type=Red grayed out every Year except 2026 and grayed "Semi-dry" style; clicking a grayed Year pill did nothing; selecting a valid Year then correctly grayed out other Types with no wine in that year, confirming reciprocal cross-respect. `npx tsc --noEmit` clean.

**Committed** 2026-09-09 in `7aba432` on `staging`. Not yet merged to `master`/production — pending Max's review on staging per the standing git workflow (Rule 0).

---

### Wine order form: "Actual address of bar / restaurant" silently required, submit button gives no feedback

**Severity:** Moderate — affects the real product, not just the demo tenant. A real individual customer filling out the wine order form on `/wines` who leaves the address field blank clicks "Place Reservation" and **nothing happens** — no loading state, no error message, no network request. Looks like a dead/broken button.

**Found:** 2026-09-10, by an independent QA subagent testing the Vineworks Demo tenant's wine-order flow (see [[Plan-DemoSite]]). Confirmed via JS inspection: the field has `required` set with no visual indicator (no asterisk, no red border, no HTML5 validation tooltip surfaced) — the field is labeled for bars/restaurants specifically, so it reads as optional to an individual customer, but blocks submission silently.

**Status:** 🔴 Not fixed — found during unrelated demo-site testing, not yet triaged or scheduled.

**Suggested fix (not yet implemented):** either make the address field genuinely optional for individual (non-company) wine orders, or make the required-field validation visible (asterisk + inline error on failed submit) so the button doesn't look inert.

---

### Wine catalogue: Rkatsiteli tagged "RED DRY" in demo/NM data

**Severity:** Low — cosmetic data-entry issue, not a code bug. Rkatsiteli is a white grape variety; both catalogue entries ("Rkatsiteli 2026" and "Rkatsiteli 2023" per the QA pass) are tagged Red/Dry.

**Found:** 2026-09-10, same QA pass as above. Since the demo tenant's wine data was cloned from Nikalas Marani's real catalogue, this may be a real data entry mistake on NM's actual live site too — worth Max checking directly rather than assuming it's demo-only.

**Status:** 🔴 Not fixed — not yet checked against the real NM site.

---

## Bug #31 — Company booking form had no way to submit without an access code

> 🟢 **RESOLVED same day found, 2026-09-13.**

**Severity:** High — a real revenue-blocking dead end on production. A tour company rep with no access code yet could not book at all, on either booking-form variant.

**Found:** 2026-09-13, Max flagged with a production screenshot (direct-code variant: "Please enter and confirm your company code," booking silently discarded) and then live-tested the fix on staging, hitting the same class of problem on the dropdown variant (the browser's own "please select an item" prompt, looping with no way past it).

**Root cause:** `BookingForm.tsx`'s `handleSubmit` hard-blocked with an error when `bookingType === 'COMPANY'` and no company code was confirmed (direct-code tenants), and the dropdown variant's `<select required>` had no option at all for "I don't have a company yet." The only escape hatch, the standalone "New Company?" popup, sent a bare registration inquiry and discarded whatever booking details had already been typed into the form — so either way, a legitimate first-time customer could not complete a booking in one visit.

**Fix:** the company-code check in `handleSubmit` was moved to run *last*, after every other field validates, and on failure now opens the "New Company?" popup (pre-filled from the form) instead of blocking. Submitting the popup sends both the registration email and the booking itself (`companyId` stays `null`; a new `Order.requestedCompanyName` field records what was typed, for display only). The dropdown variant got a `'__new__'` sentinel `+ New Company` option — a real, selectable choice that satisfies the browser's `required` constraint — checked by the same generalized gate at submit time. Full design: [[Feature 180 - New Company Booking Flow]].

**Verified:** end-to-end on staging for both variants — filled a full company booking with no code, confirmed the popup opened (not a block or a loop) pre-filled from the form, submitted, and confirmed in the dev DB that the order landed with `companyId: null`, `requestedCompanyName` set, and `totalPrice: 0`, and that the admin Orders table displayed it correctly. Cleaned up test data and reverted tenant settings each time. `npx tsc --noEmit` clean throughout.

**Committed** 2026-09-13 (`7265b1b`, `ef9eece`) on `staging`. Not yet merged to `master`/production — pending Max's review on staging per the standing git workflow (Rule 0).

---

## Bug #32 — A no-`companyId` COMPANY booking was silently priced off the individuals table

> 🟢 **RESOLVED same day found, 2026-09-13.**

**Severity:** Medium — no customer ever saw this (the bug was in server-side pricing, not on-screen), but it would have shown the winery a fabricated price for a booking that was never actually priced.

**Found:** 2026-09-13, while building Bug #31's fix — noticed `createBooking.ts`'s pricing calc fell through to the *individuals* pricing table whenever `bookingType === 'COMPANY'` had no `companyId`, the same code path a genuine COMPANY booking with no matching tier already avoids.

**Root cause:** the initial `totalPrice` calc (`isEnhanced ? masterclassAmt : (pricePerPerson ?? 0) * guestCount`) used the individuals-table `pricePerPerson` regardless of `bookingType`, and the COMPANY-specific override block only ran `if (data.bookingType === 'COMPANY' && data.companyId)` — so a COMPANY booking with no `companyId` (Bug #31's new-company case) got the individuals rate multiplied by guest count instead of the usual "confirmed after submission" `0`.

**Fix:** the initial calc now branches on `bookingType === 'INDIVIDUAL'` explicitly; any COMPANY booking (with or without a `companyId`) starts at `0` unless the company-tier override below finds a real match. See [[Feature 180 - New Company Booking Flow]] for the full change.

**Verified:** same staging test as Bug #31 — a 6-guest new-company booking priced at `0`, not the individuals rate that would otherwise have applied for that guest count.

**Committed** 2026-09-13 (`7265b1b`) on `staging`. Not yet merged to `master`/production.

---
