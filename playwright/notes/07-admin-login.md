---
tags: [playwright, test, tier3]
---

# 07. Admin login

**Status:** ✅ Built and passing (2/2) — `saas/tests/tier3-admin-smoke/admin-login.spec.ts` (built ahead of schedule during Phase 1, as shared login infrastructure)
**Tier:** 3 — admin panel smoke
**File:** `tests/tier3-admin-smoke/admin-login.spec.ts`
**Seed:** `tests/seed.spec.ts`

## What this checks

The gate every other admin test depends on. This is also the one test file expected to become the shared login fixture other Tier 3 (and Tier 1's onboarding-wizard) tests reuse, so it should be built first within Phase 3.

## Steps & assertions

1. Navigate to `/admin/login`.
2. Fill valid credentials (dev super-admin login — retrieved via the `credentials` skill at test-authoring time, **not hardcoded in the spec file**; store as an env var read by `playwright.config.ts` or a local, gitignored fixture file, consistent with the standing rule of not embedding secrets in committed code).
3. Submit.
4. **Check:** URL navigates away from `/admin/login`.
5. **Check:** the admin nav bar renders with expected links present (Orders, Companies, Wines, Settings, etc. — exact set TBD from explore pass, may vary by tenant module flags per `MaintenanceNotes.md` §4).
6. Log out via the nav's logout control.
7. **Check:** redirected back to `/admin/login`.
8. Submit with an invalid password.
9. **Check:** an error message renders, URL stays on `/admin/login`.
10. **Check:** no auth/session cookie is set (`playwright-cli cookie-list` during exploration; `context.cookies()` in the spec) — confirms the failed attempt doesn't half-authenticate.

## Notes / open questions

- ~~Credential handling~~ — resolved: `saas/tests/helpers/credentials.ts` reads `credentials.txt` directly at runtime (`fs.readFileSync`), never copying the password into a fixture/`.env.test` file, per the `credentials` skill's explicit "don't copy into other files" rule. Confirmed with Max: `maxb2bsaas@gmail.com` (tenant-locked) for this test; `super-admin-dev@nikalasmarani.test` reserved for tests needing cross-tenant access.
- Since `/admin/*` is always scoped to whichever tenant the `Host` header resolves to (`MaintenanceNotes.md` §4), logging in on `localhost:3000` always lands on Staging Winery's admin — confirmed live, no `Host` override needed.
- **Real finding, fixed:** the Supabase Auth round trip on sign-in can take longer than Playwright's 5s default assertion timeout (flaky on first run). `loginAsTenantAdmin()`/`loginAsSuperAdmin()` now wait up to 15s for the post-login redirect.
- **Real finding:** `getByRole('link', { name: 'Orders' })` in the nav also substring-matches "Wine Orders" — needs `exact: true`.
