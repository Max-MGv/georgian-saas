'use server'

/**
 * Phase 4 of Plan-BugReportWidget.md — real submission path for the
 * bug/feature report widget (`components/BugReportWidget.tsx`).
 *
 * Deliberately UNAUTHENTICATED — public-site visitors submit without being
 * logged in, so this must never call requireAdmin()/requireSuperAdmin().
 * Server-side validation below is the only thing standing between this and
 * a wide-open write endpoint, so don't trust anything from the client.
 */

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/requireSuperAdmin'
import { requireAdmin } from '@/lib/requireAdmin'
import { sendTenantEmail } from '@/lib/emails/sendEmail'
import type { BugReportStatus } from '@prisma/client'
import { checkWriteRateLimit } from '@/lib/writeRateLimit'
import { createTicket, changeStatus, TicketError } from '@/lib/ticketService'
import {
  ALLOWED_IMAGE_TYPES, TENANT_STATUS_FOR, TICKET_STATUS_FOR_REPORT, deriveTitle, environmentFromHost, escapeHtml, safeHttpUrl,
  sniffImageType, ticketRef,
} from '@/lib/tickets'

const BUCKET = 'bug-report-screenshots' // private bucket, created in Phase 1
const MAX_COMMENT_LENGTH = 2000
const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024 // 4MB — matches widget's client-side cap (BugReportWidget.tsx); Vercel rejects request bodies over ~4.5MB

const REPORT_TYPES = ['BUG', 'FEATURE'] as const
const SURFACES = ['PUBLIC_SITE', 'ADMIN', 'SUPER_ADMIN'] as const
const STATUSES = ['NEW', 'IN_PROGRESS', 'RESOLVED', 'WONT_FIX'] as const

type ReportType = (typeof REPORT_TYPES)[number]
type Surface = (typeof SURFACES)[number]

type SubmitResult = { ok: true } | { error: string }

function isReportType(v: unknown): v is ReportType {
  return typeof v === 'string' && (REPORT_TYPES as readonly string[]).includes(v)
}

function isSurface(v: unknown): v is Surface {
  return typeof v === 'string' && (SURFACES as readonly string[]).includes(v)
}

function str(formData: FormData, key: string): string {
  const v = formData.get(key)
  return typeof v === 'string' ? v : ''
}

function strOrNull(formData: FormData, key: string): string | null {
  const v = str(formData, key).trim()
  return v.length > 0 ? v : null
}

const SURFACE_AREA: Record<Surface, string> = { PUBLIC_SITE: 'Public site', ADMIN: 'Admin', SUPER_ADMIN: 'Super-admin' }
const SURFACE_LABEL: Record<Surface, string> = { PUBLIC_SITE: 'public site', ADMIN: 'tenant admin', SUPER_ADMIN: 'super-admin' }
const CUID_LIKE = /^[a-z0-9]{10,40}$/i

/**
 * Breadcrumbs come from an unauthenticated form, so JSON.parse can return anything. The ticket page
 * renders them as text; an object or null in the wrong place makes React throw and the whole page
 * stop rendering (found by code review). Keep only well-formed entries, cap the count and lengths.
 */
function sanitizeBreadcrumbs(value: unknown): { type: string; target: string; path: string; timestamp: number }[] {
  if (!Array.isArray(value)) return []
  const out: { type: string; target: string; path: string; timestamp: number }[] = []
  for (const c of value.slice(-25)) {
    if (!c || typeof c !== 'object') continue
    const { type, target, path, timestamp } = c as Record<string, unknown>
    if (typeof type !== 'string' || typeof target !== 'string' || typeof path !== 'string') continue
    out.push({
      type: type.slice(0, 20), target: target.slice(0, 200), path: path.slice(0, 300),
      timestamp: typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : 0,
    })
  }
  return out
}

export async function submitBugReport(formData: FormData): Promise<SubmitResult> {
  // ── Identity is NEVER taken from the form (KnownBugs #74). Anyone can post any
  //    field to this unauthenticated action, so `tenantId`, `submitterEmail` and
  //    `submitterUserId` were previously forgeable: a report could be filed as any
  //    tenant or as a named admin and then showed up in that admin's "my reports".
  //    The tenant comes from the request host (proxy.ts resolves it into
  //    x-tenant-id); the submitter comes from the logged-in session. Both are
  //    still just labels for the inbox, but now at least true ones. ──
  const type = str(formData, 'type')
  const surface = str(formData, 'surface')
  const comment = str(formData, 'comment').trim()
  const userAgentRaw = strOrNull(formData, 'userAgent')
  const breadcrumbsRaw = str(formData, 'breadcrumbs')

  if (!isReportType(type)) return { error: 'Invalid report type.' }
  if (!isSurface(surface)) return { error: 'Invalid surface.' }
  if (!comment) return { error: 'Please describe the bug or feature request.' }
  if (comment.length > MAX_COMMENT_LENGTH) return { error: `Comment is too long (max ${MAX_COMMENT_LENGTH} characters).` }

  // Only http(s): this value is rendered as a link in the admin UI, and a
  // `javascript:` URL would run in the super-admin's session.
  const pageUrl = safeHttpUrl(str(formData, 'pageUrl'))
  if (!pageUrl) return { error: 'Missing or invalid page URL.' }
  const userAgent = userAgentRaw ? userAgentRaw.slice(0, 500) : null

  const h = await headers()
  const hostTenant = h.get('x-tenant-id')
  const tenantId = surface !== 'SUPER_ADMIN' && hostTenant && CUID_LIKE.test(hostTenant) ? hostTenant : null

  // Speed bump against a bot or a retry loop: every submission writes a ticket,
  // may upload 4 MB and sends an email. (Per-instance, like the booking limiter.)
  const rl = await checkWriteRateLimit(tenantId, 'bug-report')
  if (rl.limited) {
    const mins = Math.max(1, Math.ceil(rl.retryAfterSeconds / 60))
    return { error: `That's a lot of reports in a short time — please wait about ${mins} minute${mins === 1 ? '' : 's'} and try again.` }
  }

  let submitterEmail: string | null = null
  let submitterUserId: string | null = null
  if (surface !== 'PUBLIC_SITE') {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) { submitterEmail = user.email ?? null; submitterUserId = user.id }
  }

  let breadcrumbs: unknown = null
  if (breadcrumbsRaw && breadcrumbsRaw.length <= 30000) {
    try {
      breadcrumbs = sanitizeBreadcrumbs(JSON.parse(breadcrumbsRaw))
    } catch {
      breadcrumbs = null // malformed breadcrumbs shouldn't block the submission
    }
  }

  // ── Screenshot: type decided by the file's own bytes, not the client's claim; the
  //    extension and content type are ours (SVG can carry script and is refused). ──
  const screenshotFile = formData.get('screenshot')
  const hasScreenshot = screenshotFile instanceof File && screenshotFile.size > 0
  let screenshot: { bytes: Buffer; mime: string; ext: string } | null = null
  if (hasScreenshot) {
    const file = screenshotFile as File
    if (file.size > MAX_SCREENSHOT_BYTES) {
      return { error: `Screenshot is too large (max ${Math.round(MAX_SCREENSHOT_BYTES / 1024 / 1024)}MB).` }
    }
    const bytes = Buffer.from(await file.arrayBuffer())
    const mime = sniffImageType(bytes)
    if (!mime || !ALLOWED_IMAGE_TYPES[mime]) return { error: 'Screenshot must be a PNG, JPEG, WebP or GIF image.' }
    screenshot = { bytes, mime, ext: ALLOWED_IMAGE_TYPES[mime] }
  }

  // The bucket is PRIVATE — we store the storage path, never a public URL. The path
  // contains only values we generated or validated above.
  let screenshotPath: string | null = null
  if (screenshot) {
    const rand = Math.random().toString(36).slice(2, 10)
    screenshotPath = `${surface.toLowerCase()}/${tenantId ?? 'anonymous'}/${Date.now()}-${rand}.${screenshot.ext}`
    const supabase = createServiceClient()
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(screenshotPath, screenshot.bytes, {
      contentType: screenshot.mime,
      upsert: false,
    })
    if (uploadError) {
      console.error('[submitBugReport] screenshot upload failed', uploadError)
      return { error: 'Failed to upload screenshot. Please try again.' }
    }
  }

  // ── Report + ticket in ONE transaction: the raw report (what the customer said, kept
  //    untouched) and the work item the super-admin manages (Plan-Tickets.md). No
  //    withTenantDb — BugReport/Ticket are deliberately outside tenant RLS (and locked from
  //    the REST API by migration, KnownBugs #73), so plain db is correct. ──
  let ticketNumber: number
  let ticketTitle: string
  try {
    const result = await db.$transaction(async tx => {
      const report = await tx.bugReport.create({
        data: {
          type, surface, comment, screenshotUrl: screenshotPath,
          breadcrumbs: (breadcrumbs ?? undefined) as never,
          pageUrl, userAgent, tenantId, submitterEmail, submitterUserId,
        },
        select: { id: true },
      })
      const ticket = await createTicket({
        title: deriveTitle(comment),
        description: comment,
        type: type === 'FEATURE' ? 'FEATURE' : 'BUG',
        area: SURFACE_AREA[surface],
        tenantId,
        source: 'WIDGET',
        createdBy: 'reporter',
        createdNote: `Reported from the ${SURFACE_LABEL[surface]}${submitterEmail ? ` by ${submitterEmail}` : ''}: ${pageUrl}`,
      }, tx)
      await tx.bugReport.update({ where: { id: report.id }, data: { ticketId: ticket.id } })
      if (screenshotPath && screenshot) {
        await tx.ticketAttachment.create({
          data: { ticketId: ticket.id, storagePath: screenshotPath, bucket: BUCKET, fileName: `screenshot.${screenshot.ext}`, mimeType: screenshot.mime, sizeBytes: screenshot.bytes.length },
        })
      }
      return { number: ticket.number, title: ticket.title }
    })
    ticketNumber = result.number
    ticketTitle = result.title
  } catch (err) {
    console.error('[submitBugReport] failed to save report/ticket', err)
    return { error: 'Failed to save your report. Please try again.' }
  }

  // ── Notify Max via Resend — never fails the submission. Not from local development: every dev
  //    session and Playwright run would otherwise email Max. Staging and production still do. ──
  try {
    if (environmentFromHost(h.get('host')) === 'LOCAL') return { ok: true }
    await sendBugReportNotification({ ticketNumber, ticketTitle, type, surface, comment, tenantId, hasScreenshot })
  } catch (err) {
    console.error('[submitBugReport] notification email failed', err)
  }

  return { ok: true }
}

async function sendBugReportNotification(args: {
  ticketNumber: number
  ticketTitle: string
  type: ReportType
  surface: Surface
  comment: string
  tenantId: string | null
  hasScreenshot: boolean
}) {
  const tenant = args.tenantId
    ? await db.tenant.findUnique({ where: { id: args.tenantId }, select: { displayName: true, name: true } })
    : null
  const tenantLabel = tenant ? (tenant.displayName ?? tenant.name) : '—'

  // The link base comes from the request host: /super-admin is reachable from any domain the app
  // resolves (proxy.ts gates it on the super_admin role, not on domain).
  const h = await headers()
  const host = h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const env = environmentFromHost(host)
  const ticketUrl = `${proto}://${host}/super-admin/tickets/${args.ticketNumber}`

  const typeLabel = args.type === 'BUG' ? 'Bug' : 'Feature request'
  // Everything user-supplied is escaped: this HTML is built from unauthenticated input.
  const html = `
    <div style="font-family: Georgia, serif; max-width: 480px; margin: 0 auto; color: #1c1008; padding: 32px;">
      <h2 style="margin: 0 0 4px; font-size: 18px;">${escapeHtml(ticketRef(args.ticketNumber))} · ${escapeHtml(args.ticketTitle)}</h2>
      <p style="margin: 0 0 16px; font-size: 13px; color: #6b5a47;">New ${typeLabel.toLowerCase()} · ${escapeHtml(env)} · surface <strong>${escapeHtml(args.surface)}</strong></p>
      <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
        <tr><td style="padding: 8px 0; color: #6b5a47; width: 120px;">Type</td><td style="padding: 8px 0; font-weight: 600;">${typeLabel}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b5a47;">Tenant</td><td style="padding: 8px 0;">${escapeHtml(tenantLabel)}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b5a47; vertical-align: top;">Comment</td><td style="padding: 8px 0; white-space: pre-line;">${escapeHtml(args.comment)}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b5a47;">Screenshot</td><td style="padding: 8px 0;">${args.hasScreenshot ? 'Attached — view on the ticket (signed URL)' : 'None'}</td></tr>
      </table>
      <p style="margin: 24px 0 0; font-size: 13px;"><a href="${escapeHtml(ticketUrl)}" style="color: #7a2e2e;">Open ${escapeHtml(ticketRef(args.ticketNumber))} →</a></p>
    </div>
  `

  await sendTenantEmail({
    fromLocalPart: 'alerts',
    to: 'max@vineworks.ge',
    subject: `[${env}] [${typeLabel}] ${ticketRef(args.ticketNumber)} ${args.ticketTitle} — ${tenantLabel}`,
    html,
  })
}

// ── Phase 5 — Super-admin inbox ─────────────────────────────────────────
// Unlike submitBugReport above (deliberately open), everything below is
// inbox-only and MUST require super_admin. BugReport has no tenant RLS by
// design (see Phase 1 result + RLS-Architecture.md), so a plain db.bugReport
// call here is correct, not a gap — but that's exactly why the auth check
// below is the only thing gating cross-tenant read/write access to it.

export type BugReportListItem = {
  id: string
  type: ReportType
  status: BugReportStatus
  surface: Surface
  comment: string
  createdAt: string
  tenantId: string | null
  tenantName: string | null
  submitterEmail: string | null
}

export async function getBugReports(): Promise<BugReportListItem[]> {
  await requireSuperAdmin()

  const [reports, tenants] = await Promise.all([
    db.bugReport.findMany({ orderBy: { createdAt: 'desc' } }),
    db.tenant.findMany({ select: { id: true, name: true, displayName: true } }),
  ])
  const tenantMap = new Map(tenants.map(t => [t.id, t.displayName ?? t.name]))

  return reports.map(r => ({
    id: r.id,
    type: r.type,
    status: r.status,
    surface: r.surface,
    comment: r.comment,
    createdAt: r.createdAt.toISOString(),
    tenantId: r.tenantId,
    tenantName: r.tenantId ? (tenantMap.get(r.tenantId) ?? 'Unknown tenant') : null,
    submitterEmail: r.submitterEmail,
  }))
}

export type BugReportDetail = {
  id: string
  type: ReportType
  status: BugReportStatus
  surface: Surface
  comment: string
  screenshotSignedUrl: string | null
  breadcrumbs: { type: 'click' | 'navigation'; target: string; path: string; timestamp: number }[]
  pageUrl: string
  userAgent: string | null
  tenantId: string | null
  tenantName: string | null
  submitterEmail: string | null
  submitterUserId: string | null
  createdAt: string
  updatedAt: string
}

export async function getBugReport(id: string): Promise<BugReportDetail | null> {
  await requireSuperAdmin()

  const report = await db.bugReport.findUnique({ where: { id } })
  if (!report) return null

  const tenant = report.tenantId
    ? await db.tenant.findUnique({ where: { id: report.tenantId }, select: { displayName: true, name: true } })
    : null

  let screenshotSignedUrl: string | null = null
  if (report.screenshotUrl) {
    const supabase = createServiceClient()
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(report.screenshotUrl, 60 * 60) // 1 hour — fresh page load each time
    if (!error) screenshotSignedUrl = data.signedUrl
    else console.error('[getBugReport] failed to sign screenshot URL', error)
  }

  const breadcrumbs = Array.isArray(report.breadcrumbs)
    ? (report.breadcrumbs as BugReportDetail['breadcrumbs'])
    : []

  return {
    id: report.id,
    type: report.type,
    status: report.status,
    surface: report.surface,
    comment: report.comment,
    screenshotSignedUrl,
    breadcrumbs,
    pageUrl: report.pageUrl,
    userAgent: report.userAgent,
    tenantId: report.tenantId,
    tenantName: tenant ? (tenant.displayName ?? tenant.name) : null,
    submitterEmail: report.submitterEmail,
    submitterUserId: report.submitterUserId,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  }
}

export async function updateBugReportStatus(id: string, status: BugReportStatus) {
  await requireSuperAdmin()
  if (!(STATUSES as readonly string[]).includes(status)) {
    throw new Error('Invalid status.')
  }
  const report = await db.bugReport.findUnique({ where: { id }, select: { ticketId: true, ticket: { select: { status: true } } } })
  if (report?.ticketId) {
    // The ticket is authoritative; moving it also updates every linked report's tenant-visible status.
    // The old four-value dropdown cannot express the finer ticket states, so it must not drag a ticket
    // backwards (e.g. "New" must not pull a Ready-to-test ticket back to Inbox): only act when the
    // tenant-visible meaning actually changes.
    const current = report.ticket ? TENANT_STATUS_FOR[report.ticket.status] : null
    if (current !== status) {
      await changeStatus(report.ticketId, TICKET_STATUS_FOR_REPORT[status], 'max', {
        closeReason: status === 'WONT_FIX' ? 'WONT_FIX' : undefined,
      }).catch(e => { if (e instanceof TicketError) throw new Error(e.message); throw e })
    }
  } else {
    await db.bugReport.update({ where: { id }, data: { status } })
  }
  revalidatePath('/super-admin/bug-reports')
  revalidatePath(`/super-admin/bug-reports/${id}`)
}

// ── Phase 6 — Tenant admin "my reports" status view ─────────────────────
// Narrower than the super-admin inbox above: a logged-in tenant admin sees
// ONLY the reports they personally submitted (submitterUserId = their own
// auth id), never other admins' or other tenants' reports. Per
// Plan-BugReportWidget.md Phase 6, this was a deliberate decision, not left
// open — filter by user, not by tenant.
//
// The current user's id is read server-side from the Supabase session here,
// never accepted as a parameter — a client could otherwise pass any id and
// read someone else's reports.

export type MyBugReportListItem = {
  id: string
  type: ReportType
  status: BugReportStatus
  comment: string
  createdAt: string
}

const MY_REPORTS_COMMENT_PREVIEW_LENGTH = 160

export async function getMyBugReports(): Promise<MyBugReportListItem[]> {
  // requireAdmin() confirms this is a logged-in admin for the current
  // tenant (or a super admin); it does not by itself scope the query below —
  // that's done explicitly with the session's own user id.
  await requireAdmin()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const reports = await db.bugReport.findMany({
    where: { submitterUserId: user.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, type: true, status: true, comment: true, createdAt: true },
  })

  return reports.map(r => ({
    id: r.id,
    type: r.type,
    status: r.status,
    comment: r.comment.length > MY_REPORTS_COMMENT_PREVIEW_LENGTH
      ? `${r.comment.slice(0, MY_REPORTS_COMMENT_PREVIEW_LENGTH)}…`
      : r.comment,
    createdAt: r.createdAt.toISOString(),
  }))
}
