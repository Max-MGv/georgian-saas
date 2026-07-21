'use client'

import { useState, useEffect, useRef } from 'react'
import { adminT } from '@/lib/adminT'

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

const BOX_MODE_KEYS: Record<BoxMode, { labelKey: string; subKey: string }> = {
  six:     { labelKey: 'packing.boxMode.six.label',     subKey: 'packing.boxMode.six.sub' },
  twelve:  { labelKey: 'packing.boxMode.twelve.label',  subKey: 'packing.boxMode.twelve.sub' },
  optimal: { labelKey: 'packing.boxMode.optimal.label', subKey: 'packing.boxMode.optimal.sub' },
}

// ── Box calculation ────────────────────────────────────────────────────

type BoxResult = { totalBoxes: number; display: string }

function calcBoxes(bottles: number, mode: BoxMode, locale: string): BoxResult {
  const en = locale === 'en'
  const boxWord = (n: number) => en ? (n !== 1 ? 'boxes' : 'box') : 'ყუთი'
  const fullWord = en ? 'full' : 'სრული'
  const partialWord = en ? 'partial' : 'ნახევრადი'

  if (bottles === 0) return { totalBoxes: 0, display: en ? '0 boxes' : '0 ყუთი' }

  if (mode === 'six') {
    const full = Math.floor(bottles / 6)
    const rem = bottles % 6
    const total = full + (rem > 0 ? 1 : 0)
    const display = rem > 0
      ? en
        ? `${full > 0 ? full + ' full + ' : ''}1 partial (${rem}) — ${total} ${boxWord(total)} of 6`
        : `${full > 0 ? full + ' სრული + ' : ''}1 ნახევრადი (${rem}) — სულ ${total} ${boxWord(total)} (6-ბოთლიანი)`
      : en
        ? `${full} ${boxWord(full)} of 6`
        : `${full} ${boxWord(full)} (6-ბოთლიანი)`
    return { totalBoxes: total, display }
  }

  if (mode === 'twelve') {
    const full = Math.floor(bottles / 12)
    const rem = bottles % 12
    const total = full + (rem > 0 ? 1 : 0)
    const display = rem > 0
      ? en
        ? `${full > 0 ? full + ' full + ' : ''}1 partial (${rem}) — ${total} ${boxWord(total)} of 12`
        : `${full > 0 ? full + ' სრული + ' : ''}1 ნახევრადი (${rem}) — სულ ${total} ${boxWord(total)} (12-ბოთლიანი)`
      : en
        ? `${full} ${boxWord(full)} of 12`
        : `${full} ${boxWord(full)} (12-ბოთლიანი)`
    return { totalBoxes: total, display }
  }

  // Optimal: 12s first, then 6 for small remainder
  const twelves = Math.floor(bottles / 12)
  const rem = bottles % 12
  if (rem === 0) {
    return { totalBoxes: twelves, display: en ? `${twelves} ${boxWord(twelves)} of 12` : `${twelves} ${boxWord(twelves)} (12-ბოთლიანი)` }
  }
  if (rem <= 6) {
    const total = twelves + 1
    const parts = en
      ? (twelves > 0 ? [`${twelves}×12 ${fullWord}`, `1×6 ${partialWord} (${rem})`] : [`1×6 ${partialWord} (${rem})`])
      : (twelves > 0 ? [`${twelves}×12 ${fullWord}`, `1×6 ${partialWord} (${rem})`] : [`1×6 ${partialWord} (${rem})`])
    return { totalBoxes: total, display: `${parts.join(' + ')} — ${en ? '' : 'სულ '}${total} ${boxWord(total)}` }
  }
  // rem > 6: use another 12-bottle box
  const total = twelves + 1
  const parts = twelves > 0 ? [`${twelves}×12 ${fullWord}`, `1×12 ${partialWord} (${rem})`] : [`1×12 ${partialWord} (${rem})`]
  return { totalBoxes: total, display: `${parts.join(' + ')} — ${en ? '' : 'სულ '}${total} ${boxWord(total)}` }
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

function computeSummary(orders: PackingOrder[], mode: BoxMode, locale: string): Summary {
  const wineMap: Record<string, number> = {}
  for (const o of orders) {
    for (const i of o.wineItems) {
      wineMap[itemLabel(i)] = (wineMap[itemLabel(i)] ?? 0) + i.quantity
    }
  }
  const totalBottles = Object.values(wineMap).reduce((a, b) => a + b, 0)
  const perCompany: SummaryCompany[] = orders.map(o => {
    const bottles = o.wineItems.reduce((s, i) => s + i.quantity, 0)
    return { order: o, wines: o.wineItems, bottles, boxes: calcBoxes(bottles, mode, locale) }
  })
  const totalBoxes = perCompany.reduce((s, c) => s + c.boxes.totalBoxes, 0)
  return { wineMap, totalBottles, totalBoxes, perCompany }
}

// ── Print ──────────────────────────────────────────────────────────────

function printPackingSheet(orders: PackingOrder[], mode: BoxMode, locale: string) {
  const at = (key: string) => adminT(locale, key)
  const { wineMap, totalBottles, totalBoxes, perCompany } = computeSummary(orders, mode, locale)
  const date = new Date().toLocaleDateString(locale === 'ka' ? 'ka-GE' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  const modeLabel = at(BOX_MODE_KEYS[mode].labelKey)
  const orderWord = orders.length !== 1 ? at('packing.order.plural') : at('packing.order.singular')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${at('packing.sheetTitle')}</title>
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
<h1>${at('packing.sheetTitle')}</h1>
<div class="meta">${date} &nbsp;·&nbsp; ${at('packing.boxModeLabel')}: ${modeLabel} &nbsp;·&nbsp; ${orders.length} ${orderWord} &nbsp;·&nbsp; ${totalBoxes} ${at('packing.boxesTotal')}</div>
<div class="section-header">${at('packing.totalWines').toUpperCase()}</div>
<div class="totals">
${Object.entries(wineMap).map(([n, q]) => `<div class="wine-row"><span>${n}</span><span>× ${q}</span></div>`).join('')}
<div class="totals-line">${totalBottles} ${at('packing.bottlesTotal')} &nbsp;·&nbsp; ${totalBoxes} ${at('packing.boxesNeeded')} ${at('packing.companiesPackedSeparately')}</div>
</div>
<div class="section-header">${at('packing.byCompanySeparate').toUpperCase()}</div>
${perCompany.map(({ order: o, wines, bottles, boxes }) =>
  `<div class="company">
<div class="co-name">${o.businessName}</div>
<div class="co-wines">${wines.map(w => `${itemLabel(w)} × ${w.quantity}`).join(' &nbsp;|&nbsp; ')}</div>
<div class="co-boxes">${bottles} ${at('packing.bottlesTotal')} &nbsp;→&nbsp; ${boxes.display}</div>
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

function BoxModePicker({ mode, onChange, locale }: { mode: BoxMode; onChange: (m: BoxMode) => void; locale: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const at = (key: string) => adminT(locale, key)

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
        {at(BOX_MODE_KEYS[mode].labelKey)}
        <span style={{ color: C.faint, fontSize: '0.65rem' }}>▾</span>
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-20 rounded-xl border shadow-lg py-1"
          style={{ minWidth: 200, backgroundColor: C.bg, borderColor: C.border }}
        >
          {(Object.keys(BOX_MODE_KEYS) as BoxMode[]).map(m => (
            <button
              key={m}
              onClick={() => { onChange(m); setOpen(false) }}
              className="w-full text-left px-4 py-2.5 flex flex-col transition-colors"
              style={{ backgroundColor: mode === m ? '#f5efe6' : 'transparent' }}
            >
              <span className="text-sm font-medium" style={{ color: mode === m ? C.wine : C.text }}>
                {at(BOX_MODE_KEYS[m].labelKey)}
              </span>
              <span className="text-xs" style={{ color: C.faint }}>
                {at(BOX_MODE_KEYS[m].subKey)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Summary content ────────────────────────────────────────────────────

function SummaryContent({ orders, boxMode, onBoxModeChange, onPrint, locale }: {
  orders: PackingOrder[]
  boxMode: BoxMode
  onBoxModeChange: (m: BoxMode) => void
  onPrint: () => void
  locale: string
}) {
  const at = (key: string) => adminT(locale, key)
  const { wineMap, totalBottles, totalBoxes, perCompany } = computeSummary(orders, boxMode, locale)

  if (orders.length === 0) {
    return <p className="text-sm text-center py-6" style={{ color: C.faint }}>{at('packing.noOrdersSelected')}</p>
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <BoxModePicker mode={boxMode} onChange={onBoxModeChange} locale={locale} />
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
          {at('packing.print')}
        </button>
      </div>

      {/* Total wines */}
      <div className="rounded-lg border p-3" style={{ borderColor: C.border, backgroundColor: '#f5efe6' }}>
        <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: C.faint }}>{at('packing.totalWines')}</p>
        {Object.entries(wineMap).map(([name, qty]) => (
          <div key={name} className="flex justify-between text-sm py-0.5" style={{ color: C.text }}>
            <span>{name}</span>
            <span className="font-medium">× {qty}</span>
          </div>
        ))}
        <div className="border-t mt-2 pt-2 text-xs font-semibold" style={{ borderColor: C.border, color: C.text }}>
          {totalBottles} {at('packing.bottlesTotal')} · {totalBoxes} {at('packing.boxesNeeded')}
          <span className="font-normal" style={{ color: C.faint }}> {at('packing.companiesPackedSeparately')}</span>
        </div>
      </div>

      {/* Per company */}
      <p className="text-xs font-bold uppercase tracking-wide" style={{ color: C.faint }}>{at('packing.byCompany')}</p>
      {perCompany.map(({ order: o, wines, bottles, boxes }) => (
        <div key={o.id} className="rounded-lg border p-3" style={{ borderColor: C.border, backgroundColor: C.bg }}>
          <p className="font-semibold text-sm" style={{ color: C.text }}>{o.businessName}</p>
          <p className="text-xs my-1" style={{ color: C.muted }}>
            {wines.map(w => `${itemLabel(w)} × ${w.quantity}`).join('  |  ')}
          </p>
          <p className="text-xs font-medium" style={{ color: C.wine }}>
            {bottles} {at('packing.bottlesTotal')} → {boxes.display}
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
  locale?: string
}

export default function PackingView({
  children, selectedOrders, boxMode, onBoxModeChange, locale = 'en',
}: PackingViewProps) {
  const handlePrint = () => printPackingSheet(selectedOrders, boxMode, locale)

  return (
    <div className="flex gap-5 items-start">
      <div className="flex-1 min-w-0">{children}</div>
      <div
        className="flex-shrink-0 rounded-xl border p-4 overflow-y-auto sticky top-4"
        style={{ borderColor: C.border, backgroundColor: C.bg, width: 300, maxHeight: 'calc(100vh - 96px)' }}
      >
        <SummaryContent
          orders={selectedOrders}
          boxMode={boxMode}
          onBoxModeChange={onBoxModeChange}
          onPrint={handlePrint}
          locale={locale}
        />
      </div>
    </div>
  )
}
