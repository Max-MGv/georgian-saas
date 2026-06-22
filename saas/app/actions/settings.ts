'use server'

import { db, withTenantDb } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'

const DEFAULTS: Record<string, string> = {
  show_company_price_after_booking: 'true',
  enable_enhanced_company_booking: 'false',
  invoice_detailed: 'false',
  payment_recipient_name: '',
  payment_personal_number: '',
  payment_bank_name: '',
  payment_bank_code: '',
  payment_iban: '',
  invoice_email_message: '',
  min_guests_tasting: '4',
  min_guests_tasting_lunch: '4',
  maps_embed_url: 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2990!2d45.8950242!3d41.6876107!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x404689bc7cf7805d%3A0x77694e6cb5060d1b!2sNikalas%20Marani!5e0!3m2!1sen!2sge!4v1719000000000!5m2!1sen!2sge',
}

export async function getSetting(key: string): Promise<string> {
  const tenantId = await getTenantId()
  const row = await withTenantDb(tenantId, tx =>
    tx.setting.findUnique({ where: { key_tenantId: { key, tenantId } } })
  )
  return row?.value ?? DEFAULTS[key] ?? ''
}

export async function updateSetting(key: string, value: string) {
  await requireAdmin()
  const tenantId = await getTenantId()
  await withTenantDb(tenantId, tx =>
    tx.setting.upsert({
      where: { key_tenantId: { key, tenantId } },
      update: { value },
      create: { key, value, tenantId },
    })
  )
  revalidatePath('/admin/settings')
  revalidatePath('/admin/content')
  revalidatePath('/')
  revalidatePath('/about')
  revalidatePath('/contact')
}
