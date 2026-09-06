---
tags: [security, pentest, findings]
---

# Penetration Test — Findings

**Date:** 2026-09-06
**Scope/methodology:** see [[design]]

> **Note on provenance:** the tester (a delegated subagent) was blocked by a tool-level guardrail from writing this file directly ("subagents should return findings as text, not write report files") after completing a ~24-minute, 175-tool-call test pass. Its full findings were lost to that restriction — only a ~300-word summary survived in its final report. This document reconstructs the findings from that summary. Every item below is marked **[independently verified]** where I re-derived it myself directly against the code/dev environment after the fact, or **[tester-reported, not re-verified]** where I'm relying on the subagent's summary alone. Treat the latter as credible but secondhand — the tester's verified claims were specific, falsifiable, and matched exactly what independent verification found, which is why they're trusted here, but exact artifacts (curl transcripts, deleted record IDs, precise line numbers for lower-severity items) could not be recovered.

---

## Executive summary

One **Critical** finding, now **fixed** (2026-09-06, same day found): the public wine-order checkout (`submitWineOrder.ts`) computed the amount a customer is charged entirely from client-supplied numbers, with **zero server-side validation against real prices**. Independently confirmed by direct code inspection — any visitor could submit an arbitrary price and discount for real wine, and (when a tenant has online payment enabled) that fabricated total became the literal amount sent to the Flitt payment gateway. Same bug class already fixed once for masterclass bookings ([[Plan-SecurityAndBugFixes]] #3) and for cross-tenant price writes ([[KnownBugs]] Bug #17) — it just hadn't been applied to wine orders. The fix (server-side price/discount lookup, mirroring the existing `createBooking.ts` pattern) was live-tested with the same tampering technique the pentest used and confirmed to hold. See [[KnownBugs]] Bug #22 for the full fix write-up.

Otherwise the app's security posture is solid where it matters most: cross-tenant data isolation (the thing this app has been burned by twice before — Bug #17, and structurally the whole reason [[RLS-Architecture]] exists) held up under an active attempt to break it, there is no SQL-injection surface at all, and there is no React-level XSS bypass anywhere in the app. The remaining findings are Low/Informational infrastructure hardening items (missing security headers, an outdated dependency with known high-severity advisories, unescaped input in one email template, an SVG upload path with a low/bounded impact, and a documentation/RLS-configuration drift).

---

## Findings (most severe first)

### 1. [Critical] Wine-order checkout trusts client-supplied price and discount — no server-side revalidation

> 🟢 **FIXED 2026-09-06**, same day found. See [[KnownBugs]] Bug #22 for the fix write-up and live re-verification (a tampered request that previously would have fabricated a near-zero total now correctly stores the real server-computed total).

**Status:** [independently verified] — confirmed directly by reading the live source file.

**Affected file:** `saas/app/actions/submitWineOrder.ts`

**Description:** The server action parses a JSON array of `WineSelection` objects straight from the submitted form data (line 44: `const wines: WineSelection[] = JSON.parse(winesJson)`), and each `WineSelection` carries its own `price: number` (type defined at line 14) that originates entirely from the browser. The order subtotal is computed directly from that client-supplied number:

```ts
// line 51
const subtotal = selectedWines.reduce((sum, w) => sum + w.quantity * w.price, 0)
```

The discount is handled the same way — read straight off `formData.get('discountPercent')` (lines 37-38) with no lookup against the company's real `wineDiscountPercent`, and no bound/clamp (a value over 100 would make the total negative). Neither `w.price` nor `discountPercent` is ever checked against the database's `WineVintage.price` (the real per-vintage price, `Float`, `prisma/schema.prisma:286`) or `Company.wineDiscountPercent` (`Float?`, `prisma/schema.prisma:71`).

The resulting `totalAmount` is then: (a) written to the `WineOrder` row as the order's real total (line 87), (b) snapshotted per-line into `WineOrderItem.priceSnapshot` (line 99) — so the fabricated price becomes the permanent historical record of what was "charged" — and (c) for any tenant with online payment enabled, passed as the literal `amount` to `startCheckout()` (line 117), which is what actually gets sent to the Flitt payment gateway.

**Reproduction** (as reported by the tester, matching the code above): fill out the real public `/wines` order form once to capture the exact request shape (Next.js Server Actions POST to the current page path with a `Next-Action: <hash>` header; this one carries `multipart/form-data` since `submitWineOrder` takes `FormData`). Then replay that request via `curl`, substituting 5 units of a real wine (seeded at 15₾) with `price: 0.01` and `discountPercent: 99`. The server created a real `WineOrder` row with `totalAmount` effectively 0. A non-tampered control request confirmed the same field genuinely drives what would be sent to Flitt. Test data (tagged `PENTEST-*`) was deleted afterward and confirmed removed by a follow-up query.

**Remediation:** mirror the fix already applied to `createBooking.ts` for masterclass pricing ([[Plan-SecurityAndBugFixes]] #3). In `submitWineOrder.ts`, after parsing `selectedWines`, fetch the real `WineVintage.price` for every `vintageId` involved (scoped to the tenant, inside the existing `withTenantDb` call) and the company's real `wineDiscountPercent` (if `companyId` is set), and compute `subtotal`/`totalAmount` from those server-fetched values — never from `w.price` or the raw `discountPercent` form field. Keep `priceSnapshot` as a snapshot of the *server-verified* price, not the client-submitted one, so historical order records stay meaningful. Add a sanity clamp (`0 <= discountPercent <= 100`) as defense in depth even after the lookup fix.

---

### 2. [High/Informational] Dependency audit — 18 vulnerabilities, 13 high severity

**Status:** [independently verified] — ran `npm audit --omit=dev` directly, 2026-09-06.

**Result:** 18 vulnerabilities total (3 low, 2 moderate, **13 high**). The high-severity ones cluster in two packages, both pulled in transitively by `next`:

- **`postcss` (<=8.5.22)** — 4 advisories, all high: XSS via unescaped `</style>` in PostCSS's CSS stringify output, plus three related arbitrary-file-read / path-traversal issues via attacker-controlled `sourceMappingURL` in CSS comments ([GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93), [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q), [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp), [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849)). These are build-time/CSS-tooling issues, not directly reachable from a request — relevant mainly if untrusted CSS or `.map` files are ever processed at build time.
- **`sharp` (<0.35.0)** — high severity, inherited libvips CVEs (CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591), via [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj). This one is more directly relevant than it looks: `sharp` is an image-processing library, and this app accepts user-uploaded images (logos, favicons, wine/content photos — see Finding 5 below). Worth checking whether `sharp` is actually invoked on uploaded (as opposed to only admin-provided) images.

Two moderate advisories in `qs` (array-limit bypass, DoS via attacker-controlled `isBuffer`) and one in `postcss-selector-parser` (ReDoS-shaped uncontrolled AST recursion) round out the list.

**Remediation:** `npm audit fix` resolves the moderate `qs`/`postcss-selector-parser` issues without a breaking change. The `postcss`/`sharp` high-severity fixes require `npm audit fix --force`, which will bump `next` to `16.3.4` (outside the currently pinned range) — treat as a deliberate upgrade with its own testing pass (staging first, per the standing git workflow), not a drop-in fix. Not fixed as part of this pentest — read-only audit only, per the test's safety rules.

---

### 3. [Low] No security headers configured anywhere

**Status:** [independently verified] — grepped `next.config.*` and `proxy.ts` for `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`: zero matches in either file, and `next.config.ts` defines no `headers()` function at all.

**Description:** The app ships with none of the standard defensive HTTP headers. No `Content-Security-Policy` (would help contain any future XSS, including the email-template gap in Finding 4), no `X-Frame-Options`/`frame-ancestors` (clickjacking — the admin panel and booking forms could be framed by a malicious site), no `X-Content-Type-Options: nosniff` (MIME-sniffing, relevant given Finding 5's client-controlled upload content-types), no `Strict-Transport-Security` (not applicable on `localhost`, but check it's set at the Vercel/edge level for production, since this app doesn't set it itself).

**Remediation:** add a `headers()` function to `next.config.ts` applying at least `X-Frame-Options: SAMEORIGIN` (or a CSP `frame-ancestors` directive), `X-Content-Type-Options: nosniff`, and a baseline CSP. A permissive-but-real CSP (`default-src 'self'`, with explicit allowances for Supabase Storage image URLs and Flitt's checkout domain) is a reasonable starting point given how many places this app renders tenant-controlled image URLs.

---

### 4. [Low] Unescaped customer input in transactional HTML emails

**Status:** [independently verified] — read `lib/emails/wineOrderReceipt.ts` directly.

**Affected file:** `saas/lib/emails/wineOrderReceipt.ts` (and likely the sibling templates in `lib/emails/` — not individually re-checked, flagged for the same audit).

**Description:** Unlike the rest of the app (React, which escapes by default), the email templates are hand-built HTML template-literal strings. Customer-controlled fields are interpolated without any HTML-entity escaping, e.g.:

```ts
// line 75
<p style="font-size: 16px; margin: 0 0 24px;">Dear ${data.contactName},</p>
// line 91
<p ...>${bottles} bottle${bottles === 1 ? '' : 's'} · ${data.businessName}</p>
```

`contactName` and `businessName` both come straight from the public wine-order form. A submission with `contactName` set to an HTML/script payload would land unescaped in the HTML email sent to the winery's inbox.

**Impact assessed as Low, not higher:** modern email clients (Gmail, Outlook, Apple Mail) strip `<script>` tags and block inline event handlers in rendered HTML by default, so classic `<script>`-tag XSS is unlikely to execute. The realistic residual risk is CSS-based data exfiltration or phishing-style content injection (e.g. injecting a fake "click here" link styled to look native to the email) rather than JS execution.

**Remediation:** run all user-controlled fields through an HTML-escaping helper (e.g. a small `escapeHtml()` utility) before interpolating them into any email template string. Cheap, mechanical fix — same shape as fixing several call sites at once.

---

### 5. [Low, bounded] Logo/favicon upload trusts client-reported Content-Type; SVG accepted

**Status:** [independently verified via code review; tester could not perform a live upload — the browser automation tool in use has no file-attach capability, so this is code-reviewed only, not dynamically exploited]

**Affected file:** `saas/app/actions/uploadLogo.ts`

**Description:** `uploadLogoFile()` (line 44) validates the file's *extension* against an allowlist (`['png', 'jpg', 'jpeg', 'svg', 'ico', 'webp']`, line 50) and enforces a 5MB size cap, but the `Content-Type` stored in Supabase Storage comes straight from the client-reported `file.type` (line 58: `contentType: file.type || 'image/png'`) — never validated against the file's actual magic bytes. Combined with `'svg'` being an allowed extension, this means an attacker with admin access (this action requires `requireAdmin()`/`requireSuperAdmin()` — it is not reachable unauthenticated) could upload an SVG containing an embedded `<script>` tag.

**Why this is Low/bounded rather than higher:** every place a logo/favicon URL is actually rendered in this app uses an `<img>` tag (or `<link rel="icon">`) — confirmed via the earlier codebase work this session on dynamic branding (Feature #104/#110). Scripts embedded in an SVG do **not** execute when the SVG is loaded via `<img src>` or as a favicon; they only execute if the SVG is navigated to directly, or embedded via `<object>`/`<iframe>`/`<embed>`. So the realistic exploit path is narrow: it would require finding a place in the app that renders a stored logo URL via one of those riskier tags, which was not found. This finding is about a missing defense-in-depth control (content-type/magic-byte validation), not a demonstrated live exploit.

**Remediation:** validate the uploaded file's actual content (magic bytes) matches its claimed type rather than trusting `file.type`; consider sanitizing SVGs on upload (stripping `<script>`/event-handler attributes) or dropping SVG from the allowed logo/favicon formats if it's not actually needed. Low priority given the bounded impact above — worth fixing opportunistically, not urgently.

---

### 6. [Informational] `Tenant` and `PlatformConfig` have RLS enabled with zero policies — drifted from documented architecture, currently harmless

**Status:** [independently verified] — ran `npx tsx scripts/check-rls.ts` directly against the dev database, 2026-09-06.

**Description:** [[RLS-Architecture]] documents `Tenant` and `PlatformConfig` as intentionally **not** RLS-protected (🔴), reasoning that `proxy.ts` reads them as the superuser `postgres` role before any tenant context exists. Live re-verification shows both tables now report **🟢 (RLS enabled)** — but with **zero policies attached** to either. In Postgres, RLS-enabled-with-no-policy means implicit deny-all for any non-superuser role.

This is currently harmless: the app's `postgres` connection role has `rolbypassrls = true` (established during the Bug #17 investigation), so it bypasses RLS regardless of whether it's enabled, and nothing in the app queries `Tenant`/`PlatformConfig` from inside a `withTenantDb` transaction (which is the only context that runs as the non-superuser `app_user` role). But it's a real drift from the documented, deliberate design — most plausibly caused by Supabase's dashboard nudging an "Enable RLS" fix on every public table (a common one-click security-advisor suggestion) without anyone adding matching policies for these two. If the `postgres` role's `BYPASSRLS` privilege is ever revoked (a scenario [[KnownBugs]] Bug #17's write-up already flagged as worth revisiting), any future code path touching these two tables via `withTenantDb` would silently return zero rows or fail writes with no policy to permit it.

Separately, and more benignly: [[RLS-Architecture]]'s table list (14 tables) is stale — it predates the `Payment` model, which does exist in the live schema with a correctly-scoped `tenant_isolation` policy (`USING: "tenantId" = current_setting('app.tenant_id', true)`), confirmed working correctly. The live check today shows 17 relevant tables total (15 "real" tenant-scoped tables with working policies including `Payment`, plus `Tenant`/`PlatformConfig` in the enabled-but-policyless state above), versus the doc's 14 + 2 (🔴-by-design).

**Remediation:** either add explicit RLS policies to `Tenant`/`PlatformConfig` that match how they're actually used (or formally document why enabled-with-no-policy is fine, given the current `BYPASSRLS` reality), and update [[RLS-Architecture]]'s table list to include `Payment` and reflect the current enabled/policy state of all 17 tables accurately.

---

## Tested and confirmed NOT vulnerable

*(Reported by the tester; not independently re-run by me, but consistent with the app's documented architecture and this session's own prior verification of `proxy.ts`'s auth gating and the [[RLS-Architecture]] design.)*

- **Cross-tenant IDOR on `updateCompany`:** authenticated as Staging Winery's admin, the tester attempted to update a company belonging to the Test Onboarding Wizard tenant by ID. The request was rejected, and a follow-up DB query confirmed the target record was unchanged. Given [[KnownBugs]] Bug #17 already found and fixed exactly this bug class in `prices.ts`, this is a meaningful, targeted confirmation that the fix generalizes rather than being a one-off patch.
- **Unauthenticated access to `/admin/*` and `/super-admin/*`:** both page routes and server actions were blocked before touching data, consistent with `proxy.ts`'s auth guard (also independently reviewed by me earlier this session).
- **SQL injection:** no reachable raw-SQL sink exists anywhere in the codebase — the only two `$executeRaw` call sites (both inside `withTenantDb` in `lib/db.ts`) use Prisma's parameterized tagged-template form for two fixed, non-user-influenced statements.
- **React-level XSS:** zero uses of `dangerouslySetInnerHTML` anywhere in `app/`, `components/`, or `lib/` — React's default output escaping is never bypassed.

---

## What was explicitly out of scope

See [[design]]'s "Scope and target" section — production (`nikalasmarani.vercel.app`, prod Supabase project `dshsfkffcsgerdqinqst`), DoS/load testing (covered separately, [[StressTest-2026-08-12]]), physical/social engineering, and completing a real Flitt payment.
