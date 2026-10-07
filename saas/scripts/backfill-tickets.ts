/**
 * Turns existing BugReport rows into Tickets (Plan-Tickets.md). Idempotent: reports that already
 * have a ticketId are skipped, so it is safe to re-run. Keeps the report's original timestamp.
 *
 *   npx tsx scripts/backfill-tickets.ts            # dev database (saas/.env) - the default
 *
 * It writes to whatever DATABASE_URL points at. Running it against PRODUCTION is a deliberate,
 * separate step that needs Max's explicit go (ClaudeInstructions Rule 0) - never wire it into a build.
 */
import 'dotenv/config'
import { db } from '../lib/db'
import { TICKET_STATUS_FOR_REPORT, deriveTitle } from '../lib/tickets'

const SURFACE_AREA: Record<string, string> = { PUBLIC_SITE: 'Public site', ADMIN: 'Admin', SUPER_ADMIN: 'Super-admin' }

async function main() {
  const reports = await db.bugReport.findMany({ where: { ticketId: null }, orderBy: { createdAt: 'asc' } })
  console.log(`${reports.length} report(s) without a ticket`)
  for (const r of reports) {
    const status = TICKET_STATUS_FOR_REPORT[r.status]
    const ticket = await db.$transaction(async tx => {
      const t = await tx.ticket.create({
        data: {
          title: deriveTitle(r.comment),
          description: r.comment,
          type: r.type === 'FEATURE' ? 'FEATURE' : 'BUG',
          status,
          closeReason: status === 'CLOSED' ? 'WONT_FIX' : null,
          closedAt: status === 'DONE' || status === 'CLOSED' ? r.updatedAt : null,
          area: SURFACE_AREA[r.surface] ?? null,
          tenantId: r.tenantId,
          source: 'WIDGET',
          createdBy: 'reporter',
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
          events: { create: [{ kind: 'CREATED', body: `Imported from bug report ${r.id}. Reported from ${r.pageUrl}`, actor: 'system', createdAt: r.createdAt }] },
        },
      })
      await tx.bugReport.update({ where: { id: r.id }, data: { ticketId: t.id } })
      if (r.screenshotUrl) {
        const ext = r.screenshotUrl.split('.').pop()?.toLowerCase() ?? 'png'
        await tx.ticketAttachment.create({
          data: { ticketId: t.id, storagePath: r.screenshotUrl, bucket: 'bug-report-screenshots', fileName: `screenshot.${ext}`, mimeType: ext === 'jpg' ? 'image/jpeg' : `image/${ext}`, sizeBytes: 0, createdAt: r.createdAt },
        })
      }
      return t
    })
    console.log(`T-${ticket.number} [${status}] ${ticket.title}`)
  }
  console.log('done')
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
