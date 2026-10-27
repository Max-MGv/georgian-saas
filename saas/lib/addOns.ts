// ─── Add-on groups: who sees a group, and what it is called (T-7, Plan-AddOnsAndWine) ───────────────────────
//
// Pure helpers, no database: the admin page, the public booking form and the server's own check all use these, so
// "is this group offered on this booking?" has ONE answer. The server re-checks every add-on line a guest submits
// against it (a hidden group's item sent by a crafted request is refused, like an inactive item — #93).

export const ADDON_VISIT_TYPES = ['TASTING', 'TASTING_LUNCH', 'LUNCH'] as const
export type AddOnVisitType = (typeof ADDON_VISIT_TYPES)[number]

/**
 * The visit types an admin ticked → what is stored. All three ticked = [] ("every visit type", Plan D-4 / D-22), so a
 * visit type added in the future is covered without touching old groups. None ticked, or anything that is not a visit
 * type, is refused (null): a group shown on no visit would be a group nobody can ever see.
 */
export function normalizeVisitTypes(input: unknown): AddOnVisitType[] | null {
  if (!Array.isArray(input)) return null
  const picked = new Set<AddOnVisitType>()
  for (const v of input) {
    if (!(ADDON_VISIT_TYPES as readonly unknown[]).includes(v)) return null
    picked.add(v as AddOnVisitType)
  }
  if (picked.size === 0) return null
  if (picked.size === ADDON_VISIT_TYPES.length) return []
  return ADDON_VISIT_TYPES.filter(t => picked.has(t))
}

/** The ticks an admin sees for a stored list: empty = all three. */
export function visitTypesTicked(stored: readonly string[]): AddOnVisitType[] {
  return stored.length === 0 ? [...ADDON_VISIT_TYPES] : ADDON_VISIT_TYPES.filter(t => stored.includes(t))
}

export type GroupVisibility = {
  active: boolean
  showToCompanies: boolean
  showToIndividuals: boolean
  visitTypes: readonly string[]
}

/** Is this group offered on a booking of this kind? (active, right audience, right visit type) */
export function groupShownOn(g: GroupVisibility, bookingType: 'COMPANY' | 'INDIVIDUAL', visitType: string): boolean {
  if (!g.active) return false
  if (bookingType === 'COMPANY' ? !g.showToCompanies : !g.showToIndividuals) return false
  return g.visitTypes.length === 0 || g.visitTypes.includes(visitType)
}

/** A name in the guest's language; Georgian falls back to English when the winery left it empty (Plan D-2, E14). */
export function localName(en: string, ka: string | null | undefined, locale: string): string {
  return locale === 'ka' && ka && ka.trim() ? ka : en
}

export const MAX_ADDON_NAME_LENGTH = 80

/** A name as it will be stored: trimmed, 1…80 characters. null = refuse. */
export function cleanAddOnName(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const s = input.trim()
  return s.length >= 1 && s.length <= MAX_ADDON_NAME_LENGTH ? s : null
}

/** An optional Georgian name: empty → null, otherwise trimmed and ≤ 80 characters. `undefined` = refuse (bad input). */
export function cleanOptionalAddOnName(input: unknown): string | null | undefined {
  if (input == null) return null
  if (typeof input !== 'string') return undefined
  const s = input.trim()
  if (s === '') return null
  return s.length <= MAX_ADDON_NAME_LENGTH ? s : undefined
}
