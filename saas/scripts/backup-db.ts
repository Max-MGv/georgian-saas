/**
 * backup-db.ts — READ-ONLY logical backup of one Supabase database (public schema data + rebuild metadata).
 *
 * Written after the 2026-10-20 dev-DB wipe (vault/Recovery-2026-10-20-DevDb.md). Both Supabase projects are on the
 * Free plan, which has NO backups — this script is the stop-gap.
 *
 *   cd saas
 *   npx tsx scripts/backup-db.ts --env=prod --reason=before-demo-fix   # production (ref dshsfkffcsgerdqinqst, .env.prod.backup)
 *   npx tsx scripts/backup-db.ts --env=dev                             # dev/staging (ref jpbkkngpgtvqmsocitjx, .env)
 *   npx tsx scripts/backup-db.ts --env=prod --out=D:\somewhere\folder
 *   npx tsx scripts/backup-verify.ts <folder>          # or: --latest --env=prod
 *
 * Default output: one folder PER BACKUP under C:\Users\<you>\Downloads\DB_Backups\ (Max's choice, 2026-10-20), named
 *   <YYYY-MM-DD_HHmmss>_<env>[_<reason>]      e.g. 2026-10-20_221530_dev_staging-identity-scrub
 * so backups sort by time and can be deleted one at a time. Override the root with env DB_BACKUP_ROOT. The script
 * refuses any --out inside the repo, and refuses a non-empty target folder.
 * The PreToolUse hook .claude/hooks/require-db-backup.cjs runs this script automatically before commands that write
 * to a database (vault/ClaudeInstructions.md Rule 0b) — keep the folder naming in sync with that hook.
 *
 * SAFETY
 * - The connection URL must belong to the expected Supabase project ref (and must not contain the other one) —
 *   otherwise the script stops before connecting.
 * - Everything runs in ONE transaction opened with `SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY`:
 *   Postgres itself refuses any write, and every table is read from the same consistent snapshot. The script checks
 *   `transaction_read_only = on` before reading anything.
 * - The only statements are SELECT / DECLARE CURSOR / FETCH / CLOSE / SET LOCAL TimeZone. Nothing is changed.
 * - Output contains CUSTOMER DATA (production). Never commit it, never share it. Nothing is printed except counts.
 *
 * WHAT IS WRITTEN
 * - tables/<Table>.jsonl   one JSON object per row for every table in `public` (incl. _prisma_migrations), produced
 *                          by Postgres' row_to_json: timestamps ISO-8601 (session TimeZone=UTC; Prisma's
 *                          `timestamp(3)` columns have no zone suffix and hold UTC), json/jsonb as JSON, arrays as
 *                          arrays, booleans/ints as JSON values, NULL as null, bytea as "\\x…" hex. bigint and numeric
 *                          columns are written as STRINGS (lossless; JS numbers cannot hold them exactly). Rows are
 *                          ordered by primary key so two backups diff cleanly.
 * - schema.json            schema owner + ACL, relations (owner, RLS flags, ACL), columns (type, default, nullability,
 *                          identity), constraints, indexes, enums, sequences (+ last_value/is_called, owned-by),
 *                          policies, exploded table/sequence grants, column grants, default privileges, views,
 *                          functions, triggers, extensions, storage buckets.
 * - storage-objects.jsonl  storage.objects metadata (bucket, name, size, created_at).
 * - storage/<bucket>/<name> every Storage FILE itself (screenshots, logos, ticket attachments, release images), fetched
 *                          after the database snapshot with the project's service key (plain GET, read-only). Since
 *                          2026-10-21 (Max: "uploaded files included in every backup"). Each file's size must equal
 *                          its metadata size; a missing or short file fails the backup.
 * - auth-users.jsonl       auth.users identity columns only (id, email, phone, app_metadata incl. tenant links,
 *                          user_metadata, timestamps) — NO password hashes or tokens. Enough to re-link admins.
 * - auth-summary.json      auth.users count.
 * - README.txt, MANIFEST.json (env, timestamps, row counts, file sizes, sha256 per file).
 *
 * NOT covered: passwords/sessions in auth.*, Supabase project settings, Vercel env. A restore is a
 * manual, reviewed process (rebuild schema from migrations, compare against schema.json, load the jsonl files).
 *
 * SCHEDULING — decided 2026-10-21 (Max): NO schedule and no Supabase Pro; backups run only before commands that change
 * something (hook), kept locally only. Accepted risks in vault/Restore-Guide.md §C. If that changes, two options:
 *  a) Windows Task Scheduler on this PC (runs only while the PC is on), e.g. daily 03:00, in cmd.exe:
 *       schtasks /Create /SC DAILY /ST 03:00 /TN "georgian-saas prod backup" /TR ^
 *         "cmd /c cd /d C:\Users\Max\Desktop\claude-projects\georgian-saas\saas && npx tsx scripts/backup-db.ts --env=prod --reason=daily >> C:\Users\Max\Downloads\DB_Backups\backup.log 2>&1 && npx tsx scripts/backup-verify.ts --latest --env=prod >> C:\Users\Max\Downloads\DB_Backups\backup.log 2>&1"
 *     Remove with: schtasks /Delete /TN "georgian-saas prod backup"
 *     Add retention (e.g. keep 30 folders) and an off-machine copy (encrypted cloud folder) — not done here.
 *  b) A scheduled CI job (e.g. GitHub Actions cron) with the production URL as a repository secret, uploading the
 *     folder to private, encrypted storage. Keeps working when the PC is off, but puts customer data in CI.
 *  Supabase Pro (daily backups, optional PITR) is the managed alternative and also covers auth + storage metadata.
 */
import * as dotenv from 'dotenv'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { PrismaClient } from '@prisma/client'

type EnvName = 'prod' | 'dev'
const ENVS: Record<EnvName, { file: string; ref: string }> = {
  prod: { file: '.env.prod.backup', ref: 'dshsfkffcsgerdqinqst' },
  dev: { file: '.env', ref: 'jpbkkngpgtvqmsocitjx' },
}
const SAAS_DIR = path.resolve(__dirname, '..')
export const BACKUP_ROOT = process.env.DB_BACKUP_ROOT || path.join(os.homedir(), 'Downloads', 'DB_Backups')
const REPO_DIR = path.resolve(SAAS_DIR, '..')

function arg(name: string): string | undefined {
  const hit = process.argv.slice(2).find(a => a === `--${name}` || a.startsWith(`--${name}=`))
  if (!hit) return undefined
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : ''
}
function fail(msg: string): never {
  console.error(`REFUSED: ${msg}`)
  process.exit(1)
}
const pad = (n: number) => String(n).padStart(2, '0')
function stamp(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}
const qi = (s: string) => `"${s.replace(/"/g, '""')}"`

/** Load the env file and return the URL to use, after asserting it belongs to the expected project. */
export function resolveUrl(env: EnvName): string {
  const cfg = ENVS[env]
  const other = Object.values(ENVS).find(e => e.ref !== cfg.ref)!.ref
  const file = path.join(SAAS_DIR, cfg.file)
  if (!fs.existsSync(file)) fail(`${cfg.file} not found`)
  const vars = dotenv.parse(fs.readFileSync(file))
  // DIRECT_URL = Supavisor session mode (plain Postgres semantics; cursors fine). Fall back to DATABASE_URL.
  const url = vars.DIRECT_URL || vars.DATABASE_URL
  if (!url) fail(`${cfg.file} has no DIRECT_URL / DATABASE_URL`)
  for (const [k, v] of Object.entries({ DIRECT_URL: vars.DIRECT_URL, DATABASE_URL: vars.DATABASE_URL })) {
    if (!v) continue
    let u: URL
    try { u = new URL(v) } catch { fail(`${k} in ${cfg.file} is not a URL`) }
    const owns = u.username === `postgres.${cfg.ref}` || u.hostname.includes(cfg.ref)
    if (!owns) fail(`${k} in ${cfg.file} does not belong to project ${cfg.ref} (--env=${env})`)
    if (v.includes(other)) fail(`${k} in ${cfg.file} mentions the other project ref ${other}`)
  }
  return url
}

/** Storage API base + service key for env, asserting the URL belongs to that project. */
function storageCreds(env: EnvName): { base: string; key: string } {
  const cfg = ENVS[env]
  const vars = dotenv.parse(fs.readFileSync(path.join(SAAS_DIR, cfg.file)))
  const base = (vars.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '')
  const key = vars.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!base || !key) fail(`${cfg.file} has no NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (needed to back up Storage files)`)
  if (!new URL(base).hostname.startsWith(`${cfg.ref}.`)) fail(`NEXT_PUBLIC_SUPABASE_URL in ${cfg.file} does not belong to project ${cfg.ref}`)
  return { base, key }
}

/** One README at the root explaining the layout (written once, never overwritten). */
function writeRootReadme() {
  fs.mkdirSync(BACKUP_ROOT, { recursive: true })
  const f = path.join(BACKUP_ROOT, 'README.txt')
  if (fs.existsSync(f)) return
  fs.writeFileSync(f, [
    'georgian-saas database backups (saas/scripts/backup-db.ts). The _prod_ folders hold REAL CUSTOMER DATA - never share or upload them.',
    '',
    'One folder = one complete, independent backup:  <YYYY-MM-DD_HHmmss>_<env>[_<reason>]',
    '  env    = prod (production, Supabase dshsfkffcsgerdqinqst) or dev (localhost + staging, Supabase jpbkkngpgtvqmsocitjx)',
    '  reason = what was about to run (the automatic backup names the command that triggered it).',
    'Delete old folders one at a time (oldest first) whenever you like; keep at least the newest one of each env.',
    'Check a folder:  cd saas && npx tsx scripts/backup-verify.ts "<folder>"',
    'Made automatically before database-writing commands by .claude/hooks/require-db-backup.cjs (vault/ClaudeInstructions.md Rule 0b).',
    '',
  ].join('\r\n'))
}

async function sha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256')
    fs.createReadStream(file).on('data', d => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject)
  })
}

async function main() {
  const envArg = arg('env')
  if (envArg !== 'prod' && envArg !== 'dev') fail('pass --env=prod or --env=dev')
  const env = envArg as EnvName
  const url = resolveUrl(env)

  const startedAt = new Date()
  const reason = (arg('reason') || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  const outDir = path.resolve(arg('out') || path.join(BACKUP_ROOT, `${stamp(startedAt)}_${env}${reason ? `_${reason}` : ''}`))
  if (!arg('out')) writeRootReadme()
  const rel = path.relative(REPO_DIR, outDir)
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) fail(`output folder ${outDir} is inside the repo — customer data must not land in git`)
  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length) fail(`output folder ${outDir} already exists and is not empty`)
  fs.mkdirSync(path.join(outDir, 'tables'), { recursive: true })

  fs.writeFileSync(path.join(outDir, 'README.txt'), [
    'WARNING — THIS FOLDER CONTAINS A DATABASE BACKUP' + (env === 'prod' ? ' WITH REAL CUSTOMER DATA (production).' : ' (dev/staging database).'),
    'Do NOT commit it to git, upload it to shared drives, attach it to tickets or e-mails, or share it with anyone.',
    'Keep it on encrypted storage. Delete old copies you no longer need.',
    '',
    `Environment: ${env} (Supabase project ${ENVS[env].ref})`,
    `Created: ${startedAt.toISOString()} by saas/scripts/backup-db.ts (read-only, one REPEATABLE READ snapshot)`,
    `Reason: ${arg('reason') || '(none given)'}`,
    'Check integrity: cd saas && npx tsx scripts/backup-verify.ts "<this folder>"',
    'Contents: tables/*.jsonl (one JSON row per line; bigint/numeric as strings), schema.json (rebuild metadata),',
    'storage-objects.jsonl (file metadata), storage/ (the files), auth-users.jsonl (logins, no passwords), MANIFEST.json (counts + sha256).',
    '',
  ].join('\r\n'))

  const db = new PrismaClient({ datasources: { db: { url } } })
  const rowCounts: Record<string, number> = {}
  let authUsersCount = -1
  let storageObjectsCount = 0
  let snapshotInfo: Record<string, unknown> = {}
  try {
    await db.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY')
      const ro = await tx.$queryRawUnsafe<{ ro: string; iso: string }[]>(
        `SELECT current_setting('transaction_read_only') ro, current_setting('transaction_isolation') iso`)
      if (ro[0]?.ro !== 'on' || ro[0]?.iso !== 'repeatable read') throw new Error('transaction is not READ ONLY / REPEATABLE READ — aborting')
      await tx.$executeRawUnsafe(`SET LOCAL TimeZone = 'UTC'`)

      /** Run a query and return its rows as parsed JSON (Postgres does the serialisation — no driver type quirks). */
      const jq = async <T = Record<string, unknown>>(sql: string): Promise<T[]> => {
        const r = await tx.$queryRawUnsafe<{ j: string }[]>(`SELECT coalesce(json_agg(x), '[]')::text j FROM (${sql}) x`)
        return JSON.parse(r[0].j)
      }

      snapshotInfo = (await jq(`SELECT current_database() db, current_user usr, now() server_time,
        current_setting('server_version') server_version, current_setting('transaction_read_only') read_only,
        current_setting('transaction_isolation') isolation`))[0]

      // ---------- schema metadata ----------
      const PUB = `(SELECT oid FROM pg_namespace WHERE nspname='public')`
      const schema = {
        schema: await jq(`SELECT nspname, pg_get_userbyid(nspowner) owner, nspacl::text acl FROM pg_namespace WHERE nspname='public'`),
        relations: await jq(`SELECT c.relname, c.relkind, pg_get_userbyid(c.relowner) owner, c.relrowsecurity rls,
            c.relforcerowsecurity force_rls, c.relacl::text acl
          FROM pg_class c WHERE c.relnamespace=${PUB} AND c.relkind IN ('r','p','v','m','S','f') ORDER BY c.relkind, c.relname`),
        columns: await jq(`SELECT c.relname table_name, a.attnum, a.attname, format_type(a.atttypid, a.atttypmod) type,
            t.typname udt, a.attnotnull not_null, pg_get_expr(d.adbin, d.adrelid) "default", a.attidentity identity,
            a.attgenerated generated, a.attacl::text acl
          FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_type t ON t.oid=a.atttypid
          LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
          WHERE c.relnamespace=${PUB} AND c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped
          ORDER BY c.relname, a.attnum`),
        constraints: await jq(`SELECT conrelid::regclass::text table_name, conname, contype, pg_get_constraintdef(oid) def
          FROM pg_constraint WHERE connamespace=${PUB} ORDER BY 1, 2`),
        indexes: await jq(`SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY 1, 2`),
        enums: await jq(`SELECT t.typname, pg_get_userbyid(t.typowner) owner, json_agg(e.enumlabel ORDER BY e.enumsortorder) labels
          FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid WHERE t.typnamespace=${PUB} GROUP BY t.typname, t.typowner ORDER BY 1`),
        sequences: await jq(`SELECT sequencename, sequenceowner, data_type::text, start_value::text, min_value::text,
            max_value::text, increment_by::text, cycle, cache_size::text, last_value::text
          FROM pg_sequences WHERE schemaname='public' ORDER BY 1`),
        sequenceOwnedBy: await jq(`SELECT s.relname sequence, t.relname table_name, a.attname column_name, d.deptype
          FROM pg_depend d JOIN pg_class s ON s.oid=d.objid AND s.relkind='S'
          JOIN pg_class t ON t.oid=d.refobjid JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid
          WHERE s.relnamespace=${PUB} AND d.deptype IN ('a','i') ORDER BY 1`),
        sequenceState: [] as unknown[],
        policies: await jq(`SELECT * FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname`),
        relationGrants: await jq(`SELECT c.relname, c.relkind,
            CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END grantee,
            pg_get_userbyid(a.grantor) grantor, a.privilege_type, a.is_grantable
          FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
          WHERE c.relnamespace=${PUB} AND c.relkind IN ('r','p','v','m','S','f') ORDER BY 1, 3, 5`),
        defaultPrivileges: await jq(`SELECT pg_get_userbyid(d.defaclrole) role, n.nspname schema, d.defaclobjtype objtype,
            d.defaclacl::text acl FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace ORDER BY 2, 1, 3`),
        views: await jq(`SELECT viewname, viewowner, definition FROM pg_views WHERE schemaname='public' ORDER BY 1`),
        functions: await jq(`SELECT p.proname, pg_get_function_identity_arguments(p.oid) args, pg_get_userbyid(p.proowner) owner,
            p.proacl::text acl, pg_get_functiondef(p.oid) def
          FROM pg_proc p WHERE p.pronamespace=${PUB} AND p.prokind IN ('f','p') ORDER BY 1, 2`),
        triggers: await jq(`SELECT tgrelid::regclass::text table_name, tgname, pg_get_triggerdef(oid) def
          FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace=${PUB}) ORDER BY 1, 2`),
        extensions: await jq(`SELECT e.extname, e.extversion, n.nspname schema FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace ORDER BY 1`),
        storageBuckets: await jq(`SELECT id, name, public, file_size_limit, allowed_mime_types, created_at FROM storage.buckets ORDER BY id`),
      }
      for (const s of schema.sequences as { sequencename: string }[]) {
        schema.sequenceState.push({ sequence: s.sequencename,
          ...(await jq(`SELECT last_value::text, is_called FROM public.${qi(s.sequencename)}`))[0] })
      }
      fs.writeFileSync(path.join(outDir, 'schema.json'), JSON.stringify(schema, null, 2))

      // ---------- table data ----------
      const tables = (schema.relations as { relname: string; relkind: string }[]).filter(r => r.relkind === 'r' || r.relkind === 'p').map(r => r.relname)
      const cols = schema.columns as { table_name: string; attname: string; udt: string }[]
      const pks = await jq<{ table_name: string; cols: string[] }>(`SELECT c.relname table_name,
          json_agg(a.attname ORDER BY array_position(i.indkey::int2[], a.attnum)) cols
        FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum = ANY(i.indkey)
        WHERE i.indisprimary AND c.relnamespace=${PUB} GROUP BY c.relname`)
      for (const t of tables) {
        const select = cols.filter(c => c.table_name === t).map(c => {
          if (c.udt === 'int8' || c.udt === 'numeric') return `${qi(c.attname)}::text AS ${qi(c.attname)}`
          if (c.udt === '_int8' || c.udt === '_numeric') return `${qi(c.attname)}::text[] AS ${qi(c.attname)}`
          return qi(c.attname)
        }).join(', ')
        const pk = pks.find(p => p.table_name === t)?.cols
        const order = pk?.length ? ` ORDER BY ${pk.map(qi).join(', ')}` : ''
        const file = path.join(outDir, 'tables', `${t}.jsonl`)
        fs.writeFileSync(file, '')
        await tx.$executeRawUnsafe(`DECLARE bk_cur NO SCROLL CURSOR FOR SELECT row_to_json(x)::text j FROM (SELECT ${select} FROM public.${qi(t)}${order}) x`)
        let n = 0
        for (;;) {
          const batch = await tx.$queryRawUnsafe<{ j: string }[]>('FETCH FORWARD 2000 FROM bk_cur')
          if (!batch.length) break
          fs.appendFileSync(file, batch.map(b => b.j).join('\n') + '\n')
          n += batch.length
        }
        await tx.$executeRawUnsafe('CLOSE bk_cur')
        const expected = Number((await jq<{ n: number }>(`SELECT count(*)::int n FROM public.${qi(t)}`))[0].n)
        if (expected !== n) throw new Error(`${t}: wrote ${n} rows but count(*) says ${expected}`)
        rowCounts[t] = n
      }

      // ---------- storage metadata + auth count ----------
      const objs = await tx.$queryRawUnsafe<{ j: string }[]>(`SELECT row_to_json(x)::text j FROM (
        SELECT bucket_id, name, (metadata->>'size')::bigint AS size, created_at FROM storage.objects ORDER BY bucket_id, name) x`)
      fs.writeFileSync(path.join(outDir, 'storage-objects.jsonl'), objs.map(o => o.j).join('\n') + (objs.length ? '\n' : ''))
      storageObjectsCount = objs.length
      const users = await tx.$queryRawUnsafe<{ j: string }[]>(`SELECT row_to_json(x)::text j FROM (
        SELECT id, email, phone, role, raw_app_meta_data AS app_metadata, raw_user_meta_data AS user_metadata,
               email_confirmed_at, last_sign_in_at, created_at, updated_at, banned_until, deleted_at, is_sso_user
        FROM auth.users ORDER BY created_at, id) x`)
      fs.writeFileSync(path.join(outDir, 'auth-users.jsonl'), users.map(u => u.j).join('\n') + (users.length ? '\n' : ''))
      authUsersCount = Number((await jq<{ n: number }>(`SELECT count(*)::int n FROM auth.users`))[0].n)
      if (authUsersCount !== users.length) throw new Error(`auth.users: wrote ${users.length} rows but count(*) says ${authUsersCount}`)
      fs.writeFileSync(path.join(outDir, 'auth-summary.json'), JSON.stringify({ authUsersCount }, null, 2))
    }, { timeout: 60 * 60_000, maxWait: 60_000 })
  } finally {
    await db.$disconnect()
  }

  // ---------- storage files (after the snapshot; plain authenticated GETs, nothing is changed) ----------
  const { base, key } = storageCreds(env)
  type Obj = { bucket_id: string; name: string; size: number | null; created_at: string }
  const readObjs = (dir: string): Obj[] => fs.readFileSync(path.join(dir, 'storage-objects.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
  const objects = readObjs(outDir)
  // Storage files almost never change, and a backup runs before every write — so a file identical to the previous
  // finished backup of this env (same bucket/name/size/created_at) is HARD-LINKED to that copy instead of downloaded
  // again: every folder still holds the complete file (deleting any one folder never affects another), but the disk
  // stores it once. Falls back to a download if linking fails (e.g. a different drive).
  const prevDir = arg('out') ? null : fs.readdirSync(BACKUP_ROOT).filter(d => new RegExp(`^\\d{4}-\\d{2}-\\d{2}_\\d{6}_${env}(_|$)`).test(d))
    .map(d => path.join(BACKUP_ROOT, d)).filter(d => d !== outDir && fs.existsSync(path.join(d, 'MANIFEST.json')) && fs.existsSync(path.join(d, 'storage')))
    .sort().at(-1) ?? null
  const prev = new Map(prevDir ? readObjs(prevDir).map(o => [`${o.bucket_id}/${o.name}`, o]) : [])
  let storageFilesBytes = 0, storageFilesLinked = 0
  for (const o of objects) {
    const rel = path.join('storage', o.bucket_id, ...o.name.split('/'))
    if (path.relative(path.join(outDir, 'storage'), path.join(outDir, rel)).startsWith('..')) throw new Error(`unsafe storage path ${o.bucket_id}/${o.name}`)
    fs.mkdirSync(path.dirname(path.join(outDir, rel)), { recursive: true })
    const p = prev.get(`${o.bucket_id}/${o.name}`)
    const prevFile = prevDir ? path.join(prevDir, rel) : ''
    if (p && p.size === o.size && p.created_at === o.created_at && fs.existsSync(prevFile) && (o.size == null || fs.statSync(prevFile).size === Number(o.size))) {
      try { fs.linkSync(prevFile, path.join(outDir, rel)); storageFilesBytes += fs.statSync(prevFile).size; storageFilesLinked++; continue } catch { /* download instead */ }
    }
    const res = await fetch(`${base}/storage/v1/object/${o.bucket_id}/${o.name.split('/').map(encodeURIComponent).join('/')}`,
      { headers: { Authorization: `Bearer ${key}`, apikey: key } })
    if (!res.ok) throw new Error(`storage ${o.bucket_id}/${o.name}: HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    if (o.size != null && buf.length !== Number(o.size)) throw new Error(`storage ${o.bucket_id}/${o.name}: got ${buf.length} bytes, metadata says ${o.size}`)
    fs.writeFileSync(path.join(outDir, rel), buf)
    storageFilesBytes += buf.length
  }

  // ---------- manifest ----------
  const files: { path: string; bytes: number; sha256: string }[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name !== 'MANIFEST.json') files.push({ path: path.relative(outDir, p).split(path.sep).join('/'), bytes: fs.statSync(p).size, sha256: '' })
    }
  }
  walk(outDir)
  for (const f of files) f.sha256 = await sha256(path.join(outDir, f.path))
  const manifest = {
    env, projectRef: ENVS[env].ref, reason: arg('reason') || null, tool: 'saas/scripts/backup-db.ts', formatVersion: 3,
    createdAt: startedAt.toISOString(), finishedAt: new Date().toISOString(),
    snapshot: snapshotInfo,
    encoding: 'tables/*.jsonl: one row_to_json object per line, TimeZone=UTC, bigint/numeric as strings, ordered by primary key',
    rowCounts, totalRows: Object.values(rowCounts).reduce((a, b) => a + b, 0),
    storageObjectsCount, storageFilesCount: objects.length, storageFilesBytes, storageFilesLinked, storageFilesLinkedFrom: prevDir ? path.basename(prevDir) : null, authUsersCount, files,
  }
  fs.writeFileSync(path.join(outDir, 'MANIFEST.json'), JSON.stringify(manifest, null, 2))

  console.log(`Backup of ${env} written to: ${outDir}`)
  console.log(`Tables: ${Object.keys(rowCounts).length}, rows: ${manifest.totalRows}, storage files: ${objects.length} (${storageFilesBytes} bytes, ${storageFilesLinked} unchanged - hard-linked to the previous backup), auth users: ${authUsersCount}`)
  for (const [t, n] of Object.entries(rowCounts)) console.log(`  ${t.padEnd(28)} ${n}`)
  console.log(`Files: ${files.length}, ${files.reduce((a, f) => a + f.bytes, 0)} bytes. Next: npx tsx scripts/backup-verify.ts "${outDir}"`)
}

if (require.main === module) main().catch(e => { console.error('BACKUP FAILED:', e instanceof Error ? e.message : e); process.exit(1) })
