/**
 * Undo an optimistic update without clobbering anything that happened since (T-318 R2).
 *
 * A status change is shown at once (`after`, built from `before`) and then confirmed or refused by the
 * server. If it is refused, restoring the whole `before` row would also throw away a LATER change the
 * admin made to the same row in the meantime. So only the fields this change touched are put back —
 * and only if they still hold the value this change gave them.
 */
function same(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime()
  return Object.is(a, b)
}

export function revertPatch<T extends object>(current: T, before: T, after: T): T {
  const out = { ...current } as Record<string, unknown>
  const cur = current as Record<string, unknown>
  const bef = before as Record<string, unknown>
  const aft = after as Record<string, unknown>
  for (const key of new Set([...Object.keys(bef), ...Object.keys(aft)])) {
    if (same(bef[key], aft[key])) continue // this change did not touch it
    if (same(cur[key], aft[key])) out[key] = bef[key] // still our value → put it back
  }
  return out as T
}
