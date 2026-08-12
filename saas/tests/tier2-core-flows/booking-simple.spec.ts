// spec: playwright/notes/04-booking-simple.md
import { test, expect, Page } from '@playwright/test';
import { loginAsTenantAdmin } from '../helpers/auth';

// Unique per test run so the admin-orders lookup can't collide with a
// leftover row from a previous failed run.
const TEST_EMAIL = `playwright-booking-simple-${Date.now()}@example.com`;

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// Real finding: loginAsTenantAdmin() always does page.goto('/admin/login'),
// which is fine on a fresh page — but the auth cookie is scoped to the
// browser *context*, not the page. If another page in the same context (e.g.
// the admin page used earlier in this same test) already authenticated,
// /admin/login just redirects straight to /admin/orders, and the email input
// loginAsTenantAdmin waits for never appears — it hangs until test timeout.
// This wraps it to be safe to call unconditionally, on any page, any number
// of times, in either a fresh or already-authenticated context.
async function ensureAdminLoggedIn(page: Page) {
  await page.goto('/admin/orders');
  if (page.url().includes('/admin/login')) {
    await loginAsTenantAdmin(page);
  } else {
    await expect(page).toHaveURL(/\/admin\/orders/);
  }
}

// Deletes the test order via admin if it still exists (assumes `page` is
// already on an authenticated admin page). Waits for the table itself first
// — a bare row.count() right after goto() can read 0 before the (cold, dev
// server) table has finished rendering, same root cause as the timeout bump
// above.
async function deleteTestOrderOnAdminPage(page: Page) {
  await page.goto('/admin/orders');
  await page.locator('table').waitFor({ timeout: 15_000 }).catch(() => {});
  const row = page.locator('tr', { hasText: TEST_EMAIL });
  if (await row.count() > 0) {
    await row.getByRole('button', { name: 'Delete order' }).click();
    await row.getByRole('button', { name: 'Yes' }).click();
    await expect(page.locator('tr', { hasText: TEST_EMAIL })).toHaveCount(0);
  }
}

test.describe('Booking form — simple/individual variant', () => {
  // Real finding: after the "Book & Pay" redirect lands on the real Flitt
  // payment gateway, that page's own scripts destabilize further navigation
  // on the same page object (goto after it intermittently aborts). All admin
  // verification below therefore happens on a fresh page from the same
  // browser context — the original page is simply abandoned on Flitt with no
  // further interaction (never entering card details, per this suite's rule
  // against any financial transaction).
  test.afterEach(async ({ context }, testInfo) => {
    // The test body's own step 9 already deletes the order it created — this
    // hook is a safety net for a body that failed before reaching that step,
    // not a guaranteed second cleanup pass. Skip the extra admin login +
    // navigation round trip when the body already passed (and therefore
    // already cleaned up) — there's nothing left to do.
    if (testInfo.status === 'passed') return;
    // Fresh page + fresh login every time — this hook must be safe to run
    // whether or not the test body already cleaned up and already logged in
    // on its own admin page (see deleteTestOrderOnAdminPage's doc comment).
    const page = await context.newPage();
    await ensureAdminLoggedIn(page);
    await deleteTestOrderOnAdminPage(page);
    await page.close();
  });

  test('individual booking: guest-count editing, past-hour slot filtering, submit, persists to admin, cleanup', async ({ page, context }) => {
    // Default 30s is tight for this flow: public form interaction + an
    // external payment-gateway redirect + a second page's admin login (the
    // Supabase Auth round trip alone can take up to 15s cold, per auth.ts).
    test.setTimeout(60_000);

    // 1. Navigate to the booking form (home page — the form is embedded there,
    // not a dedicated route; real finding, resolves the note's open question)
    await page.goto('/');

    const guestInput = page.getByRole('spinbutton', { name: 'Number of Guests (minimum 4)' });
    const dateInput = page.getByRole('textbox', { name: 'DD/MM/YYYY' });
    const timeSlot = page.getByRole('combobox');

    // Real finding: the real minimum is 4 (not 1), and the field defaults to
    // "4" rather than empty/0. It's a plain native <input type="number"> with
    // no custom keystroke handling (confirmed by reading BookingForm.tsx) —
    // KnownBugs #2 is genuinely fixed. The old repro ("type into an empty/0
    // field") no longer applies verbatim, so this adapts it: select-all first
    // (Ctrl+A, mirroring how a real user replaces an existing value) then type.
    await guestInput.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('12');
    // expect: typing after select-all replaces the value, doesn't prepend
    // (regression guard for KnownBugs #2, "typing prepends to 0")
    await expect(guestInput).toHaveValue('12');
    await page.keyboard.press('Backspace');
    // expect: backspace removes the last digit, doesn't reset to 0
    // (direct regression check for KnownBugs #2, "backspace resets to 0")
    await expect(guestInput).toHaveValue('1');
    await page.keyboard.type('3');
    // expect: typing at the (now end-of-field) cursor appends, doesn't prepend
    // — regression check for the other half of KnownBugs #2
    await expect(guestInput).toHaveValue('13');
    // Reset to a normal value before submitting.
    await guestInput.fill('4');

    // 3. On today's date, no past-hour time slot should be present in the
    // option list — direct regression check for KnownBugs #3. The component
    // computes `currentHour` client-side via `new Date().getHours()` and keeps
    // only slots with `hour > currentHour` (strictly greater — confirmed by
    // reading BookingForm.tsx), so we mirror that exact comparison here rather
    // than >=.
    //
    // Real bug fixed here: the original version assumed at least one future
    // slot always remains "today" and did parseInt(optionText) on every
    // option unconditionally. TIME_SLOTS tops out at 18:00 — once the actual
    // clock is past that (the last slot), BookingForm.tsx swaps the option
    // list for a single `<option value="">No slots available today</option>`
    // (form.no_slots) instead. parseInt() on that text returns NaN, and
    // `expect(NaN).toBeGreaterThan(currentHour)` is unconditionally false
    // (NaN comparisons are always false in JS) — so the test failed for a
    // reason that had nothing to do with a real regression, purely a
    // time-of-day fluke. Handle both real states explicitly instead of
    // assuming one of them.
    const today = new Date();
    await dateInput.fill(formatDate(today));
    const currentHour = await page.evaluate(() => new Date().getHours());
    const optionTexts = await timeSlot.locator('option').allTextContents();
    if (optionTexts.length === 1 && Number.isNaN(parseInt(optionTexts[0], 10))) {
      // expect: past the last slot (18:00) for today, the picker explicitly
      // says so rather than silently offering nothing / a stale slot.
      expect(optionTexts[0]).toBe('No slots available today');
    } else {
      for (const opt of optionTexts) {
        const hour = parseInt(opt, 10);
        expect(hour, `time slot "${opt}" should be strictly after the current hour (${currentHour})`).toBeGreaterThan(currentHour);
      }
    }

    // 4. Select a future date (tomorrow) instead, pick any available slot.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await dateInput.fill(formatDate(tomorrow));
    await timeSlot.selectOption('13:00');

    // 2. Fill name, email, phone fields with valid test values.
    await page.getByRole('textbox', { name: 'First Name' }).fill('Playwright');
    await page.getByRole('textbox', { name: 'Last Name' }).fill('SimpleTest');
    await page.getByRole('textbox', { name: 'Phone' }).fill('+995500000001');
    await page.getByRole('textbox', { name: 'Email' }).fill(TEST_EMAIL);

    // 6. Submit the form with valid data.
    //
    // Real finding, differs from the note's original assumption: individual
    // bookings do NOT show an inline confirmation element. "Book & Pay"
    // redirects the whole page to the real Flitt payment gateway
    // (pay.flitt.com) — the order is created server-side (status "Awaiting
    // Payment") before the redirect, so the flow can be verified without ever
    // entering card details (which this suite must never do — no financial
    // transactions). The redirect itself is the closest thing to a
    // "confirmation" this variant has.
    await Promise.all([
      // waitUntil: 'commit' — the Flitt page itself is slow/never reaches a
      // full "load" event within a reasonable timeout in this environment;
      // we only need to confirm the redirect started, not that the external
      // gateway finished rendering (we never interact with it further).
      page.waitForURL(/pay\.flitt\.com/, { timeout: 15_000, waitUntil: 'commit' }),
      page.getByRole('button', { name: 'Book & Pay' }).click(),
    ]);

    // 8. Cross-check via admin — confirms the submission actually persisted
    // server-side, not just that the client-side redirect fired. Uses a
    // fresh page (see describe-level comment) rather than continuing on the
    // page that's now sitting on the external Flitt gateway.
    const admin = await context.newPage();
    await ensureAdminLoggedIn(admin);
    const row = admin.locator('tr', { hasText: TEST_EMAIL });
    // Real finding: the dev server's first compile of a freshly-visited route
    // can take longer than the 5s default assertion timeout (confirmed via a
    // flaky first run — same "cold Next.js dev compile" shape noted in
    // auth.ts for the login round trip). Bumped, not networkidle/sleep.
    await expect(row).toBeVisible({ timeout: 15_000 });
    // expect: date matches what was submitted (admin table renders "11 Aug 2026" style)
    const adminDateText = tomorrow.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    await expect(row).toContainText(adminDateText);
    // expect: status is "Awaiting Payment" — order exists before payment completes
    await expect(row.getByRole('button', { name: /Awaiting Payment/ })).toBeVisible();

    // Guest count isn't a column on the Orders table for individual bookings
    // (Tasting/Lunch/Visit/Masterclass/Food are all "—" — those columns are
    // enhanced-booking-only). Open the order detail page to confirm the
    // persisted guest count instead.
    await row.click();
    // Real bug fixed here: this specific check was left on the 5s default
    // timeout while every other navigation check in this file was already
    // bumped to 15s for the same documented reason — the order-detail
    // route's first compile in a fresh dev-server process routinely takes
    // 8-10s on its own (confirmed in a passing run's server log: "GET
    // /admin/orders/[id] 200 in 9.4s"), before the actual data fetch. Earlier
    // runs only passed because that route happened to already be warm from a
    // prior test in the same dev-server session; a genuinely fresh server
    // exposed the gap. Not a DB-pool-exhaustion symptom — a plain missed
    // timeout bump.
    await expect(admin).toHaveURL(/\/admin\/orders\/[a-zA-Z0-9]+/, { timeout: 15_000 });
    const totalGuestsLabel = admin.getByText('Total guests', { exact: true });
    await expect(totalGuestsLabel).toBeVisible({ timeout: 15_000 });
    const totalGuestsValue = totalGuestsLabel.locator('xpath=following-sibling::*[1]');
    await expect(totalGuestsValue).toHaveText('4');
    await expect(admin.getByText(TEST_EMAIL)).toBeVisible();

    // 9. Cleanup: delete the test order via admin (afterEach also does this
    // as a safety net, but doing it here too matches the note's documented
    // steps and gives an explicit assertion of successful deletion). `admin`
    // is already logged in from step 8 above — no second login needed.
    await deleteTestOrderOnAdminPage(admin);
    await admin.close();
  });
});
