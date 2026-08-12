---
tags: [architecture, review, technical-debt]
generated: 2026-08-12
repo: georgian-saas
---

# Architecture & Flow Review — 2026-08-12

Full-codebase pass requested by Max: "assess potential areas that might prove problematic... focus on architecture and flow... as this project expands there's more chance for conflicting design decisions." This is not a bug list — see `KnownBugs.md` for that. This is about structural patterns that will get worse, not better, as more tenants/features/contributors are added, plus one real security gap found while reading the code.

Scale context: 146 rows in `FeatureLog.md`, 2 tenants total (1 real production client — Nikalas Marani — plus the Staging Winery dev clone), one prospect in the pipeline. Everything below should be read through that lens: several of these risks are currently invisible because there is only one real tenant and no real concurrent load. That is exactly what makes them worth writing down now, before a second client makes them visible in production instead of in a review.

---

## 1. Security — `prices.ts` bypasses tenant isolation (fix this one first)

> 🟢 **FIXED 2026-08-12, same day, with Max's explicit go-ahead.** `createPrice`/`updatePrice`/`deletePrice` now run inside `withTenantDb`, plus an explicit ownership check mirroring `setDisplayPrice`. See `KnownBugs.md` Bug #17 for the full write-up and verification. The `FORCE ROW LEVEL SECURITY` question raised below was investigated as part of the same fix: queried `pg_roles` directly against the dev database and confirmed `postgres` has `rolbypassrls = true` — a role with `BYPASSRLS` ignores RLS regardless of `FORCE` (`FORCE` only removes the table-owner exemption, not genuine bypass/superuser status), so `FORCE ROW LEVEL SECURITY` would change nothing for this connection and was **not** added to `setup-rls.ts`. The speculation two paragraphs below ("worth adding `FORCE ROW LEVEL SECURITY`...") is superseded by this — kept as history, not current guidance.

**Severity: High.** `app/actions/prices.ts` — `createPrice`, `updatePrice`, `deletePrice` — call raw `db.price.*` directly instead of going through `withTenantDb` (see `RLS-Architecture.md`). They're guarded only by `requireAdmin()`, which confirms the *caller's own* tenant matches the current domain — it never checks that the `companyId`/`priceId` *argument* passed into the function actually belongs to that tenant. Raw `db` connects as the Postgres superuser role, which bypasses RLS by design (RLS only engages under `SET LOCAL ROLE app_user`, which only `withTenantDb` sets). `Price` has no `tenantId` column of its own — its RLS policy works by joining back to `Company` — so there's no schema-level backstop either.

Only `setDisplayPrice` in the same file checks correctly (`price.company.tenantId !== tenantId`, ~line 74). The other three don't.

**Concretely:** a tenant-A admin session that passes a tenant-B `companyId` or `priceId` to `createPrice`/`updatePrice`/`deletePrice` would currently succeed — writing or deleting another tenant's pricing data. `onboarding.ts` and `settings.ts` both call into `createPrice`, so they inherit the gap without knowing it.

This is different in kind from the other findings below: it's not "will get harder to maintain," it's "a second real tenant makes this exploitable today." Flagged as a task chip (`task_262c73ba`) — same fix shape as `setDisplayPrice` already uses, or route through `withTenantDb` like every other tenant-scoped action.

**Adversarially verified, 2026-08-12 (same session):** a second agent was sent specifically to try to disprove this and could not. It confirmed both that `requireAdmin()` (`lib/requireAdmin.ts`) takes no arguments and structurally cannot validate `companyId`/`priceId`, and that these are real Next.js Server Actions — POST endpoints an authenticated tenant-A admin can invoke directly (bypassing the UI) with a tenant-B ID. It also surfaced a broader, previously-undocumented detail: `setup-rls.ts` only ever runs `ENABLE ROW LEVEL SECURITY`, never `FORCE ROW LEVEL SECURITY`. In Postgres, `ENABLE` without `FORCE` means RLS doesn't apply to a table's *owner* role — and the app's Prisma connection is `postgres`, which owns every table. So there are two independent reasons the bare `db` client escapes the `Price` policy (superuser `BYPASSRLS`, and separately, unforced owner-exemption) — meaning this isn't unique to `prices.ts`: *any* future unwrapped query against *any* RLS-protected table would silently bypass it the same way. Worth adding `FORCE ROW LEVEL SECURITY` on the tenanted tables as a belt-and-suspenders fix alongside patching `prices.ts` itself, so a similar miss elsewhere fails safe instead of failing open.

---

## 2. Schema shape — tenant scoping has no structural backstop

`prisma/schema.prisma`: 20 models, 6 enums. `tenantId` is a bare `String?` on every tenanted table (`Company`, `Order`, `MenuItem`, `MasterclassItem`, `WineOrder`, `Setting`, `SiteContent`, `BlockedDate`, `Wine`, `WineVintage`, `Payment`) — **not a modeled relation to `Tenant`**. Prisma can't catch a wrong or missing tenant ID at the type level; it's just a string that happens to usually be right. `Price`, `OrderExtra`, `OrderMasterclass`, `WineOrderItem` don't even have the column — isolation for those four tables exists *only* as an RLS policy that JOINs to a parent. Section 1 above is exactly what that gap looks like when a code path also skips the app-level check.

This isn't something to fix wholesale (a real FK relation might have its own tradeoffs worth discussing before changing), but it's worth knowing: every new tenanted table added from here forward inherits "the only thing enforcing this is people remembering to call `withTenantDb`" — see the `test-rls.ts` note in section 8 for why even the test suite doesn't reliably catch a miss.

Secondary, lower-severity signal of organic growth: `Order` has grown three near-duplicate guest-count fields (`lunchGuestCount`, `tastingGuestCount`, `freeGuestCount`) layered on top of the original `guestCount`, and `Wine`/`WineVintage` duplicate `wineType`/`sweetness`/`sparkling`/`alcoholLevel` behind a tenant-level `wineDetailLevel` flag. Neither is wrong, but each new "not every tenant needs this field" case has so far been solved by adding parallel columns + a flag rather than a smaller normalized shape. Worth deciding deliberately next time this pattern comes up, rather than defaulting to it a third time.

---

## 3. No shared UI primitives — every table/modal is reinvented per page

`components/ui/` has 8 shadcn-style primitives (badge, button, card, input, label, select, separator, textarea) — no `Dialog`, `Table`, `Tabs`, or `DropdownMenu`. The consequence is concrete, not hypothetical:

- Modal markup (`fixed inset-0 ...`) is hand-rolled independently in `CompaniesClient.tsx` and 3 separate places in `OrdersTable.tsx`.
- `<table>` markup is separately reimplemented in `OrdersTable.tsx`, `WineOrdersClient.tsx`, `NewOrderForm.tsx`, `OrderDetail.tsx`, and `BookingSheetPrint.tsx`.

Every admin page is structurally consistent at the *data* layer (server `page.tsx` → server actions → one `*Client.tsx`, no client-side fetch/SWR anywhere — that part is genuinely clean and worth preserving). The inconsistency is one layer up, in UI composition: because there's no shared `Dialog`/`DataTable`, each new admin feature either copies an existing page's modal/table code or writes a new variant. `Bug #15` (nested `<button>` inside `<button>` on `/admin/companies`, causing hydration mismatches) is a direct symptom — it happened in one hand-rolled instance and wouldn't have been possible in a shared, tested primitive.

The `*Client.tsx` files have also grown large as a result: `SettingsClient.tsx` is 1,251 lines with 43 `useState` calls; `WinesClient.tsx` 1,036 lines / 20 states; `CompaniesClient.tsx` 819 lines / 33 states. None of this is broken today, but each is a candidate for the next "state got out of sync" bug, and the fix (extracting shared primitives) gets more expensive the longer it's deferred, since every page that would need migrating keeps growing.

---

## 4. No CI, no unit tests

`saas/tests/` holds 11 Playwright specs across 4 tiers (regression, core flows, admin smoke, locale) — a real and reasonably organized e2e suite. But:

- There is no `.github/workflows` directory anywhere in the repo. `playwright.config.ts` has `process.env.CI` branches for retries/workers, but nothing ever sets `CI` — the suite only runs when someone remembers to run it manually.
- No unit test framework exists (no Jest/Vitest config, no `*.test.ts` files). Pure logic — the payment-override precedence in #148, `getFinishDetailsStatus()`, discount math, guest-count validation — has no fast, isolated test coverage; correctness currently depends on Playwright (slow, requires a running app + DB) or on Max manually re-testing the `MyToDo.md` checklist by hand every session.

At the current pace (multiple non-trivial features per session, per `SessionLog.md`), "no CI gate" means a regression in an untouched area has no chance of being caught except by manually re-running a checklist that grows every session. This is the single most direct answer to "as this project expands, there's more chance of conflicting design decisions" — right now nothing *mechanically* catches a conflict; it relies entirely on Max's and Claude's memory of `MaintenanceNotes.md`.

---

## 5. Super-admin cross-tenant views have no pagination — the one thing that doesn't survive more tenants

Everything per-tenant (`Orders`, `Companies`, `Wines` admin lists) is fine unpaginated today because it's scoped to one tenant's realistic data volume. But the *cross-tenant* super-admin views don't have that natural ceiling:

- `superAdmin.ts`'s `getTenants()` runs `db.tenant.findMany()` with no `take`, then fires 3 more `count()` queries **per tenant** in parallel (`Promise.all` over `tenants.map(...)`). At 100 tenants that's 300+ queries on a single dashboard load.
- The same file repeats an unpaginated `findMany({ select: { id, name, domain } })` pattern twice more, for lookup maps, on every request.
- `/super-admin/orders` (the cross-tenant Bookings/Wine Orders view, #122) has no pagination either.

None of this matters at 2 tenants. It's the first thing that will visibly break — as a slow or timing-out `/super-admin` dashboard — once the pipeline in `Roadmap.md`'s "Client Pipeline" section actually produces a handful of new clients. Worth a pagination pass before, not after, that happens; `MigrationNotes.md` already flags ~25-30 clients as the point to shard Supabase accounts, and this is the same order of magnitude.

---

## 6. In-memory per-instance caches — correctness footgun, not just a perf one

`proxy.ts` holds a module-level `Map` (`tenantCache`, 5-minute TTL, no eviction) caching each domain's *entire* resolved tenant record — theme, module flags, logo/favicon, display name — not just the tenant ID. Two consequences, one already observed:

- **Unbounded growth**: nothing evicts old entries by size, only by TTL. Fine at 2 tenants; worth revisiting once "onboard a client" is a routine event rather than a rare one, since each serverless instance builds its own copy of this map from scratch.
- **Already-observed staleness**: confirmed 2026-08-10 (via the Playwright theme-color test) that a theme preset change via `/super-admin` doesn't invalidate this cache — the public site keeps serving the old theme for up to 5 minutes after save, and rapid-fire testing reliably hit the stale value every time. `MigrationNotes.md` documents this for domain/theme changes specifically; it applies to *every* field this cache holds, including module flags (`modulesOnlinePayment`, etc.) — a tenant whose online-payment module was just switched off could still see the old "Book & Pay" button for up to 5 minutes.

Not urgent to fix (self-heals in 5 minutes, and a production deploy restarts the process anyway), but worth remembering as the module-flag surface grows (payment overrides in #148 are exactly the kind of "must take effect immediately" toggle this cache silently delays).

---

## 7. Three text systems — inconsistent adoption of the fallback pattern, not a disconnect between the systems themselves

**Corrected 2026-08-12, same session — the original write-up here overstated this.** There are three text mechanisms, not two, and two of them are explicitly, deliberately connected — verified by reading the actual code, not assumed from the vault:

1. **`SiteContent` DB rows** (`key`, `locale`, `tenantId`) — tenant-editable public content.
2. **`lib/t.ts`** — a static EN/KA dictionary for public-facing UI chrome, imported only in the 12 files under `app/(site)/`.
3. **`lib/adminT.ts`** — a *separate* static EN/KA dictionary, imported across ~55 admin files, switched by the tenant's `admin_language` Setting. This one is legitimately independent of the other two — it covers the admin interface itself, which has no tenant-editable content to fall back to or from, so "disconnected" here isn't a gap, it's correct scoping.

Systems 1 and 2 are connected by a real fallback chain, e.g. `BookingForm.tsx:85`: `const fc = (key, tKey) => formContent[key] || t(locale, tKey)` — `SiteContent` is checked first as the tenant override, `t()` is the built-in default when no override row exists. Where this pattern is used, it works correctly.

**The actual gap is adoption, not architecture:** not every field is routed through `fc()` (or an equivalent). `KnownBugs.md` #16 (the `/wines` Grid/List toggle) isn't two systems failing to talk to each other — it's a field that bypasses *both*, a bare literal with no `fc()` and no `t()` call at all. And even where `fc()` *is* used correctly, there's no automated check that the `SiteContent` side has a `ka` row seeded for every key — `KnownBugs.md` #131's actual shape: the fallback chain works exactly as designed, it just silently resolves to the English `t()` default when the Georgian DB row is missing, which reads as "the Georgian toggle does nothing" even though nothing is broken. Both bug shapes were found by manual QA, not by any structural or lint-level check, and both will keep recurring at the rate new fields are added — but the fix target is different than originally stated: enforce/lint "does every editable field use `fc()`-or-equivalent" and "does every `SiteContent` key have both locale rows seeded," not "unify two systems."

Similarly, `EditableText.tsx` and `EditableLongText.tsx` (`MaintenanceNotes.md` §7) are two independent implementations of the same save/cancel/reset behavior — a deliberate call at the time (different DOM needs), but it means any future change to that UX pattern (e.g. the #148 payment work's toggle interactions, if it ever needs long-text fields) has to remember to touch both.

**New, found while verifying this section (not in the original pass):** `lib/emails/bookingConfirmation.ts` and `lib/emails/wineOrderReceipt.ts` — the actual transactional emails sent to customers — use none of the three text systems above. They hardcode English strings directly, with no locale parameter at all. A customer who booked in Georgian still gets an English confirmation/receipt email. This is a fourth, even more disconnected case: not an adoption gap in an existing pattern, but a surface the pattern never reached at all.

---

## 8. Tests can pass green while proving nothing — `test-rls.ts` on a 1-tenant DB

`MaintenanceNotes.md` §10 already documents this precisely: `scripts/test-rls.ts`'s cross-tenant isolation section — the part that actually proves RLS works — silently skips itself when the DB has fewer than 2 tenants, and still reports a clean "18 passed, 0 failed." The dev DB normally has exactly one tenant (Staging Winery). So the everyday result of running the isolation suite proves nothing about isolation. Combined with finding #1 above (a real gap that a green test run wouldn't have caught, since `prices.ts` isn't covered by `test-payment-rls.ts`'s two-tenant pattern), this is worth treating as a standing process risk, not a one-time note: **any new tenanted table or action needs its own explicit two-tenant test** (the `test-payment-rls.ts` pattern), because the general suite's green checkmark is not evidence.

---

## 9. Admin panel theming diverges from public-site theming

Documented in `KnownBugs.md` #14's "not fixed, deliberately out of scope" note: the public site fully respects all 10+ super-admin theme presets via `var(--site-*)` CSS variables; the admin panel only themes `--color-brand` and hardcodes everything else. This was a conscious scoping decision for #14, not an oversight — but it means the admin panel and public site are now **two different theming architectures**, and every future admin-panel feature (the growing `HelpHint`/guide-mode surface, the #148 payment controls UI, onboarding wizard) is being built against the "hardcoded, brand-accent-only" model while the public site keeps getting more theme-aware. If a client ever asks for a themed admin panel (plausible once multiple client-facing admins exist, not just Max's), that's a retrofit across every admin page rather than an incremental extension.

---

## 10. Feature-flag layering is getting deep — worth a decision, not just more toggles

The #148 Granular Payment Controls work (see `MyToDo.md` and `Features/Feature 148...`) stacks: module on/off (`modulesOnlinePayment`) → section toggle (Individuals/Companies/Wine Orders on Settings) → per-company override (Default/Always skip/Always require) → individual-booking behavior that ignores the company layer entirely. That's four layers of precedence to hold in your head for one feature, and the explicit test plan in `MyToDo.md` (steps 3-8) exists specifically because the interaction between layers is non-obvious even to the person who built it.

This isn't wrong — real product requirements often need this — but it's the shape most likely to grow a fifth layer (e.g. a future per-wine or per-guest-type override) without anyone stepping back to ask whether a small precedence-resolution helper function (single source of truth for "what does this booking's payment requirement resolve to") would be clearer than re-deriving the four-layer logic at each of the several call sites (booking form, wine order form, admin order view) that currently each read the layers themselves.

---

## 11. Open architecture fork: NM's own-domain migration, undecided before a second real client

`MyToDo.md`'s "Pre-onboarding cleanup" section states the plan plainly: *"Nikalas Marani will eventually move to its own standalone deployment; the current multi-tenant SaaS becomes the platform for all other clients. Plan the migration before onboarding a second tenant."* This is listed as not yet planned. It's a genuine fork: whether NM (the reference tenant everything has been built and tested against) stays on the shared platform or moves off changes what "the second tenant" actually tests — right now, a second tenant's first real exercise of most of this architecture (cross-tenant super-admin views, the tenant cache, RLS with 2 real tenants instead of 1) happens either with NM still in the mix or without it, and those are different situations to design for. Worth resolving as a decision before the "Next target: Winery — Prospect" in `Roadmap.md`'s Client Pipeline becomes real, not after.

Related and smaller: `MyToDo.md` also flags multi-tenant emailing as blocked (no owned domain yet for the shared platform sender; Resend currently only delivers to Max's own inbox) and a CSV/data-import tool for a new client's existing bookings/companies/wines as undecided in approach. Neither blocks architecture review, but both are "second tenant" prerequisites sitting in the backlog next to the domain-migration decision — worth bundling into the same planning pass rather than discovering each one separately mid-onboarding.

---

## Summary table

| # | Finding | Severity | Nature |
|---|---|---|---|
| 1 | `prices.ts` skips tenant isolation — real cross-tenant write path | **High — security** | 🟢 **Fixed 2026-08-12** — see `KnownBugs.md` Bug #17 |
| 2 | `tenantId` is an unenforced bare string, 4 tables have no column at all | Medium | Structural, no FK backstop |
| 3 | No shared Dialog/Table primitives → hand-rolled per page | Medium | Grows more expensive to fix over time |
| 4 | No CI, no unit tests | Medium-High | Process gap, compounds with every new feature |
| 5 | Super-admin cross-tenant views unpaginated | Low today, High at ~25+ tenants | Scale ceiling, known threshold |
| 6 | Unbounded in-memory tenant cache, 5-min staleness on all fields incl. module flags | Low | Correctness footgun, self-heals |
| 7 | Inconsistent adoption of the `SiteContent`↔`t()` fallback pattern (not a disconnect between systems) + two duplicate editable-text components | Medium | Recurring bug source, adoption gap not architecture |
| 8 | RLS test suite gives false confidence on 1-tenant DB | Medium | Process risk — green ≠ safe |
| 9 | Admin panel theming diverging from public-site theming | Low now | Retrofit risk if admin theming is ever requested |
| 10 | Payment feature's 4-layer toggle precedence | Low now | Complexity risk as more overrides get added |
| 11 | NM own-domain migration undecided before 2nd real tenant | Planning gap | Should resolve before "Next target" becomes real |

---

## Related

- [[RLS-Architecture]] — the isolation mechanism finding #1 bypasses
- [[MaintenanceNotes]] — §1 (i18n/EditableText duplication), §4 (tenant scoping), §10 (test-rls.ts skip)
- [[MultiTenantSiteContent]] — the content-rendering flow, unaffected by these findings
- [[Plan-Performance]] / [[Perf-Baseline-2026-07-29]] — region-pinning fix; the `withTenantDb` RLS handshake's cost was measured there too
- [[KnownBugs]] — #14, #15, #16, #131 are the concrete symptoms several findings above generalize from
- [[MyToDo.md]] — Pre-onboarding cleanup section, source for finding #11
