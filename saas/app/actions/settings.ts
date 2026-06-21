'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/requireAdmin'

// Default values for all settings
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
}

export async function getSetting(key: string): Promise<string> {
  const row = await db.setting.findUnique({ where: { key } })
  return row?.value ?? DEFAULTS[key] ?? ''
}

export async function updateSetting(key: string, value: string) {
  await requireAdmin()
  await db.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  })
  revalidatePath('/admin/settings')
  revalidatePath('/admin/content')
  revalidatePath('/')
  revalidatePath('/about')
  revalidatePath('/contact')
}

