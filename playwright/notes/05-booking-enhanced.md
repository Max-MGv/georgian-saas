---
tags: [playwright, test, tier2]
---

# 05. Booking form — enhanced/company variant

**Status:** ✅ Built and passing (1/1)
**Tier:** 2 — core customer flows
**Regression guard for:** the `isEnhanced` branch logic in `BookingForm.tsx` (`MaintenanceNotes.md` §1) — split guest counts, hot dish, masterclass add-ons
**File:** `tests/tier2-core-flows/booking-enhanced.spec.ts`
**Seed:** `tests/seed.spec.ts`
**Uses:** the tenant's existing real "Test Company # 1" (2 price tiers, real access code, not flagged "Needs details") — reused read-only per the note's original instruction to minimize footprint, no company/price tier created or deleted by this test.

## What this checks

The `enable_enhanced_company_booking` + company-code path is a materially different form (per `MaintenanceNotes.md` §1: split Tasting/Lunch/Free-Guide guest counts replace the single guest field, plus Hot Dish Selection, Masterclass Add-ons, and Food Notes — none of which exist in the simple variant). This confirms the branch actually activates and that a submitted enhanced order carries its extra fields through to the admin side.

## Steps & assertions

1. Confirm `enable_enhanced_company_booking` is on (read the settings toggle's own inline style — `translateX(22px)` + brand color = on — rather than assume). Staging Winery has it on permanently; the test never touches the toggle.
2. Navigate to the booking form, select "Tour Company", pick the seeded company from the dropdown, enter its access code (read fresh from `/admin/companies` → Edit, not hardcoded) in the popup that appears, confirm.
3. **Check:** the company's saved contact profile auto-fills the First Name field — see "Real finding" below, this replaces the originally-planned "code confirmed" banner check (there isn't one).
4. **Check:** the single "Number of Guests" field is replaced by three separate fields (Tasting / Lunch / Free-Guide) — confirms the `isEnhanced` branch actually rendered, not just that *some* UI changed.
5. **Check:** a Hot Dish Selection block and a Masterclass Add-ons block are present (Staging Winery already has real `MenuItem`/`MasterclassItem` rows — no fixture seeding needed).
6. Enter a guest count (25) outside the seeded company's defined tiers (1–10, 11–20). **Check:** no blocking alert renders — see "Real finding" below, this replaces the originally-planned "no rate" alert check (that alert doesn't exist on this path).
7. Correct to an in-range guest count (5 Tasting + 3 Lunch), select one hot dish option and one masterclass add-on, fill required contact fields, submit.
8. **Check (via admin `/admin/orders` row, not just the confirmation toast):** the resulting order record shows the correct guest-count breakdown (Tasting=5, Lunch=3 in their own columns, not a single collapsed number), the selected hot dish, the selected masterclass item, and the correct total (350₾) — confirms the extra fields survived the full round trip to the DB, not just the client-side form state.
9. **Cleanup:** delete the test order via admin.

## Real findings (from building this test)

- **No free-text access code field on the main form.** Selecting "Tour Company" shows a dropdown of known companies first (`getByRole('combobox').first()` — a second combobox, the Time Slot picker, is also on screen at this point, so the plain role query is ambiguous without `.first()`). Picking a company opens a popup asking for its access code to confirm — this is the `hideCompanyDropdown={false}` variant of `BookingForm.tsx`; the note's assumption of code-entry-only applies to a different, direct-code-entry deployment of the same component.
- **No "code confirmed" banner.** The popup just closes on success. The real, observable signal is the company's saved `contactName`/`contactPhone`/`contactEmail` profile auto-filling the contact fields (`applyProfile()` in `BookingForm.tsx`) — that's what the test checks instead.
- **The "no rate for this guest count" alert (KnownBugs-adjacent `tierGap` state) does not exist on the enhanced path at all.** Reading `lib/pricingUtils.ts`'s `findTier()` confirms: for any guest count outside every defined tier's range, it deliberately falls back to the tier with the *highest* `pricePerPerson`, by design ("protects against under-charging very small groups," per its own doc comment) — it never returns "no match." The blocking alert only exists on the *simple* company-booking path (`matchedTier`/`tierGap` in `BookingForm.tsx` are computed `!isEnhanced` only). Verified live: entering 25 guests against tiers capped at 20 still produces a normal price estimate using tier 1's rate, no error state.
- **Company bookings (both variants) never redirect to Flitt.** Only individual bookings take online payment; company bookings show the inline "Booking received!" confirmation (companies get invoiced later, not charged online) — confirmed by reading `createBooking.ts`'s checkout-gate logic and live.
- **Company row → Edit button targeting was the hardest part of this test to get reliable.** An xpath ancestor-then-descendant approach (`companyButton.locator('xpath=../..')` then find "Edit" inside) worked when manually stepped through in a playwright-cli debug session but intermittently clicked something inert in real headless runs — confirmed via a captured failure snapshot showing the click landed but no modal opened. Switched to an index-based approach instead: every company row's name button includes "Code set" in its accessible name, giving a stable parallel list — the Nth such button lines up with the Nth "Edit" button in render order, regardless of DOM nesting. Even with that fix, the click still intermittently didn't open the modal (~50% of runs, reproduced across multiple locator strategies) — this looks like a **real timing race in the app itself** (the companies list is client-fetched; a click landing during a re-render window can hit a button whose `onClick` closure is already stale), not a test-selector problem. Mitigated with a short bounded retry (click, check for the modal heading, retry up to 3x) — the standard pattern for this flake class. Worth a closer look if anyone revisits `/admin/companies`.
- **The access code field (`type="password"`) is unreliable via `getByRole('textbox', { name: ... })` in a real headless run**, even though the identical locator resolves fine when manually stepped through via `playwright-cli`'s debug session (a different, non-headless-launch browser management path — confirmed this environment cannot launch a headed Chrome directly at all, so the two code paths are provably different browser processes). Switched to `page.locator('input[placeholder="No code set"]')`, which sidesteps ARIA role computation for a password input entirely.
- **Session-level infra finding (not this test's fault), same as booking-simple.spec.ts:** sustained heavy Playwright usage degraded the local dev DB connection pool over the course of this session (Prisma `P2028` transaction timeouts, then a `.next` cache corruption after a forceful process kill causing `/admin/login` to 404). Resolved with a dev-server restart + `.next` cache clear. If `/admin/*` pages seem to intermittently 500 or hang during a heavy suite run, this is the known shape — restart the dev server.
