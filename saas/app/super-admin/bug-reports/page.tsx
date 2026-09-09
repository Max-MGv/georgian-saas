import { getBugReports } from '@/app/actions/bugReports'
import BugReportsClient from './BugReportsClient'

export default async function BugReportsPage() {
  const reports = await getBugReports()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold" style={{ color: '#f1f5f9' }}>Bug Reports</h1>
        <p className="text-sm mt-0.5" style={{ color: '#64748b' }}>
          {reports.length} report{reports.length !== 1 ? 's' : ''} across every tenant and the public site
        </p>
      </div>

      <BugReportsClient reports={reports} />
    </div>
  )
}
