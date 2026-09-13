import { sendTenantEmail } from '@/lib/emails/sendEmail'
import { renderBookingConfirmationEmail, type BookingEmailData } from '@/lib/emails/templates/bookingConfirmationTemplate'

export type { BookingEmailData }

export async function sendBookingConfirmation(data: BookingEmailData & {
  /** Sending tenant — lets sendTenantEmail suppress mail from the demo. */
  tenantId?: string | null
  email: string
}) {
  const { subject, html } = renderBookingConfirmationEmail(data)

  await sendTenantEmail({
    tenantId: data.tenantId,
    tenantName: data.wineryName,
    fromLocalPart: 'bookings',
    to: data.email,
    replyTo: data.wineryEmail,
    subject,
    html,
  })
}
