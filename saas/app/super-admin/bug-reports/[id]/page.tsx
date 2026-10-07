import { getBugReport } from '@/app/actions/bugReports'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import BugReportDetailClient from './BugReportDetailClient'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'

export default async function BugReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const report = await getBugReport(id)
  if (!report) notFound()

  // Emails and bookmarks from before the ticket board point here: send them to the ticket.
  const linked = await db.bugReport.findUnique({ where: { id }, select: { ticket: { select: { number: true } } } })
  if (linked?.ticket) redirect(`/super-admin/tickets/${linked.ticket.number}`)

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/super-admin/bug-reports" style={{ color: '#475569', fontSize: 14 }}>
          ← Bug Reports
        </Link>
        <span style={{ color: '#1e293b' }}>/</span>
        <h1 className="text-xl font-bold" style={{ color: '#f1f5f9' }}>
          {report.type === 'BUG' ? 'Bug' : 'Feature'} report
        </h1>
      </div>

      <BugReportDetailClient report={report} />
    </div>
  )
}
