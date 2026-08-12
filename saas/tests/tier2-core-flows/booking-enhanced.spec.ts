// spec: playwright/notes/05-booking-enhanced.md
import { test, expect, Page } from '@playwright/test';
import { loginAsTenantAdmin } from '../helpers/auth';

// Reuses an existing real test company rather than creating one (per the
// note's instruction to minimize footprint): "Test Company # 1" already has
// two price tiers (1–10 guests: Tasting 50₾/pp + Lunch 30₾/pp; 11–20 guests:
// Tasting 30₾/pp + Lunch 20₾/pp — confirmed live via /admin/companies) and a
// real access code, and unlike some of the tenant's other test companies it
// is NOT flagged "⚠ Needs details", so it's safe to treat as stable fixture
// data. The access code itself is read fresh from the admin panel below
// rather than hardcoded, in case it's ever regenerated.
const COMPANY_NAME = 'Test Company # 1';
const TEST_EMAIL = `playwright-booking-enhanced-${Date.now()}@example.com`;

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// See booking-simple.spec.ts for why this exists: loginAsTenantAdmin() hangs
// if called on a page whose browser context is already authenticated.
async function ensureAdminLoggedIn(page: Page) {
  await page.goto('/admin/orders');
  if (page.url().includes('/admin/login')) {
    await loginAsTenantAdmin(page);
  } else {
    await expect(page).toHaveURL(/\/admin\/orders/);
  }
}

async function deleteTestOrderOnAdminPage(page: Page) {
  await page.goto('/admin/orders');
  // Real finding: a cold Next.js dev-server compile on a route's first visit
  // can outlast the 5s default assertion timeout (see booking-simple.spec.ts).
  await page.locator('table').waitFor({ timeout: 15_000 }).catch(() => {});
  const row = page.locator('tr', { hasText: TEST_EMAIL });
  if (await row.count() > 0) {
    await row.getByRole('button', { name: 'Delete order' }).click();
    await row.getByRole('button', { name: 'Yes' }).click();
    await expect(page.locator('tr', { hasText: TEST_EMAIL })).toHaveCount(0);
  }
}

test.describe('Booking form — enhanced/company variant', () => {
  test.afterEach(async ({ context }, testInfo) => {
    // The test body's own step 9 already deletes the order it created — this
    // hook is a safety net for a body that failed before reaching that step.
    // Skip the extra admin login + navigation round trip on a pass, where
    // there's nothing left to clean up.
    if (testInfo.status === 'passed') return;
    const page = await context.newPage();
    await ensureAdminLoggedIn(page);
    await deleteTestOrderOnAdminPage(page);
    await page.close();
  });

  test('company booking with enhanced form: split guest counts, hot dish, masterclass survive to admin', async ({ page, context }) => {
    // Generous budget: this flow does more admin round trips than
    // booking-simple.spec.ts (settings check + company lookup + order
    // verify + cleanup, on top of the public form itself), each of which
    // can hit a slow first-visit dev-server compile (see booking-simple's
    // "Real finding" comment on the same root cause).
    test.setTimeout(90_000);

    // 1. Confirm `enable_enhanced_company_booking` is on. Real finding: on
    // Staging Winery it's already permanently on (confirmed live via the
    // toggle's own style — translateX(22px) + var(--color-brand) = on,
    // translateX(2px) + a flat hex = off), so per the note's own guidance
    // this test verifies rather than assumes, and never touches the toggle
    // (leaving tenant settings exactly as found).
    const admin = await context.newPage();
    await ensureAdminLoggedIn(admin);
    await admin.goto('/admin/settings');
    const enhancedToggleLabel = admin.getByText('Enhanced company booking form', { exact: true });
    // The toggle <button> is wrapped in its own sibling <div> next to the
    // label's container div (confirmed live via DOM inspection), not a
    // direct sibling button.
    const enhancedToggle = enhancedToggleLabel.locator('xpath=../following-sibling::div[1]//button');
    const toggleTransform = await enhancedToggle.locator('span').evaluate(el => (el as HTMLElement).style.transform);
    expect(toggleTransform, 'enable_enhanced_company_booking must already be on for this test — see note for the toggle fallback plan').toBe('translateX(22px)');

    // Read the company's real access code fresh from admin rather than
    // hardcoding it (in case it's ever regenerated).
    await admin.goto('/admin/companies');
    // Explicit wait for the companies list itself before looking for a
    // specific row — this list is client-fetched, and a bare click on a
    // not-yet-populated row silently no-ops rather than erroring, which is
    // indistinguishable from "the modal takes a while" further down.
    const companyButton = admin.getByRole('button', { name: new RegExp(`^${COMPANY_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });
    await expect(companyButton, `${COMPANY_NAME} row must be visible on /admin/companies`).toBeVisible({ timeout: 20_000 });
    // Real finding: an xpath ancestor-then-descendant approach (find the row
    // wrapper 2 levels up, then the Edit button inside it) worked when
    // manually verified live but intermittently clicked something inert in
    // real automated runs — the Edit/Delete button pair sits in a sibling
    // container next to the name button rather than a shared simple parent,
    // and (per a captured failure snapshot) the exact nesting wasn't as
    // reliable a target as it first looked. Every company row's name button
    // includes "Code set" in its accessible name (every company on this
    // tenant has one), giving a stable parallel list to index into instead
    // of depending on DOM nesting at all: the Nth company name button lines
    // up with the Nth Edit button in the page's rendered order.
    const allCompanyButtons = admin.getByRole('button', { name: /Code set/ });
    const allEditButtons = admin.getByRole('button', { name: 'Edit', exact: true });
    const companyNames = await allCompanyButtons.allTextContents();
    const companyIndex = companyNames.findIndex(n => n.startsWith(COMPANY_NAME));
    expect(companyIndex, `${COMPANY_NAME} must be found among the rendered company rows`).toBeGreaterThanOrEqual(0);
    // Real finding: even with a correctly-targeted Edit button, the click
    // intermittently doesn't open the modal at all (confirmed via a captured
    // failure snapshot showing the plain companies list, not the Edit Company
    // panel, after a click Playwright reported as successful) — reproduced
    // across multiple locator strategies with the same ~50% rate, which
    // points at a real timing race in the app's click handling (the
    // companies list appears to be client-fetched; a click landing during a
    // re-render window can hit a button whose onClick closure is already
    // stale) rather than a test-selector problem. A short bounded retry is
    // the standard mitigation for this class of flake without masking a
    // total failure to open the modal at all.
    const editModalHeading = admin.getByRole('heading', { name: 'Edit Company' });
    let modalOpened = false;
    for (let attempt = 0; attempt < 3 && !modalOpened; attempt++) {
      await allEditButtons.nth(companyIndex).click();
      modalOpened = await editModalHeading.isVisible({ timeout: 5_000 }).catch(() => false);
    }
    expect(modalOpened, 'Edit modal must open after clicking Edit (retried up to 3x)').toBe(true);
    // Real finding: getByRole('textbox', { name: 'No code set' }) resolved
    // fine when stepped through manually (playwright-cli debug session) but
    // hung the full test timeout waiting in a real headless run — the
    // field is `<input type="password">`, and Chromium's accessibility-tree
    // role/name computation for password inputs is exactly the kind of thing
    // that can differ between the debug tooling's browser and a genuine
    // headless launch (confirmed this environment can't launch headed
    // Chrome at all, so the two code paths are not the same browser
    // process). Matching on the placeholder attribute directly sidesteps
    // ARIA role computation entirely and is unambiguous either way.
    const accessCodeField = admin.locator('input[placeholder="No code set"]');
    const accessCode = await accessCodeField.inputValue();
    expect(accessCode, `${COMPANY_NAME} must have a real access code set for this test to run`).not.toBe('');

    // 2. Navigate to the booking form, select Tour Company, pick the seeded
    // test company, enter its access code.
    await page.goto('/');
    await page.getByRole('button', { name: 'Tour Company' }).click();
    // Real finding, differs from the note's assumption of a free-text access
    // code field on the main form: companies are picked from a dropdown of
    // known companies first; a popup then asks for the access code to
    // confirm you're really from that company (matches the `hideCompanyDropdown`
    // prop being unset on the home page's booking form).
    // Real finding: two <select> comboboxes are on screen at once once "Tour
    // Company" is selected (this one, and the Time Slot picker further
    // down) — scope by DOM order (Company renders first) rather than a bare
    // getByRole('combobox'), which strict-mode-fails as ambiguous.
    await page.getByRole('combobox').first().selectOption({ label: COMPANY_NAME });
    await page.getByRole('heading', { name: 'Enter your company code' }).waitFor();
    await page.getByRole('textbox', { name: 'e.g. MARANI42' }).fill(accessCode);
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();

    // 3. "Code confirmed" check. Real finding, differs from the note's
    // assumption of a dedicated confirmation banner: there isn't one — the
    // popup just closes. The real, observable signal that the code was
    // accepted is the company's saved contact profile auto-filling the name
    // field (applyProfile() in BookingForm.tsx), so that's what this checks.
    await expect(page.getByRole('heading', { name: 'Enter your company code' })).not.toBeVisible();
    const firstNameInput = page.getByRole('textbox', { name: 'First Name' });
    await expect(firstNameInput).not.toHaveValue('');

    // Switch to Tasting + Lunch so the Lunch guest field and Hot Dish
    // Selection block render (both are conditional on visitType === 'TASTING_LUNCH').
    await page.getByRole('button', { name: 'Tasting + Lunch Company rate' }).click();

    // 4. The single "Number of Guests" field is replaced by split fields.
    const tastingGuests = page.getByText('Tasting', { exact: true }).locator('xpath=following-sibling::*[1]');
    const lunchGuests = page.getByText('Lunch', { exact: true }).locator('xpath=following-sibling::*[1]');
    const freeGuests = page.getByText('Free / Guide', { exact: true }).locator('xpath=following-sibling::*[1]');
    await expect(tastingGuests).toBeVisible();
    await expect(lunchGuests).toBeVisible();
    await expect(freeGuests).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: 'Number of Guests (minimum 4)' })).toHaveCount(0);

    // 5. Hot Dish Selection and Masterclass Add-ons blocks are present (the
    // tenant has real MenuItem/MasterclassItem rows — confirmed live, no
    // fixture seeding needed).
    await expect(page.getByText('Hot Dish Selection', { exact: true })).toBeVisible();
    await expect(page.getByText('Masterclass Add-ons', { exact: true })).toBeVisible();

    // 6. Enter a guest count outside the company's defined tiers (1–10 and
    // 11–20 guests — confirmed live). Real finding, differs from the note's
    // assumption of a blocking "no rate for this guest count" alert: that
    // alert only exists on the *simple* company-booking path. The enhanced
    // path's `findTier()` (lib/pricingUtils.ts) deliberately falls back to
    // the highest-pricePerPerson tier for any out-of-range count — by design
    // ("protects against under-charging very small groups", per its own
    // doc comment) — so it never blocks. This checks that fallback instead:
    // a guest count of 25 (above both tiers) should still show a price
    // estimate using tier 1's rate (50₾/pp), not an error state.
    await tastingGuests.fill('25');
    await expect(page.getByText('no rate', { exact: false })).not.toBeVisible();
    await expect(page.getByText('25 Tasting × 50₾', { exact: false })).toBeVisible();

    // 7. Correct to an in-range guest count, select one hot dish option and
    // one masterclass add-on, fill required contact fields, submit.
    await tastingGuests.fill('5');
    await lunchGuests.fill('3');

    const vegSelect = page.getByText('Vegetable dish', { exact: true }).locator('xpath=following-sibling::select');
    await vegSelect.selectOption({ label: 'აჯაფასნადალი' });

    // Real finding: these masterclass items are ad-hoc test fixtures on
    // Staging Winery (mixed Georgian/English/typo names, e.g. "hifel iwagi
    // fegiufe") — pinned to today's exact live data, not curated names.
    await page.getByRole('checkbox', { name: 'khinkali10₾/pc' }).check();

    await page.getByRole('textbox', { name: 'First Name' }).fill('Enhanced');
    await page.getByRole('textbox', { name: 'Last Name' }).fill('TestGuest');
    await page.getByRole('textbox', { name: 'Phone' }).fill('+995500000002');
    await page.getByRole('textbox', { name: 'Email' }).fill(TEST_EMAIL);
    await page.getByRole('textbox', { name: /Food Notes/ }).fill('Playwright test notes');

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await page.getByRole('textbox', { name: 'DD/MM/YYYY' }).fill(formatDate(tomorrow));

    // expect: the estimated total reflects tier 1's rate (5×50 + 3×30 = 340)
    // plus the masterclass add-on already selected above (10) = 350, before submitting
    await expect(page.getByText('350₾', { exact: false })).toBeVisible();

    // Real finding, differs from the note's assumption: company bookings
    // (both simple and enhanced) never redirect to the Flitt payment
    // gateway — only individual bookings do (companies are invoiced later,
    // not charged online). Submitting shows the inline "Booking received!"
    // confirmation instead.
    await page.getByRole('button', { name: 'Book & Pay' }).click();
    await expect(page.getByRole('heading', { name: 'Booking received!' })).toBeVisible({ timeout: 15_000 });

    // 8. Verify via the admin order row (not just the confirmation toast)
    // that the guest-count breakdown, hot dish, and masterclass survived the
    // full round trip to the DB.
    await admin.goto('/admin/orders');
    const row = admin.locator('tr', { hasText: TEST_EMAIL });
    await expect(row).toBeVisible({ timeout: 15_000 });
    const cells = row.locator('td');
    await expect(cells.nth(3)).toHaveText('Company'); // Type
    await expect(cells.nth(4)).toContainText(COMPANY_NAME); // Company
    await expect(cells.nth(5)).toHaveText('5'); // Tasting
    await expect(cells.nth(6)).toHaveText('3'); // Lunch
    await expect(cells.nth(7)).toHaveText('Tasting + Lunch'); // Visit
    await expect(cells.nth(8)).toContainText('khinkali'); // Masterclass
    await expect(cells.nth(9)).toContainText('აჯაფასნადალი'); // Food (hot dish)
    await expect(cells.nth(9)).toContainText('Playwright test notes');
    await expect(cells.nth(10)).toHaveText('350₾'); // Total

    // 9. Cleanup: delete the test order. (No company/price tier was created
    // by this test, so there's nothing else to remove, and the settings
    // toggle was never touched — nothing to revert there either.)
    await deleteTestOrderOnAdminPage(admin);
    await admin.close();
  });
});
