---
tags: [feature, feature-139]
---

# Feature 139 — Guide Mode (contextual admin hints)

## What it does

Small "?" hint icons next to non-obvious fields/sections throughout the admin panel. Click (not hover) to reveal a short explanation; dismiss on outside-click or Escape. Visible by default for every tenant; a "Show helpful (?) hints" toggle on `/admin/settings` lets a tenant turn them off once they've learned the interface.

## Key design decisions

**Researched before building** (real-product precedent: WordPress admin Help tabs, Salesforce in-app guidance, Appcues/Pendo/Userpilot terminology) rather than executing the original `Plan-OnboardingFlow.md` "Relationship to #139" sketch as-is. Two things changed as a result:

1. **Default ON, not default-off-until-activated.** No major product gates contextual help behind an opt-in "activate to see help" toggle — the closest established patterns are visible-by-default with an option to hide. Gating help behind a switch defeats its own purpose for the confused first-time admin who wouldn't know to look for it. Confirmed with Max before building.
2. **Content scope starts small, not "the whole panel at once."** The original plan assumed #127's onboarding copy could cover #139 with "zero duplicate content-writing" — true only for the wizard's own fields, not the rest of the panel. First pass covers only Companies (module checkboxes, the "Individuals" synthetic-company concept) and Settings (Admin Panel Language vs. Default Site Language distinction) — the two places closest to onboarding, chosen deliberately over auditing every admin page up front. Confirmed with Max.

**Deliberately unchanged from the original plan:** no scripted, DOM-anchored, multi-step tour — industry terminology (Tooltips/hotspots vs. Tours vs. Checklists) validates that this class of help is meant to stay cheap and passive; a full tour is a materially bigger, more fragile build, correctly deferred. `OnboardingBanner`-style checklists are already covered by #127, not duplicated here.

## Architecture

- **Setting**: `show_admin_hints` (`lib/settings.ts` `SETTING_DEFAULTS`, default `'true'`), read/written through the existing `getSetting`/`updateSetting` — no new server action.
- **Propagation**: `app/admin/(panel)/layout.tsx` — the one shared wrapper for the whole admin panel — fetches the setting once and wraps `{children}` in `<AdminHintsProvider>` (new `components/AdminHintsContext.tsx`, plain React Context). New admin pages inherit hint visibility automatically; nobody has to remember to fetch the setting per-page.
- **`components/HelpHint.tsx`** (new, reusable): a "?" `<button>`, click-to-toggle a popover. Renders nothing when the context value is `false`.
- **Non-obvious bit, worth knowing before adding more hints:** the popover renders via a `document.body` **portal** (`react-dom`'s `createPortal`), `position: fixed`, computed from the trigger's own `getBoundingClientRect()` — not a plain nested absolutely-positioned `<div>`. Found live: a plain nested popover gets silently clipped by any ancestor with `overflow-hidden` (e.g. the rounded-card sections used throughout this admin panel, including the Companies page's "Individuals" row where the first hint was placed). This is the same escape hatch `OrdersTable.tsx` already uses for its status dropdown (#140) — same clipping problem, same fix, not a new pattern.
- **Copy**: `help.*` namespace in `lib/adminT.ts`, same single-dictionary convention as everything else.

## Where hints live today

- `app/admin/(panel)/companies/CompaniesClient.tsx` — Modules checkboxes (`help.companies.modules`), the Individuals/"Public pricing" row header (`help.companies.individuals`).
- `app/admin/(panel)/settings/SettingsClient.tsx` — Admin Panel Language section header (`help.settings.languageDistinction`).
- `app/admin/(panel)/orders/OrdersFilters.tsx` — "Print Sheet" button (`help.orders.printSheet`) — a confusable pair with the per-row invoice-print icon in `OrdersTable.tsx`, same shape as the Settings language pair.
- `app/admin/(panel)/wine-orders/WineOrdersClient.tsx` — the Cards/Table/Pack mode toggle (`help.wineOrders.packMode`) — explains the non-obvious pre-selection rule (Confirmed/Paid checked automatically, Pending left unchecked) that isn't visible anywhere else in the UI.
- `app/admin/(panel)/content/ContentClient.tsx` — the Booking Form Simple/Detailed preview toggle (`help.content.formVariant`) — another confusable pair: this only changes the preview, not what guests see (that's `enable_enhanced_company_booking` on Settings).
- `app/admin/(panel)/statistics/StatisticsClient.tsx` — the Historical/All-Time breakdown header (`help.statistics.includesCancelled`) — verified directly in `page.tsx` (`tx.order.findMany({ where: { tenantId } })` has no status filter) before writing the copy, not assumed from the research pass alone.
- `app/admin/(panel)/masterclass/MasterclassClient.tsx` — the description line (`help.masterclass.sortOrder`) — Menu Items' equivalent field is already covered by its own intro text; Masterclass's wasn't.

Deliberately did **not** add hints to fields that already had inline one-line explanatory text (access code, wine discount, the payment/module toggles on Settings, Menu Items' sort-order field) — this admin panel already had decent inline copy in several places; a `HelpHint` next to already-explained text would just be clutter, not "wherever I am" coverage.

**Second pass, same architecture, no changes needed to `HelpHint`/`AdminHintsContext`** — confirms the component was built right the first time: adding a hint anywhere is just the one-line `<HelpHint text={at('help.some.key')} />` plus an adminT pair, no new wiring per page. Menu Items got a pass and needed nothing — its existing intro text + the sort field's `title` tooltip already covered its one non-obvious control.

## Verified live (Staging Winery)

Hints visible by default; toggle off in Settings → gone on next page load (Companies); toggle back on → restored. Popover confirmed **not** clipped by the Individuals row's `overflow-hidden` container (was clipped before the portal fix — caught live, fixed same pass). Keyboard: reachable via Tab (native `<button>`), Escape closes. Outside-click closes. Mobile (375px) + Georgian: popover stays fully on-screen (clamped `left`), Georgian text wraps cleanly in the fixed-width popover, no overflow. `tsc --noEmit` clean throughout. Admin language setting restored to `en` after testing.

## Extending this later

To add a hint anywhere else in the admin panel: `<HelpHint text={at('help.some.key')} />` next to the relevant label, plus the `help.some.key` EN/KA pair in `adminT.ts`. No other wiring needed — visibility is automatic via context.

**Coverage as of 2026-08-04: Companies, Settings, Orders, Wine Orders, Content, Statistics, Masterclass** (7 of 8 remaining-panel pages from the original plan's fuller scope — Menu Items deliberately skipped, already adequately explained). Not yet touched: Wines (`/admin/wines`) — not in the original #139 scope list, worth a pass if it turns out to need one.
