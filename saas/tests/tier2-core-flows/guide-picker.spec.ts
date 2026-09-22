// spec: the guide picker (Feature 201 / KnownBugs #55) — a COMPANY-level access
// code is accepted even when the company has guides, and the guest then says
// which guide they are.
//
// Guards the exact regression this feature fixed: before 2026-09-19,
// verifyBookingCode() rejected a company's own code outright for any company
// with guides, so adding one guide silently killed a code already in
// circulation with a partner agency. That failure was invisible — the admin
// panel kept displaying the dead code as live.
//
// Fixture: `Silk Road Journeys` is the one seeded booking company that carries
// guides (see the warning on BookingCompanySpec.guides in lib/demoSeed.ts —
// the other four deliberately have none, because four other specs exercise the
// plain company-code path and guides would retire their codes). Its guides are
// deliberately different people from its own contact person: when a company's
// contact IS one of its guides, the "I am not on this list" fallback becomes
// impossible to tell apart from picking that guide, since both fill the form
// with identical values. Found the hard way while building this.
import { test, expect, Page } from '@playwright/test';

const COMPANY_NAME = 'Silk Road Journeys';
const COMPANY_CODE = 'SILKROAD55';
const GUIDE_CODE = 'SRJGUIDE2';
const GUIDE_NAME = 'Nika Kvaratskhelia';
const GUIDE_PHONE = '+995 577 62 90 18';
/** The company's own contact — NOT a guide. Proves the fallback path. */
const COMPANY_CONTACT_FIRST = 'Mariam';
const COMPANY_CONTACT_PHONE = '+995 591 76 20 55';

const pickerHeading = (page: Page) => page.getByRole('heading', { name: 'Who is bringing the group?' });
const codeHeading = (page: Page) => page.getByRole('heading', { name: 'Enter your company code' });

/** Select the fixture company and submit `code` into the access-code popup. */
async function enterCode(page: Page, code: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Tour Company', exact: true }).click();
  await page.getByRole('combobox').first().selectOption({ label: COMPANY_NAME });
  await expect(codeHeading(page)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('textbox', { name: 'e.g. MARANI42' }).fill(code);
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
}

async function firstName(page: Page) {
  return page.getByRole('textbox', { name: 'First Name' }).inputValue();
}
async function phone(page: Page) {
  return page.getByRole('textbox', { name: 'Phone' }).inputValue();
}

test.describe('Guide picker after a company-level code (Feature 201)', () => {
  // Read-only against shared fixtures — no tenant settings touched, no orders
  // created. Deliberately stops before submitting: the point under test is code
  // resolution and autofill, and submitting would leave debris on a tenant whose
  // wine-order rows already cannot be deleted (KNOWN-ISSUES #3).
  test('company code opens the picker; choosing a guide fills their details', async ({ page }) => {
    test.setTimeout(90_000);
    await enterCode(page, COMPANY_CODE);

    // expect: the company's own code is ACCEPTED even though it has guides.
    // This single assertion is the regression guard — before Feature 201 it
    // produced "Incorrect code" and the popup never closed.
    await expect(pickerHeading(page)).toBeVisible({ timeout: 15_000 });
    await expect(codeHeading(page)).not.toBeVisible();

    // expect: every guide is offered, each reachable by name. The aria-label is
    // load-bearing — the name and phone are separate nested spans, so without it
    // the computed accessible name is empty and neither a screen reader nor this
    // assertion can identify the button.
    const guideButton = page.getByRole('button', { name: GUIDE_NAME, exact: true });
    await expect(guideButton).toBeVisible();

    await guideButton.click();
    await expect(pickerHeading(page)).not.toBeVisible({ timeout: 10_000 });

    // expect: the GUIDE's own name and phone, not the company's.
    expect(await firstName(page)).toBe(GUIDE_NAME.split(' ')[0]);
    expect(await phone(page)).toBe(GUIDE_PHONE);
  });

  test('"I am not on this list" falls back to the company contact', async ({ page }) => {
    test.setTimeout(90_000);
    await enterCode(page, COMPANY_CODE);
    await expect(pickerHeading(page)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'I am not on this list', exact: true }).click();
    await expect(pickerHeading(page)).not.toBeVisible({ timeout: 10_000 });

    // expect: the COMPANY's contact, not any guide's. Only distinguishable
    // because the fixture's contact person is not also one of its guides.
    expect(await firstName(page)).toBe(COMPANY_CONTACT_FIRST);
    expect(await phone(page)).toBe(COMPANY_CONTACT_PHONE);
  });

  test('a guide\'s own code still skips the picker entirely', async ({ page }) => {
    test.setTimeout(90_000);
    await enterCode(page, GUIDE_CODE);

    // expect: straight through — the code already names the person, so there is
    // nothing to ask. Regression guard for the pre-existing shortcut.
    await expect(codeHeading(page)).not.toBeVisible({ timeout: 15_000 });
    await expect(pickerHeading(page)).not.toBeVisible();
    expect(await firstName(page)).toBe(GUIDE_NAME.split(' ')[0]);
    expect(await phone(page)).toBe(GUIDE_PHONE);
  });

  test('a wrong code is still rejected, with no picker', async ({ page }) => {
    test.setTimeout(90_000);
    await enterCode(page, 'WRONGCODE9');

    // expect: the popup stays open with an error, and the picker never appears —
    // accepting the company code must not have weakened the check itself.
    await expect(page.getByText('Incorrect code', { exact: false })).toBeVisible({ timeout: 15_000 });
    await expect(codeHeading(page)).toBeVisible();
    await expect(pickerHeading(page)).not.toBeVisible();
  });
});
