import { sendTenantEmail } from '@/lib/emails/sendEmail'
import { renderWineOrderReceiptEmail, type WineOrderReceiptData, type WineOrderLine } from '@/lib/emails/templates/wineOrderReceiptTemplate'

export type { WineOrderReceiptData, WineOrderLine }

/**
 * Receipt for a wine order paid by card.
 *
 * Only sent from the settlement path — an unpaid wine order gets no customer
 * email at all (that behaviour predates online payment and is unchanged). This
 * is the one case where a WineOrder needs a customer email address, which is why
 * `contactEmail` is required on the paying path and optional otherwise.
 */
export async function sendWineOrderReceipt(data: WineOrderReceiptData & {
  /** Sending tenant — lets sendTenantEmail suppress mail from the demo. */
  tenantId?: string | null
  email: string
}) {
  const { subject, html } = renderWineOrderReceiptEmail(data)

  await sendTenantEmail({
    tenantId: data.tenantId,
    tenantName: data.wineryName,
    fromLocalPart: 'receipts',
    to: data.email,
    replyTo: data.wineryEmail,
    subject,
    html,
  })
}
