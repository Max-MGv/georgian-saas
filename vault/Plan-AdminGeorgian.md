---
tags: [plan, admin, i18n]
status: planning
---

# Plan — Georgian Language Layer for Admin Panel

## Goal

Add a Georgian translation of the **client-facing `/admin` panel UI** (nav, buttons, labels, table headers, empty states — not admin-entered data like wine names or company names, which stay as typed). Language is a **per-tenant setting**, changed only from Settings — no runtime switcher, no per-session toggle. Admin logs in and sees whichever language the tenant is set to.

**Out of scope** (confirmed with Max 2026-07-21):
- `/super-admin` platform panel — stays English-only, only Max uses it.
- Printed invoices — already always rendered in Georgian regardless of admin panel language (customer-facing document, not admin UI chrome).
- Public site (`/`, `/about`, `/contact`, `/wines`) — already has its own EN/KA system via `SiteContent` + locale switcher (v1.3). Unrelated to this feature.

## Architecture decisions

**Storage:** new `Setting` key `admin_language` (`'en' | 'ka'`), tenant-scoped — reuses the existing generic `Setting` model and `getSetting`/`updateSetting` actions in `saas/app/actions/settings.ts`. No schema change. Default `'en'` added to the `DEFAULTS` map.

**Delivery to components:** *(revised during Phase 0 — see note below)* Each server page/layout that needs it calls `getSetting('admin_language')` directly and passes the resolved `locale` string down as a prop to its client component, which calls `adminT(locale, key)`. No Context provider — this matches the exact existing convention for the public site's `default_locale` (see `saas/lib/t.ts` usage in `app/(site)/page.tsx` etc.), so there's one pattern in the codebase instead of two.

**Translation mechanism:** a static dictionary file `saas/lib/adminT.ts` — plain object keyed by dot-path (e.g. `orders.title`, `nav.wineOrders`, `status.confirmed`) mapping to `{ en, ka }`, with an `adminT(locale, key, vars?)` function supporting `{var}` interpolation. Directly mirrors `saas/lib/t.ts` (the existing public-site translation file), just a separate file since the string sets don't overlap. No new npm dependency (none currently installed, and `AGENTS.md` warns this isn't stock Next.js — keeping it dependency-free avoids surprises).

**Settings UI:** new "Admin Panel Language" section in `/admin/settings` — a two-option toggle (English / ქართული), saves via `updateSetting('admin_language', ...)`, calls `revalidatePath('/admin', 'layout')` so the change applies immediately across all admin pages on next navigation (no manual refresh needed, but no live in-place switch either — matches "admin won't switch back and forth" requirement).

## Why phased instead of one pass

Decided to split into phases rather than translating all ~40 admin components in one shot, because:
1. **Reviewability** — one giant diff across 40 files makes it hard for Max to spot-check Georgian wording; phased delivery gives natural checkpoints (flip the Settings toggle, click through just what changed, correct wording, move on).
2. **Risk containment** — restructuring JSX to route every string through `t()` touches render logic in every file; doing it in smaller batches limits blast radius if something breaks.
3. **Value ordering** — Orders, Wine Orders, and Companies are used daily; Statistics, Menu Items, Masterclass, and the Site Content editor are used far less often and can lag behind.
4. **The Site Content editor is architecturally distinct** — it already manages its own EN/KA content for the public site. Translating its own chrome (buttons/labels) is a different concern from the content it edits, and easy to conflate — better handled on its own once the core pattern is proven.

Translation authorship: Claude drafts Georgian text for every string; Max reviews/corrects per phase (per Max's answer 2026-07-21).

---

## Progress tracker

Update this checklist as each phase lands. Status values: ⬜ Not started / 🚧 In progress / ✅ Done, Claude-tested / ✅✅ Max-confirmed.

### Phase 0 — Infrastructure ✅ Done 2026-07-21, Claude-tested
- ✅ `admin_language` Setting key + default (`'en'`) in `saas/app/actions/settings.ts`; `updateSetting` now also revalidates `/admin` (layout-wide) so the change applies without a manual refresh
- ✅ ~~`AdminLocaleProvider` context + `useAdminT()` hook~~ — **not needed**: followed the codebase's existing convention instead (see `saas/lib/t.ts` for the public site) of fetching the setting server-side per page/layout and passing a resolved `locale` string down as a prop; simpler, no new abstraction, consistent with how `default_locale` already works
- ✅ `saas/lib/adminT.ts` — dictionary file (`{en, ka}` keyed by dot-path) + `adminT(locale, key, vars?)` function, same shape as `lib/t.ts`. Currently has `nav.*` and `settings.adminLanguage.*` keys; more added per phase
- ✅ Settings page: "Admin Panel Language" section (mirrors the existing "Default site language" section styling) — `page.tsx` fetches `admin_language`, `SettingsClient.tsx` has the EN/KA toggle + save
- ✅ `(panel)/layout.tsx`: fetches `admin_language` via `getSetting`, translates nav labels (Orders / Companies / Statistics / Wines / Wine Orders / Menu Items / Masterclass / Site Content / Settings), "Admin" tag, "Platform" link, and Sign out button (`LogoutButton.tsx` now takes a `label` prop)
- Verified in browser: toggling KA in Settings instantly flips the section itself, and nav across all admin routes shows Georgian on next navigation (via `revalidatePath('/admin', 'layout')`) without a full page reload; toggling back to EN reverts cleanly. Orders page body correctly still shows English (not yet in scope).

### Phase 1 — Core daily-use pages ✅ Done 2026-07-21, Claude-tested
- ✅ **Settings page itself** — every section (Booking toggles, Payment Details, Emails, Booking Rules, Contact Page/map, Branding, Contact Info, Closed Days) translated; ~80 new dictionary keys under `settings.*`
- ✅ Orders: `OrdersTable.tsx`, `OrdersFilters.tsx`, `ViewToggle.tsx`, `CalendarView.tsx` (incl. month/day names + hover popover), list page chrome, `columnDefs.ts` (labels → `labelKey`s). Status labels, row actions, edit slide-over, email-invoice modal, hover preview card all translated.
- ✅ Order Detail (`orders/[id]/OrderDetail.tsx`, 1120 lines) + New Order (`orders/new/NewOrderForm.tsx`, 678 lines) — Booking Info, Guest Breakdown & Dishes, Masterclass Add-ons, Extra Charges, Order Total all translated; New Order form reuses most `orderDetail.*` keys directly since the two forms share nearly identical sections
- ✅ Wine Orders: `WineOrdersClient.tsx` (cards/table/pack modes, vertical stepper, filter bar) + `PackingView.tsx` (box-mode picker, print sheet, box-count sentence generation rewritten per-locale rather than word-substituted, since Georgian grammar doesn't map 1:1 to the English pluralization logic)
- ✅ Companies: `CompaniesClient.tsx` (733 lines) — edit slide-over, price tiers section, tab toggle, individuals row, company list rows, wine-orders-tab contact summary

All of Phase 1 browser-verified in both EN and KA, including nested modals/panels (email invoice, edit slide-over, price tier add/edit). Toggling back to EN in Settings reverts every page cleanly — spot-checked Orders list after revert, no regressions.

**Note on scope discipline:** did *not* fully grammatically localize every generated sentence (e.g. packing box-count strings) with a generic templating system — built natural-sounding Georgian variants directly in code per locale branch instead, since a fully generic pluralization/interpolation system is more machinery than ~5 sentences justify.

### Phase 2 — Secondary pages ✅ Done 2026-07-21, Claude-tested
- ✅ Wines (`wines/page.tsx` + `WinesClient.tsx`) — product fields, vintage sub-list (add/edit/delete), image picker (upload/clear/delete-uploaded), add-wine form. Wine type (Red/White/Amber/Rosé) and sweetness (Dry/Semi-dry/Semi-sweet/Sweet) enum labels translated too — an upgrade over the raw `RED`/`SEMI_DRY` badges the English UI showed before, matching the human-readable labels the public site already uses in `WineCatalogueClient.tsx`
- ✅ Statistics (`statistics/page.tsx` + `StatisticsClient.tsx` + `StatisticsV2.tsx` + `WineStatistics.tsx` + `SearchableSelect.tsx`) — mode switcher, summary cards, filters, chart titles/tooltips, historical breakdown, wine bar/trend charts, top companies/customers. Month abbreviations (`statistics.month.*`) and weekday abbreviations (reused `orders.calendar.*`) used to build the localized "Next Order" date string instead of `toLocaleDateString('en-GB', …)`. Caught and fixed one hardcoded `'Individual'` fallback baked into `StatisticsV2.tsx`'s chart-data computation (not JSX, so it was easy to miss on a first pass — found via browser verification, not code review)
- ✅ Menu Items (`menu-items/page.tsx` + `MenuItemsClient.tsx`) — section headers, item rows, edit/delete sub-states, add-dish form
- ✅ Masterclass (`masterclass/page.tsx` + `MasterclassClient.tsx`) — column headers, item rows, edit/delete sub-states, add-item form. Deliberately left `UNIT_LABELS`/`UNIT_DESCRIPTIONS` (from shared `lib/masterclass.ts`, e.g. "per person", "per piece") in English — Phase 1's `OrderDetail.tsx` already displays these same shared constants untranslated, so translating them only here would create a mismatch between two admin pages showing the same data field in different languages

All of Phase 2 browser-verified in both EN and KA, including nested states (Wines vintage edit forms, Statistics historical breakdown + wine trend mode, Menu Items/Masterclass edit and delete-confirm rows). Spot-checked Orders list after Phase 2 changes — no regressions. TypeScript: 0 errors throughout.

### Phase 3 — Site Content editor chrome
- ⬜ `ContentClient.tsx`, `BackgroundsTab.tsx`, `BookingFormVisualPanel.tsx` (editor UI only — not the EN/KA site content it manages)

### Explicitly excluded
- `/super-admin` (all files)
- `InvoicePrint.tsx` (already Georgian-only by design)
- Public site pages (already has its own i18n system)

---

## Open questions / notes for later phases
- Status badge names (Pending/Confirmed/Paid/Delivered, New/Completed/Cancelled) need Georgian equivalents Max should sanity-check first since they appear everywhere.
- Need to decide whether admin-entered free text (e.g. Settings field hints, placeholder text) gets translated or stays English — leaning toward translating placeholders/hints too since they're static UI copy, not data.
