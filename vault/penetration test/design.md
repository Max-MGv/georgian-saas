---
tags: [security, pentest, plan]
---

# Penetration Test — Design & Methodology

**Date:** 2026-09-06
**Tester:** Claude (Anthropic), acting under Max's explicit authorization
**Scope:** Dev environment only — see [[#Scope and target]]

This document is the test plan, written to describe what was tested and why. Results, evidence, and remediation live in [[findings]].

---

## Scope and target

- **Application:** `C:\Users\Max\Desktop\claude-projects\georgian-saas\saas`, run locally via `next dev` (Turbopack) at `http://localhost:3000`.
- **Database:** dev Supabase project `georgian-saas-dev` (`jpbkkngpgtvqmsocitjx`), per `saas/.env`. Never the production project (`dshsfkffcsgerdqinqst`).
- **Tenants used:**
  - `cmrxb85wo0000vlc0d964nzf8` — **Staging Winery** (`DEFAULT_TENANT_ID`, resolved by localhost). Primary test target — has real seeded companies, wines, prices.
  - `cmsioproi000avl9czd60ua5h` — **Test Onboarding Wizard** (`test-onboarding-wizard.invalid`). Used exclusively as the "other tenant" in cross-tenant IDOR probes — a request authenticated as Staging Winery's admin was pointed at this tenant's company/price IDs.
- **Accounts used:** tenant admin `maxb2bsaas@gmail.com` (Staging Winery); super-admin credentials were available (`super-admin-dev@nikalasmarani.test`) but not exercised beyond confirming the `/super-admin` route redirect, since no super-admin-specific write action was in scope for deeper testing this pass.
- **Out of scope (hard boundaries):**
  - Production Vercel URL (`nikalasmarani.vercel.app`) and any other `*.vercel.app` deployment.
  - Production Supabase project (`dshsfkffcsgerdqinqst`) and any real customer data.
  - **DoS / load / concurrency testing** — already covered by a dedicated pass, see [[StressTest-2026-08-12]] and [[KnownBugs]] Bug #19. This test only *confirms* that bug is still open via a couple of quick checks, it does not re-run load.
  - Physical security, social engineering, and client-side malware — not applicable to a single-developer local dev environment.
  - The real external payment provider (Flitt/`pay.flitt.com`) — checkout URLs were requested and observed (to confirm price/amount computation reaches the gateway correctly) but no card details were ever entered and no payment was ever completed.
  - Brute-forcing either real dev account's password past a handful of attempts (to avoid a lockout Max would have to fix).

## Environment note (not a security finding)

The dev server's `.next` build cache was stale at the start of this session and caused every route to 404 (including the tenant-agnostic `/coming-soon`). A clean rebuild (`rm -rf .next` + restart) resolved it immediately. Documented here only so a future session doesn't mistake it for a routing bug.

---

## Areas tested, and why

Ordered roughly by priority given this app's history (per [[KnownBugs]] Bug #17 — a real cross-tenant write bug found 2026-08-12 in `prices.ts`).

### 1. Cross-tenant IDOR / tenant isolation
The highest-value area given Bug #17's precedent (an action file bypassing `withTenantDb` entirely). **Method:** read every file in `app/actions/*.ts`, classify each exported function by whether it (a) calls `requireAdmin`/`requireSuperAdmin`, (b) resolves `tenantId` server-side via `getTenantId()` (never trusts a client-supplied tenant id), and (c) scopes every `find`/`update`/`delete` that takes a caller-supplied id with `tenantId` in the `where` clause or an explicit ownership check. Then dynamically confirmed the highest-risk pattern (an update action on a record identified only by its own id) by authenticating as Staging Winery's admin and calling the action directly against a record belonging to the Test Onboarding Wizard tenant, both via the real UI-issued request shape and via a hand-crafted `curl` request against the Server Action endpoint (bypassing the browser entirely).

### 2. Auth & access control
**Method:** unauthenticated `curl` requests to `/admin`, `/super-admin`, and to server-action endpoints under `/admin/*` (both with a guessed/invalid `Next-Action` id and, where a real id was captured from a legitimate session, replayed with the session cookie stripped). Checked `proxy.ts`'s redirect logic by reading it, then confirmed live. Checked whether the Supabase auth cookie is readable by page JavaScript (`document.cookie`).

### 3. Injection
**Method:** `grep` across `app/` and `lib/` for `$queryRaw`/`$executeRaw`/`$queryRawUnsafe`. Only two call sites exist, both in `lib/db.ts`'s `withTenantDb`, both using Prisma's tagged-template parameterization (not string concatenation) for exactly two fixed statements (`set_config`, `SET LOCAL ROLE`). No other raw SQL exists in the codebase, so no live SQL-injection payloads were attempted — there is no reachable raw-SQL sink.

### 4. XSS
**Method:** `grep` for `dangerouslySetInnerHTML` across `app/`, `components/`, `lib/` — zero matches, meaning the React rendering path has no bypass of its default output-escaping anywhere in the app. Attention then shifted to the one other place HTML is hand-built from user input outside React's escaping: the transactional email templates (`lib/emails/*.ts`), which are plain template-literal HTML strings, not React — read for unescaped interpolation of customer-controlled fields. Also reviewed the logo/favicon SVG upload path (`uploadTenantLogo`/`uploadTenantFavicon` in `app/actions/uploadLogo.ts`) as the one file-upload path that accepts an executable-if-misused format, and traced how the resulting URL is actually used in rendered output (`<link rel="icon">` / presumably `<img>`, both non-executing contexts) rather than assuming impact.

### 5. Business-logic abuse
**Method:** for every customer-facing money path (`createBooking.ts`, `submitWineOrder.ts`), read whether the total charged is computed from a server-side DB lookup or from client-supplied numbers. Where a price/discount value appeared to originate from the client, this was **dynamically exploited**, not just flagged from code: filled out the real public wine-order form once to capture the exact Server Action request shape (via a `window.fetch` hook installed through the browser's JS console, since Next.js Server Actions are POSTs with a `Next-Action` header rather than named REST endpoints), then replayed that request via `curl` with a manipulated `price`/`discountPercent`, and verified the resulting database row directly. Booking-form min-guest validation and blocked-date/date-in-the-past guards were reviewed but not separately exploited (no client-trusted numeric input feeds into them beyond guest count, which does not change money owed if pricing itself is fixed).

### 6. File upload
**Method:** code review of all four upload actions (`uploadImage.ts`, `uploadLogo.ts`) — allowed extension lists, `MAX_SIZE`/`MAX_WIDTH` enforcement, path-traversal guards on delete, and what `Content-Type` gets stored/served. Did not perform a live upload: the browser automation tool available for this session (`Claude_Browser`) has no file-picker/file-attach primitive, so this category is **code-reviewed, not dynamically exploited** — noted explicitly in [[findings]] rather than overclaiming.

### 7. Information disclosure
**Method:** inspected raw HTTP responses (`curl -D -`) for the homepage, an intentionally-invalid Server Action call, and a real one, checking for stack traces, connection strings, or service-role keys leaking into headers or bodies. Reviewed `proxy.ts` line-by-line for whether the `x-tenant-id` header it injects can be influenced by a client-supplied header of the same name (it fully overwrites it whenever a tenant resolves, and unresolved-tenant requests are redirected away before any tenant-scoped code runs, so the header cannot be smuggled through in a way that matters).

### 8. Security headers
**Method:** `curl -D -` against the homepage, grepped for `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, `Referrer-Policy`. Cross-checked against `next.config.ts` (no `headers()` function defined) to confirm this isn't a dev-only artifact.

### 9. Dependency audit
**Method:** `npm audit` (read-only; `npm audit fix` / package upgrades were never run, per the hard safety rules). Findings cross-referenced against the app's own architecture (e.g. a Next.js CVE about Server Actions is directly relevant here, since this app leans on Server Actions heavily).

### 10. RLS re-verification
**Method:** `npx tsx scripts/check-rls.ts` from `saas/`, compared line-by-line against [[RLS-Architecture]]'s documented expected state (17 tenanted/platform tables, `tenant_isolation` policies on each).

---

## Tooling notes

- Server Actions in this Next.js version are plain `POST` requests to the current page path carrying a `Next-Action: <hash>` header and either a `multipart/form-data` body (functions whose signature takes a `FormData`, e.g. `submitWineOrder`) or a `text/plain` JSON-array body of `[arg1, arg2, ...]` (functions with typed positional arguments, e.g. `updateCompany`). Both shapes were captured by monkey-patching `window.fetch` from the browser console during a real, legitimate use of each form/admin action, then replayed via `curl` with specific fields altered — this is what made the price-tampering and cross-tenant-IDOR tests possible without any framework-specific tooling.
- All test data created during this pass was prefixed `PENTEST-` and deleted afterward via a targeted Prisma script (`wineOrderItem.deleteMany` / `wineOrder.deleteMany` scoped to `businessName: { startsWith: 'PENTEST' } }`), confirmed empty by a follow-up query — see [[findings]] for the exact record IDs removed.
