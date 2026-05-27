---
tags: [log]
---

# Session Log

Most recent 2 sessions in full detail. Older entries compressed to one line.

---

## 2026-05-27 — Latest session (full detail)

### Completed
- **Print invoice fixes** — blank page fixed (React portal renders invoice as direct `<body>` child; `body > * { display: none }` hides Next.js root, `#invoice-portal { display: block }` shows only invoice); Georgian typos fixed (ბანქი→ბანკი); payment section always shown with `—` fallback; 2-page bug fixed
- **Vercel CLI set up** — installed globally, logged in as `max-mgv`, linked to `mg-productions-projects/georgian-saas`; can now run `npx vercel ls` and `npx vercel logs <url>` to see build/runtime output
- **Supabase RLS** — enabled Row Level Security on all 10 tables via SQL editor; blocks direct anon API access without breaking Prisma (service role bypasses RLS)
- **Enhanced company booking — Steps 1–3 complete:**
  - Step 1: DB schema — `Order` gets 6 new fields (lunchGuestCount, tastingGuestCount, freeGuestCount, hotDishVegetable, hotDishMeat, foodNotes); 4 new models (MenuItem, MasterclassItem, OrderMasterclass, OrderExtra)
  - Step 2: `/admin/menu-items` — CRUD for vegetable/meat hot dish options (two sections, active toggle, sort order)
  - Step 3: `/admin/masterclass` — CRUD for masterclass types; `unit String` replaced with `MasterclassUnit` enum (`PER_PERSON` / `PER_PIECE` / `FLAT`); shared types/constants in `lib/masterclass.ts` (fixes Next.js server/client boundary error)

### Key files changed
- `saas/app/admin/orders/InvoicePrint.tsx` — Georgian typos, payment section always shown
- `saas/app/admin/orders/OrdersTable.tsx` — React portal for print
- `saas/app/globals.css` — `@media print` portal approach
- `saas/prisma/schema.prisma` — 4 new models, 6 new Order fields, MasterclassUnit enum
- `saas/app/actions/menuItems.ts` — NEW
- `saas/app/actions/masterclassItems.ts` — NEW (imports from lib/masterclass.ts)
- `saas/app/admin/menu-items/` — NEW: page.tsx + MenuItemsClient.tsx
- `saas/app/admin/masterclass/` — NEW: page.tsx + MasterclassClient.tsx
- `saas/app/admin/layout.tsx` — Menu Items + Masterclass nav links
- `saas/lib/masterclass.ts` — NEW: MasterclassUnit type, UNIT_LABELS, UNIT_DESCRIPTIONS, MASTERCLASS_UNITS

### Known local issue
Prisma client stale on Windows (DLL lock prevented `prisma generate` after schema change). Fix: Ctrl+C dev server → `npx prisma generate` → restart `npm run dev`. Vercel builds correctly (generates fresh each time).

### Next up
**Step 4 — Order detail page** (`/admin/orders/[id]`):
- Make order rows clickable → navigate to detail page
- Server component fetches order + company prices + menu items + masterclass items + existing order lines
- Client component sections: base info (read-only), split guest counts (editable, recalculates total), hot dish dropdowns, masterclass lines (add/remove, quantity), extras (add/remove label+amount), food notes
- `updateOrderEnhanced` server action
- Pricing formula: `(tastingGuests × tastingRate) + (lunchGuests × lunchRate) + registrationPrice + Σ masterclass lines + Σ extras`

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
