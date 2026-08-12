// spec: playwright/notes/02-popover-clipping.md
import { test, expect } from '@playwright/test';
import { loginAsTenantAdmin } from '../helpers/auth';

test.describe('Popover / dropdown clipping', () => {
  test('Orders "?" HelpHint stays within the viewport', async ({ page }) => {
    await loginAsTenantAdmin(page);
    await page.goto('/admin/orders');

    // 1. Click the HelpHint trigger next to "Print Sheet"
    await page.getByRole('button', { name: '?' }).click();

    // expect: a tooltip renders with real content, fully inside the viewport
    // (not just a 1px sliver — direct regression check for KnownBugs #7)
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();

    const box = await tooltip.boundingBox();
    expect(box).not.toBeNull();
    const viewport = page.viewportSize()!;
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    expect(box!.height, 'popover height should be well above a clipped 1px sliver').toBeGreaterThan(20);

    const text = await tooltip.textContent();
    expect(text && text.length).toBeGreaterThan(0);
  });

  test('Orders row status dropdown stays within the viewport', async ({ page }) => {
    await loginAsTenantAdmin(page);
    await page.goto('/admin/orders');

    // 1. Click the first row's status pill to open its dropdown
    await page.getByRole('button', { name: /^(New|Confirmed|Invoice Sent|Awaiting Payment|Paid|Completed|Cancelled) ▾$/ }).first().click();

    // expect: each status option renders fully inside the viewport
    const viewport = page.viewportSize()!;
    for (const status of ['New', 'Confirmed', 'Invoice Sent', 'Paid', 'Completed']) {
      const option = page.getByRole('button', { name: status, exact: true });
      await expect(option).toBeVisible();
      const box = await option.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      expect(box!.height).toBeGreaterThan(10);
    }
  });
});
