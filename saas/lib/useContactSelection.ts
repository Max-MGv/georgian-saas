'use client'

import { useCallback, useState } from 'react'
import { resolveCompanyContacts, resolveCompanyContactsAsAdmin } from '@/app/actions/companies'
import type { ContactChoice, OrderRole, RoleChoices } from '@/lib/contactResolution'

/**
 * The shared client state machine for picking one person per contact role.
 *
 * **Why it exists.** Four forms autofill contact details from a company — the public
 * booking form, the public wine catalogue, and both admin manual-entry screens
 * (Plan-ContactRoles §4b). Before this hook they each carried their own copy of the
 * same logic, which is how `verifyBookingCode()` and `findBookingCodeByCode()` came to
 * silently disagree for five days (H4 / MaintenanceNotes #26). Chunk 3 collapsed the
 * server half into one resolver; this is the client half. Decision 10: build it once.
 *
 * **What belongs in here:** the `Record<roleId, personId>` map, the queue of roles
 * still to ask about, the call to the resolver, and — the point of H3 — *every* reset.
 * "Reset it everywhere" lived in four places in `BookingForm` alone (company changed,
 * "Not a rep", direct-code cleared) and a fifth was missed each time a path was added.
 *
 * **What does NOT belong in here:** anything booking-shaped. This hook never touches a
 * form field itself. It hands a picked person back through `onApply` and lets the
 * caller decide where the facts go — the booking form splits a name into first/last,
 * the wine catalogue keeps it whole, and neither is this hook's business. Error
 * *strings* are the caller's too; the resolver's raw message is returned and each form
 * maps it to its own tenant-editable copy.
 *
 * **When `person_codes_enabled` is on, nothing here fires.** The resolver returns an
 * empty `roleChoices` on purpose, so `pending` is empty and no popup ever opens
 * (decision 6). That emptiness is the privacy feature — read it as "ask them to type
 * their own details", never as an error.
 */

/** One picked contact, ready for an order payload. */
export type ContactSelection = {
  roleId: string
  /** Absent when the guest said "I am not on this list" and typed their own details. */
  personId?: string
  name: string
  phone: string | null
  email: string | null
}

type ResolveInput = {
  /** Known company (booking dropdown, admin screens). */
  companyId?: string
  /** A typed code — a person's own, or the company's shared one. */
  code?: string
}

type ResolveOutcome =
  | { error: string }
  | {
      success: true
      company: { id: string; name: string; identificationCode: string | null; address: string | null; wineDiscountPercent: number | null }
      matchType: 'person' | 'company'
      /** A person's own code matched — they are already selected, nothing to ask. */
      matchedPerson: ContactChoice | null
      /**
       * The pickable roles, returned as well as stored.
       *
       * The stored copy is state and therefore not readable from the closure that just awaited
       * this call, so a caller wanting to act on the result immediately — an admin screen
       * auto-selecting a role that has exactly one person, say — needs it in hand rather than
       * reaching for a ref.
       */
      roleChoices: RoleChoices[]
    }

type Options = {
  module: 'BOOKING' | 'WINE_ORDER'
  /**
   * An admin screen, which may see a company's people without an access code.
   *
   * Routes through `resolveCompanyContactsAsAdmin`, which calls `requireAdmin()` server-side.
   * The public action deliberately cannot be told to skip the code gate — a browser must not
   * be able to ask for that, and an unauthenticated caller naming a company id is exactly how
   * the gate was found to be bypassable.
   */
  asAdmin?: boolean
  /**
   * Put a picked person's facts into the caller's own fields. Called for a person-code
   * match and for every pick from the popup, with the role so a caller can route the
   * Guide's details somewhere other than the Contact Person's.
   */
  onApply?: (person: ContactChoice, role: OrderRole) => void
}

export function useContactSelection({ module, onApply, asAdmin = false }: Options) {
  /** roleId → the chosen person. Also the payload, once flattened. */
  const [selected, setSelected] = useState<Record<string, ContactSelection>>({})
  /** Every role this company has people in, in the tenant's sort order. */
  const [roleChoices, setRoleChoices] = useState<RoleChoices[]>([])
  /** Roles still to ask about, front first. Drains as the guest picks or skips. */
  const [pending, setPending] = useState<RoleChoices[]>([])
  const [loading, setLoading] = useState(false)

  /** The role the popup should be asking about right now, or null when done. */
  const activeRole = pending[0] ?? null

  /**
   * Clears every selection and every queued question.
   *
   * H3's "reset it everywhere", in one place. Callers invoke this whenever the company
   * they are attached to stops being the company the selections were made against:
   * a different company chosen, the code cleared, the booking switched to INDIVIDUAL.
   */
  const reset = useCallback(() => {
    setSelected({})
    setRoleChoices([])
    setPending([])
  }, [])

  /** Record a person against their role, and let the caller fill its fields. */
  const applyPerson = useCallback((person: ContactChoice, role: OrderRole) => {
    setSelected(prev => ({
      ...prev,
      [person.roleId]: {
        roleId: person.roleId,
        personId: person.id,
        name: person.name,
        phone: person.phone,
        email: person.email,
      },
    }))
    onApply?.(person, role)
  }, [onApply])

  /** The guest picked someone from the popup for the role currently being asked. */
  const pick = useCallback((person: ContactChoice) => {
    if (activeRole) applyPerson(person, activeRole)
    setPending(prev => prev.slice(1))
  }, [activeRole, applyPerson])

  /**
   * "I am not on this list" — move past this role without attributing it to anyone.
   * Whatever the guest types into the form still reaches the order as a snapshot, so
   * a person who has not been added in the admin panel yet is never stranded.
   */
  const skip = useCallback(() => {
    setPending(prev => prev.slice(1))
  }, [])

  /**
   * Ask about one role again, on demand — the "Choose from list" control next to a
   * role's fields. Someone who skipped the popup, or who picked the wrong person, has
   * no other way back to the list without re-entering the code.
   *
   * A no-op when that role has nobody to offer, which is the case whenever person
   * codes are on: the popup would open empty and the guest could only dismiss it.
   */
  const reopenRole = useCallback((roleId: string) => {
    const role = roleChoices.find(r => r.roleId === roleId)
    if (!role || role.people.length === 0) return
    setPending(prev => (prev[0]?.roleId === roleId ? prev : [role, ...prev.filter(r => r.roleId !== roleId)]))
  }, [roleChoices])

  /**
   * Ask the server who can be picked, and queue the questions.
   *
   * One call covers all four forms: `companyId` alone for a known company (the booking
   * dropdown, the admin screens), `code` alone for a tenant-wide lookup with no company
   * chosen first, or both for the dropdown-then-code path.
   */
  const resolve = useCallback(async (input: ResolveInput): Promise<ResolveOutcome> => {
    setLoading(true)
    const result = asAdmin
      ? await resolveCompanyContactsAsAdmin({ module, ...input })
      : await resolveCompanyContacts({ module, ...input })
    setLoading(false)

    if ('error' in result) return { error: result.error }

    setSelected({})
    setRoleChoices(result.roleChoices)

    // A person's own code already names them — there is nothing left to ask, and the
    // resolver deliberately sent no choices, so no colleague list is even in the page.
    if (result.matchedPerson) {
      const role = result.roleChoices.find(r => r.roleId === result.matchedPerson!.roleId)
        ?? { roleId: result.matchedPerson.roleId, key: '', labelEn: '', labelKa: '', sortOrder: 0 }
      applyPerson(result.matchedPerson, role)
      setPending([])
    } else {
      setPending(result.roleChoices)
    }

    return {
      success: true,
      company: result.company,
      matchType: result.matchType,
      matchedPerson: result.matchedPerson,
      roleChoices: result.roleChoices,
    }
  }, [module, asAdmin, applyPerson])

  /**
   * Select a person for a named role directly, with no popup in between.
   *
   * This is what the admin screens use: they have no code step to hang a popup off, so they
   * render the same choices inline and call this from a dropdown (plan §4b). Takes the person
   * and role as values rather than ids so it also works immediately after `resolve`, before
   * the stored `roleChoices` state has landed.
   */
  const pickFor = useCallback((person: ContactChoice, role: OrderRole) => {
    applyPerson(person, role)
    setPending(prev => prev.filter(r => r.roleId !== role.roleId))
  }, [applyPerson])

  /** Drop a role's selection entirely — the admin dropdown's "nobody" option. */
  const clearRole = useCallback((roleId: string) => {
    setSelected(prev => {
      const { [roleId]: _drop, ...rest } = prev
      return rest
    })
  }, [])

  /**
   * Record details the guest typed themselves against a role — no `personId`, because
   * nobody on file was chosen. This is what carries a not-on-the-list guide through to
   * the order's snapshot columns.
   */
  const setTyped = useCallback((roleId: string, facts: { name: string; phone?: string | null; email?: string | null }) => {
    setSelected(prev => {
      const name = facts.name.trim()
      const phone = facts.phone?.trim() || ''
      const email = facts.email?.trim() || ''
      /**
       * Drop the entry only when the whole role is empty — not merely when the name is.
       *
       * This used to key on the name alone, and because these inputs render from the stored
       * entry, someone who typed into a role's **phone** box before its **name** box watched
       * every keystroke disappear: each change stored a nameless entry, the entry was deleted,
       * and the input read back empty. Nothing said name-first was required, because nothing
       * should.
       *
       * A nameless row still never reaches the database — `buildOrderContactRows()` drops
       * blank names at write time, which is the right place for that guard.
       */
      if (!name && !phone && !email) {
        const { [roleId]: _drop, ...rest } = prev
        return rest
      }
      return {
        ...prev,
        [roleId]: {
          roleId,
          // Keep the link if one was picked and then edited; the snapshot still wins.
          personId: prev[roleId]?.personId,
          name,
          phone: facts.phone?.trim() || null,
          email: facts.email?.trim() || null,
        },
      }
    })
  }, [])

  return {
    /** roleId → selection, for rendering "you picked X" state. */
    selected,
    /** Flat, ready for an order payload. Chunk 9 turns these into OrderContact rows. */
    contacts: Object.values(selected),
    roleChoices,
    activeRole,
    loading,
    resolve,
    pick,
    pickFor,
    clearRole,
    skip,
    reopenRole,
    setTyped,
    reset,
  }
}
