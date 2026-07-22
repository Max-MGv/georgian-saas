---
tags: [plan, issue-131, content-editor, booking-form]
---

# Plan — Booking Form editor: Georgian seed + Detailed variant (Issue #131)

Status: ✅ Done — built and browser-verified 2026-07-23
Decisions confirmed with Max: 2026-07-23

## Background

Issue #131 (raised by Max, `FeatureLog.md` row 131): the Site Content editor's Booking Form tab has two problems, diagnosed 2026-07-22:

1. **Georgian toggle is a no-op for the Booking Form tab.** `FIELDS.form` in `ContentClient.tsx` defines 20 editable `form_*` keys, but `scripts/seed-ka.ts` has zero rows for any `form_*` key — so switching content-locale to KA shows the same English fallback either way. The mechanism itself works (same code path as Home/About/Contact); there's simply nothing Georgian to switch to yet.
2. **Only the "simple" booking form variant is previewable/editable.** The live public `BookingForm.tsx` has a second variant — when the `enable_enhanced_company_booking` setting is on and a company is selected, it additionally shows split guest counts (Tasting/Lunch/Free-Guide), a Hot Dish Selection (veg/meat dropdowns from `MenuItem` records), and Masterclass Add-ons (from `MasterclassItem` records). `BookingFormVisualPanel.tsx` (the admin's live mirror) only ever renders the simple layout — there's no way to see or edit the detailed variant in the content editor at all. On top of that, the 3 section headers for those detailed blocks aren't even in `FIELDS.form`/`SiteContent` — they're hardcoded via `t(locale, 'form.xxx')` in `lib/t.ts`, so they're not tenant-editable in either language today, independent of the preview bug.

Decided 2026-07-23: do both parts together in one pass (not phased), since the Georgian seed script needs to cover the 3 new keys from part 2 anyway — no point running it twice.

## Decisions made

- **Preview UI:** add a Simple/Detailed toggle to the Booking Form tab in the admin content editor, mirroring the existing Simple/Detailed invoice-print toggle pattern (Feature #41). The toggle is independent of the tenant's actual `enable_enhanced_company_booking` setting — admin can preview/edit both variants regardless of which one is currently live, same as the invoice toggle.
- **New editable scope: section headers only.** Three new tenant-editable keys, matching the 3 section headers in the detailed variant:
  - `form_guest_counts_header` (fallback "Guest Counts")
  - `form_hot_dish_header` (fallback "Hot Dish Selection")
  - `form_masterclass_header` (fallback "Masterclass Add-ons")
  Explicitly **not** in scope: guest-count sub-labels (Tasting/Lunch/Free-Guide/Total/paying), dropdown chrome (Vegetable dish/Meat dish/— choose —/qty), or rate/pricing messages. Max's call: those are tied to or populated by other admin-managed data (`MenuItem`/`MasterclassItem` records managed at `/admin/menu-items` and `/admin/masterclass`, or computed numbers) — making just the surrounding chrome editable there wouldn't add much and risks confusing scope with those other admin pages.

## Scope of work

### A. New SiteContent keys (`ContentClient.tsx`)
Add 3 entries to `FIELDS.form` (after the existing 20):
```ts
{ key: 'form_guest_counts_header', label: 'Guest Counts header', fallback: 'Guest Counts' },
{ key: 'form_hot_dish_header',     label: 'Hot Dish Selection header', fallback: 'Hot Dish Selection' },
{ key: 'form_masterclass_header',  label: 'Masterclass Add-ons header', fallback: 'Masterclass Add-ons' },
```

### B. Wire into live `BookingForm.tsx`
The `fc(key, tKey)` helper already exists at `BookingForm.tsx:48` (`formContent[key] || t(locale, tKey)`) and is used for all 20 existing fields (e.g. `fc('form_submit', 'form.submit')` at line 814). Just extend the same pattern to the 3 new headers:
- Line 608: `t(locale, 'form.guest_counts')` → `fc('form_guest_counts_header', 'form.guest_counts')`
- Line 652: `t(locale, 'form.hot_dish')` → `fc('form_hot_dish_header', 'form.hot_dish')`
- Line 681 **and** line 769 (both currently `t(locale, 'form.masterclass')` — line 769 is the order-summary recap line, same label reused): `fc('form_masterclass_header', 'form.masterclass')`

Low risk — this is the exact same substitution already done for the other 20 fields, no structural change.

### C. Admin Booking Form tab — Simple/Detailed toggle (`ContentClient.tsx` + `BookingFormVisualPanel.tsx`)
- Add local state in `ContentClient.tsx`, scoped to `section === 'form'`: `formVariant: 'simple' | 'detailed'`, with a small toggle control (reuse the invoice Simple/Detailed toggle's visual style for consistency).
- `BookingFormVisualPanel.tsx` gains a `variant` prop:
  - `simple` — current behavior unchanged (single "Number of Guests" field, no hot dish/masterclass sections).
  - `detailed` — swap the single guest field for a static 3-way split mockup (Tasting/Lunch/Free-Guide, labels can stay as plain non-editable text per the "headers only" decision), and add two new static mockup sections below Food Notes: Hot Dish Selection (two disabled-look dropdowns) and Masterclass Add-ons (one example line item with a qty stepper mockup) — same static/faded mockup style already used elsewhere in this file (e.g. the price text under Visit Type cards).
  - The 3 new `ET` (EditableText) calls go on the section headers only: `form_guest_counts_header`, `form_hot_dish_header`, `form_masterclass_header`.

### D. Georgian seed (`scripts/seed-ka.ts`)
Add Georgian translations for all 23 missing `form_*` keys in one batch: the 20 existing ones (never seeded) + the 3 new headers from this plan. Follow the file's existing row shape (`key`, `section: 'form'`, `label`, `locale: 'ka'`, `value`).

### E. Verification (browser, both content-locale and admin-locale independently)
1. Admin content editor → Booking Form tab → toggle Simple/Detailed → confirm both variants render with visibly different fields.
2. Toggle content-locale EN/KA → confirm all 23 `form_*` fields (across both variants) switch text correctly, including the 3 new headers.
3. Toggle Admin Panel Language (adminLocale, unrelated system) → confirm chrome vs. content-locale stay independent, as already established in Phase 3.
4. Live public site regression: with `enable_enhanced_company_booking` ON, select a company, verify the 3 header labels render (and reflect any edited SiteContent value) in both site locales.
5. Confirm tenants with `enable_enhanced_company_booking` OFF are unaffected on the public site — they never render the detailed block regardless of this change; the admin editor's detailed preview is independent of that setting by design (per decision above).
6. Spot-check that editing/resetting the 3 new fields via `EditableText`'s existing Save/Reset flow works the same as the other 20 fields (no new code path, just new keys).

## Files touched (expected)
- `saas/app/admin/(panel)/content/ContentClient.tsx` — 3 new `FIELDS.form` entries, `formVariant` state + toggle UI
- `saas/app/admin/(panel)/content/BookingFormVisualPanel.tsx` — `variant` prop, detailed-mode markup (split guest mockup, hot dish mockup, masterclass mockup), 3 new `ET` calls
- `saas/components/BookingForm.tsx` — 4 call sites switched from `t()` to `fc()` (lines 608, 652, 681, 769) — no structural changes
- `saas/scripts/seed-ka.ts` — 23 new `form_*` rows (20 existing + 3 new)

## Not in scope (explicitly deferred)
- Guest-count sub-labels, dropdown option chrome, rate/pricing message text — per "headers only" decision above.
- Any change to how `MenuItem`/`MasterclassItem` records themselves are managed (unaffected, already has its own admin pages).
