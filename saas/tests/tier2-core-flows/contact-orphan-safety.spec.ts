// spec: Plan-ContactRoles Chunk 13, finding F2 — deleting a person who is on a past order
// must not erase that order's record of who was on it. `OrderContact.personId` is
// `onDelete: SetNull` (schema.prisma), never Cascade, and every row carries its own
// nameSnapshot/phoneSnapshot/emailSnapshot written at order-creation time; the order detail
// page reads only the snapshot columns (app/admin/(panel)/orders/[id]/page.tsx), never a live
// join back to CompanyPerson. Under the old `Order.guideId` design this same admin action
// silently erased the attribution on every past order (KnownBugs #56) — this is the one test
// that actually proves the replacement holds.
import { test, expect, Page } from '@playwright/test';
import { loginAsTenantAdmin } from '../helpers/auth';
import { clickUntil } from '../helpers/payments';

// Kakheti Wine Routes — a real booking company with existing Guide/Contact Person rows
// already on it, confirmed live against the dev DB while writing this spec (2026-09-23).
// Using an existing, populated company rather than a fresh throwaway one means the new
// person's row is never the only one in its role — closer to how this admin action gets used
// for real, and it rules out any behaviour that only happens to work when a role has exactly
// one person (NewOrderForm auto-picks a lone person in a role; this deliberately isn't one).
const COMPANY_NAME = 'Kakheti Wine Routes';
const GUIDE_NAME = `Orphan Test Guide ${Date.now()}`;
const GUIDE_PHONE = '+995 555 00 11 22';
const ADMIN_FIRST = 'Orphan';
const ADMIN_LAST = `Safety ${Date.now()}`;

async function ensureAdminLoggedIn(page: Page) {
  await page.goto('/admin/orders');
  if (page.url().includes('/admin/login')) {
    await loginAsTenantAdmin(page);
  } else {
    await expect(page).toHaveURL(/\/admin\/orders/);
  }
}

const editPanelHeading = (page: Page) => page.getByRole('heading', { name: 'Edit Company', exact: true });

// Index-matching, not payments.ts's xpath ancestor helper — H11: that helper documented
// itself as losing ~50% of its clicks on this exact panel. booking-enhanced.spec.ts already
// uses this index-matching variant on the same page; copied here rather than the xpath one.
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

// Scopes to the Guide role's own PeopleSection inside the open Edit Company panel — its
// role-label paragraph's flex-col wrapper (CompaniesClient.tsx's PeopleSection root div).
// Never touches the parallel Contact Person section, which shares "Phone"/"Delete" as labels
// but lives in a different container.
function guideSection(page: Page) {
  return page
    .getByText('Guide', { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"flex-col")][1]');
}

async function addGuide(page: Page) {
  await openCompanyEditPanel(page, COMPANY_NAME);
  const section = guideSection(page);
  await section.getByRole('button', { name: '+ Add Guide', exact: true }).click();
  // PersonForm's three SmallInputs (Name, Phone, Email) — plain inputs whose <label> is a
  // sibling, not a `for`-linked one, so they carry no accessible name (same shape as the old
  // GuideForm this replaces). Positional, in the form's own fixed render order.
  const formInputs = section.locator('input');
  await expect(formInputs).toHaveCount(3, { timeout: 5_000 });
  await formInputs.nth(0).fill(GUIDE_NAME);
  await formInputs.nth(1).fill(GUIDE_PHONE);
  await clickUntil(
    section.getByRole('button', { name: 'Save', exact: true }),
    () => expect(section.getByText(GUIDE_NAME)).toBeVisible({ timeout: 2_000 })
  );
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(editPanelHeading(page)).not.toBeVisible();
}

/**
 * Deletes the throwaway guide, if it's still there. Kakheti Wine Routes already has two real
 * guides, so every row's own "Delete" button is on screen at once — targeting `.last()` picks
 * ours, since PeopleSection appends a newly-created person to the end of its list (confirmed
 * live: `setPeople([...people, result.person])` in CompaniesClient.tsx). The confirm step
 * ("Remove this person?" / Yes / Cancel) replaces that same row in place, so it's found at the
 * section level rather than re-filtering by name — the name text is exactly what the confirm
 * state doesn't show, which is what breaks a hasText-based re-query at that point.
 */
async function deleteGuideIfPresent(page: Page) {
  await openCompanyEditPanel(page, COMPANY_NAME);
  const section = guideSection(page);
  if (await section.getByText(GUIDE_NAME).count() > 0) {
    await section.getByRole('button', { name: 'Delete', exact: true }).last().click();
    await section.getByRole('button', { name: 'Yes', exact: true }).click();
    // Real finding while building this test: the row hides the person's name the instant
    // "Delete" is clicked (deletingId flips client-side, before any server call), so checking
    // the name is gone proves nothing about whether the delete actually finished. Waiting for
    // the confirm row's OWN "Yes" button to disappear is the real completion signal — it only
    // clears once handleDelete's server round trip resolves and the person leaves the list.
    // Racing ahead of it left that row's small "Cancel" in the DOM alongside the panel's own
    // "Cancel" below, and the next line's unscoped click hit a strict-mode 2-match error.
    await expect(section.getByRole('button', { name: 'Yes', exact: true })).toHaveCount(0, { timeout: 10_000 });
    await expect(section.getByText(GUIDE_NAME)).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
}

async function deleteOrderIfPresent(page: Page, marker: string) {
  await page.goto('/admin/orders');
  // A cold Next.js dev-server compile on a route's first visit can outlast the 5s default
  // assertion timeout (booking-enhanced.spec.ts's own documented finding on this same page).
  await page.locator('table').waitFor({ timeout: 15_000 }).catch(() => {});
  const row = page.locator('tr', { hasText: marker });
  if (await row.count() > 0) {
    await row.getByRole('button', { name: 'Delete order' }).click();
    await row.getByRole('button', { name: 'Yes' }).click();
    await expect(page.locator('tr', { hasText: marker })).toHaveCount(0);
  }
}

test.describe('Deleting a person must not erase their name from a past order (F2)', () => {
  test.afterEach(async ({ context }, testInfo) => {
    // Safety net for a body that failed partway through — the passing path already cleans up
    // both the order and the guide itself as its own last steps.
    if (testInfo.status === 'passed') return;
    const page = await context.newPage();
    await deleteOrderIfPresent(page, ADMIN_LAST).catch(() => {});
    await deleteGuideIfPresent(page).catch(() => {});
    await page.close();
  });

  test('deleting the guide leaves the order showing their name from the snapshot', async ({ page }) => {
    test.setTimeout(90_000);

    // 1. Add a throwaway guide to a real, already-populated test company.
    await ensureAdminLoggedIn(page);
    await addGuide(page);

    // 2. Create an order for that company through the admin New Order screen, picking the
    //    guide from the role dropdown — this screen has no code step to hang a popup off
    //    (plan §4b), so the choice is inline.
    await page.goto('/admin/orders/new');
    await page.getByText('Company', { exact: true }).locator('xpath=following-sibling::*[1]').selectOption({ label: COMPANY_NAME });
    await expect(page.getByText('Choose the Guide', { exact: true })).toBeVisible({ timeout: 10_000 });
    await page.getByText('Choose the Guide', { exact: true })
      .locator('xpath=following-sibling::*[1]')
      .selectOption({ label: `${GUIDE_NAME} — ${GUIDE_PHONE}` });

    await page.getByText('First name', { exact: true }).locator('xpath=following-sibling::*[1]').fill(ADMIN_FIRST);
    await page.getByText('Last name', { exact: true }).locator('xpath=following-sibling::*[1]').fill(ADMIN_LAST);

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    await page.getByText('Date', { exact: true }).locator('xpath=following-sibling::*[1]').fill(tomorrow);

    await page.getByRole('button', { name: 'Create order', exact: true }).click();
    // Not /[a-zA-Z0-9]+$/ alone — that also matches the literal ".../orders/new" this page
    // starts on ("new" is alphabetic), so a failed or still-pending submit would pass the
    // assertion without an order ever having been created. Real ids are cuids, far longer.
    await expect(page).toHaveURL(/\/admin\/orders\/[a-zA-Z0-9]{10,}$/, { timeout: 15_000 });
    const orderUrl = page.url();

    // 3. Baseline — the Contacts card shows the guide by name before anything is deleted.
    await expect(page.getByText(GUIDE_NAME)).toBeVisible();

    // 4. Delete the guide from the company's Edit panel.
    await deleteGuideIfPresent(page);

    // 5. The order must still show the SAME name — this is what F2 exists to prove.
    await page.goto(orderUrl);
    await expect(page.getByText(GUIDE_NAME)).toBeVisible();

    // 6. Clean up the order. The guide is already gone from step 4.
    await deleteOrderIfPresent(page, ADMIN_LAST);
  });
});
