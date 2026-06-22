'use server'

import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'
import { createServiceClient } from '@/lib/supabase/service'
import sharp from 'sharp'

const BUCKET = 'backgrounds'
const MAX_WIDTH = 2000
const WEBP_QUALITY = 82

export async function uploadBgImage(formData: FormData): Promise<string> {
  await requireAdmin()
  const tenantId = await getTenantId()

  const file = formData.get('file') as File
  if (!file || !file.type.startsWith('image/')) throw new Error('Invalid file')
  if (file.size > 10 * 1024 * 1024) throw new Error('File too large (max 10 MB)')

  const supabase = createServiceClient()
  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {})

  // Compress: resize to max 2000px wide, convert to WebP
  const raw = Buffer.from(await file.arrayBuffer())
  const compressed = await sharp(raw)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: WEBP_QUALITY })
    .toBuffer()

  const storagePath = `${tenantId}/${Date.now()}.webp`
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, compressed, {
    contentType: 'image/webp',
    upsert: false,
  })
  if (error) throw error

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
}

// storagePath is the bucket-relative path, e.g. "tenantId/1234567890.webp"
export async function deleteBgImage(storagePath: string): Promise<void> {
  await requireAdmin()
  const tenantId = await getTenantId()

  // Ensure path belongs to this tenant — no path traversal, no cross-tenant deletes
  if (
    !storagePath ||
    storagePath.includes('..') ||
    !storagePath.startsWith(`${tenantId}/`) ||
    storagePath.split('/').length !== 2
  ) {
    throw new Error('Invalid path')
  }

  const supabase = createServiceClient()
  await supabase.storage.from(BUCKET).remove([storagePath])
}
