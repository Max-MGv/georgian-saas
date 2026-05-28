---
tags: [log]
---

# Session Log

Most recent 2 sessions in full detail. Older entries compressed to one line.

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
- **Wine orders status stepper** — Pending → Confirmed → Paid + Cancel/Restore; optimistic UI update; `updateWineOrderStatus` server action in `app/actions/wineOrders.ts`
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
