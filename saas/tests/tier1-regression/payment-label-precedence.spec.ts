// spec: guards BookingForm.tsx's paymentLabelActive precedence (#148).
// Direct regression test for the class of bug found 2026-08-12 in
// notes/05-booking-enhanced.md: a test (and, by the same logic, the app
// itself) can silently assume one payment-label state and never notice when
// a settings change flips it. This exercises every meaningful state instead
// of assuming one.
import { test, expect, Page } from '@playwright/test';
import { loginAsTenantAdmin } from '../helpers/auth';
import {
  readPaymentSectionToggle, setPaymentSectionToggle,
  readCompanyPaymentOverride, setCompanyPaymentOverride,
  readCompanyAccessCode, PaymentOverride,
} from '../helpers/payments';

// Shared read-only fixture, reused by booking-enhanced.spec.ts too — real
// access code, not flagged "Needs details".
const COMPANY_NAME = 'Test Company # 1';

async function expectSubmitLabel(page: Page, expected: 'Request Booking' | 'Book & Pay') {
  await expect(page.getByRole('button', { name: expected, exact: true })).toBeVisible({ timeout: 15_000 });
}

test.describe('Payment button-label precedence (#148)', () => {
  test('individual booking label follows paymentEnabledIndividuals', async ({ page }) => {
    test.setTimeout(90_000);
    await loginAsTenantAdmin(page);
    const original = await readPaymentSectionToggle(page, 'Individual bookings');

    try {
      await setPaymentSectionToggle(page, 'Individual bookings', false);
      await page.goto('/');
      await expectSubmitLabel(page, 'Request Booking');

      await setPaymentSectionToggle(page, 'Individual bookings', true);
      await page.goto('/');
      await expectSubmitLabel(page, 'Book & Pay');
    } finally {
      await setPaymentSectionToggle(page, 'Individual bookings', original);
    }
  });

  test('company booking label follows the section default, and a per-company override always wins', async ({ page }) => {
    test.setTimeout(180_000);
    await loginAsTenantAdmin(page);

    const originalSection = await readPaymentSectionToggle(page, 'Company bookings');
    const originalOverride = await readCompanyPaymentOverride(page, COMPANY_NAME);
    const accessCode = await readCompanyAccessCode(page, COMPANY_NAME);
    expect(accessCode, `${COMPANY_NAME} must have a real access code set for this test to run`).not.toBe('');

    async function checkCompanyLabel(expected: 'Request Booking' | 'Book & Pay') {
      await page.goto('/');
      await page.getByRole('button', { name: 'Tour Company' }).click();
      await page.getByRole('combobox').first().selectOption({ label: COMPANY_NAME });
      await page.getByRole('heading', { name: 'Enter your company code' }).waitFor();
      await page.getByRole('textbox', { name: 'e.g. MARANI42' }).fill(accessCode);
      await page.getByRole('button', { name: 'Confirm', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Enter your company code' })).not.toBeVisible();
      await expectSubmitLabel(page, expected);
    }

    try {
      // No override (Default) — the company follows the section toggle.
      await setCompanyPaymentOverride(page, COMPANY_NAME, 'Default');
      await setPaymentSectionToggle(page, 'Company bookings', true);
      await checkCompanyLabel('Book & Pay');

      await setPaymentSectionToggle(page, 'Company bookings', false);
      await checkCompanyLabel('Request Booking');

      // A per-company override beats the section default, in both directions
      // — this is the exact precedence #148 introduced and the shape that
      // silently broke booking-enhanced.spec.ts's assumption.
      await setPaymentSectionToggle(page, 'Company bookings', true);
      await setCompanyPaymentOverride(page, COMPANY_NAME, 'Always skip');
      await checkCompanyLabel('Request Booking');

      await setPaymentSectionToggle(page, 'Company bookings', false);
      await setCompanyPaymentOverride(page, COMPANY_NAME, 'Always require');
      await checkCompanyLabel('Book & Pay');
    } finally {
      await setCompanyPaymentOverride(page, COMPANY_NAME, originalOverride as PaymentOverride);
      await setPaymentSectionToggle(page, 'Company bookings', originalSection);
    }
  });
});
