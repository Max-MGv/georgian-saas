'use client'

import { useState, useEffect, useTransition, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import type { Company } from '@prisma/client'
import { COLUMN_DEFS, COLUMNS_STORAGE_KEY, defaultVisibleFor, type ColumnId } from './columnDefs'
import { exportOrdersCsv } from '@/app/actions/orders'
import DateInput from '@/components/DateInput'
import { adminT } from '@/lib/adminT'
import HelpHint from '@/components/HelpHint'
import { countryName } from '@/lib/countries'

const C = {
  border: 'var(--site-border)',
  muted: 'var(--site-muted)',
  inputBg: 'var(--site-surface)',
  text: 'var(--site-text)',
  wine: 'var(--color-brand)',
  faint: 'var(--site-secondary)',
  bg: 'var(--site-surface)',
}

/**
 * Labels for the vocabulary codes. The options themselves are no longer a
 * constant — they come from `getProcessStatuses` / `getFinancialStatuses` via
 * the server, so a status inserted for a tenant appears in the filter without
 * a deploy. Only the wording lives here (Max's call, 2026-09-17: display
 * metadata stays in frontend code for now), with the raw code as the fallback.
 */
const STATUS_LABEL_KEYS: Record<string, string> = {
  new: 'orders.status.new',
  confirmed: 'orders.status.confirmed',
  completed: 'orders.status.completed',
  cancelled: 'orders.status.cancelled',
  unpaid: 'orders.status.unpaid',
  invoiced: 'orders.status.invoiceSent',
  paid: 'orders.status.paid',
}

/**
 * Payment limbo, still matched on the legacy column. Both axes put it at
 * process `new` + financial `unpaid` on purpose — an abandoned checkout leaves
 * the order where it started — so the old value is the only thing that can
 * still pick it out. Uppercase, which is also how the server tells the two
 * apart in one query param.
 */
const LIMBO_STATUS = 'PENDING_PAYMENT'

type StatusOption = { id: string; code: string; sortOrder: number }

type Props = {
  companies: Company[]
  params: { dateFrom?: string; dateTo?: string; companyId?: string; status?: string; payment?: string; nationality?: string; view?: string }
  /** Per process code, plus PENDING_PAYMENT when any order is in limbo. */
  statusCounts: Record<string, number>
  /** Per financial code. */
  paymentCounts: Record<string, number>
  processSteps: StatusOption[]
  financialSteps: StatusOption[]
  locale?: string
  /** Only to pick the first-visit column defaults — see defaultVisibleFor. */
  tenantId?: string | null
  /** ISO codes actually present on this tenant's orders (Plan-CompanyNationality) — not the full country list. */
  nationalityOptions?: string[]
}

export default function OrdersFilters({ companies, params, statusCounts, paymentCounts, processSteps, financialSteps, locale = 'en', tenantId = null, nationalityOptions = [] }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const at = (key: string) => adminT(locale, key)
  const [isExporting, startExport] = useTransition()
  const [isNavigating, setIsNavigating] = useState(false)
  const navKey = `${params.dateFrom}-${params.dateTo}-${params.companyId}-${params.status}-${params.payment}-${params.nationality}`
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
  const [visibleCols, setVisibleCols] = useState<Set<ColumnId>>(() => defaultVisibleFor(tenantId))
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const columnsPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLUMNS_STORAGE_KEY)
      if (saved) setVisibleCols(new Set(JSON.parse(saved) as ColumnId[]))
    } catch {}
  }, [])

  useEffect(() => {
    if (!columnsOpen) return
    function close(e: MouseEvent) {
      if (columnsPickerRef.current && !columnsPickerRef.current.contains(e.target as Node)) {
        setColumnsOpen(false)
      }
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [columnsOpen])

  function toggleCol(id: ColumnId) {
    const next = new Set(visibleCols)
    next.has(id) ? next.delete(id) : next.add(id)
    try { localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify([...next])) } catch {}
    // Notify OrdersTable on the same page (fired here, not inside a setState
    // updater, so it doesn't run mid-render of this component)
    window.dispatchEvent(new CustomEvent('ordersColumnsChanged'))
    setVisibleCols(next)
  }

  // ── Filters ──────────────────────────────────────────────────────────────────
  // `view` is carried through here too (not just the filter fields) — otherwise
  // every filter change silently bounces List/Calendar back to Table, since
  // Next's router.push replaces the whole query string, not just what changed.
  function buildQuery(overrides: Record<string, string | undefined>) {
    const merged: Record<string, string> = {}
    if (params.dateFrom)    merged.dateFrom    = params.dateFrom
    if (params.dateTo)      merged.dateTo      = params.dateTo
    if (params.companyId)   merged.companyId   = params.companyId
    if (params.status)      merged.status      = params.status
    if (params.payment)     merged.payment     = params.payment
    if (params.nationality) merged.nationality = params.nationality
    if (params.view)        merged.view        = params.view
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
    router.push(buildQuery({ dateFrom: undefined, dateTo: undefined, companyId: undefined, status: undefined, payment: undefined, nationality: undefined }))
  }

  function handleExport() {
    startExport(async () => {
      const csv = await exportOrdersCsv({ dateFrom: params.dateFrom, dateTo: params.dateTo, companyId: params.companyId, status: params.status, payment: params.payment, nationality: params.nationality })
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `orders-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    })
  }

  const hasFilters = params.dateFrom || params.dateTo || params.companyId || params.status || params.payment || params.nationality
  const today = new Date().toISOString().split('T')[0]
  const isUpcoming = params.dateFrom === today && !params.dateTo

  const statusLabel = (code: string) => {
    const key = STATUS_LABEL_KEYS[code]
    return key ? at(key) : code
  }

  const inputStyle = {
    backgroundColor: C.inputBg,
    border: `1px solid ${C.border}`,
    borderRadius: '8px',
    padding: '8px 12px',
    fontSize: '0.875rem',
    color: C.text,
    outline: 'none',
  }

  const activeFilterCount = [params.dateFrom, params.dateTo, params.companyId, params.status, params.payment, params.nationality].filter(Boolean).length

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
        {at('orders.filters.upcoming')}
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
        {at('orders.filters.filters')} {activeFilterCount > 0 ? `(${activeFilterCount})` : '▾'}
      </button>
      {hasFilters && (
        <button
          onClick={clearFilters}
          style={{
            ...inputStyle, cursor: 'pointer', minHeight: 40, paddingLeft: 14, paddingRight: 14,
            border: `1px solid ${C.wine}`, color: C.wine, backgroundColor: '#fdf2f3', fontWeight: 500,
          }}
        >
          {at('orders.filters.clear')}
        </button>
      )}
    </div>

    {/* ── Mobile expanded filter panel ───────────────────────── */}
    {mobileFiltersOpen && (
      <div className="md:hidden flex flex-col gap-3 p-3 rounded-xl border mt-2" style={{ borderColor: C.border, backgroundColor: C.bg }}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>{at('orders.filters.from')}</label>
            <DateInput value={localDateFrom} onChange={v => { setLocalDateFrom(v); update('dateFrom', v) }} style={{ ...inputStyle, minHeight: 40 }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>{at('orders.filters.to')}</label>
            <DateInput value={localDateTo} onChange={v => { setLocalDateTo(v); update('dateTo', v) }} style={{ ...inputStyle, minHeight: 40 }} />
          </div>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>{at('orders.filters.filterBy')}</label>
          <select
            value={params.companyId ?? ''}
            onChange={e => update('companyId', e.target.value)}
            style={{ ...inputStyle, width: '100%', minHeight: 40 }}
          >
            <option value="">{at('orders.filters.allBookings')}</option>
            <option value="__individual__">{at('orders.filters.individualsOnly')}</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>{at('orders.filters.status')}</label>
          <select
            value={params.status ?? ''}
            onChange={e => update('status', e.target.value)}
            style={{ ...inputStyle, width: '100%', minHeight: 40 }}
          >
            <option value="">{at('orders.filters.allStatuses')} ({Object.values(statusCounts).reduce((a, b) => a + b, 0)})</option>
            {processSteps.map(step => {
              const count = statusCounts[step.code] ?? 0
              return <option key={step.code} value={step.code} disabled={count === 0}>{statusLabel(step.code)} ({count})</option>
            })}
            {(statusCounts[LIMBO_STATUS] ?? 0) > 0 && (
              <option value={LIMBO_STATUS}>{at('orders.status.pendingPayment')} ({statusCounts[LIMBO_STATUS]})</option>
            )}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>{at('orders.filters.payment')}</label>
          <select
            value={params.payment ?? ''}
            onChange={e => update('payment', e.target.value)}
            style={{ ...inputStyle, width: '100%', minHeight: 40 }}
          >
            <option value="">{at('orders.filters.allPayments')}</option>
            {financialSteps.map(step => {
              const count = paymentCounts[step.code] ?? 0
              return <option key={step.code} value={step.code} disabled={count === 0}>{statusLabel(step.code)} ({count})</option>
            })}
          </select>
        </div>
        {nationalityOptions.length > 0 && (
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>{at('orders.filters.nationality')}</label>
            <select
              value={params.nationality ?? ''}
              onChange={e => update('nationality', e.target.value)}
              style={{ ...inputStyle, width: '100%', minHeight: 40 }}
            >
              <option value="">{at('orders.filters.allNationalities')}</option>
              {nationalityOptions.map(code => <option key={code} value={code}>{countryName(code)}</option>)}
            </select>
          </div>
        )}
      </div>
    )}

    {/* ── Desktop full filter bar (hidden on mobile) ─────────── */}
    <div className="hidden md:flex flex-wrap items-end gap-3" style={{ opacity: isNavigating ? 0.6 : 1, transition: 'opacity 0.15s' }}>

      {/* Quick */}
      <div>
        <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>{at('orders.filters.quick')}</label>
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
          {at('orders.filters.upcoming')}
        </button>
      </div>

      {/* Date range */}
      <div>
        <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>{at('orders.filters.from')}</label>
        <DateInput value={localDateFrom} onChange={v => { setLocalDateFrom(v); update('dateFrom', v) }} style={inputStyle} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>{at('orders.filters.to')}</label>
        <DateInput value={localDateTo} onChange={v => { setLocalDateTo(v); update('dateTo', v) }} style={inputStyle} />
      </div>

      {/* Booking type / company */}
      <div>
        <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>{at('orders.filters.filterBy')}</label>
        <select
          value={params.companyId ?? ''}
          onChange={e => update('companyId', e.target.value)}
          style={{ ...inputStyle, minWidth: 180 }}
        >
          <option value="">{at('orders.filters.allBookings')}</option>
          <option value="__individual__">{at('orders.filters.individualsOnly')}</option>
          {companies.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Status */}
      <div>
        <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>{at('orders.filters.status')}</label>
        <select
          value={params.status ?? ''}
          onChange={e => update('status', e.target.value)}
          style={{ ...inputStyle, minWidth: 160 }}
        >
          <option value="">
            {at('orders.filters.allStatuses')} ({Object.values(statusCounts).reduce((a, b) => a + b, 0)})
          </option>
          {processSteps.map(step => {
            const count = statusCounts[step.code] ?? 0
            return (
              <option key={step.code} value={step.code} disabled={count === 0}>
                {statusLabel(step.code)} ({count})
              </option>
            )
          })}
          {(statusCounts[LIMBO_STATUS] ?? 0) > 0 && (
            <option value={LIMBO_STATUS}>
              {at('orders.status.pendingPayment')} ({statusCounts[LIMBO_STATUS]})
            </option>
          )}
        </select>
      </div>

      {/* Payment — the second axis. Separate from Status rather than more
          entries in it, so the two AND together: "Completed" + "Unpaid" is the
          list of visits still owing, which the old single column could not
          express at all. */}
      <div>
        <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>{at('orders.filters.payment')}</label>
        <select
          value={params.payment ?? ''}
          onChange={e => update('payment', e.target.value)}
          style={{ ...inputStyle, minWidth: 140 }}
        >
          <option value="">{at('orders.filters.allPayments')}</option>
          {financialSteps.map(step => {
            const count = paymentCounts[step.code] ?? 0
            return (
              <option key={step.code} value={step.code} disabled={count === 0}>
                {statusLabel(step.code)} ({count})
              </option>
            )
          })}
        </select>
      </div>

      {/* Nationality (Plan-CompanyNationality) — only shown once at least one order has one */}
      {nationalityOptions.length > 0 && (
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>{at('orders.filters.nationality')}</label>
          <select
            value={params.nationality ?? ''}
            onChange={e => update('nationality', e.target.value)}
            style={{ ...inputStyle, minWidth: 160 }}
          >
            <option value="">{at('orders.filters.allNationalities')}</option>
            {nationalityOptions.map(code => <option key={code} value={code}>{countryName(code)}</option>)}
          </select>
        </div>
      )}

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
            {at('orders.filters.clearFilters')}
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
          {isExporting ? at('orders.filters.exporting') : at('orders.filters.exportCsv')}
        </button>
      </div>

      {/* Print booking sheet — OrdersTable holds the filtered order data, so this just
          asks it to open the print preview via a same-page custom event. */}
      <div>
        <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>&nbsp;</label>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('ordersPrintRequested'))}
            className="flex items-center gap-1.5 rounded-lg border text-xs font-medium"
            style={{ ...inputStyle, padding: '8px 12px', width: 'auto', cursor: 'pointer' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            {at('orders.filters.printSheet')}
          </button>
          <HelpHint text={at('help.orders.printSheet')} />
        </div>
      </div>

      {/* Columns picker — right-aligned in the same row */}
      <div className="relative ml-auto" ref={columnsPickerRef}>
        <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>&nbsp;</label>
        <button
          onClick={() => setColumnsOpen(o => !o)}
          className="flex items-center gap-1.5 rounded-lg border text-xs font-medium"
          style={{ ...inputStyle, padding: '8px 12px', width: 'auto', cursor: 'pointer' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18"/></svg>
          {at('orders.filters.columns')}
        </button>
        {columnsOpen && (
          <div
            className="absolute right-0 z-40 rounded-xl border shadow-lg py-2 mt-1"
            style={{ backgroundColor: C.bg, borderColor: C.border, minWidth: 180 }}
          >
            <div className="px-3 pb-1 mb-1 border-b" style={{ borderColor: C.border }}>
              <span className="text-xs font-semibold" style={{ color: C.faint }}>{at('orders.filters.showHideColumns')}</span>
            </div>
            {COLUMN_DEFS.map(c => (
              <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-amber-50">
                <input
                  type="checkbox"
                  checked={visibleCols.has(c.id)}
                  onChange={() => toggleCol(c.id)}
                  style={{ accentColor: C.wine }}
                />
                <span className="text-xs" style={{ color: C.text }}>{at(c.labelKey)}</span>
              </label>
            ))}
          </div>
        )}
      </div>

    </div>

    {/* Progress bar */}
    <div style={{ height: 2, backgroundColor: 'var(--site-border)', borderRadius: 2, marginTop: 10, overflow: 'hidden' }}>
      {isNavigating && (
        <div style={{
          height: '100%',
          backgroundColor: 'var(--color-brand)',
          borderRadius: 2,
          animation: 'nav-progress 1s ease-out forwards',
        }} />
      )}
    </div>
    </>
  )
}
