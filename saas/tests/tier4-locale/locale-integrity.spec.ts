// spec: playwright/notes/11-locale-integrity.md
import { test, expect, Page } from '@playwright/test';
import { loginAsTenantAdmin } from '../helpers/auth';
import { setAdminPanelLanguage, setSiteLanguage } from '../helpers/locale';

// ── Raw-key regression guard ─────────────────────────────────────────────────
// Direct regression check for KnownBugs.md #131 part 1 ("FIELDS.form existed
// for months with zero `ka` rows — a silent no-op, not a crash"). Missing
// translations don't throw; at worst the dictionary lookup (lib/t.ts's t(),
// lib/adminT.ts's adminT()) falls all the way through to returning the raw
// key string itself, which then renders as literal text on the page. This
// scans for that exact literal-key-as-text shape.
//
// Key format — confirmed live by reading lib/t.ts, lib/adminT.ts (the two
// dictionaries covering all 5 pages below) and the SiteContent snake_case
// field keys referenced by components/BookingForm.tsx's `FIELDS.form`
// (e.g. 'form_first_name', see that file's own comment pointing at
// ContentClient.tsx): every real key in this codebase is one or more
// lowercase/camelCase word-segments joined by "." or "_" —
// 'nav.orders', 'settings.adminLanguage.sectionTitle',
// 'onboarding.companies.qualifyYes', 'form.first_name', 'form_first_name'.
// There is no bare single-word or space-separated key anywhere in either
// dictionary. Since "." and "_" are just two flavors of the same "segment
// separator" role, one regex covers both naming conventions at once — this
// is the resolution to the spec note's open question about needing to tune
// separate snake_case vs. dot-namespaced patterns.
const RAW_KEY_RE = /^[a-zA-Z]+(?:[._][a-zA-Z0-9]+)+$/;

async function findRawKeyLeaks(page: Page): Promise<string[]> {
  return page.evaluate((patternSource) => {
    const re = new RegExp(patternSource);
    const found = new Set<string>();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = (node.textContent ?? '').trim();
      // A real leaked key is always one unbroken token — genuine prose (in
      // either language) always contains a space, so this alone rules out
      // the overwhelming majority of possible false positives (sentences,
      // addresses, "e.g." style fragments) without needing a hand-maintained
      // exclusion list.
      if (!text || /\s/.test(text)) continue;
      if (!re.test(text)) continue;
      const el = node.parentElement;
      if (!el || el.closest('script, style')) continue;
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      found.add(text);
    }
    return Array.from(found);
  }, RAW_KEY_RE.source);
}

// Removed 2026-09-19: `isKnownCompaniesHydrationError()`, a filter that
// suppressed hydration errors in all five tests below.
//
// It existed for KNOWN-ISSUES.md #2 — CompaniesClient.tsx nesting HelpHint's
// "?" <button> inside the row-summary <button>, which threw a hydration
// mismatch on every load of /admin/companies. **That bug was fixed in the app
// on 2026-09-12** (KnownBugs #15), so the filter no longer suppresses anything
// it was built to suppress.
//
// Worth removing rather than leaving inert, because it was over-broad in two
// ways that only matter once the real error stops firing:
//  - it was applied to all five tests, including the public home page, the
//    wine catalogue, admin orders and admin settings — none of which render
//    CompaniesClient at all;
//  - its second pattern matched React's *generic* "Hydration failed because
//    the server rendered HTML didn't match the client" text, not just the
//    nested-button case, so ANY new hydration mismatch introduced anywhere in
//    the app would have passed these tests silently.
//
// These tests now assert on every console error they see. If that surfaces a
// failure, it is a real one — check it before re-adding any suppression.

function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

test.describe('Locale integrity — public pages', () => {
  // site_locale is a cookie scoped to this test's own browser context (see
  // lib/t.ts / app/(site)/page.tsx), not shared tenant data — but reverted
  // unconditionally anyway, same "always put back what you changed"
  // discipline as every other test in this suite.
  test.afterEach(async ({ page }) => {
    await setSiteLanguage(page, 'en');
  });

  test('public home page', async ({ page }) => {
    const consoleErrors = trackConsoleErrors(page);
    await page.goto('/');

    await setSiteLanguage(page, 'ka');

    // expect: no raw i18n key rendered as visible text (KnownBugs #131 shape)
    const leaks = await findRawKeyLeaks(page);
    expect(leaks, 'raw i18n keys leaked onto the Georgian home page').toEqual([]);

    // expect: zero console errors during the toggle — no exclusions since
    // 2026-09-19 (see the note above the trackConsoleErrors helper)
    expect(consoleErrors, 'console errors during the locale toggle').toEqual([]);

    await setSiteLanguage(page, 'en');

    // expect: bidirectional toggle — known labels are back in English
    await expect(page.getByRole('link', { name: 'Home', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Book a Visit', level: 2 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Wine Tasting', level: 3 })).toBeVisible();
  });

  test('wine catalogue', async ({ page }) => {
    const consoleErrors = trackConsoleErrors(page);
    await page.goto('/wines');

    await setSiteLanguage(page, 'ka');

    const leaks = await findRawKeyLeaks(page);
    expect(leaks, 'raw i18n keys leaked onto the Georgian wine catalogue').toEqual([]);

    expect(consoleErrors, 'console errors during the locale toggle').toEqual([]);

    await setSiteLanguage(page, 'en');

    await expect(page.getByRole('link', { name: 'Order Wine', exact: true }).first()).toBeVisible();
    await expect(
      page.getByText('Select wines, set quantities, and place a reservation.', { exact: true })
    ).toBeVisible();
  });
});

test.describe('Locale integrity — admin pages', () => {
  // Staging Winery's admin-panel language is real, shared tenant data — revert
  // it unconditionally, pass or fail. A past uncleaned failure left it stuck
  // on Georgian for other users (see ARCHITECTURE.md / KNOWN-ISSUES.md); same
  // discipline as mobile-georgian-overflow.spec.ts.
  test.afterEach(async ({ page }) => {
    await setAdminPanelLanguage(page, 'en');
  });

  test('admin orders', async ({ page }) => {
    // Login + two full toggle-and-reload cycles (each: goto /admin/settings,
    // click, wait for the real POST, goto the target page again) is more
    // round trips than theme-colors.spec.ts's 60s budget was sized for —
    // bumped further given this dev DB's currently-observed 2-9s per request.
    test.setTimeout(90_000);
    await loginAsTenantAdmin(page);
    const consoleErrors = trackConsoleErrors(page);

    await setAdminPanelLanguage(page, 'ka');
    await page.goto('/admin/orders');

    const leaks = await findRawKeyLeaks(page);
    expect(leaks, 'raw i18n keys leaked onto the Georgian admin orders page').toEqual([]);

    expect(consoleErrors, 'console errors during the locale toggle').toEqual([]);

    await setAdminPanelLanguage(page, 'en');
    await page.goto('/admin/orders');

    await expect(page.getByRole('heading', { name: 'Orders', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Companies', exact: true })).toBeVisible();
    await expect(page.locator('a[href="/admin/orders/new"]')).toBeVisible();
  });

  test('admin settings', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAsTenantAdmin(page);
    const consoleErrors = trackConsoleErrors(page);

    await setAdminPanelLanguage(page, 'ka');
    await page.goto('/admin/settings');

    const leaks = await findRawKeyLeaks(page);
    expect(leaks, 'raw i18n keys leaked onto the Georgian admin settings page').toEqual([]);

    expect(consoleErrors, 'console errors during the locale toggle').toEqual([]);

    await setAdminPanelLanguage(page, 'en');
    await page.goto('/admin/settings');

    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    // Exact-cased to disambiguate from the field label just below it
    // ("Admin panel language", lowercase p — settings.adminLanguage.fieldLabel).
    await expect(page.getByText('Admin Panel Language', { exact: true })).toBeVisible();
    await expect(page.getByText('Default site language', { exact: true })).toBeVisible();
  });

  test('admin companies', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAsTenantAdmin(page);
    const consoleErrors = trackConsoleErrors(page);

    await setAdminPanelLanguage(page, 'ka');
    await page.goto('/admin/companies');

    const leaks = await findRawKeyLeaks(page);
    expect(leaks, 'raw i18n keys leaked onto the Georgian admin companies page').toEqual([]);

    // expect: zero console errors. This page used to throw KNOWN-ISSUES.md
    // #2's nested-button hydration mismatch on every load regardless of
    // locale, which was filtered out; that bug was fixed 2026-09-12 and the
    // filter removed 2026-09-19, so this is now an unconditional assertion —
    // /admin/companies is the page most likely to prove it.
    expect(consoleErrors, 'console errors during the locale toggle').toEqual([]);

    await setAdminPanelLanguage(page, 'en');
    await page.goto('/admin/companies');

    await expect(page.getByRole('heading', { name: 'Companies', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Bookings', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Add Booking Company', exact: true })).toBeVisible();
  });
});
