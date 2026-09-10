import { Page, Locator, expect } from '@playwright/test';

// ── Online-payment section toggles (/admin/settings, #148) ──────────────────
// Plain <button type="button"> pills with no accessible name (same shape as
// enable_enhanced_company_booking — see notes/05-booking-enhanced.md). State
// is read from the inner <span>'s translateX() inline style: 22px=on, 2px=off.
function sectionToggle(page: Page, section: 'Individual bookings' | 'Company bookings'): Locator {
  return page
    .getByText(section, { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"justify-between")][1]')
    .locator('button[type="button"]');
}

async function readToggleOn(toggle: Locator): Promise<boolean> {
  const style = await toggle.locator('span').getAttribute('style');
  return !!style && style.includes('translateX(22px)');
}

export async function readPaymentSectionToggle(
  page: Page,
  section: 'Individual bookings' | 'Company bookings'
): Promise<boolean> {
  await page.goto('/admin/settings');
  const toggle = sectionToggle(page, section);
  await toggle.waitFor();
  return readToggleOn(toggle);
}

// Sets the toggle to `desired`, clicking only if it differs, and waits for
// the real save POST rather than just the optimistic client-side flip — same
// race documented in helpers/locale.ts's setAdminPanelLanguage (a cleanup
// click that fires right before a test ends can otherwise get cancelled
// mid-flight, leaving the real tenant stuck in the wrong state).
export async function setPaymentSectionToggle(
  page: Page,
  section: 'Individual bookings' | 'Company bookings',
  desired: boolean
): Promise<void> {
  await page.goto('/admin/settings');
  const toggle = sectionToggle(page, section);
  await toggle.waitFor();
  if ((await readToggleOn(toggle)) === desired) return;
  await Promise.all([
    page.waitForResponse((res) => res.url().includes('/admin/settings') && res.request().method() === 'POST'),
    toggle.click(),
  ]);
  await expect(async () => expect(await readToggleOn(toggle)).toBe(desired)).toPass({ timeout: 10_000 });
}

// ── Per-company payment override (/admin/companies, #148) ───────────────────
// CompaniesClient.tsx's Edit panel sits behind a known, reproducible lost-
// click bug (nested-button hydration mismatch — see notes/09-companies-crud.md):
// a click resolves without throwing but its handler doesn't always run. Every
// click here retries until its expected effect is observed, same pattern as
// companies-crud.spec.ts's clickUntil.
async function clickUntil(clickable: Locator, verify: () => Promise<void>, timeout = 20_000) {
  await expect(async () => {
    try { await verify(); return; } catch { /* not yet satisfied — click again */ }
    await clickable.click({ timeout: 5_000 });
    await verify();
  }).toPass({ timeout });
}

const OVERRIDE_LABELS = ['Default', 'Always skip', 'Always require'] as const;
export type PaymentOverride = (typeof OVERRIDE_LABELS)[number];

const editPanelHeading = (page: Page) => page.getByRole('heading', { name: 'Edit Company', exact: true });

async function openCompanyEditPanel(page: Page, companyName: string) {
  await page.goto('/admin/companies');
  await expect(page).toHaveURL(/\/admin\/companies/, { timeout: 10_000 });
  const escaped = companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const nameButton = page.getByRole('button', { name: new RegExp(`^${escaped}`) });
  await expect(nameButton).toBeVisible({ timeout: 10_000 });
  await clickUntil(
    nameButton.locator('xpath=..').getByRole('button', { name: 'Edit', exact: true }),
    () => expect(editPanelHeading(page)).toBeVisible({ timeout: 2_000 })
  );
}

// Real finding while building this test: getAttribute('style') round-trips
// an authored hex color through the browser's own CSSOM, which normalizes it
// to rgb() on reflection — a literal '#e0d4c0' string match against that
// never matches anything, for either state, so a naive "does the unselected
// literal appear" check always silently fell through to the first option
// checked ('Default') regardless of what was actually selected. Comparing
// each button's *computed* backgroundColor instead sidesteps the whole
// format question: exactly one of the three should differ from the other
// two (the selected option uses the theme's brand-color variable; the other
// two share the same fixed unselected background), so the odd one out is
// the real answer regardless of which color-string format the browser uses.
async function findSelectedOverride(page: Page): Promise<PaymentOverride> {
  const colors = await Promise.all(
    OVERRIDE_LABELS.map((label) =>
      page.getByRole('button', { name: label, exact: true }).evaluate((el) => getComputedStyle(el).backgroundColor)
    )
  );
  for (let i = 0; i < colors.length; i++) {
    const others = colors.filter((_, j) => j !== i);
    if (others[0] === others[1] && colors[i] !== others[0]) return OVERRIDE_LABELS[i];
  }
  throw new Error(`Could not determine selected payment override from computed colors: ${colors.join(', ')}`);
}

export async function readCompanyPaymentOverride(page: Page, companyName: string): Promise<PaymentOverride> {
  await openCompanyEditPanel(page, companyName);
  const found = await findSelectedOverride(page);
  await clickUntil(
    page.getByRole('button', { name: 'Cancel', exact: true }),
    () => expect(editPanelHeading(page)).not.toBeVisible({ timeout: 2_000 })
  );
  return found;
}

export async function setCompanyPaymentOverride(page: Page, companyName: string, desired: PaymentOverride): Promise<void> {
  await openCompanyEditPanel(page, companyName);
  await clickUntil(
    page.getByRole('button', { name: desired, exact: true }),
    async () => expect(await findSelectedOverride(page)).toBe(desired)
  );
  await clickUntil(
    page.getByRole('button', { name: 'Save changes', exact: true }),
    () => expect(editPanelHeading(page)).not.toBeVisible({ timeout: 8_000 }),
    25_000
  );
}

// Reads the company's real Flitt-style access code from its Edit panel (the
// input has no accessible name — a type="password" field, same finding as
// booking-enhanced.spec.ts) — needed to get past the public booking form's
// access-code popup when selecting this company.
export async function readCompanyAccessCode(page: Page, companyName: string): Promise<string> {
  await openCompanyEditPanel(page, companyName);
  const code = await page.locator('input[placeholder="No code set"]').inputValue();
  await clickUntil(
    page.getByRole('button', { name: 'Cancel', exact: true }),
    () => expect(editPanelHeading(page)).not.toBeVisible({ timeout: 2_000 })
  );
  return code;
}
