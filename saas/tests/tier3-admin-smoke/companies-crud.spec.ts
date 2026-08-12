// spec: playwright/notes/09-companies-crud.md
import { test, expect, Page, Locator } from '@playwright/test';
import { loginAsTenantAdmin } from '../helpers/auth';

// Unique per run — critical here specifically (see "Real finding" below):
// this test edits a company by exact-text row lookup, and a name that could
// ever collide with a real company would risk editing the wrong one.
const COMPANY_NAME = `Playwright CRUD Test Co ${Date.now()}`;

async function ensureAdminLoggedIn(page: Page) {
  await page.goto('/admin/orders');
  if (page.url().includes('/admin/login')) {
    await loginAsTenantAdmin(page);
  } else {
    await expect(page).toHaveURL(/\/admin\/orders/);
  }
}

// Scopes to this test's own company row by exact name match, re-resolved
// fresh every time it's called (a real Playwright Locator, not a cached
// element handle) — see the "Real finding" below for why re-resolving fresh
// matters here specifically.
function companyNameButton(page: Page): Locator {
  return page.getByRole('button', { name: new RegExp(`^${COMPANY_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });
}

function companyRow(page: Page): Locator {
  return companyNameButton(page).locator('xpath=..');
}

// Real finding, the central one this test exists to guard against: on this
// page, ANY click can occasionally be lost — it resolves without throwing,
// but the click handler never runs, so the expected state change (a tab
// flip, a form opening, a row expanding) never happens. Reproduced live at
// three separate points across repeated runs (the tab toggle, the row
// summary button, and the "+ Add Booking Company" button itself), so this
// isn't one flaky element — it's a property of the page. Consistent with
// the nested-button hydration-mismatch bug documented in step 8 below:
// React discarding/rebuilding DOM subtrees client-side can drop an in-flight
// click's event before its handler attaches. Every click in this test that
// has a checkable side effect goes through this helper, which re-clicks
// until that side effect is observed, rather than trusting a single click.
// Each individual click gets a short timeout so a lost click fails fast and
// leaves room in the outer window for a retry, instead of eating the whole
// budget waiting on a click that already landed.
// Checks whether `verify` already holds before clicking again — required
// for steps like "Save changes" where the clicked element itself disappears
// on success (the Edit panel closes). Without this, a retry after a real
// success would try to re-click a button that's legitimately gone and fail
// the whole helper, even though the actual outcome was already correct.
async function clickUntil(clickable: Locator, verify: () => Promise<void>, timeout = 20_000) {
  await expect(async () => {
    try {
      await verify();
      return;
    } catch {
      // not yet satisfied — fall through and click
    }
    await clickable.click({ timeout: 5_000 });
    await verify();
  }).toPass({ timeout });
}

async function switchToTab(page: Page, tabName: 'Bookings' | 'Wine Orders', addButtonName: string) {
  await clickUntil(
    page.getByRole('button', { name: tabName, exact: true }),
    () => expect(page.getByRole('button', { name: addButtonName, exact: true })).toBeVisible({ timeout: 2_000 })
  );
}

// Real finding: the "N booking · M wine orders" header count
// (app/admin/(panel)/companies/page.tsx:36) is server-rendered and only
// catches up via Next.js revalidation after a create/delete server action —
// it is NOT driven by the same client-side `setCompanies` state that makes
// the row list itself update instantly. Reproduced live: after a delete
// whose row-list removal was already confirmed (companyRow count 0), a
// same-tick read of this header text still showed the pre-delete count.
// Polls instead of taking a single reading so a slower revalidation doesn't
// register as a real bug.
async function expectBookingCount(page: Page, expected: number) {
  await expect(async () => {
    const text = await page.getByText(/\d+ booking · \d+ wine orders/).textContent();
    const count = parseInt(text?.match(/(\d+) booking/)?.[1] ?? '-1', 10);
    expect(count).toBe(expected);
  }).toPass({ timeout: 10_000 });
}

async function deleteTestCompanyIfPresent(page: Page) {
  await page.goto('/admin/companies');
  const row = companyRow(page);
  if (await row.count() > 0) {
    const yesDelete = companyRow(page).getByRole('button', { name: 'Yes, delete', exact: true });
    await clickUntil(
      companyRow(page).getByRole('button', { name: 'Delete', exact: true }),
      () => expect(yesDelete).toBeVisible({ timeout: 2_000 })
    );
    await clickUntil(yesDelete, () => expect(companyRow(page)).toHaveCount(0, { timeout: 8_000 }), 25_000);
  }
}

test.describe('Companies CRUD', () => {
  test.afterEach(async ({ page }, testInfo) => {
    // Step 10 in the test body already deletes the company on the happy
    // path — this is a safety net for a body that failed before reaching it.
    if (testInfo.status === 'passed') return;
    await ensureAdminLoggedIn(page);
    await deleteTestCompanyIfPresent(page);
  });

  test('create, edit, and delete a company; module badge and Needs-details badge reflect real state', async ({ page }) => {
    // Bumped from the original 60s: this test now retries several clicks
    // (via clickUntil) to absorb the page's real, reproducible lost-click
    // flakiness — see clickUntil's comment above. A run where more than one
    // of those retries actually fires needs headroom beyond 60s.
    test.setTimeout(120_000);

    await ensureAdminLoggedIn(page);
    await page.goto('/admin/companies');

    // Confirm the test tenant has both modules enabled (per the note's own
    // instruction — don't assume), so the module-scoping check below is
    // meaningful rather than the only option. Staging Winery shows both
    // "Bookings" and "Wine Orders" tabs when this is true.
    await expect(page.getByRole('button', { name: 'Bookings', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Wine Orders', exact: true })).toBeVisible();

    // 1. Record current booking-company count (the page header reads
    // "N booking · M wine orders").
    const summaryText = await page.getByText(/\d+ booking · \d+ wine orders/).textContent();
    const beforeBookingCount = parseInt(summaryText?.match(/(\d+) booking/)?.[1] ?? '0', 10);

    // 2. Create a company via the real "+ Add Booking Company" action while
    // on the Bookings tab (not the onboarding wizard — that's 10-onboarding-wizard.md).
    const companyNameBox = page.getByRole('textbox', { name: 'Company name…' });
    await clickUntil(
      page.getByRole('button', { name: '+ Add Booking Company', exact: true }),
      () => expect(companyNameBox).toBeVisible({ timeout: 2_000 })
    );
    await companyNameBox.fill(COMPANY_NAME);
    // Save is disabled while the create request is in flight (loading state),
    // so a retry here can't double-submit — click() just waits out the
    // disabled window and only fires again if the button re-enabled without
    // the row appearing (a genuinely lost click, not a slow one).
    await clickUntil(
      page.getByRole('button', { name: 'Save', exact: true }),
      () => expect(companyRow(page)).toBeVisible({ timeout: 8_000 }),
      25_000
    );

    // 3. Check: row count increases by 1, new row's name matches.
    await expect(companyRow(page)).toBeVisible({ timeout: 15_000 });
    await expectBookingCount(page, beforeBookingCount + 1);

    // 4. Check: module scoping is correct — not silently defaulting to the
    // wrong module regardless of what was selected. Direct regression check
    // for KnownBugs #11 ("always defaulted isBookingCompany:true,
    // isWineOrderCompany:false regardless of what the tenant had enabled").
    // There's no separate module-choice control at creation time — module
    // is implied by which tab's "+ Add X Company" button was used — so the
    // real regression check is: the new company appears under Bookings and
    // does NOT appear under Wine Orders.
    await switchToTab(page, 'Wine Orders', '+ Add Wine Order Company');
    await expect(companyRow(page)).toHaveCount(0);
    await switchToTab(page, 'Bookings', '+ Add Booking Company');
    await expect(companyRow(page)).toBeVisible();

    // 5 & 6. Left deliberately incomplete at creation (no ID code, no
    // contact, no pricing). Check: a "⚠ Needs details" badge is present.
    await expect(companyRow(page).getByText('⚠ Needs details', { exact: true })).toBeVisible();

    // 7. Click-reveal the badge (HelpHint click-reveal, not hover, per
    // KnownBugs #13). Check: the revealed text lists the missing items.
    const tooltip = page.getByRole('tooltip');
    await clickUntil(
      companyRow(page).getByRole('button', { name: '?', exact: true }),
      () => expect(tooltip).toBeVisible({ timeout: 2_000 })
    );
    await expect(tooltip).toContainText('ID code');
    await expect(tooltip).toContainText('contact info');
    await expect(tooltip).toContainText('pricing');

    // 8. Edit the company to fill in ALL required fields.
    //
    // Real finding, differs from the note's assumption: filling in only the
    // identification code does NOT clear the badge — missingDetails() (the
    // #13 fix) requires identificationCode AND contact info AND (for a
    // booking company) at least one price tier, all together. Confirmed
    // live: the note's literal step 8 ("fill in the identification code")
    // left the badge showing "contact info, pricing" still missing. This
    // test fills all three so the badge-clearing check in step 9 is
    // actually reachable.
    //
    // Real finding, more serious — an actual app bug, not a test-design
    // issue: the Companies page throws a hydration-mismatch error on every
    // load (confirmed via browser console: "<button> cannot contain a
    // nested <button>", tracing to HelpHint's trigger button rendering
    // inside the big per-row summary button in CompaniesClient.tsx —
    // buttons cannot nest per the HTML spec). Nested-button hydration
    // mismatches make React discard and rebuild the affected DOM subtree
    // client-side; while diagnosing this test manually, a *cached* row
    // reference from before such a rebuild resolved to a **different
    // company's** Edit button after the row list re-rendered, and a save
    // action ended up editing "Cookie Company" — a real, shared tenant
    // company — instead of this test's own company (caught via the actual
    // POST request body, then reverted via direct DB write; full incident
    // in `playwright/notes/09-companies-crud.md`). This is why `companyRow()`
    // above re-resolves a fresh Locator by exact name on every call rather
    // than caching one, and why this test never reuses a `Locator` variable
    // across an action that could trigger a re-render — every interaction
    // below re-derives its target from `companyRow(page)` fresh.
    const editPanelHeading = page.getByRole('heading', { name: 'Edit Company', exact: true });
    await clickUntil(
      companyRow(page).getByRole('button', { name: 'Edit', exact: true }),
      () => expect(editPanelHeading).toBeVisible({ timeout: 2_000 })
    );
    await page.getByRole('textbox', { name: 'Optional' }).fill('PW-CRUD-123'); // Identification code
    await page.getByRole('textbox', { name: 'First and last name' }).fill('PW Contact Test');
    await page.getByRole('textbox', { name: '+995 5XX XXX XXX' }).fill('+995500000098');
    await page.getByRole('textbox', { name: 'contact@company.ge' }).fill('pw-crud-contact@example.com');
    // Save changes is disabled while the update request is in flight, same
    // double-submit protection as the create Save above.
    await clickUntil(
      page.getByRole('button', { name: 'Save changes', exact: true }),
      () => expect(editPanelHeading).not.toBeVisible({ timeout: 8_000 }),
      25_000
    );

    // Confirm the save actually landed on THIS company (guards the exact
    // failure mode described above) before checking the badge.
    await expect(companyRow(page)).toContainText('PW-CRUD-123');

    // Still needs a price tier — add one via the row's own "+ Add tier"
    // (a separate control from the Edit panel; expanding the row reveals it).
    // Real finding: these spinbuttons have no accessible name (the "Min
    // guests"/"Tasting ₾/person" text is plain nearby text, not wired via
    // <label> or aria-label — confirmed live), so they can only be targeted
    // positionally: 0=Min guests (prefilled "1"), 1=Max guests (prefilled
    // "10"), 2=Tasting ₾/person, 3=Tasting+Lunch ₾/person, 4=Flat fee
    // (prefilled "0").
    // Real bug fixed here: clicking companyRow(page) (the row's outer <div>,
    // parent of the summary button) never toggled expansion — it silently
    // no-opped and "+ Add tier" (only rendered when expanded) timed out.
    // The expand/collapse onClick lives on the summary <button> itself
    // (CompaniesClient.tsx ~line 688), not on its parent container, so this
    // must click the button directly rather than its ambiguous parent.
    const addTierButton = page.getByRole('button', { name: '+ Add tier', exact: true });
    await clickUntil(companyNameButton(page), () => expect(addTierButton).toBeVisible({ timeout: 2_000 }));
    const tierInputs = page.getByRole('spinbutton');
    await clickUntil(addTierButton, () => expect(tierInputs.first()).toBeVisible({ timeout: 2_000 }));
    await tierInputs.nth(2).fill('50');
    await tierInputs.nth(3).fill('50');
    await clickUntil(
      page.getByRole('button', { name: 'Save', exact: true }),
      () => expect(companyRow(page)).toContainText('1 tier', { timeout: 8_000 }),
      25_000
    );

    // 9. Check: the badge disappears without a page reload — confirms
    // missingDetails() is a live computed check reacting to the same data,
    // not a stale cached flag.
    await expect(companyRow(page).getByText('⚠ Needs details', { exact: true })).toHaveCount(0, { timeout: 10_000 });

    // 10. Delete the test company. Check: row count returns to the pre-test
    // count.
    const yesDeleteButton = companyRow(page).getByRole('button', { name: 'Yes, delete', exact: true });
    await clickUntil(
      companyRow(page).getByRole('button', { name: 'Delete', exact: true }),
      () => expect(yesDeleteButton).toBeVisible({ timeout: 2_000 })
    );
    await clickUntil(yesDeleteButton, () => expect(companyRow(page)).toHaveCount(0, { timeout: 8_000 }), 25_000);
    await expectBookingCount(page, beforeBookingCount);
  });
});
