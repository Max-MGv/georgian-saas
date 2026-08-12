---
tags: [playwright, test, tier3]
---

# 10. Onboarding wizard walkthrough

**Status:** ✅ Passing — 1/1, reconfirmed clean twice individually and in the full 17-test suite (see `Progress.md`). Requires a tenant reset before each run — see "Tenant state" below.
**Tier:** 3 — admin panel smoke
**Regression guard for:** `KnownBugs.md` #10 (Contact step wrote to the wrong DB table), the Individuals-pricing gating behavior (`SessionLog.md` 2026-08-04 part 4 "Fifth follow-up"), and the Review step's Payment-required condition (`SessionLog.md` part 11)
**File:** `tests/tier3-admin-smoke/onboarding-wizard.spec.ts`
**Seed:** `tests/seed.spec.ts` + `loginAsSuperAdmin()` from `07-admin-login.md`'s shared infra, pointed at the dedicated "Test Onboarding Wizard" tenant (id `cmsioproi000avl9czd60ua5h`) via its own domain — **never Staging Winery**, and never by touching `DEFAULT_TENANT_ID`. See "How this reaches a second tenant" below.

## How this reaches a second tenant without touching DEFAULT_TENANT_ID

On localhost every other request resolves to whichever tenant `saas/.env`'s `DEFAULT_TENANT_ID` points to (`saas/proxy.ts`'s `isLocal` branch). Swapping that env var would need a full dev-server restart and would silently break every other test running against Staging Winery for as long as it stayed swapped — exactly the failure mode a previous session already hit once on this project (an un-reverted `DEFAULT_TENANT_ID` swap went unnoticed for hours). This test was built to avoid that path entirely, and the task's own instructions asked to investigate a clean alternative before touching it.

**Investigated first: does the super-admin panel have a "view as tenant" mechanism?** No. A `super_admin` user bypasses `proxy.ts`'s tenant-lock redirect on `/admin/*` routes (the `isSuperAdmin` check there), but the tenant whose *data* renders is still resolved purely from the request's Host header (`resolveTenant(host)`), completely independent of who's logged in. `credentials.txt`'s "full cross-tenant access" note refers to `/super-admin/tenants/[id]` letting a super-admin view/edit any tenant's row from the platform panel — not to browsing a different tenant's real `/admin/*` dashboard from localhost.

**What this test uses instead — a real mechanism the app already has.** `proxy.ts`'s `resolveTenant()` has a second branch: any Host that isn't `localhost`/`127.0.0.1` gets looked up by its `domain` column directly. The "Test Onboarding Wizard" tenant already has `domain = "test-onboarding-wizard.invalid"` set (from whenever it was created). Confirmed live before building anything: `curl -H "Host: test-onboarding-wizard.invalid:3000" http://127.0.0.1:3000/` returned `x-resolved-tenant: test-onboarding-wizard` with no rejection — the dev server's own domain routing just works for this, no code change needed there.

The spec file's `test.use({ baseURL, launchOptions })` block points *only this one file's* browser context at that hostname and adds a Chromium `--host-resolver-rules=MAP test-onboarding-wizard.invalid 127.0.0.1` flag — a standard flag for exactly this kind of local multi-domain testing. No OS hosts-file edit (which would be a system-settings change, off-limits), no env var, no dev-server restart for *this* part, and it's fully scoped to this one spec file — every other test keeps using the default `http://localhost:3000` baseURL and default launch args, completely unaffected.

**One app-config change was still needed, and did need a dev-server restart:** Next.js's dev server blocks cross-origin requests to dev-only assets (HMR, RSC payloads) from hosts not on an allowlist. This silently broke the post-login client-side redirect — it looked exactly like a login failure (bounced back to `/admin/login`) until traced via the dev server's own log line: `⚠ Blocked cross-origin request to Next.js dev resource /_next/webpack-hmr from "test-onboarding-wizard.invalid"`. Fixed by adding `allowedDevOrigins: ['test-onboarding-wizard.invalid']` to `saas/next.config.ts` (dev-only setting, no effect on production builds) and restarting the dev server once. This is a real, persistent source-code change — small, additive, and narrowly scoped, but worth knowing about since it lives in the repo, not in test code.

## Tenant state

The tenant was found to be **not** zero-state when this test was built — a previous session had already fully onboarded and launched it (one company, one wine, contact info, payment info all set). Chose to **reset the existing tenant** rather than create a new one, since it's explicitly a disposable fixture (its name/purpose) and already had its `.invalid` domain wired up and proven working. Reset via direct SQL, scoped to `tenantId = 'cmsioproi000avl9czd60ua5h'`:

```sql
DELETE FROM "Price" WHERE "companyId" = 'cmsioxlf40001vl2sdgk78h3b'; -- the Individuals company's own tiers
DELETE FROM "Company" WHERE "tenantId" = 'cmsioproi000avl9czd60ua5h' AND "isIndividual" = false;
DELETE FROM "Wine" WHERE "tenantId" = 'cmsioproi000avl9czd60ua5h';
DELETE FROM "Setting" WHERE "tenantId" = 'cmsioproi000avl9czd60ua5h' AND key IN (
  'onboarding_launched_at', 'onboarding_works_with_companies',
  'onboarding_offers_food_addons', 'onboarding_offers_masterclasses',
  'contact_phone', 'contact_email', 'contact_address', 'maps_embed_url',
  'payment_iban', 'payment_bank_code', 'payment_bank_name', 'payment_personal_number', 'payment_recipient_name'
);
```

Deliberately **kept** `enable_enhanced_company_booking: true` (so the Booking Details step still appears — needed for the "optional, doesn't block Launch" check) and the auto-created "Individuals" company row itself (only cleared its `Price` rows — it's a required row the wizard depends on via `ensureIndividualsCompany`, not test debris).

**This test does not reset the tenant back to zero-state afterward.** Unlike the Staging Winery tests in this suite, nothing else depends on this tenant staying pristine between runs — it's used by nothing but this one test. **The above reset query must be run again before the next run of this test**, or it will fail at its very first assertion (the Individuals-pricing gate won't show, since pricing is already set from the previous run). This is a known, accepted limitation, not a bug — a proper automated fixture-reset (e.g. a dedicated npm script) would remove the need for a manual step, but wasn't built here to keep scope contained.

## What this checks

The highest-complexity single feature in the admin panel, and the one with the most bug history (#10, #11, #12, #13 all originated here). This test walks the real 7-step flow end-to-end on a true fresh tenant rather than trusting that "all steps show done" on an already-onboarded tenant proves anything.

## Steps & assertions

1. Log into the dedicated blank test tenant's admin, navigate to the onboarding wizard.
2. At the Individuals pricing section (first, per the gating redesign): **check** the Companies section below it has `pointer-events: none` and reduced opacity — direct check of the "grey out until Individuals pricing set" gating behavior.
3. Fill Individuals pricing (a flat per-person rate). **Check:** the Companies section becomes interactive (`pointer-events` restored, opacity normal) **without a page reload**.
4. Step through Companies (add one test company with a price tier), Wines (add one test wine), Booking Details.
5. At Contact & Site Info: fill phone, email, address. Save/advance.
6. **Check (the direct regression test for #10):** navigate to `/admin/settings` — a *different* page, not the wizard — and check its Contact Info section shows the **same** phone/email/address just entered. The original bug was invisible from inside the wizard itself (it showed the wizard's own step as "done" while writing to the wrong table); this cross-page check is what would have caught it immediately instead of requiring Max to notice the footer was blank.
7. At Payment Info: leave IBAN blank, advance to Review. **Check:** Review shows Payment as required/incomplete.
8. Go back, fill IBAN, return to Review. **Check:** Payment now shows as complete, **without reload**.
9. **Check:** Booking Details shows as optional (not blocking Launch) regardless of its completion state, per the confirmed design ("Booking Details as optional/incomplete" is an acceptable Review state). The test deliberately leaves Booking Details' two qualifying questions unanswered so this check is meaningful (if the step were already done, Launch being enabled wouldn't prove it's excluded from `readyToLaunch`).
10. Click Launch. **Check:** a "Launched \<date\>" confirmation state renders.
11. Click Launch again. **Check:** no error, still shows a valid "Launched" state. (Real finding below — this is not timestamp-idempotent, contrary to this step's original wording.)
12. **Cleanup:** decided on the standing-fixture approach — see "Tenant state" above for the reset query and why this test doesn't clean up after itself.

## Real findings from building this test

1. **Contact-field autosave race.** Filling phone, email, and address back-to-back with only one shared wait at the end lost two of the three saves — only the first field (which had the most real time elapse behind it before the eventual navigation away) actually persisted; email and address still showed their placeholder on `/admin/settings`. Each `FieldRow` autosaves independently on blur with its own fetch; fixed by waiting for each field's own save to genuinely land (2s) before touching the next field, the same class of race found elsewhere in this suite (date-filter debounce, tab-switch clicks).
2. **`furthestIndex` (which controls which StepNav tabs are clickable) is pure client-side state, reset on every full page load** to "the first not-done step" — it does not remember which steps were reached earlier in the same session. Since this test deliberately leaves Booking Details undone, a plain `goto('/admin/onboarding')` after the cross-page Settings check landed back on Booking Details with Payment/Contact/Review all disabled. Fixed using the wizard's own `?step=` URL override (`/admin/onboarding?step=payment`), which seeds both the current step and `furthestIndex` — then walking forward again via "Continue" rather than tab-jumping to Review directly, since jumping ahead past `furthestIndex` still isn't allowed even with the override.
3. **Every step component the wizard has ever mounted stays in the DOM** (`OnboardingWizard.tsx` toggles `display: none` on navigation rather than unmounting, deliberately, to preserve in-progress local state). This means a plain positional `page.locator('input')` matches inputs from every step ever visited, not just the current one — the Payment step's unlabeled IBAN field (last of five bank-transfer `FieldRow` inputs, none of which have an accessible name) needed `input:visible` to correctly scope to only the currently-shown step.
4. **Review's "Not done yet" / "Done" text is not visible page text** — it's the `title`/`aria-label` of a status icon (`shared.tsx`'s `StatusIcon`), a plain `<span>` whose only visible content is the ⚠/✓ symbol. `toContainText` on the row doesn't see it; needed to target `[title="..."]` directly.
5. **Launching again is not timestamp-idempotent**, contrary to this note's original step 11 wording. `launchTenant()` (`app/actions/onboarding.ts`) unconditionally writes a fresh `new Date().toISOString()` to `onboarding_launched_at` on every call — a second click genuinely updates the stored timestamp. This looks deliberate: the button relabels to "Launch again" and never disables, reading as a "re-publish" action rather than a true no-op. What the test checks instead: no error is thrown, and the page keeps showing a valid "Launched \<date\>" state either way (same calendar date both times in-test, since both clicks happen back-to-back).
