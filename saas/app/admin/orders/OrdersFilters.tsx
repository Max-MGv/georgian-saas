'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import type { Company } from '@prisma/client'
import { COLUMN_DEFS, COLUMNS_STORAGE_KEY, DEFAULT_VISIBLE, type ColumnId } from './columnDefs'

const C = {
  border: '#e0d4c0',
  muted: '#6b5a47',
  inputBg: '#fffdf9',
  text: '#1c1008',
  wine: '#7c1d23',
  faint: '#a89070',
  bg: '#fff9f3',
}

type Props = {
  companies: Company[]
  params: { dateFrom?: string; dateTo?: string; companyId?: string }
}

export default function OrdersFilters({ companies, params }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  // ── Column visibility (lives here so Columns button is in the filter bar) ──
  const [visibleCols, setVisibleCols] = useState<Set<ColumnId>>(DEFAULT_VISIBLE)
  const [columnsOpen, setColumnsOpen] = useState(false)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLUMNS_STORAGE_KEY)
      if (saved) setVisibleCols(new Set(JSON.parse(saved) as ColumnId[]))
    } catch {}
  }, [])

  useEffect(() => {
    if (!columnsOpen) return
    function close() { setColumnsOpen(false) }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [columnsOpen])

  function toggleCol(id: ColumnId) {
    setVisibleCols(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      try { localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify([...next])) } catch {}
      // Notify OrdersTable on the same page
      window.dispatchEvent(new CustomEvent('ordersColumnsChanged'))
      return next
    })
  }

  // ── Filters ──────────────────────────────────────────────────────────────────
  function buildQuery(overrides: Record<string, string | undefined>) {
    const merged: Record<string, string> = {}
    if (params.dateFrom)  merged.dateFrom  = params.dateFrom
    if (params.dateTo)    merged.dateTo    = params.dateTo
    if (params.companyId) merged.companyId = params.companyId
    for (const [k, v] of Object.entries(overrides)) {
      if (v) merged[k] = v
      else   delete merged[k]
    }
    const sp = new URLSearchParams(merged)
    return sp.toString() ? `${pathname}?${sp.toString()}` : pathname
  }

  function update(key: string, value: string) {
    router.push(buildQuery({ [key]: value || undefined }))
  }

  function setUpcoming() {
    const today = new Date().toISOString().split('T')[0]
    router.push(buildQuery({ dateFrom: today, dateTo: undefined }))
  }

  function clearFilters() { router.push(pathname) }

  const hasFilters = params.dateFrom || params.dateTo || params.companyId
  const today = new Date().toISOString().split('T')[0]
  const isUpcoming = params.dateFrom === today && !params.dateTo

  const inputStyle = {
    backgroundColor: C.inputBg,
    border: `1px solid ${C.border}`,
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '0.875rem',
    color: C.text,
    outline: 'none',
  }

  return (
    <div className="flex flex-wrap items-end gap-3">

      {/* Quick */}
      <div>
        <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>Quick</label>
        <button
          onClick={setUpcoming}
          style={{
            ...inputStyle,
            border: `1px solid ${isUpcoming ? C.wine : C.border}`,
            color: isUpcoming ? C.wine : C.muted,
            backgroundColor: isUpcoming ? '#fdf2f3' : C.inputBg,
            fontWeight: isUpcoming ? 600 : 400,
            cursor: 'pointer',
          }}
        >
          Upcoming
        </button>
      </div>

      {/* Date range */}
      <div>
        <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>From</label>
        <input type="date" value={params.dateFrom ?? ''} onChange={e => update('dateFrom', e.target.value)} style={inputStyle} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>To</label>
        <input type="date" value={params.dateTo ?? ''} onChange={e => update('dateTo', e.target.value)} style={inputStyle} />
      </div>

      {/* Booking type / company */}
      <div>
        <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>Filter by</label>
        <select
          value={params.companyId ?? ''}
          onChange={e => update('companyId', e.target.value)}
          style={{ ...inputStyle, minWidth: 180 }}
        >
          <option value="">All bookings</option>
          <option value="__individual__">Individuals only</option>
          {companies.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Clear filters — same presence as Upcoming */}
      {hasFilters && (
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>&nbsp;</label>
          <button
            onClick={clearFilters}
            style={{
              ...inputStyle,
              border: `1px solid ${C.wine}`,
              color: C.wine,
              backgroundColor: '#fdf2f3',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Clear filters ×
          </button>
        </div>
      )}

      {/* Columns picker — right-aligned in the same row */}
      <div className="relative ml-auto">
        <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>&nbsp;</label>
        <button
          onClick={e => { e.stopPropagation(); setColumnsOpen(o => !o) }}
          className="flex items-center gap-1.5 rounded-lg border text-xs font-medium"
          style={{ ...inputStyle, padding: '8px 12px', width: 'auto', cursor: 'pointer' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18"/></svg>
          Columns ▾
        </button>
        {columnsOpen && (
          <div
            className="absolute right-0 z-40 rounded-xl border shadow-lg py-2 mt-1"
            style={{ backgroundColor: C.bg, borderColor: C.border, minWidth: 180 }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-3 pb-1 mb-1 border-b" style={{ borderColor: C.border }}>
              <span className="text-xs font-semibold" style={{ color: C.faint }}>SHOW / HIDE COLUMNS</span>
            </div>
            {COLUMN_DEFS.map(c => (
              <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-amber-50">
                <input
                  type="checkbox"
                  checked={visibleCols.has(c.id)}
                  onChange={() => toggleCol(c.id)}
                  style={{ accentColor: C.wine }}
                />
                <span className="text-xs" style={{ color: C.text }}>{c.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
