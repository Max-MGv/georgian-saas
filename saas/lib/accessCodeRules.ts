/**
 * Rules for access codes an admin types by hand (company codes and person codes).
 *
 * Since "no code = unknown company" (vault/Plan-WineOrderFeatures.md Chunk 15) a code is the only
 * thing that unlocks a company's prices, discount, addresses and people on the public forms. A
 * generated code is 8 characters from a 32-letter alphabet; a hand-typed one could be "NM". QA
 * 2026-10-14 F10: hand-typed codes need at least this many characters, and the public lookup is
 * rate-limited (lib/writeRateLimit.ts 'code-lookup'). Existing shorter codes keep working — the
 * rule applies when a code is set.
 */
export const MIN_ACCESS_CODE_LENGTH = 6

export function accessCodeProblem(normalized: string): string | null {
  if (!normalized) return 'Code cannot be empty.'
  if (normalized.length < MIN_ACCESS_CODE_LENGTH) return `Use at least ${MIN_ACCESS_CODE_LENGTH} characters — short codes are easy to guess.`
  if (normalized.length > 64) return 'That code is too long.'
  return null
}
