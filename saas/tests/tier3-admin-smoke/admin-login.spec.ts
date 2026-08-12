// spec: playwright/notes/07-admin-login.md
import { test, expect } from '@playwright/test';
import { getTenantAdminCredentials } from '../helpers/credentials';

test.describe('Admin login', () => {
  test('valid credentials sign in and reach Orders', async ({ page }) => {
    const { email, password } = getTenantAdminCredentials();

    // 1. Navigate to the login page
    await page.goto('/admin/login');

    // 2. Fill valid tenant admin credentials
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);

    // 3. Submit
    await page.getByRole('button', { name: 'Sign In' }).click();

    // expect: redirected off /admin/login, onto /admin/orders
    // (Supabase Auth round trip can be slow, especially cold — default 5s
    // assertion timeout was catching it mid "Signing in…", not actually failed)
    await expect(page).toHaveURL(/\/admin\/orders/, { timeout: 15_000 });

    // expect: nav bar renders with the full expected link set
    const nav = page.getByRole('navigation');
    await expect(nav.getByRole('link', { name: 'Orders', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Companies' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Statistics' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Wines' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Settings' })).toBeVisible();

    // expect: the signed-in user's email is shown
    await expect(page.getByText(email)).toBeVisible();

    // 4. Log out
    await page.getByRole('button', { name: 'Sign out' }).click();

    // expect: redirected back to /admin/login
    await expect(page).toHaveURL(/\/admin\/login/);
  });

  test('invalid password shows an error and does not authenticate', async ({ page, context }) => {
    const { email } = getTenantAdminCredentials();

    // 1. Navigate to the login page
    await page.goto('/admin/login');

    // 2. Submit with a deliberately wrong password
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill('deliberately-wrong-password');
    await page.getByRole('button', { name: 'Sign In' }).click();

    // expect: an error message renders (same slow-auth-roundtrip reasoning as above)
    await expect(page.getByText('Incorrect email or password.')).toBeVisible({ timeout: 15_000 });

    // expect: URL stays on /admin/login
    await expect(page).toHaveURL(/\/admin\/login/);

    // expect: no auth/session cookie was set — the failed attempt doesn't
    // half-authenticate (see playwright/notes/07-admin-login.md)
    const cookies = await context.cookies();
    const authCookie = cookies.find((c) => /sb-|supabase|session/i.test(c.name));
    expect(authCookie).toBeUndefined();
  });
});
