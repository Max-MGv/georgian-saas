---
tags: [feature, feature-155, bug-reports, super-admin]
---

# Feature 155 — Bug/Feature Report Widget

**Status: built, 2026-09-09.** All 6 build phases done, pushed to `staging`, live-tested by Max on the staging preview deploy. Full phase-by-phase build log, exact decisions, and per-phase stress-test results: [[Plan-BugReportWidget]]. This note is the shorter reference — read the plan doc for build history, read this for "what is it and how do I touch it safely."

## What it does

A floating report icon on every surface of the app (public site, tenant admin panel, super-admin panel). Clicking it opens a panel where the reporter picks **Bug** or **Feature request**, writes a comment, and optionally attaches a screenshot (paste from clipboard or file upload). The report also carries a **breadcrumb trail** — the last ~25 clicks/navigations in that browser session — so Max can see what the user was doing right before the issue, without needing full session-replay video.

This is a **Max-only triage tool**, not a customer support channel — every report, from every tenant and every surface, lands in one place: `/super-admin/bug-reports`. A Resend email fires on every submission. Tenant admins get a narrower **read-only** status view (`/admin/my-reports`) of reports *they personally* submitted while logged in — never other admins', never other tenants'.

## Key design decisions

### 1. Who it's for — decided explicitly, not assumed

Max's own framing when this was scoped: *"the bugs/features should go to superadmin not admin... maybe admins will have a way to view their status - but the actual work here is for superadmin (me) not the business using my service."* This shaped everything downstream — the inbox is cross-tenant by design, and the admin view is deliberately read-only with no triage/status-change capability.

### 2. `BugReport` sits outside tenant RLS — same treatment as `Tenant`

The super-admin inbox needs one real unscoped query across every tenant. Rather than fight the RLS system for an exception, `BugReport` was never added to `setup-rls.ts` at all — no `tenant_isolation` policy, no grant entry — mirroring how `Tenant` itself already works (see [[RLS-Architecture]]'s table list, which documents both as "no RLS, app-layer only"). Access control is enforced entirely in server actions: `requireSuperAdmin()` gates the inbox actions (`getBugReports`, `getBugReport`, `updateBugReportStatus`), and `getMyBugReports()` filters by the session's own `submitterUserId` — never a client-passed id.

### 3. Submission itself is intentionally unauthenticated

`submitBugReport()` in `app/actions/bugReports.ts` does **not** call `requireAdmin()`/`requireSuperAdmin()` — public-site visitors report with no login, so `submitterEmail`/`submitterUserId` are `null` for anonymous submissions. Server-side validation (comment length, type/surface enum checks, screenshot MIME/size) is the only thing standing between this and a wide-open write endpoint — deliberately kept light (length/size caps only, no rate-limiter) per the plan's explicit "keep it light" call, flagged as a lever to pull later if abuse ever becomes real.

### 4. Breadcrumbs, not session replay

`lib/breadcrumbs.ts` is a plain module (no React dependency) holding a 25-entry ring buffer of `{type: 'click'|'navigation', target: string, path: string, timestamp: number}`, mirrored to `sessionStorage` so a page reload doesn't lose it. Deliberately chosen over full video/DOM-replay: cheap to store, cheap to read, no privacy surface beyond element identity (tag/aria-label/visible text — **never** input/textarea values, and any `input[type=password]` is recorded only as the literal string `"[password field]"`, even its tag is withheld).

### 5. "My reports" scopes to the individual admin, not the whole tenant

Explicit open question resolved during planning: does a tenant admin's status view show reports *they* submitted, or every report from *anyone at their tenant*? Went with **the individual submitter** (`submitterUserId`-filtered) as the safer, narrower default — confirmed correct behavior during live testing (two admins at the same tenant each saw only their own report).

## Files touched

- `saas/prisma/schema.prisma` — `BugReport` model + `BugReportType`/`BugReportStatus`/`BugReportSurface` enums. No Prisma relation to `Tenant` (bare `tenantId String?` column, matching `Payment`/`Order` convention in this schema — not the plan draft's relation field).
- `saas/lib/breadcrumbs.ts` — capture/ring-buffer mechanism.
- `saas/components/BreadcrumbTracker.tsx` — mounts the capture mechanism, no visible UI.
- `saas/components/BugReportWidget.tsx` — the floating icon + panel, mounted with a `surface` prop.
- `saas/app/actions/bugReports.ts` — `submitBugReport` (public), `getBugReports`/`getBugReport`/`updateBugReportStatus` (super-admin only), `getMyBugReports` (session-scoped).
- `saas/app/super-admin/bug-reports/` — inbox list + detail pages.
- `saas/app/admin/(panel)/my-reports/` — the tenant-admin status view.
- Mount points: `saas/app/(site)/layout.tsx`, `saas/app/admin/(panel)/layout.tsx`, `saas/app/super-admin/layout.tsx`.
- Supabase Storage bucket `bug-report-screenshots` (private — screenshots can contain sensitive tenant business data; read via 1-hour signed URLs, never a public URL).
- `vault/RLS-Architecture.md` — `BugReport` row added to the "no RLS, deliberate" table.

## Edge cases handled

- Anonymous public submission (no session) — `submitterEmail`/`submitterUserId` land as `null`, works correctly.
- No screenshot attached — optional field throughout, both client and server.
- Oversized/non-image screenshot — rejected both client-side (before hitting the network) and server-side (verified by calling the action directly with a crafted request, bypassing the client check).
- `sessionStorage` unavailable (private browsing, disabled storage) — breadcrumb capture wrapped in try/catch, degrades to in-memory-only for that page load rather than breaking the page.
- Malformed/missing breadcrumbs JSON on submit — doesn't block the submission, just stores `null`.
- Email delivery failure — never fails the submission; the report is already saved, the email error is logged only.
- Cross-tenant + public-site aggregation in the super-admin inbox — confirmed live with real rows from two different tenants plus one with no tenant, all appearing together in one unscoped query.

## Known limitation (not fixed yet)

Found during Max's live review of a real staging report: the screenshot captures whatever's on screen at paste/upload time, not necessarily the state that actually shows the problem. A real "cart total is wrong" report's screenshot showed the wine catalogue page, not the cart/checkout total itself — the bug's core claim couldn't be visually confirmed from the screenshot alone. The breadcrumb trail compensated well in that case (full click-by-click repro path was legible and useful), but this is a real UX gap worth a follow-up — e.g. a hint in the widget nudging the reporter to screenshot the actual broken state before opening the report panel.

## What to test

- Submit from all three surfaces (public site, admin, super-admin), confirm `surface`/`tenantId`/`submitterEmail`/`submitterUserId` land correctly for each.
- Confirm a non-super-admin hitting `/super-admin/bug-reports` directly gets redirected, same as `/super-admin/tenants`.
- Confirm two different tenant admins each see only their own reports in `/admin/my-reports`, never each other's.
- Confirm a status change in the inbox persists (reload, re-check — don't trust the UI's own claim).
- Confirm the widget doesn't collide with existing fixed-position UI (mobile hamburger, `OrdersTable`'s own slide-over) on both desktop and mobile.

## Not formally completed

The plan's Phase 7 (a scripted, automated end-to-end QA pass covering character-limit boundaries, a full mobile sweep, and a repeat of the oversized-image rejection check) did not finish — the agent running it hit an unrelated session/auth error mid-run. It was superseded by Max reviewing two real submissions directly on the staging deploy, which is a stronger real-world signal but doesn't cover every scripted edge case the automated pass would have. Worth revisiting if this feature sees heavier use.
