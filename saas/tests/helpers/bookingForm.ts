import { Page, expect } from '@playwright/test';
import { clickUntil } from './payments';

/**
 * The public booking form's submit-button labels, per tenant payment state.
 * `paymentLabelActive` in BookingForm.tsx picks between them — see
 * payment-label-precedence.spec.ts for the precedence rules themselves.
 */
export type BookingSubmitLabel = 'Book & Pay' | 'Request Booking';

/**
 * Clicks the booking form's submit button and waits for the Feature 184
 * (2026-09-14) "Review your visit" sheet to open.
 *
 * **Why this exists as shared infrastructure.** Feature 184 inserted this
 * sheet between the submit button and the actual `createBooking()` call, for
 * BOTH individual and company bookings. Every spec that drives the form to
 * submission has to account for it, and two of them silently did not until
 * 2026-09-19: `booking-simple.spec.ts` waited for a Flitt redirect that no
 * longer fired on the first click, and `booking-enhanced.spec.ts` waited for
 * a "Booking received!" heading that no longer appeared. Both failed on a
 * timeout, which reads like a hang rather than a stale assertion. One shared
 * helper means the next change to that sheet breaks in one place, loudly.
 *
 * Deliberately does NOT click the sheet's own "Confirm & …" button — that
 * click is the one that actually submits (and, for an individual booking with
 * payment on, redirects), so each caller performs it exactly once, wrapped in
 * whatever assertion that scenario needs. Clicking it here as well is a real
 * bug that has already been made once: by the time a second click ran, the
 * button was gone and Playwright's wait for a stale locator ate the whole
 * test timeout instead of failing fast.
 *
 * `clickUntil` rather than a plain `.click()`: this exact submit button has
 * been observed to swallow a click on a live run while an identical manual
 * click-through opened the sheet immediately. See KNOWN-ISSUES.md — note that
 * the /admin/companies hydration bug which originally motivated that helper
 * was fixed on 2026-09-12, so a retry firing repeatedly here is now worth
 * investigating rather than assuming.
 */
export async function openReviewSheet(page: Page, submitLabel: BookingSubmitLabel): Promise<void> {
  await clickUntil(
    page.getByRole('button', { name: submitLabel, exact: true }),
    () => expect(page.getByRole('heading', { name: 'Review your visit' })).toBeVisible({ timeout: 3_000 })
  );
}

/** The sheet's confirm button, whose label mirrors the submit button's. */
export function confirmButton(page: Page) {
  return page.getByRole('button', { name: /^Confirm & /, exact: false });
}

/**
 * A row on `/admin/abandoned` (the incomplete-orders screen), found by any
 * text unique to it — usually the test's own email marker.
 *
 * **Why the `has:` filter matters.** Rows there are divs, not table rows, so
 * `locator('div').filter({ hasText: marker }).last()` resolves to the
 * *innermost* div containing the marker — typically the one wrapping the email
 * text itself, which contains no buttons. Asserting that element is visible
 * passes; asking for a button inside it hangs until the test times out.
 * Filtering to divs that actually contain the restore button first, and only
 * then taking `.last()`, gets the real row.
 *
 * That is not hypothetical: `booking-simple.spec.ts` carried the naive version
 * from Feature 191's (2026-09-18) move of abandoned orders onto their own
 * screen and failed here on a 120s timeout, while `payment-amount-integrity.spec.ts`
 * had the `has:`-filtered version and passed. Shared so the two cannot drift
 * apart again.
 */
export function abandonedRow(page: Page, marker: string) {
  return page
    .locator('div')
    .filter({ hasText: marker })
    .filter({ has: page.getByRole('button', { name: 'Restore without payment' }) })
    .last();
}
