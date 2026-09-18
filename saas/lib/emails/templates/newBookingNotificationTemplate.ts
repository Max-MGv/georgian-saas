import { asTetri, formatTetri } from '@/lib/money'
/**
 * Pure HTML-building half of newBookingNotification.ts — see
 * bookingConfirmationTemplate.ts for why this split exists (Feature 181).
 * Internal/operational (goes to the winery's own contact_email), so unlike
 * the customer-facing templates it has no tenant-editable message slot.
 */

export type NewBookingNotificationData = {
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
  /**
   * Set when this is a "New Company?" request (Feature 180) — companyId is
   * null, so this is the only place the winery sees which company it's for
   * until they create the real Company record.
   */
  requestedCompanyName?: string | null
}

export function renderNewBookingNotificationEmail(data: NewBookingNotificationData): { subject: string; html: string } {
  const visitLabel = data.visitType === 'TASTING' ? 'Wine Tasting' : 'Wine Tasting + Lunch'

  const html = `
      <div style="font-family: Georgia, serif; max-width: 480px; margin: 0 auto; color: #1c1008; padding: 32px;">
        <h2 style="margin: 0 0 4px; font-size: 18px;">${data.paid ? 'New paid booking' : 'New booking request'}</h2>
        <p style="margin: 0 0 16px; font-size: 13px; color: #6b5a47;">${data.bookingType === 'COMPANY' ? 'Company booking' : 'Individual booking'}${data.requestedCompanyName ? ' · new company, not yet registered' : ''}</p>
        <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
          ${data.requestedCompanyName ? `<tr><td style="padding: 8px 0; color: #6b5a47; width: 120px;">Company</td><td style="padding: 8px 0; font-weight: 600;">${data.requestedCompanyName}</td></tr>` : ''}
          <tr><td style="padding: 8px 0; color: #6b5a47; width: 120px;">Guest</td><td style="padding: 8px 0; font-weight: 600;">${data.guestName} ${data.guestSurname}</td></tr>
          ${data.guestEmail ? `<tr><td style="padding: 8px 0; color: #6b5a47;">Email</td><td style="padding: 8px 0;">${data.guestEmail}</td></tr>` : ''}
          ${data.guestPhone ? `<tr><td style="padding: 8px 0; color: #6b5a47;">Phone</td><td style="padding: 8px 0;">${data.guestPhone}</td></tr>` : ''}
          <tr><td style="padding: 8px 0; color: #6b5a47;">Visit type</td><td style="padding: 8px 0;">${visitLabel}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b5a47;">Date</td><td style="padding: 8px 0;">${data.date}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b5a47;">Time</td><td style="padding: 8px 0;">${data.timeSlot}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b5a47;">Guests</td><td style="padding: 8px 0;">${data.guestCount}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b5a47;">${data.paid ? 'Paid' : 'Estimated total'}</td><td style="padding: 8px 0; font-weight: 600;">${formatTetri(asTetri(data.totalPrice))}</td></tr>
        </table>
        <p style="margin: 24px 0 0; font-size: 13px; color: #6b5a47;">${data.requestedCompanyName
          ? `You should also have a separate "new company registration" email for ${data.requestedCompanyName}. Create the company and set its pricing in the admin panel, then follow up with them directly to confirm this booking and its price — it won't move under the company automatically.`
          : `View and manage this booking in the admin panel's Orders tab.`}</p>
      </div>
    `

  return { subject: `New booking — ${data.date} at ${data.timeSlot}`, html }
}
