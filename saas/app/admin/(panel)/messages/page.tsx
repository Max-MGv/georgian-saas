import { db } from '@/lib/db'
import { getTenantId } from '@/lib/tenant'
import { getAllSettings, getSetting } from '@/app/actions/settings'
import { settingValue } from '@/lib/settings'
import { resolveTenantTheme } from '@/lib/themePresets'
import MessagesClient from './MessagesClient'

export default async function MessagesPage() {
  const tenantId = await getTenantId()
  const [tenant, settings, adminLanguage] = await Promise.all([
    db.tenant.findUnique({ where: { id: tenantId }, select: { displayName: true, name: true, theme: true } }),
    getAllSettings(tenantId),
    getSetting('admin_language'),
  ])

  // Only the specific keys this page needs are pulled out of `settings` —
  // never hand the whole map to a client component (it carries payment
  // details; see MaintenanceNotes.md §9).
  return (
    <MessagesClient
      locale={adminLanguage}
      winery={{
        name: tenant?.displayName ?? tenant?.name ?? '',
        address: settingValue(settings, 'contact_address'),
        phone: settingValue(settings, 'contact_phone'),
        email: settingValue(settings, 'contact_email'),
      }}
      theme={resolveTenantTheme(tenant?.theme ?? null)}
      defaults={{
        booking: settingValue(settings, 'booking_email_message'),
        wineReceipt: settingValue(settings, 'wine_receipt_email_message'),
        invoice: settingValue(settings, 'invoice_email_message'),
      }}
    />
  )
}
