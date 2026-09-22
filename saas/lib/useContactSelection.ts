'use client'

import { useCallback, useState } from 'react'
import { resolveCompanyContacts } from '@/app/actions/companies'
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
    }

type Options = {
  module: 'BOOKING' | 'WINE_ORDER'
  /**
   * Put a picked person's facts into the caller's own fields. Called for a person-code
   * match and for every pick from the popup, with the role so a caller can route the
   * Guide's details somewhere other than the Contact Person's.
   */
  onApply?: (person: ContactChoice, role: OrderRole) => void
}

export function useContactSelection({ module, onApply }: Options) {
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
    const result = await resolveCompanyContacts({ module, ...input })
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
    }
  }, [module, applyPerson])

  /**
   * Record details the guest typed themselves against a role — no `personId`, because
   * nobody on file was chosen. This is what carries a not-on-the-list guide through to
   * the order's snapshot columns.
   */
  const setTyped = useCallback((roleId: string, facts: { name: string; phone?: string | null; email?: string | null }) => {
    setSelected(prev => {
      const name = facts.name.trim()
      if (!name) {
        // An emptied field means "no one for this role", not "someone with a blank
        // name" — a blank-named OrderContact row would be worse than no row.
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
    skip,
    reopenRole,
    setTyped,
    reset,
  }
}
