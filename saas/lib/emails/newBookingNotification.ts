import { sendTenantEmail } from '@/lib/emails/sendEmail'

type NewBookingNotificationData = {
  /** Sending tenant — lets sendTenantEmail suppress mail from the demo. */
  tenantId?: string | null
  tenantName?: string | null
  /** The winery's own contact_email setting — the notification's recipient. */
  wineryEmail?: string | null
  guestName: string
  guestSurname: string
  guestEmail?: string | null
  guestPhone?: string | null
  date: string
  timeSlot: string
  guestCount: number
  visitType: 'TASTING' | 'TASTING_LUNCH'
  totalPrice: number
  bookingType: 'INDIVIDUAL' | 'COMPANY'
  /** True once payment actually settled (sent from settle.ts, not createBooking.ts). */
  paid?: boolean
}

/**
 * Tells the winery a new booking came in. Independent of whether the guest
 * has an email — a phone-only booking still notifies the winery, it just has
 * nothing to reply to.
 */
export async function sendNewBookingNotification(data: NewBookingNotificationData) {
  // No contact email on file means nobody to notify. Deliberately skipped
  // rather than falling back to a platform inbox like notifyNewCompany.ts
  // does — that fires on a rare manual request, this fires on every booking,
  // so a fallback here would flood one inbox for every tenant that hasn't
  // set a contact email yet.
  if (!data.wineryEmail) return

  const visitLabel = data.visitType === 'TASTING' ? 'Wine Tasting' : 'Wine Tasting + Lunch'

  await sendTenantEmail({
    tenantId: data.tenantId,
    tenantName: data.tenantName,
    fromLocalPart: 'alerts',
    to: data.wineryEmail,
    replyTo: data.guestEmail || undefined,
    subject: `New booking — ${data.date} at ${data.timeSlot}`,
    html: `
      <div style="font-family: Georgia, serif; max-width: 480px; margin: 0 auto; color: #1c1008; padding: 32px;">
        <h2 style="margin: 0 0 4px; font-size: 18px;">${data.paid ? 'New paid booking' : 'New booking request'}</h2>
        <p style="margin: 0 0 16px; font-size: 13px; color: #6b5a47;">${data.bookingType === 'COMPANY' ? 'Company booking' : 'Individual booking'}</p>
        <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
          <tr><td style="padding: 8px 0; color: #6b5a47; width: 120px;">Guest</td><td style="padding: 8px 0; font-weight: 600;">${data.guestName} ${data.guestSurname}</td></tr>
          ${data.guestEmail ? `<tr><td style="padding: 8px 0; color: #6b5a47;">Email</td><td style="padding: 8px 0;">${data.guestEmail}</td></tr>` : ''}
          ${data.guestPhone ? `<tr><td style="padding: 8px 0; color: #6b5a47;">Phone</td><td style="padding: 8px 0;">${data.guestPhone}</td></tr>` : ''}
          <tr><td style="padding: 8px 0; color: #6b5a47;">Visit type</td><td style="padding: 8px 0;">${visitLabel}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b5a47;">Date</td><td style="padding: 8px 0;">${data.date}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b5a47;">Time</td><td style="padding: 8px 0;">${data.timeSlot}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b5a47;">Guests</td><td style="padding: 8px 0;">${data.guestCount}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b5a47;">${data.paid ? 'Paid' : 'Estimated total'}</td><td style="padding: 8px 0; font-weight: 600;">${data.totalPrice}₾</td></tr>
        </table>
        <p style="margin: 24px 0 0; font-size: 13px; color: #6b5a47;">View and manage this booking in the admin panel's Orders tab.</p>
      </div>
    `,
  })
}
