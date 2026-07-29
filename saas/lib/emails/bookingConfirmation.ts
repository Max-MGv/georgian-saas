import { Resend } from 'resend'
import { resolveTenantTheme, type ResolvedTheme } from '@/lib/themePresets'

type BookingEmailData = {
  name: string
  surname: string
  email: string
  date: string        // e.g. "Saturday, 24 May 2026"
  timeSlot: string    // e.g. "14:00"
  guestCount: number
  visitType: 'TASTING' | 'TASTING_LUNCH'
  totalPrice: number
  wineryName?: string
  wineryAddress?: string
  wineryPhone?: string
  wineryEmail?: string
  theme?: ResolvedTheme
  /**
   * Sent from the settlement path, after the customer actually paid by card.
   * Swaps the copy rather than forking the template — the old Laravel site kept
   * two near-identical mail bodies for the paid and unpaid paths and they had
   * already drifted apart. One template, one flag.
   */
  paid?: boolean
}

export async function sendBookingConfirmation(data: BookingEmailData) {
  // CSS variables don't resolve in email clients — colors are interpolated as
  // literal hex here, a genuinely separate mechanism from the --site-* pipeline
  // the rest of the app uses.
  const th = data.theme ?? resolveTenantTheme(null)
  const visitLabel = data.visitType === 'TASTING' ? 'Wine Tasting' : 'Wine Tasting + Lunch'
  const winery = data.wineryName || ''
  const address = data.wineryAddress || ''
  const phone = data.wineryPhone || ''
  const contactEmail = data.wineryEmail || ''

  // Phone/email are wrapped in real <a> tags with forced inline color — mail clients
  // (Gmail, iOS/Apple Mail) auto-linkify bare-looking phone numbers and email
  // addresses and override inline color with their own link-blue. Pre-tagging with
  // an explicit style (belt-and-braces with -webkit-text-fill-color for WebKit
  // clients) pre-empts that, same technique already used for phone/IBAN numbers
  // in InvoicePrint.tsx / globals.css.
  const linkStyle = `color: ${th.muted} !important; text-decoration: none !important; -webkit-text-fill-color: ${th.muted} !important;`
  const contactLines = [
    address    ? `<p style="font-size: 13px; color: ${th.muted}; margin: 0 0 8px;">📍 ${address}</p>` : '',
    phone      ? `<p style="font-size: 13px; color: ${th.muted}; margin: 0 0 8px;">📞 <a href="tel:${phone.replace(/\s/g, '')}" style="${linkStyle}">${phone}</a> · Call or WhatsApp</p>` : '',
    contactEmail ? `<p style="font-size: 13px; color: ${th.muted}; margin: 0 0 24px;">✉️ <a href="mailto:${contactEmail}" style="${linkStyle}">${contactEmail}</a></p>` : '',
  ].join('')

  const html = `
    <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; color: ${th.text};">

      <div style="background-color: ${th.brand}; padding: 32px 40px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 22px; font-weight: bold;">${winery}</h1>
        ${address ? `<p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 14px;">${address} · Family Winery</p>` : ''}
      </div>

      <div style="background-color: ${th.surface}; padding: 32px 40px; border-radius: 0 0 8px 8px; border: 1px solid ${th.border}; border-top: none;">

        <p style="font-size: 16px; margin: 0 0 24px;">Dear ${data.name},</p>

        <p style="font-size: 15px; color: ${th.text}; margin: 0 0 24px; line-height: 1.6;">
          ${data.paid
            ? 'Thank you — your payment has been received and your booking is confirmed. We look forward to welcoming you.'
            : 'Thank you for your booking request. We have received your reservation and will contact you shortly to confirm the details.'}
        </p>

        <div style="background-color: ${th.bg}; border-radius: 8px; padding: 20px 24px; margin: 0 0 24px;">
          <p style="font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em; color: ${th.secondary}; margin: 0 0 14px;">Booking Summary</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="color: ${th.muted}; padding: 5px 0;">Visit type</td>
              <td style="color: ${th.text}; font-weight: bold; text-align: right;">${visitLabel}</td>
            </tr>
            <tr>
              <td style="color: ${th.muted}; padding: 5px 0;">Date</td>
              <td style="color: ${th.text}; font-weight: bold; text-align: right;">${data.date}</td>
            </tr>
            <tr>
              <td style="color: ${th.muted}; padding: 5px 0;">Time</td>
              <td style="color: ${th.text}; font-weight: bold; text-align: right;">${data.timeSlot}</td>
            </tr>
            <tr>
              <td style="color: ${th.muted}; padding: 5px 0;">Guests</td>
              <td style="color: ${th.text}; font-weight: bold; text-align: right;">${data.guestCount}</td>
            </tr>
            <tr style="border-top: 1px solid ${th.border};">
              <td style="color: ${th.muted}; padding: 10px 0 5px;">${data.paid ? 'Paid' : 'Estimated total'}</td>
              <td style="color: ${th.brand}; font-weight: bold; font-size: 16px; text-align: right;">${data.totalPrice}₾</td>
            </tr>
          </table>
        </div>

        ${contactLines}

        <div style="border-top: 1px solid ${th.border}; padding-top: 16px; ${contactLines ? '' : 'margin-top: 24px;'}">
          <p style="font-size: 12px; color: ${th.secondary}; margin: 0; line-height: 1.6;">
            48-hour cancellation policy applies. Please notify us at least 48 hours before your visit if you need to cancel or reschedule.
          </p>
        </div>

      </div>
    </div>
  `

  const resend = new Resend(process.env.RESEND_API_KEY)

  // Sandbox mode: onboarding@resend.dev can only deliver to the verified owner email.
  // Once nikalasmarani.ge is verified in Resend, change `to` back to data.email
  // and update `from` to something like bookings@nikalasmarani.ge.
  const isDomainVerified = false // flip to true after verifying nikalasmarani.ge in Resend
  const toAddress = isDomainVerified ? data.email : 'max.mghvdliashvili@gmail.com'

  const { error } = await resend.emails.send({
    from: 'onboarding@resend.dev',
    to: toAddress,
    replyTo: 'max.mghvdliashvili@gmail.com',
    subject: data.paid
      ? `Payment received — your booking on ${data.date} at ${data.timeSlot} is confirmed`
      : `Booking request received — ${data.date} at ${data.timeSlot}`,
    html,
  })

  if (error) throw new Error(error.message)
}
