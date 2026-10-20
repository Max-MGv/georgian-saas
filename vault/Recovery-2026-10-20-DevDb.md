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
| R1 | Plumbing: migration history (mark applied), RLS + grants (`setup-rls.ts`), verify vs production | ⬜ |
| R2 | Tenant rows: Staging Winery, dev demo, Test Onboarding Wizard — original ids/slugs/domains | ⬜ |
| R3 | Staging Winery content from production (read-only) + Flitt test merchant | ⬜ |
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

### R1 — Plumbing
- [ ] Read `scripts/setup-rls.ts` fully; confirm it only creates/replaces (no DROP of data).
- [ ] Mark every migration folder as applied (`prisma migrate resolve --applied <name>`, one by one — this only
      writes `_prisma_migrations`). `prisma migrate status` must say up to date and `migrate diff --from-url` must be
      empty (read-only comparison — never a shadow).
- [ ] Run `setup-rls.ts` on dev; compare RLS / policy / grant counts with production (forensics script).
**Resume point:** —

### R2 — Tenant rows
- [ ] `staging-winery` `cmrxb85wo0000vlc0d964nzf8`, domain `staging.vineworks.ge`, name "Staging Winery",
      displayName "Nikalas Marani (Staging)", branding/theme/modules from production NM.
- [ ] `vineworks-demo` `cmtvgl6e60000vl6w9se65t86`, domain `demo.placeholder.local`, displayName "Vineworks Estate"
      (branding per `scripts/rebrand-demo-tenant.ts`).
- [ ] `test-onboarding-wizard` `cmsioproi000avl9czd60ua5h`, domain `test-onboarding-wizard.invalid`, blank (the
      onboarding spec starts from an empty tenant).
**Resume point:** —

### R3 — Staging Winery content
- [ ] Copy from production NM (read-only): Settings, SiteContent, Wines + vintages, MenuItems, MasterclassItems,
      BlockedDates, ContactRoles. Not copied: orders, wine orders, people, addresses, customers (real data).
- [ ] Flitt: `flittMerchantId=1549901`, `flittSecretKey=test`, `modulesOnlinePayment` as before.
**Resume point:** —

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
