---
tags: [playwright, test, tier2]
---

# 06. Wine catalogue → order

**Status:** ✅ Built and passing (1/1)
**Tier:** 2 — core customer flows
**Regression guard for:** `wineDisplayName()` resolution (`MaintenanceNotes.md` §5) and `WineOrderItem.wineNameSnapshot` freezing
**File:** `tests/tier2-core-flows/wine-catalogue-order.spec.ts`
**Seed:** `tests/seed.spec.ts`

## What this checks

The wine browsing → cart → checkout flow, plus the one documented cross-cutting risk in this area: any new surface that reads `wine.name` directly instead of going through `wineDisplayName()` silently ignores admin-entered Georgian names (`MaintenanceNotes.md` §5 explicitly calls this out as a risk for "a new page, an email template, a CSV export").

## Steps & assertions

1. Confirmed via direct DB read that "Rkatsiteli" already has `nameKa` = "რქაწითელი" set on Staging Winery — real tenant data, no fixture needed. This resolves the note's original open question.
2. With site language set to `ka`, navigate to `/wines`. **Check:** the wine with `nameKa` set displays "რქაწითელი" on its card, and its card is not also matched under the English name "Rkatsiteli" (which would also match "Rkatsiteli Amber" via a naive substring check — see "Real finding" below) — direct regression check for `MaintenanceNotes.md` §5.
3. Add 2 wines to cart (Rkatsiteli 2026 + Rkatsiteli Amber 2026). **Check:** each card's own quantity stepper reads 1, and the sticky bottom bar's bottle count is 2 (matched by leading digit only — see "Real finding" on locale).
4. Open the checkout drawer. **Check:** line-item prices shown match the prices displayed on the catalogue cards for the same wines.
5. Fill required checkout/contact fields (including two fields the original note didn't anticipate — see "Real finding" below), submit.
6. **Check (via admin `/admin/wine-orders`, not just confirmation toast):** the new order shows a `wineNameSnapshot` reading "რქაწითელი" (the Georgian name that was actually displayed when it was added to cart), not a live re-resolution back to "Rkatsiteli" — direct regression check for `WineOrderItem.wineNameSnapshot` freezing. The unrelated "Rkatsiteli Amber" line (no `nameKa` set) correctly still reads in English.
7. **Cleanup:** mark the order Cancelled via admin — see "Real finding" below, Wine Orders has no delete action.

## Real findings (from building this test)

- **Real wine data already covers the Georgian-name regression check** — "Rkatsiteli" has `nameKa` = "რქაწითელი" set (confirmed via direct DB read), no fixture wine needed.
- **Checkout is an inline drawer on the same `/wines` page**, not a separate route — resolves the note's open question. It's a right-side panel (`position: fixed`, `showDrawer` state), not a full navigation.
- **Two required fields the note didn't anticipate:** `businessName` ("Bar, restaurant, or individual name") and `address` ("Actual address of bar / restaurant") are required even for an individual/no-company order (`submitWineOrder.ts`'s `if (!businessName || !address || ...)` guard). Submitting without them just returns a validation error with **no visible page navigation and no client-side error rendered in an easy-to-spot way** — first manual attempt at this looked like the submit silently did nothing.
- **Same shape as the booking forms: submit redirects to the real Flitt gateway** (online payment is enabled for wine orders too) rather than showing an inline confirmation. The order is created server-side before `startCheckout` is ever called (confirmed by reading `submitWineOrder.ts`), so verification never needs to touch the payment form.
- **The default "All" filter on `/admin/wine-orders` hides `pending_payment` ("Awaiting Payment") orders entirely** — a freshly-submitted order is invisible until the "Awaiting Payment" quick filter is clicked. Both the verification step and cleanup need this filter to find the order at all.
- **Wine Orders admin has no delete action**, unlike regular Orders' "Delete order" button — only status transitions ("Mark as paid" / "Cancelled"). Cleanup uses "Cancelled" instead, matching the fallback pattern already anticipated in `04-booking-simple.md`'s cleanup step.
- **The Cancelled confirmation (✓/✗) auto-dismisses after 5 seconds** (`WineOrdersClient.tsx`'s `requestChange()` sets a `setTimeout(() => setPendingChange(null), 5000)`). The test clicks "Cancelled" then immediately "✓" with no intervening awaits, well inside that window — a manual/interactive exploration pass that paused between the two clicks (any real delay, e.g. a `playwright-cli` round trip) missed the window every time and had to fall back to a direct DB delete just to clean up exploration data.
- **Locale interaction, worth remembering for any future test on this page:** `WineCatalogueClient.tsx`'s checkout-drawer strings (field placeholders, "Checkout →", "Order & Pay") are **hardcoded English literals**, not run through `t(locale, ...)` — confirmed by reading the source. They render in English even with the site set to `ka`; only the surrounding catalogue UI (bottle-count text, filters, wine metadata) is actually translated. The bottle-count assertion matches on the leading digit only (`/^2\s/`) rather than the literal phrase, since that text *is* translated.
- **Card-scoping gotcha:** a plain `.filter({ hasText: 'Rkatsiteli' })` on a wine card also matches "Rkatsiteli Amber"'s card (substring match) and, in admin, a plain `.toContainText('Rkatsiteli')` check on an order card also matches its unrelated "Rkatsiteli Amber" line. Both need exact-text matching (an exact-regex `<p>` filter for cards; the full `"name · year"` substring for admin order lines, since that's how `WineOrdersClient.tsx` renders each line) to disambiguate.
- **Session-level infra finding (not this test's fault), same as the other two Phase 2 tests:** sustained heavy Playwright usage this session degraded the local dev DB connection pool (Prisma `P2028` errors) and once corrupted the `.next` dev cache after a forceful process kill. Resolved with a dev-server restart + cache clear.
- **Real accumulation risk, found during final verification (2026-08-10):** because Wine Orders admin has no delete action (only status transitions — see above), every run of this test that reaches cleanup leaves a permanent `Cancelled` row in Staging Winery's real `WineOrder` table rather than actually removing it. After many runs across this session, 14 "Playwright Wine Test ..." rows had accumulated (one even stuck in `pending_payment` from an interrupted run) — genuine clutter on the live admin panel, cleaned up via direct SQL (`DELETE ... WHERE "businessName" LIKE 'Playwright Wine Test %'`) once noticed. **This will recur every time this test runs** — there's no way around it without either the app gaining a real delete action on Wine Orders, or this test switching to a DB-level delete in its own cleanup step instead of "Cancelled" (would need direct DB access from the test, a bigger change than seemed worth it when this was first built). Worth periodic manual cleanup, or worth revisiting the cleanup approach if this suite runs much more frequently going forward.
