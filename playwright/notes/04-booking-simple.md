---
tags: [playwright, test, tier2]
---

# 04. Booking form — simple variant

**Status:** ✅ Built and passing (1/1)
**Tier:** 2 — core customer flows
**Regression guard for:** `KnownBugs.md` #2 (guest-count backspace/prepend bug), #3 (past-hour slots selectable)
**File:** `tests/tier2-core-flows/booking-simple.spec.ts`
**Seed:** `tests/seed.spec.ts`

## What this checks

The default (non-enhanced) public booking form: an individual guest booking with no company code. This is the highest-traffic path on the site and the one most sessions have manually re-verified — a strong candidate to stop verifying by hand.

## Steps & assertions

1. Navigate to the booking form (home page — the form is embedded there, no dedicated route).
2. Fill name, email, phone fields with valid test values.
3. On **today's date**, open the time-slot picker. **Check:** either (a) no slot with an hour earlier than or equal to the current hour is present in the option list, or (b) if the clock is already past the last slot (18:00), the picker explicitly shows "No slots available today" rather than an empty/silent state — direct regression check for #3 ("Time slot picker allows selecting past hours on today's date"). The component filters with strict `>` on `currentHour`, so the test mirrors that exact comparison. Both branches are asserted explicitly (see "Real findings" below — the original version only handled branch (a) and broke late in the day).
4. Select a future date instead (tomorrow), pick any available slot.
5. In the guest-count input: click, select-all (Ctrl+A), type `12`. **Check:** value is `12`. Press Backspace once. **Check:** value is `1`, not `0` — regression check for #2 ("backspace resets to 0"). Type `3`. **Check:** value is `13`, not `03` — regression check for the other half of #2 ("typing prepends to 0 instead of replacing").
6. Submit the form with valid data.
7. **Check:** the page redirects to the real Flitt payment gateway (`pay.flitt.com`) — see "Real finding" below, this replaces the originally-planned inline-confirmation check.
8. **Cross-check (not just UI trust):** navigate to `/admin/orders` (fresh page/tab), find the order row by guest email. **Check:** a new order row exists with matching date and status "Awaiting Payment"; opening the order detail confirms guest count = 4.
9. **Cleanup:** delete the test order via admin's "Delete order" button + inline "Yes" confirm.

## Real findings (from building this test)

- **No dedicated booking route.** The form lives embedded on the home page (`/`), anchored at `#book`. Resolves the original open question.
- **KnownBugs #2 is genuinely fixed**, but the real minimum guest count is **4**, not 1, and the field defaults to `"4"` (not empty/`0`). It's a plain native `<input type="number">` with no custom keystroke handling (confirmed by reading `BookingForm.tsx`) — the old bug's exact repro (type into an empty/0 field) no longer applies verbatim. The test adapts it: click the field, select-all (Ctrl+A, mirroring how a real user replaces an existing value), then type — this is what genuinely tests "does typing replace or prepend," since a plain click doesn't guarantee cursor position at the end of existing text.
- **No inline confirmation for individual bookings.** "Book & Pay" redirects the whole page to the real Flitt payment gateway (`pay.flitt.com`) rather than showing a success message. The order is created server-side (`createBooking.ts`, status "Awaiting Payment") *before* the redirect happens, so the flow is verifiable without ever touching the payment form (never entering card details — this suite must never execute a financial transaction). `page.waitForURL(..., { waitUntil: 'commit' })` is used rather than the default `'load'`, since the Flitt page itself never reaches a full load event within a reasonable time in this environment.
- **The Flitt page destabilizes further navigation on the same `page` object** — a `goto()` issued on the same page after redirecting there intermittently aborts (`net::ERR_ABORTED`). All admin verification happens on a **fresh page** from the same browser context instead; the original page is simply abandoned on Flitt.
- **Admin panel session is scoped to the browser *context*, not the page.** Calling the shared `loginAsTenantAdmin()` helper a second time on an already-authenticated context makes `/admin/login` redirect straight to `/admin/orders`, and the helper then hangs waiting for a login form that never appears. Wrapped in a local `ensureAdminLoggedIn()` that checks the URL after navigating before deciding whether to log in.
- **Cold dev-server compiles can outlast the 5s default assertion timeout** on a route's first visit in a test run — bumped specific `toBeVisible()` calls to 15s rather than using `networkidle` or sleeps.
- **Guest count isn't a column on the Orders admin table** for individual/simple bookings (Tasting/Lunch/Visit/Masterclass/Food columns are all enhanced-booking-only, shown as "—"). Verifying guest count requires opening the order detail page (`/admin/orders/[id]`), which shows "Total guests".
- **Order delete confirmation is a real "Delete order" button → inline "Delete? Yes/No" row**, not a native browser dialog — no `dialog-accept` needed, just click "Yes".
- **Two real bugs in this test itself, found via a full-suite run late in the day (not caught by the individual-file runs used while building it) and fixed:**
  1. The past-hour time-slot check assumed at least one bookable slot always remains "today" and ran `parseInt()` on every option text unconditionally. Once the actual clock passes the last slot (18:00), `BookingForm.tsx` swaps the option list for a single `<option value="">No slots available today</option>` instead — `parseInt()` on that returns `NaN`, and `expect(NaN).toBeGreaterThan(currentHour)` is unconditionally `false` (NaN comparisons are always false in JS), so the test failed for a reason that had nothing to do with a real regression, purely a time-of-day fluke. Fixed to branch explicitly on both real states (see steps above).
  2. The order-detail-page navigation check (`await expect(admin).toHaveURL(/\/admin\/orders\/[a-zA-Z0-9]+/)`) was left on the 5s default assertion timeout while every *other* navigation check in this file had already been bumped to 15s for the documented cold-compile reason above — a plain oversight, not a new finding. The order-detail route's first compile in a freshly-restarted dev server routinely takes 8–10s on its own (confirmed in a passing run's server log: `GET /admin/orders/[id] 200 in 9.4s`) before the actual data fetch; earlier individual-file runs only passed because that route happened to already be warm from a prior run in the same long-lived dev-server process. Bumped to 15s to match the rest of the file.
- **Session-level infra finding, not specific to this test:** sustained heavy Playwright usage across this whole session (multiple sessions' combined test volume) degraded the local dev DB connection pool (Supabase dev project, transaction-mode pooler) badly enough that a brand-new dev-server process immediately threw `PrismaClientKnownRequestError P1001` ("Can't reach database server") and `P2028` ("Transaction already closed" / "Unable to start a transaction in the given time") straight from the pooler — this is `KnownBugs.md` #4's failure shape, triggered by sustained test-run volume rather than hot-reload churn. Recovered only after several minutes of genuinely reduced load (confirmed via polling `/admin/orders` and `pg_stat_activity`'s idle-connection count, not by restarting alone — a restart with the pool still saturated reproduced the same errors immediately). Separately, a `Stop-Process -Force` kill of the dev server once corrupted the `.next` Turbopack dev cache (`/admin/login` started 404ing until `.next` was deleted and the server restarted clean). Neither is fixable from a test file — flagged here (and in `vault/MigrationNotes.md`-style write-ups belong at that level if this recurs) for whoever hits `/admin/*` 500s or hangs during a heavy suite-running session.
