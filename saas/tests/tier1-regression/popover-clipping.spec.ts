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
    await page.getByRole('button', { name: /^(New|Confirmed|Completed|Cancelled) ▾$/ }).first().click();

    // expect: every option the menu offers renders fully inside the viewport.
    //
    // Asserted over whatever the menu actually contains, not a fixed list of
    // status names. Since Feature 191 the dropdown is per-order — it offers
    // only the stages this booking has not reached, plus Invoice Sent and Paid
    // while those are still outstanding — so no single row is guaranteed to
    // show any particular option. This spec is about clipping, not vocabulary,
    // and hard-coding the words made it fail for a reason it does not test.
    const viewport = page.viewportSize()!;
    const menu = page.locator('div').filter({ hasText: /^$/ }).locator('button:visible');
    const options = page.getByRole('button', {
      name: /^(New|Confirmed|Completed|Cancelled|Invoice Sent|Paid)$/, exact: true,
    });
    const count = await options.count();
    expect(count, 'the status menu should offer at least one option').toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const option = options.nth(i);
      await expect(option).toBeVisible();
      const box = await option.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      expect(box!.height).toBeGreaterThan(10);
    }
    void menu;
  });
});
