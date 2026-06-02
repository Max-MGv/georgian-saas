---
tags: [log]
---

# Session Log

Most recent 2 sessions in full detail. Older entries compressed to one line.

---

## 2026-06-02 — Mobile admin plan + show password (full detail)

### Completed
- **Show password toggle on admin login** — added `showPassword` state to `LoginForm.tsx`; eye icon button (SVG, no library) positioned absolutely inside the password field wrapper; toggles `type="password"` / `type="text"`; eye-off icon shown when password visible, eye icon when hidden
- **Mobile admin plan written** — `vault/Plan-MobileAdmin.md` created; full plan for Orders list card view, filter bar collapse, order detail audit, wine orders column fix; v1.4 added to Roadmap

### Key files changed
- `saas/app/admin/login/LoginForm.tsx` — `showPassword` state, eye toggle button, `paddingRight` on input
- `vault/Plan-MobileAdmin.md` — NEW: full mobile admin plan
- `vault/Roadmap.md` — v1.4 Mobile Admin section added; old v1.4 Page Backgrounds renamed to v1.5
- `vault/FeatureLog.md` — feature #71 added

### Next up
- Build mobile admin: start with Orders list card view (biggest impact)
- Then filter bar collapse
- Then order detail audit + wine orders column fix

---

## 2026-06-01 — Date format + past date protection (full detail)

### Completed
- **DD/MM/YYYY custom date input** — built `saas/components/DateInput.tsx`: text input with DD/MM/YYYY placeholder, auto-inserts slashes as user types, calendar icon button opens native date picker via `showPicker()`, syncs internal YYYY-MM-DD value with display. Replaces all `input[type=date]` in booking form and admin orders filter bar. Universal — works the same regardless of OS/browser locale.
- **Past date protection** — booking form: `isPastDate` flag shows inline red warning immediately when user types a past date; handleSubmit blocks submission with error message. `createBooking.ts`: server-side guard compares `dateStr < todayStr` and returns error before any DB writes. Missing-date guard also added to handleSubmit.
- **lang="en-GB"** — set on `<html>` in `app/layout.tsx` (good for other locale-dependent behaviour; doesn't affect date inputs in Chrome which ignores it, hence the custom component).

### Key files changed
- `saas/components/DateInput.tsx` — NEW: universal DD/MM/YYYY input component
- `saas/components/BookingForm.tsx` — uses DateInput; hidden `name="date"` input; past-date warning + submit guard; missing-date submit guard
- `saas/app/admin/orders/OrdersFilters.tsx` — From/To filters use DateInput
- `saas/app/actions/createBooking.ts` — past-date server guard
- `saas/app/layout.tsx` — lang="en-GB"

### Next up
- User test the date filters — set From/To and confirm results update correctly
- User test the content editor — edit a nav label, a button, a paragraph; confirm it shows on live site
- Gallery page (images already in `public/images/`, just need wiring)
- Minor fixes #5–#7 from security plan when convenient

---

## 2026-06-01 — Bug fix: date filter inputs (full detail)

### Completed
- **KnownBug #1 fixed — date filter inputs** — The "From" and "To" date inputs in the orders filter bar were controlled by server-side `params` props. When a user picked a date from the native picker, `onChange` fired, `router.push` started a navigation, but React immediately reset the input back to the old value (from `params`) while waiting for the server to respond. This made the selection look lost. Fix: added `localDateFrom`/`localDateTo` local state that updates instantly on change, then syncs back to server params once navigation settles (detected by the existing `navKey` effect). The server query itself was always correct — all bookings are stored at UTC midnight so the `gte`/`lte` Prisma filters were sound.

### Key files changed
- `saas/app/admin/orders/OrdersFilters.tsx` — added `localDateFrom`/`localDateTo` state; inputs now use local state; `setUpcoming`/`clearFilters` also update local state; `navKey` effect syncs on settlement

### Next up
- User test the date filters — set From/To and confirm results update correctly
- User test the content editor — edit a nav label, a button, a paragraph; confirm it shows on live site
- Gallery page (images already in `public/images/`, just need wiring)
- Minor fixes #5–#7 from security plan when convenient

---

## 2026-06-01 — Security audit + fixes (full detail)

### Completed
- **Code inspection** — full review of recent features (editable content, booking form, server actions); 7 findings identified (2 critical, 2 medium, 3 minor).
- **Finding #1 disproved** — initial finding that admin routes were unprotected was wrong; `saas/proxy.ts` is the Next.js 16 middleware entry point and correctly redirects unauthenticated visitors to `/admin/login`. Verified by navigating to admin without session.
- **Finding #2 fixed — server action auth guard** — server actions are exposed as HTTP POST endpoints; the proxy only protects page URLs, so direct POSTs to action endpoints via public URLs bypassed auth entirely. Proved by calling `saveContent` via `POST /` with `Next-Action` header — DB was written without a session. Fix: created `lib/requireAdmin.ts` (checks Supabase session, throws Unauthorized if no user) and added `await requireAdmin()` to every write action across 12 files.
- **Finding #3 fixed — masterclass price from DB** — `createBooking` trusted client-supplied `pricePerUnit` for masterclass line items, allowing a user to submit `pricePerUnit: 0` and pay nothing for add-ons. Proved by submitting a booking with fake price — order created with totalPrice excluding masterclass cost. Fix: server now fetches `masterclassItem.pricePerUnit` from DB by ID and ignores the client value in both the total calculation and the stored record.
- **Finding #4 fixed — enhanced booking min-guest check** — min-guest validation used `guestCount` (total incl. free guests), so a booking with `guestCount: 10` but `tastingGuestCount: 0, lunchGuestCount: 0` passed validation with `totalPrice: 0`. Fix: enhanced bookings now validate `tastingGuestCount + lunchGuestCount` against the minimum.

### Key files changed
- `saas/lib/requireAdmin.ts` — NEW: Supabase auth check helper
- `saas/app/actions/siteContent.ts` — requireAdmin on saveContent, saveContentSection, deleteContent
- `saas/app/actions/settings.ts` — requireAdmin on updateSetting
- `saas/app/actions/blockedDates.ts` — requireAdmin on addBlockedDate, removeBlockedDate
- `saas/app/actions/companies.ts` — requireAdmin on createCompany, updateCompany, deleteCompany
- `saas/app/actions/orders.ts` — requireAdmin on all 6 write functions
- `saas/app/actions/wines.ts` — requireAdmin on createWine, updateWine, deleteWine
- `saas/app/actions/wineOrders.ts` — requireAdmin on updateWineOrderStatus
- `saas/app/actions/prices.ts` — requireAdmin on createPrice, updatePrice, deletePrice
- `saas/app/actions/masterclassItems.ts` — requireAdmin on all 3 write functions
- `saas/app/actions/menuItems.ts` — requireAdmin on all 3 write functions
- `saas/app/actions/orderExtras.ts` — requireAdmin on addOrderExtra, removeOrderExtra
- `saas/app/actions/orderMasterclass.ts` — requireAdmin on addMasterclassLine, removeMasterclassLine
- `saas/app/actions/createBooking.ts` — DB-fetched masterclass prices; paying-guest min check

### Remaining (minor — no security/pricing risk)
- **#5** `hasDbValue` false-negative in EditableText when empty string saved
- **#6** No `revalidatePath` in `saveContent`/`deleteContent`
- **#7** EditableText outer `<div>` wrapper breaks HTML semantics for inline elements

### Next up
- User test the editor — edit a nav label, a button, a paragraph; confirm it shows on live site
- Fix date filters on admin orders (KnownBugs #1)
- Gallery page (images already in `public/images/`, just need wiring)
- Minor fixes #5–#7 from security plan when convenient

---

## 2026-06-01 — Dual-mode site content editor (full detail)

### Completed
- **Dual-mode content editor** — `/admin/content` now has **Text** mode (flat labeled list per section: Navigation / Home / About / Contact) and **Visual** mode (full faithful page preview — nav bar + page body — with every hardcoded string editable inline via hover+click).
- **New SiteContent keys** — added ~25 new keys for strings previously locked in `lib/t.ts`: nav labels (`nav_home`, `nav_about`, `nav_wines`, `nav_contact`, `nav_book`), button text (`home_book_btn`, `home_order_wine_btn`, `about_cta_btn`, `contact_book_btn`), page headings (`about_eyebrow`, `about_heading`, `contact_eyebrow`, `contact_heading`, etc.), card notes, directions text, CTAs.
- **Public pages wired** — `app/(site)/page.tsx`, `about/page.tsx`, `contact/page.tsx` all check `SiteContent` first with `t()` as fallback, so edits in admin now show on the live site.
- **SiteNav wired** — `(site)/layout.tsx` fetches `getContentMap('nav', locale)` and passes to `SiteNav`; nav labels + "Book a Visit" button now DB-backed.
- **Visual mode details**: framed in a rounded border with drop shadow; nav links are inert (not navigating away); booking form shows as a visual placeholder (`pointer-events-none`); `Navigation` tab hidden in visual mode (nav always shown at top of each preview).

### Key files changed
- `saas/app/admin/content/ContentClient.tsx` — full rewrite with mode switcher, FIELDS schema, TextMode, VisualNav, VisualHome, VisualAbout, VisualContact
- `saas/app/(site)/layout.tsx` — fetches nav content map, passes to SiteNav
- `saas/app/(site)/SiteNav.tsx` — accepts `navContent` prop, uses DB values with t() fallback
- `saas/app/(site)/page.tsx` — hero buttons + booking heading use new SiteContent keys
- `saas/app/(site)/about/page.tsx` — eyebrow, heading, expect heading, CTA from SiteContent
- `saas/app/(site)/contact/page.tsx` — eyebrow, heading, card notes, directions, CTA from SiteContent

### Extended (same session — notes from Max)
- **"Kakheti, Georgia" eyebrow** — was hardcoded, now editable via `home_location_eyebrow` key
- **Contact card headers** (Phone / Email / Location / Cancellation) — now editable via `contact_label_*` keys; wired to live contact page
- **Booking form preview in visual mode** — replaced gray placeholder with full form structure: Booking Type toggles, Visit Type options, Date, Time Slot, Number of Guests, First Name, Last Name, Phone, Email, "Request Booking" button, cancel policy text — all labels editable in-place
- **BookingForm wired** — accepts `formContent` prop; `fc()` helper uses DB value with `t()` fallback for all 14 visible labels; home page fetches `getContentMap('form', locale)` and passes it down
- **Form section tab** added to Text mode (Navigation / Home / Form / About / Contact)
- **Reset to default** — `↺` badge on `EditableText` hover (only when DB value exists); tooltip previews fallback text; click calls `deleteContent` action; value snaps to fallback; "↺ Reset to default" flash. `deleteContent` added to `siteContent.ts`.

### Key files changed (full session)
- `saas/app/admin/content/ContentClient.tsx` — full rewrite × 2: dual-mode editor, FIELDS schema, VisualNav, VisualHome, VisualAbout, VisualContact, VisualFormPreview, TextMode
- `saas/components/EditableText.tsx` — reset badge + tooltip + `deleteContent` call; `hasDbValue` guard
- `saas/app/actions/siteContent.ts` — `deleteContent` action added
- `saas/app/(site)/layout.tsx` — fetches nav content map, passes to SiteNav
- `saas/app/(site)/SiteNav.tsx` — `navContent` prop; DB-backed nav labels + book button
- `saas/app/(site)/page.tsx` — `home_location_eyebrow`, hero buttons, book heading, `formContent` fetch + BookingForm prop
- `saas/app/(site)/about/page.tsx` — eyebrow, heading, expect heading, CTA from SiteContent
- `saas/app/(site)/contact/page.tsx` — eyebrow, heading, card headers + notes + directions + CTA from SiteContent
- `saas/components/BookingForm.tsx` — `formContent` prop, `fc()` helper, all visible labels DB-backed

### Next up
- **Security & bug fixes** — see `vault/Plan-SecurityAndBugFixes.md` (7 items, 2 critical)
- User test the editor — edit a nav label, a button, a paragraph; confirm it shows on live site
- Gallery page (images already in `public/images/`, just need wiring)
- Fix date filters on admin orders (KnownBugs #1)

---

## 2026-05-28 — Session 3 (full detail)

### Completed
- **Settings page — Georgian text replaced with English** — payment field labels, section header, and email placeholder were in Georgian; all switched to English. Translations saved to `vault/Features/Add Language/Georgian Translations.md` for future i18n work.
- **Calendar view** — Table/Calendar toggle on orders page; custom month grid (no library); booking count badge per day (wine red); click day → switches to table filtered to that date; today highlighted.
- **Calendar day hover preview** — Obsidian-style popover on day cells shows all orders for that day: name, time, guests, visit type, status (colour-coded), company, total. 200ms delay; right-aligns for cols 4–6 to avoid clipping; stays open when hovering onto the card.
- **Export orders to CSV** — "Export CSV" button in filter bar; respects active filters; downloads `orders-YYYY-MM-DD.csv`; 13 columns.
- **Configurable min guests per visit type** — Settings → Booking Rules section; two number inputs (Wine Tasting / Tasting + Lunch); saves on blur; enforced in BookingForm (dynamic min, inline warning) and createBooking (server guard); package cards on home page show dynamic minimum.
- **Fix: home page min guests static** — added `export const dynamic = 'force-dynamic'` to `app/(site)/page.tsx`; home page now re-fetches settings on each request instead of baking values at build time.
- **Block dates (closed days)** — new `BlockedDate` DB model (prisma db push); Settings → Closed Days section; date picker + optional reason + block button; list with × remove; public form shows inline error when blocked date selected; createBooking guards server-side.
- **Shimmer loading skeleton** — `loading.tsx` in `/admin/orders` shows a warm brown shimmer skeleton (header + filter bar + 9 rows) during page navigation. `@keyframes shimmer` in globals.css.
- **Smooth scroll on "Book a Visit"** — `scroll-behavior: smooth` added to `html` in globals.css.
- **Status filter** — Status dropdown in orders filter bar; all 6 statuses (NEW/CONFIRMED/INVOICE_SENT/PAID/COMPLETED/CANCELLED); integrated into all filter queries; `OrderStatus` enum cast fixes TypeScript.
- **Progress bar on filter change** — thin wine-red progress bar animates under filter bar while navigating (`@keyframes nav-progress`); filter bar dims to 60% opacity. Uses `useState` + `useEffect` watching params (not `useTransition` — more reliable for concurrent updates).
- **Fix: status filter intermittent** — replaced `startTransition(router.push)` with direct `router.push` + `useState/useEffect` approach; navigation is no longer a low-priority concurrent update that could be dropped.
- **Status counts in dropdown** — status dropdown shows live counts per status within the current date/company filter context: "New (12)", "Confirmed (3)" etc.; options with 0 orders are disabled (greyed out). Uses `db.order.groupBy` on a `baseWhere` that ignores the status filter itself.

### Key files changed this session
- `saas/app/admin/orders/page.tsx` — view param, calendar data, baseWhere + groupBy for statusCounts, CalendarView + ViewToggle integration; `include` on orders query fixed with `OrderStatus` cast
- `saas/app/admin/orders/CalendarView.tsx` — NEW: month grid + hover popover
- `saas/app/admin/orders/ViewToggle.tsx` — NEW: Table/Calendar toggle (no useSearchParams — receives params as props)
- `saas/app/admin/orders/OrdersFilters.tsx` — Export CSV button, status filter, progress bar, status counts, shimmer/loading state
- `saas/app/admin/orders/loading.tsx` — NEW: shimmer skeleton
- `saas/app/actions/orders.ts` — `exportOrdersCsv` action; `OrderStatus` cast on status filter
- `saas/app/admin/settings/page.tsx` — min guest settings + blocked dates fetch
- `saas/app/admin/settings/SettingsClient.tsx` — Booking section header, Booking Rules section, Closed Days section
- `saas/app/actions/settings.ts` — two new defaults
- `saas/app/actions/blockedDates.ts` — NEW: getBlockedDates, addBlockedDate, removeBlockedDate
- `saas/prisma/schema.prisma` — BlockedDate model added
- `saas/components/BookingForm.tsx` — dynamic minGuests props, blockedDates prop, inline blocked date error
- `saas/app/(site)/page.tsx` — force-dynamic, min guest + blocked dates fetch + BookingForm props
- `saas/app/actions/createBooking.ts` — server-side blocked date + min guest validation
- `saas/app/globals.css` — smooth scroll, shimmer keyframes, nav-progress keyframes

### Bugs fixed / lessons learned
- `useSearchParams()` in client components without a `<Suspense>` boundary crashes the entire page in Next.js App Router production builds (passes build, fails at runtime). Fix: remove `useSearchParams`, receive params as props from the server component instead.
- `startTransition(router.push)` makes navigation a low-priority concurrent update that can be interrupted. Fix: call `router.push` directly.
- Prisma `where` clause with a union type spread causes cascading type errors on `include` results — fix with `as OrderStatus` cast on the string param.
- Home page with settings-dependent content must have `export const dynamic = 'force-dynamic'` or values are baked in at build time.

- **Fix: calendar hover preview** — `e.currentTarget` is nullified by React after the event handler returns, so calling `.getBoundingClientRect()` inside a `setTimeout` always failed silently. Fixed by capturing `const target = e.currentTarget` before the timeout.

- **Wine description field** — `description String?` on Wine model; textarea in admin edit+add forms; shown on card below type/price
- **Wine orders status stepper** — Pending → Confirmed → Paid → Delivered (4 stages); active step has glow ring + bold label; inactive steps faded; stepper centered in col 3; optimistic UI; `updateWineOrderStatus` server action
- **Wine order ID on card** — `#xxxxxxxx` monospace badge (first 8 chars of cuid)
- **Wine order total amount** — `totalAmount Float?` on WineOrder schema; price now stored per wine in JSON (`{id, name, quantity, price}`); total computed in `submitWineOrder`; displayed on admin card
- **Schema**: `prisma db push` done — both Wine.description and WineOrder.totalAmount columns live in DB

### Key files changed this session
- `saas/prisma/schema.prisma` — Wine.description + WineOrder.totalAmount added
- `saas/app/actions/wines.ts` — description param added to createWine/updateWine
- `saas/app/actions/wineOrders.ts` — NEW: updateWineOrderStatus
- `saas/app/actions/submitWineOrder.ts` — price per wine in JSON; totalAmount computed and saved
- `saas/app/(site)/wines/WineCatalogueClient.tsx` — price included in wines JSON on submit
- `saas/app/admin/wines/WinesClient.tsx` — description type, edit form textarea, display on card
- `saas/app/admin/wine-orders/WineOrdersClient.tsx` — NEW: status stepper client component
- `saas/app/admin/wine-orders/page.tsx` — now delegates to WineOrdersClient

### Bugs fixed / lessons learned
- Wine order JSON was missing `price` per bottle — amounts couldn't be computed without it. Fixed at submission time; old orders will show `—` for total (totalAmount is nullable).

- **Wine orders card layout redesign** — 3-column layout: col 1 (name/company/tags/address/contact), col 2 (amount/hours/phone, centered), col 3 (stepper); colored border on right edge matching status; status filter pills with solid color when selected; cancel order button removed; card width narrowed (`max-w-3xl`)

### Key files changed (wine orders redesign — 2026-05-28)
- `saas/app/admin/wine-orders/WineOrdersClient.tsx` — full layout redesign + stepper improvements + delivered status + filter pills
- `saas/app/admin/wine-orders/page.tsx` — max-w-5xl → max-w-3xl

- **Wine order statistics** — mode switcher (Bookings / Wine Orders pill toggle) on Statistics page; `WineStatistics.tsx` new component; 4 summary cards (total orders, total revenue, active orders, avg order value); year/month filter; status breakdown bars (5 statuses with matching colors from wine orders page); revenue by month/day chart; top wines by bottles ordered (bar chart aggregated from JSON); top customers by spend; all data fetched server-side in `statistics/page.tsx` using same displayTotal fallback logic as wine-orders page.

### Key files changed (wine order stats — 2026-05-29)
- `saas/app/admin/statistics/page.tsx` — added `db.wineOrder.findMany` + `db.wine.findMany`; wineOrders array with displayTotal computed server-side; passed as `wineOrders` prop
- `saas/app/admin/statistics/StatisticsClient.tsx` — added `mode` state (`bookings` | `wine`); pill switcher UI; renders `<WineStatistics>` when wine mode active; `wineOrders` prop added
- `saas/app/admin/statistics/WineStatistics.tsx` — NEW: full wine stats client component

### Next up
- **Fix date filters** on admin orders (KnownBugs #1) — date range filter doesn't work
- **Verify nikalasmarani.ge in Resend** — until done, invoice emails only deliver to max.mghvdliashvili@gmail.com, not real customers
- **Gallery page** — images already in `public/images/`, need to wire into public site
- **Send invoice by email — PDF attachment** — follow-up to HTML email; attach a PDF so customers get a proper document

---

## 2026-05-28 — Session 1 (compressed)

Settings text English; calendar view + hover preview; export CSV; configurable min guests; block dates; shimmer loading; smooth scroll; status filter + counts; progress bar on filter change.

---

## 2026-05-27 — Previous session (compressed)

Print invoice fixes (blank page, Georgian typos, payment section, 2-page bug); Vercel CLI set up; Supabase RLS on all 10 tables; Enhanced company booking Steps 4–6 (order detail page, admin create order, public form toggle with split counts/hot dishes/masterclass/live price breakdown).

---

## 2026-05-26 — Split pricing, Wine CRUD, company ID code, payment settings, print invoice

---

## Older sessions (compressed)

- 2026-05-22 — Statistics V2, logo rollout, 11 winery images downloaded, wine image assignment, email confirmation (Resend sandbox), admin mobile responsiveness, error states
- 2026-05-19 — Built public site (About, Contact, Wines catalogue), SiteNav, hamburger menu, WineOrder DB model, admin Wine Orders tab, brand assets (SVG logo, icons), deployed to Vercel
- 2026-05-18 — Order edit/delete slide-over, filter fixes (individuals only, upcoming), dedup script, preview server setup
- 2026-05-17 — Orders list, companies CRUD, price tiers with validations, seed script, statistics page, nav fixes
- 2026-05-17 — Scaffolded saas app, Supabase connected, booking form built, admin auth
- 2026-05-16 — GitHub Pages live, repo restructured, React Flow dashboard, project kickoff, vault created
