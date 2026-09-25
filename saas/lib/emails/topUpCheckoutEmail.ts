import { sendTenantEmail } from '@/lib/emails/sendEmail'
import { renderTopUpCheckoutEmail, type TopUpCheckoutEmailData } from '@/lib/emails/templates/topUpCheckoutEmailTemplate'

export type { TopUpCheckoutEmailData }

export async function sendTopUpCheckoutEmail(data: TopUpCheckoutEmailData & {
  /** Sending tenant — lets sendTenantEmail suppress mail from the demo. */
  tenantId?: string | null
  email: string
  wineryEmail?: string
}) {
  const { subject, html } = renderTopUpCheckoutEmail(data)

  await sendTenantEmail({
    tenantId: data.tenantId,
    tenantName: data.wineryName,
    fromLocalPart: 'payments',
    to: data.email,
    replyTo: data.wineryEmail,
    subject,
    html,
  })
}
