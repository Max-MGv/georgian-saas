---
tags: [playwright, test, tier4]
---

# 11. Locale integrity

**Status:** ✅ Built, standalone-verified (5/5 passing, twice) — full-suite reconfirmation blocked this session by a live DB pool exhaustion incident affecting the whole suite, not this test specifically. See last note below.
**Tier:** 4 — locale integrity
**Regression guard for:** `KnownBugs.md` #131 part 1 pattern ("20 fields existed in `FIELDS.form` for months with zero `ka` rows" — a silent no-op, not a crash, per `MaintenanceNotes.md` §1)
**File:** `tests/tier4-locale/locale-integrity.spec.ts`
**Seed:** `tests/seed.spec.ts`

## What this checks

Missing Georgian translations don't crash anything — they silently fall back or render a raw key, which is exactly why the #131 bug went unnoticed for months. This test exists to catch that failure mode automatically instead of relying on someone eyeballing the Georgian version of every page.

## Pages covered (parametrized)

- `/` (public home)
- `/wines`
- `/admin/orders`
- `/admin/settings`
- `/admin/companies`

## Steps & assertions

For each page:

1. Toggle language to `ka` (site-language toggle for public pages, admin-language setting for admin pages).
2. **Check:** no visible text on the page matches a raw i18n-key pattern — a regex for `snake_case` tokens (e.g. `/^[a-z]+(_[a-z]+)+$/`) appearing as standalone visible text, which is what an untranslated key falling through to its own key name looks like. Direct regression check for the #131-shaped bug.
3. **Check:** `console` messages captured during the toggle contain zero `error`-level entries (`playwright-cli console error` during exploration; `page.on('console')` filtered to `type() === 'error'` in the spec).
4. Toggle back to `en`.
5. **Check:** 2–3 known label spot-checks per page return to their original English text (e.g. a nav link, a page heading) — confirms the toggle is bidirectional and doesn't leave stale translated content behind.

## Notes / open questions

- **Regex resolved (2026-08-11):** read `lib/t.ts` and `lib/adminT.ts` (the two dictionaries actually used across all 5 pages) plus the `FIELDS.form` snake_case SiteContent keys referenced from `components/BookingForm.tsx` (e.g. `form_first_name`, kept in sync with `ContentClient.tsx` per that file's own comment and `MaintenanceNotes.md` §1). Every real key in this codebase is one or more lowercase/camelCase segments joined by either `.` or `_` — `nav.orders`, `settings.adminLanguage.sectionTitle`, `onboarding.companies.qualifyYes`, `form.first_name`, `form_first_name`. There is no bare single-word or space-separated key anywhere in either dictionary. Since `.` and `_` are just two flavors of the same "segment separator" role, one regex covers both conventions at once instead of needing separate snake_case/dot-namespaced patterns: `/^[a-zA-Z]+(?:[._][a-zA-Z0-9]+)+$/`. Applied only to whitespace-free text nodes (a real leaked key is always one unbroken token; genuine prose in either language always has spaces), which rules out the large majority of possible false positives without a hand-maintained exclusion list. Live-verified during exploration against all 5 pages in Georgian — fully translated, zero raw-key matches, confirming the regex doesn't false-positive on real Georgian/English content, IBANs, emails, dates, or company names on these pages.
- **Real, unrelated app bug hit while building this test:** `/admin/companies` throws a genuine React hydration-mismatch console error on *every* page load, in any locale — `KNOWN-ISSUES.md` #2 (`CompaniesClient.tsx` nests a `<button>`, the `HelpHint` "?" trigger, inside another `<button>`, the row summary button — invalid HTML). This is not a locale bug and predates this test; the spec's "zero console errors during the toggle" check would otherwise permanently fail on this one page for a reason unrelated to translations. The spec file filters it out by exact known error text (`cannot contain a nested`, `Hydration failed because the server rendered HTML didn't match the client`) via `isKnownCompaniesHydrationError()`, so the assertion still catches any *other*, genuinely new console error on that page.
- **Real, severe environmental incident that blocked full-suite reconfirmation:** the shared dev Supabase connection pool (`georgian-saas-dev`) hit `KNOWN-ISSUES.md`'s documented "Dev database connection pool exhaustion" pattern (`P1001`/`P2028`) hard and repeatedly this session. This test itself passed cleanly and repeatably standalone (5/5 with `--workers=1`, then reconfirmed as a 3/3 admin-only subset) — the problem only showed up trying to reconfirm the *full* 22-test suite. Four separate full-suite attempts were made (2 at the default parallel worker count, 2 fully serial) with genuine, documented-protocol recovery attempts between each — real idle waits, polling an ordinary page load every 30-60s and requiring 2-4 *consecutive* clean reads with zero new pool errors before resuming, not a fixed sleep. Every attempt still came back with widespread failures (8 to 15 of 22 tests, worst run 7 passed / 15 failed in 19.5 minutes) hitting tests with zero relation to this change — `popover-clipping`, `booking-simple`, `booking-enhanced`, `companies-crud`, `admin-login`, `onboarding-wizard`, all previously-green Phase 1-3 tests, failing in the exact same shape (stuck on `/admin/login`, `net::ERR_ABORTED`, hydration/transaction timeouts). Even single isolated health-check requests during otherwise-idle wait windows occasionally errored, which is the strongest signal this was load from *outside* this session (per `KNOWN-ISSUES.md`: "combined test volume from more than one session running against the same local dev DB") rather than something this session's own traffic caused or more local waiting would fix. **Verified live via `playwright-cli`, not just log-trusted:** Staging Winery's admin panel language is correctly `en` — none of the interrupted runs left it stuck on Georgian. **Follow-up needed:** re-run `PLAYWRIGHT_HTML_OPEN=never npx playwright test` for a clean full-suite pass count once the shared dev DB isn't under heavy contention — this was not achieved this session despite real effort, and should not be assumed clean from the standalone result alone.
- **Also found while exploring live (not part of this test's scope, flagged as a separate, real translation gap):** `/wines`'s "Grid view" / "List view" toggle buttons (`app/(site)/wines/WineCatalogueClient.tsx`) are hardcoded English literals with no `t()` key backing them at all — they stay in English even when every other string on the page is in Georgian. This is a genuine untranslated-string gap, but it is a *different* failure shape than the #131 regression this test guards against (a hardcoded literal, not a missing dictionary entry falling back to a raw key), so it does not trip this test's raw-key or console-error assertions. Worth a follow-up if `/wines`'s Georgian completeness matters — not fixed here.
- This test is intentionally broad/shallow (presence of raw keys) rather than validating translation *correctness* — actual Georgian phrasing correctness has been explicitly flagged as "not independently native-checked" in prior sessions (`SessionLog.md` part 10) and stays a human review item, not something this suite claims to cover.
