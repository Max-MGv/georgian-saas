---
tags: [plan, feature-146, draft]
---

# Plan: Per-Vintage Wine Details (#146)

**Problem:** `wineType`/`sweetness`/`sparkling`/`alcoholLevel` currently live only on `Wine` (the product), shared across every vintage. Natural wineries commonly have these vary year to year for the same wine — everything but the name can change. There is currently no way to store a different value per vintage at all, regardless of any UI. See [[FeatureLog]] #146.

**Relationship to #116:** this revises the hierarchy built for that feature (`Wine` → `WineVintage` → `WineOrderItem`). Nothing about that structure is wrong or being undone — this adds an optional finer grain on top of it.

**Relationship to [[Plan-OnboardingFlow]] (#127):** #127's wine catalogue-essentials step was explicitly sequenced to wait for this plan, since it directly determines what the wizard's minimal-mode wine step should ask. Now that new tenants default to `VINTAGE` mode (see below), the wizard's wine step needs a vintage-level minimal form as its default case, not the product-level one originally drafted — noted back in that plan.

---

## Decisions (Max, 2026-08-04)

**The toggle is business-wide, not per-wine.** One setting per tenant governs every wine in that tenant's catalogue uniformly — not a per-wine switch.

**It lives in super-admin, not `/admin/settings`.** This is meant to be a lifetime commitment for a winery, kept out of the tenant admin's own hands entirely — set via the tenant form (`TenantFormClient.tsx` / `createTenant()`/`updateTenant()` in `app/actions/superAdmin.ts`), the same place the `modulesX` flags already live. Not code-locked once set (no DB-level irreversibility) — enforcement is "only super-admin can touch it," the same level every other module flag already gets, not a literal one-way door.

**New tenants default to `VINTAGE`; existing tenants stay `PRODUCT`.** These are two different defaults for two different situations:
- **Migration backfill for existing tenants (Nikalas Marani, any other live tenant):** `PRODUCT` — zero visual or data change, matches the project's standing rule of additive/safe migrations.
- **`createTenant()`'s pre-filled form value for brand-new tenants:** `VINTAGE` — the detailed option is the default going forward; super-admin can switch a specific tenant to `PRODUCT` before saving if that winery doesn't need per-vintage tracking.

**No inherited/guessed data, ever.** This was the central correction from the original draft of this plan: an unset vintage-level field must never silently fall back to the wine-level value and display as if it were confirmed for that vintage — that presents a guess as a fact. So:
- `PRODUCT` mode: only `Wine`-level fields are ever read or shown. Vintage columns aren't consulted.
- `VINTAGE` mode: only `WineVintage`-level fields are read or shown. If unset, the UI shows "not specified" (admin) and simply omits that part of the meta line (public catalogue) — never a fallback to the wine's value.
- **No copy-forward when a tenant is created in (or switched to) `VINTAGE` mode.** Pre-filling vintage fields from the wine's values would just relocate the same guessed-data problem. Vintage fields start genuinely blank and stay that way until someone deliberately enters them.
- Consequence, stated plainly: a `VINTAGE`-mode tenant's public catalogue will show "not specified" for any vintage nobody has gotten to yet. That's the intended, honest behavior, not a bug to smooth over.

---

## Schema

```prisma
enum WineDetailLevel {
  PRODUCT
  VINTAGE
}

model Tenant {
  ...
  wineDetailLevel WineDetailLevel @default(PRODUCT) // migration default; createTenant() pre-fills VINTAGE for new tenants
}

model WineVintage {
  ...
  wineType     WineType?   // only meaningful in VINTAGE mode; no fallback to Wine.wineType
  sweetness    Sweetness?
  sparkling    Boolean?    // must be nullable, not default false — "unset" and "explicitly not sparkling" are different states
  alcoholLevel Float?
}
```

Both changes are additive — existing `WineVintage` rows get four new nulls, existing tenants get `wineDetailLevel: PRODUCT`, so nothing changes visually for any current tenant until explicitly switched.

No changes to `WineOrderItem` (snapshots are name/year/price only — type/sweetness were never shown on orders, per #116) or RLS (no new table).

---

## What changes

**Super-admin (`TenantFormClient.tsx`, `superAdmin.ts`):** new field alongside the module checkboxes — `wineDetailLevel`, pre-filled `VINTAGE` on the create form, editable on both create and edit.

**Admin (`WinesClient.tsx`, `app/actions/wines.ts`):** the wine-edit page reads the tenant's `wineDetailLevel` (server-side, passed down as a prop) and renders one of two forms — no per-wine switch:
- `PRODUCT`: today's UI, completely unchanged.
- `VINTAGE`: the wine-level type/sweetness/sparkling/alcohol fields are hidden (they're inert in this mode), and each vintage row gains its own fields for those four, each independently empty until filled. `createVintage`/`updateVintage` and `VintageDraft` need the four new optional fields.

**Public site (`app/(site)/wines/page.tsx`):** the flatten step's resolution changes from always reading `wine.X` to reading `wine.X` or `vintage.X` depending on the tenant's `wineDetailLevel` — no fallback chain in either branch. The page doesn't currently fetch `tenant.wineDetailLevel` at all — add a `db.tenant.findUnique({ select: { wineDetailLevel: true } })` lookup (same pattern already used in `createBooking.ts`/`orders.ts`) alongside the existing `Promise.all`.

**Correction (2026-08-04, caught reading the actual file before build): `WineCatalogueClient.tsx` DOES need changes** — the original claim that it needs none was wrong. `wineMeta()` currently does `${typeLabel[wine.wineType]} ${sweetnessLabel[wine.sweetness]}` unconditionally, and `DbWine.wineType`/`sweetness` are typed as non-nullable enums; `availableTypes`/`availableSweetness` (the filter-pill option sets) are built the same way. In `VINTAGE` mode either field can now be `null` per-vintage, and feeding `null` through today's code produces a literal `"undefined"` in the meta line and a broken filter pill — not the "not specified" the plan requires. Needed: `DbWine.wineType`/`sweetness` become nullable in the type, `wineMeta()` handles each piece independently (omit or show "not specified" instead of gluing them into one always-present phrase), and the `Set`-building/filtering logic skips `null` rather than treating it as a filterable value. `sparkling` needs no change — it's already "push only if truthy," so `null` and `false` already render identically, which happens to match the "omit, don't guess" behavior for that one field. `alcoholLevel` also needs no change — already nullable and already guarded with `!= null`.

**Not affected:** `WineOrderItem`, RLS. **Statistics — resolved, not just flagged:** checked `app/admin/(panel)/statistics/` directly; no reference to `wineType`/`sweetness`/`sparkling`/`alcoholLevel` anywhere in that directory, so there's no mode-aware resolution needed there.

---

## Open items for build time (not blocking the plan)

- ~~Exact copy for the `WineDetailLevel` field in the super-admin form~~ — resolved: "Wine detail level" / "Product-level" (shared across every vintage) / "Vintage-level" (set independently for each vintage), with the "lifetime commitment... set here, not editable from the tenant's own admin panel" framing as the field hint.
- ~~Whether the admin's `VINTAGE`-mode "not specified" state needs visual urgency~~ — resolved: plain muted italic text, but only shown as a standalone "Not specified" when **none** of the 4 fields are set on a vintage; if some are set, only those render as badges (silently omitting the rest, matching how `sparkling`/`alcoholLevel` already behaved pre-feature) rather than cluttering a partially-filled vintage with repeated "not specified" badges.
- ~~Confirm Statistics doesn't group anything by `wine.wineType`~~ — resolved, see correction above: no such reference exists.

## Build (2026-08-04)

Shipped. Schema, super-admin, admin UI, public site, and translations all built and verified live in-browser (both `PRODUCT` and `VINTAGE` modes, super-admin + tenant-admin roles, on Staging Winery). See `vault/SessionLog.md` 2026-08-04 part 3 for the full build/verification log and `vault/FeatureLog.md` #146.

One deviation from this doc worth flagging: Georgian copy for the new admin strings (`wines.notSpecified`, `wines.sparklingYes/No`, `wines.characteristicsPerVintageHint`) is a best-effort translation, not natively reviewed — same open caveat as the original legal-content seed (see `Plan-LegalPages.md`).
