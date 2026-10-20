---
tags: [incident, recovery, database, active]
---

# Recovery — dev database wiped (2026-10-20)

> **Safety over speed (Max).** Chunks are strictly sequential; each ends with a **Resume point**. Every write
> goes to the **dev** database only (`jpbkkngpgtvqmsocitjx`), and every script asserts that before writing.
> **Production (`dshsfkffcsgerdqinqst`) is only ever READ**, inside `SET TRANSACTION READ ONLY`. Nothing here
> runs `migrate reset`, `db push --force-reset`, `DROP`/`TRUNCATE`, or gives any URL to a "shadow" option
> (ClaudeInstructions **Rule 0b**). Production config (Vercel env) is a separate step that needs Max's go.

## 1. What happened

During Plan-PricingModel Chunk 6, `prisma migrate diff --from-migrations … --shadow-database-url <DEV URL>` was
run. Prisma treats a shadow database as disposable: it **reset the real dev database** and replayed every
migration folder into it. Result: all 35 public tables empty, part of the RLS/grant setup gone, Prisma's
`_prisma_migrations` table gone. Full lessons: ClaudeInstructions Rule 0b.

## 2. State found (read-only forensics, 2026-10-20)

| | Dev now | Production (reference) |
|---|---|---|
| Rows in public tables | **0 everywhere** | normal |
| Tables with RLS on / policies / `app_user` grants | 12 / 3 / 12 | 36 / 24 / 97 |
| `_prisma_migrations` | missing | 36 rows |
| `supabase_migrations` (Supabase's own) | intact | intact |
| `auth.users` | **3 — intact** (staging admin → `cmrxb85wo…`, super-admin, demo admin → `cmtvgl6e…`) | — |
| Storage | **intact**: bug-report-screenshots 22, release-images 12, ticket-attachments 15 | — |
| Schema | matches the code, **incl. the not-yet-committed Chunk 6 enum value `LUNCH`** (the replay applied every folder) | — |

**Backups:** none. Both Supabase projects are on the **Free plan — "Free Plan does not include project backups"**,
no point-in-time recovery, no restore-to-new-project (checked in the dashboard 2026-10-20). ⚠️ **Production has no
backups either** — decision for Max, separate from this recovery.

**Broken until recovered:** staging.vineworks.ge + localhost (no tenant for the host); `tix` against staging
(its token was a DB row); production → staging P-ticket copying (production's forward token was a dev-DB row —
production itself is unaffected, it records the copy failure on the ticket).

## 3. Sources

| What | Source |
|---|---|
| Tenant ids / slugs / domains | `vault/MigrationNotes.md` §tenant table, `credentials.txt`, auth `app_metadata` |
| Branding, theme, modules | production Nikalas Marani tenant row (read-only) |
| Settings, SiteContent, wines/vintages, menu, masterclass, blocked dates, contact roles | production NM (read-only) — the old clone scripts are **outdated** (they read production through today's Prisma client, which now expects the new pricing columns), so a fresh raw-SQL script is used |
| Staging Flitt credentials | Flitt's public test merchant `1549901` / `test` (`vault/Plan-PaymentE2ETesting.md` Ground Rule 1) |
| Companies, orders, demo data | `lib/demoSeed.ts` (`scripts/seed-demo-data.ts`, `--tenant=staging-winery` for staging), `scripts/backfill-test-fixtures.ts` |
| RLS / grants | `scripts/setup-rls.ts` |
| Tickets | **Max may have another source.** Fallback: 30 Claude transcripts (`tix show` text for 23 tickets, original `add` text for 8, titles/status for all), `vault/Tickets.md` (11 exports in git), the plans; P-tickets re-copied from production |
| Release-note drafts | 94 `tix release` commands in 2 transcripts + the 12 images still in storage |

**Lost for good:** ticket comments/timelines not captured in a transcript; staging-only content edits (replaced by
production's current content); staging bug-report rows (their screenshots survive).

## 4. Chunks

| # | What | Status |
|---|---|---|
| R0 | Tracker + incident record + read-only snapshot of dev | ✅ 2026-10-20 |
| R1 | Plumbing: migration history (mark applied), RLS + grants (`setup-rls.ts`), verify vs production | ✅ 2026-10-20 |
| R2 | Tenant rows: Staging Winery, dev demo, Test Onboarding Wizard — original ids/slugs/domains | ✅ 2026-10-20 |
| R3 | Staging Winery content from production (read-only) + Flitt test merchant | ✅ 2026-10-20 |
| R4 | Data: demo seed on staging + demo tenants, test fixtures | ✅ 2026-10-20 |
| R5 | Ticket tool: new staging token (credentials.txt) + production's copy token re-registered | ✅ 2026-10-20 |
| R6 | Tickets (Max's source, else transcripts), THEN P-tickets re-copied, + release drafts | ⬜ (waits for Max) |
| R7 | Verification: logins, staging site, admin screens, RLS/money/pricing scripts, screenshots | ✅ 2026-10-20 |
| R8 | ~~Production forward token → Vercel env~~ — **not needed**, solved on dev in R5 | ✅ 2026-10-20 |

### R0 — Tracker + snapshot ✅
- [x] This file; Rule 0b in ClaudeInstructions (`94a3f45`); memory pointer.
- [x] Forensics scripts (untracked): `saas/scripts/_qa/db-forensics.ts` (dev vs prod metadata), `db-forensics2.ts`
      (auth → tenant mapping, storage prefixes), `dev-counts.ts`.
**Resume point:** done.

### R1 — Plumbing ✅ 2026-10-20
- [x] `setup-rls.ts` read in full: grants, `ENABLE ROW LEVEL SECURITY`, `DROP POLICY IF EXISTS` + `CREATE POLICY` —
      policies only, never data.
- [x] Read-only check first: `prisma migrate diff --from-url <dev> --to-schema-datamodel` → **empty** (schema = code,
      incl. the Chunk 6 `LUNCH` value). `prisma migrate resolve --help` read (Rule 0b): `--applied` only records.
- [x] `prisma migrate resolve --applied` × **39/39** → `prisma migrate status`: "Database schema is up to date!"
- [x] `setup-rls.ts` via `scripts/_qa/run-setup-rls-dev.ts` (refuses anything but dev): 24 policies.
- [x] Production's `lock_platform_tables_rls` (read from production's `supabase_migrations`, read-only) re-applied on
      dev via `scripts/_qa/platform-lock-dev.ts`: RLS on `Tenant`, `PlatformConfig`, `_prisma_migrations`; REST roles
      revoked. (Dev's own July `rls_setup_and_platform_lock` entry is the early version of `setup-rls.ts`.)
- [x] Per-table comparison (`scripts/_qa/db-forensics3.ts`): every table now has the same RLS state and policy as
      production. **Only difference, kept on purpose:** production also grants `anon`/`authenticated` (Supabase's
      default REST roles) on tenant tables; dev's replay created them without — stricter, and the app never uses
      those roles for tables (it connects as `postgres` → `app_user`).
**Resume point:** done.

### R2 — Tenant rows ✅ 2026-10-20
Script: `saas/scripts/_qa/recover-dev.ts --phase=tenants [--write]` (untracked) — dry run by default, asserts dev as
target and production as read-only source, compares column lists first, skips anything that exists (re-run = no-op,
verified). First write attempt failed atomically (a JSON value bound as text) → inserts now cast each value to its
column type; nothing had been written.
- [x] `staging-winery` `cmrxb85wo0000vlc0d964nzf8`, `staging.vineworks.ge`, "Nikalas Marani (Staging)" — branding,
      theme, modules copied from production NM; Flitt **test merchant** `1549901`/`test`, online payment on.
- [x] `vineworks-demo` `cmtvgl6e60000vl6w9se65t86`, `demo.placeholder.local` — copied from **production's demo tenant**
      (`cmtvi582n…`, already scrubbed of NM's identity — better than re-cloning NM + `rebrand-demo-tenant.ts`).
- [x] `test-onboarding-wizard` `cmsioproi000avl9czd60ua5h`, `test-onboarding-wizard.invalid` — blank, as the onboarding
      spec expects.
**Resume point:** done.

### R3 — Content ✅ 2026-10-20
`recover-dev.ts --phase=content --write` (new ids; wines re-linked to their vintages):
| Tenant | ContactRole | Setting | SiteContent | Wines (+vintages) | BlockedDate |
|---|---|---|---|---|---|
| staging-winery (from production NM) | 2 | 41 | 71 | 7 (+9) | 0 |
| vineworks-demo (from production demo) | 2 | 36 | 72 | 6 (+8) | 0 |
| test-onboarding-wizard | 2 (from NM) | — | — | — | — |
Menu / masterclass items not copied — the demo seed replaces them. Re-run check: all "0 new".
**Resume point:** done.

### R4 — Data ✅ 2026-10-20
Wrapper `saas/scripts/_qa/seed-dev.ts` (untracked) — refuses anything but dev and refuses `--prod`; dry run first.
- [x] Dev demo (`vineworks-demo`): 10 companies, 388 bookings, 45 wine orders, 6 menu items, 4 masterclass items.
- [x] Staging Winery (`--tenant=staging-winery`): same shape, plus access codes / guides / representatives (the seed
      adds them for non-demo tenants). `backfill-test-fixtures.ts --dry-run`: **0** codes / guides / reps to add.
- Note (cosmetic, pre-existing): the seed CLI's summary prints tetri labelled "GEL" ("lifetime revenue 24,198,900
  GEL" = ₾241,989 ≈ ₾624/booking — realistic). Data is right; only the printout's unit label is wrong.
**Resume point:** done.

### R5 — Ticket tool ✅ 2026-10-20
- [x] New staging token `claude-dev` (scope full) created on dev and written straight into `credentials.txt`
      (`TICKETS_TOKEN_DEV`, never printed; the file was backed up to the scratchpad first). A first attempt's
      plaintext was lost between bash and Python temp paths → that token (`claude-dev-2026-10-20`) was **revoked**.
      `tix list` against staging works (0 tickets).
- [x] **Production's copy-to-staging token re-registered on dev** from its plaintext in `credentials.txt`
      (`scripts/_qa/restore-forward-token.ts`, scope forward) → production's Vercel setting works again **unchanged**.
      Auth-only probe (empty body → 400 "prodNumber must be a ticket number", creates nothing) confirms it is accepted.
- [ ] P-tickets are NOT re-copied yet: ticket numbers are unique, and a copy now would take numbers 1–14 and collide
      with restored T-1…T-14 — they go after R6's restore.
**Resume point:** done.

### R6 — Tickets + releases (waits for Max's source)
**Resume point:** —

### R7 — Verification ✅ 2026-10-20
- [x] DB: `check-rls` 36/36 tables green · `test-rls` **21/21** · `test-price-rls` **10/10** · `test-order-repricing`
      **6/6** · `test-pricing-model` **54/54** · `audit-money` clean (776 orders, 0 without frozen rates).
- [x] Routing: localhost → Staging Winery; `Host: test-onboarding-wizard.invalid` → `test-onboarding-wizard`;
      `Host: demo.placeholder.local` → `vineworks-demo`; **staging.vineworks.ge** live → "Nikalas Marani (Staging) — Book
      a Visit".
- [x] Logins: staging admin (screenshot run) and super-admin (`/super-admin/tenants`, `/tickets`, `/releases` all load —
      `saas/tests/_qa/recovery-superadmin.spec.ts`).
- [x] Prices: screenshot text vs the pre-wipe `chunk4` run — **every price line identical** (home ₾280, detailed
      company 4/6/2 ₾720, New Order ₾720 on the same 11–30 tier, order detail). Other text differs as expected (content
      is today's production NM copy; orders freshly seeded). Two real localhost bookings: individual 10 → ₾600, company
      4/6/2 + masterclass → ₾755 — same as before the wipe.
- [x] **One staging deviation restored:** production NM hides the company dropdown (`hide_company_dropdown=true`);
      staging had it visible (`false` — playwright/notes/05) → set on dev (`scripts/_qa/staging-dropdown.ts`). The
      other documented staging resting values already matched after the copy: online payment on, Individuals ✓,
      **Companies ✗ (deliberate)**, Wine orders ✓ (KNOWN-ISSUES), `show_company_price_after_booking=false`,
      enhanced booking on.
- Note: my QA screenshot script opened the booking sheet before the Orders page finished hydrating (388 orders now)
  → it now retries; a QA-script timing issue, not the app. Server log: only the pre-existing dev-mode hydration
  warnings about the date input's inline style.
- Dev now: 3 tenants, 20 companies, 776 orders, 90 wine orders, 13 wines, 75 settings, 143 site-content rows.
  Tickets / releases / bug reports: 0 (R6).
**Resume point:** done.

**Note for every later Playwright run:** the staging tenant now holds 388 seeded orders (as before the wipe) and NM's
*current* production content/settings. If a spec fails on wording, compare with production NM's texts before
suspecting code.

### R8 — Production forward token (Max's go)
**Resume point:** —

## 4b. Blind review (2026-10-20) — findings, each verified read-only by `saas/scripts/_qa/verify-review.ts`

A context-free reviewer (no vault, no git history, no transcripts, strictly read-only) confirmed the mechanism and
that data/RLS/migrations are consistent, and found what R1 missed:
- **The reset was `DROP SCHEMA public CASCADE` + re-create.** Besides rows it lost the schema's Supabase defaults:
  owner is now `postgres` (production `pg_database_owner`), the schema ACL lacks `PUBLIC`/`anon`/`authenticated`/
  `service_role`, **0 default-privilege entries** (production 6), **0 tables granted to `service_role`** (production
  36). R1 called the missing anon/authenticated grants "stricter, keep" — **that was wrong in one important way**:
  dev no longer reproduces production's automatic grant on new tables, so a migration that forgets its `REVOKE`
  would look safe on dev and be exposed on production. → restore to match production (needs Max's go).
- `Ticket_number_seq` never called → if tickets are restored with their numbers, move the sequence past the max.
- The uncommitted migration `20261020150000_visit_type_lunch` is recorded as applied with its current checksum →
  never edit/rename it; changes go in a new migration (else Prisma reports drift and offers a reset).
- Production has a UNIQUE **constraint** `Setting_key_tenantId_key` that no migration creates (dev: unique index
  only) — pre-existing drift.
- `onboarding_launched_at` / `onboarding_works_with_companies` absent on staging — the demo seed deletes them by design
  (`lib/demoSeed.ts:917`); decide whether staging should carry them.
- Biggest risk overall: **production has no backups**. Prevention idea: a Claude Code PreToolUse hook that blocks
  `--shadow-database-url`, `migrate dev/reset`, `db push`, `--force-reset` against any `supabase.co` URL.

## 5. Paused work

`vault/Plan-PricingModel.md` **Chunk 6 is paused mid-way** (uncommitted on `staging`): `lib/settings.ts`,
`app/admin/(panel)/settings/page.tsx` + `SettingsClient.tsx`, `lib/adminT.ts` (company minimum settings + labels),
`prisma/schema.prisma` (enum `LUNCH`) and `prisma/migrations/20261020150000_visit_type_lunch/` — **already applied to
dev by the reset's replay**, so R1 marks it applied with the others. `prisma generate` and the `LUNCH` type fallout
are still to do when Chunk 6 resumes.

## 6. Safeguards (implemented 2026-10-20)

Max approved exactly four steps. Production was only read (every query inside `SET TRANSACTION READ ONLY`); the only
dev writes were the GRANT / ALTER statements of step 4, after the dev backup and a printed before-diff.

### Step 1 — Production backup ✅
- `saas/scripts/backup-db.ts --env=prod|dev [--out=<dir>]` (committed): one `REPEATABLE READ, READ ONLY` snapshot;
  asserts the project ref in both URLs (and refuses the other ref); refuses an output folder inside the repo or a
  non-empty one. Writes `tables/<T>.jsonl` (row_to_json, UTC, bigint/numeric as strings, PK order), `schema.json`
  (owner/ACL, columns, constraints, indexes, enums, sequences + state, RLS, policies, grants, default privileges,
  functions, triggers, buckets), `storage-objects.jsonl` (metadata only), `auth-summary.json` (count only),
  `README.txt` (customer-data warning), `MANIFEST.json` (counts, sizes, sha256). Default folder
  `C:\Users\Max\Backups\georgian-saas\<YYYY-MM-DD_HHmm>\<env>\`. Header documents how to schedule it (Task Scheduler
  or CI) — **nothing scheduled**; Max decides between that and Supabase Pro.
- `saas/scripts/backup-verify.ts <folder> | --latest --env=…` (committed): offline sha256 + size + row-count check.
- **Production backup `2026-10-20_1256\prod`: verifier OK** — 36 tables, 1,297 rows, 40 files (1.1 MB), 9 storage
  objects, 3 auth users. Order 395, WineOrder 50, WineOrderItem 114, Company 13, Ticket 14, Setting 77, SiteContent 143,
  _prisma_migrations 36.

### Step 2 — Safety lock (Claude Code hook) ✅ (active from the next session)
- `.claude/settings.json` → PreToolUse, matcher `Bash|PowerShell`, `node "$CLAUDE_PROJECT_DIR/.claude/hooks/block-destructive-db.cjs"`,
  `onFailure: block` (a broken hook blocks shell calls rather than letting them through). `settings.local.json` untouched.
- Blocks (exit 2, stderr names Rule 0b): `--shadow-database-url`, `shadowDatabaseUrl`, `prisma migrate reset`,
  `prisma db push`, `--force-reset`, `--accept-data-loss`, `prisma migrate dev` without `--create-only` (per command
  segment), `DROP SCHEMA`, `TRUNCATE`, `DROP DATABASE` — case-insensitive, also across line continuations / quoting.
- Test: `node .claude/hooks/test-block-destructive-db.cjs` → **35/35 pass** (23 blocked incl. the incident command,
  3 PowerShell-tool payloads and unparseable stdin; 12 allowed incl. migrate deploy/status/resolve, `migrate diff
  --from-url … --to-schema-datamodel`, `migrate dev --create-only`, generate, git, tix, a non-shell payload). The
  configured command was also run through bash from another cwd: allow → 0, block → 2.
- **Not live in the session that created it** (a harmless `echo` with a blocked word ran through) — project
  settings load at session start. Limits: a script file that runs these statements internally, an npm alias, or an MCP
  database tool (e.g. Supabase `execute_sql`) is not inspected; the word "truncate" in a commit message or grep is a
  false positive (use `git commit -F <file>`).

### Step 3 — Dev backup ✅
`2026-10-20_1258\dev`: verifier OK — 36 tables, 2,314 rows, 49 storage objects, 3 auth users.

### Step 4 — Dev `public` schema defaults restored to match production ✅ (except what Postgres refuses)
Tools (untracked, `saas/scripts/_qa/`): `schema-defaults-diff.ts` (read-only diff; `--plan=` writes SQL, simulating the
owner-change ACL rewrite), `apply-schema-defaults-dev.ts` (dev ref only, whitelisted statement shapes only, requires
today's dev backup, one transaction), `role-check.ts`, `priv-check.ts` (read-only).
- **Before:** owner `postgres` vs `pg_database_owner`; schema ACL 3 vs 8 entries (missing PUBLIC/anon/authenticated/
  service_role/postgres USAGE); default privileges 0 vs 6 rows (24 role/objtype/grantee groups); relation grants 390 vs
  1,037 entries — 88 table/sequence grants missing (service_role on all 36 tables, anon+authenticated on the 26 tables
  plus `_prisma_migrations` and `Ticket_number_seq` where production has them). 115 differing items.
- Role facts (read-only, both DBs identical): `postgres` is not superuser, owns the database, is a member of
  `pg_database_owner`, is **not** a member of `supabase_admin`.
- **Applied on dev, one transaction: 101 of 113 statements** (1 `ALTER SCHEMA public OWNER TO pg_database_owner`,
  5 schema USAGE grants, 12 `ALTER DEFAULT PRIVILEGES FOR ROLE postgres …`, 83 table/sequence grants).
  **12 refused by Postgres** — `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin …` ("permission denied to change
  default privileges"); run behind a savepoint, not worked around.
- **After:** owner, schema ACL, the 3 `postgres` default-privilege rows and every per-table/per-sequence grant match.
  **Remaining (13):** the 3 `supabase_admin` default-privilege rows (12 groups) — only affect objects created by
  `supabase_admin` (not our migrations, which run as `postgres`); fixing them needs Supabase support/superuser.
  And `app_user` SELECT/USAGE on `Ticket_number_seq` exists on dev only — left alone (instruction: do not revoke app_user).
- Checks after: `db-forensics3.ts` — all 36 tables identical to production (RLS, policy, anon/app_user/authenticated
  grants). `verify-review.ts` — owner `pg_database_owner` both, same ACL set, default-privs 3 vs 6 (the supabase_admin
  rows), tables granted to service_role 36 = 36. `postgres` still has CREATE on `public` (via pg_database_owner, as on
  production); app_user unchanged. localhost and staging.vineworks.ge home → HTTP 200.
- Note: R1's line "anon/authenticated missing — stricter, keep" is superseded: dev now reproduces production's grants
  **and** production's automatic grant on new tables, so a migration that forgets its REVOKE behaves the same on dev.

## 7. Second blind review (2026-10-20) — verified findings

A fresh context-free reviewer checked the safeguards and the situation. Verified by me (read-only):
- **Backups:** both verify; a test backup of dev matched live counts exactly; one REPEATABLE READ + READ ONLY
  snapshot; types faithful. Gaps: **never restore-tested** (no restore script); storage FILES and auth users not
  included; JSON `null` vs SQL NULL indistinguishable; the in-repo path guard (`backup-db.ts:120`) accepts a sibling
  folder named `..something`; single unencrypted copy on this PC.
- **Hook: NOT protecting sessions started outside the project folder** — verified: a harmless `echo` containing
  "TRUNCATE" ran unblocked in this session (started from the user's home folder, so the project
  `.claude/settings.json` never loaded). Claude Code CLI is **2.1.251**; reviewer reports (from the docs, not verified
  by me) that `onFailure` needs 2.1.295 or later. Bypasses it found (payloads only, nothing executed):
  `prisma@<version> …`, `node node_modules/prisma/build/index.js …`, `--from-migrations` / `--to-migrations` without
  the shadow flag (a `shadowDatabaseUrl` added to `prisma.config.ts` by an Edit/Write would repeat the incident),
  `DROP TABLE`, `DELETE FROM`, `supabase db reset`, a fake `# --create-only`, PowerShell string-building, and **MCP
  database tools are not covered at all**. False positives: `truncate` is a Tailwind class used in 10 files.
- **Dev vs production:** identical except the 3 `supabase_admin` default-privilege rows (only Supabase can create
  them), the harmless extra `app_user` grant on `Ticket_number_seq`, and realtime-schema platform drift. Pre-existing:
  production's `Setting_key_tenantId_key` UNIQUE constraint comes from `scripts/migrate-setting-pk.ts:51`, not a
  migration; 15 checksum differences are CRLF vs LF only.
- **Claim checked and NOT confirmed:** "live payment credentials on staging" — staging uses Flitt's public test
  merchant (`1549901`, secret `test`). Real NM banking/ID **settings** are on dev, as they were before the wipe (the
  original clone copied them too).
- **Real gap:** `test-onboarding-wizard` has 0 settings / 0 companies; `playwright/notes/10-onboarding-wizard.md`
  needs `enable_enhanced_company_booking=true` (+ the Individuals company, which the page creates) → the onboarding
  spec would fail.
- **The reviewer's own slip (it disclosed it):** it ran one disallowed read-type command (`migrate diff --from-url
  <prod> --to-migrations …`, no shadow URL) and re-snapshotted both databases: byte-identical before and after. The
  hook did not stop it (same reason as above). Its scratch dev backup (in the temp folder `blind-review-2/backup-test`)
  contains staging settings incl. the copied banking fields — to delete.

## 8. Blind review 3 (outside-auditor style) — PAUSED 2026-10-20 ~19:05 at Max's request (PC off)

Three independent auditors, fenced off from this file / memory / recovery scripts. **A (data) and C (processes) finished; B (behaviour / Playwright) was stopped mid-way** and its local processes killed (dev server :3000, Playwright). Nothing was fixed yet — every fix below needs Max's go.

**Verified by me (read-only):**
- A: staging lost its staging-only settings `booking_lead_split=true` and `person_codes_enabled=true` (copy came from production, which has neither) · Rkatsiteli lost `nameKa` (რქაწითელი) and is active again (was inactive since 10-07) · Khikhvi new on staging · wizard tenant bare (no theme `cream`, wine orders + online payment modules off, 0 settings, no Individuals company) · 1 masterclass item gone (9→8) · release drafts rebuildable via `saas/scripts/_qa/_seed_oct_releases.ts` + `saas/release-shots/oct7/`.
- C: dev lacks 3 `supabase_admin` default-ACL entries prod has (my "matches production" was too strong) · `Plan-DevProdEnvironments.md` daily workflow (`migrate dev`) is now blocked by the hook · prod's one forwarded ticket points at a staging copy that no longer exists · LUNCH migration recorded on dev but uncommitted · hook gaps (may not load from `C:\Users\Max`, ~9 bypasses, no MCP coverage) · staging holds NM's real contact/IBAN/personal-number (pre-existing since ≤ 2026-09-10, not a regression).

**B partial results (raw, not yet triaged):** tier 1: 6 passed / 5 failed (payment-amount-integrity, 2× popover-clipping, theme-colors) · tier 2: 19 / 5 failed (booking-enhanced, booking-simple, company-nationality-tagging, contact-role-picker, wine-catalogue-order) · tier 3: 13 / 5 failed / 3 not run (admin-orders, companies-crud, tickets:44, wine-order-delivery-fee:144, onboarding-wizard). Tier 4 + page walk not done. Logs: `C:\Users\Max\AppData\Local\Temp\claude\audit-B\` (t1/t2/t3.log, out-* traces).

**Side effects of B's run (state now, read-only check 19:05):**
- `tickets.spec.ts` created **T-1..T-8** (closed "ZZ Tickets E2E" debris) — `Ticket_number_seq` = 8. Must `setval` past 152 before anything else files a ticket (Max's go).
- Staging Winery `paymentEnabledIndividuals = false` — documented resting value is **true** (KNOWN-ISSUES: interrupted payment spec). Restore on Max's go.
- `person_codes_enabled` now exists on staging as `'false'` (written by contact-role-picker spec).
- Wizard tenant: onboarding-wizard spec was killed mid-run — tenant state undefined (only that spec uses it).

**Resume:** (1) Max's go on: setval ticket seq · restore Individuals payment toggle · decide on T-1..T-8 debris. (2) Resume B (tier 3 reruns minus tickets.spec, tier 4, page walk) — restart dev server + `rm -rf saas/.next` first; never run ticket-creating specs until the seq is moved. (3) Merge A+B+C into one prioritised fix list for Max.
