'use server'

import { requireSuperAdmin } from '@/lib/requireSuperAdmin'
import { createServiceClient } from '@/lib/supabase/service'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'

const BUCKET = 'logos'
const MAX_SIZE = 5 * 1024 * 1024

export async function getPlatformConfig() {
  return db.platformConfig.findUnique({ where: { id: 'platform' } })
}

export async function uploadPlatformLogo(formData: FormData): Promise<string> {
  await requireSuperAdmin()

  const file = formData.get('file') as File
  if (!file || file.size === 0) throw new Error('No file provided')
  if (file.size > MAX_SIZE) throw new Error('File too large (max 5 MB)')

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
  const allowed = ['png', 'jpg', 'jpeg', 'svg', 'ico', 'webp']
  if (!allowed.includes(ext)) throw new Error('Unsupported file type')

  const supabase = createServiceClient()
  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {})

  const storagePath = `platform/logo-${Date.now()}.${ext}`
  const raw = Buffer.from(await file.arrayBuffer())

  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, raw, {
    contentType: file.type || 'image/png',
    upsert: false,
  })
  if (error) throw error

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
  const publicUrl = data.publicUrl

  await db.platformConfig.upsert({
    where: { id: 'platform' },
    create: { id: 'platform', logoUrl: publicUrl, logoAlt: '' },
    update: { logoUrl: publicUrl },
  })

  revalidatePath('/admin/login')
  revalidatePath('/super-admin/settings')
  return publicUrl
}

export async function savePlatformLogoAlt(alt: string): Promise<void> {
  await requireSuperAdmin()
  await db.platformConfig.upsert({
    where: { id: 'platform' },
    create: { id: 'platform', logoAlt: alt },
    update: { logoAlt: alt },
  })
  revalidatePath('/admin/login')
}

export async function removePlatformLogo(): Promise<void> {
  await requireSuperAdmin()
  await db.platformConfig.upsert({
    where: { id: 'platform' },
    create: { id: 'platform', logoUrl: null },
    update: { logoUrl: null },
  })
  revalidatePath('/admin/login')
  revalidatePath('/super-admin/settings')
}
