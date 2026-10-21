---
tags: [database, backup, restore, runbook]
---

# Restore Guide — getting a database back from a local backup

> Backups: `C:\Users\Max\Downloads\DB_Backups\`, one folder per backup (`<date>_<time>_<prod|dev>_<reason>`), made
> automatically before every command that changes something (ClaudeInstructions **Rule 0b.6**). This guide is how to
> get data **back** from one. Tools: `saas/scripts/restore-db.ts` (+ `backup-verify.ts`), PostgreSQL 17.6 portable in
> `C:\Users\Max\Tools\postgresql-17.6\pgsql\bin\` (same version as both Supabase projects; no admin rights, no service).
>
> **Last drill: 2026-10-21 — passed** (production backup `2026-10-21_153547_prod_restore-drill-source`, 1,297 rows, 36 tables,
> 24 policies → throwaway local database → every table byte-identical by sha256, schema identical, tenant isolation
> checked as `app_user`; drill data deleted afterwards). Repeat every few months, and after big schema changes.

## What a backup contains — and what it doesn't

| In the backup folder | Restored by |
|---|---|
| `tables/*.jsonl` — every row of every `public` table, incl. `_prisma_migrations` | `restore-db.ts` |
| `schema.json` — columns, constraints, indexes, enums, sequences, RLS, policies, grants | `restore-db.ts` (and its check) |
| `storage/<bucket>/…` — every uploaded file (screenshots, logos, ticket images, release images) — since 2026-10-21 | by hand, step E4 |
| `auth-users.jsonl` — who could log in, with their tenant links (**no passwords**) | by hand, step E5 |
| `MANIFEST.json` — counts + sha256 of every file | `backup-verify.ts` |

Not in any backup: passwords/sessions, Supabase project settings, Vercel environment variables (those live in
`saas/.env*` and Vercel).

## A. The drill (safe — nothing live is touched)

Production and dev are only ever **read** (to make the backup). The restore goes into a new, empty database on this
laptop that is deleted at the end.

```bash
# 1. a fresh backup to test (read-only)
cd saas && npx tsx scripts/backup-db.ts --env=prod --reason=restore-drill

# 2. a throwaway PostgreSQL (port 54329, this machine only, no password)
PG=/c/Users/Max/Tools/postgresql-17.6/pgsql/bin; D=/c/Users/Max/Tools/pg-restore-drill
$PG/initdb.exe -D "$D/data" -U postgres --auth=trust -E UTF8 --locale=C
$PG/pg_ctl.exe -D "$D/data" -o "-p 54329 -c listen_addresses=127.0.0.1" -l "$D/server.log" start   # returns after "server started"
$PG/psql.exe -X -h 127.0.0.1 -p 54329 -U postgres -c "CREATE DATABASE restore_drill"

# 3. restore + proof (prints "5. PROOF OK" or the exact differences)
npx tsx scripts/restore-db.ts "C:/Users/Max/Downloads/DB_Backups/<folder>" \
  --target="postgresql://postgres@127.0.0.1:54329/restore_drill" --psql="C:/Users/Max/Tools/postgresql-17.6/pgsql/bin/psql.exe"

# 4. tear down — the drill database holds a copy of customer data
$PG/pg_ctl.exe -D "$D/data" -m fast stop && rm -rf "$D"
```

Optional extra check (tenant isolation, as the app sees it): `psql … -d restore_drill`, then
`BEGIN; SELECT set_config('app.tenant_id','<tenant id>',true); SET LOCAL ROLE app_user; SELECT count(*) FROM "Order"; ROLLBACK;`
→ only that tenant's rows; any other id → 0.

**Lessons from the first drill (2026-10-21):**
- A rebuilt table can hold its columns in a different physical order than production (production gained columns over
  time). Values are identical; the app is unaffected (Prisma uses names). `restore-db.ts` compares in the backup's order.
- Production has a UNIQUE constraint `Setting_key_tenantId_key` that no migration creates (it came from
  `scripts/migrate-setting-pk.ts`). `restore-db.ts` re-adds such constraints from `schema.json`.
- **App-level checks need the code that matches the backup.** Today's `staging` code expects columns production
  does not have yet (pricing-model migrations), so it cannot run against a production copy. For a production restore,
  run/deploy `master`.

## B. A real emergency (data lost on dev or production)

**Rule 0b.5 first:** stop, check read-only what is left, tell Max. Nothing below runs without **Max's explicit go for
that step** (Rule 0) — especially anything that writes to production.

- **E1. Pick the backup:** newest folder of that env from **before** the damage (the folder name says what command it was
  taken for). `npx tsx scripts/backup-verify.ts "<folder>"` must say OK. **First take a fresh backup of the damaged
  database too** (`backup-db.ts --env=…`) — never lose the "after" state.
- **E2. Practise on this laptop first:** run section A with that exact backup. Only continue if it prints PROOF OK.
- **E3. Restore into the real project.** `restore-db.ts` only ever writes into a database whose `public` schema has **no
  tables**, and refuses the live projects unless given `--yes-restore-into=<project ref>` (dev `jpbkkngpgtvqmsocitjx`,
  production `dshsfkffcsgerdqinqst`). So the damaged schema must be emptied first — that is a destructive step the
  safety lock blocks on purpose: **Max runs it himself** in his own terminal, after E1's fresh backup. Then, with the
  code checked out at the backup's version (`master` for production):
  `npx tsx scripts/restore-db.ts "<folder>" --target="<DIRECT_URL of that project>" --psql=… --yes-restore-into=<ref>`
  → must end with PROOF OK.
- **E4. Files:** upload `<folder>/storage/<bucket>/…` back into the same bucket and path (Supabase dashboard → Storage,
  or a small script using the service key). Buckets themselves are listed in `schema.json → storageBuckets`.
- **E5. Logins:** compare `auth-users.jsonl` with Supabase → Authentication. Users that survived keep working (their
  `app_metadata` links to tenant ids, which the restore keeps). Missing users are re-invited; passwords are never backed up.
- **E6. Check the site** like after a release: home, booking form, wine orders, admin orders/companies, a test booking
  on staging. Record everything in a `vault/Recovery-<date>.md`.

## C. Accepted risks (Max, 2026-10-21)

- **No scheduled backups.** Backups run only before commands that change something; the live site's own writes
  (customers booking) are not backed up until the next such command. Supabase Pro / a nightly job were declined for now.
- **One copy, on this laptop only** (`Downloads\DB_Backups`). If the laptop is lost, the backups are too. An encrypted
  off-machine copy was declined for now.
- Not seen by the automatic backup: writes through the app's own pages, other HTTP calls, Max's own terminal — run
  `cd saas && npx tsx scripts/backup-db.ts --env=dev|prod --reason=<what>` by hand before those.
