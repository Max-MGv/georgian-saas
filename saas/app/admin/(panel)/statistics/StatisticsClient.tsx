'use client'

import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, LabelList,
} from 'recharts'
import StatisticsV2 from './StatisticsV2'
import WineStatistics, { type WineOrderStat } from './WineStatistics'

const C = {
  text: '#1c1008', muted: '#6b5a47', faint: '#a89070',
  border: '#e0d4c0', bg: '#fff9f3', wine: 'var(--color-brand)', wineLight: '#f3e8e9',
}

type MonthData = { month: string; orders: number; revenue: number }
type Order = { id: string; date: string; totalPrice: number; companyId: string | null; companyName: string | null }
type Company = { id: string; name: string }
type Props = {
  bookingOn: boolean
  wineOrdersOn: boolean
  totalOrders: number
  totalRevenue: number
  monthOrders: number
  monthRevenue: number
  byMonth: MonthData[]
  byVisitType: {
    tastingOrders: number; tastingRevenue: number
    tastingLunchOrders: number; tastingLunchRevenue: number
  }
  byBookingType: {
    individualOrders: number; individualRevenue: number
    companyOrders: number; companyRevenue: number
  }
  topCompanies: { name: string; orders: number; revenue: number }[]
  orders: Order[]
  companies: Company[]
  wineOrders: WineOrderStat[]
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

function SplitRow({ label, a, b, aLabel, bLabel }: {
  label: string; a: number; b: number; aLabel: string; bLabel: string
}) {
  const total = a + b || 1
  const aPct = Math.round((a / total) * 100)
  return (
    <div className="mb-5">
      <p className="text-xs font-medium mb-2" style={{ color: C.muted }}>{label}</p>
      <div className="flex rounded-full overflow-hidden h-2 mb-2" style={{ backgroundColor: C.border }}>
        <div style={{ width: `${aPct}%`, backgroundColor: C.wine }} />
      </div>
      <div className="flex justify-between text-xs" style={{ color: C.faint }}>
        <span>{aLabel}: {a} ({aPct}%)</span>
        <span>{bLabel}: {b} ({100 - aPct}%)</span>
      </div>
    </div>
  )
}

const tooltipStyle = {
  contentStyle: { backgroundColor: '#fff9f3', border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 },
  labelStyle: { color: C.muted, fontWeight: 600 },
  itemStyle: { color: C.text },
}

type Mode = 'bookings' | 'wine'

export default function StatisticsClient({
  bookingOn, wineOrdersOn,
  totalOrders, totalRevenue, monthOrders, monthRevenue,
  byMonth, byVisitType, byBookingType, topCompanies,
  orders, companies, wineOrders,
}: Props) {
  const [mode, setMode] = useState<Mode>(bookingOn ? 'bookings' : 'wine')
  const [showV1, setShowV1] = useState(false)
  const avgRevenue = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0

  if (!bookingOn && !wineOrdersOn) {
    return (
      <p className="text-sm" style={{ color: C.faint }}>
        No modules enabled for this tenant — nothing to show statistics for.
      </p>
    )
  }

  return (
    <div className="space-y-6">

      {/* Mode switcher — only when both modules are on */}
      {bookingOn && wineOrdersOn && (
        <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ backgroundColor: C.border }}>
          {([['bookings', 'Bookings'], ['wine', 'Wine Orders']] as [Mode, string][]).map(([m, label]) => (
            <button
              key={m}
              onClick={() => { setMode(m); setShowV1(false) }}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150"
              style={{
                backgroundColor: mode === m ? C.wine : 'transparent',
                color: mode === m ? '#fff' : C.muted,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Wine Orders view */}
      {wineOrdersOn && mode === 'wine' && (
        <WineStatistics orders={wineOrders} />
      )}

      {/* Bookings view */}
      {bookingOn && mode === 'bookings' && !showV1 && (
        <>
          <StatisticsV2 orders={orders} companies={companies} />
          <div className="flex justify-center pt-2">
            <button
              onClick={() => setShowV1(true)}
              className="text-sm px-4 py-2 rounded-lg border transition-opacity hover:opacity-70"
              style={{ borderColor: C.border, color: C.muted, backgroundColor: C.bg }}
            >
              Show historical breakdown →
            </button>
          </div>
        </>
      )}

      {/* Bookings V1 historical view */}
      {mode === 'bookings' && showV1 && (
        <>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowV1(false)}
              className="text-sm px-4 py-2 rounded-lg border transition-opacity hover:opacity-70"
              style={{ borderColor: C.border, color: C.muted, backgroundColor: C.bg }}
            >
              ← Back to overview
            </button>
            <p className="text-sm" style={{ color: C.faint }}>Historical breakdown — all time</p>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Card label="Total Orders" value={String(totalOrders)} sub="all time" />
            <Card label="Total Revenue" value={`${totalRevenue.toLocaleString()}₾`} sub="all time" />
            <Card label="This Month" value={String(monthOrders)} sub={`${monthRevenue.toLocaleString()}₾ revenue`} />
            <Card label="Avg. Order Value" value={`${avgRevenue}₾`} sub="per booking" />
          </div>

          {/* Charts */}
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="rounded-xl border p-5" style={{ borderColor: C.border, backgroundColor: '#ffffff' }}>
              <p className="text-sm font-semibold mb-4" style={{ color: C.text }}>Bookings — last 6 months</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={byMonth} barSize={28} margin={{ top: 20 }}>
                  <CartesianGrid vertical={false} stroke={C.border} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip {...tooltipStyle} formatter={(v) => [v ?? 0, 'bookings']} />
                  <Bar dataKey="orders" fill={C.wine} radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="orders" position="top" style={{ fill: C.muted, fontSize: 11, fontWeight: 500 }} formatter={(v: unknown) => Number(v) > 0 ? String(v) : ''} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl border p-5" style={{ borderColor: C.border, backgroundColor: '#ffffff' }}>
              <p className="text-sm font-semibold mb-4" style={{ color: C.text }}>Revenue ₾ — last 6 months</p>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={byMonth} barSize={28} margin={{ top: 20 }}>
                  <CartesianGrid vertical={false} stroke={C.border} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: C.muted }} axisLine={false} tickLine={false} width={48} />
                  <Tooltip {...tooltipStyle} formatter={(v) => [`${Number(v ?? 0).toLocaleString()}₾`, 'revenue']} />
                  <Bar dataKey="revenue" fill="#a0392a" radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="revenue" position="top" style={{ fill: C.muted, fontSize: 11, fontWeight: 500 }} formatter={(v: unknown) => Number(v) > 0 ? `${Number(v).toLocaleString()}₾` : ''} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Breakdowns + top companies */}
          <div className="grid lg:grid-cols-2 gap-6">
            <div className="rounded-xl border p-5" style={{ borderColor: C.border, backgroundColor: '#ffffff' }}>
              <p className="text-sm font-semibold mb-5" style={{ color: C.text }}>Breakdown</p>
              <SplitRow
                label="By visit type (orders)"
                a={byVisitType.tastingOrders}
                b={byVisitType.tastingLunchOrders}
                aLabel="Tasting"
                bLabel="Tasting + Lunch"
              />
              <SplitRow
                label="By visit type (revenue ₾)"
                a={byVisitType.tastingRevenue}
                b={byVisitType.tastingLunchRevenue}
                aLabel={`Tasting ${byVisitType.tastingRevenue.toLocaleString()}₾`}
                bLabel={`+Lunch ${byVisitType.tastingLunchRevenue.toLocaleString()}₾`}
              />
              <SplitRow
                label="By booking type (orders)"
                a={byBookingType.individualOrders}
                b={byBookingType.companyOrders}
                aLabel="Individual"
                bLabel="Company"
              />
              <SplitRow
                label="By booking type (revenue ₾)"
                a={byBookingType.individualRevenue}
                b={byBookingType.companyRevenue}
                aLabel={`Individual ${byBookingType.individualRevenue.toLocaleString()}₾`}
                bLabel={`Company ${byBookingType.companyRevenue.toLocaleString()}₾`}
              />
            </div>

            <div className="rounded-xl border p-5" style={{ borderColor: C.border, backgroundColor: '#ffffff' }}>
              <p className="text-sm font-semibold mb-4" style={{ color: C.text }}>Top Companies</p>
              {topCompanies.length === 0 ? (
                <p className="text-sm" style={{ color: C.faint }}>No company bookings yet.</p>
              ) : (
                <div className="space-y-3">
                  {topCompanies.map((c, i) => (
                    <div key={c.name} className="flex items-center gap-3">
                      <span className="text-xs w-4 text-right" style={{ color: C.faint }}>{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline">
                          <span className="text-sm font-medium truncate" style={{ color: C.text }}>{c.name}</span>
                          <span className="text-sm font-semibold ml-2 shrink-0" style={{ color: C.wine }}>{c.revenue.toLocaleString()}₾</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: C.border }}>
                          <div
                            style={{
                              width: `${Math.round((c.revenue / topCompanies[0].revenue) * 100)}%`,
                              backgroundColor: C.wine,
                              height: '100%',
                            }}
                          />
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: C.faint }}>{c.orders} booking{c.orders !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
