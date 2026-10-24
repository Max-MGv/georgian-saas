import { asTetri, asTetriOrNull, balanceDue, formatTetri, formatTetriOrDash, multiplyTetri } from '@/lib/money'
import { INVOICE_PRODUCT_LABEL, INVOICE_REGISTRATION_LABEL, invoiceView } from '@/lib/invoiceLines'
import type { Product } from '@/lib/pricingUtils'
import { lineTotals } from '@/lib/orderLines'
import { formatShortDate } from '@/lib/emails/templates/dateFormat'

const KA = INVOICE_PRODUCT_LABEL.ka

type Order = {
  id: string
  date: Date
  timeSlot: string
  visitType: string
  guestCount: number
  // The boxes (T-152), under the list's names: tasting = Tasting only, lunch = Tasting & Lunch.
  tastingGuestCount: number
  lunchOnlyGuestCount: number
  lunchGuestCount: number
  freeGuestCount: number
  /** Frozen per-person rates, tetri — each product gets its own line when they explain the total. */
  tastingOnlyRate: number | null
  lunchOnlyRate: number | null
  tastingLunchRate: number | null
  registrationFeeSnapshot: number | null
  name: string
  surname: string
  totalPrice: number | null
  /** Sum of this order's settled, non-reversed Payment.amount rows. Used only
   *  to decide whether this printed invoice needs a balance-due line
   *  (Plan-PostPaymentExtras Chunk 2, KnownBugs #64) — a printed invoice for
   *  an order that's already been paid something must not silently restate
   *  the full total as if nothing had been collected yet. */
  paymentsSettledTotal: number
  company: { name: string; identificationCode: string | null } | null
  masterclassLines: { name: string; quantity: number; pricePerUnit: number }[]
  extras: { label: string; amount: number }[]
}

type Payment = {
  recipientName: string
  personalNumber: string
  bankName: string
  bankCode: string
  iban: string
}

type Props = { order: Order; payment: Payment; detailed?: boolean; displayName?: string }

function Row({ label, value, mono = false }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0', borderBottom: '1px solid #e8e0d0' }}>
      <span style={{ color: '#6b5a47', fontSize: 13, fontWeight: 400 }}>{label}</span>
      <span style={{ fontSize: 13, color: '#1c1008', WebkitTextFillColor: '#1c1008', fontWeight: 600, fontFamily: mono ? "'Courier New', Courier, monospace" : 'inherit', textDecoration: 'none' }}>{value}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="invoice-section" style={{ marginBottom: 20 }}>
      <div style={{ borderLeft: '3px solid var(--color-brand)', paddingLeft: 10, marginBottom: 8 }}>
        <strong style={{ fontSize: 14, color: '#1c1008' }}>{title}</strong>
      </div>
      {children}
    </div>
  )
}

export default function InvoicePrint({ order, payment, detailed = false, displayName = 'Your Winery' }: Props) {
  const d = new Date(order.date)
  // Day.month.year built by hand, not toLocaleDateString('ka-GE'): a browser without Georgian locale data falls back to
  // month-first (11.25.2026 seen in Brave, 2026-10-23) — the same trap the email templates already avoid.
  const dateStr = formatShortDate(d, 'ka')
  const now = new Date()
  const nowStr = `${formatShortDate(now, 'ka')}, ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  const totalPrice = order.totalPrice ?? 0
  const companyName = order.company?.name ?? `${order.name} ${order.surname}`
  const idCode = order.company?.identificationCode ?? '—'

  // Detailed calculations
  const { masterclass: mcAmt, extras: extrasAmt } = lineTotals(order)
  const bookingAmt = totalPrice - mcAmt - extrasAmt

  // Balance due (Plan-PostPaymentExtras Chunk 2, KnownBugs #64) — only shown
  // once something has actually been collected, same gate as everywhere else
  // this figure appears. `paymentsSettledTotal > 0` stands in for "has been
  // paid at least once" here since this component isn't given `paidAt`.
  const balance = balanceDue(order.totalPrice, order.paymentsSettledTotal)
  const showBalance = order.paymentsSettledTotal > 0 && balance !== 0
  const balanceLabel = balance > 0 ? 'გადასახდელი ნაშთი' : 'ზედმეტად გადახდილი'
  const balanceRow = showBalance ? (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
      <strong style={{ fontSize: 13, color: balance > 0 ? '#92400e' : '#1c1008' }}>
        {balanceLabel}: {formatTetri(asTetri(Math.abs(balance)), { space: true, decimals: true })}
      </strong>
    </div>
  ) : null

  // The booking itself, per product (Plan-PricingModel Chunk 9) — the same lines the invoice email prints.
  const view = invoiceView({
    visitType: order.visitType, guestCount: order.guestCount,
    tastingOnlyGuests: order.tastingGuestCount, lunchOnlyGuests: order.lunchOnlyGuestCount, tastingLunchGuests: order.lunchGuestCount,
    freeGuestCount: order.freeGuestCount,
    tastingOnlyRate: order.tastingOnlyRate, lunchOnlyRate: order.lunchOnlyRate, tastingLunchRate: order.tastingLunchRate,
    registrationFeeSnapshot: order.registrationFeeSnapshot,
    totalPrice, masterclassAmt: mcAmt, extrasAmt,
  })
  const money = (t: number) => formatTetri(asTetri(t), { space: true, decimals: true })
  const countOf = (p: Product) => view.guests.find(g => g.product === p)?.count ?? 0
  /** One product's booking amount: its line when the rates explain the total, else the whole booking on the visit's product. */
  const amountOf = (p: Product) => view.lines
    ? (view.lines.find(l => l.product === p)?.amount ?? 0)
    : (p === view.visitProduct ? bookingAmt : 0)
  // Tasting + Lunch and Tasting always appear on the simple invoice (as before); Lunch only when it was booked.
  const simpleProducts: Product[] = (['tastingLunch', 'lunchOnly', 'tastingOnly'] as Product[])
    .filter(p => p !== 'lunchOnly' || countOf(p) > 0 || view.visitProduct === 'lunchOnly')

  const header = (
    <div style={{ fontFamily: 'Georgia, serif', maxWidth: 600, margin: '0 auto', padding: 40, color: '#1c1008', backgroundColor: '#fff' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32, borderBottom: '1px solid #e8e0d0', paddingBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{nowStr}</div>
        <div style={{ fontSize: 22, fontWeight: 'bold', fontFamily: 'serif' }}>ნიკალას მარანი</div>
        <div style={{ fontSize: 13, letterSpacing: 2, marginTop: 2 }}>{displayName}</div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>1928</div>
      </div>

      {/* Invoice title + date */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 'bold', margin: 0 }}>ინვოისი</h1>
        <div style={{ textAlign: 'right', fontSize: 12, color: '#888' }}>
          <div>თარიღი:</div>
          <div style={{ color: '#1c1008', fontWeight: 600 }}>{dateStr} {order.timeSlot}</div>
        </div>
      </div>

      <div style={{ height: 1, backgroundColor: '#e8e0d0', marginBottom: 20 }} />
    </div>
  )

  if (!detailed) {
    // ── SIMPLE layout (original) ──────────────────────────────────────
    return (
      <div className="invoice-print" style={{ fontFamily: 'Georgia, serif', maxWidth: 600, margin: '0 auto', padding: 40, color: '#1c1008', backgroundColor: '#fff' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32, borderBottom: '1px solid #e8e0d0', paddingBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{nowStr}</div>
          <div style={{ fontSize: 22, fontWeight: 'bold', fontFamily: 'serif' }}>{displayName}</div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 'bold', margin: 0 }}>ინვოისი</h1>
          <div style={{ textAlign: 'right', fontSize: 12, color: '#888' }}>
            <div>თარიღი:</div>
            <div style={{ color: '#1c1008', fontWeight: 600 }}>{dateStr} {order.timeSlot}</div>
          </div>
        </div>

        <div style={{ height: 1, backgroundColor: '#e8e0d0', marginBottom: 20 }} />

        <Section title="კომპანია">
          <Row label="დასახელება" value={companyName} />
          <Row label="საიდენტიფიკაციო კოდი" value={idCode} />
        </Section>

        {simpleProducts.map(p => (
          <Section key={p} title={KA[p]}>
            <Row label="რაოდენობა" value={`${countOf(p)} კაცი`} />
          </Section>
        ))}

        <Section title="თანხა">
          {simpleProducts.map(p => <Row key={p} label={KA[p]} value={money(amountOf(p))} />)}
          {view.registration > 0 && <Row label={INVOICE_REGISTRATION_LABEL.ka} value={money(view.registration)} />}
          <Row label="დამ. სტუმრების კვება" value={money(0)} />
          {mcAmt + extrasAmt > 0 && <Row label="მასტერკლასი და დამატებები" value={money(mcAmt + extrasAmt)} />}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <strong style={{ fontSize: 15 }}>ჯამური თანხა: {formatTetriOrDash(asTetriOrNull(totalPrice), { space: true, decimals: true })}</strong>
          </div>
          {balanceRow}
        </Section>

        <div style={{ border: '1px solid #e8e0d0', borderRadius: 8, padding: 16, marginTop: 8 }}>
          <div style={{ borderLeft: '3px solid var(--color-brand)', paddingLeft: 10, marginBottom: 10 }}>
            <strong style={{ fontSize: 14 }}>გადახდის რეკვიზიტები</strong>
          </div>
          <Row label="მიმღების სახელი"   value={payment.recipientName  || '—'} />
          <Row label="პირადი ნომერი"      value={payment.personalNumber || '—'} mono />
          <Row label="მიმღები ბანკი"      value={payment.bankName       || '—'} />
          <Row label="ბანკის კოდი"        value={payment.bankCode       || '—'} mono />
          <Row label="მიმღების ანგარიში"  value={payment.iban           || '—'} mono />
        </div>
      </div>
    )
  }

  // ── DETAILED layout ───────────────────────────────────────────────
  return (
    <div className="invoice-print" style={{ fontFamily: 'Georgia, serif', maxWidth: 600, margin: '0 auto', padding: 40, color: '#1c1008', backgroundColor: '#fff' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32, borderBottom: '1px solid #e8e0d0', paddingBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{nowStr}</div>
        <div style={{ fontSize: 22, fontWeight: 'bold', fontFamily: 'serif' }}>ნიკალას მარანი</div>
        <div style={{ fontSize: 13, letterSpacing: 2, marginTop: 2 }}>{displayName}</div>
        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>1928</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 'bold', margin: 0 }}>ინვოისი — დეტალური</h1>
        <div style={{ textAlign: 'right', fontSize: 12, color: '#888' }}>
          <div>თარიღი:</div>
          <div style={{ color: '#1c1008', fontWeight: 600 }}>{dateStr} {order.timeSlot}</div>
        </div>
      </div>

      <div style={{ height: 1, backgroundColor: '#e8e0d0', marginBottom: 20 }} />

      {/* Company */}
      <Section title="კომპანია">
        <Row label="დასახელება" value={companyName} />
        <Row label="საიდენტიფიკაციო კოდი" value={idCode} />
      </Section>

      {/* Guests — one row per product, the free guests, and the kitchen total */}
      <Section title="სტუმრები">
        {view.guests.map(g => <Row key={g.product} label={KA[g.product]} value={`${g.count} კაცი`} />)}
        {view.free > 0 && <Row label="თავისუფალი (გიდი/მძღოლი)" value={`${view.free} კაცი`} />}
        <Row label="სულ" value={`${view.totalGuests} კაცი`} />
      </Section>

      {/* Masterclass lines */}
      {order.masterclassLines.length > 0 && (
        <Section title="მასტერკლასი">
          {order.masterclassLines.map((l, i) => (
            <Row
              key={i}
              label={`${l.name} × ${l.quantity}`}
              value={formatTetri(multiplyTetri(asTetri(l.pricePerUnit), l.quantity), { space: true, decimals: true })}
            />
          ))}
        </Section>
      )}

      {/* Extras */}
      {order.extras.length > 0 && (
        <Section title="დამატებები">
          {order.extras.map((e, i) => (
            <Row key={i} label={e.label} value={formatTetri(asTetri(e.amount), { space: true, decimals: true })} />
          ))}
        </Section>
      )}

      {/* Amount breakdown */}
      <Section title="თანხა">
        {view.lines
          ? view.lines.map(l => (
              <Row key={l.product} label={`${KA[l.product]} (${l.count} × ${formatTetri(asTetri(l.rate))})`} value={money(l.amount)} />
            ))
          : <Row label={KA[view.visitProduct]} value={money(bookingAmt)} />}
        {view.registration > 0 && <Row label={INVOICE_REGISTRATION_LABEL.ka} value={money(view.registration)} />}
        {order.masterclassLines.map((l, i) => (
          <Row key={i} label={l.name} value={formatTetri(multiplyTetri(asTetri(l.pricePerUnit), l.quantity), { space: true, decimals: true })} />
        ))}
        {order.extras.map((e, i) => (
          <Row key={i} label={e.label} value={formatTetri(asTetri(e.amount), { space: true, decimals: true })} />
        ))}
        <div style={{ height: 1, backgroundColor: '#c8b89a', margin: '8px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <strong style={{ fontSize: 15 }}>ჯამური თანხა: {formatTetriOrDash(asTetriOrNull(totalPrice), { space: true, decimals: true })}</strong>
        </div>
        {balanceRow}
      </Section>

      {/* Payment details */}
      <div style={{ border: '1px solid #e8e0d0', borderRadius: 8, padding: 16, marginTop: 8 }}>
        <div style={{ borderLeft: '3px solid var(--color-brand)', paddingLeft: 10, marginBottom: 10 }}>
          <strong style={{ fontSize: 14 }}>გადახდის რეკვიზიტები</strong>
        </div>
        <Row label="მიმღების სახელი"   value={payment.recipientName  || '—'} />
        <Row label="პირადი ნომერი"      value={payment.personalNumber || '—'} />
        <Row label="მიმღები ბანკი"      value={payment.bankName       || '—'} />
        <Row label="ბანკის კოდი"        value={payment.bankCode       || '—'} />
        <Row label="მიმღების ანგარიში"  value={payment.iban           || '—'} />
      </div>
    </div>
  )
}
