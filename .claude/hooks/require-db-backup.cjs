#!/usr/bin/env node
/**
 * PreToolUse hook (Bash + PowerShell) — takes a full local backup of a database BEFORE a command that can write to it.
 * Why: Max, 2026-10-20 (after the dev-DB wipe): "update the process so that export of whole db runs before commands
 * like this so that if we lose something, its saved locally on this laptop" — vault/ClaudeInstructions.md Rule 0b.
 *
 * What it does, for commands that belong to the georgian-saas project (cwd or command mentions it):
 *   1. decides whether the command can WRITE to a database (see isWrite below — deliberately broad);
 *   2. if so, runs `npx tsx scripts/backup-db.ts --env=dev` (and `--env=prod` when the command mentions production)
 *      unless a finished backup of that env is younger than FRESH_MIN minutes;
 *   3. a failed backup BLOCKS the command (exit 2). Fail closed: an internal error on a write command also blocks.
 * Backups land in one folder each under %USERPROFILE%\Downloads\DB_Backups (backup-db.ts; same naming here).
 *
 * Contract (Claude Code hooks): JSON on stdin {tool_name, tool_input: {command}, cwd, ...}; exit 0 → allow (stdout JSON
 * {systemMessage} is shown to the user), exit 2 → block (stderr shown to Claude). Configured in the USER settings
 * (~/.claude/settings.json, absolute path) so it runs in every session, wherever it was started.
 * Tests: node .claude/hooks/test-require-db-backup.cjs   (uses DB_BACKUP_HOOK_DRY=1 — never runs a real backup)
 * Since 2026-10-21 (Max: "keep local backups on my device, before the commands for changing stuff execute") it also
 * backs up before:
 *   - `git push` — to master/main (or `gh pr merge`): PRODUCTION + dev, because that deploys to the live site;
 *     to any other branch (staging): dev;
 *   - ticket-tool writes (`tix add|comment|move|review|…|release new|add|edit|…`): dev, or prod with --prod;
 *   - Supabase MCP database tools (`mcp__*__execute_sql` unless the SQL is read-only, `mcp__*__apply_migration`):
 *     the env of the tool's project_id (dev ref / prod ref; other projects are ignored).
 * Known limits: writes made through the app's own pages, other HTTP calls, or Max's own terminal are not seen —
 * Rule 0b asks for a manual backup before those.
 */
'use strict'
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const REPO = path.resolve(__dirname, '..', '..')
const SAAS = path.join(REPO, 'saas')
const ROOT = process.env.DB_BACKUP_ROOT || path.join(os.homedir(), 'Downloads', 'DB_Backups')
const FRESH_MIN = Number(process.env.DB_BACKUP_FRESH_MIN || 10)
const DRY = process.env.DB_BACKUP_HOOK_DRY // tests only: '1' = pretend success, 'fail' = pretend failure

// Repo/QA scripts that only read (or only talk to the ticket API) — everything else under scripts/ counts as a write.
const READ_ONLY_SCRIPT = /(^|[\\/])(backup-db|backup-verify|audit-money|check-[\w-]+|demo-funnel|inspect-[\w-]+|tix|release-shots|test-money|test-pricing-model|test-flitt-signature|test-access-code-rules|test-order-delivery|test-wine-order-date|test-wine-pricing|test-wine-receipt|[\w-]*(verify|check|facts|state|forensics|sweep|counts|baseline|inspect|now|diff|report)[\w-]*)\.ts\b/i
const SCRIPT = /\b(tsx|ts-node|node)\b[^&|;\n]*?scripts[\\/][\w./\\-]+\.(ts|js|cjs|mjs)\b/i
const PROD = /--prod\b|--env[= ]prod\b|--db[= ]prod\b|\.env\.prod|dshsfkffcsgerdqinqst|--yes-prod\b/i
const SQL_WRITE = /\b(insert\s+into|update\s+[\\"'`]*[\w.]+[\\"'`]*\s+set|delete\s+from|alter\s+(table|type|schema|sequence)|create\s+(table|index|type|policy|schema)|drop\s+(table|index|type|policy)|grant\s|revoke\s|setval\s*\()/i
const SQL_RUNNER = /\bpsql\b|executeRaw|\$queryRaw|db\s+execute|\b(tsx|node)\s+-e\b/i

function isWrite(cmd) {
  const c = cmd.replace(/\\\r?\n|`\r?\n|\^\r?\n/g, ' ')
  if (/scripts[\\/]backup-(db|verify)\.ts/i.test(c) && !/--write\b/i.test(c)) return null // the backup itself
  if (/--(write|apply)\b/i.test(c)) return '--write/--apply flag'
  if (/prisma(\.cmd|\.exe)?\s+migrate\s+(deploy|resolve)\b/i.test(c)) return 'prisma migrate deploy/resolve'
  if (/prisma(\.cmd|\.exe)?\s+db\s+(execute|seed)\b/i.test(c) || /\bnpm\s+run\s+seed\b/i.test(c)) return 'prisma db execute/seed'
  if (/\bplaywright\s+test\b/i.test(c) && !/--list\b/i.test(c)) return 'Playwright test run (writes test data)'
  if (SQL_WRITE.test(c) && SQL_RUNNER.test(c)) return 'inline SQL write'
  const m = c.match(SCRIPT)
  if (m && !READ_ONLY_SCRIPT.test(m[0]) && !/--dry\b/i.test(c)) return `script ${m[0].split(/[\\/]/).pop()}`
  return null
}

const TIX_WRITE = /\btix(?:\.ts)?\s+(?:(add|comment|move|review|analysis|solution|ask|answer|decide|link|unlink|live|reply|ship)\b|release\s+(new|add|edit|image|draft-from-next|publish|delete)\b)/i
const REFS = { jpbkkngpgtvqmsocitjx: 'dev', dshsfkffcsgerdqinqst: 'prod' }

/** Branch a `git push` sends to: 'master' (deploys production), 'other', or null when the command has no push. */
/** The command without heredoc bodies (commit messages, file contents) — their text is data, not commands. */
function withoutHeredocs(c) {
  return c.replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n[ \t]*\2[ \t]*(?=\n|$)/g, '<<heredoc')
}

function pushTarget(c, cwd) {
  let dir = cwd
  // Only a segment that STARTS with the command counts — not the words inside a message or an echo.
  for (const seg of withoutHeredocs(c).split(/&&|\|\||[;|\n]/)) {
    const cd = seg.match(/^\s*cd\s+(?:"([^"]+)"|'([^']+)'|(\S+))\s*$/)
    if (cd) { dir = cd[1] || cd[2] || cd[3]; continue }
    if (/^\s*(?:\w+=\S*\s+)*gh\s+pr\s+merge\b/i.test(seg)) return 'master'
    const m = seg.match(/^\s*(?:\w+=\S*\s+)*git\b((?:\s+-C\s+(?:"[^"]+"|\S+))?)\s+push\b(.*)$/i)
    if (!m) continue
    const refs = m[2].trim().split(/\s+/).filter(a => a && !a.startsWith('-')).slice(1) // drop the remote name
    if (refs.some(r => /(^|:)(refs\/heads\/)?(master|main)$/i.test(r.replace(/^\+/, '')))) return 'master'
    if (refs.length) return 'other'
    let branch = process.env.DB_BACKUP_GIT_BRANCH // tests only
    if (branch === undefined) {
      const at = (m[1].match(/-C\s+"?([^"]+?)"?\s*$/) || [])[1] || dir || REPO
      branch = (spawnSync('git', ['branch', '--show-current'], { cwd: at, encoding: 'utf8', windowsHide: true }).stdout || '').trim()
    }
    return /^(master|main)$/.test(branch) ? 'master' : 'other'
  }
  return null
}

/** Read-only SQL = every statement starts with SELECT / WITH / SHOW / EXPLAIN / VALUES and nothing writes. */
function readOnlySql(sql) {
  const s = String(sql || '').replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')
  const stmts = s.split(';').map(x => x.trim()).filter(Boolean)
  return stmts.length > 0 && stmts.every(x => /^(select|with|show|explain|values)\b/i.test(x)) && !SQL_WRITE.test(s) && !/\bset\s+(?!local\s+timezone)\w|nextval\s*\(|\bdo\s+\$/i.test(s)
}

/** What a tool call needs backed up: { why, envs } or null. */
function plan(input) {
  const tool = input.tool_name || ''
  const ti = input.tool_input || {}
  const mcp = tool.match(/^mcp__.+__(execute_sql|apply_migration)$/)
  if (mcp) {
    const env = REFS[ti.project_id]
    if (!env) return null // not one of this project's databases
    if (mcp[1] === 'execute_sql' && readOnlySql(ti.query)) return null
    return { why: `Supabase MCP ${mcp[1]}`, envs: [env] }
  }
  const cmd = typeof ti.command === 'string' ? ti.command : null
  if (!cmd || !inProject(cmd, input.cwd || '')) return null
  const c = cmd.replace(/\\\r?\n|`\r?\n|\^\r?\n/g, ' ')
  const push = pushTarget(c, input.cwd || '')
  if (push === 'master') return { why: 'git push to master (deploys production)', envs: ['dev', 'prod'] }
  if (push === 'other') return { why: 'git push', envs: ['dev'] }
  if (TIX_WRITE.test(withoutHeredocs(c))) return { why: 'ticket write (tix)', envs: PROD.test(c) ? ['prod'] : ['dev'] }
  const why = isWrite(cmd)
  return why ? { why, envs: PROD.test(cmd) ? ['dev', 'prod'] : ['dev'] } : null
}

function inProject(cmd, cwd) {
  const norm = s => (s || '').replace(/\\/g, '/').toLowerCase()
  return norm(cwd).includes('georgian-saas') || norm(cmd).includes('georgian-saas')
}

/** Age in minutes of the newest FINISHED backup of env, or Infinity. */
function freshness(env) {
  if (!fs.existsSync(ROOT)) return Infinity
  const re = new RegExp(`^\\d{4}-\\d{2}-\\d{2}_\\d{4,6}_${env}(_|$)`)
  let newest = 0
  for (const d of fs.readdirSync(ROOT)) {
    if (!re.test(d)) continue
    const man = path.join(ROOT, d, 'MANIFEST.json')
    if (fs.existsSync(man)) newest = Math.max(newest, fs.statSync(man).mtimeMs)
  }
  return newest ? (Date.now() - newest) / 60000 : Infinity
}

const sleep = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
/** One backup at a time (parallel tool calls): exclusive lock file; a stale lock (>6 min) is taken over. */
function withLock(fn) {
  fs.mkdirSync(ROOT, { recursive: true })
  const lock = path.join(ROOT, '.backup.lock')
  const deadline = Date.now() + 6 * 60000
  for (;;) {
    try { fs.writeFileSync(lock, String(process.pid), { flag: 'wx' }); break } catch {
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 6 * 60000) { fs.unlinkSync(lock); continue } } catch {}
      if (Date.now() > deadline) throw new Error('another backup is still running (lock held for 6 minutes)')
      sleep(2000)
    }
  }
  try { return fn() } finally { try { fs.unlinkSync(lock) } catch {} }
}

function backup(env, reason) {
  if (DRY === '1') return { ok: true, out: `[dry] would back up ${env}` }
  if (DRY === 'fail') return { ok: false, out: '[dry] simulated failure' }
  const r = spawnSync(`npx tsx scripts/backup-db.ts --env=${env} --reason=${reason}`, {
    cwd: SAAS, shell: true, encoding: 'utf8', timeout: 280000, windowsHide: true,
  })
  const out = `${r.stdout || ''}${r.stderr || ''}`
  const folder = (out.match(/written to: (.+)/) || [])[1]
  return { ok: r.status === 0 && !!folder, out: folder ? folder.trim() : out.trim().split('\n').slice(-3).join(' | ') }
}

function main(raw) {
  let p = null
  try { p = plan(JSON.parse(raw)) } catch { return 0 }
  if (!p) return 0
  const { why, envs } = p
  const reason = 'auto-' + why.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  const done = []
  try {
    for (const env of envs) {
      const ran = withLock(() => {
        const age = freshness(env)
        if (age <= FRESH_MIN) return `${env}: recent backup (${age.toFixed(1)} min old) kept`
        const b = backup(env, reason)
        if (!b.ok) throw new Error(`backup of ${env} failed: ${b.out}`)
        return `${env}: ${b.out}`
      })
      done.push(ran)
    }
  } catch (e) {
    process.stderr.write([
      `BLOCKED by .claude/hooks/require-db-backup.cjs — vault/ClaudeInstructions.md Rule 0b (backup before database writes).`,
      `This command can write to a database (${why}), and the automatic local backup did not complete: ${e.message}`,
      `Fix the backup first (cd saas && npx tsx scripts/backup-db.ts --env=${envs.join(' / --env=')}), then retry. Do not work around this.`,
      '',
    ].join('\n'))
    return 2
  }
  process.stdout.write(JSON.stringify({ systemMessage: `DB backup before write (${why}) — ${done.join('; ')}` }))
  return 0
}

if (require.main === module) {
  let raw = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', d => { raw += d })
  process.stdin.on('end', () => process.exit(main(raw)))
}
module.exports = { isWrite, inProject, plan, pushTarget, readOnlySql }
