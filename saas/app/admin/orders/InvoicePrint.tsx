type Order = {
  id: string
  date: Date
  timeSlot: string
  visitType: string
  guestCount: number
  name: string
  surname: string
  totalPrice: number | null
  company: { name: string; identificationCode: string | null } | null
}

type Payment = {
  recipientName: string
  personalNumber: string
  bankName: string
  bankCode: string
  iban: string
}

type Props = { order: Order; payment: Payment }

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

export default function InvoicePrint({ order, payment }: Props) {
  const d = new Date(order.date)
  const dateStr = d.toLocaleDateString('ka-GE', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '.')
  const nowStr = new Date().toLocaleString('ka-GE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  const isTasting = order.visitType === 'TASTING'
  const isLunch = order.visitType === 'TASTING_LUNCH'

  const totalPrice = order.totalPrice ?? 0
  // Approximate split for display — full total on the relevant line
  const tastingAmount = isTasting ? totalPrice : 0
  const lunchAmount = isLunch ? totalPrice : 0

  const companyName = order.company?.name ?? `${order.name} ${order.surname}`
  const idCode = order.company?.identificationCode ?? '—'

  return (
    <div className="invoice-print" style={{ fontFamily: 'Georgia, serif', maxWidth: 600, margin: '0 auto', padding: 40, color: '#1c1008', backgroundColor: '#fff' }}>

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

      {/* Company */}
      <Section title="კომპანია">
        <Row label="დასახელება" value={companyName} />
        <Row label="საიდენტიფიკაციო კოდი" value={idCode} />
      </Section>

      {/* Lunch */}
      <Section title="სადილი">
        <Row label="რაოდენობა" value={isLunch ? `${order.guestCount} კაცი` : '0 კაცი'} />
      </Section>

      {/* Degustation */}
      <Section title="დეგუსტაცია">
        <Row label="რაოდენობა" value={isTasting ? `${order.guestCount} კაცი` : '0 კაცი'} />
      </Section>

      {/* Amount */}
      <Section title="თანხა">
        <Row label="სადილი" value={`${lunchAmount} ₾`} />
        <Row label="დეგუსტაცია" value={`${tastingAmount} ₾`} />
        <Row label="დამ. სტუმრების კვება" value="0 ₾" />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <strong style={{ fontSize: 15 }}>ჯამური თანხა: {totalPrice} ₾</strong>
        </div>
      </Section>

      {/* Payment details */}
      {(payment.recipientName || payment.iban) && (
        <div style={{ border: '1px solid #e8e0d0', borderRadius: 8, padding: 16, marginTop: 8 }}>
          <div style={{ borderLeft: '3px solid #7c1d23', paddingLeft: 10, marginBottom: 10 }}>
            <strong style={{ fontSize: 14 }}>გადახდის რეკვიზიტები</strong>
          </div>
          {payment.recipientName  && <Row label="მიმღების სახელი"   value={payment.recipientName} />}
          {payment.personalNumber && <Row label="პირადი ნომერი"      value={payment.personalNumber} />}
          {payment.bankName       && <Row label="მიმღები ბანქი"      value={payment.bankName} />}
          {payment.bankCode       && <Row label="ბანქის კოდი"        value={payment.bankCode} />}
          {payment.iban           && <Row label="მიმღების ანგარიში"  value={payment.iban} />}
        </div>
      )}

    </div>
  )
}
