import { Page, Locator, expect } from '@playwright/test';

// ── Generic on/off pill toggles (/admin/settings) ────────────────────────────
// Plain <button type="button"> pills with no accessible name (same shape as
// enable_enhanced_company_booking — see notes/05-booking-enhanced.md). State
// is read from the inner <span>'s translateX() inline style: 22px=on, 2px=off.
// Shared by the three online-payment section toggles (#148) and any other
// plain Setting toggle on this page (e.g. show_company_price_after_booking) —
// they all render through the same Toggle component and DOM shape.
function toggleByLabel(page: Page, label: string): Locator {
  return page
    .getByText(label, { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"justify-between")][1]')
    .locator('button[type="button"]');
}

async function readToggleOn(toggle: Locator): Promise<boolean> {
  // .last() — the Toggle component (SettingsClient.tsx) also renders a leading
  // aria-hidden hit-area <span> (mobile tap-target pass); the thumb with the
  // translateX() style is always the second/last span.
  const style = await toggle.locator('span').last().getAttribute('style');
  return !!style && style.includes('translateX(22px)');
}

async function readSettingsToggle(page: Page, label: string): Promise<boolean> {
  await page.goto('/admin/settings');
  const toggle = toggleByLabel(page, label);
  await toggle.waitFor();
  return readToggleOn(toggle);
}

// Sets the toggle to `desired`, clicking only if it differs, and waits for
// the real save POST rather than just the optimistic client-side flip — same
// race documented in helpers/locale.ts's setAdminPanelLanguage (a cleanup
// click that fires right before a test ends can otherwise get cancelled
// mid-flight, leaving the real tenant stuck in the wrong state).
async function setSettingsToggle(page: Page, label: string, desired: boolean): Promise<void> {
  await page.goto('/admin/settings');
  const toggle = toggleByLabel(page, label);
  await toggle.waitFor();
  if ((await readToggleOn(toggle)) === desired) return;
  await Promise.all([
    page.waitForResponse((res) => res.url().includes('/admin/settings') && res.request().method() === 'POST'),
    toggle.click(),
  ]);
  await expect(async () => expect(await readToggleOn(toggle)).toBe(desired)).toPass({ timeout: 10_000 });
}

export type PaymentSectionLabel = 'Individual bookings' | 'Company bookings' | 'Wine orders';

export async function readPaymentSectionToggle(page: Page, section: PaymentSectionLabel): Promise<boolean> {
  return readSettingsToggle(page, section);
}

export async function setPaymentSectionToggle(page: Page, section: PaymentSectionLabel, desired: boolean): Promise<void> {
  return setSettingsToggle(page, section, desired);
}

// The price-visibility hard-block (shouldTakePayment.ts's `priceShown` gate)
// for COMPANY bookings — Plan-OnlinePayment §7.4. When off, a company booking
// is never charged, regardless of the section toggle or any per-company
// override (payment-amount-integrity.spec.ts's hidden-price test).
export async function readShowCompanyPriceToggle(page: Page): Promise<boolean> {
  return readSettingsToggle(page, 'Show price after company booking');
}

export async function setShowCompanyPriceToggle(page: Page, desired: boolean): Promise<void> {
  return setSettingsToggle(page, 'Show price after company booking', desired);
}

// ── Flitt merchant ID (/admin/settings) ──────────────────────────────────────
// Ordinary text, saved on blur (SettingsClient.tsx's handleFlittMerchantIdBlur)
// — unlike the secret key, this is not write-only, so a test can safely read
// the real value, blank it, and restore the exact same value afterward. Used
// by the "missing credentials" edge case: shouldTakePayment()/isPaymentConfigured()
// must fall back to reservation-only when either credential is absent, even
// with the module and section toggle both on.
const merchantIdInput = (page: Page) => page.getByPlaceholder(/e\.g\.\s*4056054/i);

export async function readFlittMerchantId(page: Page): Promise<string> {
  await page.goto('/admin/settings');
  const input = merchantIdInput(page);
  await input.waitFor();
  return input.inputValue();
}

export async function setFlittMerchantId(page: Page, value: string): Promise<void> {
  await page.goto('/admin/settings');
  const input = merchantIdInput(page);
  await input.waitFor();
  if ((await input.inputValue()) === value) return;
  await input.fill(value);
  await Promise.all([
    page.waitForResponse((res) => res.url().includes('/admin/settings') && res.request().method() === 'POST'),
    input.blur(),
  ]);
  await expect(async () => expect(await input.inputValue()).toBe(value)).toPass({ timeout: 10_000 });
}

// ── Per-company payment override (/admin/companies, #148) ───────────────────
// CompaniesClient.tsx's Edit panel sits behind a known, reproducible lost-
// click bug (nested-button hydration mismatch — see notes/09-companies-crud.md):
// a click resolves without throwing but its handler doesn't always run. Every
// click here retries until its expected effect is observed, same pattern as
// companies-crud.spec.ts's clickUntil.
export async function clickUntil(clickable: Locator, verify: () => Promise<void>, timeout = 20_000) {
  await expect(async () => {
    try { await verify(); return; } catch { /* not yet satisfied — click again */ }
    await clickable.click({ timeout: 5_000 });
    await verify();
  }).toPass({ timeout });
}

const OVERRIDE_LABELS = ['Default', 'Always skip', 'Always require'] as const;
export type PaymentOverride = (typeof OVERRIDE_LABELS)[number];

export const editPanelHeading = (page: Page) => page.getByRole('heading', { name: 'Edit Company', exact: true });

export async function openCompanyEditPanel(page: Page, companyName: string) {
  await page.goto('/admin/companies');
  await expect(page).toHaveURL(/\/admin\/companies/, { timeout: 10_000 });
  const escaped = companyName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const nameButton = page.getByRole('button', { name: new RegExp(`^${escaped}`) });
  // /admin/companies splits its list across two tabs — "Bookings" (the
  // default) and "Wine Orders" — and a company can exist under either one.
  // A name not visible under the default tab within a short grace period
  // (not an instant count() check — the page may simply still be rendering)
  // is checked under "Wine Orders" before giving up, rather than assuming
  // every caller's company is a booking company.
  const foundOnDefaultTab = await nameButton.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true).catch(() => false);
  if (!foundOnDefaultTab) {
    const wineTab = page.getByRole('button', { name: 'Wine Orders', exact: true });
    if (await wineTab.count() > 0) await wineTab.click();
  }
  await expect(nameButton).toBeVisible({ timeout: 10_000 });
  // Real bug fixed here (2026-09-15): `xpath=..` (immediate parent) resolves
  // the Edit button to a 0-count locator on the CompaniesClient.tsx DOM as it
  // exists today — the name button and its own label/badges live in one
  // wrapper div, and the Edit/Delete pair lives in a SIBLING wrapper div one
  // level up, not inside the name button's own parent. A 0-count locator's
  // .click() just times out silently, which reads exactly like the
  // documented "lost click" hydration bug below but isn't it — confirmed
  // live via page.evaluate that `xpath=..` finds nothing while `xpath=../..`
  // finds exactly one Edit button. This was breaking every test that calls
  // openCompanyEditPanel, not just this one — see also companies-crud.spec.ts's
  // own `companyRow()`, which has the identical `xpath=..` pattern and is
  // very likely broken the same way (out of scope to fix here — different
  // file, different test, not touched by this change).
  await clickUntil(
    nameButton.locator('xpath=../..').getByRole('button', { name: 'Edit', exact: true }),
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
