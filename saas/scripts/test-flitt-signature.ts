/**
 * Unit tests for lib/payments/flitt.ts — signature build/verify and amount rounding.
 * No network, no database: everything here is pure. Safe to run any time.
 * Run: npx tsx scripts/test-flitt-signature.ts
 *
 * The repo has no test runner, so this follows the scripts/test-rls.ts pattern
 * (counters + a test() helper) rather than introducing a framework.
 *
 * The password below is a throwaway. The real merchant password is per-tenant
 * and lives in the database — it must never appear in this repo.
 */

import {
  buildSignature,
  verifyCallbackSignature,
  createCheckout,
  toMinorUnits,
  type CreateCheckoutInput,
} from '../lib/payments/flitt'

const PASSWORD = 'test_merchant_password'

// ── helpers ──────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0
const failures: string[] = []

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    console.log(`  ✅  ${name}`)
    passed++
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)
    console.log(`  ❌  ${name}`)
    console.log(`       ${message}`)
    failed++
    failures.push(`${name}: ${message}`)
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg)
}

function assertEqual(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`)
}

/**
 * The param set from scratchpad/flitt-check.js — the request shape Flitt accepted
 * live on 2026-07-29 — with order_id frozen so the hash is stable.
 */
const REFERENCE_PARAMS = {
  response_url: 'https://www.nikalasmarani.ge/response',
  server_callback_url: 'https://www.nikalasmarani.ge/callback',
  order_id: 'acctcheck-1753776000000',
  currency: 'GEL',
  merchant_id: 4056054,
  order_desc: 'account status check',
  amount: 100,
}

const REFERENCE_SIGNATURE = 'b76ca6eb74983e3ea35bb016cb513f1a8b8ca2a3'

async function main() {
  // ── 1. buildSignature ───────────────────────────────────────────────────────
  console.log('\n── 1. buildSignature ──')

  await test('Known-good param set produces the expected sha1', () => {
    assertEqual(buildSignature(REFERENCE_PARAMS, PASSWORD), REFERENCE_SIGNATURE, 'signature')
  })

  await test('Key insertion order does not change the hash (sorted by key)', () => {
    const shuffled = {
      amount: 100,
      merchant_id: 4056054,
      order_desc: 'account status check',
      currency: 'GEL',
      server_callback_url: 'https://www.nikalasmarani.ge/callback',
      order_id: 'acctcheck-1753776000000',
      response_url: 'https://www.nikalasmarani.ge/response',
    }
    assertEqual(buildSignature(shuffled, PASSWORD), REFERENCE_SIGNATURE, 'signature')
  })

  await test('Numbers and their string forms hash identically', () => {
    const stringified = { ...REFERENCE_PARAMS, merchant_id: '4056054', amount: '100' }
    assertEqual(buildSignature(stringified, PASSWORD), REFERENCE_SIGNATURE, 'signature')
  })

  await test('Empty values are dropped (Flitt spec — the array_filter rule)', () => {
    const withEmpty = { ...REFERENCE_PARAMS, lang: '', merchant_data: '' }
    assertEqual(buildSignature(withEmpty, PASSWORD), REFERENCE_SIGNATURE, 'signature')
  })

  await test('A different password produces a different hash', () => {
    assert(
      buildSignature(REFERENCE_PARAMS, 'wrong_password') !== REFERENCE_SIGNATURE,
      'Hash did not change with a different password'
    )
  })

  await test('A changed param value produces a different hash', () => {
    const tampered = { ...REFERENCE_PARAMS, amount: 1 }
    assert(buildSignature(tampered, PASSWORD) !== REFERENCE_SIGNATURE, 'Hash did not change with a changed amount')
  })

  // ── 2. toMinorUnits (amount rounding) ───────────────────────────────────────
  console.log('\n── 2. toMinorUnits — float × 100 must not truncate ──')

  const roundingCases: [number, number][] = [
    [49.99, 4999],   // 4998.999999999999 in IEEE-754 — the case that undercharges
    [8.29, 829],     // 828.9999999999999
    [1.1, 110],      // 110.00000000000001
    [0.07, 7],       // 7.000000000000001
    [120, 12000],
    [0.1 + 0.2, 30], // 0.30000000000000004
    [1, 100],
    [0.01, 1],
  ]

  for (const [major, minor] of roundingCases) {
    await test(`${major} GEL → ${minor} tetri`, () => {
      assertEqual(toMinorUnits(major), minor, 'minor units')
    })
  }

  await test('Every rounding case yields an integer', () => {
    for (const [major] of roundingCases) {
      assert(Number.isInteger(toMinorUnits(major)), `${major} did not produce an integer`)
    }
  })

  // ── 3. verifyCallbackSignature ──────────────────────────────────────────────
  console.log('\n── 3. verifyCallbackSignature ──')

  const callbackFields = {
    order_id: 'ord_test_001',
    merchant_id: '4056054',
    amount: '4999',
    currency: 'GEL',
    order_status: 'approved',
    payment_id: '1002579836',
    sender_email: '',
  }
  const validBody = { ...callbackFields, signature: buildSignature(callbackFields, PASSWORD) }

  await test('Callback signature fixture matches the expected sha1', () => {
    assertEqual(validBody.signature, '48b84987bbb7a7c219f889c8c930b596894039f3', 'signature')
  })

  await test('Valid callback body is accepted', () => {
    assert(verifyCallbackSignature(validBody, PASSWORD), 'Valid body was rejected')
  })

  await test('response_signature_string is excluded from the recomputation', () => {
    const withEcho = { ...validBody, response_signature_string: 'whatever|flitt|echoes|back' }
    assert(verifyCallbackSignature(withEcho, PASSWORD), 'Body with response_signature_string was rejected')
  })

  await test('Tampered amount is rejected (the 1-tetri settle attack)', () => {
    const tampered = { ...validBody, amount: '1' }
    assert(!verifyCallbackSignature(tampered, PASSWORD), 'Tampered amount was accepted')
  })

  await test('Tampered order_status is rejected (the forged-approval attack)', () => {
    const forged = { ...validBody, order_status: 'approved', order_id: 'someone_elses_order' }
    assert(!verifyCallbackSignature(forged, PASSWORD), 'Forged order_id was accepted')
  })

  await test('An added field is rejected', () => {
    const extra = { ...validBody, extra_field: 'injected' }
    assert(!verifyCallbackSignature(extra, PASSWORD), 'Body with an injected field was accepted')
  })

  await test('Wrong password is rejected', () => {
    assert(!verifyCallbackSignature(validBody, 'wrong_password'), 'Wrong password was accepted')
  })

  await test('Missing signature is rejected, not thrown', () => {
    const noSig: Record<string, unknown> = { ...validBody }
    delete noSig.signature
    assert(!verifyCallbackSignature(noSig, PASSWORD), 'Body without a signature was accepted')
  })

  await test('Short signature is rejected without throwing (length guard)', () => {
    assert(!verifyCallbackSignature({ ...validBody, signature: 'abc' }, PASSWORD), 'Short signature was accepted')
  })

  await test('Non-string signature is rejected', () => {
    assert(!verifyCallbackSignature({ ...validBody, signature: 12345 }, PASSWORD), 'Numeric signature was accepted')
  })

  await test('Empty password is rejected', () => {
    assert(!verifyCallbackSignature(validBody, ''), 'Empty password was accepted')
  })

  await test('Uppercase hex signature is still accepted', () => {
    const upper = { ...validBody, signature: validBody.signature.toUpperCase() }
    assert(verifyCallbackSignature(upper, PASSWORD), 'Uppercase signature was rejected')
  })

  // ── 4. createCheckout guards (no network — all fail before fetch) ───────────
  console.log('\n── 4. createCheckout input guards ──')

  const validInput: CreateCheckoutInput = {
    merchantId: 4056054,
    password: PASSWORD,
    orderId: 'ord_test_001',
    amount: 49.99,
    orderDesc: 'Wine tasting for 2',
    responseUrl: 'https://example.ge/payment/result',
    serverCallbackUrl: 'https://example.ge/api/payments/flitt/callback',
  }

  async function expectError(input: CreateCheckoutInput, fragment: string, label: string) {
    const result = await createCheckout(input)
    assert('error' in result, `${label}: expected an error result, got a checkout`)
    assert(
      (result as { error: string }).error.includes(fragment),
      `${label}: expected error containing "${fragment}", got "${(result as { error: string }).error}"`
    )
  }

  await test('Missing password returns an error, does not throw', async () => {
    await expectError({ ...validInput, password: '' }, 'password', 'empty password')
  })

  await test('Zero amount returns an error', async () => {
    await expectError({ ...validInput, amount: 0 }, 'Invalid payment amount', 'zero amount')
  })

  await test('Negative amount returns an error', async () => {
    await expectError({ ...validInput, amount: -10 }, 'Invalid payment amount', 'negative amount')
  })

  await test('NaN amount returns an error', async () => {
    await expectError({ ...validInput, amount: Number.NaN }, 'Invalid payment amount', 'NaN amount')
  })

  await test('Sub-tetri amount returns an error rather than a 0 checkout', async () => {
    await expectError({ ...validInput, amount: 0.001 }, 'rounds to zero', 'sub-tetri amount')
  })

  await test('Empty orderId is caught by the required-param check', async () => {
    await expectError({ ...validInput, orderId: '' }, 'order_id', 'empty orderId')
  })

  await test('Empty orderDesc is caught by the required-param check', async () => {
    await expectError({ ...validInput, orderDesc: '' }, 'order_desc', 'empty orderDesc')
  })

  await test('Empty serverCallbackUrl is caught by the required-param check', async () => {
    await expectError({ ...validInput, serverCallbackUrl: '' }, 'server_callback_url', 'empty serverCallbackUrl')
  })

  await test('Empty merchantId is caught by the required-param check', async () => {
    await expectError({ ...validInput, merchantId: '' }, 'merchant_id', 'empty merchantId')
  })

  await test('No error message leaks the merchant password', async () => {
    const inputs = [
      { ...validInput, amount: 0 },
      { ...validInput, orderId: '' },
      { ...validInput, amount: 0.001 },
    ]
    for (const input of inputs) {
      const result = await createCheckout(input)
      assert('error' in result, 'Expected an error result')
      assert(!(result as { error: string }).error.includes(PASSWORD), 'Password leaked into an error message')
    }
  })

  // ── summary ────────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`)
  console.log(`Results: ${passed} passed, ${failed} failed`)
  if (failures.length > 0) {
    console.log('\nFailed tests:')
    failures.forEach(f => console.log(`  • ${f}`))
  }
  console.log('')
  if (failed > 0) process.exit(1)
}

main().catch(e => {
  console.error('\nFatal:', e)
  process.exit(1)
})
