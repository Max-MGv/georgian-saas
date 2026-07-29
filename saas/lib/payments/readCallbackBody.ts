/**
 * Read a payment-gateway POST body as a flat string map.
 *
 * Flitt does not use one content type for both inbound paths: the browser
 * `response_url` arrives form-encoded (it is a real form POST from the payment
 * page) while the server `server_callback_url` arrives as JSON. The old Laravel
 * site never had to care because `$request->input()` normalised both; here it
 * has to be explicit.
 *
 * Anything unparseable comes back as an empty object, which every caller treats
 * as a rejected callback.
 */
export async function readCallbackBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type') ?? ''

  try {
    if (contentType.includes('application/json')) {
      const parsed: unknown = await request.json()
      return isPlainObject(parsed) ? parsed : {}
    }

    if (
      contentType.includes('application/x-www-form-urlencoded') ||
      contentType.includes('multipart/form-data')
    ) {
      const form = await request.formData()
      const out: Record<string, unknown> = {}
      for (const [key, value] of form.entries()) {
        // Files have no place in a payment callback; coerce to string only.
        if (typeof value === 'string') out[key] = value
      }
      return out
    }

    // No usable content-type header. Read once and sniff, rather than assuming:
    // an unparseable body must not be mistaken for an empty-but-valid one.
    const text = await request.text()
    if (!text) return {}
    try {
      const parsed: unknown = JSON.parse(text)
      return isPlainObject(parsed) ? parsed : {}
    } catch {
      const out: Record<string, unknown> = {}
      for (const [key, value] of new URLSearchParams(text).entries()) out[key] = value
      return out
    }
  } catch {
    return {}
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
