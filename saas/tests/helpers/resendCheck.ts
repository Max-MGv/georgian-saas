/**
 * Queries Resend's own send log directly — the only independent way to
 * confirm whether an email actually reached Resend's API at all, as opposed
 * to trusting the app's own "sent" return value or an inbox that may never
 * receive test mail (every address this suite uses is `@example.invalid`).
 *
 * Built for tier5-payment-e2e's settlement-email check (Chunk 3,
 * vault/Plan-PaymentE2ETesting.md) — Chunk 1's manual proof-of-loop found no
 * settlement email at all for its one run and left the question open. See
 * `13-payment-approved-settlement.md` for what this traced it to.
 *
 * Resend's `GET /emails` list endpoint (confirmed live 2026-09-24, not
 * documented anywhere in this repo before now) returns the account's most
 * recent sends across every tenant/domain, newest first — there is no
 * recipient or subject filter server-side, so this fetches a page and filters
 * client-side. One page (100) comfortably covers "everything sent in the last
 * few minutes" on this account's actual traffic volume.
 */
export type ResendEmailRecord = {
  id: string
  to: string[]
  from: string
  subject: string
  created_at: string
  last_event: string
}

export async function fetchRecentResendEmails(apiKey: string, limit = 100): Promise<ResendEmailRecord[]> {
  const res = await fetch(`https://api.resend.com/emails?limit=${limit}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) {
    throw new Error(`Resend API error: ${res.status} ${res.statusText}`)
  }
  const body = await res.json()
  return body.data as ResendEmailRecord[]
}

/** Finds a record sent to `toEmail` whose subject matches `subjectPattern`, created at/after `sinceIso`. */
export function findMatchingEmail(
  records: ResendEmailRecord[],
  toEmail: string,
  subjectPattern: RegExp,
  sinceIso: string
): ResendEmailRecord | undefined {
  const since = new Date(sinceIso).getTime()
  return records.find(
    r => r.to.includes(toEmail) && subjectPattern.test(r.subject) && new Date(r.created_at).getTime() >= since
  )
}

/**
 * Fetches one email's full body — the list endpoint above deliberately returns
 * only metadata (id/to/from/subject/created_at/last_event), no content, so
 * confirming what an email actually *said* (Chunk 4, Plan-PaymentE2ETesting.md
 * — the invoice's bank details/amount, not just "an email went out") needs
 * this separate `GET /emails/:id` call. Confirmed live 2026-09-24: the single-
 * email endpoint returns `html`/`text` fields the list endpoint omits.
 */
export type ResendEmailBody = { html: string | null; text: string | null }

export async function fetchResendEmailBody(apiKey: string, id: string): Promise<ResendEmailBody> {
  const res = await fetch(`https://api.resend.com/emails/${id}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!res.ok) {
    throw new Error(`Resend API error: ${res.status} ${res.statusText}`)
  }
  const body = await res.json()
  return { html: body.html ?? null, text: body.text ?? null }
}
