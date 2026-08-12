---
tags: [playwright, test, tier3]
---

# 09. Companies CRUD

**Status:** ✅ Passing — 1/1, reconfirmed clean twice individually and in the full 16-test suite (see `Progress.md`)
**Tier:** 3 — admin panel smoke
**Regression guard for:** `KnownBugs.md` #11 (wizard-created companies ignored tenant's actual modules), #13 (Companies list had no visual indicator for missing details)
**File:** `tests/tier3-admin-smoke/companies-crud.spec.ts`
**Seed:** `tests/seed.spec.ts` + logged-in fixture from `07-admin-login.md`

## Real findings from building this test

This was by far the hardest test in the suite to get reliably green, because it surfaced a genuine, reproducible app bug rather than a test-design issue.

**The root cause: an HTML-invalid nested `<button>` on `/admin/companies`.** `CompaniesClient.tsx`'s per-row summary button renders a `HelpHint` "?" trigger — itself a `<button>` — inside the summary `<button>`. Buttons cannot nest per the HTML spec; the browser's parser (used for the SSR'd HTML) and React's client-side DOM API (used once hydrated) disagree on the resulting tree, so the page throws a hydration-mismatch error on every load. In practice this means React periodically discards and rebuilds affected DOM subtrees client-side, which showed up as **three distinct, real click-loss symptoms** across repeated test runs, not one flaky element:
1. Clicking the row's own expand/collapse button to reveal "+ Add tier" occasionally did nothing.
2. Clicking the "Bookings"/"Wine Orders" tab toggle occasionally didn't flip `activeModule`.
3. Clicking "+ Add Booking Company" itself (the very first interaction on the page) occasionally didn't open the create form.

**The fix, in the test:** every click with a checkable side effect goes through a `clickUntil(clickable, verify)` helper that checks whether `verify()` already holds (so a click that legitimately makes its own target disappear, like "Save changes" closing the Edit panel, doesn't get double-clicked into failure), and otherwise clicks and re-checks in a bounded retry loop. This is the correct fix for a test exercising a real, standing app quirk — a real user whose click doesn't register just clicks again. `test.setTimeout` was bumped from 60s to 120s to give these retries room.

**A second, separate real bug this incident caused (not fixed in the app, mitigated in the test):** while manually diagnosing the click-loss symptom above via `playwright-cli`, a *cached* element reference from before one such DOM rebuild ended up pointing at a different row after the rebuild, and a save action ended up editing **"Cookie Company"** — a real, shared tenant company — instead of the test's own company. Caught immediately via the actual `updateCompany` POST body, reverted via direct SQL (`contactName`/`contactPhone`/`contactEmail`/`identificationCode` set back to `NULL`), and confirmed restored. The test file's `companyRow()`/`companyNameButton()` helpers re-resolve a fresh `Locator` by exact unique company name on every single call rather than ever caching one — safe in real Playwright (`Locator`s re-evaluate lazily at call time, unlike `playwright-cli`'s cached `ref=` handles).

**Third real finding, differs from this note's original step 8:** filling in only the identification code does **not** clear the "⚠ Needs details" badge. `missingDetails()` (the #13 fix) requires identification code **and** contact info **and** (for a booking company) at least one price tier, all together — confirmed live, the badge kept showing "contact info, pricing" still missing after only the ID code was filled. The test fills all three.

**Fourth real finding:** the price-tier spinbuttons ("Min guests", "Tasting ₾/person", etc.) have no accessible name at all — the labels are plain nearby text, not wired via `<label>` or `aria-label`. They can only be targeted positionally: 0=Min guests, 1=Max guests, 2=Tasting ₾/person, 3=Tasting+Lunch ₾/person, 4=Flat fee.

**Fifth real finding:** the "N booking · M wine orders" header count (`app/admin/(panel)/companies/page.tsx`) is server-rendered and only catches up via Next.js revalidation after a create/delete server action — it is not driven by the same client-side `setCompanies` state that makes the row list itself update instantly. A same-tick read of this header immediately after a confirmed row deletion could still show the pre-delete count. The test polls this count (`expectBookingCount()`) instead of taking a single reading.

## What this checks

Company creation via the real `/admin/companies` page (not the onboarding wizard — that's covered separately in `10-onboarding-wizard.md`, and the two paths have historically diverged, per #11). Covers both the module-flag regression and the missing-details badge.

## Steps & assertions

1. Navigate to `/admin/companies` (logged in). Record current row count.
2. Create a company: name, one pricing tier, "Booking" module selected (confirm test tenant has both Booking and Wine Orders modules enabled, so this selection is meaningful rather than the only option).
3. **Check:** row count increases by 1, and the new row's name matches.
4. **Check:** the new row's module badge reads "Booking" — not silently defaulting to something else. Direct regression check for #11 ("always defaulted `isBookingCompany:true, isWineOrderCompany:false` regardless of what the tenant had enabled").
5. Leave `identificationCode` blank on this company (deliberately incomplete).
6. **Check:** a "⚠ Needs details" badge is present on the row.
7. Click-reveal the badge (per #13's `HelpHint`-based click-reveal, not hover). **Check:** the revealed text lists "ID code" (or equivalent) among the missing items.
8. Edit the company to fill in the identification code.
9. **Check:** the badge disappears **without a page reload** — confirms `missingDetails()` is a live computed check reacting to the same data, not a stale cached flag (per the original bug write-up: "no new server round-trip: the page already fetched every field needed").
10. Delete the test company. **Check:** row count returns to the pre-test count.

## Notes / open questions (resolved)

- Staging Winery has both Bookings and Wine Orders modules enabled, confirmed live by the test itself (asserts both tab buttons visible before proceeding) — not assumed.
- Create/edit UI flow confirmed: creation is an inline name-only form (`+ Add Booking/Wine Order Company` → input + Save, no modal); editing opens an inline `Edit Company` panel (ID code, contact fields); price tiers are added via the row's own expand + `+ Add tier` control, separate from the Edit panel.

## Follow-up worth a dedicated task

The nested-`<button>` hydration-mismatch bug described above (`CompaniesClient.tsx`'s `HelpHint` "?" trigger rendering inside the row summary button) is a real, standing app bug independent of this test suite — it caused three distinct lost-click symptoms during testing and, once via a cached `playwright-cli` reference, a real accidental edit to a shared tenant's data. Worth fixing at the source (move the `HelpHint` trigger out of the summary `<button>`, e.g. render it as a sibling element or a `<span role="button">`) rather than only working around it in tests.
