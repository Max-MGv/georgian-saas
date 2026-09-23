import { Page, Locator } from '@playwright/test';

/**
 * Drives Flitt's real hosted checkout page (pay.flitt.com) — the one piece
 * every tier5-payment-e2e scenario needs and shouldn't reimplement. Every
 * selector and behaviour here was verified live on 2026-09-24 against
 * Staging Winery's permanent test-merchant config (1549901/test — see
 * vault/Plan-PaymentE2ETesting.md's Ground Rule 1), not written from
 * guesswork against the docs alone.
 */

// docs.flitt.com/api/testing's four predictable test cards, confirmed live
// against this exact merchant on 2026-09-24 (both the plain settle and the
// 3DS-challenge paths — see payAtFlittCheckout's own comment for what the
// "3DS" cards actually do here). Any expiry/CVV is accepted by the sandbox;
// payAtFlittCheckout defaults both if the caller doesn't care.
export const FLITT_TEST_CARDS = {
  approveNo3DS: '4444555511116666',
  declineNo3DS: '4444111155556666',
  approve3DS: '4444555566661111',
  decline3DS: '4444111166665555',
} as const;

const DEFAULT_EXPIRY = '09/26';
const DEFAULT_CVV = '111';
// docs.flitt.com's own testing page mentions this OTP "for at least one
// scenario". Live-verified 2026-09-24 against BOTH 3DS cards on this
// merchant: neither ever showed an OTP field — see the challenge-handling
// comment below. Kept as a fallback for whichever scenario the docs mean.
const THREE_DS_OTP = '111111';

/**
 * Real finding (2026-09-24): the hosted page's visible "card mock-up"
 * graphic (the dark card image showing "4444 5555 6666 1111", "09/26",
 * "***") is pure decoration — a static preview that never reflects what's
 * actually typed. The REAL inputs are plain `<input>` elements elsewhere in
 * the DOM (`name="f-card_number"` / `f-expiry_date` / `f-cvv2`), only
 * discoverable via the accessibility tree or a DOM query, not by looking at
 * the rendered card. Confirmed live: after typing, `document.querySelectorAll('input')`
 * showed the typed value on the real input while the decorative graphic's
 * text never changed.
 *
 * Also confirmed live: these fields can already hold a sandbox-supplied
 * default (expiry/CVV come pre-filled with "09/26"/"111"), and typing into a
 * pre-filled masked input without clearing first produces concatenation
 * garbage (e.g. an extra digit run mixed into the old value) rather than
 * replacing it. `.fill('')` before `.pressSequentially()` — real per-
 * character keystrokes, needed because this field is a JS-formatted mask
 * that builds its grouped display ("4444 5555 1111 6666") from individual
 * keydown events, not from a single programmatic value assignment.
 */
async function clearAndType(locator: Locator, value: string): Promise<void> {
  await locator.click();
  await locator.fill('');
  await locator.pressSequentially(value, { delay: 20 });
}

export interface FlittTestCard {
  cardNumber: string;
  expiry?: string;
  cvv?: string;
}

export interface FlittCheckoutResult {
  /** page.url() once Flitt has redirected back to our own domain. */
  finalUrl: string;
  /** Whether a 3DS/OTP-style challenge actually appeared for this card. */
  challengeAppeared: boolean;
}

/**
 * Fills in Flitt's real hosted checkout with a test card, submits, clears
 * any 3DS/OTP challenge, and waits for the redirect back to our own site.
 *
 * Caller is responsible for already being on pay.flitt.com (the existing
 * pattern throughout this suite is `Promise.all([page.waitForURL(/pay\.flitt\.com/),
 * confirmBtn.click()])` — see payment-amount-integrity.spec.ts) — this
 * function does not itself trigger the redirect there.
 */
export async function payAtFlittCheckout(page: Page, card: FlittTestCard): Promise<FlittCheckoutResult> {
  const cardNumberInput = page.locator('input[name="f-card_number"]');
  const expiryInput = page.locator('input[name="f-expiry_date"]');
  const cvvInput = page.locator('input[name="f-cvv2"]');

  // "Card" is the default-selected payment method on this checkout (verified
  // live — the card fields are already in the DOM without clicking anything
  // first), but fall back to clicking the "Card" tile if a future layout
  // change ever makes that not true.
  const cardFieldsReady = await cardNumberInput
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!cardFieldsReady) {
    await page.getByText('Card', { exact: true }).first().click();
    await cardNumberInput.waitFor({ state: 'visible', timeout: 10_000 });
  }

  await clearAndType(cardNumberInput, card.cardNumber);
  await clearAndType(expiryInput, card.expiry ?? DEFAULT_EXPIRY);
  await clearAndType(cvvInput, card.cvv ?? DEFAULT_CVV);

  // The real submit button: the only <button> on this page whose text
  // includes the currency code ("Pay 480.00 GEL") — every other button here
  // (the Card/Pay-by-bank/Installments method tiles, Apple Pay, "Buy with G
  // Pay") shows no amount. There is no accept-terms checkbox to tick — the
  // "I accept the terms" line is plain text with a link, confirmed live via
  // a DOM query for input[type=checkbox] / [role=checkbox] (zero matches).
  const payButton = page.locator('button').filter({ hasText: 'GEL' }).last();
  await payButton.click();

  // A 3DS/OTP challenge, if this card triggers one, renders inside a
  // same-origin iframe Flitt injects client-side after the Pay click
  // (`src="about:blank"`, class `flitt-modal-iframe`, a random numeric `id`
  // — never present in the DOM before the click, and never part of the top
  // frame's own content, so a plain page-level locator never sees it).
  //
  // Live-verified 2026-09-24 against BOTH 3DS test cards on this merchant
  // (approve and decline): the challenge is a "Bank Server Emulation" page
  // reading "Confirm 3D-Secure operation", with a single submit button
  // (id="submit__button", text "Continue") — no OTP input ever appeared for
  // either card, contradicting docs.flitt.com's mention of a 111111 OTP "for
  // at least one scenario". The challenge page also auto-submits itself
  // after 10s even if nothing clicks it (a `setTimeout` in its own inline
  // script) — so worst case, not handling it at all still resolves, just
  // slower. Handled defensively here: look for an OTP-shaped input first
  // (in case some other card/scenario does show one), otherwise click
  // Continue.
  const challengeFrameEl = page.locator('iframe.flitt-modal-iframe');
  const challengeAppeared = await challengeFrameEl
    .waitFor({ state: 'attached', timeout: 8_000 })
    .then(() => true)
    .catch(() => false);

  if (challengeAppeared) {
    const challengeFrame = page.frameLocator('iframe.flitt-modal-iframe');
    const otpInput = challengeFrame.locator(
      'input[type="text"], input[type="tel"], input[name*="otp" i], input[name*="code" i]'
    );
    const hasOtp = await otpInput
      .first()
      .isVisible({ timeout: 2_000 })
      .catch(() => false);
    if (hasOtp) {
      await otpInput.first().fill(THREE_DS_OTP);
    }
    const continueButton = challengeFrame.locator('#submit__button').or(challengeFrame.getByRole('button', { name: /continue/i }));
    await continueButton.first().click({ timeout: 8_000 }).catch(() => {
      // The 10s auto-submit (documented above) covers this if the click
      // itself can't land for some reason — don't fail the whole helper
      // over a challenge UI that resolves itself regardless.
    });
  }

  // Whether or not a challenge fired, Flitt redirects back to our own site
  // once settlement finishes — approved or declined both redirect, only the
  // destination's own content differs.
  await page.waitForURL((url) => url.host !== 'pay.flitt.com', { timeout: 25_000 });
  return { finalUrl: page.url(), challengeAppeared };
}
