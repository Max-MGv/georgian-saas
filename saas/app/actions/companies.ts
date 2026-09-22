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

/**
 * One option in the "which guide are you?" picker. Name and phone only — enough to choose
 * from and to fill the form with, never the guide's own code.
 */
export type GuideChoice = { id: string; name: string; phone: string | null }

/**
 * Booking form's code check (Plan-CompanyGuidesAndReps Chunk 5, revised 2026-09-19 —
 * KnownBugs #55).
 *
 * Two ways in, both valid:
 *  - a **guide's own code** matches that guide directly — the shortcut, unchanged;
 *  - the **company's `accessCode`** is also accepted, and when the company has guides the
 *    caller is handed `guideChoices` so the guest can say which guide they are.
 *
 * **What changed and why.** Until 2026-09-19 a company with any guides rejected its own
 * access code outright: the guide branch returned early and the company check was never
 * reached. That was deliberate and documented — attribution should name a person — but it
 * meant adding one guide silently killed a code already in circulation with a partner
 * agency, with nothing in the admin panel saying so, and every guest holding it was told
 * "Incorrect code". Max's resolution keeps the attribution requirement while removing the
 * trap: the code still works, and the guest picks their guide instead of proving it.
 *
 * **The trade-off, accepted deliberately.** A guide code *proves* identity; a picker lets
 * anyone holding the company code select any guide, so attribution becomes self-declared.
 * That is acceptable because guide attribution is operational labelling — it puts the right
 * person's phone on the booking sheet — not authentication. Revisit this if guide identity
 * ever gates commissions or per-guide reporting.
 *
 * `guideChoices` is empty for a company with no guides, so callers can treat "company code
 * matched, nobody to choose from" as today's plain company match with no extra step.
 */
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

  // 1. A guide's own code — the direct route, identity proven by the code itself.
  const guide = company.guides.find(g => g.code.toUpperCase() === trimmed)
  if (guide) {
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
      guideChoices: [] as GuideChoice[],
    }
  }

  // 2. The company's shared code. Still valid even when guides exist — the caller then
  //    asks which guide this is, rather than turning the guest away.
  if (company.accessCode && company.accessCode.toUpperCase() === trimmed) {
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
      guideChoices: company.guides.map(g => ({ id: g.id, name: g.name, phone: g.phone })),
    }
  }

  // 3. Neither. "No code set" only when there is genuinely nothing to match — a company
  //    with guides but no shared code does have codes, just not this one, and saying
  //    "no code set" there would be a lie the guest cannot act on.
  if (!company.accessCode && company.guides.length === 0) return { error: 'No code set.' }
  return { error: 'Incorrect code.' }
}

// Direct-code-entry booking form variant (Feature 113/114, `hideCompanyDropdown`) — the visitor
// types a code with no company chosen first, so this searches every booking-enabled company's
// guides in the tenant before falling back to `findCompanyByCode`'s Company.accessCode search.
// Mirrors verifyBookingCode's shape from the other entry point, including `guideChoices`
// (2026-09-19): a company code typed here resolves the company and then asks which guide, the
// same as picking the company from the dropdown first. Before that the two genuinely disagreed
// — this path accepted a company code unconditionally while the dropdown path rejected it for
// any company with guides, so the same code worked or failed depending on how it was entered.
type BookingCodeMatch = {
  success: true
  matchType: 'guide' | 'company'
  guideId: string | null
  /** Empty for a guide-code match, or for a company with no guides. */
  guideChoices: GuideChoice[]
  company: {
    id: string
    name: string
    contactName: string | null
    contactPhone: string | null
    contactEmail: string | null
    identificationCode: string | null
    address: string | null
    wineDiscountPercent: number | null
  }
}

export async function findBookingCodeByCode(code: string): Promise<BookingCodeMatch | { error: string }> {
  if (!code.trim()) return { error: 'Code not recognised.' as const }
  const tenantId = await getTenantId()
  const trimmed = code.trim().toUpperCase()

  const guide = await withTenantDb(tenantId, tx =>
    tx.companyGuide.findFirst({
      where: { code: trimmed, company: { tenantId, isBookingCompany: true, isIndividual: false } },
      select: {
        id: true, name: true, phone: true,
        company: { select: { id: true, name: true, contactEmail: true, identificationCode: true, address: true, wineDiscountPercent: true } },
      },
    })
  )
  if (guide) {
    return {
      success: true as const,
      matchType: 'guide' as const,
      guideId: guide.id,
      guideChoices: [],
      company: {
        id: guide.company.id,
        name: guide.company.name,
        contactName: guide.name,
        contactPhone: guide.phone,
        contactEmail: guide.company.contactEmail,
        identificationCode: guide.company.identificationCode,
        address: guide.company.address,
        wineDiscountPercent: guide.company.wineDiscountPercent,
      },
    }
  }

  const result = await findCompanyByCode(code, 'BOOKING')
  if ('error' in result) return result
  // The company's shared code matched. Hand back its guides so the caller can ask which one
  // this is — same second step the dropdown path takes.
  const guides = await withTenantDb(tenantId, tx =>
    tx.companyGuide.findMany({
      where: { company: { id: result.company.id, tenantId } },
      select: { id: true, name: true, phone: true },
      orderBy: { name: 'asc' },
    })
  )
  return {
    success: true as const,
    matchType: 'company' as const,
    guideId: null,
    guideChoices: guides,
    company: result.company,
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

export async function findCompanyByCode(code: string, module: 'BOOKING' | 'WINE_ORDER'): Promise<
  | { error: string }
  | { success: true; company: { id: string; name: string; contactName: string | null; contactPhone: string | null; contactEmail: string | null; identificationCode: string | null; address: string | null; wineDiscountPercent: number | null } }
> {
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
