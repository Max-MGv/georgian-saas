/**
 * Manage /api/tickets bearer tokens (Plan-Tickets.md). Writes to whatever DATABASE_URL points at:
 *   npx tsx scripts/ticket-token.ts create <name> [--scope forward]   # prints the token ONCE; only its hash is stored
 *        --scope forward = production's copy-to-staging token: it can ONLY create P-tickets (Plan-TicketsV2 3.5)
 *   npx tsx scripts/ticket-token.ts list
 *   npx tsx scripts/ticket-token.ts revoke <name>
 * The default (saas/.env) is the DEV database, which staging and localhost share. A production token
 * is a deliberate separate step that needs Max's explicit go (ClaudeInstructions Rule 0).
 */
import 'dotenv/config'
import { db } from '../lib/db'
import { generateToken, hashToken } from '../lib/ticketApiAuth'

async function main() {
  const [cmd, name] = process.argv.slice(2)
  const scopeArg = process.argv.indexOf('--scope')
  const scope = scopeArg > 0 ? process.argv[scopeArg + 1] : 'full'
  if (scope !== 'full' && scope !== 'forward') throw new Error('--scope must be full or forward')
  if (cmd === 'create' && name) {
    const token = generateToken()
    await db.ticketApiToken.create({ data: { name, scope, tokenHash: hashToken(token) } })
    console.log(`Token for "${name}" (scope ${scope}; shown once - store it in credentials.txt):\n${token}`)
  } else if (cmd === 'list') {
    for (const t of await db.ticketApiToken.findMany({ orderBy: { createdAt: 'asc' } })) {
      console.log(`${t.name}\t${t.scope}\tcreated ${t.createdAt.toISOString()}\tlast used ${t.lastUsedAt?.toISOString() ?? 'never'}${t.revokedAt ? '\tREVOKED' : ''}`)
    }
  } else if (cmd === 'revoke' && name) {
    const r = await db.ticketApiToken.updateMany({ where: { name, revokedAt: null }, data: { revokedAt: new Date() } })
    console.log(`revoked ${r.count}`)
  } else {
    console.log('usage: ticket-token.ts create <name> [--scope forward] | list | revoke <name>')
  }
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
