/**
 * Copying client reports from the PRODUCTION board to the STAGING board (Plan-TicketsV2 3.5, approved by Max
 * 2026-10-15: "copy the whole tickets - one-way copy, so there is no risk of data cross-contamination").
 *
 * Direction of trust: production → staging only. Production pushes right after a report is saved, with a token
 * that on staging can do exactly one thing (create a P-ticket, scope "forward"). Staging holds no key to production;
 * screenshots travel as short-lived signed links that staging downloads once. Nothing ever flows back: telling the
 * client "it is fixed" is a deliberate step on production when the fix ships.
 *
 * Configured on production only, by two env vars (a production config change - Max's go, ClaudeInstructions Rule 0):
 *   TICKETS_FORWARD_URL    e.g. https://staging.vineworks.ge
 *   TICKETS_FORWARD_TOKEN  a "forward" token created on the staging (dev) database
 * Without them nothing is sent (local, staging).
 */

import { db } from '@/lib/db'
import { createServiceClient } from '@/lib/supabase/service'
import { TicketError, addAttachmentRow, createTicket, markForwarded } from '@/lib/ticketService'
import { ALLOWED_IMAGE_TYPES, MAX_DESCRIPTION, MAX_TITLE, TICKET_PRIORITIES, TICKET_TYPES, displayRef, safeHttpUrl, sanitizeBreadcrumbs, sniffImageType } from '@/lib/tickets'
import type { BugReportSurface, BugReportType } from '@prisma/client'

const TIMEOUT_MS = 8000
const MAX_IMAGES = 6
const MAX_IMAGE_BYTES = 4 * 1024 * 1024
const ATTACH_BUCKET = 'ticket-attachments'

export type ForwardPayload = {
  prodNumber: number
  prodUrl: string
  title: string
  description: string
  type: string
  priority: string
  area: string | null
  createdAt: string
  tenant: { id: string; slug: string | null; name: string } | null
  reports: { type: string; surface: string; comment: string; pageUrl: string; userAgent: string | null; breadcrumbs: unknown; submitterEmail: string | null; createdAt: string }[]
  images: { url: string; fileName: string }[]
}

export const forwardingConfigured = () => !!process.env.TICKETS_FORWARD_URL && !!process.env.TICKETS_FORWARD_TOKEN

// ── Production side ──────────────────────────────────────────────────────

/**
 * Sends one ticket to the staging board and records the outcome on the ticket. Never throws: a failure is
 * stored as `forwardError` (the production board then offers "Copy again"). `linkBase` is this board's own
 * address, so the P-ticket can link back ("Open on production").
 */
export async function forwardToStaging(ticketId: string, linkBase: string): Promise<{ ok: true; stagingRef: string } | { ok: false; error: string }> {
  const url = process.env.TICKETS_FORWARD_URL
  const token = process.env.TICKETS_FORWARD_TOKEN
  if (!url || !token) return { ok: false, error: 'Copying to staging is not set up on this environment.' }
  let result: { ok: true; stagingRef: string } | { ok: false; error: string }
  try {
    const payload = await buildPayload(ticketId, linkBase)
    const res = await fetch(`${url.replace(/\/$/, '')}/api/tickets/forward`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const data = await res.json().catch(() => ({})) as { ref?: string; error?: string }
    result = res.ok && data.ref ? { ok: true, stagingRef: data.ref } : { ok: false, error: `Staging answered ${res.status}${data.error ? `: ${data.error}` : ''}` }
  } catch (e) {
    result = { ok: false, error: e instanceof Error ? (e.name === 'TimeoutError' ? 'Staging did not answer in time.' : e.message) : 'Unknown error' }
  }
  try { await markForwarded(ticketId, result) } catch (e) { console.error('[forwardToStaging] could not record the result', e) }
  if (!result.ok) console.error('[forwardToStaging]', ticketId, result.error)
  return result
}

async function buildPayload(ticketId: string, linkBase: string): Promise<ForwardPayload> {
  const t = await db.ticket.findUnique({ where: { id: ticketId }, include: { reports: true, attachments: true } })
  if (!t) throw new Error('Ticket not found.')
  const tenant = t.tenantId ? await db.tenant.findUnique({ where: { id: t.tenantId }, select: { id: true, slug: true, name: true, displayName: true } }) : null
  const supabase = createServiceClient()
  const images: ForwardPayload['images'] = []
  for (const a of t.attachments.slice(0, MAX_IMAGES)) {
    // A link that works for one day: enough for staging to fetch it now (or on a retry), useless afterwards.
    const { data } = await supabase.storage.from(a.bucket).createSignedUrl(a.storagePath, 60 * 60 * 24)
    if (data?.signedUrl) images.push({ url: data.signedUrl, fileName: a.fileName })
  }
  return {
    prodNumber: t.number,
    prodUrl: `${linkBase.replace(/\/$/, '')}/super-admin/tickets?t=${t.number}`,
    title: t.title, description: t.description, type: t.type, priority: t.priority, area: t.area, createdAt: t.createdAt.toISOString(),
    tenant: tenant ? { id: tenant.id, slug: tenant.slug, name: tenant.displayName ?? tenant.name } : null,
    reports: t.reports.map(r => ({
      type: r.type, surface: r.surface, comment: r.comment, pageUrl: r.pageUrl, userAgent: r.userAgent, breadcrumbs: r.breadcrumbs,
      submitterEmail: r.submitterEmail, createdAt: r.createdAt.toISOString(),
    })),
    images,
  }
}

// ── Staging side ─────────────────────────────────────────────────────────

const REPORT_TYPES: BugReportType[] = ['BUG', 'FEATURE']
const SURFACES: BugReportSurface[] = ['PUBLIC_SITE', 'ADMIN', 'SUPER_ADMIN']
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')

/** Only the production Supabase project's own signed links are fetched - never an arbitrary address from the payload. */
function allowedImageUrl(raw: unknown): string | null {
  const u = safeHttpUrl(typeof raw === 'string' ? raw : '')
  if (!u) return null
  const { protocol, hostname, pathname } = new URL(u)
  return protocol === 'https:' && hostname.endsWith('.supabase.co') && pathname.startsWith('/storage/v1/object/sign/') ? u : null
}

/**
 * Creates the P-ticket on this (staging) board. Idempotent: the same production ticket sent twice returns the
 * existing P-ticket (externalRef "prod:<n>" is unique). The text is client-written: treated like widget text.
 */
export async function receiveForwarded(raw: unknown, actor: string): Promise<{ ref: string; number: number; created: boolean }> {
  const p = (raw ?? {}) as Partial<ForwardPayload>
  const prodNumber = Number(p.prodNumber)
  if (!Number.isInteger(prodNumber) || prodNumber < 1 || prodNumber > 2_000_000_000) throw new TicketError('prodNumber must be a ticket number.')
  const externalRef = `prod:${prodNumber}`
  const existing = await db.ticket.findUnique({ where: { externalRef }, select: { number: true, externalRef: true } })
  if (existing) return { ref: displayRef(existing), number: existing.number, created: false }

  const tenantIn = p.tenant && typeof p.tenant === 'object' ? p.tenant : null
  const tenant = tenantIn
    ? (await db.tenant.findUnique({ where: { id: str(tenantIn.id, 40) }, select: { id: true } }))
      ?? (tenantIn.slug ? await db.tenant.findFirst({ where: { slug: str(tenantIn.slug, 80) }, select: { id: true } }) : null)
    : null
  const prodUrl = safeHttpUrl(str(p.prodUrl, 500))
  const type = (TICKET_TYPES as readonly string[]).includes(String(p.type)) ? (p.type as 'BUG') : 'BUG'
  const priority = (TICKET_PRIORITIES as readonly string[]).includes(String(p.priority)) ? (p.priority as 'NORMAL') : 'NORMAL'

  let ticket
  try {
    ticket = await db.$transaction(async tx => {
      const t = await createTicket({
        title: str(p.title, MAX_TITLE) || `Client report P-${prodNumber}`,
        description: str(p.description, MAX_DESCRIPTION),
        type, priority, area: str(p.area, 40) || null, tenantId: tenant?.id ?? null,
        source: 'PRODUCTION', createdBy: actor, externalRef,
        createdNote: `Copied from the production board (P-${prodNumber})${tenantIn && !tenant ? ` - client: ${str(tenantIn.name, 80)} (not on this board)` : ''}.`,
      }, tx)
      if (prodUrl) await tx.ticket.update({ where: { id: t.id }, data: { links: [{ kind: 'url', ref: prodUrl, label: 'Open on production' }] } })
      for (const r of Array.isArray(p.reports) ? p.reports.slice(0, 20) : []) {
        await tx.bugReport.create({
          data: {
            ticketId: t.id,
            type: REPORT_TYPES.includes(r.type as BugReportType) ? (r.type as BugReportType) : 'BUG',
            surface: SURFACES.includes(r.surface as BugReportSurface) ? (r.surface as BugReportSurface) : 'PUBLIC_SITE',
            comment: str(r.comment, 2000), pageUrl: safeHttpUrl(str(r.pageUrl, 2000)) ?? '', userAgent: str(r.userAgent, 500) || null,
            breadcrumbs: sanitizeBreadcrumbs(r.breadcrumbs) as never, submitterEmail: str(r.submitterEmail, 200) || null,
            // Never linked to a user here: staging's accounts are not production's, and a copy must not appear in anyone's My Reports.
            submitterUserId: null, tenantId: tenant?.id ?? null,
          },
        })
      }
      return t
    })
  } catch (e) {
    // Two copies of the same report racing: the loser finds the winner's ticket.
    if ((e as { code?: string }).code === 'P2002') {
      const again = await db.ticket.findUnique({ where: { externalRef }, select: { number: true, externalRef: true } })
      if (again) return { ref: displayRef(again), number: again.number, created: false }
    }
    throw e
  }

  // Screenshots after the ticket exists: a slow or broken image must not lose the report itself.
  const supabase = createServiceClient()
  for (const img of Array.isArray(p.images) ? p.images.slice(0, MAX_IMAGES) : []) {
    const url = allowedImageUrl(img?.url)
    if (!url) continue
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
      if (!res.ok) continue
      const bytes = Buffer.from(await res.arrayBuffer())
      if (bytes.length > MAX_IMAGE_BYTES) continue
      const mime = sniffImageType(bytes)
      if (!mime || !ALLOWED_IMAGE_TYPES[mime]) continue
      const path = `${ticket.id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ALLOWED_IMAGE_TYPES[mime]}`
      const { error } = await supabase.storage.from(ATTACH_BUCKET).upload(path, bytes, { contentType: mime, upsert: false })
      if (error) continue
      const fileName = str(img.fileName, 80).replace(/[^\w.\- ]+/g, '_') || `screenshot.${ALLOWED_IMAGE_TYPES[mime]}`
      await addAttachmentRow(ticket.id, { storagePath: path, bucket: ATTACH_BUCKET, fileName, mimeType: mime, sizeBytes: bytes.length })
    } catch (e) {
      console.error('[receiveForwarded] image skipped', e instanceof Error ? e.message : e)
    }
  }
  return { ref: displayRef(ticket), number: ticket.number, created: true }
}
