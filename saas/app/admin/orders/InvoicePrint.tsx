type Order = {
  id: string
  date: Date
  timeSlot: string
  visitType: string
  guestCount: number
  tastingGuestCount: number
  lunchGuestCount: number
  freeGuestCount: number
  name: string
  surname: string
  totalPrice: number | null
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

type Props = { order: Order; payment: Payment; detailed?: boolean }

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '5px 0', borderBottom: '1px solid #e8e0d0' }}>
      <span style={{ color: '#888', fontSize: 13 }}>{label}</span>
      <span style={{ fontSize: 13, color: '#1c1008' }}>{value}</span>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ borderLeft: '3px solid #7c1d23', paddingLeft: 10, marginBottom: 8 }}>
        <strong style={{ fontSize: 14, color: '#1c1008' }}>{title}</strong>
      </div>
      {children}
    </div>
  )
}

export default function InvoicePrint({ order, payment, detailed = false }: Props) {
  const d = new Date(order.date)
  const dateStr = d.toLocaleDateString('ka-GE', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '.')
  const nowStr = new Date().toLocaleString('ka-GE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  const isTasting = order.visitType === 'TASTING'
  const isLunch = order.visitType === 'TASTING_LUNCH'
  const totalPrice = order.totalPrice ?? 0
  const companyName = order.company?.name ?? `${order.name} ${order.surname}`
  const idCode = order.company?.identificationCode ?? '—'

  // Detailed calculations
  const mcAmt = order.masterclassLines.reduce((s, l) => s + l.quantity * l.pricePerUnit, 0)
  const extrasAmt = order.extras.reduce((s, e) => s + e.amount, 0)
  const bookingAmt = totalPrice - mcAmt - extrasAmt

  // Determine if this order has split guest counts
  const hasSplitCounts = order.tastingGuestCount > 0 || order.lunchGuestCount > 0 || order.freeGuestCount > 0

  const header = (
    <div style={{ fontFamily: 'Georgia, serif', maxWidth: 600, margin: '0 auto', padding: 40, color: '#1c1008', backgroundColor: '#fff' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32, borderBottom: '1px solid #e8e0d0', paddingBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{nowStr}</div>
        <div style={{ fontSize: 22, fontWeight: 'bold', fontFamily: 'serif' }}>ნიკალას მარანი</div>
        <div style={{ fontSize: 13, letterSpacing: 2, marginTop: 2 }}>Nikalas Marani</div>
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
    const tastingAmount = isTasting ? totalPrice : 0
    const lunchAmount = isLunch ? totalPrice : 0

    return (
      <div className="invoice-print" style={{ fontFamily: 'Georgia, serif', maxWidth: 600, margin: '0 auto', padding: 40, color: '#1c1008', backgroundColor: '#fff' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32, borderBottom: '1px solid #e8e0d0', paddingBottom: 16 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{nowStr}</div>
          <div style={{ fontSize: 22, fontWeight: 'bold', fontFamily: 'serif' }}>ნიკალას მარანი</div>
          <div style={{ fontSize: 13, letterSpacing: 2, marginTop: 2 }}>Nikalas Marani</div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>1928</div>
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

        <Section title="სადილი">
          <Row label="რაოდენობა" value={isLunch ? `${order.guestCount} კაცი` : '0 კაცი'} />
        </Section>

        <Section title="დეგუსტაცია">
          <Row label="რაოდენობა" value={isTasting ? `${order.guestCount} კაცი` : '0 კაცი'} />
        </Section>

        <Section title="თანხა">
          <Row label="სადილი" value={`${lunchAmount} ₾`} />
          <Row label="დეგუსტაცია" value={`${tastingAmount} ₾`} />
          <Row label="დამ. სტუმრების კვება" value="0 ₾" />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <strong style={{ fontSize: 15 }}>ჯამური თანხა: {totalPrice} ₾</strong>
          </div>
        </Section>

        <div style={{ border: '1px solid #e8e0d0', borderRadius: 8, padding: 16, marginTop: 8 }}>
          <div style={{ borderLeft: '3px solid #7c1d23', paddingLeft: 10, marginBottom: 10 }}>
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

  // ── DETAILED layout ───────────────────────────────────────────────
  return (
    <div className="invoice-print" style={{ fontFamily: 'Georgia, serif', maxWidth: 600, margin: '0 auto', padding: 40, color: '#1c1008', backgroundColor: '#fff' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 32, borderBottom: '1px solid #e8e0d0', paddingBottom: 16 }}>
        <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{nowStr}</div>
        <div style={{ fontSize: 22, fontWeight: 'bold', fontFamily: 'serif' }}>ნიკალას მარანი</div>
        <div style={{ fontSize: 13, letterSpacing: 2, marginTop: 2 }}>Nikalas Marani</div>
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

      {/* Guests — split counts if available, else simple */}
      <Section title="სტუმრები">
        {hasSplitCounts ? (
          <>
            {order.tastingGuestCount > 0 && (
              <Row label="დეგუსტაცია" value={`${order.tastingGuestCount} კაცი`} />
            )}
            {order.lunchGuestCount > 0 && (
              <Row label="სადილი" value={`${order.lunchGuestCount} კაცი`} />
            )}
            {order.freeGuestCount > 0 && (
              <Row label="თავისუფალი (გიდი/მძღოლი)" value={`${order.freeGuestCount} კაცი`} />
            )}
            <Row label="სულ" value={`${order.guestCount} კაცი`} />
          </>
        ) : (
          <Row label={isLunch ? 'სადილი + დეგუსტაცია' : 'დეგუსტაცია'} value={`${order.guestCount} კაცი`} />
        )}
      </Section>

      {/* Masterclass lines */}
      {order.masterclassLines.length > 0 && (
        <Section title="მასტერკლასი">
          {order.masterclassLines.map((l, i) => (
            <Row
              key={i}
              label={`${l.name} × ${l.quantity}`}
              value={`${l.quantity * l.pricePerUnit} ₾`}
            />
          ))}
        </Section>
      )}

      {/* Extras */}
      {order.extras.length > 0 && (
        <Section title="დამატებები">
          {order.extras.map((e, i) => (
            <Row key={i} label={e.label} value={`${e.amount} ₾`} />
          ))}
        </Section>
      )}

      {/* Amount breakdown */}
      <Section title="თანხა">
        <Row
          label={isLunch ? 'სადილი + დეგუსტაცია' : 'დეგუსტაცია'}
          value={`${bookingAmt} ₾`}
        />
        {order.masterclassLines.map((l, i) => (
          <Row key={i} label={l.name} value={`${l.quantity * l.pricePerUnit} ₾`} />
        ))}
        {order.extras.map((e, i) => (
          <Row key={i} label={e.label} value={`${e.amount} ₾`} />
        ))}
        <div style={{ height: 1, backgroundColor: '#c8b89a', margin: '8px 0' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <strong style={{ fontSize: 15 }}>ჯამური თანხა: {totalPrice} ₾</strong>
        </div>
      </Section>

      {/* Payment details */}
      <div style={{ border: '1px solid #e8e0d0', borderRadius: 8, padding: 16, marginTop: 8 }}>
        <div style={{ borderLeft: '3px solid #7c1d23', paddingLeft: 10, marginBottom: 10 }}>
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
