---
tags: [features]
---

# Feature Log

| # | Feature | Area | Status | Claude tested | User tested |
|---|---|---|---|---|---|
| 1 | Booking form (public) | Public site | ✅ Done | ✅ Yes | ✅ Yes |
| 2 | Admin auth (login/logout/middleware) | Admin | ✅ Done | ✅ Yes | ✅ Yes |
| 3 | Orders list with filters | Admin | ✅ Done | ✅ Yes | ✅ Yes |
| 4 | Order edit slide-over | Admin | ✅ Done | ✅ Yes | ✅ Yes |
| 5 | Order delete with confirm | Admin | ✅ Done | ✅ Yes | ❌ No |
| 6 | Companies CRUD | Admin | ✅ Done | ✅ Yes | ✅ Yes |
| 7 | Price tiers per company | Admin | ✅ Done | ✅ Yes | ✅ Yes |
| 8 | Seed script | Dev | ✅ Done | ✅ Yes | ✅ Yes |
| 9 | Statistics page | Admin | ✅ Done | ✅ Yes | ✅ Yes |
| 10 | Vercel deploy | Infra | ✅ Done | ✅ Yes | ✅ Yes |
| 11 | About page | Public site | ✅ Done | ✅ Yes | ✅ Yes |
| 12 | Contact page | Public site | ✅ Done | ✅ Yes | ✅ Yes |
| 13 | Order Wine page (catalogue + reservation form) | Public site | ✅ Done | ✅ Yes | ✅ Yes |
| 14 | Wine orders saved to DB | DB | ✅ Done | ✅ Yes | ✅ Yes |
| 15 | Wine Orders admin tab | Admin | ✅ Done | ✅ Yes | ❌ No |
| 16 | Shared nav + footer (route group) | Public site | ✅ Done | ✅ Yes | ✅ Yes |
| 17 | Mobile nav (hamburger menu) | Public site | ✅ Done | ✅ Yes | ✅ Yes |
| 18 | iOS Safari zoom fix | Public site | ✅ Done | ✅ Yes | ✅ Yes |
| 19 | Admin mobile responsiveness | Admin | ✅ Done | ✅ Yes | ❌ No |
| 20 | Error states & loading indicators | Admin + Public | ✅ Done | ✅ Yes | ❌ No |
| 21 | Email confirmation on booking (Resend sandbox) | Public site | ✅ Done | ✅ Yes | ✅ Yes |
| 22 | Guest count input fix (string state + min clamp) | Public site | ✅ Done | ✅ Yes | ❌ No |
| 23 | Time slot fix (block past hours on today) | Public site | ✅ Done | ✅ Yes | ❌ No |
| 24 | Admin settings panel (`/admin/settings`) | Admin | ✅ Done | ✅ Yes | ❌ No |
| 25 | Company rate privacy (hide on form, show post-submission toggle) | Public site + Admin | ✅ Done | ✅ Yes | ❌ No |
| 26 | Statistics V2 (upcoming cards, year/month/company filters, horizontal bar charts) | Admin | ✅ Done | ✅ Yes | ❌ No |
| 27 | Logo replaces "Nikalas Marani" text in hero, wine catalogue, admin login, admin nav | Public site + Admin | ✅ Done | ✅ Yes | ❌ No |
| 28 | Winery images downloaded from nikalasmarani.ge → `public/images/` | Assets | ✅ Done | ✅ Yes | ❌ No |
| 29 | Wine image assignment — inline in wine edit row; `imagePath` on Wine model; catalogue shows real photos with color-gradient fallback | Admin + Public site | ✅ Done | ✅ Yes | ❌ No |
| 30 | Company identification code field — `identificationCode` on Company model, editable in CRUD, shown on invoices | Admin | ✅ Done | ✅ Yes | ❌ No |
| 31 | Payment details in settings — 5 bank fields editable in `/admin/settings` (saves on blur), shown on printed invoices | Admin | ✅ Done | ✅ Yes | ❌ No |
| 32 | Print invoice — printer icon on each order row; Georgian-language invoice via browser print dialog; `@media print` isolates invoice | Admin | ✅ Done | ✅ Yes | ❌ No |
| 33 | Split company pricing — separate tasting vs tasting+lunch price per tier; booking picks correct rate by `visitType` | Admin + Public site | ✅ Done | ✅ Yes | ❌ No |
| 34 | Wine DB model + admin CRUD (`/admin/wines`) — create/edit/delete wines, inline image picker, sort order, active toggle | Admin + Public site | ✅ Done | ✅ Yes | ❌ No |
| 35 | Enhanced booking DB schema (Step 1) — split guest counts (lunchGuests/tastingGuests/freeGuests), MenuItem, MasterclassItem, OrderMasterclass, OrderExtra models added to Prisma | DB | ✅ Done | ✅ Yes | ❌ No |
| 36 | Menu Items admin (`/admin/menu-items`) — CRUD for vegetable/meat hot dish options with active toggle and sort order | Admin | ✅ Done | ✅ Yes | ❌ No |
| 37 | Masterclass admin (`/admin/masterclass`) — CRUD for masterclass types with MasterclassUnit enum (PER_PERSON/PER_PIECE/FLAT) and price per unit | Admin | ✅ Done | ✅ Yes | ❌ No |
| 38 | Enhanced booking order detail page (Step 4) — `/admin/orders/[id]` clickable detail; editable split guest counts, hot dish, masterclass add-ons, extras, live total recalc, tier-in-use banner | Admin | ✅ Done | ✅ Yes | ❌ No |
| 39 | Admin create order (Step 5) — `/admin/orders/new` + `createOrderAdmin` action; "New Order" button on orders list; individual manual rate calc; zero-paying-guest fallback | Admin | ✅ Done | ✅ Yes | ❌ No |
| 40 | Enhanced booking public form toggle (Step 6) — `enable_enhanced_company_booking` setting; when on + company selected → split guest counts, hot dish dropdowns, masterclass add-ons, food notes, live price breakdown | Admin + Public site | ✅ Done | ✅ Yes | ❌ No |
| 41 | Invoice simple/detailed print toggle (Step 7) — Simple/Detailed toggle on print picker; detailed shows split guest counts, masterclass lines, extras, itemised amount breakdown | Admin | ✅ Done | ✅ Yes | ❌ No |
| 42 | Vercel CLI connected — `npx vercel ls` and `npx vercel logs` available for build/runtime debugging | Dev | ✅ Done | ✅ Yes | ✅ Yes |
| 43 | Supabase RLS enabled on all 10 tables | Security | ✅ Done | ✅ Yes | ✅ Yes |
| 44 | Send invoice by email — envelope icon on each order row opens modal; admin edits/confirms message + recipient; sends HTML invoice via Resend; default message editable in Settings → Emails | Admin | ✅ Done | ✅ Yes | ❌ No |
| 45 | Invoice UI improvements — consistent brown palette; values bold 600 vs labels normal 400; WebKit data-detector color fix on monospace values (IBAN etc.) | Admin | ✅ Done | ✅ Yes | ❌ No |
| 46 | Order status tracking — pipeline statuses (NEW/CONFIRMED/COMPLETED/CANCELLED); yellow NEW badge; status editable on detail page; null-safe lookup | Admin | ✅ Done | ✅ Yes | ❌ No |
| 47 | Hover preview card — Obsidian-style floating popover on order row hover shows key order details without opening full detail page | Admin | ✅ Done | ✅ Yes | ❌ No |
| 48 | Configurable columns — hide/show toggle dropdown on orders table; sticky actions column on scroll; Edit/Delete replaced with pen + trash icons; dropdown stays open on click | Admin | ✅ Done | ✅ Yes | ❌ No |
| 49 | Rate UI improvements — individual rate inputs moved into Guest Breakdown section; both rates always visible; collapse after save; prominent save button; default 50₾/pp | Admin | ✅ Done | ✅ Yes | ❌ No |
| 50 | Calendar view — Table/Calendar toggle on orders page; month grid built from scratch; booking count badge per day; click day → filters table to that date | Admin | ✅ Done | ✅ Yes | ❌ No |
| 51 | Export orders to CSV — "Export CSV" button in orders filter bar; mirrors active filters; downloads dated .csv file | Admin | ✅ Done | ✅ Yes | ❌ No |
| 52 | Configurable min guests per visit type — `min_guests_tasting` and `min_guests_tasting_lunch` settings; editable in Settings → Booking Rules; enforced on public form and in createBooking action | Admin + Public site | ✅ Done | ✅ Yes | ❌ No |
| 53 | Block dates (closed days) — `BlockedDate` DB model; admin adds/removes dates in Settings → Closed Days; public booking form blocks selection and shows error; createBooking guards server-side | Admin + Public site | ✅ Done | ✅ Yes | ❌ No |
| 54 | Calendar day hover preview — popover on calendar day cells shows all orders for that day with status colours; 200ms delay; auto right-aligns on right-side columns to avoid clipping | Admin | ✅ Done | ✅ Yes | ❌ No |
| 55 | Shimmer loading skeleton — `loading.tsx` in `/admin/orders` shows warm brown shimmer skeleton during filter navigation (header + filter bar + 9 table rows) | Admin | ✅ Done | ✅ Yes | ❌ No |
| 56 | Progress bar on filter change — thin wine-red bar animates under filter row while navigation is in flight; filter bar dims to 60% opacity | Admin | ✅ Done | ✅ Yes | ❌ No |
| 57 | Smooth scroll on "Book a Visit" — `scroll-behavior: smooth` on `html` element | Public site | ✅ Done | ✅ Yes | ❌ No |
| 58 | Status filter — Status dropdown in orders table filter bar; all 6 pipeline statuses; integrated into all server queries | Admin | ✅ Done | ✅ Yes | ❌ No |
| 59 | Status counts in dropdown — each status option shows live order count within current date/company context; options with 0 orders disabled; total shown in "All statuses" option | Admin | ✅ Done | ✅ Yes | ❌ No |
| 60 | Wine description field — `description String?` added to Wine model; editable textarea in admin wine edit+add forms; shown as body text on wine card in admin | Admin | ✅ Done | ✅ Yes | ❌ No |
| 61 | Wine orders — editable status stepper — 4-stage stepper (Pending → Confirmed → Paid → Delivered); optimistic UI; `updateWineOrderStatus` server action; active step highlighted with glow + bold label; inactive steps faded | Admin | ✅ Done | ✅ Yes | ❌ No |
| 62 | Wine orders — order ID on card — first 8 chars of ID shown as monospace `#xxxxxxxx` badge | Admin | ✅ Done | ✅ Yes | ❌ No |
| 63 | Wine orders — total amount — `totalAmount Float?` on WineOrder; price stored per wine in JSON; total computed on submission and displayed on admin card | Admin + Public site | ✅ Done | ✅ Yes | ❌ No |
| 64 | Wine orders — card layout redesign — 3-column layout (info / price+hours+phone / stepper); colored status border on right edge; status filter pills (All/Pending/Confirmed/Paid/Delivered/Cancelled) with solid color when selected matching border colors | Admin | ✅ Done | ✅ Yes | ❌ No |
| 65 | Wine order statistics — mode switcher on Statistics page (Bookings / Wine Orders toggle); wine stats: 4 summary cards, status breakdown bars, revenue by month chart, top wines by bottles, top customers by spend | Admin | ✅ Done | ✅ Yes | ❌ No |
| 66 | Editable site content — dual-mode editor at `/admin/content`: **Text** mode (flat labeled list; sections: Navigation / Home / Form / About / Contact) + **Visual** mode (full live page replica — nav bar + page body — with inline `EditableText` on every hardcoded string). Covers: nav labels, hero buttons, package titles/descriptions, booking section, form field labels + submit button + cancel policy, about story paragraphs + cards + CTA, contact card headers/values/notes/directions/CTA. All wired to live site: `SiteNav`, `BookingForm`, and all public pages use DB values with `t()` fallback. | Admin + Public site | ✅ Done | ✅ Yes | ❌ No |
| 67 | Reset to default — per-field ↺ badge on `EditableText` hover (only when a DB value exists); hovering shows tooltip "Reset to: [fallback text]"; clicking calls `deleteContent` server action (deletes DB row), value snaps back to hardcoded fallback, brief "↺ Reset to default" confirmation. No section-level reset (too destructive). | Admin | ✅ Done | ✅ Yes | ❌ No |
| 68 | Fix date filter inputs — date inputs were controlled by server params so they visually reset to old value during navigation, making selection appear lost. Fixed by adding local state (`localDateFrom`/`localDateTo`) that updates instantly on change and syncs with server params once navigation settles. | Admin | ✅ Done | ✅ Yes | ❌ No |
