import { redirect } from 'next/navigation'
import { requireSuperAdmin } from '@/lib/requireSuperAdmin'
import { db } from '@/lib/db'

// The old report inbox was replaced by the ticket board (Plan-Tickets.md, Plan-TicketsV2 1.7). Emails and
// bookmarks from before still point here: send them to the report's ticket, or to the board.
export default async function BugReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin()
  const { id } = await params
  const linked = await db.bugReport.findUnique({ where: { id }, select: { ticket: { select: { number: true } } } })
  redirect(linked?.ticket ? `/super-admin/tickets?t=${linked.ticket.number}` : '/super-admin/tickets')
}
