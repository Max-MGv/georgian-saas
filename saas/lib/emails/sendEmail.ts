import { Resend } from 'resend'

// Shared verified sending domain for all tenants (see vault/Plan-EmailInfrastructure.md).
// A subdomain of vineworks.ge, not the apex — gets its own independent SPF/DKIM,
// never touches the existing Zoho SPF record on the apex. Swapping this constant
// is the only code change needed to move to a different shared domain later.
const SENDING_DOMAIN = 'notify.vineworks.ge'

// Used only when a tenant has no contact email on file to reply-to.
const FALLBACK_REPLY_TO = 'max.mghvdliashvili@gmail.com'

type SendTenantEmailArgs = {
  /** Tenant display name, shown as the From name, e.g. "Nikalas Marani Winery". */
  tenantName?: string | null
  /** Local part of the sending address, e.g. "bookings", "receipts", "invoices". */
  fromLocalPart: string
  to: string
  /** Tenant's own contact email — replies land with the winery, not us. */
  replyTo?: string | null
  subject: string
  html: string
}

/**
 * Sends a customer-facing email on behalf of a tenant, from a shared
 * verified domain with the tenant's name in the From display text.
 * See vault/Plan-EmailInfrastructure.md for why (Resend free tier = 1
 * verified domain; per-tenant subdomains would require a paid plan).
 */
export async function sendTenantEmail({
  tenantName,
  fromLocalPart,
  to,
  replyTo,
  subject,
  html,
}: SendTenantEmailArgs) {
  const resend = new Resend(process.env.RESEND_API_KEY)
  const fromName = (tenantName || 'VineWorks').replace(/"/g, "'")
  const from = `"${fromName}" <${fromLocalPart}@${SENDING_DOMAIN}>`

  const { error } = await resend.emails.send({
    from,
    to,
    replyTo: replyTo || FALLBACK_REPLY_TO,
    subject,
    html,
  })

  if (error) throw new Error(error.message)
}
