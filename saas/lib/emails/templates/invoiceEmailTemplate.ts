import { resolveTenantTheme, type ResolvedTheme } from '@/lib/themePresets'
import { asTetri, formatTetri, multiplyTetri } from '@/lib/money'
import { formatShortDate } from '@/lib/emails/templates/dateFormat'

/**
 * Pure HTML-building half of invoiceEmail.ts — see
 * bookingConfirmationTemplate.ts for why this split exists (Feature 181).
 *
 * Bilingual since the 2026-09-14 follow-up (previously Georgian-only, always)
 * so its `customMessage` slot can sit under the same EN/KA toggle as every
 * other admin-editable message on the Content page — the admin picks the
 * send language per-send in the "Send Invoice by Email" modal, since there's
 * no persisted per-order locale to infer it from (see MaintenanceNotes.md
 * on why booking/wine-receipt emails resolve locale differently).
 *
 * `customMessage` predates the tokens.ts / escaping convention its siblings
 * use — it is NOT escaped, to keep behavior identical to before the
 * extraction for the one flow that's admin-typed fresh on every send rather
 * than a persisted default rendered automatically.
 */

export type InvoiceLocale = 'en' | 'ka'

const LABELS: Record<InvoiceLocale, {
  invoice: string; company: string; name: string; idCode: string
  guests: string; tasting: string; lunch: string; free: string; total: string; lunchTasting: string
  masterclass: string; amount: string; totalAmount: string
  paymentDetails: string; recipientName: string; personalNumber: string; bank: string; bankCode: string; account: string
  person: string
}> = {
  ka: {
    invoice: 'ინვოისი', company: 'კომპანია', name: 'დასახელება', idCode: 'საიდენტიფიკაციო კოდი',
    guests: 'სტუმრები', tasting: 'დეგუსტაცია', lunch: 'სადილი', free: 'თავისუფალი (გიდი/მძღოლი)', total: 'სულ', lunchTasting: 'სადილი + დეგუსტაცია',
    masterclass: 'მასტერკლასი', amount: 'თანხა', totalAmount: 'ჯამური თანხა',
    paymentDetails: 'გადახდის რეკვიზიტები', recipientName: 'მიმღების სახელი', personalNumber: 'პირადი ნომერი', bank: 'მიმღები ბანკი', bankCode: 'ბანკის კოდი', account: 'მიმღების ანგარიში',
    person: 'კაცი',
  },
  en: {
    invoice: 'Invoice', company: 'Company', name: 'Name', idCode: 'ID code',
    guests: 'Guests', tasting: 'Tasting', lunch: 'Lunch', free: 'Free (guide/driver)', total: 'Total', lunchTasting: 'Lunch + Tasting',
    masterclass: 'Masterclass', amount: 'Amount', totalAmount: 'Total amount',
    paymentDetails: 'Payment Details', recipientName: 'Recipient name', personalNumber: 'Personal number', bank: 'Bank', bankCode: 'Bank code', account: 'Account (IBAN)',
    person: 'guest',
  },
}

export const DEFAULT_INVOICE_MESSAGE_EN = 'Thank you for visiting!'
export const DEFAULT_INVOICE_MESSAGE_KA = 'მადლობთ სტუმრობისთვის!'

export type InvoiceEmailData = {
  name: string
  surname: string
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
  /** Which language to render this send in. Defaults to 'ka' — the language this email has always been sent in. */
  locale?: InvoiceLocale
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

export function renderInvoiceEmail(data: InvoiceEmailData): { subject: string; html: string } {
  const locale = data.locale ?? 'ka'
  const L = LABELS[locale]
  // CSS variables don't resolve in email clients — colors are interpolated as
  // literal hex here, a genuinely separate mechanism from the --site-* pipeline
  // the rest of the app uses.
  const th = data.theme ?? resolveTenantTheme(null)
  const dateStr = formatShortDate(new Date(data.date), locale)

  const companyDisplay = data.companyName ?? `${data.name} ${data.surname}`
  const hasSplit = data.tastingGuestCount > 0 || data.lunchGuestCount > 0 || data.freeGuestCount > 0
  const isLunch = data.visitType === 'TASTING_LUNCH'

  const mcAmt = data.masterclassLines.reduce((s, l) => s + l.quantity * l.pricePerUnit, 0)
  const extrasAmt = data.extras.reduce((s, e) => s + e.amount, 0)
  const bookingAmt = data.totalPrice - mcAmt - extrasAmt

  // Guest rows
  let guestContent = ''
  if (hasSplit) {
    if (data.tastingGuestCount > 0) guestContent += tableRow(th, L.tasting, `${data.tastingGuestCount} ${L.person}`)
    if (data.lunchGuestCount > 0) guestContent += tableRow(th, L.lunch, `${data.lunchGuestCount} ${L.person}`)
    if (data.freeGuestCount > 0) guestContent += tableRow(th, L.free, `${data.freeGuestCount} ${L.person}`)
    guestContent += tableRow(th, L.total, `${data.guestCount} ${L.person}`)
  } else {
    guestContent += tableRow(th, isLunch ? L.lunchTasting : L.tasting, `${data.guestCount} ${L.person}`)
  }

  // Amount rows
  let amountContent = tableRow(th, isLunch ? L.lunchTasting : L.tasting, formatTetri(asTetri(bookingAmt), { space: true, decimals: true }))
  for (const l of data.masterclassLines) {
    amountContent += tableRow(th, l.name, formatTetri(multiplyTetri(asTetri(l.pricePerUnit), l.quantity), { space: true, decimals: true }))
  }
  for (const e of data.extras) {
    amountContent += tableRow(th, e.label, formatTetri(asTetri(e.amount), { space: true, decimals: true }))
  }
  amountContent += `<tr><td colspan="2" style="padding:4px 0;border-top:1px solid ${th.border};"></td></tr>`
  amountContent += `<tr><td colspan="2" style="text-align:right;font-size:15px;font-weight:bold;color:${th.brand} !important;padding-top:6px;">${L.totalAmount}: ${formatTetri(asTetri(data.totalPrice), { space: true, decimals: true })}</td></tr>`

  const customMessageHtml = data.customMessage.trim()
    ? `<p style="font-size:15px;color:${th.text} !important;margin:0 0 24px;line-height:1.7;white-space:pre-line;">${data.customMessage.trim()}</p>`
    : ''

  const masterclassSection = data.masterclassLines.length > 0
    ? section(th, L.masterclass, data.masterclassLines.map(l =>
        tableRow(th, `${l.name} × ${l.quantity}`, formatTetri(multiplyTetri(asTetri(l.pricePerUnit), l.quantity), { space: true, decimals: true }))
      ).join(''))
    : ''

  const html = `
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:${th.text} !important;background-color:${th.bg} !important;">

      <div style="background-color:${th.brand} !important;padding:32px 40px;border-radius:8px 8px 0 0;text-align:center;">
        <h1 style="color:#ffffff !important;margin:0;font-size:22px;font-weight:bold;">${data.wineryName || ''}</h1>
        ${data.wineryAddress ? `<p style="color:rgba(255,255,255,0.85) !important;margin:4px 0 0;font-size:11px;">${data.wineryAddress}</p>` : ''}
      </div>

      <div style="background-color:${th.surface} !important;padding:32px 40px;border-radius:0 0 8px 8px;border:1px solid ${th.border};border-top:none;">

        <h2 style="font-size:20px;font-weight:bold;margin:0 0 4px;color:${th.text} !important;">${L.invoice}</h2>
        <p style="font-size:12px;color:${th.muted} !important;margin:0 0 24px;">${dateStr} · ${data.timeSlot}</p>

        ${customMessageHtml}

        ${section(th, L.company,
          tableRow(th, L.name, companyDisplay) +
          tableRow(th, L.idCode, data.identificationCode ?? '—')
        )}

        ${section(th, L.guests, guestContent)}

        ${masterclassSection}

        ${section(th, L.amount, amountContent)}

        <div style="border:1px solid ${th.border};border-radius:8px;padding:16px;background-color:${th.surface} !important;">
          <div style="border-left:3px solid ${th.brand};padding-left:10px;margin-bottom:10px;">
            <strong style="font-size:14px;color:${th.text} !important;">${L.paymentDetails}</strong>
          </div>
          <table style="width:100%;border-collapse:collapse;">
            ${tableRow(th, L.recipientName, data.payment.recipientName || '—')}
            ${codeTableRow(th, L.personalNumber, data.payment.personalNumber || '—')}
            ${tableRow(th, L.bank, data.payment.bankName || '—')}
            ${codeTableRow(th, L.bankCode, data.payment.bankCode || '—')}
            ${codeTableRow(th, L.account, data.payment.iban || '—')}
          </table>
        </div>

      </div>
    </div>`

  return { subject: `${L.invoice} — ${companyDisplay} · ${dateStr} ${data.timeSlot}`, html }
}
