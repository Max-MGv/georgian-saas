'use server'

import { db, withTenantDb, type TxClient } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'

// Not exported: MaintenanceNotes #24 — a 'use server' file may only export async functions,
// and this one is synchronous. generateUniqueTenantCode (below) is the async wrapper other
// files should import instead.
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

// Guide codes, rep codes, and Company.accessCode all draw from one collision-checked pool
// per tenant (Plan-CompanyGuidesAndReps Chunk 1) — this is what keeps the wine-order form's
// tenant-wide code-alone lookup mechanically compatible even though it isn't guide/rep-aware.
// CompanyGuide/CompanyRepresentative have no own tenantId, so both checks JOIN through Company.
export async function codeExistsInTenant(tx: TxClient, tenantId: string, code: string): Promise<boolean> {
  const [company, guide, rep] = await Promise.all([
    tx.company.findFirst({ where: { tenantId, accessCode: code } }),
    tx.companyGuide.findFirst({ where: { code, company: { tenantId } } }),
    tx.companyRepresentative.findFirst({ where: { code, company: { tenantId } } }),
  ])
  return !!(company || guide || rep)
}

export async function generateUniqueTenantCode(tx: TxClient, tenantId: string): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateCode()
    if (!(await codeExistsInTenant(tx, tenantId, code))) return code
  }
  throw new Error('Could not generate a unique code — please try again.')
}

type CompanyProfile = {
  name: string
  identificationCode?: string
  contactName?: string
  contactPhone?: string
  contactEmail?: string
  address?: string
  isBookingCompany?: boolean
  isWineOrderCompany?: boolean
  wineDiscountPercent?: number | null
  // Per-company payment override (#148). null = follow the tenant's Companies
  // section toggle; true = always skip (trusted); false = always require.
  // Covers both bookings and wine orders for this company — see Feature 148.
  skipPayment?: boolean | null
}

export async function createCompany(name: string, modules: { isBookingCompany?: boolean; isWineOrderCompany?: boolean } = {}) {
  await requireAdmin()
  if (!name.trim()) return { error: 'Name is required.' }
  const tenantId = await getTenantId()
  const company = await withTenantDb(tenantId, async tx => {
    const accessCode = await generateUniqueTenantCode(tx, tenantId)
    return tx.company.create({
      data: {
        name: name.trim(),
        accessCode,
        isBookingCompany: modules.isBookingCompany ?? true,
        isWineOrderCompany: modules.isWineOrderCompany ?? false,
        tenantId,
      },
    })
  })
  revalidatePath('/admin/companies')
  return { success: true, company: { id: company.id, name: company.name, accessCode: company.accessCode } }
}

export async function updateCompany(id: string, profile: CompanyProfile) {
  await requireAdmin()
  if (!profile.name.trim()) return { error: 'Name is required.' }
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, tx =>
    tx.company.updateMany({
      where: { id, tenantId },
      data: {
        name: profile.name.trim(),
        identificationCode: profile.identificationCode?.trim() || null,
        contactName: profile.contactName?.trim() || null,
        contactPhone: profile.contactPhone?.trim() || null,
        contactEmail: profile.contactEmail?.trim() || null,
        address: profile.address?.trim() || null,
        ...(profile.isBookingCompany !== undefined ? { isBookingCompany: profile.isBookingCompany } : {}),
        ...(profile.isWineOrderCompany !== undefined ? { isWineOrderCompany: profile.isWineOrderCompany } : {}),
        ...(profile.wineDiscountPercent !== undefined ? { wineDiscountPercent: profile.wineDiscountPercent } : {}),
        ...(profile.skipPayment !== undefined ? { skipPayment: profile.skipPayment } : {}),
      },
    })
  )
  if (result.count === 0) return { error: 'Company not found.' }
  revalidatePath('/admin/companies')
  return { success: true }
}

export async function regenerateAccessCode(id: string) {
  await requireAdmin()
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async tx => {
    const newCode = await generateUniqueTenantCode(tx, tenantId)
    const updated = await tx.company.updateMany({
      where: { id, tenantId },
      data: { accessCode: newCode },
    })
    return { count: updated.count, newCode }
  })
  if (result.count === 0) return { error: 'Company not found.' }
  revalidatePath('/admin/companies')
  return { success: true, code: result.newCode }
}

export async function setAccessCode(id: string, code: string) {
  await requireAdmin()
  if (!code.trim()) return { error: 'Code cannot be empty.' }
  const tenantId = await getTenantId()
  const normalized = code.trim().toUpperCase()
  const result = await withTenantDb(tenantId, async tx => {
    const existing = await tx.company.findFirst({ where: { id, tenantId } })
    if (!existing) return { error: 'Company not found.' as const }
    if (existing.accessCode !== normalized && (await codeExistsInTenant(tx, tenantId, normalized))) {
      return { error: 'That code is already in use.' as const }
    }
    await tx.company.update({ where: { id }, data: { accessCode: normalized } })
    return { success: true as const }
  })
  if ('error' in result) return result
  revalidatePath('/admin/companies')
  return { success: true }
}

export async function verifyCompanyCode(companyId: string, code: string) {
  const tenantId = await getTenantId()
  const company = await withTenantDb(tenantId, tx =>
    tx.company.findFirst({
      where: { id: companyId, tenantId },
      select: {
        accessCode: true,
        contactName: true,
        contactPhone: true,
        contactEmail: true,
        identificationCode: true,
        address: true,
        wineDiscountPercent: true,
      },
    })
  )
  if (!company) return { error: 'Company not found.' }
  if (!company.accessCode) return { error: 'No code set.' }
  if (company.accessCode.toUpperCase() !== code.trim().toUpperCase()) {
    return { error: 'Incorrect code.' }
  }
  return {
    success: true,
    profile: {
      contactName: company.contactName,
      contactPhone: company.contactPhone,
      contactEmail: company.contactEmail,
      identificationCode: company.identificationCode,
      address: company.address,
    },
    wineDiscountPercent: company.wineDiscountPercent,
  }
}

// Booking form's code check (Plan-CompanyGuidesAndReps Chunk 5). Tries the company's guides
// first — a matched guide identifies a specific person, not just the company, so the printed
// booking sheet can show *that guide's* phone. Falls back to the legacy company-level
// `accessCode` only when the company has zero guides configured (Chunk 1: no backfill, keep
// existing companies working exactly as before).
export async function verifyBookingCode(companyId: string, code: string) {
  const tenantId = await getTenantId()
  const trimmed = code.trim().toUpperCase()
  const company = await withTenantDb(tenantId, tx =>
    tx.company.findFirst({
      where: { id: companyId, tenantId },
      select: {
        accessCode: true,
        contactName: true,
        contactPhone: true,
        contactEmail: true,
        identificationCode: true,
        address: true,
        wineDiscountPercent: true,
        guides: { select: { id: true, name: true, phone: true, code: true } },
      },
    })
  )
  if (!company) return { error: 'Company not found.' }

  if (company.guides.length > 0) {
    const guide = company.guides.find(g => g.code.toUpperCase() === trimmed)
    if (!guide) return { error: 'Incorrect code.' }
    return {
      success: true as const,
      matchType: 'guide' as const,
      guideId: guide.id,
      profile: {
        contactName: guide.name,
        contactPhone: guide.phone,
        contactEmail: company.contactEmail,
        identificationCode: company.identificationCode,
        address: company.address,
      },
      wineDiscountPercent: company.wineDiscountPercent,
    }
  }

  if (!company.accessCode) return { error: 'No code set.' }
  if (company.accessCode.toUpperCase() !== trimmed) return { error: 'Incorrect code.' }
  return {
    success: true as const,
    matchType: 'company' as const,
    guideId: null,
    profile: {
      contactName: company.contactName,
      contactPhone: company.contactPhone,
      contactEmail: company.contactEmail,
      identificationCode: company.identificationCode,
      address: company.address,
    },
    wineDiscountPercent: company.wineDiscountPercent,
  }
}

export async function ensureIndividualsCompany(tenantId: string) {
  const existing = await withTenantDb(tenantId, tx =>
    tx.company.findFirst({ where: { tenantId, isIndividual: true } })
  )
  if (existing) return existing
  return withTenantDb(tenantId, tx =>
    tx.company.create({ data: { name: 'Individuals', isIndividual: true, tenantId } })
  )
}

export async function findCompanyByCode(code: string, module: 'BOOKING' | 'WINE_ORDER') {
  if (!code.trim()) return { error: 'Code not recognised.' as const }
  const tenantId = await getTenantId()
  const company = await withTenantDb(tenantId, tx =>
    tx.company.findFirst({
      where: {
        tenantId,
        accessCode: code.trim().toUpperCase(),
        isIndividual: false,
        ...(module === 'BOOKING' ? { isBookingCompany: true } : { isWineOrderCompany: true }),
      },
      select: { id: true, name: true, contactName: true, contactPhone: true, contactEmail: true, identificationCode: true, address: true, wineDiscountPercent: true },
    })
  )
  if (!company) return { error: 'Code not recognised.' as const }
  return { success: true as const, company }
}

export async function deleteCompany(id: string) {
  await requireAdmin()
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, tx =>
    tx.company.deleteMany({ where: { id, tenantId } })
  )
  if (result.count === 0) return { error: 'Company not found.' }
  revalidatePath('/admin/companies')
  return { success: true }
}
