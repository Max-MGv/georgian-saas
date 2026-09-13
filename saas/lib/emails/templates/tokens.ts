/**
 * Shared `{token}` substitution for admin-editable email intro text — the
 * same `{varName}` convention `lib/t.ts` already uses elsewhere in the app,
 * reused here rather than inventing new syntax (Feature 181 follow-up).
 *
 * Escapes the template text AND every substituted value: this string is a
 * persisted tenant default reused on every future send, unlike a one-off
 * admin-typed note, so a stray `<` shouldn't be able to break markup for
 * every email until someone notices.
 */

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function renderTokenizedText(template: string, vars: Record<string, string>): string {
  let out = escapeHtml(template)
  for (const [key, value] of Object.entries(vars)) {
    out = out.replaceAll(`{${key}}`, escapeHtml(value))
  }
  return out
}
