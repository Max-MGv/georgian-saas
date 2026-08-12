import { Page } from '@playwright/test';

// The admin-panel-language toggle lives on /admin/settings as two "en"/"ka"
// buttons — the FIRST such pair on the page (the second pair, further down,
// is "Default site language" for public visitors, a different setting).
// Confirmed live: 2026-08-10 explore pass. "Applies the next time a page
// loads" per the settings page's own copy — not instant, a fresh navigation
// is required to see it take effect.
export async function setAdminPanelLanguage(page: Page, lang: 'en' | 'ka') {
  await page.goto('/admin/settings');
  // The toggle POSTs to /admin/settings (a Server Action) and updates the
  // button's [active] state optimistically client-side — but the actual
  // persistence is a separate in-flight request. Without waiting for it,
  // a click right before a test/context ends can be cancelled mid-flight,
  // silently failing to persist (confirmed live 2026-08-10: cleanup clicks
  // in a failing test's afterEach left the tenant's language stuck on 'ka').
  await Promise.all([
    page.waitForResponse((res) => res.url().includes('/admin/settings') && res.request().method() === 'POST'),
    page.getByRole('button', { name: lang, exact: true }).first().click(),
  ]);
}

// Public site language toggle: desktop nav shows it directly; below the nav's
// collapse breakpoint it's hidden inside the "Menu" button first. Confirmed
// live: collapses well before 375px width.
export async function setSiteLanguage(page: Page, lang: 'en' | 'ka') {
  const menuButton = page.getByRole('button', { name: 'Menu' });
  if (await menuButton.isVisible().catch(() => false)) {
    await menuButton.click();
  }
  await page.getByRole('button', { name: lang, exact: true }).click();
}
