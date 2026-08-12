import { test, expect } from '@playwright/test';

// Lands every scenario on Staging Winery's public home page — the shared
// starting point per playwright/README.md. Runs against localhost, which
// resolves to Staging Winery via DEFAULT_TENANT_ID (MaintenanceNotes.md §4).
test('seed', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL('http://localhost:3000/');
});
