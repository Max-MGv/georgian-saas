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
  maps_embed_url: '',
  admin_language: 'en',
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
  revalidatePath('/admin', 'layout')
  revalidatePath('/admin/settings')
  revalidatePath('/admin/content')
  revalidatePath('/')
  revalidatePath('/about')
  revalidatePath('/contact')
}
