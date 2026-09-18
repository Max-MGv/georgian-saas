// Plan-CompanyGuidesAndReps Chunk 11 — a guide code must resolve on the public
// booking form and autofill the *guide's own* name/phone (not the company's),
// and a wrong code must still fail the same way it always has.
import { test, expect, Page, Locator } from '@playwright/test';
import { loginAsTenantAdmin } from '../helpers/auth';
import { clickUntil } from '../helpers/payments';

// Cookie Company rather than "Test Company # 1" (already used by
// booking-enhanced.spec.ts and payment-label-precedence.spec.ts) to avoid two
// specs mutating the same company's admin panel concurrently. Confirmed live
// via /admin/companies to have a real access code set and isBookingCompany on.
const COMPANY_NAME = 'Cookie Company';
const GUIDE_NAME = `Playwright Guide ${Date.now()}`;
const GUIDE_PHONE = '+995 555 12 34 56';

const editPanelHeading = (page: Page) => page.getByRole('heading', { name: 'Edit Company', exact: true });

async function ensureAdminLoggedIn(page: Page) {
  await page.goto('/admin/orders');
  if (page.url().includes('/admin/login')) {
    await loginAsTenantAdmin(page);
  } else {
    await expect(page).toHaveURL(/\/admin\/orders/);
  }
}

// Real finding while building this spec (matches booking-enhanced.spec.ts's own documented
// finding on this exact panel): an xpath ancestor-then-descendant approach to pair a company's
// name button with its Edit button is unreliable — the Edit/Delete pair sits in a sibling
// container next to the name button rather than a shared simple parent. Index-matching the two
// button lists by their rendered order (proven in booking-enhanced.spec.ts) is the reliable
// alternative, so this spec uses that instead of payments.ts's xpath-based openCompanyEditPanel.
async function openCompanyEditPanel(page: Page, companyName: string) {
  await page.goto('/admin/companies');
  const allCompanyButtons = page.getByRole('button', { name: /Code set/ });
  const allEditButtons = page.getByRole('button', { name: 'Edit', exact: true });
  await expect(allCompanyButtons.first()).toBeVisible({ timeout: 20_000 });
  const companyNames = await allCompanyButtons.allTextContents();
  const companyIndex = companyNames.findIndex(n => n.startsWith(companyName));
  expect(companyIndex, `${companyName} must be found among the rendered company rows`).toBeGreaterThanOrEqual(0);
  let opened = false;
  for (let attempt = 0; attempt < 3 && !opened; attempt++) {
    await allEditButtons.nth(companyIndex).click();
    opened = await editPanelHeading(page).isVisible({ timeout: 5_000 }).catch(() => false);
  }
  expect(opened, 'Edit modal must open after clicking Edit (retried up to 3x)').toBe(true);
}

// Scopes to the Guides sub-section of the open Edit Company panel — the
// "Guides" label text's own flex-col wrapper (GuidesSection's root div in
// CompaniesClient.tsx). Never touches the parallel Representatives section
// or the company-level Contact Person fields, which collide on "Phone" as a
// label but live in a different container.
function guidesSection(page: Page): Locator {
  return page
    .getByText('Guides', { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"flex-col")][1]');
}

async function deleteGuideIfPresent(page: Page) {
  await ensureAdminLoggedIn(page);
  await openCompanyEditPanel(page, COMPANY_NAME);
  const section = guidesSection(page);
  const deleteButton = section.getByRole('button', { name: 'Delete', exact: true });
  if (await deleteButton.count() > 0) {
    await deleteButton.click();
    await section.getByRole('button', { name: 'Yes', exact: true }).click();
    await expect(page.getByText(GUIDE_NAME)).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
}

test.describe('Company Guides — booking-form code resolution', () => {
  test.afterEach(async ({ context }) => {
    // Safety net: remove the test guide even if the body failed partway
    // through, same shape as booking-enhanced.spec.ts's order cleanup.
    const page = await context.newPage();
    await deleteGuideIfPresent(page).catch(() => {});
    await page.close();
  });

  test('a guide code autofills the guide\'s own details; a wrong code still errors', async ({ page, context }) => {
    test.setTimeout(90_000);

    // 1. Add a guide to the test company from the admin panel.
    const admin = await context.newPage();
    await ensureAdminLoggedIn(admin);
    await openCompanyEditPanel(admin, COMPANY_NAME);
    const section = guidesSection(admin);
    await section.getByRole('button', { name: '+ Add guide', exact: true }).click();
    // GuideForm's two SmallInputs are plain, unlabelled <input>s (no
    // placeholder, no htmlFor) rendered in fixed order: name, then phone.
    const formInputs = section.locator('input');
    await expect(formInputs).toHaveCount(2, { timeout: 5_000 });
    await formInputs.nth(0).fill(GUIDE_NAME);
    await formInputs.nth(1).fill(GUIDE_PHONE);
    await clickUntil(
      section.getByRole('button', { name: 'Save', exact: true }),
      () => expect(section.getByText(GUIDE_NAME)).toBeVisible({ timeout: 2_000 })
    );

    // Reveal and read the generated code from PersonCodeField.
    await section.getByRole('button', { name: 'Show', exact: true }).click();
    const codeText = await section.locator('span').filter({ hasText: /^[A-Z0-9]{8}$/ }).first().textContent();
    expect(codeText, 'a code should have been generated for the new guide').toMatch(/^[A-Z0-9]{8}$/);
    const guideCode = codeText!.trim();
    await admin.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(editPanelHeading(admin)).not.toBeVisible();

    // 2. Public booking form — select the company, try a wrong code first.
    await page.goto('/');
    await page.getByRole('button', { name: 'Tour Company' }).click();
    await page.getByRole('combobox').first().selectOption({ label: COMPANY_NAME });
    const codeHeading = page.getByRole('heading', { name: 'Enter your company code' });
    await codeHeading.waitFor();
    await page.getByRole('textbox', { name: 'e.g. MARANI42' }).fill('WRONGCODE');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    // A wrong code never closes the popup — checked structurally rather than
    // matching the error copy verbatim, since that text is admin-editable
    // (Feature 182) and this tenant's current wording wasn't confirmed live
    // while writing this spec.
    await page.waitForTimeout(500);
    await expect(codeHeading).toBeVisible();

    // 3. Now the guide's real code — should resolve and autofill the guide's
    // own name/phone, not the company's contact fields.
    await page.getByRole('textbox', { name: 'e.g. MARANI42' }).fill(guideCode);
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(codeHeading).not.toBeVisible();

    const [firstName, lastName] = GUIDE_NAME.split(' ').length > 1
      ? [GUIDE_NAME.split(' ')[0], GUIDE_NAME.split(' ').slice(1).join(' ')]
      : [GUIDE_NAME, ''];
    await expect(page.getByRole('textbox', { name: 'First Name' })).toHaveValue(firstName);
    if (lastName) await expect(page.getByRole('textbox', { name: 'Last Name' })).toHaveValue(lastName);
    await expect(page.getByRole('textbox', { name: 'Phone' })).toHaveValue(GUIDE_PHONE);

    await admin.close();
  });
});
