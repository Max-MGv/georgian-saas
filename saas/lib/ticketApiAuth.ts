/**
 * Bearer-token auth for /api/tickets (Plan-Tickets.md) - the way Claude reads and updates tickets.
 * Tokens are random, shown once, and only their SHA-256 hash is stored, so a database leak does
 * not leak a usable token; revoke = set revokedAt (scripts/ticket-token.ts). Every call is attributed
 * to the token's name in the ticket timeline. One token per environment, because each environment has
 * its own database.
 */
import { createHash, randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function generateToken(): string {
  return 'tkt_' + randomBytes(32).toString('base64url')
}

// Per-token, per-instance speed bump (same caveat as lib/writeRateLimit.ts).
const WINDOW_MS = 60_000
const LIMIT = 120
const hits = new Map<string, { count: number; resetAt: number }>()

export async function authenticateTicketRequest(request: Request): Promise<{ name: string } | { response: NextResponse }> {
  const header = request.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return { response: NextResponse.json({ error: 'Missing bearer token.' }, { status: 401 }) }

  const hash = hashToken(token)
  const row = await db.ticketApiToken.findUnique({ where: { tokenHash: hash } })
  if (!row || row.revokedAt) return { response: NextResponse.json({ error: 'Invalid or revoked token.' }, { status: 401 }) }

  const now = Date.now()
  const w = hits.get(hash)
  if (!w || w.resetAt <= now) hits.set(hash, { count: 1, resetAt: now + WINDOW_MS })
  else if (++w.count > LIMIT) return { response: NextResponse.json({ error: 'Rate limit exceeded.' }, { status: 429 }) }

  // Best-effort; a failed timestamp write must never fail the request.
  void db.ticketApiToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {})
  return { name: row.name }
}

/** "12" or "T-12". Digits only (no "0x1F", "1e3"), and small enough for a Postgres INT. */
export function parseTicketNumber(raw: string): number | null {
  if (!/^(?:t-)?\d{1,9}$/i.test(raw)) return null
  const n = Number(raw.replace(/^t-/i, ''))
  return n >= 1 ? n : null
}

/** The JSON body as a plain object, or null (a body of `null`, an array or a string is not usable). */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}
