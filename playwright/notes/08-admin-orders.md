---
tags: [playwright, test, tier3]
---

# 08. Orders admin

**Status:** ✅ Passing — 1/1, reconfirmed clean twice individually and in the full 16-test suite (see `Progress.md`)
**Tier:** 3 — admin panel smoke
**Regression guard for:** `KnownBugs.md` #1 (date filters didn't work on orders admin panel)
**File:** `tests/tier3-admin-smoke/admin-orders.spec.ts`
**Seed:** `tests/seed.spec.ts` + logged-in fixture from `07-admin-login.md`
**Requires:** at least one known seeded test order with a known date (create in setup, delete in cleanup — or reuse a booking created by `04-booking-simple.md` if test ordering allows; treat as independent otherwise per `playwright-cli` spec guidance)

## Real findings from building this test

Resolved as built: the test seeds its own order via a direct admin "New Order" action (`TEST_DATE = '2027-03-15'`, a year safely outside any real data) and deletes it in cleanup, independent of `04-booking-simple.md`.

1. **Date-range filter debounce race.** Filling the "From" and "To" date inputs back-to-back with no wait between them lost the first field's committed value — the filter's client-side URL-update mechanism debounces, and rapid automated fills raced it. Fixed with a `setDateRange()` helper that calls `page.waitForURL()` for the "From" field's query param before filling "To", forcing sequential commitment.
2. **Order-creation date field silently reset by a late hydration commit.** The "New Order" form's native `<input type="date">` showed the filled value correctly via `toHaveValue()`, but the server received `date: ""`. Root cause: on a freshly-compiled Turbopack route, React hydration completing *after* the fill silently reset the input back to its own initial (empty) controlled value. Fixed by re-filling and re-verifying the date field as the very last action immediately before clicking "Create order", minimizing the window for a late reset.
3. **Calendar view always opens on the real current month, not the active date filter's month.** Not a bug — a real, permanent property of the UI. The test asserts a generic month/year pattern (`/^[A-Z][a-z]+ \d{4}$/`) plus the presence of prev/next nav buttons, rather than a hardcoded month, so it won't rot as time passes.

## Infra note

A full-suite run once saw this test fail with `net::ERR_ABORTED` navigating to `/admin/orders`, alongside an unrelated tier1 test timing out in the same run. Root cause was the dev server itself (PID had grown to ~1.8GB resident after many hours and dozens of test runs this session), not a test or app bug — a restart (`Stop-Process` + `rm -rf .next` + fresh `npm run dev`) produced a fully clean 16/16 run immediately after. If a future run sees this pattern (page.goto aborting, or a page that's normally fast timing out), restart the dev server before assuming a regression.

## What this checks

Orders admin's filtering and view-toggle behavior — the exact area bug #1 broke ("Date filters don't work on orders admin panel"), so this isn't just a smoke check, it's a direct regression guard.

## Steps & assertions

1. Navigate to `/admin/orders` (logged in).
2. **Check:** table renders with expected header columns present.
3. Set a date-range filter to a range containing **zero** known orders.
4. **Check:** table body shows an empty state — not stale/unfiltered rows. This is the literal regression check for #1: the original bug was the filter silently doing nothing.
5. Set a date-range filter to a range containing **exactly one** known seeded test order.
6. **Check:** row count is exactly 1, and that row's guest/date data matches the seeded order — confirms the filter is actually scoping by date, not just showing/hiding based on some other condition that happens to correlate.
7. Click the Table/Calendar view toggle.
8. **Check:** a calendar-grid element becomes visible and the table element is hidden/unmounted (not just visually overlapped).
9. Toggle back to Table view. **Check:** table reappears with the same filtered result set as step 6 (view toggle shouldn't reset the active filter).

## Notes / open questions (resolved)

- Filter control is two separate native `<input type="date">` fields (From/To), not a combined range picker.
- Test seeds its own order via a direct admin "New Order" action, independent of `04-booking-simple.md`, as originally leaned toward.
