---
tags: [plan, done]
---

# Plan — Tenant Module Toggles (Feature #120)

**Status: DONE (2026-07-17).** All 11 steps completed in one session. Kept as a reference doc rather than deleted — see the step notes below for design rationale and the live-tenant near-miss caught during verification. See `SessionLog.md` session 3 (2026-07-17) for the narrative summary and `FeatureLog.md` #120 for the one-line index entry.

## Design (confirmed with Max 2026-07-17)

Three per-tenant module booleans on `Tenant`, mirroring the existing Company-level pattern (`isBookingCompany`/`isWineOrderCompany`, Feature #117):

```prisma
modulesBooking     Boolean @default(true)
modulesWineOrders  Boolean @default(false)
modulesPublicSite  Boolean @default(true)
```

- **Bookings module** — gates Orders, Menu Items, Masterclass admin pages + booking-stats section of Statistics + Companies "Bookings" tab
- **Wine Orders module** — gates Wines, Wine Orders admin pages + public `/wines` route + wine-stats section of Statistics + Companies "Wine Orders" tab
- **Public Website module (the ".5")** — kill switch, NOT a widget-only mode. Off = all `(site)` routes redirect to a static "coming soon" page (respects tenant branding). Admin panel unaffected. This is the smaller/easier of two options Max was given; he picked it explicitly over "full site vs. booking-widget-only" (that's a bigger future feature, not this one).

Known complication: Companies + Statistics pages are NOT cleanly separable per module (both already mix booking + wine data) — these get conditional sections, not page-level all-or-nothing guards. See existing Companies Bookings/Wine Orders tabs from #117 as the pattern to extend.

## Steps

- [x] **1. Schema** — add 3 booleans to `Tenant` model in `saas/prisma/schema.prisma`. Tell Max to stop dev server → `npx prisma db push` from `saas/` → confirm "✔ Generated Prisma Client" → tell Max to restart dev server. (See `MaintenanceNotes.md` §3 — Windows EPERM risk if server is running.) ✅ Done — pushed clean, client regenerated, dev server restarted.
- [x] **2. Proxy** — `saas/proxy.ts`: fetch the 3 module flags alongside existing tenant resolution (already fetching the tenant row for brand/logo — add to same query). Forward as headers: `x-tenant-modules-booking`, `x-tenant-modules-wine-orders`. For `modulesPublicSite`, if `false`, redirect all `(site)` route-group requests to `/coming-soon` (new static page) — but NOT `/admin` or `/super-admin` routes. ✅ Done.
- [x] **3. Coming-soon page** — new `saas/app/coming-soon/page.tsx` (outside route groups so it's reachable regardless of the redirect). Simple centered message, reads `x-tenant-logo`/`x-tenant-name` headers for branding consistency. ✅ Done.
- [x] **4. Admin nav filter** — `saas/app/admin/(panel)/layout.tsx`: read the 2 module headers, filter the nav link array (hide Orders/Menu Items/Masterclass when booking off; hide Wines/Wine Orders when wine off). ✅ Done.
- [x] **5. Route guards (server-side, not just nav hiding)** — DONE. New `saas/lib/requireModule.ts` (`requireBookingModule`/`requireWineOrdersModule`, redirect to `/admin/companies` by default since Companies is always visible regardless of module state) applied to `orders/page.tsx`, `menu-items/page.tsx`, `masterclass/page.tsx` (booking), `wines/page.tsx`, `wine-orders/page.tsx` (wine). Public `saas/app/(site)/wines/page.tsx` redirects to `/` inline (didn't reuse the admin helper since redirect target differs). **Bonus consistency fixes beyond original plan** (small, worth doing while touching this area): `SiteNav.tsx` hides the "Order Wine" nav link when wine module off (threaded `wineOrdersOn` prop from `(site)/layout.tsx`); home page hero's "Order Wine" button also hidden via same flag read from headers directly in `(site)/page.tsx`. Without these two, nav/hero would show dead links that just bounce to `/`.
- [x] **6. Statistics page** — DONE. `page.tsx` reads both module headers, skips the DB query for whichever module is off (`Promise.resolve([])` instead of the real query). `StatisticsClient.tsx` takes `bookingOn`/`wineOrdersOn` props: mode switcher only renders when BOTH modules are on; default mode picks whichever single module is on; "both off" shows a plain empty-state message (edge case, unlikely but handled).
- [x] **7. Companies page tabs** — DONE. `page.tsx` reads both module headers, passes `bookingOn`/`wineOrdersOn` to `CompaniesClient`. `TabToggle` now takes a `modules: Module[]` prop and only renders buttons for enabled modules; the switcher itself is hidden entirely when only one module is available (no point switching between one tab); `activeModule` initial state defaults to whichever module is actually on. Did NOT touch the per-company Modules checkboxes in the edit slide-over (`isBookingCompany`/`isWineOrderCompany`) — those are a company-level data concern independent of whether the tenant currently has the module toggled on, so leaving a company flagged for a currently-off module is fine (no UI to change it while off, but the flag survives for when it's re-enabled).
- [x] **8. Super-admin tenant form** — DONE. `getTenant`/`createTenant`/`updateTenant` in `superAdmin.ts` now read/write the 3 module booleans (`getTenants` list view NOT touched — no modules column on the cards, out of scope). `TenantFormClient.tsx` has a new "Modules" section (3 checkboxes) between Favicon and Brand colors; amber warning note appears when Public Website is unchecked, explaining the coming-soon behavior. `[id]/page.tsx` needed no change — it already spreads the full `getTenant()` result into the form.
- [x] **9. TypeScript check** — `npx tsc --noEmit` from `saas/`, 0 errors required before calling done. ✅ Clean.
- [x] **10. Browser verification** — DONE, with one important catch found and fixed. **Critical finding**: the new `modulesWineOrders` column defaulted to `false` on `db push`, which backfilled onto the EXISTING Nikalas Marani row too — meaning the live production tenant (9 real wine orders, active feature) would have had Wines/Wine Orders silently hidden from its own admin nav the moment this shipped. Caught this before it mattered by querying the DB directly (`npx tsx` one-off script, deleted after use) and manually set `modulesWineOrders: true` for Nikalas Marani specifically. Restarted dev server to clear `proxy.ts`'s in-memory tenant cache and confirmed nav/Orders/Wine Orders/Statistics/Companies all render exactly as before for Nikalas Marani post-fix. Verified: Modules checkboxes save + persist correctly (tested on Test Winery, toggled Wine Orders on → saved → reloaded → confirmed persisted → reverted to defaults); `/coming-soon` renders with correct tenant branding when visited directly; admin nav, Statistics mode switcher, and Companies tab switcher all correctly show/hide based on live Nikalas Marani flags. **Did NOT test the Public Website kill-switch live** — refused to toggle Nikalas Marani's real `modulesPublicSite` off even briefly, since that's the actual production domain with real customer traffic (this DB has no separate dev/staging copy — see Roadmap backlog). Confidence in the redirect logic itself comes from: it's a 4-line boolean check in `proxy.ts` following the exact same pattern as the 3 other route guards already in that function (super-admin, admin, login-redirect) which are known-working in production, and the `/coming-soon` destination was verified to render correctly. **If Max wants to see the kill-switch live, he should flip it himself for a few seconds when convenient** — not something to automate.
- [x] **11. Vault update** — `FeatureLog.md` (#120 row), `SessionLog.md` (session detail), `MyToDo.md` (test checklist), tick off this plan file's steps, mark this file's frontmatter tag from `active` to `done`. ✅ Done — this is the last step.

## Files touched (reference list)
- `saas/prisma/schema.prisma`
- `saas/proxy.ts`
- `saas/app/coming-soon/page.tsx` (NEW)
- `saas/app/admin/(panel)/layout.tsx`
- `saas/app/admin/(panel)/orders/page.tsx`
- `saas/app/admin/(panel)/menu-items/page.tsx`
- `saas/app/admin/(panel)/masterclass/page.tsx`
- `saas/app/admin/(panel)/wines/page.tsx`
- `saas/app/admin/(panel)/wine-orders/page.tsx`
- `saas/app/(site)/wines/page.tsx`
- `saas/app/admin/(panel)/statistics/page.tsx` (+ its client component)
- `saas/app/admin/(panel)/companies/page.tsx` + `CompaniesClient.tsx`
- `saas/app/super-admin/tenants/TenantFormClient.tsx`
- `saas/app/actions/superAdmin.ts`
