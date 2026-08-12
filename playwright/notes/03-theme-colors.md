---
tags: [playwright, test, tier1]
---

# 03. Theme-aware status colors

**Status:** ✅ Built and passing (2/2) — `saas/tests/tier1-regression/theme-colors.spec.ts`, though scoped differently than originally planned (see below — the live rendered-color comparison isn't reliably testable due to a real caching gap this work uncovered)
**Tier:** 1 — regression suite
**Regression guard for:** `KnownBugs.md` #14 (hardcoded green/red status colors didn't respect tenant theme)
**File:** `tests/tier1-regression/theme-colors.spec.ts`
**Seed:** `tests/seed.spec.ts`

## What this checks

`BookingForm.tsx`'s company-code-confirmed box and `WineCatalogueClient.tsx`'s discount badge were fixed to derive their color from `color-mix(in srgb, <hue>, var(--site-surface))` instead of a literal hex, so they adapt to any of the tenant's 16 theme presets. A regression (someone hardcoding a hex again, or a new status UI copy-pasting the old pattern instead of the fixed one) needs to be caught by comparing actual rendered color across two presets, not just checking the element is present.

## Elements covered

- `BookingForm.tsx` — company-code-confirmed box, "no rate for guest count" alert
- `WineCatalogueClient.tsx` — discount badge

## Steps & assertions

For each element:

1. Under the tenant's default light preset ("Cream & wine"), trigger the state (enter a valid company code / view a discounted wine). Get computed `background-color` and `color` via `eval("el => getComputedStyle(el)")`.
2. Switch the tenant to a dark preset ("Midnight cellar") via super-admin. Reload, re-trigger the same state. Get computed `background-color`/`color` again.
3. Switch the tenant back to its original preset (cleanup — don't leave Staging Winery's theme changed).
4. **Check:** computed `background-color` under the dark preset is **different** from the light-preset value. This is the core regression check — a reintroduced hardcoded hex would be *identical* in both, since it wouldn't respond to the preset at all.
5. **Check:** contrast ratio between computed `color` and `background-color` is `>= 4.5:1` (WCAG AA), computed via relative-luminance formula in the eval script. Catches "technically theme-reactive but unreadable" — e.g. a dark-on-dark regression that still technically changes between presets but fails legibility.
6. **Check (sanity, not strict):** the background color's hue still falls in a recognizably green (success) or red (error) range in both presets — confirms the `color-mix()` blend didn't drift the semantic meaning away from green/red entirely.

## Notes / open questions — MAJOR real finding, changed the test's shape

**The originally-planned live rendered-color comparison does not work in an automated run, and it isn't a test bug — it's a real caching gap in the app.** `saas/proxy.ts` caches the *entire* resolved tenant record (`TenantInfo` — theme/presetId, module flags, logo, favicon, displayName, not just `domain → tenantId` as the pre-existing `MigrationNotes.md` note implied) in a module-level `Map`, keyed by domain, with a **5-minute TTL**. A super-admin theme save does **not** invalidate this cache. Confirmed by direct source read (`saas/proxy.ts` `resolveTenant()`, `saas/app/layout.tsx` reading `x-tenant-theme` from the request header proxy.ts sets): the super-admin edit page itself reads fresh (direct Prisma query, bypasses this cache entirely — confirmed its "Theme Preview" panel updates instantly), but the **public site** keeps serving the old theme for up to 5 minutes after a save.

This was found the hard way: an automated test doing rapid switch→check→switch→check cycles (all well within that 5-minute window) reliably read the *stale* cached color every single time across 4 separate attempts, even with an active `page.waitForFunction()` poll waiting 15s for `--site-bg` to change — because it never would, within that window. Root cause was found by reading `saas/proxy.ts` directly rather than continuing to guess at timing fixes. **Updated `vault/MigrationNotes.md`'s existing "In-memory cache" section** to document the wider scope, since this is a real gap: a theme change made for a client via super-admin would not visibly apply for up to 5 minutes, which could easily read as "the save didn't work" if checked immediately.

**What the test actually checks instead** (two independent tests, both reliable and fast):
1. **Persistence** (`Theme-aware status colors — live persistence`): switches the preset, reads the super-admin edit page's own "text #RRGGBB" swatch display (fresh Prisma read, unaffected by the proxy cache) after each switch, confirms it changes between presets and correctly reverts. Proves the save mechanism itself works.
2. **Mechanism** (`Theme-aware status colors — source mechanism`): a static check that `BookingForm.tsx` and `WineCatalogueClient.tsx` still define their status colors via `color-mix(in srgb, #16a34a/#dc2626 N%, var(--site-surface/border/text))` rather than a reverted literal hex. Direct regression check for KnownBugs #14's actual fix shape.

**What this does NOT cover, disclosed rather than assumed:** whether the *rendered* public-page color genuinely differs between presets in practice. That was manually confirmed once, early in this work, by coincidence of enough real wall-clock time passing between checks for the cache to expire — real behavioral proof it works, but not something this suite can assert on every run without an actual 5-minute wait, which isn't a reasonable cost for a regression suite meant to run after every change.

- Switching a live tenant's theme preset via super-admin: `loginAsSuperAdmin()`, go to `/super-admin/tenants/cmrxb85wo0000vlc0d964nzf8` (Staging Winery), swatch buttons are `page.getByRole('button', { name: '<preset name>', exact: true })` (accessible name from a child `<span>`, not an attribute), then `page.getByRole('button', { name: 'Save Changes' }).click()` — POSTs to the same tenant edit URL, wait for that response before proceeding. All in `saas/tests/helpers/theme.ts`.
- **Also found:** the original design (fresh `loginAsSuperAdmin()` call inside every helper invocation, including from `afterEach`) made a 2-switch test take 3 full login round trips and blew past even a 90s timeout — worse, hitting that timeout once left Staging Winery's real theme stuck on the dark preset, fixed manually. Redesigned to log in once per test and reuse the session throughout, including in `afterEach`.
- The originally-planned "company code confirmed" box turned out not to be the simplest reachable themed element either — the live booking form's default company flow is a dropdown, not code-entry (a `directCompanyName` code-entry path exists but wasn't reliably reachable during exploration). Used the simpler, always-reachable "guest count below minimum" warning instead for the (later superseded) live-render approach — kept as context in case a future session revisits live-render testing after building a cache-bypass or waiting mechanism.
