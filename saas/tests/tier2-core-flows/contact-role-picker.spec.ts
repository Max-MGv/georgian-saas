// spec: Plan-ContactRoles Chunk 13 — role-driven contact-picker coverage on the public
// booking form. Replaces company-guide-code.spec.ts and guide-picker.spec.ts, both written
// for the guide-only design (KnownBugs #55 / Feature 201) that predates Chunk 7, where
// Contact Person itself became just another per-order pickable role rather than a fixed
// company fallback. Two concrete things changed since those old specs, found by reading the
// current code rather than trusted from either spec's own comments:
//   - the picker's title is now tenant-editable copy ("Who should we put on this booking?"),
//     not the old guide-only component's hardcoded "Who is bringing the group?"
//   - "I am not on this list" no longer falls back to a company-level contact (that concept —
//     Company.contactName/Phone/Email — was dropped in Chunk 1); it just leaves the role's
//     fields blank for the guest to type into, the same as for any other role.
import { test, expect, Page } from '@playwright/test';
import { loginAsTenantAdmin } from '../helpers/auth';
import { readPersonCodesToggle, setPersonCodesToggle } from '../helpers/payments';

// Silk Road Journeys — the one seeded booking company whose Contact Person and Guide people
// are all visibly distinct from one another (H13's fix, Chunk 12), so which popup is open and
// who got picked can always be told apart from the fields alone. Verified live against the
// dev DB while writing this spec (2026-09-23) rather than trusted from the old specs' comments,
// since Chunk 1/12 changed what these rows actually are:
//   Contact Person: Keti Dolidze (code SRJREP1), Mariam Dolidze (no code)
//   Guide:          Nika Kvaratskhelia (SRJGUIDE2), Tinatin Beruashvili (SRJGUIDE1)
// pickableRoles() orders each role's people by name ascending, so Keti/Nika are always the
// FIRST person offered in their role and Mariam/Tinatin the second — not used below, but
// worth knowing if this spec is ever extended to assert on picker ordering.
const COMPANY_NAME = 'Silk Road Journeys';
const COMPANY_CODE = 'SILKROAD55';
const GUIDE_CODE = 'SRJGUIDE2';
const GUIDE_NAME = 'Nika Kvaratskhelia';
const GUIDE_PHONE = '+995 577 62 90 18';
const CONTACT_NAME = 'Mariam Dolidze';
const CONTACT_PHONE = '+995 591 76 20 55';

async function ensureAdminLoggedIn(page: Page) {
  await page.goto('/admin/orders');
  if (page.url().includes('/admin/login')) {
    await loginAsTenantAdmin(page);
  } else {
    await expect(page).toHaveURL(/\/admin\/orders/);
  }
}

const pickerHeading = (page: Page) => page.getByRole('heading', { name: 'Who should we put on this booking?' });
const codeHeading = (page: Page) => page.getByRole('heading', { name: 'Enter your company code' });
const contactField = (page: Page, label: string) => page.getByRole('textbox', { name: label, exact: true });

/** Select the fixture company (as a Tour Company booking) and submit `code` into the access-code popup. */
async function enterCode(page: Page, code: string) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Tour Company', exact: true }).click();
  await page.getByRole('combobox').first().selectOption({ label: COMPANY_NAME });
  await expect(codeHeading(page)).toBeVisible({ timeout: 15_000 });
  await page.getByRole('textbox', { name: 'e.g. MARANI42' }).fill(code);
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
}

// This whole file toggles a tenant-wide setting (`person_codes_enabled`) mid-run, so tests
// cannot be allowed to run in parallel against each other (playwright.config.ts sets
// `fullyParallel: true`) — `.serial` forces one at a time. Each test still sets its own
// precondition explicitly rather than relying on execution order, so a single failure only
// costs the tests after it, not a silently-wrong result in one that happens to run later.
test.describe.serial('Contact role picker — public booking form (Plan-ContactRoles Chunk 13)', () => {
  // Read-only against shared fixtures for the "codes off" cases — no orders created, same
  // reasoning as the old guide-picker.spec.ts: the point under test is code resolution and
  // autofill, and submitting would leave debris on a tenant whose wine-order rows already
  // cannot be deleted (KNOWN-ISSUES #3). The two "codes on" cases only ever touch the Settings
  // toggle, which is restored below.
  let originalPersonCodesEnabled: boolean;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    await ensureAdminLoggedIn(page);
    originalPersonCodesEnabled = await readPersonCodesToggle(page);
    await page.close();
  });

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage();
    await ensureAdminLoggedIn(page);
    await setPersonCodesToggle(page, originalPersonCodesEnabled);
    await page.close();
  });

  test('codes off: the company code asks about each role in turn, and picking fills the right fields', async ({ page, context }) => {
    test.setTimeout(90_000);
    const admin = await context.newPage();
    await ensureAdminLoggedIn(admin);
    await setPersonCodesToggle(admin, false);
    await admin.close();

    await enterCode(page, COMPANY_CODE);

    // ── Contact Person role first (sortOrder 10) ──
    await expect(pickerHeading(page)).toBeVisible({ timeout: 15_000 });
    await expect(codeHeading(page)).not.toBeVisible();
    const contactButton = page.getByRole('button', { name: CONTACT_NAME, exact: true });
    // H14 — the button's accessible name comes from an explicit aria-label on
    // ContactPickerPopupView's button, not the computed text of its two nested spans (which
    // came back empty in a live check before that fix). This is the assertion that would fail
    // if that regressed: getByRole('button', { name }) only finds it via the aria-label.
    await expect(contactButton).toBeVisible();
    await contactButton.click();

    await expect(contactField(page, 'First Name')).toHaveValue('Mariam');
    await expect(contactField(page, 'Last Name')).toHaveValue('Dolidze');
    await expect(contactField(page, 'Phone')).toHaveValue(CONTACT_PHONE);

    // ── Guide role next (sortOrder 20) — the popup re-opens itself for the next role in the
    // queue with no action from the guest. ──
    await expect(pickerHeading(page)).toBeVisible({ timeout: 10_000 });
    const guideButton = page.getByRole('button', { name: GUIDE_NAME, exact: true });
    await expect(guideButton).toBeVisible();
    await guideButton.click();
    await expect(pickerHeading(page)).not.toBeVisible({ timeout: 10_000 });

    // The Guide role has its own block (detailed-variant only — enable_enhanced_company_booking
    // is on for this tenant), never the First/Last Name fields, which stay Mariam's.
    await expect(contactField(page, 'Guide — Name')).toHaveValue(GUIDE_NAME);
    await expect(contactField(page, 'Guide — Phone')).toHaveValue(GUIDE_PHONE);
    await expect(contactField(page, 'First Name')).toHaveValue('Mariam');
  });

  test('codes off: "I am not on this list" leaves the role\'s fields blank for the guest to fill in', async ({ page, context }) => {
    test.setTimeout(90_000);
    const admin = await context.newPage();
    await ensureAdminLoggedIn(admin);
    await setPersonCodesToggle(admin, false);
    await admin.close();

    await enterCode(page, COMPANY_CODE);
    await expect(pickerHeading(page)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'I am not on this list', exact: true }).click();

    // Under the current design Contact Person is itself a pickable role — there is no separate
    // "company's own contact" left to fall back to (that was the dropped Company.contactName
    // column, decision 2). Skipping just means nobody was picked for this role.
    await expect(contactField(page, 'First Name')).toHaveValue('');
    await expect(contactField(page, 'Last Name')).toHaveValue('');
    await expect(contactField(page, 'Phone')).toHaveValue('');

    // The queue advances to the Guide role on its own.
    await expect(pickerHeading(page)).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'I am not on this list', exact: true }).click();
    await expect(pickerHeading(page)).not.toBeVisible({ timeout: 10_000 });
    await expect(contactField(page, 'Guide — Name')).toHaveValue('');
  });

  test('a wrong code is still rejected, with no picker', async ({ page, context }) => {
    test.setTimeout(90_000);
    const admin = await context.newPage();
    await ensureAdminLoggedIn(admin);
    await setPersonCodesToggle(admin, false);
    await admin.close();

    await enterCode(page, 'WRONGCODE9');
    await expect(page.getByText('Incorrect code', { exact: false })).toBeVisible({ timeout: 15_000 });
    await expect(codeHeading(page)).toBeVisible();
    await expect(pickerHeading(page)).not.toBeVisible();
  });

  test('codes on: a guide\'s own code skips the picker entirely', async ({ page, context }) => {
    // Requires person codes ON — contactResolution.ts's `resolveCompanyContactsFor` only checks
    // a typed code against CompanyPerson.code inside `if (codesOn && typed)` (decision 6). With
    // codes off, SRJGUIDE2 would just be tried as a (wrong) company code instead.
    test.setTimeout(90_000);
    const admin = await context.newPage();
    await ensureAdminLoggedIn(admin);
    await setPersonCodesToggle(admin, true);
    await admin.close();

    await page.goto('/');
    await page.getByRole('button', { name: 'Tour Company', exact: true }).click();
    await page.getByRole('combobox').first().selectOption({ label: COMPANY_NAME });
    await expect(codeHeading(page)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('textbox', { name: 'e.g. MARANI42' }).fill(GUIDE_CODE);
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();

    await expect(codeHeading(page)).not.toBeVisible({ timeout: 15_000 });
    await expect(pickerHeading(page)).not.toBeVisible();

    // Real finding while building this test, against the old guide-picker.spec.ts's
    // assumption: `applyPickedPerson` in BookingForm.tsx only writes the classic First/Last
    // Name fields when the matched role IS contact_person (its early-return guard). A guide's
    // own code matches the Guide role instead, so it fills the Guide block, and the classic
    // fields — which belong to Contact Person, a role nobody was matched into here — stay
    // blank. Under the old single-picker design (pre Chunk 7) there was only one set of
    // contact fields on the whole form, so any match filled them; that stopped being true once
    // Contact Person became a role like any other.
    await expect(contactField(page, 'Guide — Name')).toHaveValue(GUIDE_NAME);
    await expect(contactField(page, 'Guide — Phone')).toHaveValue(GUIDE_PHONE);
    await expect(contactField(page, 'First Name')).toHaveValue('');
  });

  test('codes on: the company code is still accepted, but the picker never opens', async ({ page, context }) => {
    test.setTimeout(90_000);
    const admin = await context.newPage();
    await ensureAdminLoggedIn(admin);
    await setPersonCodesToggle(admin, true);
    await admin.close();

    await enterCode(page, COMPANY_CODE);
    await expect(codeHeading(page)).not.toBeVisible({ timeout: 15_000 });
    await expect(pickerHeading(page)).not.toBeVisible();

    // The colleague list is exactly what person codes exist to hide (decision 6) — the fields
    // are present, empty, ready for the guest to type into themselves.
    await expect(contactField(page, 'First Name')).toHaveValue('');
    await expect(contactField(page, 'Phone')).toHaveValue('');
    await expect(contactField(page, 'Guide — Name')).toHaveValue('');
  });
});
