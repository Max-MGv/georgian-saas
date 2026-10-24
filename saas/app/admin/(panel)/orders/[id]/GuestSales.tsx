'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminT } from '@/lib/adminT'
import { asTetri, formatTetri } from '@/lib/money'
import { priceWineOrder } from '@/lib/winePricing'
import { createWineOrderAdmin } from '@/app/actions/wineOrders'

/**
 * "Sales from this visit" (T-22): bottles guests bought during a booking's visit. Each is a real wine order (pickup, website
 * price, linked to this booking), so it counts in the wine statistics and the wine orders list — but it is deliberately NOT part
 * of the booking's invoice or total, which is why this is a card of its own, dashed, with the note saying so.
 */
const C = { border: 'var(--site-border)', bg: 'var(--site-surface)', text: 'var(--site-text)', muted: 'var(--site-muted)', faint: 'var(--site-secondary)', wine: 'var(--color-brand)' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', fontSize: '0.875rem', border: `1px solid ${C.border}`, borderRadius: 8, backgroundColor: 'var(--site-bg)', color: C.text }

export type GuestPurchase = {
  id: string
  /** Who bought (the wine order's customer name). */
  name: string
  stage: string
  /** Wines total, tetri. */
  amount: number
  lines: { name: string; year: number; quantity: number }[]
}

export type GuestWineChoice = { vintageId: string; name: string; year: number; price: number }

export default function GuestSales({
  orderId, defaultName, purchases, wines, locale = 'en',
}: {
  orderId: string
  /** Pre-filled guest name: the booking's contact. */
  defaultName: string
  purchases: GuestPurchase[]
  /** Every active wine at its website price — a guest buys anything the winery sells, not only what is offered on bookings. */
  wines: GuestWineChoice[]
  locale?: string
}) {
  const at = (key: string, vars?: Record<string, string | number>) => adminT(locale, key, vars)
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(defaultName)
  const [phone, setPhone] = useState('')
  const [rows, setRows] = useState<{ vintageId: string; qty: string }[]>([{ vintageId: '', qty: '1' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const chosen = rows
    .map(r => ({ vintageId: r.vintageId, quantity: Number(r.qty.trim()) }))
    .filter(r => r.vintageId && Number.isInteger(r.quantity) && r.quantity >= 1 && r.quantity <= 1000)
  // The same pricing function the server runs (website price, no company terms), so Save stores what is shown.
  const priced = priceWineOrder(
    chosen.map(c => ({ vintageId: c.vintageId, quantity: c.quantity, standardPrice: wines.find(w => w.vintageId === c.vintageId)?.price ?? 0 })),
    {}, null,
  )

  function reset() {
    setOpen(false); setName(defaultName); setPhone(''); setRows([{ vintageId: '', qty: '1' }]); setError('')
  }

  async function save() {
    setError('')
    if (chosen.length === 0) { setError(at('guestSales.pickWine')); return }
    // The same wine twice would be two lines; fold them so it reads as the bottles the guest actually took.
    const merged = new Map<string, number>()
    for (const c of chosen) merged.set(c.vintageId, (merged.get(c.vintageId) ?? 0) + c.quantity)
    setSaving(true)
    const res = await createWineOrderAdmin({
      sourceOrderId: orderId,
      customerType: 'INDIVIDUAL',
      companyId: null,
      businessName: name.trim(),
      llcName: null,
      llcId: null,
      address: '',
      workingHours: null,
      contactName: name.trim(),
      contactPhone: phone.trim(),
      contactEmail: null,
      wines: [...merged].map(([vintageId, quantity]) => ({ vintageId, quantity })),
    })
    setSaving(false)
    if ('error' in res) { setError(res.error); return }
    reset()
    router.refresh()
  }

  return (
    <div className="rounded-xl mb-4" style={{ border: `1.5px dashed ${C.border}`, backgroundColor: 'transparent' }} data-testid="guest-sales">
      <div className="px-5 py-3 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.faint }}>{at('guestSales.title')}</h3>
        {purchases.length > 0 && (
          <a href="/admin/wine-orders" className="text-xs" style={{ color: C.wine }}>{at('guestSales.open')}</a>
        )}
      </div>
      <div className="px-5 pb-4">
        <p className="text-xs mb-3" style={{ color: C.faint }}>{at('guestSales.note')}</p>

        {purchases.length === 0 && !open && (
          <p className="text-sm mb-3" style={{ color: C.faint }}>{at('guestSales.none')}</p>
        )}

        {purchases.map(p => (
          <div key={p.id} className="flex justify-between gap-3 py-2 border-t text-sm" style={{ borderColor: C.border, opacity: p.stage === 'CANCELLED' ? 0.55 : 1 }}>
            <div className="min-w-0">
              <p className="font-medium" style={{ color: C.text }}>
                {p.name}{p.stage === 'CANCELLED' ? ` · ${at('guestSales.cancelled')}` : ''}
              </p>
              <p className="text-xs" style={{ color: C.muted }}>{p.lines.map(l => `${l.name} ${l.year} × ${l.quantity}`).join(', ')}</p>
            </div>
            <span className="font-medium whitespace-nowrap" style={{ color: C.wine, textDecoration: p.stage === 'CANCELLED' ? 'line-through' : undefined }}>
              {formatTetri(asTetri(p.amount), { decimals: true })}
            </span>
          </div>
        ))}

        {open ? (
          <div className="mt-3 pt-3 border-t space-y-3" style={{ borderColor: C.border }}>
            {wines.length === 0 ? (
              <p className="text-sm" style={{ color: C.faint }}>{at('guestSales.noWines')}</p>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs block mb-1" style={{ color: C.faint }}>{at('guestSales.guest')}</span>
                    <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} aria-label={at('guestSales.guest')} />
                  </label>
                  <label className="block">
                    <span className="text-xs block mb-1" style={{ color: C.faint }}>{at('guestSales.phone')}</span>
                    <input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" style={inputStyle} aria-label={at('guestSales.phone')} />
                  </label>
                </div>
                {rows.map((r, i) => (
                  <div key={i} className="flex items-end gap-2 flex-wrap">
                    <div style={{ flex: '1 1 180px' }}>
                      {i === 0 && <span className="text-xs block mb-1" style={{ color: C.faint }}>{at('guestSales.wine')}</span>}
                      <select
                        value={r.vintageId}
                        onChange={e => setRows(prev => prev.map((x, j) => (j === i ? { ...x, vintageId: e.target.value } : x)))}
                        style={inputStyle} aria-label={`${at('guestSales.wine')} ${i + 1}`}
                      >
                        <option value="">{at('guestSales.selectWine')}</option>
                        {wines.map(w => <option key={w.vintageId} value={w.vintageId}>{w.name} {w.year}</option>)}
                      </select>
                    </div>
                    <div style={{ width: 84 }}>
                      {i === 0 && <span className="text-xs block mb-1" style={{ color: C.faint }}>{at('guestSales.qty')}</span>}
                      <input
                        type="number" min={1} max={1000} value={r.qty}
                        onChange={e => setRows(prev => prev.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))}
                        style={inputStyle} aria-label={`${at('guestSales.qty')} ${i + 1}`}
                      />
                    </div>
                    {rows.length > 1 && (
                      <button onClick={() => setRows(prev => prev.filter((_, j) => j !== i))} className="text-xs px-2 py-2" style={{ color: '#b91c1c' }} aria-label="×">×</button>
                    )}
                  </div>
                ))}
                <button onClick={() => setRows(prev => [...prev, { vintageId: '', qty: '1' }])} className="text-sm font-medium" style={{ color: C.wine }}>
                  {at('guestSales.addWine')}
                </button>
                <div className="flex justify-between items-center text-sm pt-2 border-t" style={{ borderColor: C.border }}>
                  <span style={{ color: C.muted }}>{at('guestSales.total')} <span className="text-xs" style={{ color: C.faint }}>· {at('guestSales.priceNote')}</span></span>
                  <span className="text-lg font-bold" style={{ color: C.wine }}>{formatTetri(asTetri(priced.total), { decimals: true })}</span>
                </div>
                {error && <p className="text-sm" style={{ color: '#b91c1c' }} role="alert">{error}</p>}
                <div className="flex gap-2">
                  <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: C.wine }}>
                    {saving ? at('guestSales.saving') : at('guestSales.save')}
                  </button>
                  <button onClick={reset} className="px-4 py-2 rounded-lg text-sm border" style={{ borderColor: C.border, color: C.muted }}>
                    {at('guestSales.cancel')}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <button onClick={() => setOpen(true)} className="text-sm font-medium mt-1" style={{ color: C.wine }}>
            {at('guestSales.record')}
          </button>
        )}
      </div>
    </div>
  )
}
