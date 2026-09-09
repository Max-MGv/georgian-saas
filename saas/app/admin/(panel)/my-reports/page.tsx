import { getSetting } from '@/app/actions/settings'
import { getMyBugReports } from '@/app/actions/bugReports'
import { adminT } from '@/lib/adminT'

// Phase 6 of Plan-BugReportWidget.md — a read-only status view of the
// reports THIS logged-in admin personally submitted (never other admins',
// never other tenants'). Standalone page (not a dashboard widget) because
// /admin has no dashboard — AdminPage just redirects to /admin/orders — so
// there was no natural landing page to attach a small widget to.
//
// getMyBugReports() derives the current user server-side and filters by
// submitterUserId itself; nothing here passes a user id from the client.

const STATUS_COLOR: Record<string, { bg: string; border: string; color: string }> = {
  NEW: { bg: '#eef2ff', border: '#c7d2fe', color: '#4338ca' },
  IN_PROGRESS: { bg: '#fffbeb', border: '#fde68a', color: '#92400e' },
  RESOLVED: { bg: '#f0fdf4', border: '#bbf7d0', color: '#15803d' },
  WONT_FIX: { bg: '#f1f5f9', border: '#e2e8f0', color: '#64748b' },
}

const STATUS_KEY: Record<string, string> = {
  NEW: 'myReports.status.new',
  IN_PROGRESS: 'myReports.status.inProgress',
  RESOLVED: 'myReports.status.resolved',
  WONT_FIX: 'myReports.status.wontFix',
}

function fmtDate(iso: string, locale: string) {
  return new Date(iso).toLocaleString(locale === 'ka' ? 'ka-GE' : 'en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default async function MyReportsPage() {
  const [reports, adminLanguage] = await Promise.all([
    getMyBugReports(),
    getSetting('admin_language'),
  ])
  const locale = adminLanguage || 'en'
  const at = (key: string) => adminT(locale, key)

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold" style={{ color: 'var(--site-text)' }}>{at('myReports.pageTitle')}</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--site-muted)' }}>{at('myReports.pageHint')}</p>
      </div>

      {reports.length === 0 ? (
        <div
          className="rounded-xl border p-6 text-sm"
          style={{ backgroundColor: 'var(--site-surface)', borderColor: 'var(--site-border)', color: 'var(--site-muted)' }}
        >
          {at('myReports.empty')}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {reports.map(r => {
            const sc = STATUS_COLOR[r.status] ?? STATUS_COLOR.NEW
            return (
              <div
                key={r.id}
                className="rounded-xl border p-4"
                style={{ backgroundColor: 'var(--site-surface)', borderColor: 'var(--site-border)' }}
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-md"
                      style={{ backgroundColor: 'var(--site-bg)', border: '1px solid var(--site-border)', color: 'var(--site-muted)' }}
                    >
                      {r.type === 'BUG' ? at('myReports.type.bug') : at('myReports.type.feature')}
                    </span>
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-md"
                      style={{ backgroundColor: sc.bg, border: `1px solid ${sc.border}`, color: sc.color }}
                    >
                      {at(STATUS_KEY[r.status] ?? 'myReports.status.new')}
                    </span>
                  </div>
                  <span className="text-xs" style={{ color: 'var(--site-secondary)' }}>
                    {at('myReports.submitted')} {fmtDate(r.createdAt, locale)}
                  </span>
                </div>
                <p className="text-sm mt-2" style={{ color: 'var(--site-text)', whiteSpace: 'pre-line' }}>
                  {r.comment}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
