// spec: playwright/notes/10-onboarding-wizard.md
//
// Runs against a DEDICATED tenant ("Test Onboarding Wizard", id
// cmsioproi000avl9czd60ua5h) reached via its own domain
// (test-onboarding-wizard.invalid) rather than by touching saas/.env's
// DEFAULT_TENANT_ID — see the "How this reaches a second tenant" note below
// for why, and playwright/notes/10-onboarding-wizard.md for the full
// investigation. This is the one test in the suite that talks to a tenant
// other than Staging Winery; every other spec file is completely unaffected.
import { test, expect } from '@playwright/test';
import { loginAsSuperAdmin } from '../helpers/auth';

// ── How this reaches a second tenant without DEFAULT_TENANT_ID ─────────────
//
// On localhost every OTHER request resolves to whichever tenant
// saas/.env's DEFAULT_TENANT_ID points to (saas/proxy.ts's `isLocal` branch)
// — swapping that env var would need a full dev-server restart and would
// affect every other test running against Staging Winery, which is exactly
// the failure mode a previous session already hit once this project (an
// un-reverted DEFAULT_TENANT_ID swap silently broke every other test for
// hours). This test avoids that path entirely.
//
// Investigated first (per the task instructions) whether the super-admin
// panel has a "view as tenant" mechanism: it does not. A super-admin user
// bypasses proxy.ts's tenant-lock redirect on /admin/* routes (see the
// `isSuperAdmin` check there), but the tenant whose DATA gets shown is still
// resolved purely from the request's Host header (`resolveTenant(host)`),
// completely independent of who's logged in. super-admin's "full cross-tenant
// access" (per credentials.txt) means it can view/edit any tenant's row from
// within /super-admin/tenants/[id] — not that it can browse a different
// tenant's real /admin/* dashboard from localhost.
//
// What DOES already exist, and is what this test uses instead: proxy.ts's
// resolveTenant() has a second branch for any non-"localhost" domain that
// looks the tenant up by its `domain` column directly — this tenant already
// has "test-onboarding-wizard.invalid" set (from when it was created). Live
// end-to-end tests confirmed this real domain-routing mechanism is not
// restricted: `curl -H "Host: test-onboarding-wizard.invalid:3000" ...`
// against the dev server returned `x-resolved-tenant: test-onboarding-wizard`
// with no rejection. `test.use()` below points this file's own browser
// context at that hostname and adds a Chromium `--host-resolver-rules` flag
// that maps it to 127.0.0.1 for this file's browser only (a standard,
// well-known flag for exactly this kind of multi-domain local testing) — no
// OS hosts-file edit, no env var, no dev-server restart, fully scoped to
// this one spec file. Every other test file keeps using the default
// http://localhost:3000 baseURL and default launch args unaffected.
test.use({
  baseURL: 'http://test-onboarding-wizard.invalid:3000',
  launchOptions: {
    args: ['--host-resolver-rules=MAP test-onboarding-wizard.invalid 127.0.0.1'],
  },
});

// ── Tenant state note ────────────────────────────────────────────────────
//
// This tenant is a standing, disposable fixture (per the note's own
// recommendation), NOT a fresh tenant created per run. It was found to be
// NOT zero-state when this test was built — a previous session had fully
// onboarded and launched it (contact info, payment info, one company, one
// wine all set). Reset to genuine zero-state via direct SQL before building
// this test: cleared every onboarding-related Setting row, deleted the one
// stray Company and Wine, but deliberately kept `enable_enhanced_company_booking:
// true` so the Booking Details step still appears (needed to exercise the
// "optional, doesn't block Launch" check), and kept the auto-created
// "Individuals" company itself (only cleared its Price rows) since it's a
// required row the wizard depends on, not test debris.
//
// This test does NOT reset the tenant back to zero-state afterward — unlike
// the Staging Winery tests in this suite, nothing else depends on this
// tenant staying pristine between runs. A future run that needs to
// re-exercise the true first-launch UI (not just the "launch again"
// idempotency path) needs the same kind of SQL reset first; see the note
// file for the exact reset query.
test.describe('Onboarding wizard walkthrough', () => {
  test('7-step flow on a fresh tenant: gating, cross-page contact check, payment-gated Review, idempotent launch', async ({ page }) => {
    test.setTimeout(180_000);

    const stamp = Date.now();
    const COMPANY_NAME = `PW Onboarding Co ${stamp}`;
    const WINE_NAME = `PW Onboarding Wine ${stamp}`;
    const CONTACT_PHONE = '+995500000099';
    const CONTACT_EMAIL = `pw-onboarding-${stamp}@example.com`;
    const CONTACT_ADDRESS = 'Test Address, Tbilisi';
    const IBAN = 'GE00TEST00000000000000';

    await loginAsSuperAdmin(page);
    await page.goto('/admin/onboarding');
    await expect(page.getByRole('heading', { name: 'Getting your account ready' })).toBeVisible();

    // 2. Companies section gated until Individuals pricing is set — direct
    // check of the "grey out until Individuals pricing set" behavior.
    const gatedSection = page.locator('div.opacity-40.pointer-events-none');
    await expect(gatedSection).toBeVisible();
    await expect(gatedSection).toHaveCSS('pointer-events', 'none');
    await expect(page.getByText('Do you work with tour companies or other B2B partners?')).toBeVisible();

    // 3. Fill Individuals pricing (simple mode: one flat per-person rate).
    // Check: Companies section becomes interactive without a page reload.
    await page.getByRole('spinbutton', { name: 'Price per person (₾)' }).fill('25');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByText('Pricing set')).toBeVisible({ timeout: 10_000 });
    await expect(gatedSection).not.toBeVisible();
    await expect(page.getByText('Do you work with tour companies or other B2B partners?')).toBeVisible();

    // 4. Companies: answer "yes", add one company with a price tier.
    await page.getByRole('button', { name: 'Yes, we work with companies', exact: true }).click();
    await page.getByRole('textbox', { name: 'Company name' }).fill(COMPANY_NAME);
    await page.getByRole('spinbutton', { name: 'Price per person (₾)' }).fill('40');
    await page.getByRole('button', { name: 'Add company', exact: true }).click();
    await expect(page.getByText(COMPANY_NAME)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Continue', exact: false }).click();

    // Wines (wineOrdersOn is true for this tenant, so this step exists).
    await expect(page.getByText('Add a wine', { exact: true })).toBeVisible();
    await page.getByRole('textbox', { name: 'Wine name' }).fill(WINE_NAME);
    await page.getByRole('spinbutton', { name: 'Price (₾)' }).fill('35');
    await page.getByRole('button', { name: 'Add wine', exact: true }).click();
    await expect(page.getByText(WINE_NAME)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Continue', exact: false }).click();

    // Booking Details — deliberately left both qualifying questions
    // unanswered (neither food add-ons nor masterclasses). This is what
    // makes step 9's "optional, doesn't block Launch" check meaningful: if
    // this step were answered/done, Launch being enabled wouldn't prove
    // bookingDetails is excluded from readyToLaunch, only that it happened
    // to already be satisfied.
    await expect(page.getByText('Do you offer food add-ons', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: false }).click();

    // Payment — 7. Leave IBAN blank, advance. Checked at Review below.
    await expect(page.getByText('How should guests pay you?')).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: false }).click();

    // Contact & Site Info — 5/6. Fill phone, email, address.
    await expect(page.getByText('How can guests reach you?')).toBeVisible();
    // Fields autosave on blur (no explicit Save button), one independent
    // fetch per field. Real finding: filling all three back-to-back with
    // only one shared wait at the end lost two of the three saves — only
    // the first field (which had the most real time elapse behind it before
    // the eventual navigation) actually persisted; the other two still
    // showed their placeholder on /admin/settings. Waiting for each field's
    // own save to genuinely land before touching the next field fixes it.
    for (const [placeholder, value] of [
      ['Phone number', CONTACT_PHONE],
      ['Email address', CONTACT_EMAIL],
      ['Address / location', CONTACT_ADDRESS],
    ] as const) {
      const field = page.getByPlaceholder(placeholder);
      await field.fill(value);
      await field.blur();
      await page.waitForTimeout(2_000);
    }

    // 6. Direct regression check for KnownBugs #10 ("Contact step wrote to
    // the wrong DB table") — leave the wizard entirely and check a
    // DIFFERENT page, /admin/settings, shows the same values. The original
    // bug was invisible from inside the wizard itself.
    await page.goto('/admin/settings');
    await expect(page.getByText('Contact Info', { exact: true })).toBeVisible();
    await expect(page.getByText(CONTACT_PHONE, { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(CONTACT_EMAIL, { exact: true })).toBeVisible();
    await expect(page.getByText(CONTACT_ADDRESS, { exact: true })).toBeVisible();

    // Back into the wizard. Real finding: `furthestIndex` (which StepNav
    // tabs use to decide what's clickable) is pure client-side state,
    // recomputed from scratch on every full page load as "the first not-done
    // step" — it does NOT remember that Payment/Contact/Review were already
    // reached earlier in this same test. A plain `goto('/admin/onboarding')`
    // here would land on Booking Details (the first not-done step, since
    // that one was deliberately skipped) with its tab and everything after
    // it disabled, making the Payment tab unclickable. The wizard supports a
    // `?step=` override specifically for this — it seeds both the current
    // step AND furthestIndex, making every step up to and including it
    // reachable again.
    await page.goto('/admin/onboarding?step=payment');
    await expect(page.getByText('How should guests pay you?')).toBeVisible();

    // Same reasoning applies to the Review tab itself: furthestIndex only
    // extends to 'payment' after that reload, so Review isn't clickable yet
    // even though it was reached earlier in this test — must walk forward
    // again via Continue (payment → contact → photos → review) rather than
    // jumping the tab directly.
    await page.getByRole('button', { name: 'Continue', exact: false }).click();
    await expect(page.getByText('How can guests reach you?')).toBeVisible();
    await page.getByRole('button', { name: 'Continue', exact: false }).click();
    await page.getByRole('button', { name: 'Continue', exact: false }).click();
    await expect(page.getByText('Review', { exact: true })).toBeVisible();

    // 7. Check: Review shows Payment as required/incomplete (IBAN still blank).
    // Real finding: "Not done yet" / "Done" are not visible page text — they're
    // the `title`/`aria-label` of the row's status icon (shared.tsx's
    // StatusIcon), a plain `<span>` with no visible text content of its own
    // (just the ⚠/✓ symbol). toContainText on the row itself won't see them;
    // has to target the icon's title attribute directly.
    const paymentRow = page.getByRole('button', { name: /Payment info/ });
    await expect(paymentRow.locator('[title="Not done yet"]')).toBeVisible();

    // 9. Check: Booking Details shows as optional, not blocking anything,
    // regardless of its own (incomplete) state.
    const bookingDetailsRow = page.getByRole('button', { name: /Booking details/ });
    await expect(bookingDetailsRow).toContainText('Optional');

    // 8. Go back to Payment, fill IBAN, return to Review. Check: Payment now
    // shows complete, without a page reload.
    await page.getByRole('tab', { name: 'Payment info', exact: true }).click();
    // The IBAN field has no accessible name of its own (icon + bare input,
    // same FieldRow component the Contact step uses) — it's the last of the
    // five bank-transfer FieldRow inputs on this step, in the fixed order
    // recipient name / personal number / bank name / bank code / IBAN.
    //
    // Real finding: every step the wizard has ever mounted stays in the DOM
    // (OnboardingWizard.tsx keeps each step's component alive, toggling
    // `display: none` on navigation rather than unmounting — see its own
    // comment on why). A plain `page.locator('input')` therefore matches
    // inputs from EVERY step ever visited, not just this one — it needs
    // `:visible` to filter down to only the currently-shown step's inputs.
    const ibanInput = page.locator('input:visible').nth(4);
    await ibanInput.fill(IBAN);
    await ibanInput.blur();
    await page.waitForTimeout(1_000);

    await page.getByRole('tab', { name: 'Review & launch', exact: true }).click();
    await expect(paymentRow.locator('[title="Done"]')).toBeVisible({ timeout: 10_000 });
    await expect(paymentRow.locator('[title="Not done yet"]')).toHaveCount(0);

    // Booking Details must still read Optional/not-done — confirms Launch
    // becoming available (next) is driven by Companies+Wines+Payment only.
    await expect(bookingDetailsRow).toContainText('Optional');

    // 10. Click Launch. Check: a "Launched <date>" confirmation renders.
    const launchButton = page.getByRole('button', { name: /^Launch/ });
    await expect(launchButton).toHaveText('Launch', { timeout: 5_000 });
    await launchButton.click();
    await expect(page.getByText(/Launched [A-Z][a-z]+ \d{1,2}, \d{4}/)).toBeVisible({ timeout: 10_000 });
    const firstLaunchedText = await page.getByText(/Launched [A-Z][a-z]+ \d{1,2}, \d{4}/).textContent();

    // 11. Click Launch again. Check: no error, still shows a valid launched
    // confirmation.
    //
    // Real finding, differs from this note's original assumption: launching
    // again is NOT timestamp-idempotent — launchTenant() (app/actions/onboarding.ts)
    // unconditionally writes a fresh `new Date().toISOString()` to
    // onboarding_launched_at on every call, so a second click genuinely
    // updates the stored timestamp. The UI supports this deliberately (the
    // button relabels to "Launch again", never disables) — it reads as a
    // "re-publish" action, not a true idempotent no-op. What IS idempotent,
    // and what this checks instead: no error is thrown, and the page keeps
    // showing a valid "Launched <date>" state either way.
    const relaunchButton = page.getByRole('button', { name: 'Launch again', exact: true });
    await expect(relaunchButton).toBeVisible();
    await relaunchButton.click();
    await expect(page.getByText(/Launched [A-Z][a-z]+ \d{1,2}, \d{4}/)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Launch again', exact: true })).toBeVisible();
    // Same day, since both clicks happen back-to-back in this one test run —
    // the date-level display wouldn't change even though the underlying ISO
    // timestamp did.
    const secondLaunchedText = await page.getByText(/Launched [A-Z][a-z]+ \d{1,2}, \d{4}/).textContent();
    expect(secondLaunchedText).toBe(firstLaunchedText);
  });
});
