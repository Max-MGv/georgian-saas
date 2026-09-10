'use server'

import { getSetting } from './settings'
import { sendTenantEmail } from '@/lib/emails/sendEmail'
import { getTenantId } from '@/lib/tenant'

export async function notifyNewCompany(data: {
  companyName: string
  contactName: string
  phone: string
  email?: string
  module: 'BOOKING' | 'WINE_ORDER'
}) {
  // Goes to the winery's own contact address — they're the ones who create
  // the company in their admin panel, not us. Falls back to us only if a
  // tenant hasn't set a contact email.
  const to = (await getSetting('contact_email')) || 'max@vineworks.ge'
  const tenantId = await getTenantId()

  try {
    await sendTenantEmail({
      tenantId,
      fromLocalPart: 'alerts',
      to,
      subject: `New ${data.module === 'WINE_ORDER' ? 'wine order' : 'booking'} company request — ${data.companyName}`,
      html: `
        <div style="font-family: Georgia, serif; max-width: 480px; margin: 0 auto; color: #1c1008; padding: 32px;">
          <h2 style="margin: 0 0 4px; font-size: 18px;">New company registration request</h2>
          <p style="margin: 0 0 16px; font-size: 13px; color: #6b5a47;">Requested via: <strong>${data.module === 'WINE_ORDER' ? 'Wine orders form' : 'Booking form'}</strong></p>
          <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
            <tr><td style="padding: 8px 0; color: #6b5a47; width: 120px;">Company</td><td style="padding: 8px 0; font-weight: 600;">${data.companyName}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b5a47;">Contact</td><td style="padding: 8px 0;">${data.contactName}</td></tr>
            <tr><td style="padding: 8px 0; color: #6b5a47;">Phone</td><td style="padding: 8px 0;">${data.phone}</td></tr>
            ${data.email ? `<tr><td style="padding: 8px 0; color: #6b5a47;">Email</td><td style="padding: 8px 0;">${data.email}</td></tr>` : ''}
          </table>
          <p style="margin: 24px 0 0; font-size: 13px; color: #6b5a47;">Create the company in the admin panel (${data.module === 'WINE_ORDER' ? 'Wine Orders tab' : 'Bookings tab'}) and send them their access code.</p>
        </div>
      `,
    })
  } catch {
    return { error: 'Failed to send notification.' as const }
  }

  return { success: true as const }
}
