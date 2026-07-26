---
tags: [plan, wines, i18n]
---

# Plan — Bilingual Wine Name (EN/KA)

**Status:** ✅ Built and browser-verified 2026-07-26, on `staging`. Both the name field and the optional type/sweetness label bundle were included (Max confirmed both). See `FeatureLog.md` #143.

## The ask

Wine name (`Wine.name`, e.g. "Rkatsiteli") is currently a single field — one value shown on both English and Georgian versions of the site. Max wants a second, optional Georgian name (e.g. "რქაწითელი"), entered via a small toggle in the wine editor, that falls back to the English name if left blank. Rationale: unlike a pure proper noun, the Georgian name is a genuinely different string (different script), so this is a real translation, not a no-op — and it should help SEO for Georgian-script search queries.

## Design decisions

- **Schema:** add `nameKa String?` (nullable) to `Wine`. Keep the existing `name` field as-is — required, and the canonical/English value. No rename, no backfill needed: every existing wine already has a valid `name`, and `nameKa` simply starts empty (falls back to `name` until an admin fills it in).
- **Fallback is computed, not stored.** A small shared helper, `wineDisplayName(wine, locale)`, returns `nameKa` when `locale === 'ka'` and `nameKa` is non-empty, otherwise `name`. Nothing gets copied into the DB — if `nameKa` is blank, Georgian visitors just see the English name, same as today.
- **Admin UI:** the product form's single "Name" field gains a small EN/KA toggle next to its label (same visual pattern as the existing content-locale toggle in the Site Content editor), switching which of `name`/`nameKa` the one input box shows and edits. When switched to KA and empty, the placeholder reads something like "(currently shows English name)" so it's clear it's falling back, not blank.
- **Server actions (`app/actions/wines.ts`):** `createWine`/`updateWine` data types gain an optional `nameKa?: string`. Both already do a generic passthrough into Prisma (`{ ...data }` / `data: data`), so this is additive — no branching logic needed there.
- **Public wines page:** currently `app/(site)/wines/page.tsx` never reads the tenant's `default_locale` setting at all — confirmed in this session. It will start fetching it (same one-line pattern already used on Home/About/Contact) and resolve each wine's display name server-side via `wineDisplayName()` before handing the flattened wine list to `WineCatalogueClient`. This means the client component doesn't need any locale logic of its own — it just keeps using `wine.name`, which is now already the correct language.
- **Order snapshot (`WineOrderItem.wineNameSnapshot`):** no code change needed. It's already populated from whatever name string the public page sent down, so once the page resolves the right language, orders will correctly snapshot the name the customer actually saw — in whichever language that was.
- **`clone-nm-to-staging.ts`:** no change needed — it spreads the full `Wine` row generically, so `nameKa` carries over automatically once the column exists.

## Optional bundle (separate decision — confirm before including)

While wiring `default_locale` into the wines page, the wine **type/sweetness labels** ("Sweet"/"ტკბილი" etc.) could be fixed the same way — they already have both languages written out in `adminT.ts` for the admin panel, but the public wines page has its own separate, English-only copy of those labels and never localizes them. This is a slightly bigger, adjacent gap (also covers page chrome like "Order Wine", filter labels, form placeholders — those are NOT included in this bullet, just the type/sweetness badges). Flagging as optional since it wasn't the original ask — say the word and I'll fold it in, otherwise it stays out of scope for this pass.

## Files touched

- `saas/prisma/schema.prisma` — add `nameKa String?` to `Wine`
- `saas/prisma/migrations/` — new migration (via `prisma migrate dev` against **dev** DB first, per Rule 0)
- `saas/lib/wineName.ts` — NEW, `wineDisplayName(wine, locale)` helper
- `saas/app/actions/wines.ts` — `createWine`/`updateWine` data types extended
- `saas/app/admin/(panel)/wines/WinesClient.tsx` — EN/KA toggle on the Name field, `draft.nameKa` state
- `saas/app/(site)/wines/page.tsx` — fetch `default_locale`, resolve names server-side via the helper
- Vault: `FeatureLog.md` (new row), `Roadmap.md`, `MaintenanceNotes.md` (note the new fallback pattern if it's likely to recur elsewhere), `SessionLog.md`

## Rollout (per Rule 0 — staging first)

1. Build on `staging` branch.
2. `prisma migrate dev` against the **dev** DB (stop the dev server first — Rule 10).
3. Verify on the staging preview URL: add a Georgian name to a Staging Winery wine, confirm it shows correctly with the tenant's language set to Georgian, confirm English fallback still works for wines with no Georgian name yet.
4. Once Max confirms staging looks right: `prisma migrate deploy` against **production** as its own deliberate step, then merge `staging` → `master` and push.

## Open question for Max

~~Include the type/sweetness label fix in this same pass, or keep this pass scoped to just the name field?~~ Max said yes, include it — done.

## What was actually built (2026-07-26)

Built exactly per the design above, on `staging`. One repo detour along the way: switching from `master` to `staging` surfaced a pre-existing merge conflict — some vault docs (`FeatureLog.md`, `MyToDo.md`, `Plan-DevProdEnvironments.md`, `workspace.json`) had a newer, uncommitted, post-#79-completion version stuck on `master` that never made it to `staging`. Resolved in favor of the newer version (confirmed with Max first) and committed that separately before starting this feature — see `SessionLog.md` 2026-07-26.

- `prisma/schema.prisma`: `nameKa String?` added to `Wine`. Migration `20260726093339_add_wine_name_ka` applied to the **dev** DB.
- `lib/wineName.ts` — NEW, `wineDisplayName(wine, locale)`.
- `lib/adminT.ts` — `wines.nameKaPh`, `wines.nameKaFallbackHint` (en+ka); reused the existing `content.localeToggle.english/georgian` keys for the toggle button labels instead of duplicating.
- `app/actions/wines.ts` — `createWine`/`updateWine` accept optional `nameKa`; `getWinesWithVintages` select extended.
- `app/admin/(panel)/wines/WinesClient.tsx` — Name field now has an EN/KA toggle (separate toggle state for the add-form and the inline edit-form, since both can be open independently); switching to KA with no value shows the fallback hint.
- `lib/t.ts` — added `wine.type.*`, `wine.sweetness.*`, `wine.sparkling` keys (en+ka) — the public-site equivalent of the admin dictionary's wine enum labels, previously only defined for admin chrome.
- `app/(site)/wines/page.tsx` — now fetches `default_locale` (+ `site_locale` cookie override, matching Home/About/Contact's exact resolution order) and resolves each wine's display name server-side via `wineDisplayName()` before passing to the client component.
- `app/(site)/wines/WineCatalogueClient.tsx` — takes a `locale` prop; `TYPE_LABEL`/`SWEETNESS_LABEL`/sparkling label now resolved via `t()` instead of a hardcoded English-only object. `wineMeta()` takes the labels as params instead of closing over module-level constants.

**Deliberately left out** (per the plan's scope note): the rest of the wines page's chrome — "Order Wine" heading, "Type"/"Style" filter labels, "All", form placeholders, success message — is still English-only. Only the wine name and the type/sweetness/sparkling badges were in scope this pass.

**Browser-verified on staging tenant (Staging Winery, localhost dev DB):**
- Admin: opened Rkatsiteli in `/admin/wines`, toggled Name to Georgian, saw the fallback hint (field was empty), typed "რქაწითელი", saved.
- Public `/wines` with default locale (no cookie): showed "Rkatsiteli" (English), "RED DRY" badges — unchanged baseline behavior.
- Public `/wines` with `site_locale=ka` cookie: showed "რქაწითელი" for the wine with a Georgian name now saved; the other 4 wines (no Georgian name yet) correctly fell back to their English names; type/sweetness/sparkling badges and filter pills all switched to Georgian (წითელი/მშრალი/ცქრიალა etc.).
- Cart/order-summary line item also showed "რქაწითელი" — confirms the resolved name flows all the way into what would become `wineNameSnapshot` on submit (traced in code, not separately submitted as a live test order).
- TypeScript: 0 errors.

### What's next
- Max: add Georgian names for the other 5 wines when convenient (Rkatsiteli Amber, Mtsvane, Rosé, Kisi, Saperavi) — purely a data-entry task, not code.
- Not done, flagged separately: the rest of the wines page chrome (headings/filters/placeholders) is still English-only — same shape of gap as this fix, just not in scope this pass.
- Still needs: push to `staging`, verify on the staging preview URL, then `prisma migrate deploy` to production + merge to `master` once Max confirms.
