import { withTenantDb, type TxClient } from '@/lib/db'

/**
 * Contact resolution — the single source of truth for "who can be picked for this order".
 *
 * A plain module, deliberately **not** a `'use server'` file. Its functions take an explicit
 * `tenantId`, and a server action is callable by the browser: exporting a tenant-parameterised
 * function from an actions file would let a client pass any tenant's id. The thin wrappers in
 * `app/actions/companies.ts` resolve the tenant from the request and call in here.
 *
 * Keeping it here also makes it testable — `getTenantId()` needs a request context, so the
 * resolver could not otherwise be exercised from a script
 * (`scripts/test-contact-resolution.ts` does exactly that).
 *
 * Note that the types below are imported from **this** module, not re-exported through the
 * actions file: a `'use server'` file may only export async functions, and not even a type
 * re-export survives that rule (MaintenanceNotes #24).
 */

/**
 * One person who can be picked for an order, plus which role they hold.
 * Never carries the person's own `code` — that is a credential, and this shape is sent to a
 * browser (F3/F4 in vault/Plan-ContactRoles.md are both this mistake already made once).
 */
export type ContactChoice = {
  id: string
  roleId: string
  name: string
  phone: string | null
  email: string | null
}

/**
 * A role on its own — no people. What a form needs to lay itself out before any
 * company has been chosen (see `orderRolesFor`).
 */
export type OrderRole = {
  roleId: string
  key: string
  labelEn: string
  labelKa: string
  sortOrder: number
}

/** One role, with the people available in it for this company. */
export type RoleChoices = OrderRole & {
  people: ContactChoice[]
}

export type ResolvedCompany = {
  id: string
  name: string
  identificationCode: string | null
  address: string | null
  wineDiscountPercent: number | null
}

export type ResolveContactsResult =
  | { error: string }
  | {
      success: true
      company: ResolvedCompany
      /** 'person' — a person's own code matched. 'company' — the company's shared code, or the
       *  company was already known (dropdown / admin screens, where no code is typed). */
      matchType: 'person' | 'company'
      /** Set only for a 'person' match. Their details fill the form directly. */
      matchedPerson: ContactChoice | null
      /** Empty when person codes are ON (deliberate — see below) or when nobody is configured. */
      roleChoices: RoleChoices[]
    }

/**
 * The per-order roles a tenant has defined for this kind of order, with no people.
 *
 * Distinct from `resolveCompanyContactsFor`, which answers "who can be picked for
 * *this company*" and therefore drops roles nobody is in. A form needs this one
 * instead when it has to lay itself out before a company exists: the public booking
 * form renders its Guide block from the role list, not from whether some company
 * happens to have guides, so the block is stable while the dropdown changes under it.
 *
 * COMPANY_LEVEL roles are excluded here for the same reason they are excluded there —
 * they are company reference data and must never reach an order form. That is the
 * whole job of `scope`.
 *
 * Safe to hand to a client component: role labels are tenant configuration an admin
 * typed, and no person, and therefore no code, is attached.
 */
export async function orderRolesFor(
  tenantId: string,
  module: 'BOOKING' | 'WINE_ORDER'
): Promise<OrderRole[]> {
  return withTenantDb(tenantId, async tx => {
    const roles = await tx.contactRole.findMany({
      where: {
        tenantId,
        isActive: true,
        scope: 'PER_ORDER',
        appliesTo: { in: [module, 'BOTH'] },
      },
      orderBy: [{ sortOrder: 'asc' }, { labelEn: 'asc' }],
      select: { id: true, key: true, labelEn: true, labelKa: true, sortOrder: true },
    })
    return roles.map(r => ({
      roleId: r.id,
      key: r.key,
      labelEn: r.labelEn,
      labelKa: r.labelKa,
      sortOrder: r.sortOrder,
    }))
  })
}

/**
 * The single contact resolver (vault/Plan-ContactRoles.md Chunk 3, decision 10).
 *
 * **Replaces four overlapping functions** — `verifyCompanyCode`, `verifyBookingCode`,
 * `findBookingCodeByCode` and `findCompanyByCode`. That overlap was not cosmetic: two of them
 * silently disagreed for five days about whether a company code was still valid once the
 * company had guides, so the *same code* worked or failed depending on which form typed it,
 * while both functions' comments claimed they mirrored each other (MaintenanceNotes #26). One
 * function cannot disagree with itself.
 *
 * All four forms call this — public booking, public wine order, and both admin manual-entry
 * screens (§4b of the plan). Hence `module`, and hence `companyId` and `code` both being
 * optional:
 *
 *   • `companyId` alone   — the company is already known (booking dropdown, admin screens).
 *                           No code is checked; returns the pickable people.
 *   • `code` alone        — tenant-wide lookup with no company chosen first (wine orders, and
 *                           the `hide_company_dropdown` booking variant, Features 113/114).
 *   • both                — the dropdown-then-code path: the code must belong to that company.
 *
 * **How `person_codes_enabled` changes the answer.** Off (the default), person codes do not
 * exist, and anyone who reaches a company gets the list of its people to pick from — that is
 * the autofill this feature was asked for. On, a person's own code identifies them directly and
 * `roleChoices` comes back **empty even on a successful company match**, so no one can see a
 * colleague list. That emptiness is the privacy feature, not a missing-data case: callers must
 * treat "no choices" as "ask them to type their details", never as an error.
 *
 * `Company.accessCode` is **not** governed by that setting and works in both modes. It is how a
 * company is identified at all on the no-dropdown variant, so gating it would have quietly
 * broken that form.
 */
export async function resolveCompanyContactsFor(tenantId: string, input: {
  module: 'BOOKING' | 'WINE_ORDER'
  companyId?: string
  code?: string
}): Promise<ResolveContactsResult> {
  const typed = input.code?.trim().toUpperCase() ?? ''
  if (!input.companyId && !typed) return { error: 'Code not recognised.' }

  const moduleWhere =
    input.module === 'BOOKING' ? { isBookingCompany: true } : { isWineOrderCompany: true }

  return withTenantDb(tenantId, async tx => {
    const codesOn =
      (
        await tx.setting.findUnique({
          where: { key_tenantId: { key: 'person_codes_enabled', tenantId } },
        })
      )?.value === 'true'

    // ── 1. A person's own code, when the tenant uses them ────────────────────
    // Tried first so it stays a shortcut: proving who you are beats being asked.
    if (codesOn && typed) {
      const person = await tx.companyPerson.findFirst({
        where: {
          code: typed,
          isActive: true,
          // The role has to be one that can actually appear on THIS kind of order. Filtering
          // only the company (below) was a real bug, caught by test-contact-resolution.ts:
          // a BOOKING-only guide resolved on the wine-order form, and a COMPANY_LEVEL person
          // (a CEO with a code) would have resolved on a public form — which is the exact
          // thing `scope` exists to prevent.
          //
          // It is also the same shape as the hole the status redesign hit: `appliesTo`
          // filtered the dropdown but never the foreign key, so nothing stopped a booking
          // being marked DELIVERED (DataModel/Research-OrderStatusPatterns). Filter where the
          // value is *chosen*, not only where it is *displayed*.
          role: {
            isActive: true,
            scope: 'PER_ORDER',
            appliesTo: { in: [input.module, 'BOTH'] },
          },
          company: {
            tenantId,
            isIndividual: false,
            ...moduleWhere,
            ...(input.companyId ? { id: input.companyId } : {}),
          },
        },
        select: {
          id: true, name: true, phone: true, email: true, roleId: true,
          company: {
            select: {
              id: true, name: true, identificationCode: true, address: true,
              wineDiscountPercent: true,
            },
          },
        },
      })
      if (person) {
        return {
          success: true as const,
          company: person.company,
          matchType: 'person' as const,
          matchedPerson: {
            id: person.id,
            roleId: person.roleId,
            name: person.name,
            phone: person.phone,
            email: person.email,
          },
          roleChoices: [],
        }
      }
    }

    // ── 2. Resolve the company itself ────────────────────────────────────────
    const company = await tx.company.findFirst({
      where: input.companyId
        ? { id: input.companyId, tenantId }
        : { tenantId, accessCode: typed, isIndividual: false, ...moduleWhere },
      select: {
        id: true, name: true, accessCode: true, identificationCode: true, address: true,
        wineDiscountPercent: true,
      },
    })
    if (!company) return { error: 'Code not recognised.' }

    // When the caller named the company AND typed a code, the code has to be that company's.
    // (A person's code was already tried above and did not match.)
    if (input.companyId && typed) {
      if (!company.accessCode) {
        // "No code set" would be a lie the guest cannot act on when the company does have
        // person codes — just not the one typed.
        const peopleWithCodes = codesOn
          ? await tx.companyPerson.count({ where: { companyId: company.id, code: { not: null } } })
          : 0
        return { error: peopleWithCodes > 0 ? 'Incorrect code.' : 'No code set.' }
      }
      if (company.accessCode.toUpperCase() !== typed) return { error: 'Incorrect code.' }
    }

    // ── 3. Who can be picked ─────────────────────────────────────────────────
    // Empty when person codes are on: the guest proves identity instead of choosing it, and
    // nobody gets shown a list of their colleagues.
    const roleChoices = codesOn
      ? []
      : await pickableRoles(tx, tenantId, company.id, input.module)

    return {
      success: true as const,
      company: {
        id: company.id,
        name: company.name,
        identificationCode: company.identificationCode,
        address: company.address,
        wineDiscountPercent: company.wineDiscountPercent,
      },
      matchType: 'company' as const,
      matchedPerson: null,
      roleChoices,
    }
  })
}

/**
 * The per-order roles this company has people in, for this module.
 *
 * COMPANY_LEVEL roles are excluded by definition — they are company reference data (a CEO) and
 * must never appear on a form. Roles with nobody in them are dropped rather than rendered
 * empty, and a role whose people are all inactive disappears the same way.
 */
async function pickableRoles(
  tx: TxClient,
  tenantId: string,
  companyId: string,
  module: 'BOOKING' | 'WINE_ORDER'
): Promise<RoleChoices[]> {
  const roles = await tx.contactRole.findMany({
    where: {
      tenantId,
      isActive: true,
      scope: 'PER_ORDER',
      appliesTo: { in: [module, 'BOTH'] },
    },
    orderBy: [{ sortOrder: 'asc' }, { labelEn: 'asc' }],
    select: {
      id: true, key: true, labelEn: true, labelKa: true, sortOrder: true,
      people: {
        where: { companyId, isActive: true },
        orderBy: { name: 'asc' },
        // Note the absence of `code` — see ContactChoice.
        select: { id: true, name: true, phone: true, email: true, roleId: true },
      },
    },
  })

  return roles
    .filter(r => r.people.length > 0)
    .map(r => ({
      roleId: r.id,
      key: r.key,
      labelEn: r.labelEn,
      labelKa: r.labelKa,
      sortOrder: r.sortOrder,
      people: r.people.map(p => ({
        id: p.id,
        roleId: p.roleId,
        name: p.name,
        phone: p.phone,
        email: p.email,
      })),
    }))
}

/**
 * Company-level contact reference data (COMPANY_LEVEL roles — Max's CEO example).
 *
 * Deliberately a separate function from `resolveCompanyContacts`, which only ever returns
 * PER_ORDER roles. Keeping the two apart is what stops company reference data leaking onto a
 * public booking form by accident, which is the whole reason `scope` exists.
 */
export async function companyLevelContactsFor(tenantId: string, companyId: string): Promise<RoleChoices[]> {
  return withTenantDb(tenantId, async tx => {
    const company = await tx.company.findFirst({ where: { id: companyId, tenantId } })
    if (!company) return []
    const roles = await tx.contactRole.findMany({
      where: { tenantId, isActive: true, scope: 'COMPANY_LEVEL' },
      orderBy: [{ sortOrder: 'asc' }, { labelEn: 'asc' }],
      select: {
        id: true, key: true, labelEn: true, labelKa: true, sortOrder: true,
        people: {
          where: { companyId, isActive: true },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, phone: true, email: true, roleId: true },
        },
      },
    })
    return roles
      .filter(r => r.people.length > 0)
      .map(r => ({
        roleId: r.id,
        key: r.key,
        labelEn: r.labelEn,
        labelKa: r.labelKa,
        sortOrder: r.sortOrder,
        people: r.people.map(p => ({
          id: p.id, roleId: p.roleId, name: p.name, phone: p.phone, email: p.email,
        })),
      }))
  })
}
