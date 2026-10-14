/**
 * The email a reporter gets when Max presses "Email the reporter" on a client ticket (Plan-TicketsV2 3.1).
 * Never sent automatically (Max, 2026-10-15: "only on the page is fine, unless I press a button"). Reporters
 * are winery admins, some Georgian-speaking, so the fixed wording is in English and Georgian; Max's reply is
 * sent as he wrote it. All user text is escaped - the original report is untrusted input.
 */

import { escapeHtml, type TenantVisibleStatus } from '@/lib/tickets'

const STATUS_EN: Record<TenantVisibleStatus, string> = { NEW: 'Received', IN_PROGRESS: 'In progress', RESOLVED: 'Resolved', WONT_FIX: "Won't fix", CLOSED: 'Closed' }
const STATUS_KA: Record<TenantVisibleStatus, string> = { NEW: 'მიღებულია', IN_PROGRESS: 'მუშავდება', RESOLVED: 'გადაწყვეტილია', WONT_FIX: 'არ გამოსწორდება', CLOSED: 'დახურულია' }

export function clientUpdateEmail(args: { status: TenantVisibleStatus; reply: string; originalComment: string; myReportsUrl: string | null }) {
  const subject = `Your report: ${STATUS_EN[args.status]} / თქვენი შეტყობინება: ${STATUS_KA[args.status]}`
  const quote = args.originalComment.length > 400 ? args.originalComment.slice(0, 397) + '…' : args.originalComment
  const html = `
    <div style="font-family: Georgia, serif; max-width: 520px; margin: 0 auto; color: #1c1008; padding: 32px;">
      <p style="margin: 0 0 6px; font-size: 13px; color: #6b5a47;">Update on your report · თქვენი შეტყობინების განახლება</p>
      <h2 style="margin: 0 0 18px; font-size: 20px;">${escapeHtml(STATUS_EN[args.status])} · ${escapeHtml(STATUS_KA[args.status])}</h2>
      ${args.reply ? `<div style="font-size: 15px; line-height: 1.55; white-space: pre-line; margin: 0 0 20px;">${escapeHtml(args.reply)}</div>` : ''}
      <div style="border-left: 3px solid #d6c7b2; padding: 4px 0 4px 12px; color: #6b5a47; font-size: 13px; white-space: pre-line; margin: 0 0 20px;">${escapeHtml(quote)}</div>
      ${args.myReportsUrl ? `<p style="font-size: 13px; margin: 0;"><a href="${escapeHtml(args.myReportsUrl)}" style="color: #7a2e2e;">My Reports · ჩემი შეტყობინებები →</a></p>` : ''}
      <p style="font-size: 12px; color: #9a8a76; margin: 24px 0 0;">VineWorks</p>
    </div>
  `
  return { subject, html }
}
