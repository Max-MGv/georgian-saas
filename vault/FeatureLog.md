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
| 35 | Menu Items admin (`/admin/menu-items`) — CRUD for vegetable/meat hot dish options with active toggle and sort order | Admin | ✅ Done | ✅ Yes | ❌ No |
| 36 | Masterclass admin (`/admin/masterclass`) — CRUD for masterclass types with MasterclassUnit enum (PER_PERSON/PER_PIECE/FLAT) and price per unit | Admin | ✅ Done | ✅ Yes | ❌ No |
| 37 | Vercel CLI connected — `npx vercel ls` and `npx vercel logs` available for build/runtime debugging | Dev | ✅ Done | ✅ Yes | ✅ Yes |
| 38 | Supabase RLS enabled on all 10 tables | Security | ✅ Done | ✅ Yes | ✅ Yes |
