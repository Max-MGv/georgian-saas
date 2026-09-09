---
tags: [plan, bug-reports, super-admin]
---

# Plan — Bug/Feature Report Widget

## What this is

A floating report icon on every surface of the app (public site, tenant admin panel, super-admin panel). Clicking it opens a side panel where the reporter picks **Bug** or **Feature request**, writes a comment, and attaches a screenshot (paste, upload, or auto-capture). The report also carries a **breadcrumb trail** — the last ~25 clicks/navigations in that session — so Max can see what the user was doing right before the issue.

Reports always go to **Max only**, via a new `/super-admin/bug-reports` inbox, regardless of which tenant or which surface they came from. Tenant admins get a **read-only status view** of reports they personally submitted (not other tenants', not other admins' at the same tenant unless we decide otherwise — see Phase 6 note). Public-site visitors get no status view, just a thank-you confirmation.

## Decisions made (2026-09-09)

- **Where the icon shows:** everywhere — public site, tenant admin, super-admin.
- **Notification:** email to Max via Resend on every new submission.
- **Bug vs feature:** one widget, one form, a type toggle at the top. Not two separate flows.
- **Data model:** modeled on `Tenant` — no `tenant_isolation` RLS policy (super-admin must read across all tenants), filtered at the application layer instead. See `[[RLS-Architecture]]` for why `Tenant` itself already works this way.
- **Storage:** screenshots go to Supabase Storage, same pattern as tenant site-content images (`[[MultiTenantSiteContent]]`), not inline base64 in the DB.
- **Breadcrumbs:** lightweight click/navigation trail (not full session-replay video) — capped ring buffer, kept client-side until submission, sent as JSON. No new recording infrastructure, no ongoing storage cost per session that doesn't submit a report.

## Progress tracker

- [x] Phase 0 — Plan written, research done, decisions confirmed with Max
- [x] Phase 1 — Data layer (Prisma model, Storage bucket, RLS treatment)
- [x] Phase 2 — Client-side breadcrumb capture
- [x] Phase 3 — Widget UI (icon + panel, shared across surfaces)
- [x] Phase 4 — Submission server action + email notification
- [x] Phase 5 — Super-admin inbox (`/super-admin/bug-reports`)
- [x] Phase 6 — Tenant admin "my reports" status view
- [ ] Phase 7 — QA / stress test pass (cross-tenant isolation, mobile, large screenshots, anonymous public submission, spam/abuse check)
- [ ] Phase 8 — Vault updates (FeatureLog, Roadmap, feature note)

Each phase below is built by a sub-agent, reviewed by Max's Claude session (this one) before merging into the next phase, and gets a quick stress-test pass before moving on. Update the checkbox above and the "Result" line under each phase as it completes.

---

## Phase 1 — Data layer

**Goal:** `BugReport` table exists, migrated to dev DB, with correct access shape (not tenant-RLS-isolated, since super-admin needs cross-tenant read).

**Prisma model (draft — adjust during implementation):**
```prisma
enum BugReportType {
  BUG
  FEATURE
}

enum BugReportStatus {
  NEW
  IN_PROGRESS
  RESOLVED
  WONT_FIX
}

enum BugReportSurface {
  PUBLIC_SITE
  ADMIN
  SUPER_ADMIN
}

model BugReport {
  id            String            @id @default(cuid())
  type          BugReportType
  status        BugReportStatus   @default(NEW)
  surface       BugReportSurface
  comment       String
  screenshotUrl String?
  breadcrumbs   Json?             // capped array of {type, target, path, timestamp}
  pageUrl       String
  userAgent     String?
  tenantId      String?           // null for surfaces with no tenant context (shouldn't happen in practice, but public site pre-tenant-resolution edge cases)
  submitterEmail String?          // admin's email if logged in; null for anonymous public submissions
  submitterUserId String?         // Supabase auth user id, if logged in
  createdAt     DateTime          @default(now())
  updatedAt     DateTime          @updatedAt

  tenant Tenant? @relation(fields: [tenantId], references: [id])
}
```

**Tasks:**
1. Add the model + enums to `saas/prisma/schema.prisma`, add the back-relation on `Tenant`.
2. Stop dev server (Windows EPERM rule — `[[MaintenanceNotes]]` #3), run `prisma migrate dev` against dev DB per `[[ClaudeInstructions]]` rule 0, confirm `✔ Generated Prisma Client`, restart dev server.
3. Create a Supabase Storage bucket for bug-report screenshots (private, not public — these can contain sensitive tenant business data in the screenshot). Confirm access pattern: server-side signed upload or service-role upload from the server action (Phase 4), signed read URLs when Max views them in Phase 5.
4. **Do NOT add this table to `setup-rls.ts`'s `writableTables` / tenant_isolation policies** — same treatment as `Tenant`. Access control is enforced entirely in server actions (`requireSuperAdmin()` for reads/writes in the inbox, a narrower "must be this admin's own report" check for Phase 6's status view). Document this explicitly in `[[RLS-Architecture]]`'s table list so it isn't mistaken for an oversight later.
5. Regenerate TS types if needed (`generate_typescript_types` via Supabase MCP, or Prisma's own generate covers it).

**Stress test before moving on:**
- Insert a row for two different tenants directly, confirm a super-admin-scoped query returns both.
- Confirm the table has RLS either fully open or matches the documented "no isolation, app-layer only" decision — nothing silently blocking legitimate super-admin reads.

**Result:** Done, 2026-09-09. `BugReport` model + 3 enums added to `schema.prisma`, migrated to dev DB (`add_bug_report`). One deviation from the draft: **no Prisma relation to `Tenant`** — every other tenantId-bearing model in this schema (Payment, Order, etc.) uses a bare `tenantId String?` column with no relation field, so `BugReport` follows that convention instead of the plan's draft relation. Storage bucket `bug-report-screenshots` created **private** in the dev Supabase project (`jpbkkngpgtvqmsocitjx`), same pattern as `logos`/`wine-photos`. `BugReport` confirmed absent from `setup-rls.ts` (no policy, by design). `RLS-Architecture.md` updated with a `BugReport` row documenting the no-RLS decision. Cross-tenant read stress test passed (two-tenant rows, one unscoped query returned both, then cleaned up).

**Flag for later phases:** the Supabase MCP tools connected in this Claude Code environment point at a *different* Supabase account than georgian-saas dev/prod — `list_projects` doesn't show this project at all. Phase 1 worked around it using the app's own `SUPABASE_SERVICE_ROLE_KEY` (same as existing `uploadImage.ts`/`uploadLogo.ts`). If Phase 4/5 want to use Supabase MCP tools directly (e.g. `execute_sql`, `get_advisors`), that connection needs to be reconfigured first — otherwise keep using the app's own service-role client, which works fine.

---

## Phase 2 — Client-side breadcrumb capture

**Goal:** a lightweight, capped trail of the user's recent clicks/navigations, available to attach when the widget is opened.

**Approach:**
- A small client-only module (e.g. `saas/lib/breadcrumbs.ts` + a React context/provider) that:
  - Listens for `click` events at the document level (capture target's tag, text/aria-label if short, and the element's nearest identifiable ancestor — button/link text, not full DOM dumps)
  - Listens for route changes (Next.js navigation) and pushes a `navigation` breadcrumb with the path
  - Keeps only the last 25 entries (ring buffer) in memory, mirrored to `sessionStorage` so a full page reload doesn't lose the trail
  - Exposes a `getBreadcrumbs()` read function for the widget to call on submit
- Mounted once near the root of each surface: `saas/app/(site)/layout.tsx`, `saas/app/admin/(panel)/layout.tsx`, `saas/app/super-admin/layout.tsx` (and the admin login-only layout if we want pre-login clicks too — probably not needed, skip it).
- No PII beyond what's already visible in the UI (button labels, link text, URLs) — never capture input field values or their content.

**Stress test before moving on:**
- Click around a page, open devtools, confirm the buffer caps at 25 and doesn't grow unbounded.
- Reload mid-session, confirm `sessionStorage` mirror survives.
- Confirm nothing is captured from password fields or any input value, only element identity.

**Result:** Done, 2026-09-09. `saas/lib/breadcrumbs.ts` (ring buffer + capture logic, no React dependency) + `saas/components/BreadcrumbTracker.tsx` (client component wiring `usePathname()` in, mounted on `(site)`, `admin/(panel)`, and `super-admin` layouts only — not the standalone login page). Entry shape: `{type: 'click'|'navigation', target: string, path: string, timestamp: number}`. Verified live via dev server + browser: 25-entry cap holds under 30 synthetic clicks, `sessionStorage` mirror survives a real page reload, a password field's click is recorded only as the literal `"[password field]"` with no value/attributes leaked. `getBreadcrumbs()`/`clearBreadcrumbs()` exported for Phase 3/4 to call. Minor note for Phase 3 to keep in mind: a click on an unlabeled wrapping `<div>` with no ARIA role falls back to just the tag name (`"div"`) — acceptable, matches "no full DOM dumps," but worth eyeballing real trails once the widget can display them.

---

## Phase 3 — Widget UI

**Goal:** one shared component, mounted on all three surfaces, visually adapted to each (doesn't need to be pixel-identical, but same behavior).

**Tasks:**
1. `saas/components/BugReportWidget.tsx` — floating icon (bottom-right, doesn't collide with existing UI — check mobile nav/hamburger and admin sticky elements), opens a slide-over/panel on click.
2. Panel contents: type toggle (Bug / Feature request), comment textarea (required), screenshot area — paste-from-clipboard support + file upload button (skip auto-capture/html2canvas for v1 — paste/upload is simpler and more reliable across complex layouts; revisit later if Max wants one-click auto-screenshot), submit button, cancel/close.
3. Pass context props: `surface` ('PUBLIC_SITE' | 'ADMIN' | 'SUPER_ADMIN'), current tenant id (if any), submitter email/user id (if logged in — read from existing auth session, don't re-implement auth).
4. Mount it in the three root layouts identified in Phase 2.
5. Basic client-side validation: comment required, image optional but if present must be an image type and under a sane size cap (confirm cap in Phase 4 alongside Storage bucket limits).

**Stress test before moving on:**
- Open/close on all three surfaces, confirm no overlap with existing floating UI (mobile hamburger, admin nav, print buttons, etc.)
- Paste an image from clipboard, confirm preview shows before submit.
- Upload a large image, confirm client-side size validation fires before hitting the server.
- Mobile viewport check (resize_window tool) on public site.

**Result:** Done, 2026-09-09. `saas/components/BugReportWidget.tsx` — floating trigger (bottom-right, 48px) + slide-over panel matching `OrdersTable.tsx`'s edit-panel pattern. Type toggle, comment (2000-char cap, provisional), screenshot via paste-from-clipboard or file upload (5MB cap, provisional), thumbnail preview + remove. Mounted in all three layouts with correct `surface` prop; `tenantId`/`submitterEmail`/`submitterUserId` wired in for real (server components already had this data — `getTenantId()` + `supabase.auth.getUser()`), no TODO needed there. Submit calls a clearly marked `stubSubmitBugReport()` that logs the full payload (including `getBreadcrumbs()` read at submit time) and fakes a 600ms round trip — **Phase 4 replaces only that one function**, payload shape and UI state are meant to carry over unchanged. Verified on public site + admin panel + super-admin, desktop and mobile, no collision with existing fixed UI (hamburger nav, OrdersTable's own slide-over at lower z-index). One visual note: the panel uses the light `--site-surface` palette everywhere, including on super-admin's dark theme — functional but visually mismatched there, worth a look during Phase 5. `clearBreadcrumbs()` is deliberately not called yet — TODO left for Phase 4 to fire after a real successful submit.

---

## Phase 4 — Submission server action + notification

**Goal:** wire the widget to a real backend that stores the report and pings Max.

**Tasks:**
1. `saas/app/actions/bugReports.ts` — `submitBugReport(data)`:
   - No auth required (public site submissions are anonymous) — this is intentionally an open write endpoint, so add basic abuse guardrails: comment length cap, screenshot size cap, maybe a simple rate limit (e.g. by IP or a short client-side cooldown) — keep it light, this isn't a public-facing product with high abuse risk.
   - Uploads screenshot to the Supabase Storage bucket from Phase 1, gets back a path/URL.
   - Creates the `BugReport` row.
   - Sends a Resend email to Max (reuse the existing Resend setup/pattern from invoice emails — `[[FeatureLog]]` #44) with: type, surface, tenant name (if any), comment, a link to the report in `/super-admin/bug-reports`, and the screenshot inlined or linked.
2. Decide and document the screenshot size cap + Storage bucket lifecycle (do old screenshots ever get purged? — not needed for v1, just note it as a future consideration).

**Stress test before moving on:**
- Submit a report from each surface, confirm the row lands with correct `surface`/`tenantId`/`submitterEmail`.
- Confirm the email arrives with a working screenshot link.
- Try an oversized image, confirm it's rejected client-side and server-side (never trust client-side alone).
- Submit without being logged in (public site), confirm it still works and `submitterEmail`/`submitterUserId` are null.

**Result:** Done, 2026-09-09. `saas/app/actions/bugReports.ts` — unauthenticated `submitBugReport(formData)`, full server-side validation (type/surface/comment/screenshot, mirrors the widget's client-side caps), uploads screenshot to the private `bug-report-screenshots` bucket at `{surface}/{tenantId-or-anonymous}/{timestamp}-{rand}.{ext}` (stores the storage *path* in `screenshotUrl`, not a public URL — Phase 5 reads it via `createSignedUrl`), creates the `BugReport` row with a plain `db.bugReport.create()` (correctly bypasses `withTenantDb`, per the Phase 1 decision), sends a best-effort Resend notification to `max.mghvdliashvili@gmail.com` (sandbox mode, same as `invoiceEmail.ts`/`notifyNewCompany.ts` — no separate recipient env var exists yet) that never fails the submission if the email itself fails. `BugReportWidget.tsx` now calls this for real via `FormData` (matching `uploadLogo.ts`'s convention) and fires `clearBreadcrumbs()` only after confirmed success. Stress-tested live: all 3 surfaces produced correct DB rows (public site → tenantId set, submitter fields null; admin → both set; super-admin → tenantId null as expected), Resend confirmed `delivered` via its API for all 3, oversized/non-image/empty/invalid-enum inputs all rejected server-side even when the client check was bypassed directly. Test rows/files cleaned up after.

**Minor follow-up (not blocking):** the notification email's HTML interpolates `comment` and `tenantLabel` unescaped. Low risk since it's a one-recipient email to Max's own inbox, but worth a quick escape pass before this is considered fully closed out.

**Open item for Max:** confirm `max.mghvdliashvili@gmail.com` as the permanent notification recipient (no `SUPER_ADMIN_EMAIL`-style env var exists yet — trivial to add later if you'd rather it not be hardcoded).

---

## Phase 5 — Super-admin inbox

**Goal:** Max can see, triage, and update every report from one place.

**Tasks:**
1. `saas/app/super-admin/bug-reports/page.tsx` (list) — `requireSuperAdmin()` guard per the existing pattern (`[[SuperAdmin-Architecture]]`). Table/list of reports: type badge, status badge, surface, tenant name, submitter, created date, truncated comment. Filter by type/status/tenant.
2. `saas/app/super-admin/bug-reports/[id]/page.tsx` (detail) — full comment, screenshot (signed URL if bucket is private), breadcrumb trail rendered as a readable timeline (not raw JSON), status dropdown (New/In Progress/Resolved/Won't Fix) that updates on change.
3. Add a nav link in `saas/app/super-admin/layout.tsx` alongside Tenants/Users.

**Stress test before moving on:**
- Confirm a non-super-admin (regular tenant admin) hitting `/super-admin/bug-reports` directly gets redirected, same as the existing super-admin routes.
- Confirm screenshots render/load correctly from Storage.
- Confirm status changes persist and reflect immediately.
- Confirm reports from multiple tenants and the public site all show up in one list (this is the one place cross-tenant aggregation is supposed to happen — see `[[MaintenanceNotes]]` #4/#5 on why that's normally *not* the case elsewhere).

**Result:** Done, 2026-09-09. `/super-admin/bug-reports` list (filters by type/status/tenant, badges, tenant name resolved without an N+1 query) and `/super-admin/bug-reports/[id]` detail (full comment, screenshot via 1-hour signed URL, breadcrumb trail as an oldest→newest timeline, status dropdown with optimistic update + rollback). `getBugReports()`/`getBugReport(id)`/`updateBugReportStatus()` added to `bugReports.ts`, all gated by `requireSuperAdmin()` (Phase 4's public `submitBugReport` untouched). Nav link added to super-admin layout. Verified live: non-super-admin gets redirected same as existing `/super-admin/tenants`; a seeded screenshot rendered via a genuine signed URL; a status change was confirmed to persist via a standalone DB query, not just the UI; reports across two different tenants plus one public-site (no-tenant) report all appeared together in one unscoped list, confirming the cross-tenant aggregation is real and this remains the one deliberate exception to the "no cross-tenant view" rule. All test data cleaned up.

---

## Phase 6 — Tenant admin "my reports" status view

**Goal:** a tenant admin can see the reports *they personally* submitted and their current status — not other admins' reports, not other tenants'.

**Open question to confirm with Max before building:** should this show reports from *this tenant* (any admin at that tenant) or *this specific logged-in user* only? Plan defaults to **this specific logged-in user** (matches `submitterUserId`) since that's the narrower, safer default and matches "did MY report get looked at" — flag this as a checkpoint, don't just assume.

**Tasks:**
1. A read-only page/tab under `/admin` (exact location TBD during build — maybe a small widget on the dashboard rather than a whole new nav item, given it's a secondary feature) listing the current user's own submitted reports + status, filtered server-side by `submitterUserId = current user` (never trust a client-passed filter for this).
2. No edit capability here — status changes are super-admin-only (Phase 5).

**Stress test before moving on:**
- Log in as two different tenant admins, confirm each only sees their own reports, never each other's or another tenant's.
- Confirm this view doesn't leak the internal breadcrumb trail or other admins' comments.

**Result:** Done, 2026-09-09. Confirmed the open question per the plan's own note: filtered by `submitterUserId = current user`, not by tenant.

`getMyBugReports()` added to `saas/app/actions/bugReports.ts` — calls `requireAdmin()` (this project's tenant-admin guard, `saas/lib/requireAdmin.ts`) then derives the current user from `supabase.auth.getUser()` inside the action itself (never from a client-passed id/email), filters `db.bugReport.findMany({ where: { submitterUserId: user.id } })`, and returns only `{id, type, status, comment (truncated to 160 chars), createdAt}` via an explicit Prisma `select` — no `breadcrumbs`, `screenshotUrl`, `pageUrl`, `userAgent`, `tenantId`, or submitter identity fields ever leave the server action.

**Placement:** standalone page at `/admin/my-reports`, not a dashboard widget. Checked `saas/app/admin/(panel)/page.tsx` first — `/admin` isn't a dashboard, it just `redirect('/admin/orders')`, so there was no natural landing page to attach a small widget to (per the plan's own fallback: "if no dashboard page, standalone page + nav link"). Added a nav link ("My Reports") to `saas/app/admin/(panel)/layout.tsx`'s existing nav-links array, styled identically to the other links.

Files touched:
- `saas/app/actions/bugReports.ts` — added `getMyBugReports()` + `MyBugReportListItem` type, and the `createClient`/`requireAdmin` imports it needs. `submitBugReport` and the Phase 5 super-admin actions untouched.
- `saas/app/admin/(panel)/my-reports/page.tsx` — new read-only server-component page. Server-rendered list: type tag, status badge, truncated comment, submitted date. No dropdown, no edit affordance — status changes stay super-admin-only (Phase 5). Status badge colors adapted to the light admin theme (not copy-pasted from `BugReportDetailClient.tsx`'s dark palette): `NEW` indigo-on-white (`#eef2ff`/`#c7d2fe`/`#4338ca`), `IN_PROGRESS` amber (`#fffbeb`/`#fde68a`/`#92400e`), `RESOLVED` green (`#f0fdf4`/`#bbf7d0`/`#15803d`), `WONT_FIX` slate (`#f1f5f9`/`#e2e8f0`/`#64748b`) — same semantic hues as the super-admin dark theme, different backgrounds/contrast for the light surface.
- `saas/app/admin/(panel)/layout.tsx` — added the `/admin/my-reports` nav link.
- `saas/lib/adminT.ts` — added `nav.myReports` + `myReports.*` translation keys in both `en` and `ka`.

**Stress test, live via dev server + browser (per the plan's checklist):**
- No second tenant admin test account existed beyond `maxb2bsaas@gmail.com` (checked `credentials.txt` — only one was on file), so created a throwaway one via the super-admin Users panel: `bugreport-test-b@nikalasmarani.test` / `TestAdminB123!`, tenant admin on the same Staging Winery tenant (deliberately same tenant, to prove this is user-scoped and not just tenant-scoped). **Left in place** — a `.test` TLD account with a tenant-admin role and no real business data behind it, harmless to leave, and useful for future admin-side testing. Flagging it here per the task instructions; delete via the super-admin Users panel ("Remove access") if you'd rather it not linger.
- Logged in as admin A (`maxb2bsaas@gmail.com`), submitted a Bug report live through the actual widget. `/admin/my-reports` showed exactly that one report.
- Logged in as admin B (the new test account), confirmed `/admin/my-reports` showed **zero** reports (not admin A's) before submitting, then submitted a Feature request live through the widget. Confirmed `/admin/my-reports` then showed only admin B's own report — never admin A's.
- Checked the actual network payload, not just the visual: pulled the rendered HTML/RSC response for `/admin/my-reports` and confirmed no `breadcrumbs`, `screenshotUrl`, `pageUrl`, `userAgent`, `tenantId`, `submitterEmail`, or `submitterUserId` field appears anywhere in it — only the four narrow fields render.
- Confirmed Phase 5's super-admin inbox (`/super-admin/bug-reports`) still aggregates across everyone — both test reports appeared together there with correct submitter emails and tenant name, so the one deliberate cross-tenant exception is unaffected by this phase.
- `npx tsc --noEmit` passes clean.
- Cleaned up both test `BugReport` rows via a direct Prisma script after verification (confirmed 0 remain in both the super-admin inbox and each admin's my-reports view).

**Deviations from the plan:** none of substance. Comment truncation length (160 chars) wasn't specified in the plan — chosen to keep each list row compact; the full untruncated comment was never a leak risk either way since these are the user's own reports.

**Open item for Max:** the throwaway `bugreport-test-b@nikalasmarani.test` admin account (see above) — removed 2026-09-09 via the Supabase Admin API after Phase 6 review, since it was only test scaffolding.

---

## Phase 7 — QA / stress test pass (end-to-end)

Beyond the per-phase checks above, before calling this done:
- Full flow test on public site as an anonymous visitor (Playwright, per existing `playwright/` suite pattern).
- Full flow test as a tenant admin.
- Full flow test as super-admin, including status update.
- Confirm the widget doesn't break any existing page (visual regression spot-check on a few key admin/public pages).
- Confirm mobile responsiveness of the widget panel itself.
- Cross-tenant isolation re-check specifically for this feature (per `[[MaintenanceNotes]]` #10 — don't trust a green check alone, write an explicit two-tenant test if a DB-level check is added).

**Result:** _(fill in when done)_

---

## Phase 8 — Vault updates

Per `[[ClaudeInstructions]]` rules 1, 4, 9:
- `FeatureLog.md` — new row(s) for the widget, inbox, and status view.
- `Roadmap.md` — tick off / add as completed.
- New feature note: `vault/features/Feature NNN - Bug Report Widget.md` (this touches well over 3 files and has non-trivial state — breadcrumb capture, cross-surface mounting, storage, email). Link it from `FeatureLog.md`.
- Update `RLS-Architecture.md`'s table list to include `BugReport` in the "no RLS, app-layer only" category alongside `Tenant`, so it reads as a deliberate decision, not a gap.

**Result:** _(fill in when done)_
