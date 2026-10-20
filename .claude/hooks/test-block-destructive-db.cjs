#!/usr/bin/env node
/**
 * Test matrix for block-destructive-db.cjs: pipes sample PreToolUse JSON payloads into the hook as a separate process
 * (exactly as Claude Code does) and checks the exit code (2 = blocked, 0 = allowed). Nothing is executed.
 * Run: node .claude/hooks/test-block-destructive-db.cjs     (exit 1 if any case fails)
 */
'use strict'
const { spawnSync } = require('child_process')
const path = require('path')
const HOOK = path.join(__dirname, 'block-destructive-db.cjs')

const B = 'BLOCK', A = 'allow'
const cases = [
  // ---- must be blocked ----
  [B, 'Bash', 'npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url "$DIRECT_URL" --script', 'the 2026-10-20 incident command'],
  [B, 'Bash', 'npx prisma migrate diff --from-migrations m --to-schema-datamodel s --shadow-database-url=postgresql://u@h/db', '--shadow-database-url=…'],
  [B, 'Bash', `echo '  shadowDatabaseUrl = env("SHADOW")' >> prisma/schema.prisma`, 'shadowDatabaseUrl'],
  [B, 'Bash', 'npx prisma migrate reset --force', 'migrate reset'],
  [B, 'Bash', 'cd saas && npx prisma db push', 'db push'],
  [B, 'Bash', 'npx prisma db push --skip-generate', 'db push with flags'],
  [B, 'Bash', 'npx  Prisma   DB   PUSH', 'db push, odd case/spacing'],
  [B, 'Bash', 'npx prisma "db" "push"', 'db push, quoted words'],
  [B, 'Bash', 'npx prisma db execute --file x.sql --force-reset', '--force-reset'],
  [B, 'Bash', 'npx prisma migrate dev --create-only --accept-data-loss', '--accept-data-loss (even with --create-only)'],
  [B, 'Bash', 'npx prisma migrate dev --name add_lunch', 'migrate dev without --create-only'],
  [B, 'Bash', 'npx prisma migrate dev', 'bare migrate dev'],
  [B, 'Bash', 'npx prisma migrate dev --create-only --name x && npx prisma migrate dev', 'second segment lacks --create-only'],
  [B, 'Bash', 'npx prisma \\\n  migrate reset', 'line continuation'],
  [B, 'Bash', `psql "$URL" -c "DROP SCHEMA public CASCADE"`, 'DROP SCHEMA'],
  [B, 'Bash', `npx tsx -e "db.$executeRawUnsafe('drop   schema public cascade')"`, 'drop schema, lower case in JS'],
  [B, 'Bash', `npx prisma db execute --stdin <<< 'truncate table "Order"'`, 'TRUNCATE (lower case)'],
  [B, 'Bash', `psql -c 'TRUNCATE "Ticket" CASCADE'`, 'TRUNCATE'],
  [B, 'Bash', `psql -c 'DROP DATABASE postgres'`, 'DROP DATABASE'],
  [B, 'PowerShell', 'cd saas; npx prisma migrate reset --force; Write-Host done', 'PowerShell tool: migrate reset'],
  [B, 'PowerShell', 'npx prisma db `\n  push', 'PowerShell tool: backtick continuation'],
  [B, 'PowerShell', '$env:X = "1"; npx prisma migrate dev --name x', 'PowerShell tool: migrate dev'],
  [B, 'RAW', 'not json at all … npx prisma migrate reset', 'unparseable stdin → raw text scanned'],
  // ---- must be allowed ----
  [A, 'Bash', 'npx prisma migrate deploy', 'migrate deploy'],
  [A, 'Bash', 'npx prisma migrate status', 'migrate status'],
  [A, 'Bash', 'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script', 'read-only diff vs live DB'],
  [A, 'Bash', 'npx prisma migrate resolve --applied 20261020150000_visit_type_lunch', 'migrate resolve'],
  [A, 'Bash', 'npx prisma migrate dev --create-only --name visit_type_lunch', 'migrate dev --create-only'],
  [A, 'Bash', 'cd saas && npx prisma generate', 'prisma generate'],
  [A, 'Bash', 'git status --short && git log --oneline -5', 'git'],
  [A, 'Bash', 'npx tsx scripts/backup-db.ts --env=prod', 'backup script'],
  [A, 'Bash', 'npx tsx scripts/tix.ts list', 'tix'],
  [A, 'PowerShell', 'Get-ChildItem saas/scripts | Select-Object -First 5 Name', 'PowerShell tool: normal command'],
  [A, 'PowerShell', 'cd saas; npx prisma migrate status', 'PowerShell tool: migrate status'],
  [A, 'Read', null, 'non-shell payload without a command'],
]

let failed = 0
const rows = []
for (const [want, tool, cmd, note] of cases) {
  const input = tool === 'RAW' ? cmd
    : JSON.stringify({ session_id: 'test', hook_event_name: 'PreToolUse', tool_name: tool,
        tool_input: cmd === null ? { file_path: 'README.md' } : { command: cmd, description: 'test' } })
  const r = spawnSync(process.execPath, [HOOK], { input, encoding: 'utf8' })
  const got = r.status === 2 ? B : r.status === 0 ? A : `exit ${r.status}`
  const ok = got === want && (got !== B || /Rule 0b/.test(r.stderr))
  if (!ok) failed++
  rows.push(`| ${ok ? 'PASS' : 'FAIL'} | ${tool} | ${want} | ${got} | ${note} |`)
}
console.log('| result | tool | expected | got | case |\n|---|---|---|---|---|\n' + rows.join('\n'))
console.log(`\n${cases.length - failed}/${cases.length} passed`)
process.exit(failed ? 1 : 0)
