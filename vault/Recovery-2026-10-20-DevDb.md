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
| R4 | Data: demo seed on staging + demo tenants, test fixtures | ⬜ |
| R5 | Ticket tool: new staging token (credentials.txt); P-tickets re-copied from production | ⬜ |
| R6 | Tickets (Max's source, else transcripts) + release drafts | ⬜ (waits for Max) |
| R7 | Verification: logins, staging site, admin screens, RLS/money/pricing scripts, screenshots | ⬜ |
| R8 | Production forward token → Vercel production env (**Max's go**) | ⬜ |

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

### R4 — Data
- [ ] `seed-demo-data.ts` for the dev demo tenant and `--tenant=staging-winery`; `backfill-test-fixtures.ts`.
**Resume point:** —

### R5 — Ticket tool
- [ ] `ticket-token.ts create` on dev → `TICKETS_TOKEN_DEV` in credentials.txt; re-copy P-1…P-14 from production
      (`scripts/_qa/copy-prod-tickets-to-staging.ts`, reads production only).
**Resume point:** —

### R6 — Tickets + releases (waits for Max's source)
**Resume point:** —

### R7 — Verification
**Resume point:** —

### R8 — Production forward token (Max's go)
**Resume point:** —

## 5. Paused work

`vault/Plan-PricingModel.md` **Chunk 6 is paused mid-way** (uncommitted on `staging`): `lib/settings.ts`,
`app/admin/(panel)/settings/page.tsx` + `SettingsClient.tsx`, `lib/adminT.ts` (company minimum settings + labels),
`prisma/schema.prisma` (enum `LUNCH`) and `prisma/migrations/20261020150000_visit_type_lunch/` — **already applied to
dev by the reset's replay**, so R1 marks it applied with the others. `prisma generate` and the `LUNCH` type fallout
are still to do when Chunk 6 resumes.
