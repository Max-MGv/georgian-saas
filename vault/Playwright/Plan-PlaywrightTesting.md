---
tags: [plan, testing, playwright]
---

# Plan — Playwright Testing (#137)

**Status: 🚧 Drafted, awaiting Max's go-ahead.** Nothing installed, nothing written. See [[Playwright Testing]] for the background research/decisions log this plan grew out of.

**Scope decision (from Max, 2026-07-23):** don't just cover the public site — the real functional surface is `/admin` (filters, navigation, editors), so that's where most of the coverage should go. Explicit constraint: **as much coverage as reasonable, not exhaustive** — breadth over depth in most places, depth only where it's already proven regression-prone or business-critical.

---

## Real admin surface (confirmed from the actual route tree, not guessed)

`saas/app/admin/(panel)/`: `orders/`, `wine-orders/`, `companies/`, `wines/`, `statistics/`, `menu-items/`, `masterclass/`, `content/` (Site Content editor: Nav / Home / Booking Form / About / Contact tabs + Backgrounds), `settings/`. Plus `orders/[id]` and `orders/new`. That's 9 nav destinations, several with sub-views (Orders has Table/Calendar toggle, Wine Orders has Cards/Table/Pack mode, Content has Visual/Backgrounds mode + EN/KA content-locale toggle).

---

## Dependencies (must exist before writing a single test)

1. **Install Playwright** in `saas/`: `npm i -D @playwright/test` + `npx playwright install` (downloads browser binaries — one-time, ~a few hundred MB).
2. **Decide target environment.** Recommendation: **local dev server** (`npm run dev`, already pointed at the dev DB per `.env`) as the primary target — faster, no network flakiness, doesn't depend on a staging deploy being current. Staging URL becomes an optional final check before a `staging`→`master` merge, not where tests run day-to-day.
3. **Stable test identity.** Use the existing **Staging Winery** tenant (`cmrxb85wo0000vlc0d964nzf8`) and its admin login (`maxb2bsaas@gmail.com`, dev Supabase) — already real infrastructure from #79, no new tenant needed.
4. **Reusable login session.** Log in once via a Playwright "setup" project, save the browser's auth cookies to a file (`storageState`), and have every admin test reuse it instead of re-doing the login UI flow per test. This is a real effort-saver, not a nice-to-have — without it, every single admin test pays the login-flow cost.
5. **Data hygiene strategy.** Tests that create data (a test order, a test company) must delete what they created at the end of the test. Accept that this won't be perfect — periodic manual reset via the existing `scripts/clone-nm-to-staging.ts` (wipe + re-clone) is the fallback, not a new tool we need to build.
6. **Config + script.** `saas/playwright.config.ts` (baseURL, single browser project for v1 — see effort notes below); `"test:e2e": "playwright test"` added to `saas/package.json`.
7. **Folder.** Tests live in the app repo, not the vault: `saas/tests/e2e/` (`auth.setup.ts`, `public/`, `admin/`). Vault stays docs/plans only, per existing convention.

None of this touches production data — same "safe to break" dev DB the whole staging setup already exists to provide.

---

## Phased build order

Each phase is independently useful — we can stop after any phase and already have value, not an all-or-nothing build.

### Phase 0 — Infra proof (no real assertions yet)
Install, config, `auth.setup.ts` logging into Staging Winery admin and saving session state, one trivial test (home page loads, correct title) proving the whole chain works locally. Goal: prove the pipe works before spending effort on real coverage.

### Phase 1 — Public site + the money path
- Home / About / Contact render without console errors.
- Individual booking form: fill → submit → success screen renders, correct estimated price shown.
- Enhanced/company booking variant (Guest Counts / Hot Dish Selection / Masterclass Add-ons) — the exact area #131 just added.
- EN/KA public toggle shows correct strings on at least one page (proves the `t()` fallback path, not full string-by-string coverage).

### Phase 2 — Admin breadth: navigation + auth boundary (this is the "expand beyond public site" ask)
- Login success + failure.
- **One parametrized test looping over all 9 nav destinations**: page loads, no console/network errors, expected heading present. This is the cheap-but-high-value move — one test function, one array of `{path, expectedHeading}`, not nine hand-written near-duplicate tests. This is how "many filters, navigation, editors" gets covered without unreasonable effort.
- Tenant isolation: confirm the Staging Winery admin session only ever sees Staging Winery data (orders list, companies list) — never another tenant's rows.

### Phase 3 — Admin: filters + table interactions
- Orders: status filter, company search, date range each narrow the visible rows correctly.
- Column picker + the sticky Status/Actions columns (already regression-prone — this graduates a bug we already fixed once into a permanent check).
- Wine Orders: Cards/Table/Pack mode toggle; Pack mode box-count math (deterministic calculation, cheap to assert exactly).

### Phase 4 — Admin: editors (highest-value, most fragile area)
- Settings: flip Admin Panel Language EN↔KA, confirm nav labels actually change and revert cleanly — this exact toggle has broken before (Booking Form content-locale toggle was a no-op until #131) and is exactly the kind of thing that regresses silently when unrelated `adminT.ts` edits happen.
- Site Content editor: edit a field → save → reload → confirm it persisted; Simple/Detailed booking-form-variant toggle shows/hides the right sections; content-locale EN/KA toggle actually swaps text (the literal bug that kicked off #131).
- One CRUD smoke pass each on Companies / Wines / Menu Items / Masterclass: create → edit → delete, self-cleaning.

### Phase 5 — Stretch, only if it earns its cost later
- Cross-browser (Firefox/WebKit) — low priority; this is an internal admin tool used by Max in one browser, not a public product needing broad device coverage.
- Visual regression screenshots.
- Wiring into an automated CI gate on push to `staging` (vs. today's plan: run locally/manually as a check before asking Max to review staging).

---

## Effort-control principles (how we keep this "reasonable")

- **Parametrize, don't duplicate.** One data-driven test over an array of pages/filters beats nine copy-pasted tests — this is the main lever for covering breadth across admin without ballooning effort.
- **Reuse the login session** across the whole admin suite instead of re-logging-in per test.
- **Go deep only where it's already proven to matter**: booking price math, tenant isolation, i18n toggles (all have real bug history). Everywhere else, a shallow "loads without error" smoke check is enough for v1.
- **Skip cross-browser and visual regression** in the first pass entirely.
- **No CI automation yet** — local/manual runs only, as a pre-check before the existing `staging`→`master` review step, not a new blocking gate.

---

## Open decisions still needed from Max before Phase 0 starts

- [ ] Confirm local dev (not staging URL) as the primary run target.
- [ ] Confirm it's fine for tests to create/delete data against the Staging Winery tenant in the dev DB.
- [ ] Confirm phase order, or say if any phase should be skipped/reprioritized.
- [ ] Confirm: build through Phase 2 first and reassess, or commit to the full plan up front?
