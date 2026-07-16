'use server'

import { db, withTenantDb } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
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
}

export async function createCompany(name: string, modules: { isBookingCompany?: boolean; isWineOrderCompany?: boolean } = {}) {
  await requireAdmin()
  if (!name.trim()) return { error: 'Name is required.' }
  const tenantId = await getTenantId()
  await withTenantDb(tenantId, tx =>
    tx.company.create({
      data: {
        name: name.trim(),
        accessCode: generateCode(),
        isBookingCompany: modules.isBookingCompany ?? true,
        isWineOrderCompany: modules.isWineOrderCompany ?? false,
        tenantId,
      },
    })
  )
  revalidatePath('/admin/companies')
  return { success: true }
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
  const newCode = generateCode()
  const result = await withTenantDb(tenantId, tx =>
    tx.company.updateMany({
      where: { id, tenantId },
      data: { accessCode: newCode },
    })
  )
  if (result.count === 0) return { error: 'Company not found.' }
  revalidatePath('/admin/companies')
  return { success: true, code: newCode }
}

export async function setAccessCode(id: string, code: string) {
  await requireAdmin()
  if (!code.trim()) return { error: 'Code cannot be empty.' }
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, tx =>
    tx.company.updateMany({
      where: { id, tenantId },
      data: { accessCode: code.trim().toUpperCase() },
    })
  )
  if (result.count === 0) return { error: 'Company not found.' }
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
