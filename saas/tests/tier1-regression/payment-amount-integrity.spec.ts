// spec: guards the money path itself — does the amount that actually reaches
// Flitt (via startCheckout.ts -> createCheckout -> toMinorUnits) match what
// the guest was quoted, across every enable/disable combination in
// shouldTakePayment.ts (#148)? payment-label-precedence.spec.ts already
// covers the button-label precedence in isolation; this file complements it
// by driving each flow all the way to a real Flitt checkout (or confirming
// no checkout is created) and cross-checking the amount in the admin panel.
//
// Real finding while building this (2026-09-15): Feature 184 (2026-09-14)
// inserted a "Review your visit" confirm sheet between the booking form's
// submit button and the actual createBooking() call, for BOTH individual and
// company bookings. booking-simple.spec.ts and booking-enhanced.spec.ts
// predated that change and clicked the submit button expecting an immediate
// redirect / "Booking received!" heading.
//   → CONFIRMED and FIXED 2026-09-19: both were genuinely broken, each
//     failing on a 15s timeout that read like a hang rather than a stale
//     assertion. The sheet-opening step now lives in helpers/bookingForm.ts
//     and all three specs share it. company-guide-code.spec.ts was checked
//     too and is unaffected — it never submits the form, stopping at the
//     guide-code autofill assertions.
// Wine orders (submitWineOrder.ts) were NOT changed by #184 and still submit
// directly on the one button click.
//
// Historical finding, NO LONGER TRUE (kept because the workaround below still
// reads as deliberate): on 2026-09-15 Staging Winery's "Wine Tasting maximum"
// guest cap (3) was configured BELOW "Wine Tasting minimum" (4), silently
// clamping any 4-5 guest Wine Tasting booking to 3 before pricing (confirmed
// live: a 5-guest submission settled at 150GEL/3 guests, not 250GEL/5). That
// was KnownBugs #40 — fixed 2026-09-16 in SettingsClient.tsx's
// handleBookingRuleSave() (a max below its own min is now rejected), and the
// live bad data cleared to "no limit" the same day. The individual-booking
// test below still uses "Tasting + Lunch" rather than "Wine Tasting"; that is
// now just an arbitrary-but-harmless choice, not a workaround.
//
// Real finding: every scenario here uses a DEDICATED, throwaway page for the
// public-facing form, never the admin `page` fixture. booking-simple.spec.ts
// already documented why: once a page has been redirected to the real Flitt
// gateway, that page's own scripts "destabilize further navigation on the
// same page object (goto after it intermittently aborts)". The first run of
// this file learned the harder version of that lesson — reusing the same
// page for a second scenario right after a Flitt redirect didn't just abort,
// it hung for the full test timeout. `page` in every test below is reserved
// for /admin/* only (settings, company overrides, order verification) and
// never once navigates to the public site.
import { test, expect, Page } from '@playwright/test';
import { loginAsTenantAdmin } from '../helpers/auth';
import {
  readPaymentSectionToggle, setPaymentSectionToggle,
  readShowCompanyPriceToggle, setShowCompanyPriceToggle,
  readCompanyPaymentOverride, setCompanyPaymentOverride,
  readCompanyAccessCode, readFlittMerchantId, setFlittMerchantId,
  clickUntil, PaymentOverride,
} from '../helpers/payments';
import { openReviewSheet, abandonedRow } from '../helpers/bookingForm';

// Every test in this file mutates the SAME tenant-wide payment settings
// (section toggles, a company's payment override, the Flitt merchant ID) —
// unlike a test that only reads state or writes its own isolated row, running
// two of these concurrently is a real correctness hazard, not just a
// performance one: one test's toggle flip can land mid-assertion in another.
// Serial mode also sidesteps a real finding from the first run of this file:
// 4 workers each opening their own heavy sequential admin-mutation flow
// against the dev DB's connection pool produced a genuine
// "Transaction already closed" Prisma error during login itself (not a bug
// in this file's own logic) — running one at a time avoids that too.
test.describe.configure({ mode: 'serial' });

// Fixture companies, seeded by lib/demoSeed.ts and given their access codes by
// scripts/backfill-test-fixtures.ts (2026-09-19).
//
// These replaced the hand-made `Test Company # 1` / `Wine Test Company`, which
// the Feature 191 wipe deleted on 2026-09-18 — taking this spec and four others
// down with them, unnoticed, because nothing outside a SessionLog entry recorded
// it. Seeded companies are the more durable choice: their names, tiers and codes
// are constants in demoSeed.ts, so a refill restores them exactly rather than
// requiring someone to rebuild a company from memory.
//
// Each spec that mutates company-level settings uses a DIFFERENT company, so two
// specs can never fight over the same payment override.
//
// This spec needs one booking company and one wine-order company. It does NOT
// hardcode any price: it reads the quoted total off the form and asserts that
// same number reaches Flitt and then the admin panel, so a company with
// different rate tiers changes nothing here.
const COMPANY_NAME = 'Caucasus Vine Travel';
const WINE_COMPANY_NAME = 'Sighnaghi Wine Bar';

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

async function deleteTestOrderOnAdminPage(page: Page, marker: string) {
  await page.goto('/admin/orders');
  await page.locator('table').waitFor({ timeout: 15_000 }).catch(() => {});
  const row = page.locator('tr', { hasText: marker });
  if (await row.count() > 0) {
    await row.getByRole('button', { name: 'Delete order' }).click();
    await row.getByRole('button', { name: 'Yes' }).click();
    await expect(page.locator('tr', { hasText: marker })).toHaveCount(0);
  }
}

// `abandonedRow` was defined locally here until 2026-09-19. It moved to
// helpers/bookingForm.ts unchanged: booking-simple.spec.ts had a subtly
// different (and broken) copy of the same idea, which is exactly the kind of
// divergence a shared helper prevents. The reasoning for the `has:` filter
// lives with it there.

/** Bring an incomplete order back, then delete it from the main table. */
async function restoreAndDeleteAbandoned(page: Page, marker: string) {
  await page.goto('/admin/abandoned')
  const row = abandonedRow(page, marker)
  if (await row.count() > 0) {
    await row.getByRole('button', { name: 'Restore without payment' }).click()
    await expect(abandonedRow(page, marker)).toHaveCount(0, { timeout: 15_000 })
  }
  await deleteTestOrderOnAdminPage(page, marker)
}

// `cancelWineOrderOnAdminPage` was removed 2026-09-19. All three wine scenarios
// now skip cleanup: the two reservation-only ones never enter payment limbo, so
// WineOrdersClient.tsx renders no "Cancelled" control for them (documented at
// each call site below), and the paid one stays on the Incomplete screen where
// it belongs. The helper had also gone stale — it filtered on an "Awaiting
// Payment" control Feature 191 removed — so keeping it would have meant dead
// code describing a screen that no longer works that way. Wine-order debris
// still needs the periodic manual sweep KNOWN-ISSUES.md documents; there is
// still no delete action on that admin screen.

// `openReviewSheet` was defined locally here until 2026-09-19. It moved to
// helpers/bookingForm.ts unchanged, once booking-simple.spec.ts and
// booking-enhanced.spec.ts turned out to need exactly the same step — the
// whole reason they were broken. The reasoning that shaped it (why it stops
// short of the confirm click, why the click is retried) lives with it there.

test.describe('Individual booking — payment on/off carries the correct amount to Flitt', () => {
  test('payment ON: redirects to Flitt with the exact quoted amount; payment OFF: reservation-only, no checkout', async ({ page, context }) => {
    test.setTimeout(120_000);
    await loginAsTenantAdmin(page);
    const original = await readPaymentSectionToggle(page, 'Individual bookings');

    async function submitIndividualBooking(formPage: Page, marker: string, email: string) {
      await formPage.goto('/');
      await formPage.getByRole('button', { name: 'Tasting + Lunch', exact: false }).click();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      await formPage.getByRole('textbox', { name: 'DD/MM/YYYY' }).fill(formatDate(tomorrow));
      await formPage.getByRole('combobox').selectOption({ index: 1 });
      await formPage.getByRole('spinbutton', { name: 'Number of Guests (minimum 4)' }).fill('4');
      await formPage.getByRole('textbox', { name: 'First Name' }).fill('ZZPaymentIntegrity');
      await formPage.getByRole('textbox', { name: 'Last Name' }).fill(marker);
      await formPage.getByRole('textbox', { name: 'Phone' }).fill('+995500000021');
      await formPage.getByRole('textbox', { name: 'Email' }).fill(email);

      // Read the rate straight off the confirmed total, rather than
      // hardcoding a price this tenant could change independently of this
      // regression's real subject (does the shown amount reach Flitt intact).
      const totalText = await formPage.getByText('Total', { exact: true }).locator('xpath=../following-sibling::*[1]').textContent();
      const expectedTotal = parseInt(totalText || '0', 10);
      expect(expectedTotal, 'quoted total should be a real positive amount').toBeGreaterThan(0);
      return expectedTotal;
    }

    try {
      // ── ON ────────────────────────────────────────────────────────────────
      await setPaymentSectionToggle(page, 'Individual bookings', true);
      const emailOn = `zz-payment-integrity-on-${Date.now()}@example.invalid`;
      const formPageOn = await context.newPage();
      const expectedTotalOn = await submitIndividualBooking(formPageOn, 'On', emailOn);
      await openReviewSheet(formPageOn, 'Book & Pay');
      await Promise.all([
        formPageOn.waitForURL(/pay\.flitt\.com/, { timeout: 15_000, waitUntil: 'commit' }),
        formPageOn.getByRole('button', { name: 'Confirm & Book' }).click(),
      ]);
      // formPageOn is now abandoned on the real gateway — never touched again.

      // Being sent to the gateway marks the order incomplete, so it is on the
      // Incomplete screen rather than in the orders table (Feature 191).
      await page.goto('/admin/abandoned');
      const rowOn = abandonedRow(page, emailOn);
      await expect(rowOn).toBeVisible({ timeout: 15_000 });
      // expect: the order the server actually priced and sent to Flitt shows
      // the exact same amount that was quoted to the guest. This is the whole
      // point of the spec and it survives the screen move unchanged.
      //
      // Whitespace is stripped before comparing because this screen renders
      // money with a space before the symbol ("480 ₾") while the orders table
      // does not ("480₾") — both come from formatTetri, which takes the
      // separator as an option. The assertion is about the amount, not the
      // spacing, so it should not care which screen it is reading.
      const rowOnText = (await rowOn.textContent()) ?? '';
      expect(rowOnText.replace(/\s+/g, '')).toContain(`${expectedTotalOn}₾`);
      // expect: and it is NOT sitting in the orders table pretending to be live.
      await page.goto('/admin/orders');
      await expect(page.locator('tr', { hasText: emailOn })).toHaveCount(0);
      await restoreAndDeleteAbandoned(page, emailOn);
      await formPageOn.close();

      // ── OFF ───────────────────────────────────────────────────────────────
      await setPaymentSectionToggle(page, 'Individual bookings', false);
      const emailOff = `zz-payment-integrity-off-${Date.now()}@example.invalid`;
      const formPageOff = await context.newPage();
      const expectedTotalOff = await submitIndividualBooking(formPageOff, 'Off', emailOff);
      await openReviewSheet(formPageOff, 'Request Booking');
      await formPageOff.getByRole('button', { name: 'Confirm & Request Booking' }).click();
      // expect: no redirect anywhere near the payment gateway — reservation-
      // only submits and shows the inline confirmation instead.
      await expect(formPageOff.getByRole('heading', { name: 'Booking received!' })).toBeVisible({ timeout: 15_000 });
      expect(formPageOff.url()).not.toMatch(/pay\.flitt\.com/);
      await formPageOff.close();

      await page.goto('/admin/orders');
      const rowOff = page.locator('tr', { hasText: emailOff });
      await expect(rowOff).toBeVisible({ timeout: 15_000 });
      // expect: same price computed either way (the toggle changes whether
      // payment is collected, never what the order is priced at) — it just
      // never reaches a Payment/checkout row.
      await expect(rowOff).toContainText(`${expectedTotalOff}₾`);
      // expect: a reservation-only booking never went to the gateway, so it is
      // a live order and nothing about it is incomplete. (The old assertion
      // here looked for an "Awaiting Payment" control, which Feature 191
      // removed entirely — it passed vacuously rather than checking anything.)
      await page.goto('/admin/abandoned');
      await expect(page.getByText(emailOff)).toHaveCount(0);
      await deleteTestOrderOnAdminPage(page, emailOff);
    } finally {
      await setPaymentSectionToggle(page, 'Individual bookings', original);
    }
  });
});

test.describe('Company booking — section × per-company override × hidden-price precedence, with real amounts', () => {
  test('Default follows the section; an override always wins; a hidden price hard-blocks even "Always require"', async ({ page, context }) => {
    // Real finding: 5 sequential scenarios, each a full settings/override
    // change + form fill + review sheet + (sometimes) a real Flitt redirect
    // + admin verify + cleanup, routinely takes ~5 minutes end to end on this
    // dev server — a 300s budget cut off cleanup after every scenario's own
    // assertion had already passed. 480s leaves real headroom rather than
    // trimming the scenario count to fit an arbitrary budget.
    test.setTimeout(480_000);
    await loginAsTenantAdmin(page);

    const originalSection = await readPaymentSectionToggle(page, 'Company bookings');
    const originalOverride = await readCompanyPaymentOverride(page, COMPANY_NAME);
    const originalShowPrice = await readShowCompanyPriceToggle(page);
    const accessCode = await readCompanyAccessCode(page, COMPANY_NAME);
    expect(accessCode, `${COMPANY_NAME} must have a real access code set for this test to run`).not.toBe('');

    // Returns the quoted total, and whether the flow actually redirected to
    // Flitt — the client's button label is only a hint (isPaymentConfigured()
    // without full section/company context in some callers); the server
    // (shouldTakePayment()) is the real gate, so every scenario below asserts
    // on what actually happened, never on the label alone.
    async function submitCompanyBooking(formPage: Page, marker: string): Promise<{ total: number; redirected: boolean }> {
      await formPage.goto('/');
      await formPage.getByRole('button', { name: 'Tour Company' }).click();
      await formPage.getByRole('combobox').first().selectOption({ label: COMPANY_NAME });
      await formPage.getByRole('heading', { name: 'Enter your company code' }).waitFor();
      await formPage.getByRole('textbox', { name: 'e.g. MARANI42' }).fill(accessCode);
      await formPage.getByRole('button', { name: 'Confirm', exact: true }).click();
      await expect(formPage.getByRole('heading', { name: 'Enter your company code' })).not.toBeVisible();

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      await formPage.getByRole('textbox', { name: 'DD/MM/YYYY' }).fill(formatDate(tomorrow));
      // Real bug caught here: this form has TWO comboboxes once a company is
      // selected (the company picker, then Time Slot) — an earlier version
      // called `.first()` intending Time Slot and actually hit the company
      // picker instead, silently reassigning it to "+ New Company" (index 1
      // in that list) and popping the New-Company modal, which then blocked
      // every subsequent submit click. Time Slot auto-selects a default
      // option once a date is filled (confirmed live), so there's no need to
      // touch it explicitly at all — leave it at that default instead of
      // guessing which combobox is which.
      await formPage.getByRole('spinbutton').first().fill('4'); // Tasting guest count
      await formPage.getByRole('textbox', { name: 'First Name' }).fill('ZZPaymentIntegrity');
      await formPage.getByRole('textbox', { name: 'Last Name' }).fill(marker);
      await formPage.getByRole('textbox', { name: 'Phone' }).fill('+995500000023');
      await formPage.getByRole('textbox', { name: 'Email' }).fill(`zz-${marker.toLowerCase()}-${Date.now()}@example.invalid`);

      const submitBtn = formPage.getByRole('button', { name: /^(Book & Pay|Request Booking)$/ });
      const reviewHeading = formPage.getByRole('heading', { name: 'Review your visit' });
      // clickUntil, not a plain click — see openReviewSheet's comment above
      // for the real finding this guards against on this exact button.
      await clickUntil(submitBtn, () => expect(reviewHeading).toBeVisible({ timeout: 3_000 }));
      // The review sheet always shows a total, even when the pre-submit form
      // hid one (§7.4's hidden-price rule only governs what the CUSTOMER'S
      // post-payment confirmation screen shows, not this pre-submit recap).
      const totalText = await formPage.getByText('Total', { exact: true }).last().locator('xpath=following-sibling::*[1]').textContent();
      const total = parseInt(totalText || '0', 10);

      const confirmBtn = formPage.getByRole('button', { name: /^Confirm & /, exact: false });
      const confirmLabel = (await confirmBtn.textContent()) || '';

      if (confirmLabel.includes('Book')) {
        // Real finding: company createBooking() calls routinely take 6-9s
        // server-side (confirmed in dev-server logs) before Flitt is even
        // reached — an earlier 8s timeout here read as "didn't redirect" on
        // a scenario that, given a few more seconds, would have. 20s matches
        // the other real Flitt waits in this file.
        const nav = formPage.waitForURL(/pay\.flitt\.com/, { timeout: 20_000, waitUntil: 'commit' }).then(() => true).catch(() => false);
        await confirmBtn.click();
        return { total, redirected: await nav };
      }
      await confirmBtn.click();
      await expect(formPage.getByRole('heading', { name: 'Booking received!' })).toBeVisible({ timeout: 15_000 });
      return { total, redirected: false };
    }

    /**
     * Where the order ends up depends on whether it was sent to the gateway.
     *
     * Since Feature 191 (2026-09-18) an order that reached the card gateway and
     * has not paid is stamped `abandonedAt` and leaves `/admin/orders` entirely
     * — it lives on the Incomplete screen until someone restores it. The old
     * shape here looked in the orders table for BOTH cases and asserted on an
     * "Awaiting Payment" control that Feature 191 removed.
     *
     * Fixed 2026-09-19, mirroring the individual-booking test above, which had
     * already been updated. This one had not — and could not have been caught,
     * because it was unrunnable the whole time: its fixture company had been
     * deleted, so it failed in setup long before reaching this assertion. Two
     * independent staleness bugs stacked on one test, the outer one hiding the
     * inner.
     */
    async function verifyAndCleanup(marker: string, expectPaid: boolean, expectedAmount: number) {
      if (expectPaid) {
        await page.goto('/admin/abandoned');
        const row = abandonedRow(page, marker);
        await expect(row).toBeVisible({ timeout: 15_000 });
        // Whitespace-insensitive: the Incomplete screen renders money with a
        // space before the symbol ("480 ₾"), the orders table without one —
        // same formatTetri, different separator option. The assertion is about
        // the amount, not the spacing.
        expect(((await row.textContent()) ?? '').replace(/\s+/g, '')).toContain(`${expectedAmount}₾`);
        // expect: and it is NOT in the orders table pretending to be live.
        await page.goto('/admin/orders');
        await expect(page.locator('tr', { hasText: marker })).toHaveCount(0);
        await restoreAndDeleteAbandoned(page, marker);
        return;
      }

      // Reservation-only: never went to a gateway, so it is a normal order.
      await page.goto('/admin/orders');
      const row = page.locator('tr', { hasText: marker });
      await expect(row).toBeVisible({ timeout: 15_000 });
      await expect(row).toContainText(`${expectedAmount}₾`);
      // expect: and it is not sitting on the Incomplete screen either.
      await page.goto('/admin/abandoned');
      await expect(abandonedRow(page, marker)).toHaveCount(0);
      await deleteTestOrderOnAdminPage(page, marker);
    }

    /**
     * Scenario markers must be unique per RUN, not just per scenario.
     *
     * `marker` is typed into the booking form's Last Name field and is then the
     * only handle this test has for finding and deleting its own order. It used
     * to be a bare literal ('DefaultOn'), identical on every run — so any run
     * that died before cleanup left a `DefaultOn` order behind, and the NEXT
     * run's `expect(...).toHaveCount(0)` could never pass: it restored one row
     * while its predecessors' rows still matched. The failure surfaces one run
     * later than the run that caused it, which makes it read like a flake.
     *
     * The individual-booking test above already avoided this by putting
     * `Date.now()` in its email. Doing the same here, once per run so all five
     * scenarios share a suffix and a manual sweep can find them together.
     */
    const runId = String(Date.now()).slice(-6);
    const scenarioMarker = (name: string) => `${name}${runId}`;

    async function runScenario(name: string, expectPaid: boolean) {
      const marker = scenarioMarker(name);
      const formPage = await context.newPage();
      const { total, redirected } = await submitCompanyBooking(formPage, marker);
      expect(redirected, `${marker}: expected redirected=${expectPaid}, got ${redirected}`).toBe(expectPaid);
      await verifyAndCleanup(marker, expectPaid, total);
      await formPage.close();
    }

    try {
      // 1. No override (Default) + section ON → paid, correct amount reaches Flitt.
      await setCompanyPaymentOverride(page, COMPANY_NAME, 'Default');
      await setShowCompanyPriceToggle(page, true);
      await setPaymentSectionToggle(page, 'Company bookings', true);
      await runScenario('DefaultOn', true);

      // 2. No override (Default) + section OFF → reservation-only.
      await setPaymentSectionToggle(page, 'Company bookings', false);
      await runScenario('DefaultOff', false);

      // 3. "Always skip" beats an ON section.
      await setPaymentSectionToggle(page, 'Company bookings', true);
      await setCompanyPaymentOverride(page, COMPANY_NAME, 'Always skip');
      await runScenario('AlwaysSkip', false);

      // 4. "Always require" beats an OFF section.
      await setPaymentSectionToggle(page, 'Company bookings', false);
      await setCompanyPaymentOverride(page, COMPANY_NAME, 'Always require');
      await runScenario('AlwaysRequire', true);

      // 5. Hidden price is a hard block (Plan-OnlinePayment §7.4) — it beats
      // even "Always require", because charging an amount the guest was
      // never shown is a chargeback waiting to happen. Override left at
      // "Always require" from step 4 on purpose, to prove the block outranks
      // the single strongest override, not just the section default.
      await setShowCompanyPriceToggle(page, false);
      await runScenario('HiddenPriceBlock', false);
    } finally {
      await setCompanyPaymentOverride(page, COMPANY_NAME, originalOverride as PaymentOverride);
      await setPaymentSectionToggle(page, 'Company bookings', originalSection);
      await setShowCompanyPriceToggle(page, originalShowPrice);
    }
  });
});

test.describe('Wine orders — payment on/off, and a company override applies here too', () => {
  test('payment ON pays the exact cart total; payment OFF reserves; a company\'s "Always skip" override applies to wine orders as well', async ({ page, context }) => {
    // Real finding, same shape as the Company test above: 3 scenarios each
    // involving a real form flow (and sometimes a Flitt redirect) routinely
    // takes close to 180s end to end, leaving no room for final cleanup.
    test.setTimeout(300_000);
    await loginAsTenantAdmin(page);
    const originalToggle = await readPaymentSectionToggle(page, 'Wine orders');
    const originalOverride = await readCompanyPaymentOverride(page, WINE_COMPANY_NAME);
    const wineAccessCode = await readCompanyAccessCode(page, WINE_COMPANY_NAME);
    expect(wineAccessCode, `${WINE_COMPANY_NAME} must have a real access code set for this test to run`).not.toBe('');

    async function addOneRkatsiteli2026(formPage: Page): Promise<number> {
      await formPage.goto('/wines');
      const card = formPage
        .locator('div.rounded-xl.border.overflow-hidden.flex.flex-col')
        .filter({ has: formPage.locator('p', { hasText: /^Rkatsiteli$/ }) })
        .filter({ hasText: '2026' });
      const priceText = await card.getByText('₾', { exact: false }).first().textContent();
      const unitPrice = parseInt(priceText || '0', 10);
      expect(unitPrice).toBeGreaterThan(0);
      await card.getByRole('button', { name: '+', exact: true }).click();
      return unitPrice;
    }

    try {
      // ── ON, no company ───────────────────────────────────────────────────
      await setPaymentSectionToggle(page, 'Wine orders', true);
      const formPageOn = await context.newPage();
      const unitPriceOn = await addOneRkatsiteli2026(formPageOn);
      await formPageOn.getByRole('button', { name: 'Checkout →', exact: true }).click();
      const businessOn = `ZZ Wine Integrity On ${Date.now()}`;
      await formPageOn.getByRole('textbox', { name: 'Bar, restaurant, or individual name' }).fill(businessOn);
      await formPageOn.getByRole('textbox', { name: 'Actual address of bar / restaurant' }).fill('1 Test Street');
      await formPageOn.getByRole('textbox', { name: 'Contact person full name' }).fill('ZZ Wine Contact');
      await formPageOn.getByRole('textbox', { name: 'Contact person phone number' }).fill('+995500000031');
      await formPageOn.getByRole('textbox', { name: /Email address/ }).fill(`zz-wine-on-${Date.now()}@example.invalid`);
      await Promise.all([
        formPageOn.waitForURL(/pay\.flitt\.com/, { timeout: 15_000, waitUntil: 'commit' }),
        formPageOn.getByRole('button', { name: 'Order & Pay', exact: true }).click(),
      ]);
      await formPageOn.close();

      // Feature 191 (2026-09-18) applies to wine orders exactly as it does to
      // bookings: `WineOrder.abandonedAt` is stamped when the order is sent to
      // the card gateway, and /admin/abandoned lists both kinds through the
      // same Row component. This block used to look on /admin/wine-orders and
      // filter by an "Awaiting Payment" control that Feature 191 removed, so it
      // could never find the card. Fixed 2026-09-19 — the fourth stale spot
      // from that one feature in this file, each hidden behind the one before.
      await page.goto('/admin/abandoned');
      const cardOn = abandonedRow(page, businessOn);
      await expect(cardOn).toBeVisible({ timeout: 20_000 });
      // Whitespace-stripped: this screen renders money via
      // formatTetri(..., { space: true }) — "480 ₾" — while the wine-orders
      // table does not. The assertion is about the amount, not the spacing.
      expect(((await cardOn.textContent()) ?? '').replace(/\s+/g, '')).toContain(`${unitPriceOn}₾`);
      // Deliberately NOT restored-and-cancelled. Restoring returns the order to
      // a plain pending state, and WineOrdersClient.tsx only offers a
      // "Cancelled" control for orders in payment limbo (its `isLimbo` branch)
      // — so cancelling it afterwards would find the card and then time out
      // waiting for a button that is not rendered, exactly as documented for
      // the OFF case below. Leaving it on the Incomplete screen is also the
      // honest state: it IS an abandoned checkout. The business name carries a
      // Date.now() suffix, so runs never collide; this adds one row per run to
      // the wine-order debris that KNOWN-ISSUES.md already flags for a periodic
      // manual sweep.

      // ── OFF, no company ──────────────────────────────────────────────────
      await setPaymentSectionToggle(page, 'Wine orders', false);
      const formPageOff = await context.newPage();
      await addOneRkatsiteli2026(formPageOff);
      await formPageOff.getByRole('button', { name: 'Place Reservation →', exact: true }).click();
      const businessOff = `ZZ Wine Integrity Off ${Date.now()}`;
      await formPageOff.getByRole('textbox', { name: 'Bar, restaurant, or individual name' }).fill(businessOff);
      await formPageOff.getByRole('textbox', { name: 'Actual address of bar / restaurant' }).fill('1 Test Street');
      await formPageOff.getByRole('textbox', { name: 'Contact person full name' }).fill('ZZ Wine Contact');
      await formPageOff.getByRole('textbox', { name: 'Contact person phone number' }).fill('+995500000032');
      await formPageOff.getByRole('button', { name: 'Place Reservation', exact: true }).click();
      await expect(formPageOff.getByRole('heading', { name: 'Order received!' })).toBeVisible({ timeout: 15_000 });
      expect(formPageOff.url()).not.toMatch(/pay\.flitt\.com/);
      await formPageOff.close();
      // No cleanup call here — real finding: WineOrdersClient.tsx only
      // renders a "Cancelled" control for orders in payment limbo
      // (pending_payment/payment_failed, its `isLimbo` branch). A plain
      // reservation like this one (status stays 'pending') has no cancel
      // action at all, only the Pending→Confirmed→Paid→Delivered stepper —
      // calling cancelWineOrderOnAdminPage on it finds the card but never
      // finds a "Cancelled" button, and the click just times out. Matches
      // this admin page's already-documented limitation (wine-catalogue-order.spec.ts:
      // "Wine Orders has no delete action at all... only status
      // transitions") — it turns out that's even true of "Cancelled" itself
      // for a plain reservation. Left as accepted test debris, same as any
      // other reservation-only order this suite creates elsewhere.

      // ── ON, but the company is "Always skip" ────────────────────────────
      await setPaymentSectionToggle(page, 'Wine orders', true);
      await setCompanyPaymentOverride(page, WINE_COMPANY_NAME, 'Always skip');
      const formPageCo = await context.newPage();
      await addOneRkatsiteli2026(formPageCo);
      await formPageCo.getByRole('button', { name: 'Checkout →', exact: true }).click();
      await formPageCo.getByRole('combobox').selectOption(WINE_COMPANY_NAME);
      await formPageCo.getByRole('heading', { name: 'Enter your company code' }).waitFor();
      await formPageCo.getByRole('textbox', { name: 'e.g. MARANI42' }).fill(wineAccessCode);
      await formPageCo.getByRole('button', { name: 'Confirm', exact: true }).click();
      // expect: the per-company override reaches wine orders too (documented
      // in the Edit-Company panel's own copy: "Covers both bookings and wine
      // orders for this company") — the section toggle is ON, but this
      // company must still fall back to a plain reservation.
      await expect(formPageCo.getByRole('button', { name: 'Place Reservation →', exact: true })).toBeVisible();
      await formPageCo.getByRole('textbox', { name: 'Contact person phone number' }).fill('+995500000033');
      await formPageCo.getByRole('button', { name: 'Place Reservation', exact: true }).click();
      await expect(formPageCo.getByRole('heading', { name: 'Order received!' })).toBeVisible({ timeout: 15_000 });
      expect(formPageCo.url()).not.toMatch(/pay\.flitt\.com/);
      await formPageCo.close();
      // No cleanup call here either — same reason as the OFF scenario above:
      // this order also never enters payment limbo, so it has no "Cancelled"
      // control.
    } finally {
      await setPaymentSectionToggle(page, 'Wine orders', originalToggle);
      await setCompanyPaymentOverride(page, WINE_COMPANY_NAME, originalOverride as PaymentOverride);
    }
  });
});

test.describe('Missing Flitt credentials degrade safely, even with the module and toggle both on', () => {
  test('a blank merchant ID falls back to reservation-only, matching a configured-but-declined state', async ({ page, context }) => {
    test.setTimeout(90_000);
    await loginAsTenantAdmin(page);
    const originalToggle = await readPaymentSectionToggle(page, 'Individual bookings');
    // Merchant ID is ordinary text (unlike the write-only secret key), so the
    // real value can be read back and restored exactly — never touch the
    // secret key field for this test, it cannot be recovered once cleared.
    const originalMerchantId = await readFlittMerchantId(page);
    expect(originalMerchantId, 'this test needs a real merchant ID configured to blank/restore').not.toBe('');

    try {
      await setPaymentSectionToggle(page, 'Individual bookings', true);
      await setFlittMerchantId(page, '');

      const formPage = await context.newPage();
      await formPage.goto('/');
      // expect: isPaymentConfigured() requires BOTH credentials — module and
      // section toggle being on is not enough, so the label must already
      // read the safe/reservation-only variant before anything is submitted.
      await expect(formPage.getByRole('button', { name: 'Request Booking', exact: true })).toBeVisible({ timeout: 15_000 });
      await expect(formPage.getByRole('button', { name: 'Book & Pay', exact: true })).toHaveCount(0);
      await formPage.close();
    } finally {
      await setFlittMerchantId(page, originalMerchantId);
      await setPaymentSectionToggle(page, 'Individual bookings', originalToggle);
    }

    // Restore is verified, not just attempted — a failed restore here would
    // leave the tenant's real payment credentials broken for actual guests.
    await expect(async () => expect(await readFlittMerchantId(page)).toBe(originalMerchantId)).toPass({ timeout: 10_000 });
  });
});
