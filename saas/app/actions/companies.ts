'use server'

import { db, withTenantDb, type TxClient } from '@/lib/db'
import { resolveCompanyContactsFor, companyLevelContactsFor } from '@/lib/contactResolution'
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

// Person codes and Company.accessCode draw from one collision-checked pool per tenant — this is
// what keeps the code-alone, no-company-chosen lookups (wine orders, and the
// `hide_company_dropdown` booking variant) able to tell in one query what a typed code refers to.
//
// Two sources now, not three: CompanyGuide and CompanyRepresentative collapsed into
// CompanyPerson (Plan-ContactRoles Chunk 1). CompanyPerson has no own tenantId, so its check
// JOINs through Company.
//
// Since that chunk this is belt *and* braces: both columns now carry a real unique index, so a
// collision fails loudly at the database even if some future caller skips this helper. It stayed
// because the helper gives a usable error message where the constraint gives a stack trace.
export async function codeExistsInTenant(tx: TxClient, tenantId: string, code: string): Promise<boolean> {
  const [company, person] = await Promise.all([
    tx.company.findFirst({ where: { tenantId, accessCode: code } }),
    tx.companyPerson.findFirst({ where: { code, company: { tenantId } } }),
  ])
  return !!(company || person)
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
  // No contactName/contactPhone/contactEmail: those three columns are gone, replaced by
  // CompanyPerson rows in a contact_person role (Plan-ContactRoles Chunk 1). People are
  // managed through companyPeople.ts, not by updating the company.
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

export async function ensureIndividualsCompany(tenantId: string) {
  const existing = await withTenantDb(tenantId, tx =>
    tx.company.findFirst({ where: { tenantId, isIndividual: true } })
  )
  if (existing) return existing
  return withTenantDb(tenantId, tx =>
    tx.company.create({ data: { name: 'Individuals', isIndividual: true, tenantId } })
  )
}


/**
 * Request-context wrappers over `lib/contactResolution.ts`.
 *
 * The real logic lives there and takes an explicit `tenantId`. These resolve the tenant from
 * the request and pass it in — which is the whole point: a server action is callable by the
 * browser, so the tenant must never be a parameter the client supplies.
 *
 * Types (`ContactChoice`, `RoleChoices`, `ResolveContactsResult`) are imported from
 * `@/lib/contactResolution`, not from here — a `'use server'` file may only export async
 * functions and not even a type re-export survives that (MaintenanceNotes #24).
 */
export async function resolveCompanyContacts(input: {
  module: 'BOOKING' | 'WINE_ORDER'
  companyId?: string
  code?: string
}) {
  return resolveCompanyContactsFor(await getTenantId(), input)
}

/** Company-level contact reference data (COMPANY_LEVEL roles). Never reaches a public form. */
export async function getCompanyLevelContacts(companyId: string) {
  return companyLevelContactsFor(await getTenantId(), companyId)
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
