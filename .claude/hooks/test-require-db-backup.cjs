#!/usr/bin/env node
/**
 * Tests for require-db-backup.cjs. Pipes PreToolUse JSON into the hook as a separate process, with
 * DB_BACKUP_HOOK_DRY=1 / 'fail' (never a real backup) and DB_BACKUP_ROOT pointing at a throwaway temp folder.
 * Run: node .claude/hooks/test-require-db-backup.cjs     (exit 1 if any case fails)
 */
'use strict'
const { spawnSync } = require('child_process')
const fs = require('fs'), os = require('os'), path = require('path')
const HOOK = path.join(__dirname, 'require-db-backup.cjs')
const PROJ = 'C:\Users\Max\Desktop\claude-projects\georgian-saas\saas'

const W = 'BACKUP', A = 'skip'
const cases = [
  // ---- write commands → backup (dev; + prod when production is mentioned) ----
  [W, 'npx tsx scripts/_qa/restore-dev-gaps.ts --write', 'dev', '--write flag'],
  [W, 'npx tsx scripts/_qa/demo-privacy-fix.ts --db=prod --write', 'dev+prod', '--write on production'],
  [W, 'npx prisma migrate deploy', 'dev', 'migrate deploy'],
  [W, 'npx prisma migrate resolve --applied 20261020150000_visit_type_lunch', 'dev', 'migrate resolve'],
  [W, 'npx prisma db execute --file x.sql', 'dev', 'db execute'],
  [W, 'npm run seed', 'dev', 'npm run seed'],
  [W, 'npx tsx scripts/seed-demo-data.ts', 'dev', 'seed script (writes through lib/demoSeed)'],
  [W, 'npx tsx scripts/set-admin-metadata.ts', 'dev', 'auth write script'],
  [W, 'npx tsx scripts/_qa/copy-prod-tickets-to-staging.ts', 'dev', 'QA script without --write (name says prod, but it only reads prod → dev backup)'],
  [W, 'npx playwright test tests/tier2-core-flows --workers=1', 'dev', 'Playwright run'],
  [W, `psql "$URL" -c "UPDATE \\"Setting\\" SET value='x'"`, 'dev', 'inline SQL UPDATE'],
  [W, `npx tsx -e "await db.$executeRawUnsafe('DELETE FROM \\"Order\\" WHERE id=1')"`, 'dev', 'inline DELETE via tsx -e'],
  [W, `npx tsx -e "await db.$queryRawUnsafe(\\"SELECT setval('x', 200)\\")"`, 'dev', 'setval'],
  // ---- not writes → no backup ----
  [A, 'npx tsx scripts/backup-db.ts --env=dev', null, 'the backup itself'],
  [A, 'npx tsx scripts/backup-verify.ts --latest --env=prod', null, 'verify'],
  [A, 'cd saas && node scripts/clear-next-cache.cjs', null, 'clearing the Next cache is not a database write'],
  [A, 'npx tsx scripts/tix.ts list', null, 'tix'],
  [A, 'npx tsx scripts/audit-money.ts', null, 'read-only audit'],
  [A, 'npx tsx scripts/_qa/verify-audit-b.ts', null, 'QA verify script'],
  [A, 'npx tsx scripts/_qa/debris-facts.ts', null, 'QA facts script'],
  [W, 'npx tsx scripts/_qa/restore-dev-gaps.ts', 'dev', 'QA script without flags counts as a write (safe default)'],
  // ---- 2026-10-21: ticket writes, pushes, Supabase MCP ----
  [W, 'npx tsx scripts/tix.ts comment T-201 "note" --prod --yes-prod', 'prod', 'tix write on production → prod backup'],
  [W, 'npx tsx scripts/tix.ts comment T-21 "QA passes"', 'dev', 'tix comment → dev backup'],
  [W, 'node node_modules/tsx/dist/cli.mjs scripts/tix.ts add "New thing" --type TASK', 'dev', 'tix add (direct tsx cli)'],
  [W, 'npx tsx scripts/tix.ts move T-5 CLOSED --reason OBSOLETE', 'dev', 'tix move'],
  [W, 'npx tsx scripts/tix.ts release add cmabc "Title"', 'dev', 'tix release add'],
  [A, 'npx tsx scripts/tix.ts show T-21', null, 'tix show (read)'],
  [A, 'npx tsx scripts/tix.ts release list', null, 'tix release list (read)'],
  [W, 'git push origin master', 'dev+prod', 'push to master → production backup'],
  [W, 'git checkout master && git merge staging && git push origin master && git checkout staging', 'dev+prod', 'merge + push to master'],
  [W, 'git push origin staging:master', 'dev+prod', 'refspec onto master'],
  [W, 'gh pr merge 12 --merge', 'dev+prod', 'gh pr merge'],
  [W, 'git push -q origin staging', 'dev', 'push to staging → dev backup'],
  [W, 'git push', 'dev', 'bare push on a non-master branch (DB_BACKUP_GIT_BRANCH=staging)'],
  [A, 'git commit -q -m "x" && git log --oneline -1', null, 'commit without push'],
  [W, "git commit -q -F - <<'EOF'\nhook: backs up before git push origin master and gh pr merge\nand tix comment T-1 \"x\"\nEOF\ngit push -q origin staging", 'dev', 'words in a heredoc commit message do not count (2026-10-21 false positive) → only the real push to staging'],
  [A, "git commit -q -F - <<'EOF'\nmentions git push origin master\nEOF", null, 'heredoc mention only, no real push'],
  [A, 'echo "remember: git push origin master later"', null, 'echo text is not a push'],
  [W, 'cd /c/Users/Max/Desktop/claude-projects/georgian-saas && git push origin master', 'dev+prod', 'cd then push to master'],
  [A, 'npx tsx scripts/_qa/post-audit-fixes.ts --dry', null, '--dry'],
  [A, 'npx prisma migrate status', null, 'migrate status'],
  [A, 'npx playwright test --list', null, 'playwright --list'],
  [A, 'git status && git log --oneline -3', null, 'git'],
  [A, `psql "$URL" -c "SELECT count(*) FROM \\"Order\\""`, null, 'read-only SQL'],
]

function run(cmd, env, cwd = PROJ, tool = 'Bash', toolInput = { command: cmd }) {
  const input = JSON.stringify({ session_id: 't', hook_event_name: 'PreToolUse', tool_name: tool, cwd, tool_input: toolInput })
  return spawnSync(process.execPath, [HOOK], { input, encoding: 'utf8', env: { DB_BACKUP_GIT_BRANCH: 'staging', ...process.env, ...env } })
}
let failed = 0
const rows = []
const check = (ok, note) => { if (!ok) failed++; rows.push(`${ok ? 'PASS' : 'FAIL'}  ${note}`) }
for (const [want, cmd, envs, note] of cases) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dbbk-'))
  const r = run(cmd, { DB_BACKUP_HOOK_DRY: '1', DB_BACKUP_ROOT: root })
  const msg = r.stdout || ''
  const got = r.status === 0 && /DB backup before write/.test(msg) ? W : r.status === 0 && !msg ? A : `exit ${r.status} ${msg}${r.stderr}`
  const backedUp = msg.replace(/^.*?\) — /, '') // what follows "DB backup before write (<why>) — "
  const envOk = want !== W || (envs === 'dev+prod' ? /back up dev.*back up prod/.test(backedUp)
    : envs === 'prod' ? /back up prod/.test(backedUp) && !/back up dev/.test(backedUp)
    : /back up dev/.test(backedUp) && !/prod/.test(backedUp))
  check(got === want && envOk, `${want.padEnd(6)} ${note}${got !== want ? `  → got ${got}` : envOk ? '' : `  → envs wrong: ${msg}`}`)
  fs.rmSync(root, { recursive: true, force: true })
}
// bare `git push` while on master → production backup
{ const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dbbk-'))
  const r = run('git push', { DB_BACKUP_HOOK_DRY: '1', DB_BACKUP_ROOT: root, DB_BACKUP_GIT_BRANCH: 'master' })
  check(r.status === 0 && /back up dev.*back up prod/.test(r.stdout), 'BACKUP bare git push while on master → dev + prod')
  fs.rmSync(root, { recursive: true, force: true }) }
// Supabase MCP database tools
for (const [want, tool, ti, envs, note] of [
  [W, 'mcp__supabase__execute_sql', { project_id: 'jpbkkngpgtvqmsocitjx', query: 'UPDATE "Setting" SET value = \'x\' WHERE key = \'y\'' }, 'dev', 'MCP UPDATE on dev'],
  [W, 'mcp__a9e48394-127d-401e-9bf9-f3890b566cb5__apply_migration', { project_id: 'dshsfkffcsgerdqinqst', name: 'x', query: 'ALTER TABLE "Order" ADD COLUMN x int' }, 'prod', 'MCP apply_migration on prod'],
  [W, 'mcp__supabase__execute_sql', { project_id: 'jpbkkngpgtvqmsocitjx', query: "select setval('\"Ticket_number_seq\"', 200)" }, 'dev', 'MCP setval inside a SELECT'],
  [A, 'mcp__supabase__execute_sql', { project_id: 'jpbkkngpgtvqmsocitjx', query: 'select count(*) from "Order"; -- read' }, null, 'MCP read-only SELECT'],
  [A, 'mcp__supabase__execute_sql', { project_id: 'otherprojectref00000', query: 'delete from x' }, null, 'MCP write on another project is not ours'],
]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dbbk-'))
  const r = run('', { DB_BACKUP_HOOK_DRY: '1', DB_BACKUP_ROOT: root }, PROJ, tool, ti)
  const msg = r.stdout || ''
  const ok = want === A ? r.status === 0 && !msg
    : r.status === 0 && (envs === 'prod' ? /back up prod/.test(msg) && !/back up dev/.test(msg) : /back up dev/.test(msg) && !/back up prod/.test(msg))
  check(ok, `${want.padEnd(6)} ${note}${ok ? '' : `  → ${r.status} ${msg}${r.stderr}`}`)
  fs.rmSync(root, { recursive: true, force: true })
}
// outside the project → nothing
{ const r = run('npx prisma migrate deploy', { DB_BACKUP_HOOK_DRY: '1', DB_BACKUP_ROOT: os.tmpdir() }, 'C:\Users\Max\code\daggerheart-muster')
  check(r.status === 0 && !r.stdout, 'skip   other project (daggerheart) is not touched') }
// failed backup → BLOCK
{ const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dbbk-'))
  const r = run('npx tsx scripts/_qa/x.ts --write', { DB_BACKUP_HOOK_DRY: 'fail', DB_BACKUP_ROOT: root })
  check(r.status === 2 && /Rule 0b/.test(r.stderr), 'BLOCK  failed backup blocks the write command')
  fs.rmSync(root, { recursive: true, force: true }) }
// fresh backup → reused, no new backup
{ const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dbbk-'))
  fs.mkdirSync(path.join(root, '2026-10-20_120000_dev_x')); fs.writeFileSync(path.join(root, '2026-10-20_120000_dev_x', 'MANIFEST.json'), '{}')
  const r = run('npx tsx scripts/_qa/x.ts --write', { DB_BACKUP_HOOK_DRY: 'fail', DB_BACKUP_ROOT: root })
  check(r.status === 0 && /recent backup/.test(r.stdout), 'reuse  a backup < 10 min old is kept (no new backup, no block)')
  // unfinished folder (no MANIFEST) does not count as fresh
  const root2 = fs.mkdtempSync(path.join(os.tmpdir(), 'dbbk-'))
  fs.mkdirSync(path.join(root2, '2026-10-20_120000_dev_x'))
  const r2 = run('npx tsx scripts/_qa/x.ts --write', { DB_BACKUP_HOOK_DRY: 'fail', DB_BACKUP_ROOT: root2 })
  check(r2.status === 2, 'BLOCK  an unfinished backup folder (no MANIFEST) is not treated as fresh')
  fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(root2, { recursive: true, force: true }) }

console.log(rows.join('\n'))
console.log(`\n${rows.length - failed}/${rows.length} passed`)
process.exit(failed ? 1 : 0)
