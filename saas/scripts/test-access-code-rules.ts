/**
 * Hand-typed access codes (lib/accessCodeRules.ts, QA 2026-10-14 F10). Pure; no database.
 * Run: npx tsx scripts/test-access-code-rules.ts
 */
import { accessCodeProblem, MIN_ACCESS_CODE_LENGTH } from '../lib/accessCodeRules'

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ✅  ${label}`) } else { failed++; console.log(`  ❌  ${label}${detail ? ` — ${detail}` : ''}`) }
}
console.log('\n── access code rules ──\n')
check('Empty is refused', accessCodeProblem('') !== null)
check(`Shorter than ${MIN_ACCESS_CODE_LENGTH} is refused ("NM")`, accessCodeProblem('NM') !== null)
check(`Exactly ${MIN_ACCESS_CODE_LENGTH} is fine`, accessCodeProblem('MARANI') === null)
check('A generated-style 8-character code is fine', accessCodeProblem('VX9V4CCL') === null)
check('Over 64 characters is refused', accessCodeProblem('A'.repeat(65)) !== null)
console.log('\n──────────────────────────────────────────────────')
console.log(`Results: ${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exitCode = 1
