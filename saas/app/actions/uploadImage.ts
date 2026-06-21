'use server'

import { requireAdmin } from '@/lib/requireAdmin'
import { createServiceClient } from '@/lib/supabase/service'

const BUCKET = 'backgrounds'

export async function uploadBgImage(formData: FormData): Promise<string> {
  await requireAdmin()
  const file = formData.get('file') as File
  if (!file || !file.type.startsWith('image/')) throw new Error('Invalid file')
  if (file.size > 10 * 1024 * 1024) throw new Error('File too large (max 10 MB)')

  const supabase = createServiceClient()

  // Create bucket if it doesn't exist yet
  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {})

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const filename = `${Date.now()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await supabase.storage.from(BUCKET).upload(filename, buffer, {
    contentType: file.type,
    upsert: false,
  })
  if (error) throw error

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filename)
  return data.publicUrl
}

export async function deleteBgImage(filename: string): Promise<void> {
  await requireAdmin()
  // Only allow simple filenames — no path traversal
  if (!filename || filename.includes('/') || filename.includes('..')) {
    throw new Error('Invalid filename')
  }

  const supabase = createServiceClient()
  await supabase.storage.from(BUCKET).remove([filename])
}
