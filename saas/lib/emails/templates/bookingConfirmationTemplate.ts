import { resolveTenantTheme, type ResolvedTheme } from '@/lib/themePresets'

/**
 * Pure HTML-building half of bookingConfirmation.ts, split out (2026-09-13,
 * Feature 181 — automatic messages preview) so the admin "Messages" page can
 * render the exact email a customer would receive, client-side, with no
 * network round trip and without importing the `resend`/send-side code into
 * the browser bundle. Keep this file free of server-only imports.
 */

export type BookingEmailData = {
  name: string
  surname: string
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
  /**
   * Set when this booking was submitted with no companyId, through the "New
   * Company?" flow (Feature 180) — there's no account for this company yet,
   * so the copy must say this is a registration request, not a confirmed
   * booking, on top of the usual unpaid "we'll be in touch" language.
   */
  pendingNewCompany?: boolean
  /**
   * Tenant's own note, e.g. "Thank you for visiting!" — sourced from the
   * `booking_email_message` setting (Feature 181), same slot pattern as
   * invoiceEmailTemplate's `customMessage`. Empty/omitted renders nothing.
   */
  customMessage?: string
}

// Same escaping used nowhere else in this file's siblings (their interpolated
// values are all admin- or server-computed, not free text) — this one field
// is a persisted tenant default reused on every future email, so a stray
// pasted `<`/`&` shouldn't be able to break the markup for good until noticed.
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function renderBookingConfirmationEmail(data: BookingEmailData): { subject: string; html: string } {
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

  const customMessageHtml = data.customMessage?.trim()
    ? `<p style="font-size: 14px; color: ${th.text}; margin: 0 0 24px; line-height: 1.7; white-space: pre-line;">${escapeHtml(data.customMessage.trim())}</p>`
    : ''

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
            : data.pendingNewCompany
              ? 'Thank you for your booking and company registration request. <strong>This request is not yet confirmed</strong> — since your company isn\'t set up in our system yet, we\'ll review your details, set up your account, and contact you shortly to confirm both your booking and your company\'s pricing.'
              : 'Thank you for your booking request. We have received your reservation and will contact you shortly to confirm the details.'}
        </p>

        ${customMessageHtml}

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

  const subject = data.paid
    ? `Payment received — your booking on ${data.date} at ${data.timeSlot} is confirmed`
    : data.pendingNewCompany
      ? `Request received (not yet confirmed) — ${data.date} at ${data.timeSlot}`
      : `Booking request received — ${data.date} at ${data.timeSlot}`

  return { subject, html }
}
