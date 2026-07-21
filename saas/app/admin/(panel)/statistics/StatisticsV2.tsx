'use client'

import { useState, useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, LabelList,
} from 'recharts'
import SearchableSelect from './SearchableSelect'
import { useContainerWidth } from './useContainerWidth'
import { adminT } from '@/lib/adminT'

const C = {
  text: '#1c1008', muted: '#6b5a47', faint: '#a89070',
  border: '#e0d4c0', bg: '#fff9f3', wine: 'var(--color-brand)',
}

const MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

const tooltipStyle = {
  contentStyle: { backgroundColor: '#fff9f3', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 },
  labelStyle: { color: C.muted, fontWeight: 600 },
  itemStyle: { color: C.text },
}

type Order = { id: string; date: string; totalPrice: number; companyId: string | null; companyName: string | null }
type Company = { id: string; name: string }

type Props = { orders: Order[]; companies: Company[]; locale?: string }

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border p-5 text-center" style={{ borderColor: C.border, backgroundColor: C.bg }}>
      <p className="text-xs font-medium mb-1" style={{ color: C.muted }}>{label}</p>
      <p className="text-2xl font-bold" style={{ color: C.text }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: C.faint }}>{sub}</p>}
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  backgroundColor: '#fffdf9',
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: '0.875rem',
  color: C.text,
  outline: 'none',
}

export default function StatisticsV2({ orders, companies, locale = 'en' }: Props) {
  const at = (key: string, vars?: Record<string, string | number>) => adminT(locale, key, vars)
  const MONTH_LABELS = MONTH_KEYS.map(k => at(`statistics.month.${k}`))
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])
  const currentYear = today.getFullYear()

  const availableYears = useMemo(() => {
    const years = new Set(orders.map(o => new Date(o.date).getFullYear()))
    years.add(currentYear)
    years.add(currentYear + 1)
    return Array.from(years).sort((a, b) => b - a)
  }, [orders, currentYear])

  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [selectedMonth, setSelectedMonth] = useState<number | ''>('')   // '' = all
  const [selectedCompanyId, setSelectedCompanyId] = useState('')         // '' = all

  const [revenueChartRef, revenueChartWidth] = useContainerWidth()
  const [companyChartRef, companyChartWidth] = useContainerWidth()

  // Orders filtered by year + month + company
  const filteredOrders = useMemo(() => orders.filter(o => {
    const d = new Date(o.date)
    if (d.getFullYear() !== selectedYear) return false
    if (selectedMonth !== '' && d.getMonth() !== selectedMonth) return false
    if (selectedCompanyId && o.companyId !== selectedCompanyId) return false
    return true
  }), [orders, selectedYear, selectedMonth, selectedCompanyId])

  // Top cards — upcoming only (date >= today) within the filtered set
  const upcomingOrders = useMemo(() =>
    filteredOrders.filter(o => new Date(o.date) >= today),
    [filteredOrders, today])

  const upcomingCount = upcomingOrders.length
  const futureRevenue = Math.round(upcomingOrders.reduce((s, o) => s + o.totalPrice, 0))
  const nextOrder = upcomingOrders.length > 0
    ? upcomingOrders.reduce((min, o) => new Date(o.date) < new Date(min.date) ? o : min)
    : null
  const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const nextOrderDate = nextOrder
    ? (() => {
        const d = new Date(nextOrder.date)
        return `${at(`orders.calendar.${WEEKDAY_KEYS[d.getDay()]}`)}, ${d.getDate()} ${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`
      })()
    : '—'

  // Revenue by month or by day (if exactly 1 month selected)
  const revenueByPeriod = useMemo(() => {
    if (selectedMonth !== '') {
      // Daily breakdown
      const daysInMonth = new Date(selectedYear, (selectedMonth as number) + 1, 0).getDate()
      const days: Record<number, number> = {}
      filteredOrders.forEach(o => {
        const day = new Date(o.date).getDate()
        days[day] = (days[day] ?? 0) + o.totalPrice
      })
      return Array.from({ length: daysInMonth }, (_, i) => ({
        label: String(i + 1),
        revenue: Math.round(days[i + 1] ?? 0),
      }))
    } else {
      // Monthly — only months with data, ordered descending (latest first)
      const monthly: Record<number, number> = {}
      filteredOrders.forEach(o => {
        const m = new Date(o.date).getMonth()
        monthly[m] = (monthly[m] ?? 0) + o.totalPrice
      })
      return Object.entries(monthly)
        .map(([m, revenue]) => ({ label: MONTH_LABELS[Number(m)], revenue: Math.round(revenue), idx: Number(m) }))
        .sort((a, b) => b.idx - a.idx)
    }
  }, [filteredOrders, selectedYear, selectedMonth])

  // Revenue by company — all filtered orders, descending
  const revenueByCompany = useMemo(() => {
    const map: Record<string, { name: string; revenue: number }> = {}
    filteredOrders.forEach(o => {
      const key = o.companyId ?? '__individual__'
      const name = o.companyName ?? at('orders.type.individual')
      if (!map[key]) map[key] = { name, revenue: 0 }
      map[key].revenue += o.totalPrice
    })
    return Object.values(map)
      .map(c => ({ ...c, revenue: Math.round(c.revenue) }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [filteredOrders, locale])

  const periodLabel = selectedMonth !== '' ? `${MONTH_LABELS[selectedMonth as number]} ${selectedYear}` : `${selectedYear}`

  return (
    <div className="space-y-6">

      {/* Top cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card
          label={at('statistics.card.upcomingOrders')}
          value={String(upcomingCount)}
          sub={upcomingCount === 1 ? at('statistics.bookingAhead.singular') : at('statistics.bookingAhead.plural', { n: upcomingCount })}
        />
        <Card
          label={at('statistics.card.futureRevenue')}
          value={`${futureRevenue.toLocaleString()}₾`}
          sub={at('statistics.inPeriod', { period: periodLabel })}
        />
        <Card
          label={at('statistics.card.nextOrder')}
          value={nextOrderDate}
          sub={nextOrder?.companyName ?? (nextOrder ? at('orders.type.individual') : at('statistics.noUpcomingOrders'))}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>{at('statistics.filters.year')}</label>
          <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} style={selectStyle}>
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>{at('statistics.filters.month')}</label>
          <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value === '' ? '' : Number(e.target.value))} style={selectStyle}>
            <option value="">{at('statistics.filters.allMonths')}</option>
            {MONTH_LABELS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>{at('orders.col.company')}</label>
          <SearchableSelect
            value={selectedCompanyId}
            onChange={setSelectedCompanyId}
            options={[{ value: '', label: at('statistics.filters.allCompanies') }, ...companies.map(c => ({ value: c.id, label: c.name }))]}
            placeholder={at('statistics.filters.allCompanies')}
            minWidth={180}
            locale={locale}
          />
        </div>
        {(selectedMonth !== '' || selectedCompanyId) && (
          <button
            onClick={() => { setSelectedMonth(''); setSelectedCompanyId('') }}
            className="text-sm px-3 py-2 rounded-lg"
            style={{ backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}
          >
            {at('statistics.clearFilters')}
          </button>
        )}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-2 gap-6">

        {/* Revenue by month / day */}
        <div className="rounded-xl border p-5" style={{ borderColor: C.border, backgroundColor: '#ffffff' }}>
          <p className="text-sm font-semibold mb-4" style={{ color: C.text }}>
            {selectedMonth !== '' ? at('statistics.revenueByDay', { month: MONTH_LABELS[selectedMonth as number], year: selectedYear }) : at('statistics.revenueByMonth', { year: selectedYear })}
          </p>
          {revenueByPeriod.length === 0 ? (
            <p className="text-sm text-center py-10" style={{ color: C.faint }}>{at('statistics.noDataPeriod')}</p>
          ) : (
            <div ref={revenueChartRef}>
              <ResponsiveContainer width="100%" height={Math.max(200, revenueByPeriod.length * 36)}>
                <BarChart data={revenueByPeriod} layout="vertical" barSize={18} margin={{ right: 72 }}>
                  <CartesianGrid horizontal={false} stroke={C.border} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} tickFormatter={v => `${v}₾`} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} width={36} />
                  <Tooltip {...tooltipStyle} formatter={(v) => [`${Number(v).toLocaleString()}₾`, at('statistics.tooltip.revenue')]} />
                  <Bar dataKey="revenue" fill={C.wine} radius={[0, 4, 4, 0]}>
                    <LabelList content={(props: any) => {
                      const { y, height: bh, value } = props
                      if (!value || value === 0) return <g />
                      return <text x={revenueChartWidth - 4} y={(y ?? 0) + (bh ?? 0) / 2} textAnchor="end" dominantBaseline="middle" fill={C.muted} fontSize={11} fontWeight={500}>{`${Number(value).toLocaleString()}₾`}</text>
                    }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Revenue by company */}
        <div className="rounded-xl border p-5" style={{ borderColor: C.border, backgroundColor: '#ffffff' }}>
          <p className="text-sm font-semibold mb-4" style={{ color: C.text }}>{at('statistics.revenueByCompany', { period: periodLabel })}</p>
          {revenueByCompany.length === 0 ? (
            <p className="text-sm text-center py-10" style={{ color: C.faint }}>{at('statistics.noDataPeriod')}</p>
          ) : (
            <div ref={companyChartRef}>
              <ResponsiveContainer width="100%" height={Math.max(200, revenueByCompany.length * 48)}>
                <BarChart data={revenueByCompany} layout="vertical" barSize={22} margin={{ right: 72 }}>
                  <CartesianGrid horizontal={false} stroke={C.border} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} tickFormatter={v => `${v}₾`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} width={90} />
                  <Tooltip {...tooltipStyle} formatter={(v) => [`${Number(v).toLocaleString()}₾`, at('statistics.tooltip.revenue')]} />
                  <Bar dataKey="revenue" fill="#a0392a" radius={[0, 4, 4, 0]}>
                    <LabelList content={(props: any) => {
                      const { y, height: bh, value } = props
                      if (!value || value === 0) return <g />
                      return <text x={companyChartWidth - 4} y={(y ?? 0) + (bh ?? 0) / 2} textAnchor="end" dominantBaseline="middle" fill={C.muted} fontSize={11} fontWeight={500}>{`${Number(value).toLocaleString()}₾`}</text>
                    }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
