---
tags: [plan, playwright, testing]
---

# Plan — Expanding Playwright Coverage

**Status: 📋 Planned, not started.** Recorded 2026-10-02, straight after
[[Plan-PlaywrightSuiteHardening]] closed with the suite's first genuine 35/35 run. Max asked
"what do our tests cover and miss — all buttons? payment flows? which flows are missed?", and
asked for the answer to be saved here so it can be tackled later. **Nothing below has been built.**
Everything under "Candidate chunks" is a proposal for Max to approve, reorder or drop, not a
committed scope.

Related: `playwright/README.md` (what exists), `playwright/KNOWN-ISSUES.md` (environmental gotchas
to expect when adding more tests — read before writing any), [[Plan-PlaywrightSuiteHardening]]
(how the current suite got trustworthy; its ground rule — reproduce every failure live before
fixing, verify every fix with two clean isolated reruns — applies here too).

---

## Where the suite stands today (the baseline this plan builds on)

- **Localhost suite (tiers 1–4 + seed): 35 tests, all green** (35/35, 33.4 min, 2026-10-02).
- **Tier 5, real Flitt payments: 7 tests, staging only** (`playwright.staging.config.ts`).
  **Not re-run since Chunk 5** (2026-10-01; 6/8 then, one fixed on rerun, one retired). Re-running
  it is a cheap first step — see Chunk 0 below.
- Chromium only. Every test runs against Staging Winery on the dev database.

## What the current tests cover well

| Area | Depth |
|---|---|
| Individual booking (simple form) → DB → admin | Good |
| Company booking: access codes, contact picker, nationality tagging, enhanced form | Good |
| Wine ordering: browse → cart → checkout → admin, abandoned list | Good |
| **Payment amounts**: exact quoted amount reaches Flitt; payment on/off; per-company override; hidden price blocks payment; missing credentials degrade safely | Very good |
| **Real payment flows** (staging): approved, declined, book-later, admin-created, post-payment extras (incl. emails via Resend) | Very good |
| EN/KA locale parity on 5 pages, mobile + Georgian overflow, popover clipping, theme colours | Decent, narrow |
| Admin basics: login, orders filter + view toggle, companies CRUD, onboarding wizard | Light smoke |

## What it would catch

Wrong amounts charged or quoted · a booking that silently fails to save · a payment toggle that
does nothing · Georgian text overflowing on mobile · a broken contact-picker flow · data-loss
bugs like deleting a person erasing their name from past orders · admin login breaking.

## What it would miss (the gaps)

Found by comparing `git ls-files` for `saas/app` pages / API routes / server actions against the
routes the specs actually `goto()` (2026-10-02). "Not visited" means no spec navigates there
directly; a page reached only by clicking could be undercounted, so re-verify before relying on
any single line.

**Pages no test visits:**
- Admin: **Statistics, My Reports, Menu Items, Masterclass, Wines (admin management), Site
  Content editor**, manual **wine-order creation** (`/admin/wine-orders/new`)
- Public: **About, Contact, Terms, Privacy, Returns**, plus welcome / live / coming-soon
- Super-admin: orders, users, bug reports, settings, **new tenant** (only tenant detail is touched)

**Other gaps:**
- **No visual checks** — a page that looks broken but still works passes.
- **Chromium only** — Firefox, Safari and real mobile devices are commented out in
  `playwright.config.ts`. The "mobile" test is a narrow viewport in Chrome.
- **Many admin controls never clicked**: image upload, bug-report widget, blocked dates, Print Sheet
  (once), Export CSV (lightly), most settings.
- **Cron + API routes untested**: `api/cron/reconcile-payments`, `api/cron/reseed-demo`,
  `api/demo-event` (the Flitt callback/return routes are only exercised indirectly, on staging).
- **The live demo site** (`demo.vineworks.ge`) and its flows.
- **Localhost never checks emails** — only the staging payment tests do.
- **Single tenant**: everything runs against Staging Winery, so another tenant's settings, domain
  handling, or cross-tenant data isolation (RLS) would not be caught by any browser test.
- **No accessibility, load or security tests.**

---

## Candidate chunks (proposal — Max to approve / reorder / drop)

Ordered by "could cost money or trust" first. Each chunk follows the Hardening plan's ground rule.

- [ ] **Chunk 0 — Re-run tier 5 against staging** and record the real result. Cheap, and it is the
      only part of the "payment flows" claim that is stale. No new code.
- [ ] **Chunk 1 — Public pages smoke.** About, Contact, Terms, Privacy, Returns, payment-result,
      welcome/live/coming-soon: each loads, shows its heading, no console errors, no raw
      translation keys, EN and KA. Probably an extension of `locale-integrity.spec.ts`, which
      already has the machinery. Small.
- [ ] **Chunk 2 — Statistics page.** Owners rely on these numbers. Seed/know a fixed set of
      orders, assert the figures. Highest value-per-test in the "admin pages never visited" list.
- [ ] **Chunk 3 — Menu Items + Masterclass editors.** These feed the booking totals that the
      payment tests already trust (`booking-enhanced` uses their data but never tests editing it).
      Create / edit price / delete, then confirm the public form and a quoted total react.
- [ ] **Chunk 4 — Remaining admin pages smoke:** Wines management, Site Content, My Reports,
      manual wine-order creation, blocked dates. Load + key control + no errors; deeper only where a
      page writes data other flows read.
- [ ] **Chunk 5 — Super-admin pages smoke:** orders, users, bug reports, settings, new tenant
      (new tenant needs a throwaway tenant + cleanup — design that carefully; the onboarding-wizard
      reset button is the precedent).
- [ ] **Chunk 6 — Cron / API routes.** Hit `reconcile-payments` and `reseed-demo` directly: rejected
      without the secret, behaves with it. Needs care — `reseed-demo` wipes a tenant; only ever aim
      it at the demo tenant on the dev DB.
- [ ] **Chunk 7 — Cross-tenant isolation.** A second tenant's admin must not see Staging Winery's
      orders/companies. `check-rls.ts` covers the database layer; this would cover the UI.
- [ ] **Chunk 8 — Browser/device matrix.** Enable WebKit + a mobile project for a *tagged subset*
      (booking form, wine checkout, public pages) rather than all 35 — the suite is already ~34 min.
- [ ] **Chunk 9 — Demo site flows** (`demo.vineworks.ge`), after [[DemoSite/Plan-DemoFlowFixes]]
      settles, so tests aren't written against a moving target.
- [ ] **Chunk 10 — CI.** Already tracked as FeatureLog #154 (GitHub Actions on push to `staging`).
      Worth doing before the suite grows much further, since it is now ~34 min by hand.

**Deliberately not proposed yet:** visual-regression screenshots (high maintenance, many false
alarms with Georgian text and a theme system), load/stress (#129 already did a pass), and
accessibility scans — raise these only if Max wants them.

## Things to decide before starting

1. **Suite length.** It already takes ~34 min serially. More tests means either accepting that,
   splitting into a fast "smoke" tier vs a full tier, or parallelising (which the shared tenant
   state makes hard — see `KNOWN-ISSUES.md`'s toggle-cascade section).
2. **CI before or after more tests?** (Chunk 10 ordering.)
3. **Which chunks Max actually wants.** Chunk 0–3 is the "cheap and money-adjacent" slice; the
   rest is breadth.

## Practical warnings from the Hardening plan (so the next session doesn't relearn them)

- Dev server bloats under sustained test load (hit 1.26GB this week) — restart + `rm -rf .next`
  before a long run, and **warm dynamic routes with a real click-through**, not just static ones.
- A test's `finally` cleanup does not run if the test times out; tenant payment toggles and
  per-company overrides can be left wrong and break unrelated tests. Check them before blaming code.
- Always reproduce a failure live (trace / server log) before concluding what it is; the last
  round's fixes were each different from the first guess.
