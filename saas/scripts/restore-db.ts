/**
 * restore-db.ts — rebuild a database from a backup folder made by backup-db.ts, then PROVE the result is identical.
 *
 * Written 2026-10-21 for the restore drill Max asked for ("how do we test a restore without affecting our prod
 * environment?"). The drill restores into a throwaway PostgreSQL on this laptop; the same script is the emergency tool.
 * Step-by-step guide (drill + real emergency): vault/Restore-Guide.md.
 *
 *   cd saas
 *   npx tsx scripts/restore-db.ts "<backup folder>" --target=postgresql://postgres@127.0.0.1:54329/restore_drill --psql="C:\...\psql.exe"
 *   npx tsx scripts/restore-db.ts "<backup folder>" --target=<url> --psql=<psql> --check-only   (only the comparison)
 *
 * What it does (in order):
 *   0. checks the backup with backup-verify.ts (every sha256 / count) — a damaged backup is never restored;
 *   1. SAFETY: the target's `public` schema must contain NO tables (it never overwrites or deletes anything). The two live
 *      Supabase projects (dev jpbkk…, prod dshsfk…) are refused unless --yes-restore-into=<that exact ref> is given —
 *      only ever on Max's explicit go, into an EMPTIED project, per the guide;
 *   2. creates the roles the grants mention if they are missing (local Postgres only has `postgres`);
 *   3. applies, with psql, exactly the migrations the backup's `_prisma_migrations` table lists — in order, each in a
 *      transaction (ON_ERROR_STOP) — so the schema matches the moment of the backup, not today's code;
 *   4. restores `_prisma_migrations` itself, then every table's rows (json_populate_recordset, foreign-key order, one
 *      transaction), sequences (setval), row-level security flags, policies and grants from schema.json;
 *   5. PROOF: re-exports every table exactly as backup-db.ts does (row_to_json, UTC, PK order) and compares the sha256
 *      with the backup's MANIFEST — byte-identical or it fails — and diffs the schema (columns, constraints, indexes,
 *      enums, RLS, policies) against schema.json.
 * NOT restored by this script: Storage files (they are in <backup>/storage/ — upload them with the guide's step) and
 * auth logins (auth-users.jsonl, re-created through Supabase; passwords are never in a backup).
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { spawnSync } from 'child_process'
import { PrismaClient } from '@prisma/client'

const LIVE_REFS = ['jpbkkngpgtvqmsocitjx', 'dshsfkffcsgerdqinqst']
const SAAS = path.resolve(__dirname, '..')
const arg = (n: string) => { const h = process.argv.slice(2).find(a => a === `--${n}` || a.startsWith(`--${n}=`)); return h === undefined ? undefined : h.includes('=') ? h.slice(h.indexOf('=') + 1) : '' }
const fail = (m: string): never => { console.error(`RESTORE REFUSED/FAILED: ${m}`); process.exit(1) }
const qi = (s: string) => `"${s.replace(/"/g, '""')}"`

type Schema = {
  relations: { relname: string; relkind: string; rls: boolean; force_rls: boolean }[]
  columns: { table_name: string; attnum: number; attname: string; type: string; udt: string; not_null: boolean; default: string | null }[]
  constraints: { table_name: string; conname: string; contype: string; def: string }[]
  indexes: { tablename: string; indexname: string; indexdef: string }[]
  enums: { typname: string; labels: string[] }[]
  sequenceState: { sequence: string; last_value: string | null; is_called: boolean }[]
  policies: { tablename: string; policyname: string; permissive: string; roles: string[] | string; cmd: string; qual: string | null; with_check: string | null }[]
  relationGrants: { relname: string; relkind: string; grantee: string; privilege_type: string }[]
}

async function main() {
  const dir = path.resolve(process.argv.slice(2).find(a => !a.startsWith('--')) || fail('give the backup folder as the first argument'))
  const target = arg('target') || fail('--target=<postgres url> is required')
  const psql = arg('psql') || 'psql'
  const checkOnly = arg('check-only') !== undefined
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'MANIFEST.json'), 'utf8')) as { env: string; createdAt: string; rowCounts: Record<string, number>; files: { path: string; sha256: string }[] }
  const schema = JSON.parse(fs.readFileSync(path.join(dir, 'schema.json'), 'utf8')) as Schema

  // 0. the backup must be intact
  const v = spawnSync(`npx tsx scripts/backup-verify.ts "${dir}"`, { cwd: SAAS, shell: true, encoding: 'utf8' })
  if (v.status !== 0) fail(`backup-verify failed:\n${v.stdout}${v.stderr}`)
  console.log(`0. backup verified: ${dir} (${manifest.env}, ${manifest.createdAt})`)

  // 1. target safety
  const ref = LIVE_REFS.find(r => target.includes(r))
  if (ref && arg('yes-restore-into') !== ref) fail(`target is the live Supabase project ${ref} — only with --yes-restore-into=${ref}, on Max's explicit go (vault/Restore-Guide.md)`)
  const db = new PrismaClient({ datasources: { db: { url: target } } })
  const q = <T = Record<string, unknown>>(sql: string) => db.$queryRawUnsafe<T[]>(sql)
  const existing = (await q<{ n: number }>(`SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'`))[0].n
  if (!checkOnly) {
    if (existing > 0) fail(`target already has ${existing} table(s) in public — restore only ever goes into an EMPTY database`)
    console.log('1. target is empty')

    // 2. roles used by grants/policies (local Postgres has none of Supabase's)
    for (const r of ['app_user', 'anon', 'authenticated', 'service_role']) {
      await db.$executeRawUnsafe(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${r}') THEN CREATE ROLE ${r} NOLOGIN; END IF; END $$`)
    }
    console.log('2. roles present: app_user, anon, authenticated, service_role')

    // 3. exactly the migrations the backup had applied
    const applied = fs.readFileSync(path.join(dir, 'tables', '_prisma_migrations.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as { migration_name: string; finished_at: string | null; rolled_back_at: string | null })
      .filter(m => m.finished_at && !m.rolled_back_at).map(m => m.migration_name).sort()
    for (const name of applied) {
      const file = path.join(SAAS, 'prisma', 'migrations', name, 'migration.sql')
      if (!fs.existsSync(file)) fail(`migration ${name} is in the backup but not in prisma/migrations (check out the matching git commit first)`)
      const r = spawnSync(psql, ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '--single-transaction', '-d', target, '-f', file], { encoding: 'utf8' })
      if (r.status !== 0) fail(`migration ${name}: ${r.stderr || r.stdout}`)
    }
    console.log(`3. applied ${applied.length} migrations (the backup's own list)`)

    // 4. data + sequences + RLS + policies + grants, one transaction
    const cols = schema.columns
    const tables = schema.relations.filter(r => r.relkind === 'r' || r.relkind === 'p').map(r => r.relname)
    const pm = cols.filter(c => c.table_name === '_prisma_migrations').sort((a, b) => a.attnum - b.attnum)
    if (!(await q(`SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='_prisma_migrations'`)).length)
      await db.$executeRawUnsafe(`CREATE TABLE "_prisma_migrations" (${pm.map(c => `${qi(c.attname)} ${c.type}${c.not_null ? ' NOT NULL' : ''}${c.default ? ` DEFAULT ${c.default}` : ''}`).join(', ')}, PRIMARY KEY ("id"))`)
    // foreign-key order: a table goes after every table it references
    const deps = new Map(tables.map(t => [t, new Set<string>()]))
    for (const c of schema.constraints.filter(c => c.contype === 'f')) {
      const m = /REFERENCES "?([^"(]+)"?\(/.exec(c.def); const from = c.table_name.replace(/"/g, '')
      if (m && m[1] !== from && deps.has(from)) deps.get(from)!.add(m[1])
    }
    const order: string[] = []; const seen = new Set<string>()
    const visit = (t: string) => { if (seen.has(t)) return; seen.add(t); for (const d of deps.get(t) || []) if (deps.has(d)) visit(d); order.push(t) }
    tables.forEach(visit)
    await db.$transaction(async tx => {
      for (const t of order) {
        const lines = fs.readFileSync(path.join(dir, 'tables', `${t}.jsonl`), 'utf8').split('\n').filter(Boolean)
        for (let i = 0; i < lines.length; i += 500) {
          await tx.$executeRawUnsafe(`INSERT INTO public.${qi(t)} SELECT * FROM json_populate_recordset(NULL::public.${qi(t)}, $1::json)`, `[${lines.slice(i, i + 500).join(',')}]`)
        }
      }
      for (const s of schema.sequenceState) if (s.last_value != null) await tx.$executeRawUnsafe(`SELECT setval('public.${qi(s.sequence)}', ${Number(s.last_value)}, ${s.is_called})`)
      for (const r of schema.relations.filter(r => r.relkind === 'r')) {
        if (r.rls) await tx.$executeRawUnsafe(`ALTER TABLE public.${qi(r.relname)} ENABLE ROW LEVEL SECURITY`)
        if (r.force_rls) await tx.$executeRawUnsafe(`ALTER TABLE public.${qi(r.relname)} FORCE ROW LEVEL SECURITY`)
      }
      const have = new Set((await tx.$queryRawUnsafe<{ k: string }[]>(`SELECT tablename||'/'||policyname k FROM pg_policies WHERE schemaname='public'`)).map(r => r.k))
      for (const p of schema.policies) {
        if (have.has(`${p.tablename}/${p.policyname}`)) continue
        const roles = (Array.isArray(p.roles) ? p.roles : String(p.roles).replace(/[{}]/g, '').split(',')).map(r => r === 'public' ? 'PUBLIC' : qi(r)).join(', ')
        await tx.$executeRawUnsafe(`CREATE POLICY ${qi(p.policyname)} ON public.${qi(p.tablename)} AS ${p.permissive} FOR ${p.cmd} TO ${roles}${p.qual ? ` USING (${p.qual})` : ''}${p.with_check ? ` WITH CHECK (${p.with_check})` : ''}`)
      }
      // Unique / check constraints the live database has but no migration creates (e.g. production's
      // Setting_key_tenantId_key, added once by scripts/migrate-setting-pk.ts) — re-added by name from schema.json.
      const haveCons = new Set((await tx.$queryRawUnsafe<{ k: string }[]>(`SELECT conrelid::regclass::text||'/'||conname k FROM pg_constraint WHERE connamespace='public'::regnamespace`)).map(r => r.k))
      for (const c of schema.constraints.filter(c => (c.contype === 'u' || c.contype === 'c') && !haveCons.has(`${c.table_name}/${c.conname}`))) {
        // a migration may already have made the same-named unique INDEX — promote it instead of creating a second one
        const idx = c.contype === 'u' && (await tx.$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int n FROM pg_class WHERE relkind='i' AND relnamespace='public'::regnamespace AND relname=$1`, c.conname))[0].n > 0
        await tx.$executeRawUnsafe(`ALTER TABLE public.${c.table_name} ADD CONSTRAINT ${qi(c.conname)} ${idx ? `UNIQUE USING INDEX ${qi(c.conname)}` : c.def}`)
      }
      for (const g of schema.relationGrants.filter(g => ['app_user', 'anon', 'authenticated', 'service_role'].includes(g.grantee))) {
        await tx.$executeRawUnsafe(`GRANT ${g.privilege_type} ON ${g.relkind === 'S' ? 'SEQUENCE' : 'TABLE'} public.${qi(g.relname)} TO ${g.grantee}`)
      }
    }, { timeout: 30 * 60_000, maxWait: 60_000 })
    console.log(`4. restored ${Object.values(manifest.rowCounts).reduce((a, b) => a + b, 0)} rows in ${order.length} tables, sequences, RLS, ${schema.policies.length} policies, grants`)
  }

  // 5. proof — byte-identical data + schema diff
  const problems: string[] = []
  await db.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SET LOCAL TimeZone = 'UTC'`)
    const live = await tx.$queryRawUnsafe<{ t: string; c: string; udt: string }[]>(`SELECT c.relname t, a.attname c, ty.typname udt FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_type ty ON ty.oid=a.atttypid
      WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname, a.attnum`)
    const pks = await tx.$queryRawUnsafe<{ t: string; cols: string[] }[]>(`SELECT c.relname t, array_agg(a.attname ORDER BY array_position(i.indkey::int2[], a.attnum))::text[] cols
      FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum = ANY(i.indkey) WHERE i.indisprimary AND c.relnamespace='public'::regnamespace GROUP BY c.relname`)
    for (const t of Object.keys(manifest.rowCounts)) {
      // Columns in the BACKUP's order: a rebuilt table can hold its columns in a different physical order than the live
      // one (columns added over time), which changes row_to_json's key order but not a single value.
      const backupOrder = schema.columns.filter(c => c.table_name === t).sort((a, b) => a.attnum - b.attnum).map(c => c.attname)
      const missingCols = backupOrder.filter(c => !live.some(x => x.t === t && x.c === c))
      if (missingCols.length) { problems.push(`${t}: columns missing after restore: ${missingCols.join(', ')}`); continue }
      const select = backupOrder.map(c => live.find(x => x.t === t && x.c === c)!).map(x => x.udt === 'int8' || x.udt === 'numeric' ? `${qi(x.c)}::text AS ${qi(x.c)}` : x.udt === '_int8' || x.udt === '_numeric' ? `${qi(x.c)}::text[] AS ${qi(x.c)}` : qi(x.c)).join(', ')
      if (!select) { problems.push(`${t}: table missing`); continue }
      const pk = pks.find(p => p.t === t)?.cols
      const rows = await tx.$queryRawUnsafe<{ j: string }[]>(`SELECT row_to_json(x)::text j FROM (SELECT ${select} FROM public.${qi(t)}${pk?.length ? ` ORDER BY ${pk.map(qi).join(', ')}` : ''}) x`)
      const text = rows.length ? rows.map(r => r.j).join('\n') + '\n' : ''
      const want = manifest.files.find(f => f.path === `tables/${t}.jsonl`)?.sha256
      const got = crypto.createHash('sha256').update(text).digest('hex')
      if (rows.length !== manifest.rowCounts[t]) problems.push(`${t}: ${rows.length} rows, backup has ${manifest.rowCounts[t]}`)
      else if (got !== want) problems.push(`${t}: same row count but content differs (sha256)`)
    }
  }, { timeout: 30 * 60_000 })
  const now = {
    cols: await q<{ k: string }>(`SELECT c.relname||'.'||a.attname||' '||format_type(a.atttypid,a.atttypmod)||CASE WHEN a.attnotnull THEN ' NN' ELSE '' END||' '||coalesce(pg_get_expr(d.adbin,d.adrelid),'') k
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
      WHERE c.relnamespace='public'::regnamespace AND c.relkind IN ('r','p') AND a.attnum>0 AND NOT a.attisdropped`),
    cons: await q<{ k: string }>(`SELECT conrelid::regclass::text||' '||conname||' '||pg_get_constraintdef(oid) k FROM pg_constraint WHERE connamespace='public'::regnamespace`),
    idx: await q<{ k: string }>(`SELECT indexdef k FROM pg_indexes WHERE schemaname='public'`),
    enums: await q<{ k: string }>(`SELECT t.typname||' '||string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) k FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid WHERE t.typnamespace='public'::regnamespace GROUP BY t.typname`),
    rls: await q<{ k: string }>(`SELECT relname||' '||relrowsecurity||' '||relforcerowsecurity k FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind='r'`),
    pol: await q<{ k: string }>(`SELECT tablename||' '||policyname||' '||cmd||' '||coalesce(qual,'')||' '||coalesce(with_check,'') k FROM pg_policies WHERE schemaname='public'`),
  }
  const then = {
    cols: schema.columns.map(c => `${c.table_name}.${c.attname} ${c.type}${c.not_null ? ' NN' : ''} ${c.default ?? ''}`),
    cons: schema.constraints.map(c => `${c.table_name} ${c.conname} ${c.def}`),
    idx: schema.indexes.map(i => i.indexdef),
    enums: schema.enums.map(e => `${e.typname} ${e.labels.join(',')}`),
    rls: schema.relations.filter(r => r.relkind === 'r').map(r => `${r.relname} ${r.rls} ${r.force_rls}`),
    pol: schema.policies.map(p => `${p.tablename} ${p.policyname} ${p.cmd} ${p.qual ?? ''} ${p.with_check ?? ''}`),
  }
  for (const k of Object.keys(then) as (keyof typeof then)[]) {
    const a = new Set(then[k]), b = new Set(now[k].map(r => r.k))
    for (const x of a) if (!b.has(x)) problems.push(`schema ${k}: missing  ${x.slice(0, 160)}`)
    for (const x of b) if (!a.has(x)) problems.push(`schema ${k}: extra    ${x.slice(0, 160)}`)
  }
  await db.$disconnect()
  if (problems.length) { console.log(`5. FAIL — ${problems.length} difference(s):`); problems.slice(0, 60).forEach(p => console.log('   - ' + p)); process.exit(1) }
  console.log(`5. PROOF OK — all ${Object.keys(manifest.rowCounts).length} tables byte-identical to the backup (sha256), schema identical (columns, constraints, indexes, enums, RLS, policies).`)
}
main().catch(e => { console.error('RESTORE FAILED:', e instanceof Error ? e.message : e); process.exit(1) })
