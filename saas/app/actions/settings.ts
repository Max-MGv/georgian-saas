'use server'

import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'

// Default values for all settings
const DEFAULTS: Record<string, string> = {
  show_company_price_after_booking: 'true',
  wine_images: '{}',
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

export async function updateWineImages(mapping: Record<string, string>) {
  await db.setting.upsert({
    where: { key: 'wine_images' },
    update: { value: JSON.stringify(mapping) },
    create: { key: 'wine_images', value: JSON.stringify(mapping) },
  })
  revalidatePath('/admin/images')
  revalidatePath('/wines')
}
