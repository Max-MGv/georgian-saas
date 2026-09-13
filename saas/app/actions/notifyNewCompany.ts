'use server'

import { getSetting } from './settings'
import { sendTenantEmail } from '@/lib/emails/sendEmail'
import { getTenantId } from '@/lib/tenant'
import { renderNotifyNewCompanyEmail, type NotifyNewCompanyData } from '@/lib/emails/templates/notifyNewCompanyTemplate'

export type { NotifyNewCompanyData }

export async function notifyNewCompany(data: NotifyNewCompanyData) {
  // Goes to the winery's own contact address — they're the ones who create
  // the company in their admin panel, not us. Falls back to us only if a
  // tenant hasn't set a contact email.
  const to = (await getSetting('contact_email')) || 'max@vineworks.ge'
  const tenantId = await getTenantId()

  const { subject, html } = renderNotifyNewCompanyEmail(data)

  try {
    await sendTenantEmail({
      tenantId,
      fromLocalPart: 'alerts',
      to,
      subject,
      html,
    })
  } catch {
    return { error: 'Failed to send notification.' as const }
  }

  return { success: true as const }
}
