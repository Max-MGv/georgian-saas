'use client'

import { useState, useEffect, useTransition, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import type { Company } from '@prisma/client'
import { COLUMN_DEFS, COLUMNS_STORAGE_KEY, DEFAULT_VISIBLE, type ColumnId } from './columnDefs'
import { exportOrdersCsv } from '@/app/actions/orders'
import DateInput from '@/components/DateInput'

const C = {
  border: '#e0d4c0',
  muted: '#6b5a47',
  inputBg: '#fffdf9',
  text: '#1c1008',
  wine: '#7c1d23',
  faint: '#a89070',
  bg: '#fff9f3',
}

const STATUSES = [
  { value: 'NEW',          label: 'New' },
  { value: 'CONFIRMED',    label: 'Confirmed' },
  { value: 'INVOICE_SENT', label: 'Invoice sent' },
  { value: 'PAID',         label: 'Paid' },
  { value: 'COMPLETED',    label: 'Completed' },
  { value: 'CANCELLED',    label: 'Cancelled' },
]

type Props = {
  companies: Company[]
  params: { dateFrom?: string; dateTo?: string; companyId?: string; status?: string }
  statusCounts: Record<string, number>
}

export default function OrdersFilters({ companies, params, statusCounts }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const [isExporting, startExport] = useTransition()
  const [isNavigating, setIsNavigating] = useState(false)
  const navKey = `${params.dateFrom}-${params.dateTo}-${params.companyId}-${params.status}`
  const prevNavKey = useRef(navKey)

  // Local state so date inputs don't visually reset while navigation is in-flight
  const [localDateFrom, setLocalDateFrom] = useState(params.dateFrom ?? '')
  const [localDateTo, setLocalDateTo] = useState(params.dateTo ?? '')

  useEffect(() => {
    if (prevNavKey.current !== navKey) {
      prevNavKey.current = navKey
      setIsNavigating(false)
      // Sync local state once server params have settled
      setLocalDateFrom(params.dateFrom ?? '')
      setLocalDateTo(params.dateTo ?? '')
    }
  }, [navKey, params.dateFrom, params.dateTo])

  // ── Column visibility (lives here so Columns button is in the filter bar) ──
  const [visibleCols, setVisibleCols] = useState<Set<ColumnId>>(DEFAULT_VISIBLE)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

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
    if (params.status)    merged.status    = params.status
    for (const [k, v] of Object.entries(overrides)) {
      if (v) merged[k] = v
      else   delete merged[k]
    }
    const sp = new URLSearchParams(merged)
    return sp.toString() ? `${pathname}?${sp.toString()}` : pathname
  }

  function update(key: string, value: string) {
    setIsNavigating(true)
    router.push(buildQuery({ [key]: value || undefined }))
  }

  function setUpcoming() {
    setIsNavigating(true)
    const today = new Date().toISOString().split('T')[0]
    setLocalDateFrom(today)
    setLocalDateTo('')
    router.push(buildQuery({ dateFrom: today, dateTo: undefined }))
  }

  function clearFilters() {
    setIsNavigating(true)
    setLocalDateFrom('')
    setLocalDateTo('')
    router.push(pathname)
  }

  function handleExport() {
    startExport(async () => {
      const csv = await exportOrdersCsv({ dateFrom: params.dateFrom, dateTo: params.dateTo, companyId: params.companyId, status: params.status })
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `orders-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  const hasFilters = params.dateFrom || params.dateTo || params.companyId || params.status
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

  const activeFilterCount = [params.dateFrom, params.dateTo, params.companyId, params.status].filter(Boolean).length

  return (
    <>

    {/* ── Mobile compact bar (hidden on md+) ─────────────────── */}
    <div className="flex md:hidden items-center gap-2 flex-wrap" style={{ opacity: isNavigating ? 0.6 : 1, transition: 'opacity 0.15s' }}>
      <button
        onClick={setUpcoming}
        style={{
          ...inputStyle, cursor: 'pointer', minHeight: 40, paddingLeft: 14, paddingRight: 14,
          border: `1px solid ${isUpcoming ? C.wine : C.border}`,
          color: isUpcoming ? C.wine : C.muted,
          backgroundColor: isUpcoming ? '#fdf2f3' : C.inputBg,
          fontWeight: isUpcoming ? 600 : 400,
        }}
      >
        Upcoming
      </button>
      <button
        onClick={() => setMobileFiltersOpen(o => !o)}
        style={{
          ...inputStyle, cursor: 'pointer', minHeight: 40, paddingLeft: 14, paddingRight: 14,
          border: `1px solid ${mobileFiltersOpen || activeFilterCount > 0 ? C.wine : C.border}`,
          color: mobileFiltersOpen || activeFilterCount > 0 ? C.wine : C.muted,
          backgroundColor: mobileFiltersOpen || activeFilterCount > 0 ? '#fdf2f3' : C.inputBg,
          fontWeight: activeFilterCount > 0 ? 600 : 400,
        }}
      >
        Filters {activeFilterCount > 0 ? `(${activeFilterCount})` : '▾'}
      </button>
      {hasFilters && (
        <button
          onClick={clearFilters}
          style={{
            ...inputStyle, cursor: 'pointer', minHeight: 40, paddingLeft: 14, paddingRight: 14,
            border: `1px solid ${C.wine}`, color: C.wine, backgroundColor: '#fdf2f3', fontWeight: 500,
          }}
        >
          Clear ×
        </button>
      )}
    </div>

    {/* ── Mobile expanded filter panel ───────────────────────── */}
    {mobileFiltersOpen && (
      <div className="md:hidden flex flex-col gap-3 p-3 rounded-xl border mt-2" style={{ borderColor: C.border, backgroundColor: C.bg }}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>From</label>
            <DateInput value={localDateFrom} onChange={v => { setLocalDateFrom(v); update('dateFrom', v) }} style={{ ...inputStyle, minHeight: 40 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>To</label>
            <DateInput value={localDateTo} onChange={v => { setLocalDateTo(v); update('dateTo', v) }} style={{ ...inputStyle, minHeight: 40 }} />
          </div>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>Filter by</label>
          <select
            value={params.companyId ?? ''}
            onChange={e => update('companyId', e.target.value)}
            style={{ ...inputStyle, width: '100%', minHeight: 40 }}
          >
            <option value="">All bookings</option>
            <option value="__individual__">Individuals only</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>Status</label>
          <select
            value={params.status ?? ''}
            onChange={e => update('status', e.target.value)}
            style={{ ...inputStyle, width: '100%', minHeight: 40 }}
          >
            <option value="">All statuses ({Object.values(statusCounts).reduce((a, b) => a + b, 0)})</option>
            {STATUSES.map(s => {
              const count = statusCounts[s.value] ?? 0
              return <option key={s.value} value={s.value} disabled={count === 0}>{s.label} ({count})</option>
            })}
          </select>
        </div>
      </div>
    )}

    {/* ── Desktop full filter bar (hidden on mobile) ─────────── */}
    <div className="hidden md:flex flex-wrap items-end gap-3" style={{ opacity: isNavigating ? 0.6 : 1, transition: 'opacity 0.15s' }}>

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
        <DateInput value={localDateFrom} onChange={v => { setLocalDateFrom(v); update('dateFrom', v) }} style={inputStyle} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>To</label>
        <DateInput value={localDateTo} onChange={v => { setLocalDateTo(v); update('dateTo', v) }} style={inputStyle} />
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

      {/* Status */}
      <div>
        <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>Status</label>
        <select
          value={params.status ?? ''}
          onChange={e => update('status', e.target.value)}
          style={{ ...inputStyle, minWidth: 160 }}
        >
          <option value="">
            All statuses ({Object.values(statusCounts).reduce((a, b) => a + b, 0)})
          </option>
          {STATUSES.map(s => {
            const count = statusCounts[s.value] ?? 0
            return (
              <option key={s.value} value={s.value} disabled={count === 0}>
                {s.label} ({count})
              </option>
            )
          })}
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

      {/* Export CSV */}
      <div>
        <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>&nbsp;</label>
        <button
          onClick={handleExport}
          disabled={isExporting}
          style={{
            ...inputStyle,
            cursor: isExporting ? 'default' : 'pointer',
            opacity: isExporting ? 0.6 : 1,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          {isExporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

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

    {/* Progress bar */}
    <div style={{ height: 2, backgroundColor: '#e0d4c0', borderRadius: 2, marginTop: 10, overflow: 'hidden' }}>
      {isNavigating && (
        <div style={{
          height: '100%',
          backgroundColor: '#7c1d23',
          borderRadius: 2,
          animation: 'nav-progress 1s ease-out forwards',
        }} />
      )}
    </div>
    </>
  )
}
