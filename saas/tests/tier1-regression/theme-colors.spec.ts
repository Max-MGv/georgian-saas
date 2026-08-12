// spec: playwright/notes/03-theme-colors.md
import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { setTenantTheme, loginAsSuperAdmin } from '../helpers/theme';

const ORIGINAL_PRESET = 'Cream & wine';
const DARK_PRESET = 'Midnight cellar';

// IMPORTANT CONTEXT — read before touching this file:
//
// The original plan was to switch the live tenant theme, then load the
// public booking form and compare a real rendered status color (light vs.
// dark). That does NOT work in an automated run: `saas/proxy.ts` caches the
// entire resolved tenant record (including theme) for 5 minutes per domain,
// and a super-admin save does not invalidate it. The super-admin edit page
// itself reads fresh (direct Prisma query), so this test verifies
// *persistence* through that fresh-reading page instead of fighting the
// public site's stale cache. Manually confirmed once, with enough real wall
// time between switches for the cache to expire, that the public page's
// rendered STATUS.errorText color genuinely does differ between presets —
// that live behavioral proof isn't something this suite can assert on every
// run without a real 5-minute wait. Full story: vault/MigrationNotes.md
// "In-memory cache", playwright/notes/03-theme-colors.md.
//
// So this test checks two independent, reliable things instead:
// 1. Switching + saving a preset actually persists (via the super-admin
//    page's own fresh reload, which bypasses the stale public-site cache).
// 2. The component source still uses the theme-reactive color-mix()
//    mechanism (not a reverted hardcoded hex) for the status colors
//    KnownBugs #14 fixed.

test.describe('Theme-aware status colors — live persistence', () => {
  // Scoped to this describe block only — the static color-mix() check below
  // doesn't touch `page` at all, and this hook redirecting it through an
  // unauthenticated super-admin login was timing that test out.
  test.afterEach(async ({ page }) => {
    await setTenantTheme(page, ORIGINAL_PRESET);
  });

  test('switching tenant theme preset persists (verified via fresh super-admin reload)', async ({ page }) => {
    test.setTimeout(60_000);
    await loginAsSuperAdmin(page);

    await setTenantTheme(page, ORIGINAL_PRESET);
    const lightSwatch = await page.getByText(/^text #/).textContent();

    await setTenantTheme(page, DARK_PRESET);
    const darkSwatch = await page.getByText(/^text #/).textContent();

    await setTenantTheme(page, ORIGINAL_PRESET);
    const revertedSwatch = await page.getByText(/^text #/).textContent();

    // expect: the displayed "text #RRGGBB" swatch value actually changes
    // between presets, and reverting brings back the original value —
    // proves the save genuinely persists to the DB (this reads fresh on
    // every reload, unaffected by the public-site cache described above).
    expect(darkSwatch).not.toBe(lightSwatch);
    expect(revertedSwatch).toBe(lightSwatch);
  });
});

// Separate describe block, deliberately — this test never touches `page`,
// so it must NOT share the block above's afterEach (which navigates through
// a super-admin login; running it here unconditionally timed this test out
// since it never itself logged in).
test.describe('Theme-aware status colors — source mechanism', () => {
  test('status colors still use the theme-reactive color-mix() mechanism, not a hardcoded hex', async () => {
    // Static check, not live-rendering — see the file-level comment above
    // for why. Direct regression check for KnownBugs #14 ("hardcoded green/
    // red status colors don't respect the tenant's theme").
    const bookingFormSrc = fs.readFileSync(
      path.resolve(__dirname, '../../components/BookingForm.tsx'),
      'utf-8'
    );
    const wineCatalogueSrc = fs.readFileSync(
      path.resolve(__dirname, '../../app/(site)/wines/WineCatalogueClient.tsx'),
      'utf-8'
    );

    for (const [name, src] of [
      ['BookingForm.tsx', bookingFormSrc],
      ['WineCatalogueClient.tsx', wineCatalogueSrc],
    ] as const) {
      // expect: success/error status colors are still derived via
      // color-mix() blended with the theme's own surface/border/text
      // variables, not literal hex values assigned directly.
      expect(src, `${name} should define its status colors via color-mix()`).toMatch(
        /color-mix\(in srgb, #(16a34a|dc2626) \d+%, var\(--site-(surface|border|text)\)\)/
      );
    }
  });
});
