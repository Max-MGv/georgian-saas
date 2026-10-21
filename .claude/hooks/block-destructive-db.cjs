#!/usr/bin/env node
/**
 * PreToolUse hook (Bash + PowerShell) — blocks commands that can reset, drop or wipe a real database.
 * Why: on 2026-10-20 `prisma migrate diff ... --shadow-database-url <dev URL>` reset the real dev database
 * (vault/Recovery-2026-10-20-DevDb.md, vault/ClaudeInstructions.md Rule 0b).
 *
 * Contract (Claude Code hooks): JSON on stdin {tool_name, tool_input: {command, ...}, ...}.
 *   exit 0 → allow; exit 2 → block, stderr is shown to Claude. Configured in .claude/settings.json.
 * Tests: node .claude/hooks/test-block-destructive-db.cjs
 *
 * Blocked (case-insensitive): --shadow-database-url / shadowDatabaseUrl; prisma migrate reset; prisma db push (any
 * form); --force-reset; --accept-data-loss; prisma migrate dev WITHOUT --create-only (checked per command segment);
 * DROP SCHEMA; TRUNCATE; DROP DATABASE. Everything else is allowed (migrate deploy/status/resolve, migrate diff
 * --from-url ... --to-schema-datamodel, ...).
 * Known limits: it only sees the command line — a script file that runs these statements internally, an npm script
 * alias is not inspected. Supabase MCP execute_sql / apply_migration SQL IS inspected (since 2026-10-21). False positives (e.g. the word "truncate" in a grep or commit
 * message) are accepted on purpose: write such text with the Write tool / `git commit -F <file>` instead.
 */
'use strict'

const PRISMA = String.raw`prisma(?:\.cmd|\.exe|\.js)?`
const RULES = [
  { id: '--shadow-database-url', re: /--shadow-database-url/i, why: 'Prisma resets (wipes) whatever database a shadow URL points at' },
  { id: 'shadowDatabaseUrl', re: /shadowDatabaseUrl/i, why: 'Prisma resets (wipes) whatever database a shadow URL points at' },
  { id: 'prisma migrate reset', re: new RegExp(`${PRISMA}\\s+migrate\\s+reset`, 'i'), why: 'drops every table and replays migrations' },
  { id: 'prisma db push', re: new RegExp(`${PRISMA}\\s+db\\s+push`, 'i'), why: 'can drop columns/tables to match the schema; this project uses migrations' },
  { id: '--force-reset', re: /--force-reset/i, why: 'resets the database' },
  { id: '--accept-data-loss', re: /--accept-data-loss/i, why: 'lets Prisma delete data without asking' },
  { id: 'prisma migrate dev (without --create-only)', perSegment: true, re: new RegExp(`${PRISMA}\\s+migrate\\s+dev\\b`, 'i'), unless: /--create-only\b/i, why: 'uses a shadow database and offers a reset on drift' },
  { id: 'DROP SCHEMA', re: /\bdrop\s+schema\b/i, why: 'deletes a whole schema with all tables' },
  { id: 'TRUNCATE', re: /\btruncate\b/i, why: 'deletes every row of a table' },
  { id: 'DROP DATABASE', re: /\bdrop\s+database\b/i, why: 'deletes a whole database' },
]

/** Variants of the command so line continuations, odd spacing or quoting do not hide a pattern. */
function variants(cmd) {
  const joined = cmd.replace(/\\\r?\n/g, ' ').replace(/`\r?\n/g, ' ').replace(/\^\r?\n/g, ' ')
  const spaced = joined.replace(/\s+/g, ' ')
  const unquoted = spaced.replace(/["'`^]/g, '').replace(/\s+/g, ' ')
  return [cmd, spaced, unquoted]
}

/** Split into simple commands (&&, ||, ;, |, &, newlines) — used for the "migrate dev unless --create-only" rule. */
function segments(cmd) {
  return cmd.replace(/\\\r?\n|`\r?\n|\^\r?\n/g, ' ').split(/&&|\|\||[;|&\r\n]/).map(s => s.trim()).filter(Boolean)
}

function check(cmd) {
  const hits = []
  for (const rule of RULES) {
    if (rule.perSegment) {
      const bad = variants(cmd).some(v => segments(v).some(seg => rule.re.test(seg) && !rule.unless.test(seg)))
      if (bad) hits.push(rule)
    } else if (variants(cmd).some(v => rule.re.test(v))) hits.push(rule)
  }
  return hits
}

function main(raw) {
  let command = null
  let tool = '?'
  try {
    const input = JSON.parse(raw)
    tool = input.tool_name || '?'
    const ti = input.tool_input || {}
    // Shell commands, and (since 2026-10-21) the SQL of Supabase MCP database tools (execute_sql / apply_migration).
    command = typeof ti.command === 'string' ? ti.command : /^mcp__.+__(execute_sql|apply_migration)$/.test(tool) && typeof ti.query === 'string' ? ti.query : null
  } catch {
    command = raw // unparseable input: fail safe by scanning the raw text
  }
  if (!command) return 0
  const hits = check(command)
  if (!hits.length) return 0
  process.stderr.write([
    `BLOCKED by .claude/hooks/block-destructive-db.cjs — vault/ClaudeInstructions.md Rule 0b (DATABASE SAFETY).`,
    `The ${tool} command contains: ${hits.map(h => `"${h.id}" (${h.why})`).join('; ')}.`,
    `These can reset, drop or wipe a real database — this is how the dev database was wiped on 2026-10-20.`,
    `Do not retry, rephrase or work around this block. If Max has approved this exact command on this exact database,`,
    `he runs it himself in his own terminal. Read-only alternatives: prisma migrate diff --from-url <db> --to-schema-datamodel <schema>,`,
    `prisma migrate status, prisma migrate dev --create-only (writes a migration file only), prisma migrate deploy.`,
    `If this is a false positive (e.g. the word appears in a commit message or search), put the text in a file`,
    `(Write tool, git commit -F <file>) instead of on the command line.`,
    '',
  ].join('\n'))
  return 2
}

if (require.main === module) {
  let raw = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', d => { raw += d })
  process.stdin.on('end', () => process.exit(main(raw)))
}
module.exports = { check }
