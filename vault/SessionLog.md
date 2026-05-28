---
tags: [log]
---

# Session Log

Most recent 2 sessions in full detail. Older entries compressed to one line.

---

## 2026-05-27 — Latest session (full detail)

### Completed
- **Print invoice fixes** — blank page fixed (React portal); Georgian typos fixed; payment section always shown; 2-page bug fixed
- **Vercel CLI set up** — installed globally, logged in as `max-mgv`, linked to `mg-productions-projects/georgian-saas`
- **Supabase RLS** — enabled Row Level Security on all 10 tables
- **Enhanced company booking — Steps 1–3** — DB schema, Menu Items admin, Masterclass admin (all done prior)
- **Enhanced company booking — Step 4** — `/admin/orders/[id]` detail page with editable guest counts, hot dish, masterclass, extras, live total, tier-in-use banner
- **Enhanced company booking — Step 5** — `/admin/orders/new` + `createOrderAdmin` action; "New Order" button on orders list; TC2+TC7 bugs fixed (individual manual rate calc, zero-paying-guest fallback)
- **Enhanced company booking — Step 6** — Public form toggle:
  - `enable_enhanced_company_booking` setting added (default `false`)
  - Toggle in `/admin/settings` under Booking section
  - `BookingForm` extended: when toggle on + company selected → split guest counts (tasting/lunch/free), hot dish dropdowns (TASTING_LUNCH only), masterclass add-ons with quantity, food notes, live price breakdown
  - `createBooking` extended: accepts enhanced fields, uses `findTier` for split-count pricing, creates `OrderMasterclass` lines
  - Individual bookings always use the simple form regardless of toggle

### Key files changed this session
- `saas/app/actions/settings.ts` — `enable_enhanced_company_booking` default added
- `saas/app/admin/settings/page.tsx` — fetches + passes new setting
- `saas/app/admin/settings/SettingsClient.tsx` — second booking toggle
- `saas/app/(site)/page.tsx` — fetches menuItems + masterclassItems, passes to BookingForm
- `saas/components/BookingForm.tsx` — enhanced company mode (split counts, hot dishes, masterclass, food notes, live price breakdown)
- `saas/app/actions/createBooking.ts` — extended for enhanced fields + masterclass lines
- `saas/app/admin/orders/new/page.tsx` — NEW (Step 5)
- `saas/app/admin/orders/new/NewOrderForm.tsx` — NEW (Step 5)
- `saas/app/actions/orders.ts` — createOrderAdmin added (Step 5); updateOrderEnhanced + manual rates (Step 4)
- `saas/app/admin/orders/page.tsx` — "+ New Order" button (Step 5)

### Known local issue
Prisma client stale on Windows (DLL lock). Fix: Ctrl+C dev server → `npx prisma generate` → restart.

### Next up
- **Step 7 — Invoice updates**: split guest counts + masterclass/extras as line items on printed invoice
- **Fix date filters** on admin orders (KnownBugs #1)
- **Gallery page** — wire up slider/gallery photos on public site
- **Send invoice by email** — Resend + PDF generation
- Verify nikalasmarani.ge in Resend

---

## 2026-05-26 — Previous session (full detail)

### Completed
- **Split company pricing** — added `tastingLunchPricePerPerson` to `Price` model; companies CRUD shows two price inputs per tier (Tasting ₾/pp and +Lunch ₾/pp); `createBooking` picks the correct rate based on `visitType`
- **Wine DB model + admin CRUD** — `Wine` model added to Prisma schema; full CRUD at `/admin/wines` with inline image picker in edit row; 6 product images assignable per wine; wine edit row images shown at 0.35 opacity if used by another wine
- **`/wines` page fixed** — was pre-rendered as static (○) on Vercel; fixed with `export const dynamic = 'force-dynamic'`; new wines now appear immediately after adding
- **Company identification code** — `identificationCode String?` added to `Company` model; shown as second input in companies edit row alongside name; displayed in list row if set; passed to invoice
- **Payment details in settings** — 5 bank/payment fields (`payment_recipient_name`, `payment_personal_number`, `payment_bank_name`, `payment_bank_code`, `payment_iban`) added to Settings DEFAULTS; editable on `/admin/settings` in a new "გადახდის რეკვიზიტები" section; saves on blur
- **Print invoice (complete)** — printer SVG icon on every order row; click sets `printOrder` state; `useEffect` fires `window.print()` after 100ms; `<InvoicePrint>` renders off-screen (position fixed, opacity 0); `@media print` in `globals.css` hides everything except `.invoice-print`; Georgian-language invoice layout: header (ნიკალას მარანი), ინვოისი title, კომპანია section, სადილი/დეგუსტაცია sections (unused shows 0), თანხა with total, გადახდის რეკვიზიტები at bottom

### Key files changed
- `saas/prisma/schema.prisma` — `Company.identificationCode String?`, `Price.tastingLunchPricePerPerson Float @default(0)`, `Wine` model (new)
- `saas/app/actions/companies.ts` — `identificationCode` param in create/update
- `saas/app/actions/prices.ts` — `tastingLunchPricePerPerson` in create/update
- `saas/app/actions/createBooking.ts` — rate picker by `visitType`
- `saas/app/actions/settings.ts` — 5 payment keys in DEFAULTS
- `saas/app/actions/wines.ts` — NEW: `createWine`, `updateWine`, `deleteWine`
- `saas/app/admin/companies/CompaniesClient.tsx` — ID code input, split price tiers display
- `saas/app/admin/wines/page.tsx` — NEW: server component
- `saas/app/admin/wines/WinesClient.tsx` — NEW: full CRUD with inline image picker
- `saas/app/admin/settings/page.tsx` — fetches 5 payment settings
- `saas/app/admin/settings/SettingsClient.tsx` — Payment Details section (5 inputs, save on blur)
- `saas/app/admin/orders/page.tsx` — fetches 5 payment settings + `identificationCode`; passes both to OrdersTable
- `saas/app/admin/orders/InvoicePrint.tsx` — NEW: Georgian invoice layout component
- `saas/app/admin/orders/OrdersTable.tsx` — `payment` prop, `printOrder` state, printer icon button, hidden InvoicePrint div
- `saas/app/(site)/wines/page.tsx` — `export const dynamic = 'force-dynamic'`
- `saas/app/(site)/wines/WineCatalogueClient.tsx` — reads from DB (`DbWine` prop), uses `imagePath` with color-gradient fallback
- `saas/app/globals.css` — `@media print` rules
- `saas/app/admin/layout.tsx` — Wines link in nav (Images link removed)
- `saas/scripts/seed.ts` — wine seeding (skips if wines exist)

### Pending user tests
- Print invoice on a real order (features #30–32)
- Split company pricing on new booking (feature #33)
- Wine CRUD + image assignment (feature #34)
- Order delete confirm (feature #5)
- Wine Orders admin tab (feature #15)
- Admin mobile responsiveness (feature #19)
- Statistics V2 (feature #26)

### Next up (priority order)
1. **Enhanced company booking — Step 1**: DB schema (new models + fields) → `prisma db push`
2. **Enhanced company booking — Step 2**: Menu Items admin panel
3. **Enhanced company booking — Step 3**: Masterclass admin panel
4. **Enhanced company booking — Step 4**: Clickable order detail page
5. **Enhanced company booking — Step 5**: Admin create order
6. **Enhanced company booking — Step 6**: Public form toggle
7. Fix date filters on admin orders (KnownBugs #1)
8. Verify nikalasmarani.ge domain in Resend
9. Gallery page — wire up downloaded photos on public site

---

## 2026-05-22 — Previous session (full detail)

### Completed
- **Statistics V2 wired up** — `StatisticsClient.tsx` defaults to V2 (upcoming cards, year/month/company filters, horizontal bar charts); "Show historical breakdown →" toggles V1; "← Back" returns
- **Logo replaces text** — `Nikalas Marani` text → `logo-dark.svg` in: home page hero (80px), wine catalogue (56px), admin login (56px), admin nav bar (28px)
- **Winery images downloaded** — 11 images from nikalasmarani.ge via PowerShell `Invoke-WebRequest`; saved to `saas/public/images/slider/` (3), `gallery/` (2), `products/` (6 wine bottles)
- **Wine image assignment** — inline in wine edit row; admin clicks thumbnail → `updateWine` saves `imagePath` immediately; images used by other wines shown at 0.35 opacity
- **Email confirmation** — Resend sandbox; sends to max.mghvdliashvili@gmail.com only until domain verified

### Key files changed
- `saas/app/admin/statistics/StatisticsClient.tsx`, `StatisticsV2.tsx` (NEW), `statistics/page.tsx`
- `saas/app/(site)/page.tsx` — logo in hero
- `saas/app/(site)/wines/WineCatalogueClient.tsx` — logo + real photos
- `saas/app/admin/login/page.tsx`, `saas/app/admin/layout.tsx` — logos
- `saas/public/images/` — 11 images added

---

## Older sessions (compressed)

- 2026-05-19 — Built public site (About, Contact, Wines catalogue), SiteNav, hamburger menu, WineOrder DB model, admin Wine Orders tab, brand assets (SVG logo, icons), deployed to Vercel
- 2026-05-18 — Order edit/delete slide-over, filter fixes (individuals only, upcoming), dedup script, preview server setup
- 2026-05-17 — Orders list, companies CRUD, price tiers with validations, seed script, statistics page, nav fixes
- 2026-05-17 — Scaffolded saas app, Supabase connected, booking form built, admin auth
- 2026-05-16 — GitHub Pages live, repo restructured, React Flow dashboard, project kickoff, vault created
