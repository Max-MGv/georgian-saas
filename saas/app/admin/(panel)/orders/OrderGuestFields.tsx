'use client'

// The guest / rate / price-line controls shared by admin New Order and the order page (Plan-PricingModel
// Chunk 8). Both screens read the same `adminOrderView` and render these, so they cannot show a booking two
// different ways. Companies: the four boxes and a derived total (D-3 — no typed party size, the cause of P-11).
// Individuals: one guest count (D-5).

import { asTetri, formatTetri } from '@/lib/money'
import { boxesFor, PRODUCT_AT, visibleBoxes, type AdminOrderView, type BoxField, type BoxStrings } from '@/lib/adminOrderView'
import type { BookingVisitType, Product } from '@/lib/pricingUtils'

type At = (key: string, vars?: Record<string, string | number>) => string

const FAINT = 'var(--site-secondary)'
const MUTED = 'var(--site-muted)'
const TEXT = 'var(--site-text)'

const BOX_AT: Record<BoxField, string> = { ...PRODUCT_AT, free: 'orderDetail.guestBreakdown.freeGuests' }

const digitsOnly = (v: string) => v.replace(/[^0-9]/g, '')

/** Visit type + the guest boxes (companies) or one guest count (individuals), and the "Total: N guests" line. */
export function GuestFields({
  at, isCompany, visitType, onVisitType, guests, onGuests, boxes, onBox, view, disabled, inputStyle,
}: {
  at: At
  isCompany: boolean
  visitType: BookingVisitType
  onVisitType: (v: BookingVisitType) => void
  guests: string
  onGuests: (v: string) => void
  boxes: BoxStrings
  onBox: (field: BoxField, v: string) => void
  view: AdminOrderView
  disabled?: boolean
  inputStyle: React.CSSProperties
}) {
  const options: BookingVisitType[] = isCompany ? ['TASTING', 'TASTING_LUNCH', 'LUNCH'] : ['TASTING', 'TASTING_LUNCH']
  const label = (v: BookingVisitType) => at(v === 'TASTING' ? 'orders.visit.tasting' : v === 'LUNCH' ? 'orders.visit.lunch' : 'orders.visit.tastingLunch')
  // The visit's boxes plus any box still holding guests, so a stored contradiction is shown, never zeroed unseen.
  const shown = visibleBoxes(visitType, boxes)
  const style = disabled ? { ...inputStyle, opacity: 0.6, cursor: 'not-allowed' } : inputStyle

  function changeVisit(v: BookingVisitType) {
    onVisitType(v)
    // A box the new visit type does not show is emptied, so nothing hidden is saved or priced (D-9).
    if (isCompany) for (const f of ['tastingOnly', 'lunchOnly', 'tastingLunch'] as const) if (!boxesFor(v).includes(f)) onBox(f, '0')
  }

  return (
    <div className="mb-3">
      <div className="mb-3">
        <label className="text-xs block mb-1" style={{ color: FAINT }}>{at('orderDetail.bookingInfo.visitType')}</label>
        <select value={visitType} onChange={e => changeVisit(e.target.value as BookingVisitType)} disabled={disabled} style={style}>
          {options.map(v => <option key={v} value={v}>{label(v)}</option>)}
        </select>
      </div>

      {isCompany ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {shown.map(f => (
              <div key={f}>
                <label className="text-xs block mb-1" style={{ color: FAINT }}>{at(BOX_AT[f])}</label>
                <input
                  type="text" inputMode="numeric" pattern="[0-9]*" aria-label={at(BOX_AT[f])}
                  value={boxes[f]}
                  onChange={e => onBox(f, digitsOnly(e.target.value))}
                  onBlur={e => onBox(f, String(parseInt(e.target.value) || 0))}
                  disabled={disabled} style={style}
                />
                {f === 'free' && <p className="text-xs mt-0.5" style={{ color: FAINT }}>{at('orderDetail.guestBreakdown.freeGuestsHint')}</p>}
              </div>
            ))}
          </div>
          {view.counts && (
            <p className="text-xs mt-2" style={{ color: MUTED }}>
              {at('orderForm.totalGuests', {
                n: view.counts.tastingOnly + view.counts.lunchOnly + view.counts.tastingLunch + view.counts.free,
                paying: view.counts.tastingOnly + view.counts.lunchOnly + view.counts.tastingLunch,
              })}
            </p>
          )}
        </>
      ) : (
        <div style={{ maxWidth: 200 }}>
          <label className="text-xs block mb-1" style={{ color: FAINT }}>{at('orderForm.guests')}</label>
          <input
            type="text" inputMode="numeric" pattern="[0-9]*" aria-label={at('orderForm.guests')}
            value={guests}
            onChange={e => onGuests(digitsOnly(e.target.value))}
            onBlur={e => onGuests(String(Math.max(1, parseInt(e.target.value) || 1)))}
            disabled={disabled} style={style}
          />
        </div>
      )}
    </div>
  )
}

/** Typed per-person rates for the products the price table does not cover (E-3) or when there is no table (A-9). */
export function RateFields({
  at, view, hasTable, companyName, manual, onManual, disabled, inputStyle,
}: {
  at: At
  view: AdminOrderView
  hasTable: boolean
  companyName: string
  manual: Record<Product, string>
  onManual: (p: Product, v: string) => void
  disabled?: boolean
  inputStyle: React.CSSProperties
}) {
  if (view.rateInputs.length === 0) return null
  const style = disabled ? { ...inputStyle, opacity: 0.6, cursor: 'not-allowed' } : inputStyle
  return (
    <div className="mb-3">
      <p className="text-xs mb-2" style={{ color: MUTED }}>
        {hasTable ? at('orderForm.ratesNotOnTable', { company: companyName }) : at('orderForm.ratesNoTable')}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {view.rateInputs.map(p => (
          <div key={p}>
            <label className="text-xs block mb-1" style={{ color: FAINT }}>{at('orderForm.rateFor', { product: at(PRODUCT_AT[p]) })}</label>
            <input
              type="text" inputMode="decimal" aria-label={at('orderForm.rateFor', { product: at(PRODUCT_AT[p]) })}
              value={manual[p]}
              onChange={e => onManual(p, e.target.value.replace(/[^0-9.]/g, ''))}
              disabled={disabled} style={style}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

/** One line per product ("Tasting only (9 × 50₾) · row 1–20"), the registration fee, and the problem, if any. */
export function PriceLines({ at, view }: { at: At; view: AdminOrderView }) {
  return (
    <>
      {view.lines.map(l => (
        <div key={l.product} className="flex justify-between text-sm">
          <span style={{ color: MUTED }}>
            {at(PRODUCT_AT[l.product])} ({l.count} × {formatTetri(asTetri(l.rate))})
            {l.row && <span className="text-xs" style={{ color: FAINT }}> · {at(l.row.outside === 'above' ? 'orderForm.rowAbove' : l.row.outside ? 'orderForm.rowFallback' : 'orderForm.rowRange', { min: l.row.min, max: l.row.max, count: l.count })}</span>}
          </span>
          <span style={{ color: TEXT }}>{formatTetri(asTetri(l.amount), { decimals: true })}</span>
        </div>
      ))}
      {view.registration > 0 && (
        <div className="flex justify-between text-sm">
          <span style={{ color: MUTED }}>{at('orderDetail.total.registrationFee')}</span>
          <span style={{ color: TEXT }}>{formatTetri(asTetri(view.registration), { decimals: true })}</span>
        </div>
      )}
    </>
  )
}

/** The inline reason this booking cannot be saved yet, in the admin's language. */
export function problemText(at: At, view: AdminOrderView): string | null {
  if (!view.problem) return null
  if (view.problem.key === 'orderForm.err.missingRate' || view.problem.key === 'orderForm.err.individualsMissing') {
    return at(view.problem.key, { products: view.missing.map(p => at(PRODUCT_AT[p])).join(', ') })
  }
  return at(view.problem.key, view.problem.vars)
}
