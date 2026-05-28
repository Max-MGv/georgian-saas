import { Resend } from 'resend'

type InvoiceEmailData = {
  name: string
  surname: string
  email: string
  date: Date
  timeSlot: string
  visitType: 'TASTING' | 'TASTING_LUNCH'
  guestCount: number
  tastingGuestCount: number
  lunchGuestCount: number
  freeGuestCount: number
  totalPrice: number
  companyName: string | null
  identificationCode: string | null
  masterclassLines: { name: string; quantity: number; pricePerUnit: number }[]
  extras: { label: string; amount: number }[]
  payment: {
    recipientName: string
    personalNumber: string
    bankName: string
    bankCode: string
    iban: string
  }
  customMessage: string
}

function tableRow(label: string, value: string) {
  return `<tr>
    <td style="color:#6b5a47 !important;padding:5px 0;font-size:13px;vertical-align:top;">${label}</td>
    <td style="color:#1c1008 !important;text-align:right;font-size:13px;padding-left:12px;">${value}</td>
  </tr>`
}

function codeTableRow(label: string, value: string) {
  return `<tr>
    <td style="color:#6b5a47 !important;padding:5px 0;font-size:13px;vertical-align:top;">${label}</td>
    <td style="color:#1c1008 !important;text-align:right;font-size:12px;padding-left:12px;font-family:'Courier New',Courier,monospace;letter-spacing:0.04em;">${value}</td>
  </tr>`
}

function section(title: string, content: string) {
  return `
    <div style="margin-bottom:20px;">
      <div style="border-left:3px solid #7c1d23;padding-left:10px;margin-bottom:8px;">
        <strong style="font-size:14px;color:#1c1008 !important;">${title}</strong>
      </div>
      <table style="width:100%;border-collapse:collapse;">${content}</table>
    </div>`
}

export async function sendInvoiceEmail(data: InvoiceEmailData) {
  const dateStr = new Date(data.date)
    .toLocaleDateString('ka-GE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    .replace(/\//g, '.')

  const companyDisplay = data.companyName ?? `${data.name} ${data.surname}`
  const hasSplit = data.tastingGuestCount > 0 || data.lunchGuestCount > 0 || data.freeGuestCount > 0
  const isLunch = data.visitType === 'TASTING_LUNCH'

  const mcAmt = data.masterclassLines.reduce((s, l) => s + l.quantity * l.pricePerUnit, 0)
  const extrasAmt = data.extras.reduce((s, e) => s + e.amount, 0)
  const bookingAmt = data.totalPrice - mcAmt - extrasAmt

  // Guest rows
  let guestContent = ''
  if (hasSplit) {
    if (data.tastingGuestCount > 0) guestContent += tableRow('დეგუსტაცია', `${data.tastingGuestCount} კაცი`)
    if (data.lunchGuestCount > 0) guestContent += tableRow('სადილი', `${data.lunchGuestCount} კაცი`)
    if (data.freeGuestCount > 0) guestContent += tableRow('თავისუფალი (გიდი/მძღოლი)', `${data.freeGuestCount} კაცი`)
    guestContent += tableRow('სულ', `${data.guestCount} კაცი`)
  } else {
    guestContent += tableRow(isLunch ? 'სადილი + დეგუსტაცია' : 'დეგუსტაცია', `${data.guestCount} კაცი`)
  }

  // Amount rows
  let amountContent = tableRow(isLunch ? 'სადილი + დეგუსტაცია' : 'დეგუსტაცია', `${bookingAmt} ₾`)
  for (const l of data.masterclassLines) {
    amountContent += tableRow(l.name, `${l.quantity * l.pricePerUnit} ₾`)
  }
  for (const e of data.extras) {
    amountContent += tableRow(e.label, `${e.amount} ₾`)
  }
  amountContent += `<tr><td colspan="2" style="padding:4px 0;border-top:1px solid #c8b89a;"></td></tr>`
  amountContent += `<tr><td colspan="2" style="text-align:right;font-size:15px;font-weight:bold;color:#7c1d23 !important;padding-top:6px;">ჯამური თანხა: ${data.totalPrice} ₾</td></tr>`

  const customMessageHtml = data.customMessage.trim()
    ? `<p style="font-size:15px;color:#4a3728 !important;margin:0 0 24px;line-height:1.7;white-space:pre-line;">${data.customMessage.trim()}</p>`
    : ''

  const masterclassSection = data.masterclassLines.length > 0
    ? section('მასტერკლასი', data.masterclassLines.map(l =>
        tableRow(`${l.name} × ${l.quantity}`, `${l.quantity * l.pricePerUnit} ₾`)
      ).join(''))
    : ''

  const html = `
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1c1008 !important;background-color:#ffffff !important;">

      <div style="background-color:#7c1d23 !important;padding:32px 40px;border-radius:8px 8px 0 0;text-align:center;">
        <h1 style="color:#ffffff !important;margin:0;font-size:22px;font-weight:bold;">ნიკალას მარანი</h1>
        <p style="color:#f5c6c8 !important;margin:4px 0 0;font-size:13px;letter-spacing:2px;">Nikalas Marani</p>
        <p style="color:#c9a0a4 !important;margin:4px 0 0;font-size:11px;">1928 · Kardanakhi, Kakheti</p>
      </div>

      <div style="background-color:#fff9f3 !important;padding:32px 40px;border-radius:0 0 8px 8px;border:1px solid #e0d4c0;border-top:none;">

        <h2 style="font-size:20px;font-weight:bold;margin:0 0 4px;color:#1c1008 !important;">ინვოისი</h2>
        <p style="font-size:12px;color:#888888 !important;margin:0 0 24px;">${dateStr} · ${data.timeSlot}</p>

        ${customMessageHtml}

        ${section('კომპანია',
          tableRow('დასახელება', companyDisplay) +
          tableRow('საიდენტიფიკაციო კოდი', data.identificationCode ?? '—')
        )}

        ${section('სტუმრები', guestContent)}

        ${masterclassSection}

        ${section('თანხა', amountContent)}

        <div style="border:1px solid #e0d4c0;border-radius:8px;padding:16px;background-color:#fff9f3 !important;">
          <div style="border-left:3px solid #7c1d23;padding-left:10px;margin-bottom:10px;">
            <strong style="font-size:14px;color:#1c1008 !important;">გადახდის რეკვიზიტები</strong>
          </div>
          <table style="width:100%;border-collapse:collapse;">
            ${tableRow('მიმღების სახელი', data.payment.recipientName || '—')}
            ${codeTableRow('პირადი ნომერი', data.payment.personalNumber || '—')}
            ${tableRow('მიმღები ბანკი', data.payment.bankName || '—')}
            ${codeTableRow('ბანკის კოდი', data.payment.bankCode || '—')}
            ${codeTableRow('მიმღების ანგარიში', data.payment.iban || '—')}
          </table>
        </div>

      </div>
    </div>`

  const resend = new Resend(process.env.RESEND_API_KEY)

  // Sandbox mode: onboarding@resend.dev can only deliver to the verified owner email.
  // Once nikalasmarani.ge is verified in Resend, change `to` back to data.email
  // and update `from` to something like invoices@nikalasmarani.ge.
  const isDomainVerified = false // flip to true after verifying nikalasmarani.ge in Resend
  const toAddress = isDomainVerified ? data.email : 'max.mghvdliashvili@gmail.com'

  const { error } = await resend.emails.send({
    from: 'onboarding@resend.dev',
    to: toAddress,
    replyTo: 'max.mghvdliashvili@gmail.com',
    subject: `ინვოისი — ${companyDisplay} · ${dateStr} ${data.timeSlot}`,
    html,
  })

  if (error) throw new Error(error.message)
}
