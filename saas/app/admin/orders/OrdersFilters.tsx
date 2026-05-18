'use client'

import { useRouter, usePathname } from 'next/navigation'
import type { Company } from '@prisma/client'

const C = {
  border: '#e0d4c0',
  muted: '#6b5a47',
  inputBg: '#fffdf9',
  text: '#1c1008',
  wine: '#7c1d23',
}

type Props = {
  companies: Company[]
  params: { dateFrom?: string; dateTo?: string; companyId?: string }
}

export default function OrdersFilters({ companies, params }: Props) {
  const router = useRouter()
  const pathname = usePathname()

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

  function clearFilters() {
    router.push(pathname)
  }

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

      {/* Quick buttons */}
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
        <input
          type="date"
          value={params.dateFrom ?? ''}
          onChange={e => update('dateFrom', e.target.value)}
          style={inputStyle}
        />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>To</label>
        <input
          type="date"
          value={params.dateTo ?? ''}
          onChange={e => update('dateTo', e.target.value)}
          style={inputStyle}
        />
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

      {hasFilters && (
        <button
          onClick={clearFilters}
          className="text-sm px-3 py-2 rounded-lg border"
          style={{ borderColor: C.border, color: C.muted }}
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
