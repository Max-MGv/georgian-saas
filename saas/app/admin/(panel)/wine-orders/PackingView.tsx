'use client'

import { useState, useEffect, useRef } from 'react'

const C = {
  text: '#1c1008', muted: '#6b5a47', faint: '#a89070',
  border: '#e0d4c0', bg: '#fff9f3', wine: 'var(--color-brand)',
}

export type WineOrderItem = {
  id: string
  wineNameSnapshot: string
  vintageYearSnapshot: number
  priceSnapshot: number
  quantity: number
}

export type PackingOrder = {
  id: string
  businessName: string
  contactName: string
  contactPhone: string
  wineItems: WineOrderItem[]
  status: string
}

function itemLabel(i: WineOrderItem) {
  return `${i.wineNameSnapshot} · ${i.vintageYearSnapshot}`
}

export type BoxMode = 'six' | 'twelve' | 'optimal'
export type PackingLayoutType = 'a' | 'b' | 'c'

const BOX_MODE_CONFIG: Record<BoxMode, { label: string; sub: string }> = {
  six:     { label: 'Only 6',   sub: '6-bottle boxes only' },
  twelve:  { label: 'Only 12',  sub: '12-bottle boxes only' },
  optimal: { label: 'Optimal',  sub: 'Mix of 12 + 6 to minimise boxes' },
}

// ── Box calculation ────────────────────────────────────────────────────

type BoxResult = { totalBoxes: number; display: string }

function calcBoxes(bottles: number, mode: BoxMode): BoxResult {
  if (bottles === 0) return { totalBoxes: 0, display: '0 boxes' }

  if (mode === 'six') {
    const full = Math.floor(bottles / 6)
    const rem = bottles % 6
    const total = full + (rem > 0 ? 1 : 0)
    const display = rem > 0
      ? `${full > 0 ? full + ' full + ' : ''}1 partial (${rem}) — ${total} box${total !== 1 ? 'es' : ''} of 6`
      : `${full} box${full !== 1 ? 'es' : ''} of 6`
    return { totalBoxes: total, display }
  }

  if (mode === 'twelve') {
    const full = Math.floor(bottles / 12)
    const rem = bottles % 12
    const total = full + (rem > 0 ? 1 : 0)
    const display = rem > 0
      ? `${full > 0 ? full + ' full + ' : ''}1 partial (${rem}) — ${total} box${total !== 1 ? 'es' : ''} of 12`
      : `${full} box${full !== 1 ? 'es' : ''} of 12`
    return { totalBoxes: total, display }
  }

  // Optimal: 12s first, then 6 for small remainder
  const twelves = Math.floor(bottles / 12)
  const rem = bottles % 12
  if (rem === 0) {
    return { totalBoxes: twelves, display: `${twelves} box${twelves !== 1 ? 'es' : ''} of 12` }
  }
  if (rem <= 6) {
    const total = twelves + 1
    const parts = twelves > 0 ? [`${twelves}×12 full`, `1×6 partial (${rem})`] : [`1×6 partial (${rem})`]
    return { totalBoxes: total, display: `${parts.join(' + ')} — ${total} box${total !== 1 ? 'es' : ''}` }
  }
  // rem > 6: use another 12-bottle box
  const total = twelves + 1
  const parts = twelves > 0 ? [`${twelves}×12 full`, `1×12 partial (${rem})`] : [`1×12 partial (${rem})`]
  return { totalBoxes: total, display: `${parts.join(' + ')} — ${total} box${total !== 1 ? 'es' : ''}` }
}

// ── Summary computation ────────────────────────────────────────────────

type SummaryCompany = {
  order: PackingOrder
  wines: WineOrderItem[]
  bottles: number
  boxes: BoxResult
}

type Summary = {
  wineMap: Record<string, number>
  totalBottles: number
  totalBoxes: number
  perCompany: SummaryCompany[]
}

function computeSummary(orders: PackingOrder[], mode: BoxMode): Summary {
  const wineMap: Record<string, number> = {}
  for (const o of orders) {
    for (const i of o.wineItems) {
      wineMap[itemLabel(i)] = (wineMap[itemLabel(i)] ?? 0) + i.quantity
    }
  }
  const totalBottles = Object.values(wineMap).reduce((a, b) => a + b, 0)
  const perCompany: SummaryCompany[] = orders.map(o => {
    const bottles = o.wineItems.reduce((s, i) => s + i.quantity, 0)
    return { order: o, wines: o.wineItems, bottles, boxes: calcBoxes(bottles, mode) }
  })
  const totalBoxes = perCompany.reduce((s, c) => s + c.boxes.totalBoxes, 0)
  return { wineMap, totalBottles, totalBoxes, perCompany }
}

// ── Print ──────────────────────────────────────────────────────────────

function printPackingSheet(orders: PackingOrder[], mode: BoxMode) {
  const { wineMap, totalBottles, totalBoxes, perCompany } = computeSummary(orders, mode)
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const modeLabel = BOX_MODE_CONFIG[mode].label

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Packing Sheet</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Courier New', monospace; font-size: 12px; padding: 24px; color: #1c1008; }
h1 { font-size: 17px; font-weight: bold; margin-bottom: 4px; }
.meta { color: #6b5a47; margin-bottom: 20px; font-size: 11px; }
.section-header { font-weight: bold; font-size: 13px; border-bottom: 2px solid #1c1008; padding-bottom: 4px; margin: 20px 0 10px; }
.totals { background: #f5efe6; border: 1px solid #e0d4c0; padding: 12px; }
.wine-row { display: flex; justify-content: space-between; padding: 2px 0; }
.totals-line { font-weight: bold; border-top: 1px solid #e0d4c0; margin-top: 8px; padding-top: 8px; }
.company { border: 1px solid #e0d4c0; padding: 10px; margin-bottom: 8px; page-break-inside: avoid; }
.co-name { font-weight: bold; margin-bottom: 4px; }
.co-wines { color: #6b5a47; margin-bottom: 4px; }
.co-boxes { font-weight: bold; margin-bottom: 2px; }
.co-contact { color: #a89070; font-size: 11px; }
</style></head><body>
<h1>Wine Order Packing Sheet</h1>
<div class="meta">${date} &nbsp;·&nbsp; Box mode: ${modeLabel} &nbsp;·&nbsp; ${orders.length} order${orders.length !== 1 ? 's' : ''} &nbsp;·&nbsp; ${totalBoxes} boxes total</div>
<div class="section-header">TOTAL WINES</div>
<div class="totals">
${Object.entries(wineMap).map(([n, q]) => `<div class="wine-row"><span>${n}</span><span>× ${q}</span></div>`).join('')}
<div class="totals-line">${totalBottles} bottles total &nbsp;·&nbsp; ${totalBoxes} boxes needed (company-separated)</div>
</div>
<div class="section-header">BY COMPANY (each packed separately)</div>
${perCompany.map(({ order: o, wines, bottles, boxes }) =>
  `<div class="company">
<div class="co-name">${o.businessName}</div>
<div class="co-wines">${wines.map(w => `${itemLabel(w)} × ${w.quantity}`).join(' &nbsp;|&nbsp; ')}</div>
<div class="co-boxes">${bottles} bottles &nbsp;→&nbsp; ${boxes.display}</div>
<div class="co-contact">${o.contactName} · ${o.contactPhone}</div>
</div>`).join('')}
</body></html>`

  const win = window.open('', '_blank', 'width=800,height=700')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print(); win.close() }, 250)
}

// ── BoxMode picker ─────────────────────────────────────────────────────

function BoxModePicker({ mode, onChange }: { mode: BoxMode; onChange: (m: BoxMode) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border font-medium"
        style={{ borderColor: C.border, backgroundColor: '#fff', color: C.text }}
      >
        {BOX_MODE_CONFIG[mode].label}
        <span style={{ color: C.faint, fontSize: '0.65rem' }}>▾</span>
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-20 rounded-xl border shadow-lg py-1"
          style={{ minWidth: 200, backgroundColor: C.bg, borderColor: C.border }}
        >
          {(Object.keys(BOX_MODE_CONFIG) as BoxMode[]).map(m => (
            <button
              key={m}
              onClick={() => { onChange(m); setOpen(false) }}
              className="w-full text-left px-4 py-2.5 flex flex-col transition-colors"
              style={{ backgroundColor: mode === m ? '#f5efe6' : 'transparent' }}
            >
              <span className="text-sm font-medium" style={{ color: mode === m ? C.wine : C.text }}>
                {BOX_MODE_CONFIG[m].label}
              </span>
              <span className="text-xs" style={{ color: C.faint }}>
                {BOX_MODE_CONFIG[m].sub}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Summary content ────────────────────────────────────────────────────

function SummaryContent({ orders, boxMode, onBoxModeChange, onPrint }: {
  orders: PackingOrder[]
  boxMode: BoxMode
  onBoxModeChange: (m: BoxMode) => void
  onPrint: () => void
}) {
  const { wineMap, totalBottles, totalBoxes, perCompany } = computeSummary(orders, boxMode)

  if (orders.length === 0) {
    return <p className="text-sm text-center py-6" style={{ color: C.faint }}>No orders selected.</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <BoxModePicker mode={boxMode} onChange={onBoxModeChange} />
        <button
          onClick={onPrint}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium"
          style={{ backgroundColor: C.wine, color: '#fff' }}
        >
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
            <rect x="2" y="4" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="1.3" />
            <path d="M4 4V2.5a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5V4M4.5 9.5h5M4.5 11h5"
              stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          Print
        </button>
      </div>

      {/* Total wines */}
      <div className="rounded-lg border p-3" style={{ borderColor: C.border, backgroundColor: '#f5efe6' }}>
        <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: C.faint }}>Total Wines</p>
        {Object.entries(wineMap).map(([name, qty]) => (
          <div key={name} className="flex justify-between text-sm py-0.5" style={{ color: C.text }}>
            <span>{name}</span>
            <span className="font-medium">× {qty}</span>
          </div>
        ))}
        <div className="border-t mt-2 pt-2 text-xs font-semibold" style={{ borderColor: C.border, color: C.text }}>
          {totalBottles} bottles · {totalBoxes} boxes needed
          <span className="font-normal" style={{ color: C.faint }}> (companies packed separately)</span>
        </div>
      </div>

      {/* Per company */}
      <p className="text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>By Company</p>
      {perCompany.map(({ order: o, wines, bottles, boxes }) => (
        <div key={o.id} className="rounded-lg border p-3" style={{ borderColor: C.border, backgroundColor: C.bg }}>
          <p className="font-semibold text-sm" style={{ color: C.text }}>{o.businessName}</p>
          <p className="text-xs my-1" style={{ color: C.muted }}>
            {wines.map(w => `${itemLabel(w)} × ${w.quantity}`).join('  |  ')}
          </p>
          <p className="text-xs font-medium" style={{ color: C.wine }}>
            {bottles} bottles → {boxes.display}
          </p>
          <p className="text-xs mt-1" style={{ color: C.faint }}>
            {o.contactName} · {o.contactPhone}
          </p>
        </div>
      ))}
    </div>
  )
}

// ── PackingView ────────────────────────────────────────────────────────

interface PackingViewProps {
  children: React.ReactNode
  selectedOrders: PackingOrder[]
  boxMode: BoxMode
  onBoxModeChange: (m: BoxMode) => void
  layout: PackingLayoutType
  onLayoutChange: (l: PackingLayoutType) => void
}

export default function PackingView({
  children, selectedOrders, boxMode, onBoxModeChange, layout, onLayoutChange,
}: PackingViewProps) {
  const [open, setOpen] = useState(false)
  const { totalBottles, totalBoxes } = computeSummary(selectedOrders, boxMode)
  const handlePrint = () => printPackingSheet(selectedOrders, boxMode)

  const countLine = `${selectedOrders.length} order${selectedOrders.length !== 1 ? 's' : ''} · ${totalBottles} bottles · ${totalBoxes} box${totalBoxes !== 1 ? 'es' : ''} needed`

  const layoutToggle = (
    <div className="flex items-center gap-2">
      <span className="text-xs" style={{ color: C.faint }}>Summary:</span>
      <div className="flex gap-0.5 rounded-lg p-0.5" style={{ backgroundColor: '#f0e8dc' }}>
        {(['a', 'b', 'c'] as const).map(l => (
          <button
            key={l}
            onClick={() => { onLayoutChange(l); if (l !== layout) setOpen(false) }}
            className="text-xs px-2.5 py-1 rounded-md font-medium transition-all"
            style={{
              backgroundColor: layout === l ? '#fff' : 'transparent',
              color: layout === l ? C.wine : C.faint,
              fontWeight: layout === l ? 700 : 400,
              boxShadow: layout === l ? '0 1px 2px rgba(0,0,0,0.1)' : undefined,
            }}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  )

  // Layout A: right panel (split)
  if (layout === 'a') {
    return (
      <div className="flex gap-5 items-start">
        <div className="flex-1 min-w-0">
          <div className="flex justify-end mb-4">{layoutToggle}</div>
          {children}
        </div>
        <div
          className="flex-shrink-0 rounded-xl border p-4 overflow-y-auto sticky top-4"
          style={{ borderColor: C.border, backgroundColor: C.bg, width: 300, maxHeight: 'calc(100vh - 96px)' }}
        >
          <SummaryContent
            orders={selectedOrders}
            boxMode={boxMode}
            onBoxModeChange={onBoxModeChange}
            onPrint={handlePrint}
          />
        </div>
      </div>
    )
  }

  // Layout B: sticky bottom bar + expandable sheet
  if (layout === 'b') {
    return (
      <>
        <div className="flex justify-end mb-4">{layoutToggle}</div>
        {children}
        <div style={{ height: 52 }} />
        <div
          className="fixed bottom-0 left-0 right-0 border-t z-30"
          style={{ backgroundColor: '#fdf8f2', borderColor: C.border, boxShadow: '0 -2px 12px rgba(0,0,0,0.08)' }}
        >
          {open && (
            <div className="border-b overflow-y-auto" style={{ borderColor: C.border, maxHeight: '60vh' }}>
              <div className="max-w-3xl mx-auto p-5">
                <SummaryContent
                  orders={selectedOrders}
                  boxMode={boxMode}
                  onBoxModeChange={onBoxModeChange}
                  onPrint={handlePrint}
                />
              </div>
            </div>
          )}
          <button
            onClick={() => setOpen(o => !o)}
            className="w-full flex items-center justify-between px-6 py-3 text-sm font-medium"
            style={{ color: C.text }}
          >
            <span style={{ color: C.muted, fontSize: '0.8rem' }}>{countLine}</span>
            <span style={{ color: C.wine }}>{open ? '▼' : '▲'} Packing Summary</span>
          </button>
        </div>
      </>
    )
  }

  // Layout C: top collapsible
  return (
    <>
      <div className="mb-4 rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
        <div
          className="flex items-center justify-between px-4 py-3 text-sm cursor-pointer"
          style={{ backgroundColor: '#f5efe6' }}
          onClick={() => setOpen(o => !o)}
        >
          <span style={{ color: C.text }}>
            <span className="font-medium">Packing Summary</span>
            <span style={{ color: C.muted }}> · {countLine}</span>
          </span>
          <div className="flex items-center gap-3" onClick={e => e.stopPropagation()}>
            {layoutToggle}
            <span
              onClick={() => setOpen(o => !o)}
              style={{ color: C.wine, cursor: 'pointer', userSelect: 'none' }}
            >
              {open ? '▲' : '▼'}
            </span>
          </div>
        </div>
        {open && (
          <div className="p-4" style={{ backgroundColor: C.bg, borderTop: `1px solid ${C.border}` }}>
            <SummaryContent
              orders={selectedOrders}
              boxMode={boxMode}
              onBoxModeChange={onBoxModeChange}
              onPrint={handlePrint}
            />
          </div>
        )}
      </div>
      {children}
    </>
  )
}
