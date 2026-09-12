---
tags: [playwright, test, tier1]
---

# 12. Payment button-label precedence (#148)

**Status:** ✅ Passing (2/2)
**Tier:** 1 — regression suite (added post-launch, outside the original 5-phase plan)
**Regression guard for:** `BookingForm.tsx`'s `paymentLabelActive` precedence (#148) — the exact class of bug found 2026-08-12 in `booking-enhanced.spec.ts` (see [[05-booking-enhanced]]), where a test hardcoded one payment-label state and never noticed when a settings change flipped it.
**File:** `tests/tier1-regression/payment-label-precedence.spec.ts`
**Helpers:** `tests/helpers/payments.ts` (new) — `setPaymentSectionToggle`/`readPaymentSectionToggle` (`/admin/settings`), `setCompanyPaymentOverride`/`readCompanyPaymentOverride`/`readCompanyAccessCode` (`/admin/companies`)
**Seed:** `tests/seed.spec.ts` + `loginAsTenantAdmin()`. Uses the same read-only fixture as `booking-enhanced.spec.ts` — "Test Company # 1" (real access code, no override at baseline).

## Why this exists

Max asked, after the `booking-enhanced.spec.ts` fix: since the booking form has several possible states (individual could show "Book & Pay", companies could show "Request Booking", or the reverse), how do the tests account for that? They didn't — `booking-simple.spec.ts` and `booking-enhanced.spec.ts` each hardcoded exactly one label, matching whatever Staging Winery's settings happened to be when each was written. Feature #148's own build notes only verified the full precedence with a one-off spot-check script (8 cases), never added to the permanent suite. This closes that gap.

## The real precedence (`BookingForm.tsx`)

```
paymentLabelActive =
  !modulesOnlinePayment configured           → false
  bookingType === INDIVIDUAL                 → paymentEnabledIndividuals
  company.skipPayment === true               → false   (override: always skip)
  company.skipPayment === false              → true    (override: always require)
  otherwise                                  → paymentEnabledCompanies (section default)
```

## What this checks

Two tests, six real states total:

1. **Individual booking** — toggles `paymentEnabledIndividuals` off/on via `/admin/settings`, confirms the public form shows "Request Booking" / "Book & Pay" respectively.
2. **Company booking** — for the section-default path (company override = "Default"), confirms the label follows `paymentEnabledCompanies` on/off. Then confirms a per-company override **always wins over the section default, in both directions**: "Always skip" forces "Request Booking" even with the section on; "Always require" forces "Book & Pay" even with the section off.

Both tests read the tenant's real starting state first and restore it in a `finally` block — never assumes a baseline, since assuming one is exactly what broke `booking-enhanced.spec.ts`.

## Real finding while building this test

**A genuine bug in the test helper itself, not the app or a real click failure.** The first version of `findSelectedOverride()` (detecting which of the three override buttons — Default/Always skip/Always require — is selected) compared `getAttribute('style')` against the literal hex `#e0d4c0` (`CompaniesClient.tsx`'s fixed unselected border color). This never matched anything: the browser's CSSOM normalizes an authored hex color to `rgb(...)` when reflecting the `style` attribute back, so the literal string never appears for *either* state. The check silently fell through to always returning the first label checked ("Default"), regardless of what was actually selected or clicked.

This looked exactly like the page's own known lost-click bug (`clickUntil` retried for the full 20s timeout, identically, twice in a row) — but it was fully deterministic, not a real click/render race: the "Default" case only ever "passed" because it happened to already be the true state, so the broken check was never actually exercised until a genuinely different override was requested.

**Fix:** compare each of the three buttons' *computed* `backgroundColor` (via `getComputedStyle`, in-page `evaluate`) instead of string-matching a literal — exactly one should differ from the other two (the selected option uses the theme's brand-color variable; the unselected two share the same background), so the odd one out is the answer regardless of which color-string format the browser serializes to. Reconfirmed passing standalone and in the full 24-test suite.

**Lesson for any future test reading inline-style state from this codebase's admin UI:** don't string-match a literal hex against `getAttribute('style')` — compare computed values instead, or rely on `translateX()` on/off toggles (still literal-safe, since those are px offsets, not colors).
