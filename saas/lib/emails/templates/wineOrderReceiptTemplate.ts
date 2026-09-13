import { resolveTenantTheme, type ResolvedTheme } from '@/lib/themePresets'
import { renderTokenizedText } from '@/lib/emails/templates/tokens'

/**
 * Pure HTML-building half of wineOrderReceipt.ts — see
 * bookingConfirmationTemplate.ts for why this split exists (Feature 181), and
 * for why the intro paragraph (greeting + thank-you, together) is fully
 * tenant-editable with `{name}` substitution rather than a fixed line plus a
 * bolt-on note (Feature 181 follow-up, 2026-09-13).
 */

export const DEFAULT_WINE_RECEIPT_INTRO =
  'Dear {name},\n\nThank you — your payment has been received and your wine order is confirmed. We will be in touch about delivery.'

export type WineOrderLine = {
  name: string
  year: number
  quantity: number
  price: number
}

export type WineOrderReceiptData = {
  contactName: string
  businessName: string
  lines: WineOrderLine[]
  totalAmount: number
  discountPercent?: number | null
  wineryName?: string
  wineryAddress?: string
  wineryPhone?: string
  wineryEmail?: string
  theme?: ResolvedTheme
  /**
   * The tenant's editable intro block — sourced from `wine_receipt_email_intro`.
   * Falls back to DEFAULT_WINE_RECEIPT_INTRO when empty. `{name}` is
   * substituted with `data.contactName`.
   */
  introText?: string
}

export function renderWineOrderReceiptEmail(data: WineOrderReceiptData): { subject: string; html: string } {
  // CSS variables don't resolve in email clients — same literal-hex approach as
  // bookingConfirmationTemplate.ts, a deliberately separate mechanism from --site-*.
  const th = data.theme ?? resolveTenantTheme(null)
  const winery = data.wineryName || ''
  const address = data.wineryAddress || ''
  const phone = data.wineryPhone || ''
  const contactEmail = data.wineryEmail || ''

  // Mail clients auto-linkify bare phone numbers and addresses and override the
  // inline colour with their own link-blue; pre-tagging pre-empts that.
  const linkStyle = `color: ${th.muted} !important; text-decoration: none !important; -webkit-text-fill-color: ${th.muted} !important;`
  const contactLines = [
    address ? `<p style="font-size: 13px; color: ${th.muted}; margin: 0 0 8px;">📍 ${address}</p>` : '',
    phone ? `<p style="font-size: 13px; color: ${th.muted}; margin: 0 0 8px;">📞 <a href="tel:${phone.replace(/\s/g, '')}" style="${linkStyle}">${phone}</a></p>` : '',
    contactEmail ? `<p style="font-size: 13px; color: ${th.muted}; margin: 0 0 24px;">✉️ <a href="mailto:${contactEmail}" style="${linkStyle}">${contactEmail}</a></p>` : '',
  ].join('')

  const bottles = data.lines.reduce((n, l) => n + l.quantity, 0)

  const itemRows = data.lines.map(l => `
    <tr>
      <td style="color: ${th.text}; padding: 5px 0;">${l.name} ${l.year} × ${l.quantity}</td>
      <td style="color: ${th.text}; text-align: right;">${(l.quantity * l.price).toFixed(2)}₾</td>
    </tr>
  `).join('')

  const discountRow = data.discountPercent && data.discountPercent > 0
    ? `<tr><td style="color: ${th.muted}; padding: 5px 0;">Discount</td><td style="color: ${th.muted}; text-align: right;">−${data.discountPercent}%</td></tr>`
    : ''

  const introHtml = renderTokenizedText(data.introText?.trim() || DEFAULT_WINE_RECEIPT_INTRO, { name: data.contactName })

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
          <p style="font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.08em; color: ${th.secondary}; margin: 0 0 14px;">Order Summary</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            ${itemRows}
            ${discountRow}
            <tr style="border-top: 1px solid ${th.border};">
              <td style="color: ${th.muted}; padding: 10px 0 5px;">Paid</td>
              <td style="color: ${th.brand}; font-weight: bold; font-size: 16px; text-align: right;">${data.totalAmount.toFixed(2)}₾</td>
            </tr>
          </table>
          <p style="font-size: 12px; color: ${th.secondary}; margin: 12px 0 0;">${bottles} bottle${bottles === 1 ? '' : 's'} · ${data.businessName}</p>
        </div>

        ${contactLines}

      </div>
    </div>
  `

  return { subject: `Payment received — your wine order is confirmed`, html }
}
