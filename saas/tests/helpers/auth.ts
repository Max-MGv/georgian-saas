import { Page, expect } from '@playwright/test';
import { getTenantAdminCredentials, getSuperAdminCredentials } from './credentials';

async function login(page: Page, email: string, password: string) {
  await page.goto('/admin/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
}

// Tenant-locked login (maxb2bsaas@gmail.com) — matches real admin usage for
// Staging Winery. Use for standard admin smoke tests (login, orders, companies).
export async function loginAsTenantAdmin(page: Page) {
  const { email, password } = getTenantAdminCredentials();
  await login(page, email, password);
  // Supabase Auth round trip can take longer than the 5s default assertion
  // timeout, especially cold — confirmed via a flaky first run 2026-08-10.
  // Bumped again 2026-08-10 (Phase 2 session): the post-login landing is
  // actually two hops — LoginForm.tsx does a client-side router.push('/admin'),
  // and app/admin/(panel)/page.tsx then does a *server* redirect('/admin/orders')
  // — both of which sit behind whatever the admin panel layout's own data
  // fetching costs at the time. 15s intermittently wasn't enough under a
  // sustained-heavy-testing dev DB (confirmed live: a run that otherwise
  // passed cleanly failed here with the URL still reading plain "/admin",
  // i.e. mid-way through the two-hop redirect, not stuck on login itself).
  await expect(page).toHaveURL(/\/admin\/orders/, { timeout: 25_000 });
}

// Cross-tenant super-admin login — only for tests that need it (theme preset
// switching, onboarding wizard on a separate test tenant). See
// playwright/notes/03-theme-colors.md and 10-onboarding-wizard.md.
export async function loginAsSuperAdmin(page: Page) {
  const { email, password } = getSuperAdminCredentials();
  await login(page, email, password);
  // Supabase Auth round trip can take longer than the 5s default assertion
  // timeout, especially cold — confirmed via a flaky first run 2026-08-10.
  // Bumped again 2026-08-10 (Phase 2 session): the post-login landing is
  // actually two hops — LoginForm.tsx does a client-side router.push('/admin'),
  // and app/admin/(panel)/page.tsx then does a *server* redirect('/admin/orders')
  // — both of which sit behind whatever the admin panel layout's own data
  // fetching costs at the time. 15s intermittently wasn't enough under a
  // sustained-heavy-testing dev DB (confirmed live: a run that otherwise
  // passed cleanly failed here with the URL still reading plain "/admin",
  // i.e. mid-way through the two-hop redirect, not stuck on login itself).
  await expect(page).toHaveURL(/\/admin\/orders/, { timeout: 25_000 });
}
