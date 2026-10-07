---
tags: [plan, verification, tickets]
---

# Plan — Scrutiny before anything touches production (2026-10-07)

**Trigger (Max):** "nothing goes to production yet until we verify what was done, that no dependencies were missed, that nothing broke or was collateral damage or unintentionally affected. Draw a plan for the scrutiny test and start executing."

**Scope = everything on `staging` that is not on `master`:** the ticket tool (Feature 222), the hardened bug-report submit path (KnownBugs #74), the proxy header fix (#75), the super-admin layout change, the rate-limiter action, two migrations (one already applied to production — the BugReport lock), the 7 mobile fixes + 3 small fixes + upload-limit fix are ALREADY on master and are out of scope except as regression targets.

**Rule:** this plan only reads, tests and fixes on `staging` / the dev DB. Production steps stay blocked until Max says go.

## The layers (run in order; every result goes in the table at the bottom)

| # | Layer | Question it answers | How |
|---|---|---|---|
| 0 | **Hygiene of the change itself** | Did I commit anything I didn't mean to — noise, secrets, stray files? | line-ending scan of every changed file; secret-pattern scan of the whole diff; list of added binaries; `.env`/`credentials.txt` never tracked |
| 1 | **Static** | Does it compile and build the way production builds? | `tsc`, ESLint on changed files, `prisma validate` + `migrate status` (dev **and** production, read-only), i18n parity, **a real production build** (`next build` catches what dev mode hides) |
| 2 | **Dependency audit** | Who else uses what I changed? | grep every consumer of: `BugReport` columns/status, `submitBugReport`, `x-tenant-*`/`x-platform-*` headers, `getTenantId`, `writeRateLimit` actions, super-admin layout/nav, the old `/super-admin/bug-reports` routes, tenant-deletion / reset / wipe scripts (do they know the new tables?), `check-rls`/`test-rls` table lists, the Playwright 2nd-tenant host trick |
| 3 | **Database & security** | Is the data consistent and still locked? | anon REST read/write test on **all** tables (dev + prod); dev integrity queries (status vs closedAt/closeReason, review events, orphans, reports without tickets); migrations in repo == applied |
| 4 | **Full regression** | Did any existing feature break? | clean dev server (`rm -rf .next`), full Playwright tiers 1–4 (+ money/RLS scripts), compared with the last known-good baseline; every failure diagnosed, none dismissed as "flaky" without a reproduction |
| 5 | **New-feature behaviour** | Does the new stuff do what the design says, including the refusals? | tickets spec (UI + API guard rails), widget on all 3 surfaces (public / tenant admin / super-admin), tenant `my-reports` status mapping after ticket moves, old inbox redirects, CLI end-to-end, proxy forged-header test on an unknown host |
| 6 | **Visual / phone** | Did the shared layout change hurt other screens? | screenshots, desktop + 390px, of every super-admin page (Tenants, Orders, Users, Settings, Tickets) before/after the layout change |
| 7 | **Independent collateral-damage review** | What did I not think of? | a fresh blind sub-agent, vault fenced, told only to find existing behaviour the diff could change |
| 8 | **Live staging** | Does the *deployed* staging behave like local? | after Vercel deploys: pages, widget report with a real screenshot, tickets page, API 401/200 with the dev token |
| 9 | **Sign-off** | Is anything left that must be fixed or consciously accepted before Max decides? | table below + explicit list of accepted risks |

## Results (filled in as executed)

| Layer | Result | Evidence / what it found |
|---|---|---|
| **0 Hygiene** | ✅ after 1 fix | **Found & fixed:** `schema.prisma` and `ClaudeInstructions.md` had been committed with Windows line endings on every line (a 1,900-line noise diff for a +129 change). Restored; schema diff now +129/0. No secrets in the diff; no credential files tracked; only binaries added = 9 evidence screenshots. |
| **1 Static** | ✅ after fixes | `tsc` clean; `prisma validate` OK; migrate status OK on dev; i18n parity OK; **real `next build` succeeds** (after clearing a stray dev process that locked the Prisma engine). ESLint: 2 errors in my new `TicketsClient` (setState-in-effect) **fixed**; remaining 3 notes are in untouched lines of `BugReportWidget.tsx`. |
| **2 Dependencies** | ✅ | Every reader of `x-tenant-*`/`x-platform-*` headers reads proxy-set values only (none relies on client-sent) → the header strip is safe. No wipe/reset/delete-tenant script touches BugReport/Ticket tables; RLS check scripts don't enumerate them; old inbox routes only linked from the redirected pages. |
| **3 Database & security** | ✅ | Anonymous REST on all 28 tables: dev — nothing readable, 7 locked (incl. the 4 new + BugReport); **production — unchanged: 4 ticket tables 404 (not migrated), BugReport still locked.** 12 data-integrity checks on dev tickets: all 0 problems. |
| **4 Full regression** | ✅ | Tiers 1–4: **36 passed, 1 failed → my own new test's selector (fixed; rerun 4/4)**. Two failures seen earlier were environmental and each reproduced and explained: **wine-catalogue-order** = the fixture wine "Rkatsiteli" is `active:false` in the dev data (hidden from the catalogue — NOT caused by my change: proved by disabling the proxy change → still failed; activating the wine → passed; restored to inactive); **onboarding wizard** = the documented "reset the test tenant first" precondition (reset via the documented button, then passed). |
| **5 New-feature behaviour** | ✅ | Ticket spec 4/4 on **dev server and on the production build**. Widget on all 3 surfaces: public → ticket (source Widget, tenant resolved, no submitter, marked untrusted); tenant admin → submitter taken from the real session; super-admin → tenant null. **Tenant "My reports" shows New → In Progress → Resolved as the ticket moves.** Old inbox list and detail URLs redirect. CLI and API guard rails verified (cannot Done / Review / reopen / close reporter tickets / change tenant). |
| **6 Visual / phone** | ✅ | All super-admin pages load, 0 page errors; desktop OK; phone: Orders/Users/Settings now 390px (were 605px); Tenants page still 592px = pre-existing, not caused by this work. |
| **7 Independent review** | ✅ | Blind collateral-damage review: no breaking change found. Findings: **deploy order** (migration must precede code — now step 1–3 of the runbook), backfill needed or the board is empty, tenant-visible wording for Duplicate, widget file picker mismatch (**fixed**: picker + client check now match the server's allow-list). |
| **8 Live staging** | ✅ after 1 fix | After deploy: all public pages 200; API 401 without/with a bad token, 200 with the dev token; a real **3.3 MB screenshot report through the public widget** → ticket T-71 (source Widget, tenant resolved, screenshot attached, image link HTTP 200 / 3.44 MB); super-admin login works on staging, board shows the STAGING banner. **Found & fixed:** the production build logged **React hydration errors (#418)** on ticket pages (relative ages + viewer-timezone dates differ between server and browser; dev mode hides it) → timezone pinned to Asia/Tbilisi (project convention), live ages marked client-only → re-checked live: **0 errors**. Test tickets closed. |

### Everything found during verification
1. Line-ending rewrite of 2 files — **fixed**. 2. ESLint errors in new code — **fixed**. 3. Widget file picker vs server allow-list — **fixed**. 4. Racy/ambiguous test selectors in my new spec (twice) — **fixed**. 5. React hydration mismatch (#418) in ticket pages, visible only in a production build — **fixed and re-verified live on staging**. 6. Stray dev process locking the Prisma engine blocks `next build` (Windows, known Rule-10 pattern) — procedure note. 7. Dev-data: the `Rkatsiteli` fixture wine is inactive → `wine-catalogue-order` fails until it is re-activated (**Max's staging data — left as found**; re-activate it on the Wines admin page before relying on that test).
**Nothing found that requires a change to production beyond the runbook.**

## Production runbook — DRAFT, DO NOT RUN until Max says go (reviewer finding #1: order matters)

`package.json` builds with `prisma generate && next build` — **Vercel does not run migrations**, so the new code will query tables that don't exist until you migrate. Wrong order = every bug report fails with "Failed to save your report" on every tenant. Correct order (the reverse is safe for old code, because it ignores the new nullable column and tables):

1. **Pre-flight (read-only):** `prisma migrate status` against production → expect exactly one pending migration (`…add_tickets`); the `…lock_bug_report_from_rest_api` migration is already applied. Re-run `git diff --stat origin/master origin/staging -- saas/prisma/schema.prisma` → expect **+129 lines**, not a rewrite.
2. **Create the private storage bucket `ticket-attachments`** in the production Supabase project (no code creates it; ticket image uploads fail without it).
3. **`prisma migrate deploy` on production** (additive only: enums, 4 tables, one nullable column + index + FK on the small `BugReport` table, RLS-on-no-policy + revoke on the new tables). Re-run the anonymous-REST test: the 4 new tables must return **401** (not 404, not 200).
4. **Backfill existing production reports into tickets** (`scripts/backfill-tickets.ts` with the production DATABASE_URL), then write real titles. Until this runs, the old inbox is gone from the nav and the board is empty (reviewer finding #2). The status round-trip is lossless for tenants.
5. **Create the production API token** (`scripts/ticket-token.ts create claude`), add `TICKETS_TOKEN_PROD=` to `credentials.txt`.
6. **Merge `staging` → `master`** → Vercel deploys. Mention to Max that the merge also carries: the proxy header fix (#75), the hardened widget (stricter screenshot types, rate limit), nav wrap + wider super-admin pages.
7. **Post-deploy checks on `nikalasmarani.vineworks.ge`:** home + wines load; a text report and a screenshot report from the public widget become tickets; `/super-admin/tickets` shows the backfilled board; API returns 401 without a token and 200 with the prod token; anonymous REST on all tables unchanged.
8. **Rollback:** revert the merge on `master` (old code ignores the additive schema). Nothing to undo in the database; the new tables simply sit unused.

**Knowing about, accepted:** a ticket closed as Duplicate/Obsolete/Not-reproducible shows the reporter "Won't Fix" (no re-link action yet); notification email subject now starts with `[PRODUCTION]` / `[STAGING]` — update any inbox filter; `BugReportsClient.tsx` / `getBugReports()` are dead code (harmless).
