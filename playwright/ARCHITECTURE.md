---
tags: [playwright, meta]
---

# Architecture

How this suite is built and why — the shared pieces every test depends on, the two-tenant strategy, and the conventions to follow when adding a new test. Read this before writing a new test; read `KNOWN-ISSUES.md` before debugging a failing one.

## Shared helpers (`saas/tests/helpers/`)

Every test reuses these instead of re-implementing login, locale switching, theme switching, or credential lookup. If a new test needs one of these things, import the existing helper — don't copy-paste the pattern into a new file.

### `credentials.ts`

Reads `credentials.txt` (repo root) **directly at runtime** via `fs.readFileSync` — never copies a password into a fixture file, `.env.test`, or any committed file. This isn't a style preference: the `credentials` skill (`.claude/skills/credentials/`) has an explicit rule against copying secrets out of `credentials.txt` into anywhere else, and this suite follows it.

Two accessors, matching the two logins this project actually uses:
- `getTenantAdminCredentials()` — `maxb2bsaas@gmail.com`, tenant-locked to Staging Winery. Use for anything that should behave like a real admin.
- `getSuperAdminCredentials()` — `super-admin-dev@nikalasmarani.test`, cross-tenant access via `/super-admin/*`. Use only when a test genuinely needs to act outside Staging Winery (currently: theme preset switching, the onboarding-wizard test's second tenant).

### `auth.ts`

`loginAsTenantAdmin(page)` / `loginAsSuperAdmin(page)` — both navigate to `/admin/login`, fill credentials from the helper above, submit, and wait for the post-login redirect to `/admin/orders`.

**The wait timeout is 25 seconds, not the Playwright default of 5.** The post-login landing is a two-hop redirect (`LoginForm.tsx`'s client-side `router.push('/admin')`, then `app/admin/(panel)/page.tsx`'s server-side `redirect('/admin/orders')`), and under any real load on the dev DB, 15s intermittently wasn't enough either. If you see a test fail on this exact line with the URL still reading plain `/admin`, that's this timeout being too tight again under worse load, not a real regression — check `KNOWN-ISSUES.md`'s DB pool section first.

### `locale.ts`

- `setSiteLanguage(page, 'en'|'ka')` — the **public-site** language toggle. Desktop nav shows the `en`/`ka` buttons directly; below the nav's mobile-collapse breakpoint they're hidden inside a "Menu" button first, and this helper handles both.
- `setAdminPanelLanguage(page, 'en'|'ka')` — the **admin-panel** language setting on `/admin/settings`. This is a genuinely different, tenant-level setting from the site toggle above — don't confuse them.

**Both waits matter for a non-obvious reason:** `setAdminPanelLanguage` explicitly waits for the underlying `POST /admin/settings` to resolve, not just for the click event to fire. The button's `[active]` state updates optimistically in the UI before the request completes — a cleanup click that doesn't wait can get cancelled mid-flight if the test/browser context tears down right after, silently leaving Staging Winery's *real* admin panel language stuck on Georgian for whoever loads it next. This happened for real once while this suite was being built (see `KNOWN-ISSUES.md`).

### `theme.ts`

`setTenantTheme(page, presetName)` — switches Staging Winery's theme preset via the super-admin tenant editor (`/super-admin/tenants/<id>`). Preset buttons have no `title`/`aria-label`; their accessible name comes from a child `<span>`, so `page.getByRole('button', { name: presetName, exact: true })` is what actually works.

**Caller must already be logged in as super-admin** (call `loginAsSuperAdmin()` once at the top of the test) — this function does **not** log in itself. An earlier version did log in fresh on every call, including from `afterEach`; a 2-preset-switch test needed 3 full login round trips and blew past even a 90-second timeout, and hitting that timeout twice left the tenant's real theme stuck on a dark preset until manually caught. Log in once, reuse the session for the whole test, including its own cleanup.

`gotoWithFreshTheme(page, url)` exists alongside it for the (currently unused, since `theme-colors.spec.ts` was redesigned around a caching gap — see `KNOWN-ISSUES.md`) case of needing a hard reload after a theme change, since Next.js treats `page.goto()` to a URL it's already on as a soft client-side nav that can silently reuse a stale RSC payload.

## The two-tenant strategy

Almost every test runs against **Staging Winery** (`cmrxb85wo0000vlc0d964nzf8`), which `localhost:3000` resolves to automatically via `saas/.env`'s `DEFAULT_TENANT_ID` (see `saas/proxy.ts`'s `isLocal` branch — on localhost there's no per-request domain routing, unlike a real deployed preview URL).

**One test — `10-onboarding-wizard` — needs a second, genuinely blank tenant**, and getting to it without touching `DEFAULT_TENANT_ID` took real investigation (full story in that test's own note). The short version: `proxy.ts`'s domain-resolution branch works for *any* Host header, not just `localhost`, and the "Test Onboarding Wizard" tenant (`cmsioproi000avl9czd60ua5h`) already has `domain = "test-onboarding-wizard.invalid"` set. That one spec file scopes a custom `baseURL` and a Chromium `--host-resolver-rules` flag to itself via `test.use()` — every other test keeps using the default `localhost:3000` origin, completely unaffected. No env var, no OS hosts-file edit, no cross-test interference.

**Do not solve a "need a different tenant" problem by touching `DEFAULT_TENANT_ID`.** A past session did exactly that to inspect the onboarding wizard manually, then didn't revert it — the wrong tenant stayed silently active for hours until caught by accident (see `KNOWN-ISSUES.md`). If a future test needs a third tenant, follow the same domain-routing pattern `10-onboarding-wizard.spec.ts` already uses, not an env var swap.

## Credential handling policy

Never write a password into any file other than `credentials.txt` itself — not a `.env.test`, not a spec file literal, not a fixture. Always go through `helpers/credentials.ts`, which reads the source file at runtime. This is a hard rule from the `credentials` skill, not a suite-specific convention — it applies to any future test that needs a login this suite doesn't already have a helper for.

## Test data & cleanup discipline

Staging Winery (and, for its one test, the onboarding-wizard tenant) is **real, shared data reused across sessions** — not a disposable per-run fixture. Every test that creates something deletes or reverts it, regardless of pass/fail:

- **Orders, companies, price tiers:** created in the test body, removed via the admin UI's own delete action in cleanup (`afterEach` or the test's final steps).
- **Settings changed for the duration of a test** (admin language, theme preset, module toggles): reverted to their original value before the test ends, via the same mechanism that changed them — never assume a value, always read the actual current state first if there's any doubt what "original" means.
- **The one confirmed exception:** Wine Orders admin has no delete action, only status transitions. `06-wine-catalogue-order.spec.ts`'s cleanup marks the order `Cancelled` because that's the closest available action — this does **not** actually remove the row, and rows accumulate in the real `WineOrder` table every time that test runs. See `KNOWN-ISSUES.md` for the recurring cleanup this causes.
- **The onboarding-wizard tenant is the one deliberate exception to "always clean up":** it doesn't reset itself afterward, because nothing else in this suite depends on it staying pristine between runs. It must be reset via the SQL documented in its own note before its *next* run — a known, accepted manual step, not an oversight.

## Conventions for adding a new test

1. **Explore before writing.** Use `playwright-cli` (see `~/.claude/skills/playwright-cli/`) to find real selectors against the actually-running app — don't guess ARIA names or assume a UI shape from a bug report; the app has drifted from its own history more than once this session (e.g. the company-booking flow's dropdown-vs-code-entry shape).
2. **One `.spec.ts` file per scenario**, under `saas/tests/<tier>/`, matching a `playwright/notes/NN-name.md` note with the same steps-and-assertions shape already used throughout.
3. **`// spec: playwright/notes/NN-name.md`** as the first line of the test file, linking it back to its documentation.
4. **Reuse the helpers above** rather than re-deriving login/locale/theme logic.
5. **Run in the foreground with a generous timeout**, not backgrounded, when verifying — the full suite currently takes 6–8 minutes, well under any reasonable timeout. Ending a turn on an assumed-still-running background job wastes a full round trip and was a repeated, avoidable time sink while building this suite.
6. **Independently re-verify before calling anything done** — re-run the full suite from a clean shell, and if the test touches shared tenant data, spot-check the real row counts via direct SQL, not just the UI. This caught real problems (a premature "done" claim, orphaned test data, an accidental edit to live data) multiple times while building this suite — see `KNOWN-ISSUES.md`.
7. **Update the matching note and `Progress.md`** as part of the same change, not as an afterthought.
