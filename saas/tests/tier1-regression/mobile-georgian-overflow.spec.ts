// spec: playwright/notes/01-mobile-georgian-overflow.md
import { test, expect, Page } from '@playwright/test';
import { loginAsTenantAdmin } from '../helpers/auth';
import { setAdminPanelLanguage, setSiteLanguage } from '../helpers/locale';

async function checkNoHorizontalOverflow(page: Page) {
  // expect: scrollWidth === clientWidth — any excess means something
  // overflowed horizontally (KnownBugs #3, #8, #9, #131)
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth, 'document.documentElement.scrollWidth should equal clientWidth (no horizontal overflow)').toBe(
    clientWidth
  );
}

test.describe('Mobile + Georgian overflow — public pages', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('public home page', async ({ page }) => {
    await page.goto('/');
    await setSiteLanguage(page, 'ka');

    await checkNoHorizontalOverflow(page);
  });

  test('wine catalogue', async ({ page }) => {
    await page.goto('/wines');
    await setSiteLanguage(page, 'ka');

    await checkNoHorizontalOverflow(page);
  });
});

test.describe('Mobile + Georgian overflow — admin pages', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  // The admin-language setting is real, shared Staging Winery data — reset
  // it to English afterward regardless of pass/fail, same discipline as
  // every prior session that touched this tenant's live settings.
  test.afterEach(async ({ page }) => {
    await setAdminPanelLanguage(page, 'en');
  });

  test('admin orders', async ({ page }) => {
    // Real finding (Plan-PlaywrightSuiteHardening Chunk 6, 2026-10-02): this
    // test has no explicit budget, so it ran on Playwright's 30s global
    // default — too tight for its real sequence (login's own Supabase Auth
    // round trip alone can run ~10s+ per helpers/auth.ts, plus a settings
    // page goto, a language-toggle click + POST wait, and a final goto, each
    // measured at multiple seconds on this dev setup). Confirmed live,
    // reproducibly: the final goto() gets aborted (net::ERR_ABORTED) when
    // Playwright force-tears-down the page at the 30s deadline mid-navigation
    // — not a stuck request, just not enough budget for a correct flow.
    test.setTimeout(60_000);
    await loginAsTenantAdmin(page);
    await setAdminPanelLanguage(page, 'ka');
    await page.goto('/admin/orders');

    // expect: no horizontal overflow (direct regression check for KnownBugs #9 —
    // the header row title + view toggle + "+ New Order" button previously
    // overflowed at exactly this width, in Georgian)
    await checkNoHorizontalOverflow(page);

    // expect: the primary action button stays fully within the viewport —
    // localizes the check to the exact element that broke in #9, rather
    // than only the page-wide scrollWidth signal. Targeted by href, not
    // text, since the label is translated once the page is in Georgian.
    const newOrderLink = page.locator('a[href="/admin/orders/new"]');
    const box = await newOrderLink.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  });

  test('admin companies', async ({ page }) => {
    // Same real finding and fix as 'admin orders' above — identical sequence,
    // identically tight on the 30s default (passed once at 33.1s, already
    // over budget, then failed the same way as its sibling in the full-suite
    // run this was found in).
    test.setTimeout(60_000);
    await loginAsTenantAdmin(page);
    await setAdminPanelLanguage(page, 'ka');
    await page.goto('/admin/companies');

    // expect: no horizontal overflow (direct regression check for the
    // original #131 Companies-step overflow)
    await checkNoHorizontalOverflow(page);
  });
});
