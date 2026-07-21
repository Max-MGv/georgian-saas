'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip,
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

const WINE_LINE_COLORS = [
  'var(--color-brand)', '#2563eb', '#16a34a', '#ca8a04',
  '#7c3aed', '#dc2626', '#0891b2', '#ea580c',
]

const tooltipStyle = {
  contentStyle: { backgroundColor: '#fff9f3', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 },
  labelStyle: { color: C.muted, fontWeight: 600 },
  itemStyle: { color: C.text },
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

export type WineOrderStat = {
  id: string
  businessName: string
  wines: { id: string; name: string; quantity: number; price?: number }[]
  displayTotal: number
  status: string
  createdAt: string
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border p-5 text-center" style={{ borderColor: C.border, backgroundColor: C.bg }}>
      <p className="text-xs font-medium mb-1" style={{ color: C.muted }}>{label}</p>
      <p className="text-2xl font-bold" style={{ color: C.text }}>{value}</p>
      {sub && <p className="text-xs mt-1" style={{ color: C.faint }}>{sub}</p>}
    </div>
  )
}

// SVG icons for chart mode switcher
function BarIcon({ active }: { active: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="7" width="3" height="6" rx="0.5" fill={active ? '#fff' : C.faint} />
      <rect x="5.5" y="4" width="3" height="9" rx="0.5" fill={active ? '#fff' : C.faint} />
      <rect x="10" y="1" width="3" height="12" rx="0.5" fill={active ? '#fff' : C.faint} />
    </svg>
  )
}

function TrendIcon({ active }: { active: boolean }) {
  const color = active ? '#fff' : C.faint
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <polyline points="1,11 4,7 7,9 11,3 13,5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <polyline points="10,3 13,3 13,6" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

type WineChartMode = 'bar' | 'trend'

export default function WineStatistics({ orders, locale = 'en' }: { orders: WineOrderStat[]; locale?: string }) {
  const at = (key: string, vars?: Record<string, string | number>) => adminT(locale, key, vars)
  const MONTH_LABELS = MONTH_KEYS.map(k => at(`statistics.month.${k}`))
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])
  const currentYear = today.getFullYear()

  const availableYears = useMemo(() => {
    const years = new Set(orders.map(o => new Date(o.createdAt).getFullYear()))
    years.add(currentYear)
    return Array.from(years).sort((a, b) => b - a)
  }, [orders, currentYear])

  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [selectedMonth, setSelectedMonth] = useState<number | ''>('')
  const [selectedCustomer, setSelectedCustomer] = useState('')
  const [wineChartMode, setWineChartMode] = useState<WineChartMode>('bar')
  const [selectedWines, setSelectedWines] = useState<Set<string>>(new Set())

  // Chart container widths — used to align bar labels at a fixed right-edge column
  const [topWinesRef, topWinesWidth] = useContainerWidth()
  const [revenueRef, revenueWidth] = useContainerWidth()

  // Unique business names for the customer combobox
  const customerOptions = useMemo(() => {
    const names = Array.from(new Set(orders.map(o => o.businessName))).sort()
    return [{ value: '', label: at('statistics.filters.allCustomers') }, ...names.map(n => ({ value: n, label: n }))]
  }, [orders, locale])

  // Orders filtered by year + month + customer for most charts
  const filtered = useMemo(() => orders.filter(o => {
    const d = new Date(o.createdAt)
    if (d.getFullYear() !== selectedYear) return false
    if (selectedMonth !== '' && d.getMonth() !== selectedMonth) return false
    if (selectedCustomer && o.businessName !== selectedCustomer) return false
    return true
  }), [orders, selectedYear, selectedMonth, selectedCustomer])

  // Orders filtered only by year + customer — used for the trend chart
  const yearOrders = useMemo(() => orders.filter(o => {
    if (new Date(o.createdAt).getFullYear() !== selectedYear) return false
    if (selectedCustomer && o.businessName !== selectedCustomer) return false
    return true
  }), [orders, selectedYear, selectedCustomer])

  // All wine names present in the selected year (for trend toggles)
  const allWineNames = useMemo(() => {
    const counts: Record<string, number> = {}
    yearOrders.forEach(o => o.wines.forEach(w => {
      counts[w.name] = (counts[w.name] ?? 0) + w.quantity
    }))
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name]) => name)
  }, [yearOrders])

  // Stable color map for wines
  const wineColorMap = useMemo(() => {
    const map: Record<string, string> = {}
    allWineNames.forEach((name, i) => { map[name] = WINE_LINE_COLORS[i % WINE_LINE_COLORS.length] })
    return map
  }, [allWineNames])

  // Default: select top 4 wines when year changes or wine names change
  useEffect(() => {
    setSelectedWines(new Set(allWineNames.slice(0, 4)))
  }, [allWineNames])

  function toggleWine(name: string) {
    setSelectedWines(prev => {
      const next = new Set(prev)
      if (next.has(name)) { next.delete(name) } else { next.add(name) }
      return next
    })
  }

  // Summary stats
  const totalOrders = filtered.length
  const totalRevenue = Math.round(filtered.reduce((s, o) => s + o.displayTotal, 0))
  const activeOrders = filtered.filter(o => o.status !== 'delivered' && o.status !== 'cancelled').length
  const avgOrder = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0

  // Revenue by period
  const revenueByPeriod = useMemo(() => {
    if (selectedMonth !== '') {
      const daysInMonth = new Date(selectedYear, (selectedMonth as number) + 1, 0).getDate()
      const days: Record<number, number> = {}
      filtered.forEach(o => {
        const day = new Date(o.createdAt).getDate()
        days[day] = (days[day] ?? 0) + o.displayTotal
      })
      return Array.from({ length: daysInMonth }, (_, i) => ({
        label: String(i + 1),
        revenue: Math.round(days[i + 1] ?? 0),
      })).filter(d => d.revenue > 0)
    } else {
      const monthly: Record<number, number> = {}
      filtered.forEach(o => {
        const m = new Date(o.createdAt).getMonth()
        monthly[m] = (monthly[m] ?? 0) + o.displayTotal
      })
      return Object.entries(monthly)
        .map(([m, revenue]) => ({ label: MONTH_LABELS[Number(m)], revenue: Math.round(revenue), idx: Number(m) }))
        .sort((a, b) => a.idx - b.idx)
    }
  }, [filtered, selectedYear, selectedMonth])

  // Top wines (bar chart) — from filtered orders
  const topWines = useMemo(() => {
    const map: Record<string, { name: string; bottles: number; revenue: number }> = {}
    filtered.forEach(o => {
      o.wines.forEach(w => {
        if (!map[w.name]) map[w.name] = { name: w.name, bottles: 0, revenue: 0 }
        map[w.name].bottles += w.quantity
        map[w.name].revenue += w.quantity * (w.price ?? 0)
      })
    })
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 8)
  }, [filtered])

  // Trend data — bottles per wine per month, full year (ignores month filter intentionally)
  const trendData = useMemo(() => {
    return MONTH_LABELS.map((label, monthIdx) => {
      const monthOrders = yearOrders.filter(o => new Date(o.createdAt).getMonth() === monthIdx)
      const entry: Record<string, number | string> = { month: label }
      allWineNames.forEach(name => {
        let qty = 0
        monthOrders.forEach(o => o.wines.forEach(w => { if (w.name === name) qty += w.quantity }))
        entry[name] = qty
      })
      return entry
    })
  }, [yearOrders, allWineNames])

  // Top customers
  const topCustomers = useMemo(() => {
    const map: Record<string, { name: string; orders: number; revenue: number }> = {}
    filtered.forEach(o => {
      if (!map[o.businessName]) map[o.businessName] = { name: o.businessName, orders: 0, revenue: 0 }
      map[o.businessName].orders++
      map[o.businessName].revenue += o.displayTotal
    })
    return Object.values(map)
      .map(c => ({ ...c, revenue: Math.round(c.revenue) }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
  }, [filtered])

  const periodLabel = selectedMonth !== ''
    ? `${MONTH_LABELS[selectedMonth as number]} ${selectedYear}`
    : String(selectedYear)

  if (orders.length === 0) {
    return (
      <div className="text-center py-20 text-sm" style={{ color: C.faint }}>
        {at('wineOrders.noOrdersYet')}
      </div>
    )
  }

  const modeBtnStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '4px 10px', borderRadius: 7, fontSize: '0.75rem', fontWeight: 500,
    backgroundColor: active ? C.wine : 'transparent',
    color: active ? '#fff' : C.muted,
    border: 'none', cursor: 'pointer', transition: 'all 0.15s',
  })

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card label={at('statistics.card.totalOrders')} value={String(totalOrders)} sub={periodLabel} />
        <Card label={at('statistics.card.totalRevenue')} value={`${totalRevenue.toLocaleString()}₾`} sub={periodLabel} />
        <Card label={at('statistics.card.activeOrders')} value={String(activeOrders)} sub={at('statistics.activeOrdersSub')} />
        <Card label={at('statistics.card.avgOrderValueWine')} value={`${avgOrder.toLocaleString()}₾`} sub={at('statistics.perWineOrder')} />
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
          <label style={{ display: 'block', fontSize: '0.75rem', color: C.muted, marginBottom: 4 }}>{at('statistics.filters.customer')}</label>
          <SearchableSelect
            value={selectedCustomer}
            onChange={setSelectedCustomer}
            options={customerOptions}
            placeholder={at('statistics.filters.allCustomers')}
            minWidth={180}
            locale={locale}
          />
        </div>
        {(selectedMonth !== '' || selectedCustomer) && (
          <button
            onClick={() => { setSelectedMonth(''); setSelectedCustomer('') }}
            className="text-sm px-3 py-2 rounded-lg"
            style={{ backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' }}
          >
            {at('statistics.clearFilters')}
          </button>
        )}
      </div>

      {/* Top wines — bar / trend (full width) */}
      <div className="rounded-xl border p-5" style={{ borderColor: C.border, backgroundColor: '#ffffff' }}>
        {/* Header row */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold" style={{ color: C.text }}>
            {wineChartMode === 'bar' ? at('statistics.topWinesRevenue') : at('statistics.wineTrends', { year: selectedYear })}
          </p>
          <div className="flex gap-0.5 p-0.5 rounded-lg" style={{ backgroundColor: C.border }}>
            <button style={modeBtnStyle(wineChartMode === 'bar')} onClick={() => setWineChartMode('bar')}>
              <BarIcon active={wineChartMode === 'bar'} /> {at('statistics.bars')}
            </button>
            <button style={modeBtnStyle(wineChartMode === 'trend')} onClick={() => setWineChartMode('trend')}>
              <TrendIcon active={wineChartMode === 'trend'} /> {at('statistics.trend')}
            </button>
          </div>
        </div>

        {/* Bar mode */}
        {wineChartMode === 'bar' && (
          topWines.length === 0 ? (
            <p className="text-sm text-center py-10" style={{ color: C.faint }}>{at('statistics.noDataPeriod')}</p>
          ) : (
            <div ref={topWinesRef}>
              <ResponsiveContainer width="100%" height={Math.max(200, topWines.length * 44)}>
                <BarChart data={topWines} layout="vertical" barSize={22} margin={{ right: 72 }}>
                  <CartesianGrid horizontal={false} stroke={C.border} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} tickFormatter={v => `${v}₾`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} width={110} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const d = payload[0].payload
                      return (
                        <div style={{ backgroundColor: '#fff9f3', border: `1px solid ${C.border}`, borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
                          <p style={{ fontWeight: 600, color: C.text, marginBottom: 4 }}>{d.name}</p>
                          <p style={{ color: C.wine }}>{(d.revenue ?? 0).toLocaleString()}₾</p>
                          <p style={{ color: C.muted }}>{d.bottles} {d.bottles !== 1 ? at('statistics.bottle.plural') : at('statistics.bottle.singular')}</p>
                        </div>
                      )
                    }}
                  />
                  <Bar dataKey="revenue" fill="#a0392a" radius={[0, 4, 4, 0]}>
                    <LabelList content={(props: any) => {
                      const { y, height: bh, value } = props
                      if (!value || value === 0) return <g />
                      return <text x={topWinesWidth - 4} y={(y ?? 0) + (bh ?? 0) / 2} textAnchor="end" dominantBaseline="middle" fill={C.muted} fontSize={11} fontWeight={500}>{`${Number(value).toLocaleString()}₾`}</text>
                    }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )
        )}

        {/* Trend mode */}
        {wineChartMode === 'trend' && (
          allWineNames.length === 0 ? (
            <p className="text-sm text-center py-10" style={{ color: C.faint }}>{at('statistics.noDataForYear', { year: selectedYear })}</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mb-4">
                {allWineNames.map(name => {
                  const isOn = selectedWines.has(name)
                  const color = wineColorMap[name]
                  return (
                    <button
                      key={name}
                      onClick={() => toggleWine(name)}
                      className="flex items-center gap-1.5 rounded-full transition-all duration-150"
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: isOn ? 600 : 400,
                        padding: '4px 10px',
                        backgroundColor: isOn ? `${color}18` : '#faf7f3',
                        border: `1px solid ${isOn ? color : C.border}`,
                        color: isOn ? color : C.faint,
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        backgroundColor: isOn ? color : C.border,
                        display: 'inline-block',
                      }} />
                      {name}
                    </button>
                  )
                })}
              </div>

              {selectedWines.size === 0 ? (
                <p className="text-sm text-center py-8" style={{ color: C.faint }}>
                  {at('statistics.selectAtLeastOneWine')}
                </p>
              ) : (
                <>
                  <p className="text-xs mb-3" style={{ color: C.faint }}>
                    {at('statistics.showingFullYear')}
                  </p>
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={trendData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke={C.border} />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.faint }} axisLine={false} tickLine={false} width={28} />
                      <Tooltip
                        {...tooltipStyle}
                        formatter={(v: unknown, name: unknown) => [`${Number(v)} ${Number(v) !== 1 ? at('statistics.bottle.plural') : at('statistics.bottle.singular')}`, String(name ?? '')]}
                      />
                      {Array.from(selectedWines).map(name => (
                        <Line
                          key={name}
                          type="monotone"
                          dataKey={name}
                          stroke={wineColorMap[name]}
                          strokeWidth={2}
                          dot={{ r: 3, fill: wineColorMap[name], strokeWidth: 0 }}
                          activeDot={{ r: 5, strokeWidth: 0 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </>
              )}
            </>
          )
        )}
      </div>

      {/* Top customers + Revenue by month */}
      <div className="grid lg:grid-cols-2 gap-6">

        {/* Top customers */}
        <div className="rounded-xl border p-5" style={{ borderColor: C.border, backgroundColor: '#ffffff' }}>
          <p className="text-sm font-semibold mb-4" style={{ color: C.text }}>{at('statistics.topCustomers', { period: periodLabel })}</p>
          {topCustomers.length === 0 ? (
            <p className="text-sm" style={{ color: C.faint }}>{at('statistics.noOrdersPeriod')}</p>
          ) : (
            <div className="space-y-3">
              {topCustomers.map((c, i) => (
                <div key={c.name} className="flex items-center gap-3">
                  <span className="text-xs w-4 text-right" style={{ color: C.faint }}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm font-medium truncate" style={{ color: C.text }}>{c.name}</span>
                      <span className="text-sm font-semibold ml-2 shrink-0" style={{ color: C.wine }}>{c.revenue.toLocaleString()}₾</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: C.border }}>
                      <div style={{
                        width: `${Math.round((c.revenue / (topCustomers[0]?.revenue || 1)) * 100)}%`,
                        backgroundColor: C.wine,
                        height: '100%',
                      }} />
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: C.faint }}>{c.orders} {c.orders !== 1 ? at('packing.order.plural') : at('packing.order.singular')}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Revenue by period */}
        <div className="rounded-xl border p-5" style={{ borderColor: C.border, backgroundColor: '#ffffff' }}>
          <p className="text-sm font-semibold mb-4" style={{ color: C.text }}>
            {selectedMonth !== ''
              ? at('statistics.revenueByDay', { month: MONTH_LABELS[selectedMonth as number], year: selectedYear })
              : at('statistics.revenueByMonth', { year: selectedYear })}
          </p>
          {revenueByPeriod.length === 0 ? (
            <p className="text-sm text-center py-10" style={{ color: C.faint }}>{at('statistics.noDataPeriod')}</p>
          ) : (
            <div ref={revenueRef}>
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
                      return <text x={revenueWidth - 4} y={(y ?? 0) + (bh ?? 0) / 2} textAnchor="end" dominantBaseline="middle" fill={C.muted} fontSize={11} fontWeight={500}>{`${Number(value).toLocaleString()}₾`}</text>
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
