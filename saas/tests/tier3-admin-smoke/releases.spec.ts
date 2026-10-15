// spec: vault/Plan-ReleaseNotes.md - release notes (Super Admin → Releases) and the clients' What's new page.
//
// Covers the rules that matter: the token API only drafts (it can never publish or show a release to clients, and
// "Take me there" must stay inside the admin), clients see a release only when it is published AND shown, internal
// changes stay hidden, and unpublishing hides it again. The release it creates is deleted at the end.
import { test, expect, type Page } from '@playwright/test';
import { getSuperAdminCredentials, getTicketsDevToken } from '../helpers/credentials';

const STAMP = Date.now();
const SUMMARY = `ZZ Releases E2E ${STAMP} - please ignore`;
const CLIENT_TITLE = `ZZ client change ${STAMP}`;
const INTERNAL_TITLE = `ZZ internal change ${STAMP}`;

async function loginSuperAdmin(page: Page) {
  const { email, password } = getSuperAdminCredentials();
  await page.goto('/admin/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 60_000 });
}

test('release notes: token drafts, Max publishes and shows, clients see only client changes', async ({ page, request }) => {
  test.setTimeout(180_000);
  const auth = { Authorization: `Bearer ${getTicketsDevToken()}` };

  // ── The token drafts ──
  expect((await request.get('/api/releases')).status()).toBe(401);
  const created = await request.post('/api/releases', { headers: auth, data: { releasedOn: '2026-10-15', summary: SUMMARY } });
  expect(created.status()).toBe(201);
  const { id } = await created.json();
  expect((await request.post('/api/releases', { headers: auth, data: { releasedOn: '2026-13-45' } })).status()).toBe(400);
  expect((await request.post(`/api/releases/${id}/entries`, { headers: auth, data: { title: CLIENT_TITLE, body: 'What changed.', howTo: 'Step one\nStep two', linkPath: '/admin/settings' } })).status()).toBe(201);
  expect((await request.post(`/api/releases/${id}/entries`, { headers: auth, data: { title: INTERNAL_TITLE, clientVisible: false } })).status()).toBe(201);
  // ...but never outside the admin, and never publishes or shows to clients.
  expect((await request.post(`/api/releases/${id}/entries`, { headers: auth, data: { title: 'x', linkPath: 'https://evil.example.com' } })).status()).toBe(400);
  expect((await request.patch(`/api/releases/${id}`, { headers: auth, data: { status: 'PUBLISHED' } })).status()).toBe(403);
  expect((await request.patch(`/api/releases/${id}`, { headers: auth, data: { clientVisible: true } })).status()).toBe(403);

  // ── Max publishes and shows it ──
  await loginSuperAdmin(page);
  await page.goto(`/super-admin/releases/${id}`);
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByLabel('Show to clients')).toBeDisabled();
  await page.getByRole('button', { name: 'Publish', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unpublish', exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel('Show to clients').check();
  await expect(page.getByLabel('Show to clients')).toBeChecked();
  // A published release is Max's: the token can no longer change it.
  await expect.poll(async () => (await request.post(`/api/releases/${id}/entries`, { headers: auth, data: { title: 'late' } })).status(), { timeout: 20_000 }).toBe(400);

  // ── Clients ──
  await page.goto('/admin/whats-new');
  await expect(page.getByText(CLIENT_TITLE)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(INTERNAL_TITLE)).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Take me there/ })).toHaveAttribute('href', '/admin/settings');
  await expect(page.getByRole('link', { name: /What's new/ })).toBeVisible();

  // ── Unpublish hides it again; then clean up ──
  await page.goto(`/super-admin/releases/${id}`);
  await page.getByRole('button', { name: 'Unpublish', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Publish', exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Show to clients')).not.toBeChecked();
  await page.goto('/admin/whats-new');
  await expect(page.getByRole('heading', { name: "What's new" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(CLIENT_TITLE)).toHaveCount(0);
  await page.goto(`/super-admin/releases/${id}`);
  page.once('dialog', d => void d.accept());
  await page.getByRole('button', { name: 'Delete this draft' }).click();
  await page.waitForURL(/\/super-admin\/releases$/, { timeout: 30_000 });
  await expect(page.getByText(SUMMARY)).toHaveCount(0);
});
