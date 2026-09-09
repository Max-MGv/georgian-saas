'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { BugReportListItem } from '@/app/actions/bugReports'

const C = {
  card: '#111827',
  border: '#1e293b',
  text: '#f1f5f9',
  muted: '#94a3b8',
  faint: '#475569',
}

const TYPE_STYLE: Record<string, { bg: string; border: string; color: string; label: string }> = {
  BUG: { bg: '#450a0a', border: '#7f1d1d', color: '#fca5a5', label: 'Bug' },
  FEATURE: { bg: '#082f49', border: '#0c4a6e', color: '#7dd3fc', label: 'Feature' },
}

const STATUS_STYLE: Record<string, { bg: string; border: string; color: string; label: string }> = {
  NEW: { bg: '#1e1b4b', border: '#3730a3', color: '#a5b4fc', label: 'New' },
  IN_PROGRESS: { bg: '#422006', border: '#78350f', color: '#fbbf24', label: 'In Progress' },
  RESOLVED: { bg: '#052e16', border: '#14532d', color: '#86efac', label: 'Resolved' },
  WONT_FIX: { bg: '#1e293b', border: '#334155', color: '#94a3b8', label: "Won't Fix" },
}

const SURFACE_LABEL: Record<string, string> = {
  PUBLIC_SITE: 'Public Site',
  ADMIN: 'Admin',
  SUPER_ADMIN: 'Super Admin',
}

function Badge({ style }: { style: { bg: string; border: string; color: string; label: string } }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20,
      backgroundColor: style.bg, border: `1px solid ${style.border}`, color: style.color,
      whiteSpace: 'nowrap',
    }}>
      {style.label}
    </span>
  )
}

export default function BugReportsClient({ reports }: { reports: BugReportListItem[] }) {
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [tenantFilter, setTenantFilter] = useState('ALL')

  const tenantOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of reports) {
      if (r.tenantId) map.set(r.tenantId, r.tenantName ?? r.tenantId)
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [reports])

  const filtered = reports.filter(r => {
    if (typeFilter !== 'ALL' && r.type !== typeFilter) return false
    if (statusFilter !== 'ALL' && r.status !== statusFilter) return false
    if (tenantFilter === 'PUBLIC' && r.tenantId) return false
    if (tenantFilter !== 'ALL' && tenantFilter !== 'PUBLIC' && r.tenantId !== tenantFilter) return false
    return true
  })

  const selectStyle: React.CSSProperties = {
    padding: '7px 10px', borderRadius: 8, fontSize: 13,
    backgroundColor: '#0b1120', border: `1px solid ${C.border}`, color: C.text,
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selectStyle}>
          <option value="ALL">All types</option>
          <option value="BUG">Bug</option>
          <option value="FEATURE">Feature</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
          <option value="ALL">All statuses</option>
          <option value="NEW">New</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="RESOLVED">Resolved</option>
          <option value="WONT_FIX">Won't Fix</option>
        </select>
        <select value={tenantFilter} onChange={e => setTenantFilter(e.target.value)} style={selectStyle}>
          <option value="ALL">All tenants</option>
          <option value="PUBLIC">Public site (no tenant)</option>
          {tenantOptions.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: C.faint, marginLeft: 4 }}>
          {filtered.length} of {reports.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div style={{
          padding: '60px 24px', textAlign: 'center',
          backgroundColor: C.card, borderRadius: 12, border: `1px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🐛</div>
          <p style={{ color: C.muted }}>No reports match these filters.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(r => (
            <Link
              key={r.id}
              href={`/super-admin/bug-reports/${r.id}`}
              style={{
                backgroundColor: C.card, borderRadius: 12, border: `1px solid ${C.border}`,
                padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14,
                textDecoration: 'none',
              }}
            >
              <Badge style={TYPE_STYLE[r.type]} />
              <Badge style={STATUS_STYLE[r.status]} />

              <span style={{
                fontSize: 12, padding: '3px 9px', borderRadius: 20,
                backgroundColor: '#1e293b', border: `1px solid ${C.border}`, color: C.muted,
                whiteSpace: 'nowrap',
              }}>
                {SURFACE_LABEL[r.surface] ?? r.surface}
              </span>

              <div style={{ flex: 1, minWidth: 0, color: C.text, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.comment}
              </div>

              <span style={{ fontSize: 12, color: C.muted, flexShrink: 0, minWidth: 110, textAlign: 'right' }}>
                {r.tenantName ?? 'Public'}
              </span>

              <span style={{ fontSize: 12, color: C.faint, flexShrink: 0, minWidth: 130, textAlign: 'right' }}>
                {r.submitterEmail ?? 'Anonymous'}
              </span>

              <span style={{ fontSize: 12, color: C.faint, flexShrink: 0 }}>
                {new Date(r.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
