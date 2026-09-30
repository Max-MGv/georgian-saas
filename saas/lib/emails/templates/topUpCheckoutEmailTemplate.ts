import { resolveTenantTheme, type ResolvedTheme } from '@/lib/themePresets'
import { asTetri, formatTetri } from '@/lib/money'
import { formatShortDate } from '@/lib/emails/templates/dateFormat'

/**
 * Card-link top-up email (Plan-PostPaymentExtras Chunk 4, KnownBugs #64) —
 * "here's an outstanding balance on your visit; pay it yourself with a
 * card." Deliberately short: unlike the invoice email this has one job, a
 * working checkout link, not a full itemised breakdown the guest already
 * received on the original invoice/confirmation.
 *
 * Structurally the same header/footer wrapper and theme handling as
 * invoiceEmailTemplate.ts (same conventions, per the plan's own instruction
 * to reuse them) — a separate file rather than a branch inside that one
 * because the content is genuinely different (one amount + one link, not an
 * itemised total), and invoiceEmailTemplate.ts is already dense.
 */

export type TopUpCheckoutLocale = 'en' | 'ka'

const LABELS: Record<TopUpCheckoutLocale, {
  subject: string; greeting: (name: string) => string
  intro: (dateStr: string, timeSlot: string) => string
  amountLabel: string; button: string; fallback: string
}> = {
  en: {
    subject: 'Payment link — outstanding balance',
    greeting: name => `Dear ${name},`,
    intro: (dateStr, timeSlot) =>
      `There is an outstanding balance on your visit on ${dateStr} at ${timeSlot}. You can pay it securely by card using the link below.`,
    amountLabel: 'Amount due',
    button: 'Pay now',
    fallback: "If the button above doesn't work, copy and paste this link into your browser:",
  },
  ka: {
    subject: 'გადახდის ბმული — გადასახდელი ნაშთი',
    greeting: name => `ძვირფასო ${name},`,
    intro: (dateStr, timeSlot) =>
      `თქვენს ვიზიტზე (${dateStr}, ${timeSlot}) რჩება გადასახდელი ნაშთი. შეგიძლიათ უსაფრთხოდ გადაიხადოთ ბარათით ქვემოთ მოცემული ბმულით.`,
    amountLabel: 'გადასახდელი თანხა',
    button: 'გადახდა ახლავე',
    fallback: 'თუ ღილაკი არ მუშაობს, დააკოპირეთ და ჩასვით ეს ბმული თქვენს ბრაუზერში:',
  },
}

export type TopUpCheckoutEmailData = {
  name: string
  surname: string
  date: Date
  timeSlot: string
  /** TETRI. The exact amount this specific checkout was started for. */
  amount: number
  checkoutUrl: string
  wineryName?: string
  wineryAddress?: string
  theme?: ResolvedTheme
  /** Defaults to 'ka', matching the invoice email's own default. */
  locale?: TopUpCheckoutLocale
}

export function renderTopUpCheckoutEmail(data: TopUpCheckoutEmailData): { subject: string; html: string } {
  const locale = data.locale ?? 'ka'
  const L = LABELS[locale]
  const th = data.theme ?? resolveTenantTheme(null)
  const dateStr = formatShortDate(new Date(data.date), locale)
  const fullName = `${data.name} ${data.surname}`.trim()

  const html = `
    <div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:${th.text} !important;background-color:${th.bg} !important;">

      <div style="background-color:${th.brand} !important;padding:32px 40px;border-radius:8px 8px 0 0;text-align:center;">
        <h1 style="color:#ffffff !important;margin:0;font-size:22px;font-weight:bold;">${data.wineryName || ''}</h1>
        ${data.wineryAddress ? `<p style="color:rgba(255,255,255,0.85) !important;margin:4px 0 0;font-size:11px;">${data.wineryAddress}</p>` : ''}
      </div>

      <div style="background-color:${th.surface} !important;padding:32px 40px;border-radius:0 0 8px 8px;border:1px solid ${th.border};border-top:none;">

        <p style="font-size:15px;color:${th.text} !important;margin:0 0 16px;">${L.greeting(fullName)}</p>
        <p style="font-size:15px;color:${th.text} !important;margin:0 0 24px;line-height:1.7;">${L.intro(dateStr, data.timeSlot)}</p>

        <div style="border:1px solid ${th.border};border-radius:8px;padding:20px;background-color:${th.surface} !important;text-align:center;margin-bottom:24px;">
          <p style="font-size:12px;color:${th.muted} !important;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.04em;">${L.amountLabel}</p>
          <p style="font-size:24px;font-weight:bold;color:${th.brand} !important;margin:0;">${formatTetri(asTetri(data.amount), { space: true, decimals: true })}</p>
        </div>

        <div style="text-align:center;margin-bottom:20px;">
          <a href="${data.checkoutUrl}" style="display:inline-block;background-color:${th.brand} !important;color:#ffffff !important;text-decoration:none;font-size:15px;font-weight:bold;padding:14px 32px;border-radius:8px;">${L.button}</a>
        </div>

        <p style="font-size:11px;color:${th.muted} !important;margin:0;word-break:break-all;">
          ${L.fallback}<br/>
          <a href="${data.checkoutUrl}" style="color:${th.brand} !important;">${data.checkoutUrl}</a>
        </p>

      </div>
    </div>`

  return { subject: L.subject, html }
}
