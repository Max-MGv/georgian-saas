'use server'

import { requireAdmin } from '@/lib/requireAdmin'
import { requireSuperAdmin } from '@/lib/requireSuperAdmin'
import { getTenantId } from '@/lib/tenant'
import { createServiceClient } from '@/lib/supabase/service'
import { db } from '@/lib/db'
import { revalidatePath } from 'next/cache'

const BUCKET = 'logos'
const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

async function ensureBucket() {
  const supabase = createServiceClient()
  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {})
  return supabase
}

// Called from client's own /admin/settings — uploads logo for the current tenant
export async function uploadTenantLogo(formData: FormData): Promise<string> {
  await requireAdmin()
  const tenantId = await getTenantId()
  return uploadLogoFile(formData, tenantId, 'logo')
}

// Called from client's own /admin/settings — uploads favicon for the current tenant
export async function uploadTenantFavicon(formData: FormData): Promise<string> {
  await requireAdmin()
  const tenantId = await getTenantId()
  return uploadLogoFile(formData, tenantId, 'favicon')
}

// Called from super-admin Edit Tenant form
export async function uploadTenantLogoAdmin(tenantId: string, formData: FormData): Promise<string> {
  await requireSuperAdmin()
  return uploadLogoFile(formData, tenantId, 'logo')
}

export async function uploadTenantFaviconAdmin(tenantId: string, formData: FormData): Promise<string> {
  await requireSuperAdmin()
  return uploadLogoFile(formData, tenantId, 'favicon')
}

async function uploadLogoFile(formData: FormData, tenantId: string, type: 'logo' | 'favicon'): Promise<string> {
  const file = formData.get('file') as File
  if (!file || file.size === 0) throw new Error('No file provided')
  if (file.size > MAX_SIZE) throw new Error('File too large (max 5 MB)')

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
  const allowed = ['png', 'jpg', 'jpeg', 'svg', 'ico', 'webp']
  if (!allowed.includes(ext)) throw new Error('Unsupported file type')

  const supabase = await ensureBucket()
  const storagePath = `${tenantId}/${type}-${Date.now()}.${ext}`

  const raw = Buffer.from(await file.arrayBuffer())
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, raw, {
    contentType: file.type || 'image/png',
    upsert: false,
  })
  if (error) throw error

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
}

// Save logo URL + alt to the current tenant (called from /admin/settings)
export async function saveTenantLogo(logoUrl: string, logoAlt: string): Promise<void> {
  await requireAdmin()
  const tenantId = await getTenantId()
  await db.tenant.update({ where: { id: tenantId }, data: { logoUrl, logoAlt } })
  revalidatePath('/', 'layout')
}

// Save favicon URL to the current tenant (called from /admin/settings)
export async function saveTenantFavicon(faviconUrl: string): Promise<void> {
  await requireAdmin()
  const tenantId = await getTenantId()
  await db.tenant.update({ where: { id: tenantId }, data: { faviconUrl } })
  revalidatePath('/', 'layout')
}
