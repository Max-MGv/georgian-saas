---
tags: [plan, theming, v3]
---

# Plan: Theme Presets (Phase 2 — technical)

**Status: ✅ Built, QA'd, and confirmed by Max, 2026-07-27 (including a live-inbox check of both themed emails). Not committed/pushed yet** — sitting as uncommitted changes on the `staging` branch pending a commit, per the standard git workflow (Rule 0). All 10 steps below are done; the only remaining work is committing/pushing and, eventually, the `staging` → `master` merge once Max checks the real preview deploy. Phase 1 (business/design) is locked — see [[Themes]] and [[Presets-Proposal]] for the 4 presets, the 8-token tier, and the full dependency inventory (including the second-pass sweep that found the hero-gradient hybrid, the rgba overlay tints, and the emails/print exclusion).

## Goal

Replace the single brand-color picker with 4 named presets (Cream & wine, Sage & stone, Terracotta & clay, Midnight cellar), each carrying 8 color tokens, selectable per tenant in superadmin, with an optional brand-color override. Same delivery pattern as [[../Plan-DynamicBranding|Plan-DynamicBranding]] (proxy header → root `<style>`), extended to carry more values.

## Token list (locked in Phase 1)

`--site-bg`, `--site-surface`, `--site-header`, `--site-text`, `--site-muted`, `--site-border`, `--site-secondary`, `--color-brand` (name kept from the existing pipeline for back-compat with files already using it).

`--color-brand-hover` is **not** a 9th authored value — derived at resolve time by darkening `--color-brand` (~12-15%, simple HSL lightness shift), so preset authors and the override control only ever deal with one brand color. Matches the 8-token count Max confirmed.

## Concerns / decisions

- **New `--site-*` names, not the existing shadcn tokens** (`--background`, `--card`, etc. in `globals.css`). Those drive the admin panel's shadcn components — reusing them for tenant branding would risk a theme change leaking into the admin UI. Two separate token sets, on purpose.
- **Header payload: one JSON header, not 8+ separate ones.** `proxy.ts` currently sets `x-tenant-brand` / `x-tenant-brand-hover` as two headers. Switch to a single `x-tenant-theme` header carrying the resolved token object (URL-encoded JSON) — avoids header-name sprawl and makes adding a 9th token later a non-event. `layout.tsx` parses it once.
- **The rgba() overlay tints (hero/about/contact dark scrims, ~14 call sites) become `color-mix(in srgb, var(--site-text) 32%, transparent)`** instead of literal `rgba(28,16,8,0.32)`. Modern CSS, no extra RGB-triplet token needed, works directly off the existing hex custom property.
- **The hero's no-image gradient fallback** (`page.tsx:67`, currently `linear-gradient(160deg, var(--color-brand) 0%, #1c1008 100%)`) changes its dark stop to `var(--site-text)` — this was the "looks themed but isn't" trap found in the second-pass sweep.
- **Presets in code** (`lib/themePresets.ts`), tenant row stores `{ v: 1, presetId, primaryColorOverride? }`. Full pros/cons already written up in [[Presets-Proposal]].
- **Migration:** a one-time backfill script rewrites existing `{primaryColor, primaryHover}` rows into the new shape (`presetId: 'cream'`, `primaryColorOverride: <old primaryColor>`) — no visual change for current tenants. `resolveTenantTheme()` also defensively handles the old shape at read time, so a tenant row that somehow misses the backfill doesn't break.
- **Cache TTL:** reuses whatever `proxy.ts` already does for tenant lookups (5-minute TTL per [[../Plan-DynamicBranding|Plan-DynamicBranding]]) — theme resolution rides the same cached tenant fetch, no new caching layer.
- **Guest-facing emails ARE in scope (Max, 2026-07-27): both `bookingConfirmation.ts` and `invoiceEmail.ts` carry the theme.** CSS variables don't resolve in email clients, so this is a separate mechanism from the rest of the project: `resolveTenantTheme()` (Step 1) is called server-side at send time and its hex values are interpolated directly into the template strings, replacing the current hardcoded literals. Both call sites already fetch the tenant row immediately before sending — `createBooking.ts:179` and `orders.ts:265` — so this is a `select: { theme: true }` addition + a template-string edit, not new plumbing.
- **Explicitly out of scope for v1** (carried from the Phase 1 dependency sweep, matches the existing `AdminBar.tsx` precedent):
  - Admin operational chrome — modals in `OrdersTable.tsx`, the dropdown shadow in `SearchableSelect.tsx`, the edit-mode click overlay `BookingFormEditOverlay.tsx`, `AdminBar.tsx` itself. Internal staff UI, not the tenant's public brand.
  - `InvoicePrint.tsx` / `BookingSheetPrint.tsx` (the printable/PDF views, distinct from the invoice *email*) — stay fixed white-paper documents, keep their existing single `var(--color-brand)` accent border, nothing else themed. No request was made to change these.
  - `notifyNewCompany.ts` — internal staff notification, never seen by a guest.
- **Dark preset (Midnight cellar) QA flag carried forward**, not resolved here: every current tenant's uploaded photos/logo were chosen against a light background. Before offering Midnight cellar to an existing tenant, check their actual logo/photos read fine on it.

## Steps

- [x] **Step 1 — `lib/themePresets.ts`**: 4 presets, `TenantTheme` type, `resolveTenantTheme()`/`parseTenantTheme()`. Cream & wine's exact hex values were corrected during implementation from the chat mockup's approximation (`#FBF3EA`/`#FFFDF9`) to the real live values (`#F5EFE6`/`#FFF9F3`, ground-truthed from `app/(site)/layout.tsx` and `BookingForm.tsx`'s `C` constant) — see [[Presets-Proposal]]. Brand-hover derivation uses a fixed HSL lightness delta (+0.075, not a darken) — reverse-engineered from the app's actual existing default (`#7c1d23 → #9b2429`, which lightens, not darkens, despite the old UI copy calling it "darker") and verified to reproduce it almost exactly (`#9b242c`).
- [x] **Step 2 — `globals.css`**: `--site-*` defaults added, matching corrected Cream & wine values. Also updated `.shimmer`'s gradient to `var(--site-border)`/`var(--site-surface)`; left `.shimmer-dark` fixed (hero skeleton is always-dark by design).
- [x] **Step 3 — `proxy.ts`**: single `x-tenant-theme` JSON header via `resolveTenantTheme()`.
- [x] **Step 4 — `app/layout.tsx`**: parses the header, emits all 8 vars + derived hover.
- [x] **Step 5 — Consumer file swap**: all 12 files done. Found and handled 3 things not anticipated in scoping: (1) the hero gradient/overlay/logo-pill dark tones and white hero text are **intentionally left fixed**, not tokenized — they need to stay dark-with-white-text for every preset including Midnight cellar (whose `--site-text` is light), so tying them to a token would have broken contrast on the dark preset; (2) the hero "Book a visit" button and its hover glow were previously hardcoded to the *original default* brand color regardless of a tenant's actual override — a pre-existing gap, now fixed via `color-mix(in srgb, var(--color-brand) X%, transparent)`; same fix applied to the visit-type selection tint and the disabled-submit-button color in `BookingForm.tsx` (both were hardcoded to red/pink regardless of brand). (3) Semantic success/error colors (greens/reds) and the wine's own `color` field (varietal tint) are untouched everywhere, as intended.
- [x] **Step 6 — Admin preview surfaces**: `BookingFormVisualPanel.tsx` fully themed. `BackgroundsTab.tsx` — on reflection, themed its *entire* chrome (not just the hero-preview mockup as originally scoped), because it already deliberately mirrored the public site's cream palette rather than the admin panel's neutral gray tokens; narrowing to just the preview would have left an inconsistent hybrid. Its brand-based `rgba()` accents got the same `color-mix()` correctness fix as step 5.
- [x] **Step 7 — Themed guest emails**: both emails done. `invoiceEmail.ts`'s helper functions (`tableRow`/`codeTableRow`/`section`) took a `ResolvedTheme` parameter since they're free functions, not closures.
- [x] **Step 8 — Superadmin UI**: preset picker (4 swatch cards) + brand-color override toggle in `TenantFormClient.tsx`; live preview rebuilt on the full 8-token palette. `superAdmin.ts`'s `getTenants`/`getTenant`/`createTenant`/`updateTenant` updated for the new shape; `TenantsClient.tsx`'s unused `primaryHover` field dropped.
- [x] **Step 9 — Backfill script**: `scripts/migrate-theme-shape.ts`, run against the dev DB — migrated the one existing tenant ("Staging Winery") cleanly to `{v:1, presetId:'cream'}`.
- [x] **Step 10 — QA pass**: `npx tsc --noEmit` clean throughout. Browser-verified all 4 presets on the real dev site (Home/About/Contact/Wines/booking form) by temporarily writing each preset to the dev tenant row and restarting the dev server (proxy's 5-min tenant cache otherwise masks changes) — all four render coherently, restored to `cream` afterward. Sent both real test emails (booking confirmation + invoice) under Midnight cellar via a standalone script calling the send functions directly (Resend sandbox routes to Max's own inbox) — **Max confirmed the dark theme renders correctly in his actual Gmail inbox.**

**Follow-up fix, same session**: Max spotted the contact email in the booking confirmation rendering as Gmail's default blue link instead of the themed muted-gray — Gmail's data-detector auto-linkifies bare-looking email/phone text and overrides inline color. Pre-existing gap (would have happened regardless of theming), not caused by this project, but fixed while we were looking at it: phone/email in `bookingConfirmation.ts` now wrapped in explicit `<a>` tags with forced `color`/`-webkit-text-fill-color`; `invoiceEmail.ts`'s `codeTableRow` (personal number / bank code / IBAN — the other auto-detection-prone fields) got the same `-webkit-text-fill-color` lock, mirroring the existing technique in `InvoicePrint.tsx`/`globals.css`. Re-sent both test emails, Max confirmed the fix worked.

## Key files

- `saas/lib/themePresets.ts` (new)
- `saas/app/globals.css`
- `saas/proxy.ts`
- `saas/app/layout.tsx`
- `saas/app/(site)/*` (8 files) + `saas/components/{EditableText,BookingForm,DateInput,LocaleSwitcher}.tsx`
- `saas/app/admin/(panel)/content/{BookingFormVisualPanel,BackgroundsTab}.tsx`
- `saas/lib/emails/{bookingConfirmation,invoiceEmail}.ts`
- `saas/app/actions/createBooking.ts`, `saas/app/actions/orders.ts`
- `saas/app/super-admin/tenants/TenantFormClient.tsx`, `saas/app/actions/superAdmin.ts`
- `saas/prisma/schema.prisma` — no column change needed (`theme Json?` already exists)
