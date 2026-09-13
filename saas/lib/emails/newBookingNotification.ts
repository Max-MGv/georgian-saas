import { sendTenantEmail } from '@/lib/emails/sendEmail'
import { renderNewBookingNotificationEmail, type NewBookingNotificationData } from '@/lib/emails/templates/newBookingNotificationTemplate'

export type { NewBookingNotificationData }

/**
 * Tells the winery a new booking came in. Independent of whether the guest
 * has an email — a phone-only booking still notifies the winery, it just has
 * nothing to reply to.
 */
export async function sendNewBookingNotification(data: NewBookingNotificationData & {
  /** Sending tenant — lets sendTenantEmail suppress mail from the demo. */
  tenantId?: string | null
  tenantName?: string | null
  /** The winery's own contact_email setting — the notification's recipient. */
  wineryEmail?: string | null
}) {
  // No contact email on file means nobody to notify. Deliberately skipped
  // rather than falling back to a platform inbox like notifyNewCompany.ts
  // does — that fires on a rare manual request, this fires on every booking,
  // so a fallback here would flood one inbox for every tenant that hasn't
  // set a contact email yet.
  if (!data.wineryEmail) return

  const { subject, html } = renderNewBookingNotificationEmail(data)

  await sendTenantEmail({
    tenantId: data.tenantId,
    tenantName: data.tenantName,
    fromLocalPart: 'alerts',
    to: data.wineryEmail,
    replyTo: data.guestEmail || undefined,
    subject,
    html,
  })
}
