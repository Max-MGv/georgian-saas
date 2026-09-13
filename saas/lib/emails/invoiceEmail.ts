import { sendTenantEmail } from '@/lib/emails/sendEmail'
import { renderInvoiceEmail, type InvoiceEmailData } from '@/lib/emails/templates/invoiceEmailTemplate'

export type { InvoiceEmailData }

export async function sendInvoiceEmail(data: InvoiceEmailData & {
  /** Sending tenant — lets sendTenantEmail suppress mail from the demo. */
  tenantId?: string | null
  email: string
  wineryEmail?: string
}) {
  const { subject, html } = renderInvoiceEmail(data)

  await sendTenantEmail({
    tenantId: data.tenantId,
    tenantName: data.wineryName,
    fromLocalPart: 'invoices',
    to: data.email,
    replyTo: data.wineryEmail,
    subject,
    html,
  })
}
