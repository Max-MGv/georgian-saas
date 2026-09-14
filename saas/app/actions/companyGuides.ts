'use server'

import { withTenantDb } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/requireAdmin'
import { getTenantId } from '@/lib/tenant'
import { generateUniqueTenantCode, codeExistsInTenant } from './companies'

// ── Guides ──────────────────────────────────────────────────────────────────

export async function createGuide(companyId: string, data: { name: string; phone?: string }) {
  await requireAdmin()
  if (!data.name.trim()) return { error: 'Name is required.' }
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async tx => {
    const company = await tx.company.findFirst({ where: { id: companyId, tenantId } })
    if (!company) return { error: 'Company not found.' }
    const code = await generateUniqueTenantCode(tx, tenantId)
    const guide = await tx.companyGuide.create({
      data: { companyId, name: data.name.trim(), phone: data.phone?.trim() || null, code },
    })
    return { success: true as const, guide }
  })
  if (!('error' in result)) revalidatePath('/admin/companies')
  return result
}

export async function updateGuide(id: string, companyId: string, data: { name: string; phone?: string }) {
  await requireAdmin()
  if (!data.name.trim()) return { error: 'Name is required.' }
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async tx => {
    const guide = await tx.companyGuide.findFirst({
      where: { id, companyId },
      select: { id: true, company: { select: { tenantId: true } } },
    })
    if (!guide || guide.company.tenantId !== tenantId) return { error: 'Not found.' }
    await tx.companyGuide.update({
      where: { id },
      data: { name: data.name.trim(), phone: data.phone?.trim() || null },
    })
    return { success: true as const }
  })
  if (!('error' in result)) revalidatePath('/admin/companies')
  return result
}

export async function deleteGuide(id: string, companyId: string) {
  await requireAdmin()
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async tx => {
    const guide = await tx.companyGuide.findFirst({
      where: { id, companyId },
      select: { id: true, company: { select: { tenantId: true } } },
    })
    if (!guide || guide.company.tenantId !== tenantId) return { error: 'Not found.' }
    await tx.companyGuide.delete({ where: { id } })
    return { success: true as const }
  })
  if (!('error' in result)) revalidatePath('/admin/companies')
  return result
}

export async function regenerateGuideCode(id: string, companyId: string) {
  await requireAdmin()
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async tx => {
    const guide = await tx.companyGuide.findFirst({
      where: { id, companyId },
      select: { id: true, company: { select: { tenantId: true } } },
    })
    if (!guide || guide.company.tenantId !== tenantId) return { error: 'Not found.' }
    const code = await generateUniqueTenantCode(tx, tenantId)
    await tx.companyGuide.update({ where: { id }, data: { code } })
    return { success: true as const, code }
  })
  if (!('error' in result)) revalidatePath('/admin/companies')
  return result
}

export async function setGuideCode(id: string, companyId: string, code: string) {
  await requireAdmin()
  if (!code.trim()) return { error: 'Code cannot be empty.' }
  const tenantId = await getTenantId()
  const normalized = code.trim().toUpperCase()
  const result = await withTenantDb(tenantId, async tx => {
    const guide = await tx.companyGuide.findFirst({
      where: { id, companyId },
      select: { id: true, code: true, company: { select: { tenantId: true } } },
    })
    if (!guide || guide.company.tenantId !== tenantId) return { error: 'Not found.' }
    if (guide.code !== normalized && (await codeExistsInTenant(tx, tenantId, normalized))) {
      return { error: 'That code is already in use.' }
    }
    await tx.companyGuide.update({ where: { id }, data: { code: normalized } })
    return { success: true as const }
  })
  if (!('error' in result)) revalidatePath('/admin/companies')
  return result
}

// ── Representatives ─────────────────────────────────────────────────────────

export async function createRepresentative(companyId: string, data: { name: string; email?: string; phone?: string }) {
  await requireAdmin()
  if (!data.name.trim()) return { error: 'Name is required.' }
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async tx => {
    const company = await tx.company.findFirst({ where: { id: companyId, tenantId } })
    if (!company) return { error: 'Company not found.' }
    const code = await generateUniqueTenantCode(tx, tenantId)
    const rep = await tx.companyRepresentative.create({
      data: {
        companyId,
        name: data.name.trim(),
        email: data.email?.trim() || null,
        phone: data.phone?.trim() || null,
        code,
      },
    })
    return { success: true as const, representative: rep }
  })
  if (!('error' in result)) revalidatePath('/admin/companies')
  return result
}

export async function updateRepresentative(id: string, companyId: string, data: { name: string; email?: string; phone?: string }) {
  await requireAdmin()
  if (!data.name.trim()) return { error: 'Name is required.' }
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async tx => {
    const rep = await tx.companyRepresentative.findFirst({
      where: { id, companyId },
      select: { id: true, company: { select: { tenantId: true } } },
    })
    if (!rep || rep.company.tenantId !== tenantId) return { error: 'Not found.' }
    await tx.companyRepresentative.update({
      where: { id },
      data: { name: data.name.trim(), email: data.email?.trim() || null, phone: data.phone?.trim() || null },
    })
    return { success: true as const }
  })
  if (!('error' in result)) revalidatePath('/admin/companies')
  return result
}

export async function deleteRepresentative(id: string, companyId: string) {
  await requireAdmin()
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async tx => {
    const rep = await tx.companyRepresentative.findFirst({
      where: { id, companyId },
      select: { id: true, company: { select: { tenantId: true } } },
    })
    if (!rep || rep.company.tenantId !== tenantId) return { error: 'Not found.' }
    await tx.companyRepresentative.delete({ where: { id } })
    return { success: true as const }
  })
  if (!('error' in result)) revalidatePath('/admin/companies')
  return result
}

export async function regenerateRepresentativeCode(id: string, companyId: string) {
  await requireAdmin()
  const tenantId = await getTenantId()
  const result = await withTenantDb(tenantId, async tx => {
    const rep = await tx.companyRepresentative.findFirst({
      where: { id, companyId },
      select: { id: true, company: { select: { tenantId: true } } },
    })
    if (!rep || rep.company.tenantId !== tenantId) return { error: 'Not found.' }
    const code = await generateUniqueTenantCode(tx, tenantId)
    await tx.companyRepresentative.update({ where: { id }, data: { code } })
    return { success: true as const, code }
  })
  if (!('error' in result)) revalidatePath('/admin/companies')
  return result
}

export async function setRepresentativeCode(id: string, companyId: string, code: string) {
  await requireAdmin()
  if (!code.trim()) return { error: 'Code cannot be empty.' }
  const tenantId = await getTenantId()
  const normalized = code.trim().toUpperCase()
  const result = await withTenantDb(tenantId, async tx => {
    const rep = await tx.companyRepresentative.findFirst({
      where: { id, companyId },
      select: { id: true, code: true, company: { select: { tenantId: true } } },
    })
    if (!rep || rep.company.tenantId !== tenantId) return { error: 'Not found.' }
    if (rep.code !== normalized && (await codeExistsInTenant(tx, tenantId, normalized))) {
      return { error: 'That code is already in use.' }
    }
    await tx.companyRepresentative.update({ where: { id }, data: { code: normalized } })
    return { success: true as const }
  })
  if (!('error' in result)) revalidatePath('/admin/companies')
  return result
}
