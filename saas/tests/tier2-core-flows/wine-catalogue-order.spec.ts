// spec: playwright/notes/06-wine-catalogue-order.md
import { test, expect, Page, Locator } from '@playwright/test';
import { loginAsTenantAdmin } from '../helpers/auth';
import { setSiteLanguage } from '../helpers/locale';

const TEST_BUSINESS_NAME = `Playwright Wine Test ${Date.now()}`;
const TEST_EMAIL = `playwright-wine-order-${Date.now()}@example.com`;

// Real finding: the wine catalogue's real-name wine — "Rkatsiteli" — already
// has a Georgian nameKa set ("რქაწითელი", confirmed live via direct DB read)
// on Staging Winery. This resolves the note's open question ("if none do,
// seed a fixture") — no fixture data needed, real tenant data already covers
// the regression check.
const WINE_NAME_EN = 'Rkatsiteli';
const WINE_NAME_KA = 'რქაწითელი';
const WINE_YEAR = '2026';

// See booking-simple.spec.ts for why this exists.
async function ensureAdminLoggedIn(page: Page) {
  await page.goto('/admin/orders');
  if (page.url().includes('/admin/login')) {
    await loginAsTenantAdmin(page);
  } else {
    await expect(page).toHaveURL(/\/admin\/orders/);
  }
}

// Scopes to a single wine's grid card by exact name + year, so a wine with
// multiple vintages (Rkatsiteli 2026 vs 2023) doesn't collide — and, just as
// important, so "Rkatsiteli" doesn't substring-match "Rkatsiteli Amber"'s
// card too (a plain .filter({hasText: 'Rkatsiteli'}) would, since hasText is
// a substring match). Filtering by an exact-text descendant <p> avoids that.
// WineCatalogueClient.tsx has no data-testid / aria-label on these cards —
// this pins to the card container's exact Tailwind class list, about as
// stable a non-semantic anchor as the component offers.
function wineCard(page: Page, name: string, year: string): Locator {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return page
    .locator('div.rounded-xl.border.overflow-hidden.flex.flex-col')
    .filter({ has: page.locator('p', { hasText: new RegExp(`^${escaped}$`) }) })
    .filter({ hasText: year });
}

test.describe('Wine catalogue → order', () => {
  test.afterEach(async ({ context }, testInfo) => {
    // The test body's own step 7 already cancels the order it created as
    // part of the documented flow (matching the note's steps) — this hook
    // is a safety net for when the body fails *before* reaching step 7, not
    // a second guaranteed cleanup pass. Skipping it on a pass avoids a whole
    // second admin login + navigation + filter round trip (each of which
    // can cost real seconds) on the common/happy path, where there is
    // nothing left to clean up anyway.
    if (testInfo.status === 'passed') return;
    const page = await context.newPage();
    await ensureAdminLoggedIn(page);
    await page.goto('/admin/wine-orders');
    // Real finding: the default "All" filter view on /admin/wine-orders does
    // NOT surface pending_payment ("Awaiting Payment") orders — only the
    // "Awaiting Payment" quick filter does (confirmed live: a freshly
    // submitted order was invisible under "All" until this filter was
    // clicked). Must filter here to find the order at all.
    await page.getByRole('button', { name: /Awaiting Payment/ }).click();
    // Real finding: a cold Next.js dev-server compile on a route's first
    // visit can outlast the 5s default assertion timeout (see booking-simple.spec.ts).
    await page.locator('table, [class*="grid"]').first().waitFor({ timeout: 15_000 }).catch(() => {});
    const card = page.getByText(TEST_BUSINESS_NAME, { exact: true }).locator('xpath=../../..');
    if (await card.count() > 0) {
      // Real finding: Wine Orders has no delete action at all (unlike
      // regular Orders' "Delete order" button) — only status transitions.
      // "Cancelled" is the closest thing to cleanup the UI offers. Also real:
      // the confirm (✓/✗) auto-dismisses after 5s (WineOrdersClient.tsx,
      // `requestChange`'s setTimeout) — click Cancelled then ✓ back-to-back,
      // no intervening awaits, well inside that window.
      await card.getByRole('button', { name: 'Cancelled', exact: true }).click();
      await card.getByRole('button', { name: '✓' }).click();
    }
    await page.close();
  });

  test('browse in Georgian, add to cart, checkout, submit, verify snapshot in admin', async ({ page, context }) => {
    // Real finding: 90s (already generous per booking-enhanced.spec.ts) was
    // still not enough — a full run got all the way through checkout, the
    // Flitt redirect, and into admin verification before the *afterEach*
    // hook (which shares the same overall test timeout budget) ran out of
    // room. This flow has the most steps of the three Phase 2 tests: public
    // browsing + 2 price captures + checkout + submit + redirect + admin
    // verify + a *second*, separate admin cleanup session.
    test.setTimeout(120_000);

    // 1 & 2. With site language set to 'ka', navigate to /wines and confirm
    // the wine with nameKa set shows the Georgian name, not the English one.
    await page.goto('/wines');
    await setSiteLanguage(page, 'ka');
    await expect(page.getByText(WINE_NAME_KA, { exact: true }).first()).toBeVisible();
    // expect: the English name is not used for this wine's card anymore
    // (direct regression check for MaintenanceNotes.md §5's wineDisplayName() risk)
    await expect(wineCard(page, WINE_NAME_EN, WINE_YEAR)).toHaveCount(0);

    // Capture unit prices from the catalogue cards before adding to cart, to
    // cross-check against the checkout drawer's line items later (step 4).
    const kaCard = wineCard(page, WINE_NAME_KA, WINE_YEAR);
    const kaCardPriceText = await kaCard.getByText('₾', { exact: false }).first().textContent();
    const kaUnitPrice = parseInt(kaCardPriceText || '0', 10);
    expect(kaUnitPrice).toBeGreaterThan(0);

    const amberCard = wineCard(page, 'Rkatsiteli Amber', WINE_YEAR);
    const amberPriceText = await amberCard.getByText('₾', { exact: false }).first().textContent();
    const amberUnitPrice = parseInt(amberPriceText || '0', 10);
    expect(amberUnitPrice).toBeGreaterThan(0);

    // 3. Add 2 wines to cart. expect: cart badge count equals 2.
    await kaCard.getByRole('button', { name: '+', exact: true }).click();
    await amberCard.getByRole('button', { name: '+', exact: true }).click();
    // expect: each card's own quantity stepper reads 1
    await expect(kaCard.getByRole('textbox')).toHaveValue('1');
    await expect(amberCard.getByRole('textbox')).toHaveValue('1');
    // expect: the sticky bottom bar's bottle count is 2. The "N bottle(s)"
    // suffix is translated (t(locale, 'wine.bottle.plural')) so it reads
    // differently in Georgian — match the digit only, not the full phrase.
    await expect(page.getByText(/^2\s/).first()).toBeVisible();

    // 4. Open the checkout drawer. Real finding: "Checkout →" (and every
    // other checkout-drawer string used below — field placeholders, "Order &
    // Pay") is a hardcoded literal in WineCatalogueClient.tsx, not run
    // through t(locale, ...) — confirmed by reading the source. It stays in
    // English even with the site in Georgian, unlike the rest of the page.
    await page.getByRole('button', { name: 'Checkout →', exact: true }).click();
    // expect: line-item prices shown match the prices displayed on the
    // catalogue cards for the same wines (qty 1 each, so unit price === line total)
    await expect(page.getByText(`${kaUnitPrice}₾`, { exact: true }).last()).toBeVisible();
    await expect(page.getByText(`${amberUnitPrice}₾`, { exact: true }).last()).toBeVisible();

    // 5. Fill required checkout/contact fields, submit.
    // Real finding: two required fields the note didn't anticipate —
    // "businessName" and "address" — apply even to individual/no-company
    // orders (submitting without them returns a validation error with no
    // visible page navigation, which is what silently "did nothing" the
    // first time this was explored manually).
    await page.getByRole('textbox', { name: 'Bar, restaurant, or individual name' }).fill(TEST_BUSINESS_NAME);
    await page.getByRole('textbox', { name: 'Actual address of bar / restaurant' }).fill('1 Test Street, Tbilisi');
    await page.getByRole('textbox', { name: 'Contact person full name' }).fill('Wine PlaywrightTest');
    await page.getByRole('textbox', { name: 'Contact person phone number' }).fill('+995500000003');
    await page.getByRole('textbox', { name: /Email address/ }).fill(TEST_EMAIL);

    // Real finding, same shape as the booking forms: online payment is
    // enabled for wine orders too, so submit redirects to the real Flitt
    // gateway rather than showing an inline confirmation. The order is
    // created server-side (submitWineOrder.ts creates the WineOrder + items
    // before ever calling startCheckout) before the redirect — never enters
    // card details, per this suite's rule against financial transactions.
    await Promise.all([
      page.waitForURL(/pay\.flitt\.com/, { timeout: 15_000, waitUntil: 'commit' }),
      page.getByRole('button', { name: 'Order & Pay', exact: true }).click(),
    ]);

    // 6. Verify via admin order detail (not just the confirmation toast).
    const admin = await context.newPage();
    await ensureAdminLoggedIn(admin);
    await admin.goto('/admin/wine-orders');
    // Real finding: default "All" filter hides pending_payment orders — see
    // the afterEach comment above.
    await admin.getByRole('button', { name: /Awaiting Payment/ }).click();
    const card = admin.getByText(TEST_BUSINESS_NAME, { exact: true }).locator('xpath=../../..');
    await expect(card).toBeVisible({ timeout: 20_000 });
    // expect: wineNameSnapshot matches the name displayed at order time — the
    // page was in Georgian when "Add to cart" was clicked, so the frozen
    // snapshot should read "რქაწითელი", not a live re-resolution back to
    // "Rkatsiteli". This is the direct regression check for
    // WineOrderItem.wineNameSnapshot freezing (MaintenanceNotes.md §5).
    // Card lines render as `${wineNameSnapshot} · ${year} × ${qty} bottle(s)`
    // (WineOrdersClient.tsx) — matching the full "name · year" substring
    // (not just the bare name) avoids "Rkatsiteli" false-matching inside
    // "Rkatsiteli Amber"'s own, unrelated line.
    await expect(card).toContainText(`${WINE_NAME_KA} · ${WINE_YEAR}`);
    await expect(card).not.toContainText(`${WINE_NAME_EN} · ${WINE_YEAR}`);
    await expect(card).toContainText(`Rkatsiteli Amber · ${WINE_YEAR}`); // no nameKa set — English is correct here

    // 7. Cleanup: mark the order Cancelled (see afterEach — Wine Orders has
    // no delete action, only status transitions).
    await card.getByRole('button', { name: 'Cancelled', exact: true }).click();
    await card.getByRole('button', { name: '✓' }).click();
    await expect(admin.getByText(TEST_BUSINESS_NAME, { exact: true })).toHaveCount(0);
    await admin.close();
  });
});
