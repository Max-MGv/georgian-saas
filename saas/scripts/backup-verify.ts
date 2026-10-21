/**
 * backup-verify.ts — offline integrity check of a folder written by scripts/backup-db.ts. Never connects to a database.
 *
 *   cd saas
 *   npx tsx scripts/backup-verify.ts "C:\Users\Max\Downloads\DB_Backups\2026-10-20_221530_prod_daily"
 *   npx tsx scripts/backup-verify.ts --latest --env=prod      # newest <stamp>_prod… folder under the backup root
 *
 * Checks: MANIFEST.json present; every listed file exists with the listed size and sha256; no unlisted files;
 * every table in rowCounts has tables/<Table>.jsonl whose line count equals the count and whose every line parses
 * as a JSON object; storage-objects.jsonl line count = storageObjectsCount; auth-summary.json matches.
 * Prints counts only (never row contents). Exit code 0 = OK, 1 = any problem.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import readline from 'readline'

const args = process.argv.slice(2)
const flag = (n: string) => args.find(a => a.startsWith(`--${n}=`))?.split('=')[1] ?? (args.includes(`--${n}`) ? '' : undefined)

function pickFolder(): string {
  if (flag('latest') !== undefined) {
    const env = flag('env')
    if (env !== 'prod' && env !== 'dev') { console.error('with --latest pass --env=prod or --env=dev'); process.exit(1) }
    // Same root + naming as backup-db.ts: one folder per backup, <YYYY-MM-DD_HHmmss>_<env>[_<reason>].
    const root = process.env.DB_BACKUP_ROOT || path.join(os.homedir(), 'Downloads', 'DB_Backups')
    const all = fs.existsSync(root) ? fs.readdirSync(root).filter(d => new RegExp(`^\\d{4}-\\d{2}-\\d{2}_\\d{4,6}_${env}(_|$)`).test(d)).sort() : []
    if (!all.length) { console.error(`no ${env} backup found under ${root}`); process.exit(1) }
    const newest = all[all.length - 1]
    // Say so when the newest folder is incomplete instead of silently verifying an older one.
    if (!fs.existsSync(path.join(root, newest, 'MANIFEST.json'))) { console.error(`newest ${env} backup ${newest} has no MANIFEST.json — it did not finish`); process.exit(1) }
    return path.join(root, newest)
  }
  const dir = args.find(a => !a.startsWith('--'))
  if (!dir) { console.error('usage: backup-verify.ts <folder> | --latest --env=prod|dev'); process.exit(1) }
  return path.resolve(dir)
}

const sha256 = (file: string) => new Promise<string>((res, rej) => {
  const h = crypto.createHash('sha256')
  fs.createReadStream(file).on('data', d => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej)
})

async function jsonlLines(file: string): Promise<{ lines: number; bad: number }> {
  let lines = 0, bad = 0
  const rl = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity })
  for await (const line of rl) {
    if (line === '') continue
    lines++
    try { const v = JSON.parse(line); if (v === null || typeof v !== 'object' || Array.isArray(v)) bad++ } catch { bad++ }
  }
  return { lines, bad }
}

async function main() {
  const dir = pickFolder()
  const problems: string[] = []
  const mPath = path.join(dir, 'MANIFEST.json')
  if (!fs.existsSync(mPath)) { console.error(`FAIL: no MANIFEST.json in ${dir}`); process.exit(1) }
  const m = JSON.parse(fs.readFileSync(mPath, 'utf8')) as {
    env: string; projectRef: string; createdAt: string; rowCounts: Record<string, number>; totalRows: number
    storageObjectsCount: number; storageFilesCount?: number; formatVersion?: number; authUsersCount: number; files: { path: string; bytes: number; sha256: string }[]
  }

  // 1. files: presence, size, hash
  const listed = new Set(m.files.map(f => f.path))
  for (const f of m.files) {
    const p = path.join(dir, f.path)
    if (!fs.existsSync(p)) { problems.push(`missing file ${f.path}`); continue }
    const size = fs.statSync(p).size
    if (size !== f.bytes) problems.push(`${f.path}: size ${size} ≠ manifest ${f.bytes}`)
    const h = await sha256(p)
    if (h !== f.sha256) problems.push(`${f.path}: sha256 mismatch`)
  }
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(path.join(d, e.name)) : [path.relative(dir, path.join(d, e.name)).split(path.sep).join('/')])
  for (const f of walk(dir)) if (f !== 'MANIFEST.json' && !listed.has(f)) problems.push(`unlisted file ${f}`)

  // 2. row counts per table
  let total = 0
  for (const [t, n] of Object.entries(m.rowCounts)) {
    const rel = `tables/${t}.jsonl`
    if (!listed.has(rel) || !fs.existsSync(path.join(dir, rel))) { problems.push(`no data file for table ${t}`); continue }
    const { lines, bad } = await jsonlLines(path.join(dir, rel))
    if (lines !== n) problems.push(`${t}: ${lines} lines ≠ manifest ${n}`)
    if (bad) problems.push(`${t}: ${bad} lines are not JSON objects`)
    total += lines
  }
  for (const f of listed) if (f.startsWith('tables/') && !(f.slice(7, -6) in m.rowCounts)) problems.push(`${f} not in rowCounts`)
  if (total !== m.totalRows) problems.push(`total rows ${total} ≠ manifest ${m.totalRows}`)

  // 3. storage metadata + auth count
  if (fs.existsSync(path.join(dir, 'storage-objects.jsonl'))) {
    const s = await jsonlLines(path.join(dir, 'storage-objects.jsonl'))
    if (s.lines !== m.storageObjectsCount) problems.push(`storage-objects: ${s.lines} ≠ manifest ${m.storageObjectsCount}`)
    if (s.bad) problems.push(`storage-objects: ${s.bad} bad lines`)
  } else problems.push('missing storage-objects.jsonl')
  try {
    const a = JSON.parse(fs.readFileSync(path.join(dir, 'auth-summary.json'), 'utf8'))
    if (a.authUsersCount !== m.authUsersCount) problems.push('auth-summary.json ≠ manifest')
  } catch { problems.push('auth-summary.json unreadable') }
  if ((m.formatVersion ?? 1) >= 2) {
    if (fs.existsSync(path.join(dir, 'auth-users.jsonl'))) {
      const u = await jsonlLines(path.join(dir, 'auth-users.jsonl'))
      if (u.lines !== m.authUsersCount) problems.push(`auth-users: ${u.lines} ≠ manifest ${m.authUsersCount}`)
      if (u.bad) problems.push(`auth-users: ${u.bad} bad lines`)
    } else problems.push('missing auth-users.jsonl')
  }
  // 4. Storage files (format 3+): one file per storage-objects line, same size as its metadata
  if ((m.formatVersion ?? 1) >= 3 && fs.existsSync(path.join(dir, 'storage-objects.jsonl'))) {
    const objs = fs.readFileSync(path.join(dir, 'storage-objects.jsonl'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as { bucket_id: string; name: string; size: number | null })
    let found = 0
    for (const o of objs) {
      const f = path.join(dir, 'storage', o.bucket_id, ...o.name.split('/'))
      if (!fs.existsSync(f)) { problems.push(`missing storage file ${o.bucket_id}/${o.name}`); continue }
      if (o.size != null && fs.statSync(f).size !== Number(o.size)) problems.push(`storage file ${o.bucket_id}/${o.name}: size ≠ metadata`)
      found++
    }
    if (m.storageFilesCount != null && found !== m.storageFilesCount) problems.push(`storage files: ${found} ≠ manifest ${m.storageFilesCount}`)
  }
  try { JSON.parse(fs.readFileSync(path.join(dir, 'schema.json'), 'utf8')) } catch { problems.push('schema.json unreadable') }

  console.log(`Backup: ${dir}`)
  console.log(`env=${m.env} ref=${m.projectRef} created=${m.createdAt}`)
  console.log(`files=${m.files.length} tables=${Object.keys(m.rowCounts).length} rows=${total} storageObjects=${m.storageObjectsCount}${m.storageFilesCount != null ? ` storageFiles=${m.storageFilesCount}` : ''} authUsers=${m.authUsersCount}`)
  if (problems.length) {
    console.log(`FAIL — ${problems.length} problem(s):`)
    for (const p of problems) console.log(`  - ${p}`)
    process.exit(1)
  }
  console.log('OK — every sha256, size and row count matches the manifest.')
}
main().catch(e => { console.error('VERIFY FAILED:', e instanceof Error ? e.message : e); process.exit(1) })
