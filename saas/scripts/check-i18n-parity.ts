/**
 * Static-dictionary i18n parity checker (Plan-I18nIntegrity.md part B1).
 *
 * `lib/t.ts` (public site chrome) and `lib/adminT.ts` (admin panel chrome)
 * are each a flat `{ en: Translations, ka: Translations }` pair — see
 * MaintenanceNotes.md / ArchitectureReview-2026-08-12.md section 7 for how
 * they fit into the app's three text systems. Nothing has ever mechanically
 * checked that every key defined under `en` also exists under `ka` and vice
 * versa; a key added to one locale and forgotten in the other silently falls
 * back to the English string (or the raw key, if even the English row is
 * missing) with no error anywhere. This script closes that gap for the two
 * static dictionaries specifically — it does NOT check `SiteContent` DB rows
 * (that's part B2, a separate script) and does NOT catch a field that never
 * calls `t()`/`adminT()` at all (that's bug #16's shape, part B3).
 *
 * Keys are extracted by parsing the source file as text (brace-depth +
 * quote-aware, not a TS/AST parser) rather than importing the dictionaries,
 * since the `en`/`ka` consts aren't exported — this stays a read-only static
 * check with no risk of executing anything.
 *
 * Run: npx tsx scripts/check-i18n-parity.ts
 */
import * as fs from 'fs'
import * as path from 'path'

type DictFile = { label: string; relPath: string }

const DICTS: DictFile[] = [
  { label: 't.ts', relPath: 'lib/t.ts' },
  { label: 'adminT.ts', relPath: 'lib/adminT.ts' },
]

/** Finds the index of the `}` that closes the `{` at `openIdx`, respecting
 *  string literals (so `{min}` placeholders inside translation values don't
 *  throw off the brace count) and `//` line comments (so an apostrophe in a
 *  comment, e.g. "// companies's pattern", doesn't get mistaken for the
 *  start of a string literal). */
function findMatchingBrace(source: string, openIdx: number): number {
  let depth = 0
  let inString: '' | "'" | '"' | '`' = ''
  for (let i = openIdx; i < source.length; i++) {
    const c = source[i]
    if (inString) {
      if (c === '\\') { i++; continue }
      if (c === inString) inString = ''
      continue
    }
    if (c === '/' && source[i + 1] === '/') {
      const nl = source.indexOf('\n', i)
      i = nl === -1 ? source.length : nl
      continue
    }
    if (c === "'" || c === '"' || c === '`') { inString = c; continue }
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  throw new Error(`No matching closing brace found starting at index ${openIdx}`)
}

/** Extracts the set of keys defined in `const <varName>: Translations = { ... }`. */
function extractKeys(source: string, varName: 'en' | 'ka', fileLabel: string): Set<string> {
  const marker = `const ${varName}: Translations = {`
  const markerIdx = source.indexOf(marker)
  if (markerIdx === -1) {
    throw new Error(`${fileLabel}: could not find "${marker}" — dictionary shape may have changed`)
  }
  const openBraceIdx = markerIdx + marker.length - 1 // index of the '{' itself
  const closeBraceIdx = findMatchingBrace(source, openBraceIdx)
  const block = source.slice(openBraceIdx + 1, closeBraceIdx)

  const keys = new Set<string>()
  const keyPattern = /^\s*'([\w.]+)'\s*:/gm
  let m: RegExpExecArray | null
  while ((m = keyPattern.exec(block))) {
    keys.add(m[1])
  }
  return keys
}

function diffKeys(en: Set<string>, ka: Set<string>) {
  const missingInKa = [...en].filter(k => !ka.has(k)).sort()
  const missingInEn = [...ka].filter(k => !en.has(k)).sort()
  return { missingInKa, missingInEn }
}

function main() {
  console.log('\n── i18n static-dictionary parity check ──\n')

  let anyMismatch = false

  for (const { label, relPath } of DICTS) {
    const fullPath = path.join(__dirname, '..', relPath)
    const source = fs.readFileSync(fullPath, 'utf8')

    const enKeys = extractKeys(source, 'en', label)
    const kaKeys = extractKeys(source, 'ka', label)
    const { missingInKa, missingInEn } = diffKeys(enKeys, kaKeys)

    const totalUnique = new Set([...enKeys, ...kaKeys]).size
    const matched = totalUnique - missingInKa.length - missingInEn.length

    if (missingInKa.length === 0 && missingInEn.length === 0) {
      console.log(`✅ ${label}: ${matched}/${totalUnique} keys match (en: ${enKeys.size}, ka: ${kaKeys.size})`)
    } else {
      anyMismatch = true
      console.log(`❌ ${label}: ${matched}/${totalUnique} keys match (en: ${enKeys.size}, ka: ${kaKeys.size})`)
      if (missingInKa.length > 0) {
        console.log(`   Missing in ka (${missingInKa.length}):`)
        for (const k of missingInKa) console.log(`     - ${k}`)
      }
      if (missingInEn.length > 0) {
        console.log(`   Missing in en (${missingInEn.length}):`)
        for (const k of missingInEn) console.log(`     - ${k}`)
      }
    }
  }

  console.log('\n──────────────────────────────────────────────────')
  console.log(anyMismatch ? 'Result: MISMATCHES FOUND\n' : 'Result: ALL DICTIONARIES IN PARITY\n')
  if (anyMismatch) process.exitCode = 1
}

main()
