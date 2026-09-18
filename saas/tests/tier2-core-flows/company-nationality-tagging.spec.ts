// spec: vault/Plan-CompanyNationality.md Chunk 10
//
// Covers the full Company Booking Nationality Tagging feature end to end: the
// super-admin-only toggle, the booking-form picker (independent of "enhanced
// company booking" mode), the confirm-review sheet, persistence to the order,
// the admin Orders filter/column, the printed booking sheet, and — per
// Plan-CompanyNationality's Chunk 1 decision — that turning the tenant flag
// off afterward never hides nationality data already saved on an order.
//
// The two-tenant RLS cross-visibility requirement for this chunk is already
// covered structurally by `scripts/test-rls.ts`'s existing "T1 orders NOT
// visible when queried under T2 context" check — `nationalities` is a plain
// column on the already-RLS-covered `Order` row, not a new table, so nothing
// about that check needed to change. Re-run manually after the schema change
// (2026-09-16): 21/21 passed.
import { test, expect, Page } from '@playwright/test';
import { loginAsTenantAdmin, loginAsSuperAdmin } from '../helpers/auth';

const TENANT_ID = 'cmrxb85wo0000vlc0d964nzf8'; // Staging Winery — see credentials.txt
const COMPANY_NAME = 'Test Company # 1'; // same fixture company booking-enhanced.spec.ts uses
const RUN_ID = Date.now();
const TEST_EMAIL = `playwright-nationality-${RUN_ID}@example.com`;
// Unique per run (not just the email) so a leftover order from an earlier failed run — which
// happened repeatedly while writing this spec — can never collide with the current run's own
// print-sheet row lookup, which has no email column to filter by.
const TEST_PHONE = `+995${String(RUN_ID).slice(-9)}`;

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

async function ensureAdminLoggedIn(page: Page) {
  await page.goto('/admin/orders');
  if (page.url().includes('/admin/login')) {
    await loginAsTenantAdmin(page);
  } else {
    await expect(page).toHaveURL(/\/admin\/orders/);
  }
}

async function ensureSuperAdminLoggedIn(page: Page) {
  await page.goto(`/super-admin/tenants/${TENANT_ID}`);
  if (page.url().includes('/admin/login')) {
    await loginAsSuperAdmin(page);
    await page.goto(`/super-admin/tenants/${TENANT_ID}`);
  }
  // Real finding: this section header is a plain <label> (no htmlFor), same shape as the
  // "Wine detail level" section above it — not an actual heading role.
  await expect(page.getByText('Company booking nationality tagging', { exact: true })).toBeVisible({ timeout: 15_000 });
}

const nationalityCheckbox = (page: Page) => page.getByRole('checkbox', { name: 'Enable nationality tagging for company bookings' });

/** Reads the flag's current saved value fresh from the DB-backed form, not just DOM state. */
async function readNationalityFlag(page: Page): Promise<boolean> {
  await ensureSuperAdminLoggedIn(page);
  return nationalityCheckbox(page).isChecked();
}

async function setNationalityFlag(page: Page, desired: boolean) {
  await ensureSuperAdminLoggedIn(page);
  const checkbox = nationalityCheckbox(page);
  if ((await checkbox.isChecked()) === desired) return;
  await checkbox.click();
  await Promise.all([
    page.waitForResponse(res => res.url().includes(`/super-admin/tenants/${TENANT_ID}`) && res.request().method() === 'POST'),
    page.getByRole('button', { name: 'Save Changes' }).click(),
  ]);
  await expect(page.getByText('Saved', { exact: false })).toBeVisible({ timeout: 10_000 }).catch(() => {});
  await page.reload();
  await expect(checkbox).toBeChecked({ checked: desired, timeout: 10_000 });
}

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

// .serial — this mutates a tenant-wide setting (like the payment-flow tests), so it must not
// run in parallel with anything else touching the same tenant.
test.describe.serial('Company booking nationality tagging', () => {
  let originalFlag: boolean | null = null;

  test.afterAll(async ({ browser }) => {
    if (originalFlag === null) return;
    const page = await browser.newPage();
    await setNationalityFlag(page, originalFlag);
    await page.close();
  });

  test('full flow: toggle, picker, confirm sheet, persistence, admin filter/column/print-sheet, toggle-off keeps data', async ({ page, context }) => {
    test.setTimeout(120_000);

    const admin = await context.newPage();
    const superAdmin = await context.newPage();

    // 1. Record the tenant's current flag value so it can be restored exactly, then turn it ON.
    originalFlag = await readNationalityFlag(superAdmin);
    await setNationalityFlag(superAdmin, true);

    // 2. Read the fixture company's real access code fresh from admin (same pattern as
    // booking-enhanced.spec.ts — avoids hardcoding a code that could be regenerated).
    await ensureAdminLoggedIn(admin);
    await admin.goto('/admin/companies');
    const allCompanyButtons = admin.getByRole('button', { name: /Code set/ });
    await expect(allCompanyButtons.first()).toBeVisible({ timeout: 20_000 });
    const allEditButtons = admin.getByRole('button', { name: 'Edit', exact: true });
    const companyNames = await allCompanyButtons.allTextContents();
    const companyIndex = companyNames.findIndex(n => n.startsWith(COMPANY_NAME));
    expect(companyIndex, `${COMPANY_NAME} must be found among the rendered company rows`).toBeGreaterThanOrEqual(0);
    const editModalHeading = admin.getByRole('heading', { name: 'Edit Company' });
    let modalOpened = false;
    for (let attempt = 0; attempt < 3 && !modalOpened; attempt++) {
      await allEditButtons.nth(companyIndex).click();
      modalOpened = await editModalHeading.isVisible({ timeout: 5_000 }).catch(() => false);
    }
    expect(modalOpened, 'Edit modal must open after clicking Edit (retried up to 3x)').toBe(true);
    const accessCode = await admin.locator('input[placeholder="No code set"]').inputValue();
    expect(accessCode, `${COMPANY_NAME} must have a real access code set for this test to run`).not.toBe('');

    // 3. Public booking form: select the company, confirm the code, tag two nationalities.
    await page.goto('/');
    await page.getByRole('button', { name: 'Tour Company' }).click();
    await page.getByRole('combobox').first().selectOption({ label: COMPANY_NAME });
    await page.getByRole('heading', { name: 'Enter your company code' }).waitFor();
    await page.getByRole('textbox', { name: 'e.g. MARANI42' }).fill(accessCode);
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Enter your company code' })).not.toBeVisible();

    const nationalityInput = page.getByPlaceholder('Type or browse to add a country…');
    await expect(nationalityInput, 'Nationality picker must show once the tenant flag is on').toBeVisible();
    await nationalityInput.fill('fra');
    await page.getByRole('option', { name: 'France' }).click();
    await nationalityInput.fill('germ');
    await page.getByRole('option', { name: 'Germany' }).click();
    await expect(page.getByRole('button', { name: 'Remove France' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove Germany' })).toBeVisible();

    // 4. Fill the rest of the required fields and reach the confirm-review sheet. Real finding:
    // Staging Winery has "enhanced company booking" permanently on (per booking-enhanced.spec.ts),
    // so a Company booking here shows split Tasting/Free guest-count spinbuttons (defaulting to
    // "0") instead of a single Guest Count field — must fill Tasting to at least minGuests (4) or
    // the confirm sheet never opens.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    await page.getByRole('textbox', { name: 'DD/MM/YYYY' }).fill(formatDate(tomorrow));
    await page.getByRole('combobox').last().selectOption({ index: 1 });
    await page.getByText('Tasting', { exact: true }).locator('xpath=following-sibling::*[1]').fill('4');
    await page.getByRole('textbox', { name: 'First Name' }).fill('Nationality');
    await page.getByRole('textbox', { name: 'Last Name' }).fill('TestGuest');
    await page.getByRole('textbox', { name: 'Phone' }).fill(TEST_PHONE);
    await page.getByRole('textbox', { name: 'Email' }).fill(TEST_EMAIL);
    await page.getByRole('button', { name: /Request Booking|Confirm & Request Booking/ }).click();

    // expect: the review sheet lists the tagged nationalities before the booking is final.
    // .last() — the underlying form (with its own "Nationality (optional)" label) stays mounted
    // beneath the confirm-review overlay rather than being replaced by it.
    await expect(page.getByText('Nationality (optional)', { exact: false }).last()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('France, Germany', { exact: false }).last()).toBeVisible();
    await page.getByRole('button', { name: /Confirm & Request Booking/ }).click();
    await expect(page.getByRole('heading', { name: 'Booking received!' })).toBeVisible({ timeout: 15_000 });

    // 5. Admin: the order row exists with Type=Company; open Columns, show Nationality, confirm it.
    await admin.goto('/admin/orders');
    const row = admin.locator('tr', { hasText: TEST_EMAIL });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await admin.getByRole('button', { name: /Columns/ }).click();
    await admin.getByRole('checkbox', { name: 'Nationality', exact: true }).click();
    // Real finding: the Columns picker closes on an outside click (a document listener), not Escape.
    await admin.getByRole('heading', { name: 'Orders', exact: true }).click();
    await expect(row).toContainText('France');
    await expect(row).toContainText('Germany');

    // 6. Admin filter: selecting "France" narrows the table to (at least) this order.
    // Real finding: the filter's <label> has no htmlFor, so getByLabel() can't find its <select> —
    // walk from the label text to its sibling instead, same pattern used elsewhere in this suite.
    const nationalityFilter = admin.getByText('Nationality', { exact: true }).locator('xpath=following-sibling::select');
    await nationalityFilter.selectOption({ label: 'France' });
    await expect(admin.locator('tr', { hasText: TEST_EMAIL })).toBeVisible({ timeout: 10_000 });
    await nationalityFilter.selectOption({ label: 'All nationalities' });

    // 7. Print sheet preview includes the tagged nationalities for this booking. Filtered by the
    // run-unique phone number, not the (hardcoded, so collision-prone across runs) surname —
    // BookingSheetPrint has no email column, but does have Contact Phone.
    // Real finding: OrdersTable.tsx renders BookingSheetPrint twice (on-screen preview + a
    // print-only portal copy) — scope to the first .booking-sheet-print container only.
    await admin.getByRole('button', { name: 'Print Sheet' }).click();
    const printRow = admin.locator('.booking-sheet-print').first().locator('tr', { hasText: TEST_PHONE });
    await expect(printRow).toHaveCount(1);
    await expect(printRow).toContainText('France');
    await expect(printRow).toContainText('Germany');
    await admin.getByRole('button', { name: 'Close', exact: true }).click();

    // 8. Turn the tenant flag OFF, then confirm two things at once: the booking-form
    // picker disappears for new bookings, but this order's existing data is untouched.
    await setNationalityFlag(superAdmin, false);
    await page.goto('/');
    await page.getByRole('button', { name: 'Tour Company' }).click();
    await expect(page.getByPlaceholder('Type or browse to add a country…'), 'picker must be gone once the flag is off').not.toBeVisible();

    await admin.goto('/admin/orders');
    await expect(admin.locator('tr', { hasText: TEST_EMAIL })).toContainText('France', { timeout: 15_000 });

    // 9. Restore the flag to whatever it was before this test (also done in afterAll
    // as a safety net for a body that fails before reaching this line).
    await setNationalityFlag(superAdmin, originalFlag);
    originalFlag = null; // afterAll no-ops now that this line already restored it

    // 10. Cleanup: delete the test order.
    await deleteTestOrderOnAdminPage(admin);
    await admin.close();
    await superAdmin.close();
  });
});
