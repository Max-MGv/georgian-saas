// spec: playwright/notes/08-admin-orders.md
import { test, expect, Page } from '@playwright/test';
import { loginAsTenantAdmin } from '../helpers/auth';

// A far-future date, distinct from the real seeded orders (Staging Winery's
// 4 real orders all sit in Jul/Aug 2026) and from any other test file's
// dynamic "tomorrow" dates — this test needs a date it can build a reliable
// "exactly one order in range" vs "zero orders in range" pair around, per
// the note's own reasoning for why the 4 real seed orders aren't enough.
const TEST_DATE = '2027-03-15'; // YYYY-MM-DD, for the native date input
const TEST_DATE_DISPLAY = '15/03/2027'; // DD/MM/YYYY, for the filter inputs
const TEST_EMAIL = `playwright-admin-orders-${Date.now()}@example.com`;

// See tier2-core-flows/*.spec.ts for why this exists: loginAsTenantAdmin()
// hangs if called on a page whose browser context is already authenticated.
async function ensureAdminLoggedIn(page: Page) {
  await page.goto('/admin/orders');
  if (page.url().includes('/admin/login')) {
    await loginAsTenantAdmin(page);
  } else {
    await expect(page).toHaveURL(/\/admin\/orders/);
  }
}

async function deleteTestOrderIfPresent(page: Page) {
  await page.goto('/admin/orders');
  await page.locator('table').waitFor({ timeout: 15_000 }).catch(() => {});
  const row = page.locator('tr', { hasText: TEST_EMAIL });
  if (await row.count() > 0) {
    await row.getByRole('button', { name: 'Delete order' }).click();
    await row.getByRole('button', { name: 'Yes' }).click();
    await expect(page.locator('tr', { hasText: TEST_EMAIL })).toHaveCount(0);
  }
}

test.describe('Orders admin — filtering and view toggle', () => {
  test.afterEach(async ({ page }, testInfo) => {
    // Step 10 in the test body already deletes the order on the happy path
    // — this is a safety net for a body that failed before reaching it.
    if (testInfo.status === 'passed') return;
    await ensureAdminLoggedIn(page);
    await deleteTestOrderIfPresent(page);
  });

  test('date-range filter scopes results correctly; view toggle preserves the active filter', async ({ page }) => {
    test.setTimeout(60_000);

    await ensureAdminLoggedIn(page);

    // 1. Seed one known test order via the real admin "New Order" action
    // (not the public booking form — this is an admin-created order, a
    // distinct path) so this test has a controllable "exactly one order in
    // this date range" fixture, independent of the 4 real seeded orders and
    // of any other spec file (per playwright-cli's own guidance: scenarios
    // should be independent, not rely on `04-booking-simple.md` having run).
    await page.goto('/admin/orders/new');
    const dateInput = page.locator('input[type="date"]');
    // Real bug fixed here — took two attempts to fully close: filling the
    // date input right after goto() intermittently produced an order with
    // `date: ""` server-side, even though the DOM read back the filled value
    // correctly via toHaveValue() immediately afterward. Root cause: this is
    // a fresh Turbopack dev-server route on its first visit each run, and
    // React hydration finishing *after* the fill can silently reset a native
    // `<input type="date">` back to its own (empty) initial controlled value
    // — the DOM briefly shows the typed value, toHaveValue() catches that
    // narrow window, but by the time "Create order" is clicked the value is
    // gone again. Reproduced live: filling manually with natural multi-second
    // gaps between actions (plenty of time for hydration to finish first)
    // never failed; the fully-automated back-to-back fills did, repeatably.
    // Fix: re-fill and re-verify the date as the *last* action immediately
    // before clicking submit, minimizing the window for a late hydration
    // reset to land in between.
    await expect(dateInput).toBeVisible({ timeout: 15_000 });
    await dateInput.fill(TEST_DATE);
    await page.getByRole('textbox').nth(1).fill('4'); // Guest count
    await page.getByRole('textbox').nth(2).fill('Playwright'); // First name
    await page.getByRole('textbox').nth(3).fill('AdminOrdersTest'); // Last name
    await page.locator('input[type="tel"]').fill('+995500000099');
    await page.locator('input[type="email"]').fill(TEST_EMAIL);
    await dateInput.fill(TEST_DATE);
    await expect(dateInput).toHaveValue(TEST_DATE);
    await page.getByRole('button', { name: 'Create order' }).click();
    // expect: redirected to the new order's detail page — confirms creation
    // succeeded server-side, not just that the form submitted
    await expect(page).toHaveURL(/\/admin\/orders\/[a-zA-Z0-9]+/, { timeout: 15_000 });

    // 1 & 2. Navigate to /admin/orders. Check table renders with expected
    // header columns.
    await page.goto('/admin/orders');
    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 15_000 });
    for (const col of ['Date', 'Time', 'Contact', 'Type', 'Company', 'Tasting', 'Lunch', 'Visit', 'Masterclass', 'Food', 'Total', 'Status']) {
      await expect(page.getByRole('columnheader', { name: col, exact: true })).toBeVisible();
    }

    const fromInput = page.getByRole('textbox', { name: 'DD/MM/YYYY' }).first();
    const toInput = page.getByRole('textbox', { name: 'DD/MM/YYYY' }).nth(1);

    // Real bug fixed here: filling `fromInput` then `toInput` back-to-back
    // (no wait between them) intermittently lost the "From" value entirely —
    // both fields ended up empty and the table fell back to showing all 5
    // unfiltered orders (confirmed via a captured failure snapshot). The
    // filter state update appears to be debounced/URL-driven; waiting for
    // the URL to actually reflect the first field's value before touching
    // the second one avoids the race, same principle as elsewhere in this
    // suite (wait for the real state change, not a fixed sleep).
    async function setDateRange(from: string, fromIso: string, to: string, toIso: string) {
      await fromInput.fill(from);
      await page.waitForURL(new RegExp(`dateFrom=${fromIso}`), { timeout: 10_000 });
      await toInput.fill(to);
      await page.waitForURL(new RegExp(`dateTo=${toIso}`), { timeout: 10_000 });
    }

    // 3 & 4. Filter to a range containing zero known orders (a decade before
    // any real or seeded data). Check: empty state, not stale/unfiltered
    // rows — the literal regression check for KnownBugs #1 ("the original
    // bug was the filter silently doing nothing").
    await setDateRange('01/01/2015', '2015-01-01', '02/01/2015', '2015-01-02');
    await expect(page.getByText('No orders found.', { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('tbody tr')).toHaveCount(0);

    // 5 & 6. Filter to a range containing exactly the one seeded test order.
    // Check: row count is exactly 1, and its data matches the seeded order —
    // confirms the filter scopes by date, not by some other condition that
    // happens to correlate.
    await setDateRange(TEST_DATE_DISPLAY, TEST_DATE, TEST_DATE_DISPLAY, TEST_DATE);
    const rows = page.locator('tbody tr');
    await expect(rows).toHaveCount(1, { timeout: 15_000 });
    await expect(rows.first()).toContainText('15 Mar 2027');
    await expect(rows.first()).toContainText(TEST_EMAIL);

    // 7 & 8. Click the Table/Calendar view toggle. Check: a calendar-grid
    // element becomes visible and the table element is hidden/unmounted —
    // not just visually overlapped.
    //
    // Real finding: the calendar always opens on the *current real-world*
    // month (confirmed live: filtering to March 2027 and switching to
    // Calendar view showed "August 2026" — today's actual month at the time
    // this test ran), not the month of the active date filter. So this
    // checks for calendar-grid structure generically (month/year heading +
    // prev/next nav + weekday header row), not a specific month — asserting
    // a fixed month name would be both wrong today and would silently rot
    // as "today" drifts across month boundaries in future runs.
    await page.getByRole('button', { name: 'Calendar', exact: true }).click();
    await expect(page.locator('table')).toHaveCount(0);
    await expect(page.getByText(/^[A-Z][a-z]+ \d{4}$/)).toBeVisible();
    await expect(page.getByRole('button', { name: '‹', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '›', exact: true })).toBeVisible();

    // 9. Toggle back to Table view. Check: table reappears with the same
    // filtered result set as step 6 — the view toggle shouldn't reset the
    // active filter.
    await page.getByRole('button', { name: 'Table', exact: true }).click();
    await expect(page.locator('table')).toBeVisible();
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr').first()).toContainText(TEST_EMAIL);

    // 10. Cleanup: delete the seeded test order.
    await deleteTestOrderIfPresent(page);
  });
});
