import { createHash, timingSafeEqual } from 'node:crypto'

/**
 * Flitt (formerly Fondy) payment gateway.
 *
 * Signature algorithm ported from the old Laravel site's Flitt.php and verified
 * against Flitt's live API on 2026-07-29 (a checkout POST returned
 * response_status: success, and Flitt rejects a bad signature — so a success
 * response confirms the port). Do not "clean up" the ordering rules below;
 * they are the gateway's spec, not ours.
 *
 * Credentials are never read from env here. merchantId and password are always
 * parameters because they are per-tenant values loaded from the database.
 */

const FLITT_CHECKOUT_URL = 'https://pay.flitt.com/api/checkout/url'
const DEFAULT_CURRENCY = 'GEL'
const REQUEST_TIMEOUT_MS = 15000

/**
 * Fields that arrive on a callback but were not part of what the merchant
 * signed, so they must come back out before recomputing the hash.
 * `signature` is the value being checked; `response_signature_string` is
 * Flitt's own debug echo of the joined string.
 */
const CALLBACK_SIGNATURE_EXCLUDED = new Set(['signature', 'response_signature_string'])

/** Every param `createCheckout` signs. See the note on the explicit list below. */
const REQUIRED_PARAM_KEYS = [
  'merchant_id',
  'order_id',
  'order_desc',
  'amount',
  'currency',
  'response_url',
  'server_callback_url',
] as const

export type CreateCheckoutInput = {
  merchantId: string | number
  password: string
  orderId: string
  /** MAJOR units (e.g. 49.99 GEL). Converted to tetri here — do not pre-multiply. */
  amount: number
  currency?: string
  orderDesc: string
  responseUrl: string
  serverCallbackUrl: string
  lang?: string
  /** Free-form string echoed back on the callback; we use it to carry tenantId. */
  merchantData?: string
}

export type CreateCheckoutResult =
  | { checkoutUrl: string; paymentId: string }
  | { error: string }

/** Only the fields we read back from Flitt's checkout/url response. */
type FlittCheckoutResponse = {
  response?: {
    response_status?: string
    checkout_url?: string
    payment_id?: string | number
    error_code?: string | number
    error_message?: string
  }
}

/**
 * GEL → tetri. Flitt bills in minor units.
 *
 * The rounding is not cosmetic: 49.99 * 100 is 4998.9999999999995 in IEEE-754,
 * which truncates to 4998 and undercharges by a tetri. Every amount that
 * reaches Flitt must go through here.
 */
export function toMinorUnits(amountMajor: number): number {
  return Math.round(amountMajor * 100)
}

/**
 * Flitt's signature: drop empty values, sort by key, keep the values only,
 * prepend the merchant password, join with `|`, sha1 hex.
 *
 * The empty-value drop is the gateway's rule and cannot be removed — but it is
 * also a hazard, because a param that unexpectedly goes empty silently changes
 * what is hashed instead of failing. `createCheckout` defends against that by
 * validating an explicit key list before calling in (see below).
 *
 * The emptiness test is length-of-string, matching PHP's `strlen` filter, so a
 * value of `0` is kept. Flitt's docs call this out specifically: treating 0 as
 * empty (as a truthiness check would) drops it and yields the wrong hash.
 */
export function buildSignature(
  params: Record<string, string | number>,
  password: string
): string {
  const values = Object.keys(params)
    .filter(key => String(params[key]).length > 0)
    .sort()
    .map(key => String(params[key]))

  return createHash('sha1')
    .update([password, ...values].join('|'))
    .digest('hex')
}

/**
 * Recompute the signature of an inbound callback body and compare it to the one
 * Flitt sent. The old site never did this, which meant anyone who learned a
 * payment_id could POST a forged `order_status=approved`.
 *
 * Returns false rather than throwing on anything malformed — callers treat a
 * false as "reject this callback".
 */
export function verifyCallbackSignature(
  body: Record<string, unknown>,
  password: string
): boolean {
  const received = body.signature
  if (typeof received !== 'string' || received.length === 0) return false
  if (!password) return false

  const signable: Record<string, string> = {}
  for (const [key, value] of Object.entries(body)) {
    if (CALLBACK_SIGNATURE_EXCLUDED.has(key)) continue
    if (value === null || value === undefined) continue
    signable[key] = String(value)
  }

  const expected = buildSignature(signable, password)

  // Flitt sends lowercase hex; normalising avoids a false rejection (which on
  // this path means a real payment never settles) without weakening the check.
  const expectedBuf = Buffer.from(expected, 'utf8')
  const receivedBuf = Buffer.from(received.toLowerCase(), 'utf8')
  if (expectedBuf.length !== receivedBuf.length) return false

  return timingSafeEqual(expectedBuf, receivedBuf)
}

/**
 * Create a Flitt checkout and return the URL to send the customer to.
 *
 * The signed param set is built as an EXPLICIT object, not by filtering some
 * caller-supplied map. The old PHP did `array_filter($params, 'strlen')` over
 * whatever it happened to hold, so an empty field just vanished from the hash
 * with no error — a signature that verified fine but covered less than intended.
 * Here every key is written out by hand and checked for emptiness first, so a
 * missing value is a returned error rather than a quietly different hash.
 *
 * Never throws: network failures and non-200 responses come back as { error }.
 */
export async function createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
  if (!input.password) return { error: 'Flitt merchant password is not configured' }

  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { error: `Invalid payment amount: ${input.amount}` }
  }

  const amountMinor = toMinorUnits(input.amount)
  if (amountMinor < 1) return { error: `Payment amount rounds to zero: ${input.amount}` }

  const params: Record<string, string> = {
    merchant_id: String(input.merchantId ?? '').trim(),
    order_id: input.orderId,
    order_desc: input.orderDesc,
    amount: String(amountMinor),
    currency: input.currency || DEFAULT_CURRENCY,
    response_url: input.responseUrl,
    server_callback_url: input.serverCallbackUrl,
  }

  // Optional params are only added when populated. They are optional to Flitt,
  // so their absence is a legitimate state — unlike the required keys above,
  // where absence means we built a bad request.
  if (input.lang) params.lang = input.lang
  if (input.merchantData) params.merchant_data = input.merchantData

  for (const key of REQUIRED_PARAM_KEYS) {
    if (!params[key]) return { error: `Missing required Flitt parameter: ${key}` }
  }

  const signature = buildSignature(params, input.password)

  let response: Response
  try {
    response = await fetch(FLITT_CHECKOUT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request: { ...params, signature } }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (e) {
    // Deliberately logs the reason only — the request body carries the merchant
    // signature and must never reach the logs.
    const reason = e instanceof Error ? e.message : String(e)
    console.error('[flitt] checkout request failed:', reason)
    return { error: 'Could not reach the payment provider' }
  }

  const text = await response.text().catch(() => '')

  if (!response.ok) {
    console.error(`[flitt] checkout returned HTTP ${response.status}`)
    return { error: `Payment provider returned HTTP ${response.status}` }
  }

  let parsed: FlittCheckoutResponse
  try {
    parsed = JSON.parse(text) as FlittCheckoutResponse
  } catch {
    console.error('[flitt] checkout returned a non-JSON body')
    return { error: 'Unreadable response from the payment provider' }
  }

  const payload = parsed?.response
  if (!payload || payload.response_status !== 'success') {
    // error_message is Flitt's own text and is safe to surface to logs; it never
    // contains our credentials.
    const detail = payload?.error_message || payload?.error_code || 'unknown error'
    console.error('[flitt] checkout rejected:', detail)
    return { error: `Payment provider rejected the checkout: ${detail}` }
  }

  const checkoutUrl = payload.checkout_url
  const paymentId = String(payload.payment_id ?? '')
  if (typeof checkoutUrl !== 'string' || !checkoutUrl) {
    console.error('[flitt] checkout succeeded but returned no checkout_url')
    return { error: 'Payment provider returned no checkout URL' }
  }

  // A checkout with no payment_id is worse than a failed one. The callback
  // handler resolves the Payment row *by* providerPaymentId, so without it the
  // customer could pay at a working checkout URL that we could then never
  // settle — charged, with the order stuck unpaid. Fail before they pay.
  if (!paymentId) {
    console.error('[flitt] checkout succeeded but returned no payment_id')
    return { error: 'Payment provider returned no payment reference' }
  }

  return { checkoutUrl, paymentId }
}
