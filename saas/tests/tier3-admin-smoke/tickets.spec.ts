// spec: vault/Plan-Tickets.md - the internal ticket tool (super-admin).
//
// Covers the parts that are easy to break silently: the workflow rules (a reason is required to
// close, a note is required to send back, review card -> verify), that the token API refuses
// unauthenticated callers, and that a report sent through the public widget becomes a ticket.
// Every ticket it creates is closed again at the end (there is deliberately no delete), and is
// titled "ZZ Tickets E2E ..." so a leftover is easy to spot.
import { test, expect, type Page } from '@playwright/test';
import { getSuperAdminCredentials, getTicketsDevToken } from '../helpers/credentials';

const STAMP = Date.now();
const TITLE = `ZZ Tickets E2E ${STAMP}`;
const WIDGET_TEXT = `ZZ Tickets E2E widget ${STAMP} - please ignore`;

async function loginSuperAdmin(page: Page) {
  const { email, password } = getSuperAdminCredentials();
  await page.goto('/admin/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 60_000 });
}

async function closeTicketOnPage(page: Page) {
  await page.getByLabel('Status').selectOption('CLOSED');
  await expect(page.getByText('Close this ticket')).toBeVisible();
  await page.getByRole('button', { name: 'Close ticket' }).click();
  await expect(page.getByText(/Closed · /).first()).toBeVisible({ timeout: 20_000 });
}

test.describe('Internal tickets (super-admin)', () => {
  test('API refuses a missing or wrong token', async ({ request }) => {
    expect((await request.get('/api/tickets')).status()).toBe(401);
    const bad = await request.get('/api/tickets', { headers: { Authorization: 'Bearer tkt_not_a_real_token' } });
    expect(bad.status()).toBe(401);
    expect((await request.post('/api/tickets', { data: { title: 'x' } })).status()).toBe(401);
  });

  test('token API: create, comment, hand over for review - and refuses what a token must not do', async ({ request }) => {
    const auth = { Authorization: `Bearer ${getTicketsDevToken()}` };
    const title = `ZZ Tickets E2E api ${STAMP}`;

    // A ticket may only START in Inbox / Backlog / In progress.
    for (const status of ['DONE', 'REVIEW', 'CLOSED']) {
      const bad = await request.post('/api/tickets', { headers: auth, data: { title, status } });
      expect(bad.status(), `create as ${status}`).toBe(400);
    }
    expect((await request.post('/api/tickets', { headers: auth, data: { title, tenantId: 'not-a-real-tenant' } })).status()).toBe(400);
    expect((await request.post('/api/tickets', { headers: auth, data: null })).status()).toBe(400);

    const created = await request.post('/api/tickets', { headers: auth, data: { title, description: 'created by the API test', type: 'TASK', area: 'Infrastructure' } });
    expect(created.status()).toBe(201);
    const { number } = await created.json();

    expect((await request.post(`/api/tickets/${number}/comments`, { headers: auth, data: { body: 'hello from the API test' } })).status()).toBe(201);

    // The token can never mark Done, move to Ready to test without a card, or change the tenant.
    expect((await request.patch(`/api/tickets/${number}`, { headers: auth, data: { status: 'DONE' } })).status()).toBe(400);
    expect((await request.patch(`/api/tickets/${number}`, { headers: auth, data: { status: 'REVIEW' } })).status()).toBe(400);
    expect((await request.patch(`/api/tickets/${number}`, { headers: auth, data: { tenantId: 'x' } })).status()).toBe(400);
    // One bad field must not leave a half-applied edit: the new title must NOT have been saved.
    const refused = await request.patch(`/api/tickets/${number}`, { headers: auth, data: { title: 'SHOULD NOT SAVE', status: 'DONE' } });
    expect(refused.status()).toBe(400);
    expect((await (await request.get(`/api/tickets/${number}`, { headers: auth })).json()).title).toBe(title);
    // Closing needs a reason; garbage numbers are a clean 400, not a 500.
    expect((await request.patch(`/api/tickets/${number}`, { headers: auth, data: { status: 'CLOSED' } })).status()).toBe(400);
    expect((await request.get('/api/tickets/3000000000', { headers: auth })).status()).toBe(400);
    expect((await request.get('/api/tickets/0x1F', { headers: auth })).status()).toBe(400);

    // The review hand-over needs both fields, then moves the ticket to Ready to test.
    expect((await request.post(`/api/tickets/${number}/review`, { headers: auth, data: { changed: 'x' } })).status()).toBe(400);
    expect((await request.post(`/api/tickets/${number}/review`, { headers: auth, data: { changed: 'x', howToTest: 'y' } })).status()).toBe(201);
    const detail = await (await request.get(`/api/tickets/${number}`, { headers: auth })).json();
    expect(detail.status).toBe('REVIEW');
    expect(detail.untrustedText).toBe(false);

    // The list reports totals, and an own ticket may be closed with a reason (clean-up).
    const list = await (await request.get('/api/tickets?q=ZZ%20Tickets%20E2E%20api&limit=1', { headers: auth })).json();
    expect(list.total).toBeGreaterThanOrEqual(1);
    expect((await request.patch(`/api/tickets/${number}`, { headers: auth, data: { status: 'CLOSED', closeReason: 'OBSOLETE' } })).status()).toBe(200);
    // ...after which it is finished and the token cannot reopen it.
    expect((await request.patch(`/api/tickets/${number}`, { headers: auth, data: { status: 'BACKLOG' } })).status()).toBe(400);
  });

  test('board → quick add → review card → send back needs a note → verify → close needs a reason', async ({ page }) => {
    // A dozen chained server actions, each slow on a cold dev server.
    test.setTimeout(150_000);
    await loginSuperAdmin(page);
    await page.goto('/super-admin/tickets');

    // Quick add lands in Inbox and is searchable.
    await page.getByLabel('New ticket title').fill(TITLE);
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByLabel('Search tickets').fill(TITLE);
    const card = page.locator('a', { hasText: TITLE }).first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.click();
    // Wait for the navigation, and match the label exactly: the board's "New ticket title" box also contains the word Title.
    await page.waitForURL(/\/super-admin\/tickets\/\d+$/, { timeout: 60_000 });
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue(TITLE, { timeout: 30_000 });

    // Review card: both "what changed" and "how to test" are required.
    await page.getByRole('button', { name: /Mark ready to test/ }).click();
    await page.getByLabel('What changed').fill('Nothing - automated test.');
    await page.getByRole('button', { name: 'Move to Ready to test' }).click();
    await expect(page.locator('[role="alert"]', { hasText: 'how to test' })).toBeVisible({ timeout: 20_000 });
    await page.getByLabel('How to test').fill('Nothing - automated test.');
    await page.getByRole('button', { name: 'Move to Ready to test' }).click();
    await expect(page.getByText('Ready to test — waiting for you')).toBeVisible({ timeout: 20_000 });

    // Sending back without a note is refused; with a note it returns to In progress.
    await page.getByRole('button', { name: /send back/ }).click();
    await expect(page.locator('[role="alert"]', { hasText: 'what is still wrong' })).toBeVisible({ timeout: 20_000 });
    await page.getByLabel('Review note').fill('Still wrong - automated test.');
    await page.getByRole('button', { name: /send back/ }).click();
    await expect(page.getByText('Sent back').first()).toBeVisible({ timeout: 20_000 });

    // Back to review, then verify -> Done.
    await page.getByRole('button', { name: /Mark ready to test/ }).click();
    await page.getByLabel('What changed').fill('Second pass.');
    await page.getByLabel('How to test').fill('Second pass.');
    await page.getByRole('button', { name: 'Move to Ready to test' }).click();
    await page.getByRole('button', { name: /Verified/ }).click();
    // Not getByText('Verified'): that also matches the "Verified - mark Done" button, which exists before the action has finished.
    await expect(page.getByText('Ready to test → Done')).toBeVisible({ timeout: 30_000 });

    // Closing asks for a reason (a Done ticket can still be closed out).
    await closeTicketOnPage(page);
  });

  test('a public widget report becomes a Widget ticket', async ({ page, browser }) => {
    test.setTimeout(120_000);
    // Send the report from the public site as an anonymous visitor.
    await page.goto('/');
    await page.getByRole('button', { name: 'Report a bug or feature request' }).click();
    await page.getByPlaceholder(/Describe the bug/).fill(WIDGET_TEXT);
    await page.getByRole('button', { name: 'Send report' }).click();
    await expect(page.getByRole('button', { name: 'Send report' })).toHaveCount(0, { timeout: 30_000 });

    // The super-admin sees it as a ticket from the Widget source.
    const adminCtx = await browser.newContext();
    const admin = await adminCtx.newPage();
    await loginSuperAdmin(admin);
    await admin.goto('/super-admin/tickets');
    await admin.getByLabel('Search tickets').fill(`ZZ Tickets E2E widget ${STAMP}`);
    const card = admin.locator('a', { hasText: `ZZ Tickets E2E widget ${STAMP}` }).first();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.click();
    await expect(admin.getByText('Widget', { exact: true }).first()).toBeVisible();
    await closeTicketOnPage(admin);
    await adminCtx.close();
  });
});
