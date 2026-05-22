---
tags: [log]
---

# Session Log

Most recent 2 sessions in full detail. Older entries compressed to one line.

---

## 2026-05-22 — Previous session (compressed)

- Email confirmation (Resend sandbox), guest count bug fix, time slot past-hours fix, admin settings panel, company rate privacy, Statistics V2 (upcoming cards + filters + horizontal bar charts), vault reorganised as single source of truth

---

## 2026-05-22 — Latest session (full detail)

### Completed
- **Statistics V2 wired up** — `StatisticsClient.tsx` updated to default to V2 view; "Show historical breakdown →" button at bottom switches to V1; "← Back to overview" returns; `orders` and `companies` props threaded through from page
- **Logo replaces text** — `Nikalas Marani` text replaced with `logo-dark.svg` in: home page hero (80px), wine catalogue heading (56px), admin login (56px), admin nav bar (28px + "Admin" label)
- **Winery images downloaded** — 11 images pulled from nikalasmarani.ge via PowerShell `Invoke-WebRequest`; saved to `saas/public/images/slider/` (3 hero photos), `gallery/` (2), `products/` (6 wine bottles)
- **Wine image assignment** — new `/admin/images` page; admin sees all 6 product photo thumbnails, clicks to assign each to a wine listing; mapping stored in `Setting` table as JSON (key: `wine_images`); `updateWineImages` server action added to `settings.ts`; wine catalogue at `/wines` reads mapping and shows real photos, falls back to gradient SVG placeholder if unassigned; Images link added to admin nav

### Key files changed
- `saas/app/admin/statistics/StatisticsClient.tsx` — toggle between V2 (default) and V1
- `saas/app/admin/statistics/StatisticsV2.tsx` — NEW: full V2 component
- `saas/app/admin/statistics/page.tsx` — passes `orders` + `companies` to client
- `saas/app/(site)/page.tsx` — logo in hero
- `saas/app/(site)/wines/WineCatalogueClient.tsx` — logo + `wineImages` prop + real photos
- `saas/app/(site)/wines/page.tsx` — fetches `wine_images` setting, passes to client
- `saas/app/admin/login/page.tsx` — logo
- `saas/app/admin/layout.tsx` — logo in nav + Images link
- `saas/app/admin/images/page.tsx` — NEW: image assignment page (server)
- `saas/app/admin/images/ImageAssignClient.tsx` — NEW: image assignment UI (client)
- `saas/app/actions/settings.ts` — `wine_images` default + `updateWineImages` action
- `saas/public/images/` — 11 images added

### Pending user tests
- Order delete confirm (feature #5)
- Wine Orders admin tab (feature #15)
- Admin mobile responsiveness (feature #19)
- Error states & loading indicators (feature #20)
- Time slot fix (feature #23)
- Admin settings panel (feature #24)
- Company rate privacy (feature #25)
- Statistics V2 (feature #26)
- Logo replacements (feature #27)
- Wine image assignment (feature #29)

### Next up (priority order)
1. Assign wine images in admin panel (go to `/admin/images` on Vercel, save assignments)
2. Fix date filters on admin orders (KnownBugs #1)
3. Verify nikalasmarani.ge domain in Resend → emails go to any customer
4. Gallery page — wire up the 3 slider photos and 2 gallery photos on the About/Gallery page
5. Georgian/English language toggle (v1.1)

---

## 2026-05-19 — Previous session (full detail)

- Built public site: About, Contact, Order Wine pages under `(site)` route group
- SiteNav.tsx: sticky header, logo, desktop nav + hamburger mobile menu, social icons (phone, email, Facebook, Instagram)
- Order Wine page (`/wines`): 6 wines, gradient placeholder cards, grid/list toggle, B2B reservation form
- WineOrder Prisma model added, `prisma db push` run, orders save to DB
- Admin wine orders tab (`/admin/wine-orders`) added
- Brand assets: `saas/public/icons/` — logo-dark.svg, phone.svg, envelope.svg
- Mobile: hamburger menu, grid columns fixed for small screens, overflow-x-auto on list table
- Fixed Prisma DLL locked on Windows: stop preview before `prisma generate`
- Deployed to Vercel: georgian-saas-mg-productions-projects.vercel.app

---

## Older sessions (compressed)

- 2026-05-18 — Order edit/delete slide-over, filter fixes (individuals only, upcoming), dedup script, preview server setup, credentials saved to credentials.txt
- 2026-05-17 — Orders list, companies CRUD, price tiers with validations, seed script, statistics page, nav fixes
- 2026-05-17 — Scaffolded saas app, Supabase connected, booking form built, admin auth, dashboard Architecture tab
- 2026-05-16 — GitHub Pages live, repo restructured, React Flow dashboard built
- 2026-05-16 — Project kickoff, Obsidian vault created, tech stack decided, per-client architecture chosen
