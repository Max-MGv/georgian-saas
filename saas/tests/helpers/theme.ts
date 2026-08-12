import { Page } from '@playwright/test';
import { loginAsSuperAdmin } from './auth';

export { loginAsSuperAdmin };

const STAGING_WINERY_TENANT_ID = 'cmrxb85wo0000vlc0d964nzf8';

// Switches Staging Winery's live theme preset via the super-admin tenant
// editor. Confirmed live 2026-08-10: swatch buttons are `getByRole('button',
// { name: '<preset name>' })` — the button's accessible name comes from a
// child <span>, not a title/aria-label attribute. Waits for the save POST to
// resolve (same race-condition class as setAdminPanelLanguage in locale.ts).
//
// Caller must already be logged in as super-admin (call `loginAsSuperAdmin`
// once at the top of the test) — this does NOT log in itself. Logging in
// fresh on every call (including from `afterEach`) made a 2-preset-switch
// test take 3 full login round trips and blew past even a 90s timeout;
// logging in once and reusing the session for the whole test is what
// actually fits in a sane timeout. Confirmed live 2026-08-10: a run that hit
// this exact timeout left Staging Winery's real theme stuck on the dark
// preset it never got to revert to — fixed manually, see playwright/notes/03-theme-colors.md.
export async function setTenantTheme(page: Page, presetName: string) {
  await page.goto(`/super-admin/tenants/${STAGING_WINERY_TENANT_ID}`);
  await page.getByRole('button', { name: presetName, exact: true }).click();
  await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes(`/super-admin/tenants/${STAGING_WINERY_TENANT_ID}`) && res.request().method() === 'POST'
    ),
    page.getByRole('button', { name: 'Save Changes' }).click(),
  ]);
}

// After changing the tenant theme, any page the same `page` object already
// rendered needs a hard reload to pick it up — `page.goto()` to a URL it's
// already on is a soft client-side navigation in Next.js and silently reuses
// the previous (stale-theme) RSC payload. Confirmed live 2026-08-10:
// `--site-bg` stayed on the old preset's value after `goto('/')` alone, and
// only updated after an explicit `reload()`.
export async function gotoWithFreshTheme(page: Page, url: string) {
  await page.goto(url);
  await page.reload();
}
