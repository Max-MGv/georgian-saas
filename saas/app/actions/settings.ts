'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'

// Default values for all settings
const DEFAULTS: Record<string, string> = {
  show_company_price_after_booking: 'true',
}

export async function getSetting(key: string): Promise<string> {
  const row = await db.setting.findUnique({ where: { key } })
  return row?.value ?? DEFAULTS[key] ?? ''
}

export async function updateSetting(key: string, value: string) {
  await db.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  })
  revalidatePath('/admin/settings')
  revalidatePath('/')
}

