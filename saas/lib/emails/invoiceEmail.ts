import { Resend } from 'resend'
import { resolveTenantTheme, type ResolvedTheme } from '@/lib/themePresets'

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
  wineryName?: string
  wineryAddress?: string
  theme?: ResolvedTheme
}

function tableRow(th: ResolvedTheme, label: string, value: string) {
  return `<tr>
    <td style="color:${th.muted} !important;padding:5px 0;font-size:13px;vertical-align:top;">${label}</td>
    <td style="color:${th.text} !important;text-align:right;font-size:13px;padding-left:12px;">${value}</td>
  </tr>`
}

function codeTableRow(th: ResolvedTheme, label: string, value: string) {
  // Personal numbers, bank codes, IBANs — WebKit/Gmail data detectors can flag these
  // as phone numbers or reference codes and override the color with link-blue.
  // -webkit-text-fill-color pins it, same technique as InvoicePrint.tsx / globals.css.
  return `<tr>
    <td style="color:${th.muted} !important;padding:5px 0;font-size:13px;vertical-align:top;">${label}</td>
    <td style="color:${th.text} !important;-webkit-text-fill-color:${th.text} !important;text-align:right;font-size:12px;padding-left:12px;font-family:'Courier New',Courier,monospace;letter-spacing:0.04em;">${value}</td>
  </tr>`
}

function section(th: ResolvedTheme, title: string, content: string) {
  return `
    <div style="margin-bottom:20px;">
      <div style="border-left:3px solid ${th.brand};padding-left:10px;margin-bottom:8px;">
        <strong style="font-size:14px;color:${th.text} !important;">${title}</strong>
      </div>
      <table style="width:100%;border-collapse:collapse;">${content}</table>
    </div>`
}

export async function sendInvoiceEmail(data: InvoiceEmailData) {
  // CSS variables don't resolve in email clients — colors are interpolated as
  // literal hex here, a genuinely separate mechanism from the --site-* pipeline
  // the rest of the app uses.
  const th = data.theme ?? resolveTenantTheme(null)
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
    if (data.tastingGuestCount > 0) guestContent += tableRow(th, 'დეგუსტაცია', `${data.tastingGuestCount} კაცი`)
    if (data.lunchGuestCount > 0) guestContent += tableRow(th, 'სადილი', `${data.lunchGuestCount} კაცი`)
    if (data.freeGuestCount > 0) guestContent += tableRow(th, 'თავისუფალი (გიდი/მძღოლი)', `${data.freeGuestCount} კაცი`)
    guestContent += tableRow(th, 'სულ', `${data.guestCount} კაცი`)
  } else {
    guestContent += tableRow(th, isLunch ? 'სადილი + დეგუსტაცია' : 'დეგუსტაცია', `${data.guestCount} კაცი`)
  }

  // Amount rows
  let amountContent = tableRow(th, isLunch ? 'სადილი + დეგუსტაცია' : 'დეგუსტაცია', `${bookingAmt} ₾`)
  for (const l of data.masterclassLines) {
    amountContent += tableRow(th, l.name, `${l.quantity * l.pricePerUnit} ₾`)
  }
  for (const e of data.extras) {
    amountContent += tableRow(th, e.label, `${e.amount} ₾`)
  }
  amountContent += `<tr><td colspan="2" style="padding:4px 0;border-top:1px solid ${th.border};"></td></tr>`
  amountContent += `<tr><td colspan="2" style="text-align:right;font-size:15px;font-weight:bold;color:${th.brand} !important;padding-top:6px;">ჯამური თანხა: ${data.totalPrice} ₾</td></tr>`

  const customMessageHtml = data.customMessage.trim()
    ? `<p style="font-size:15px;color:${th.text} !important;margin:0 0 24px;line-height:1.7;white-space:pre-line;">${data.customMessage.trim()}</p>`
    : ''

  const masterclassSection = data.masterclassLines.length > 0
    ? section(th, 'მასტერკლასი', data.masterclassLines.map(l =>
        tableRow(th, `${l.name} × ${l.quantity}`, `${l.quantity * l.pricePerUnit} ₾`)
      ).join(''))
    : ''

  const html = `
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:${th.text} !important;background-color:${th.bg} !important;">

      <div style="background-color:${th.brand} !important;padding:32px 40px;border-radius:8px 8px 0 0;text-align:center;">
        <h1 style="color:#ffffff !important;margin:0;font-size:22px;font-weight:bold;">${data.wineryName || ''}</h1>
        ${data.wineryAddress ? `<p style="color:rgba(255,255,255,0.85) !important;margin:4px 0 0;font-size:11px;">${data.wineryAddress}</p>` : ''}
      </div>

      <div style="background-color:${th.surface} !important;padding:32px 40px;border-radius:0 0 8px 8px;border:1px solid ${th.border};border-top:none;">

        <h2 style="font-size:20px;font-weight:bold;margin:0 0 4px;color:${th.text} !important;">ინვოისი</h2>
        <p style="font-size:12px;color:${th.muted} !important;margin:0 0 24px;">${dateStr} · ${data.timeSlot}</p>

        ${customMessageHtml}

        ${section(th, 'კომპანია',
          tableRow(th, 'დასახელება', companyDisplay) +
          tableRow(th, 'საიდენტიფიკაციო კოდი', data.identificationCode ?? '—')
        )}

        ${section(th, 'სტუმრები', guestContent)}

        ${masterclassSection}

        ${section(th, 'თანხა', amountContent)}

        <div style="border:1px solid ${th.border};border-radius:8px;padding:16px;background-color:${th.surface} !important;">
          <div style="border-left:3px solid ${th.brand};padding-left:10px;margin-bottom:10px;">
            <strong style="font-size:14px;color:${th.text} !important;">გადახდის რეკვიზიტები</strong>
          </div>
          <table style="width:100%;border-collapse:collapse;">
            ${tableRow(th, 'მიმღების სახელი', data.payment.recipientName || '—')}
            ${codeTableRow(th, 'პირადი ნომერი', data.payment.personalNumber || '—')}
            ${tableRow(th, 'მიმღები ბანკი', data.payment.bankName || '—')}
            ${codeTableRow(th, 'ბანკის კოდი', data.payment.bankCode || '—')}
            ${codeTableRow(th, 'მიმღების ანგარიში', data.payment.iban || '—')}
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
