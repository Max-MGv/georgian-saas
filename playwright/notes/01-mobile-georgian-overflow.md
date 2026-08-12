---
tags: [playwright, test, tier1]
---

# 01. Mobile + Georgian overflow

**Status:** ✅ Built and passing (4/4) — `saas/tests/tier1-regression/mobile-georgian-overflow.spec.ts`
**Tier:** 1 — regression suite
**Regression guard for:** `KnownBugs.md` #3 (guest count / step-nav overflow), #8 (flex children don't shrink), #9 (Orders header overflow), and the original #131 Companies-step overflow
**File:** `tests/tier1-regression/mobile-georgian-overflow.spec.ts`
**Seed:** `tests/seed.spec.ts`

## What this checks

Georgian text runs longer than English for the same UI strings. Every overflow bug found so far has the same shape: a flex/row layout that fits in English silently breaks in Georgian at mobile width, because flex children don't shrink below their content's natural width by default. This test parametrizes that one check across every page known to hold locale-length-sensitive layout, instead of writing one bespoke test per page.

## Pages covered (parametrized)

- `/` (public home)
- `/wines` (wine catalogue)
- `/admin/orders` (logged in)
- `/admin/companies` (logged in)
- Onboarding wizard steps 1–7 (`/admin/onboarding`, logged in, on a test tenant)

## Steps & assertions

For each page in the list:

1. Set viewport to 375×812 (`playwright-cli resize 375 812` during exploration; `test.use({ viewport: { width: 375, height: 812 } })` in the spec).
2. Switch language to Georgian — site language toggle for public pages, admin-language setting for admin pages (exact control TBD from explore pass).
3. Navigate to the page.
4. **Check:** `document.documentElement.scrollWidth === document.documentElement.clientWidth`. If `scrollWidth` is greater, something overflowed horizontally — this is the generic form of every overflow bug found so far, verified via `getBoundingClientRect()`/`scrollWidth` script in the original bug write-ups (#9: "confirmed via script, not just eyeballed").
5. **Check:** the page's primary action control (`/admin/orders` → "+ New Order" button; `/admin/companies` → "Add company" button; onboarding steps → the step's primary CTA) has `getBoundingClientRect().right <= 375`. This catches the specific "button pushed off-screen" failure mode, which a generic scrollWidth check can flag but doesn't localize — this assertion points directly at the element that broke in #3/#9.

## Notes / open questions

- ~~Need to confirm the exact site-language toggle control and admin-language setting control~~ — confirmed live, see `saas/tests/helpers/locale.ts`. Public site: desktop nav shows `en`/`ka` buttons directly; below the collapse breakpoint they're hidden inside a "Menu" button first. Admin: two `en`/`ka` button pairs on `/admin/settings`, the *first* one (DOM order) is Admin Panel Language, the second is Default Site Language.
- Currently covers home, wines, admin orders, admin companies. Onboarding wizard steps (7 sub-pages) deliberately deferred to when Phase 3's dedicated test tenant exists (see `10-onboarding-wizard.md`) — checking them against Staging Winery would be meaningless since it's not mid-wizard.
- **Real finding, fixed:** the admin-language toggle is a fire-and-forget-looking POST (`/admin/settings`) behind an optimistic UI update — a naive cleanup click doesn't wait for it, and can leave the tenant's *real* language setting stuck if the browser context tears down first. `setAdminPanelLanguage()` now waits for the actual response.
