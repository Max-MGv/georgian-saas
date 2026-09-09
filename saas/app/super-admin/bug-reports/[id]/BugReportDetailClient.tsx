'use client'

import { useState, useTransition } from 'react'
import { updateBugReportStatus, type BugReportDetail } from '@/app/actions/bugReports'

const C = {
  card: '#111827',
  border: '#1e293b',
  text: '#f1f5f9',
  muted: '#94a3b8',
  faint: '#475569',
}

const STATUS_OPTIONS: { value: BugReportDetail['status']; label: string }[] = [
  { value: 'NEW', label: 'New' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'WONT_FIX', label: "Won't Fix" },
]

const STATUS_COLOR: Record<string, { bg: string; border: string; color: string }> = {
  NEW: { bg: '#1e1b4b', border: '#3730a3', color: '#a5b4fc' },
  IN_PROGRESS: { bg: '#422006', border: '#78350f', color: '#fbbf24' },
  RESOLVED: { bg: '#052e16', border: '#14532d', color: '#86efac' },
  WONT_FIX: { bg: '#1e293b', border: '#334155', color: '#94a3b8' },
}

const SURFACE_LABEL: Record<string, string> = {
  PUBLIC_SITE: 'Public Site',
  ADMIN: 'Admin',
  SUPER_ADMIN: 'Super Admin',
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function fmtTime(ts: number) {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 13.5, color: C.text, wordBreak: 'break-word' }}>{children}</div>
    </div>
  )
}

export default function BugReportDetailClient({ report }: { report: BugReportDetail }) {
  const [status, setStatus] = useState(report.status)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function handleStatusChange(next: BugReportDetail['status']) {
    const prev = status
    setStatus(next) // optimistic
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        await updateBugReportStatus(report.id, next)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } catch (e) {
        setStatus(prev) // roll back
        setError(e instanceof Error ? e.message : 'Failed to update status')
      }
    })
  }

  // Breadcrumbs are stored oldest-first as captured; render oldest → newest so
  // the trail reads as a narrative leading up to the report ("first this, then
  // this, then they hit the report button") rather than working backward from it.
  const breadcrumbs = report.breadcrumbs

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
      {/* Main column */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ backgroundColor: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
          <div style={{ fontSize: 11, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Comment
          </div>
          <div style={{ fontSize: 14.5, color: C.text, whiteSpace: 'pre-line', lineHeight: 1.6 }}>
            {report.comment}
          </div>
        </div>

        {report.screenshotSignedUrl && (
          <div style={{ backgroundColor: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
            <div style={{ fontSize: 11, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
              Screenshot
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={report.screenshotSignedUrl}
              alt="Bug report screenshot"
              style={{ maxWidth: '100%', borderRadius: 8, border: `1px solid ${C.border}`, display: 'block' }}
            />
          </div>
        )}

        <div style={{ backgroundColor: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
          <div style={{ fontSize: 11, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            Breadcrumb trail {breadcrumbs.length > 0 && `(${breadcrumbs.length}, oldest → newest)`}
          </div>
          {breadcrumbs.length === 0 ? (
            <div style={{ fontSize: 13, color: C.faint }}>No breadcrumb trail captured for this report.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {breadcrumbs.map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, position: 'relative', paddingBottom: i === breadcrumbs.length - 1 ? 0 : 14 }}>
                  {/* timeline rail */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16, flexShrink: 0 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: '50%', marginTop: 4, flexShrink: 0,
                      backgroundColor: b.type === 'navigation' ? '#818cf8' : '#38bdf8',
                    }} />
                    {i !== breadcrumbs.length - 1 && (
                      <div style={{ width: 1, flex: 1, backgroundColor: C.border, marginTop: 2 }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 600, color: b.type === 'navigation' ? '#818cf8' : '#38bdf8',
                      }}>
                        {b.type === 'navigation' ? '↳ Navigation' : '🖱 Click'}
                      </span>
                      <span style={{ fontSize: 12, color: C.faint }}>{fmtTime(b.timestamp)}</span>
                    </div>
                    <div style={{ fontSize: 13, color: C.text, marginTop: 2 }}>{b.target}</div>
                    <div style={{ fontSize: 11.5, color: C.faint, fontFamily: 'monospace', marginTop: 1 }}>{b.path}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sidebar */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ backgroundColor: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
          <div style={{ fontSize: 11, color: C.faint, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
            Status
          </div>
          <select
            value={status}
            onChange={e => handleStatusChange(e.target.value as BugReportDetail['status'])}
            disabled={isPending}
            style={{
              width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 13.5, fontWeight: 600,
              backgroundColor: STATUS_COLOR[status].bg,
              border: `1px solid ${STATUS_COLOR[status].border}`,
              color: STATUS_COLOR[status].color,
              cursor: isPending ? 'wait' : 'pointer',
            }}
          >
            {STATUS_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {saved && <div style={{ fontSize: 12, color: '#86efac', marginTop: 6 }}>Saved ✓</div>}
          {error && <div style={{ fontSize: 12, color: '#f87171', marginTop: 6 }}>{error}</div>}
        </div>

        <div style={{ backgroundColor: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20 }}>
          <Row label="Surface">{SURFACE_LABEL[report.surface] ?? report.surface}</Row>
          <Row label="Tenant">{report.tenantName ?? 'Public site (no tenant)'}</Row>
          <Row label="Submitter">{report.submitterEmail ?? 'Anonymous'}</Row>
          <Row label="Page URL">
            <a href={report.pageUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#818cf8', textDecoration: 'none', wordBreak: 'break-all' }}>
              {report.pageUrl}
            </a>
          </Row>
          <Row label="User agent">
            <span style={{ fontSize: 12, color: C.muted, wordBreak: 'break-all' }}>{report.userAgent ?? '—'}</span>
          </Row>
          <Row label="Submitted">{fmtDateTime(report.createdAt)}</Row>
          {report.updatedAt !== report.createdAt && (
            <Row label="Last updated">{fmtDateTime(report.updatedAt)}</Row>
          )}
        </div>
      </div>
    </div>
  )
}
