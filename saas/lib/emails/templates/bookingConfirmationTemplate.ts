import { resolveTenantTheme, type ResolvedTheme } from '@/lib/themePresets'
import { asTetri, formatTetri } from '@/lib/money'
import { renderTokenizedText } from '@/lib/emails/templates/tokens'

/**
 * Pure HTML-building half of bookingConfirmation.ts, split out (2026-09-13,
 * Feature 181 — automatic messages preview) so the admin "Messages" page can
 * render the exact email a customer would receive, client-side, with no
 * network round trip and without importing the `resend`/send-side code into
 * the browser bundle. Keep this file free of server-only imports.
 *
 * The intro paragraph is fully tenant-editable (Feature 181 follow-up,
 * 2026-09-13) — three separate defaults, one per variant below, because the
 * three variants carry different *factual* meaning (confirmed vs. not), not
 * just different tone. A single shared box would let an admin accidentally
 * paste "your payment is confirmed" wording into the unpaid variant. `{name}`
 * is the one supported token, substituted by renderTokenizedText().
 */

export const DEFAULT_BOOKING_INTRO_UNPAID =
  'Dear {name},\n\nThank you for your booking request. We have received your reservation and will contact you shortly to confirm the details.'
export const DEFAULT_BOOKING_INTRO_PAID =
  'Dear {name},\n\nThank you — your payment has been received and your booking is confirmed. We look forward to welcoming you.'
export const DEFAULT_BOOKING_INTRO_PENDING_COMPANY =
  "Dear {name},\n\nThank you for your booking and company registration request. This request is not yet confirmed — since your company isn't set up in our system yet, we'll review your details, set up your account, and contact you shortly to confirm both your booking and your company's pricing."

// Georgian defaults (2026-09-14 follow-up) — drafted, not native-reviewed.
// Flag to Max for a wording pass the way legalContent.ts's KA text got one.
export const DEFAULT_BOOKING_INTRO_UNPAID_KA =
  'ძვირფასო {name},\n\nმადლობთ ჯავშნის მოთხოვნისთვის. თქვენი დაჯავშნა მიღებულია და მალე დაგიკავშირდებით დეტალების დასადასტურებლად.'
export const DEFAULT_BOOKING_INTRO_PAID_KA =
  'ძვირფასო {name},\n\nმადლობთ — თქვენი გადახდა მიღებულია და ჯავშანი დადასტურებულია. მოუთმენლად ველით თქვენს სტუმრობას.'
export const DEFAULT_BOOKING_INTRO_PENDING_COMPANY_KA =
  'ძვირფასო {name},\n\nმადლობთ ჯავშნისა და კომპანიის რეგისტრაციის მოთხოვნისთვის. მოთხოვნა ჯერ არ არის დადასტურებული — რადგან თქვენი კომპანია ჯერ არ არის დარეგისტრირებული ჩვენს სისტემაში, განვიხილავთ თქვენს დეტალებს, შევქმნით ანგარიშს და მალე დაგიკავშირდებით ჯავშნისა და ფასის დასადასტურებლად.'

type BookingEmailLocale = 'en' | 'ka'

const LABELS: Record<BookingEmailLocale, {
  summary: string; visitType: string; date: string; time: string; guests: string
  paid: string; estimatedTotal: string; cancellationPolicy: string
  tasting: string; tastingLunch: string
}> = {
  en: {
    summary: 'Booking Summary', visitType: 'Visit type', date: 'Date', time: 'Time', guests: 'Guests',
    paid: 'Paid', estimatedTotal: 'Estimated total',
    cancellationPolicy: '48-hour cancellation policy applies. Please notify us at least 48 hours before your visit if you need to cancel or reschedule.',
    tasting: 'Wine Tasting', tastingLunch: 'Wine Tasting + Lunch',
  },
  ka: {
    summary: 'ჯავშნის დეტალები', visitType: 'ვიზიტის ტიპი', date: 'თარიღი', time: 'დრო', guests: 'სტუმრები',
    paid: 'გადახდილია', estimatedTotal: 'სავარაუდო ჯამი',
    cancellationPolicy: 'მოქმედებს გაუქმების 48-საათიანი პოლიტიკა. გთხოვთ, გვაცნობოთ სტუმრობამდე მინიმუმ 48 საათით ადრე, თუ გჭირდებათ გაუქმება ან გადატანა.',
    tasting: 'ღვინის დეგუსტაცია', tastingLunch: 'ღვინის დეგუსტაცია + სადილი',
  },
}

export type BookingEmailData = {
  name: string
  surname: string
  date: string        // e.g. "Saturday, 24 May 2026" — pre-formatted by the caller, see lib/emails/templates/dateFormat.ts
  timeSlot: string    // e.g. "14:00"
  guestCount: number
  visitType: 'TASTING' | 'TASTING_LUNCH'
  totalPrice: number
  /** Which language to render this send in. Defaults to 'en'. */
  locale?: BookingEmailLocale
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
   * The tenant's editable intro block — greeting AND thank-you paragraph
   * together, e.g. "Dear {name},\n\nThank you for..." — for whichever
   * variant this send is (unpaid / paid / pendingNewCompany). Sourced from
   * one of `email_booking_intro_unpaid` / `_paid` / `_pending_company` (Content
   * page, section "messages"). Falls
   * back to the matching DEFAULT_BOOKING_INTRO_* above when empty. `{name}`
   * is the one supported token, substituted with `data.name`.
   */
  introText?: string
}

export function renderBookingConfirmationEmail(data: BookingEmailData): { subject: string; html: string } {
  // CSS variables don't resolve in email clients — colors are interpolated as
  // literal hex here, a genuinely separate mechanism from the --site-* pipeline
  // the rest of the app uses.
  const th = data.theme ?? resolveTenantTheme(null)
  const locale = data.locale ?? 'en'
  const L = LABELS[locale]
  const visitLabel = data.visitType === 'TASTING' ? L.tasting : L.tastingLunch
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

  const introTemplate = data.introText?.trim() || (
    data.paid ? DEFAULT_BOOKING_INTRO_PAID
      : data.pendingNewCompany ? DEFAULT_BOOKING_INTRO_PENDING_COMPANY
        : DEFAULT_BOOKING_INTRO_UNPAID
  )
  const introHtml = renderTokenizedText(introTemplate, { name: data.name })

  const html = `
    <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; color: ${th.text};">

      <div style="background-color: ${th.brand}; padding: 32px 40px; border-radius: 8px 8px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 22px; font-weight: bold;">${winery}</h1>
        ${address ? `<p style="color: rgba(255,255,255,0.85); margin: 6px 0 0; font-size: 14px;">${address} · Family Winery</p>` : ''}
      </div>

      <div style="background-color: ${th.surface}; padding: 32px 40px; border-radius: 0 0 8px 8px; border: 1px solid ${th.border}; border-top: none;">

        <p style="font-size: 15px; color: ${th.text}; margin: 0 0 24px; line-height: 1.6; white-space: pre-line;">
          ${introHtml}
        </p>

        <div style="background-color: ${th.bg}; border-radius: 8px; padding: 20px 24px; margin: 0 0 24px;">
          <p style="font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em; color: ${th.secondary}; margin: 0 0 14px;">${L.summary}</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="color: ${th.muted}; padding: 5px 0;">${L.visitType}</td>
              <td style="color: ${th.text}; font-weight: bold; text-align: right;">${visitLabel}</td>
            </tr>
            <tr>
              <td style="color: ${th.muted}; padding: 5px 0;">${L.date}</td>
              <td style="color: ${th.text}; font-weight: bold; text-align: right;">${data.date}</td>
            </tr>
            <tr>
              <td style="color: ${th.muted}; padding: 5px 0;">${L.time}</td>
              <td style="color: ${th.text}; font-weight: bold; text-align: right;">${data.timeSlot}</td>
            </tr>
            <tr>
              <td style="color: ${th.muted}; padding: 5px 0;">${L.guests}</td>
              <td style="color: ${th.text}; font-weight: bold; text-align: right;">${data.guestCount}</td>
            </tr>
            <tr style="border-top: 1px solid ${th.border};">
              <td style="color: ${th.muted}; padding: 10px 0 5px;">${data.paid ? L.paid : L.estimatedTotal}</td>
              <td style="color: ${th.brand}; font-weight: bold; font-size: 16px; text-align: right;">${formatTetri(asTetri(data.totalPrice), { decimals: true })}</td>
            </tr>
          </table>
        </div>

        ${contactLines}

        <div style="border-top: 1px solid ${th.border}; padding-top: 16px; ${contactLines ? '' : 'margin-top: 24px;'}">
          <p style="font-size: 12px; color: ${th.secondary}; margin: 0; line-height: 1.6;">
            ${L.cancellationPolicy}
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
