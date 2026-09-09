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

import { Resend } from 'resend'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient } from '@/lib/supabase/server'
import { requireSuperAdmin } from '@/lib/requireSuperAdmin'
import { requireAdmin } from '@/lib/requireAdmin'
import type { BugReportStatus } from '@prisma/client'

const BUCKET = 'bug-report-screenshots' // private bucket, created in Phase 1
const MAX_COMMENT_LENGTH = 2000
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024 // 5MB — matches widget's client-side cap (BugReportWidget.tsx)

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

export async function submitBugReport(formData: FormData): Promise<SubmitResult> {
  // ── Validate every field server-side — never trust the client alone. ──
  const type = str(formData, 'type')
  const surface = str(formData, 'surface')
  const comment = str(formData, 'comment').trim()
  const pageUrl = str(formData, 'pageUrl')
  const userAgent = strOrNull(formData, 'userAgent')
  const tenantId = strOrNull(formData, 'tenantId')
  const submitterEmail = strOrNull(formData, 'submitterEmail')
  const submitterUserId = strOrNull(formData, 'submitterUserId')
  const breadcrumbsRaw = str(formData, 'breadcrumbs')

  if (!isReportType(type)) return { error: 'Invalid report type.' }
  if (!isSurface(surface)) return { error: 'Invalid surface.' }
  if (!comment) return { error: 'Please describe the bug or feature request.' }
  if (comment.length > MAX_COMMENT_LENGTH) return { error: `Comment is too long (max ${MAX_COMMENT_LENGTH} characters).` }
  if (!pageUrl) return { error: 'Missing page URL.' }

  let breadcrumbs: unknown = null
  if (breadcrumbsRaw) {
    try {
      breadcrumbs = JSON.parse(breadcrumbsRaw)
    } catch {
      breadcrumbs = null // malformed breadcrumbs shouldn't block the submission
    }
  }

  const screenshotFile = formData.get('screenshot')
  const hasScreenshot = screenshotFile instanceof File && screenshotFile.size > 0

  if (hasScreenshot) {
    const file = screenshotFile as File
    if (!file.type.startsWith('image/')) return { error: 'Screenshot must be an image file.' }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      return { error: `Screenshot is too large (max ${Math.round(MAX_SCREENSHOT_BYTES / 1024 / 1024)}MB).` }
    }
  }

  // ── Upload screenshot, if any (same service-role Storage pattern as
  //    app/actions/uploadLogo.ts). Bucket is PRIVATE — we store the storage
  //    path, not a public URL (a public URL wouldn't resolve against a
  //    private bucket anyway). Phase 5's inbox reads it back with
  //    supabase.storage.from(BUCKET).createSignedUrl(path, expiresIn). ──
  let screenshotPath: string | null = null
  if (hasScreenshot) {
    const file = screenshotFile as File
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png'
    const rand = Math.random().toString(36).slice(2, 10)
    screenshotPath = `${surface.toLowerCase()}/${tenantId ?? 'anonymous'}/${Date.now()}-${rand}.${ext}`

    const supabase = createServiceClient()
    const raw = Buffer.from(await file.arrayBuffer())
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(screenshotPath, raw, {
      contentType: file.type || 'image/png',
      upsert: false,
    })
    if (uploadError) {
      console.error('[submitBugReport] screenshot upload failed', uploadError)
      return { error: 'Failed to upload screenshot. Please try again.' }
    }
  }

  // ── Create the row. No withTenantDb — BugReport is deliberately outside
  //    tenant RLS (same treatment as Tenant itself, see RLS-Architecture.md),
  //    so a plain db.bugReport.create() is correct here, not a gap. ──
  let reportId: string
  try {
    const report = await db.bugReport.create({
      data: {
        type,
        surface,
        comment,
        screenshotUrl: screenshotPath,
        breadcrumbs: breadcrumbs ?? undefined,
        pageUrl,
        userAgent,
        tenantId,
        submitterEmail,
        submitterUserId,
      },
      select: { id: true },
    })
    reportId = report.id
  } catch (err) {
    console.error('[submitBugReport] failed to create BugReport row', err)
    return { error: 'Failed to save your report. Please try again.' }
  }

  // ── Notify Max via Resend — never fails the submission. The report is
  //    already saved above; a bounced/failed email is logged, not surfaced
  //    to the reporter. ──
  try {
    await sendBugReportNotification({ reportId, type, surface, comment, tenantId, hasScreenshot })
  } catch (err) {
    console.error('[submitBugReport] notification email failed', err)
  }

  return { ok: true }
}

async function sendBugReportNotification(args: {
  reportId: string
  type: ReportType
  surface: Surface
  comment: string
  tenantId: string | null
  hasScreenshot: boolean
}) {
  const resend = new Resend(process.env.RESEND_API_KEY)

  const tenant = args.tenantId
    ? await db.tenant.findUnique({ where: { id: args.tenantId }, select: { displayName: true, name: true } })
    : null
  const tenantLabel = tenant ? (tenant.displayName ?? tenant.name) : args.tenantId ? args.tenantId : '—'

  // Base URL for the report link: derived from the incoming request's host
  // rather than a hardcoded env var (none exists for this yet — see
  // Plan-BugReportWidget.md Phase 4 result). /super-admin is reachable from
  // any domain the app resolves (proxy.ts gates it on the super_admin role,
  // not on domain), so this works regardless of which surface/domain the
  // report was submitted from.
  const h = await headers()
  const host = h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const reportUrl = `${proto}://${host}/super-admin/bug-reports/${args.reportId}`

  const typeLabel = args.type === 'BUG' ? 'Bug' : 'Feature request'

  // Sandbox mode: onboarding@resend.dev can only deliver to the verified
  // owner email — same convention as lib/emails/invoiceEmail.ts and
  // app/actions/notifyNewCompany.ts.
  const isDomainVerified = false
  const to = isDomainVerified ? 'max.mghvdliashvili@gmail.com' : 'max.mghvdliashvili@gmail.com'

  const html = `
    <div style="font-family: Georgia, serif; max-width: 480px; margin: 0 auto; color: #1c1008; padding: 32px;">
      <h2 style="margin: 0 0 4px; font-size: 18px;">New ${typeLabel.toLowerCase()} report</h2>
      <p style="margin: 0 0 16px; font-size: 13px; color: #6b5a47;">Surface: <strong>${args.surface}</strong></p>
      <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
        <tr><td style="padding: 8px 0; color: #6b5a47; width: 120px;">Type</td><td style="padding: 8px 0; font-weight: 600;">${typeLabel}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b5a47;">Tenant</td><td style="padding: 8px 0;">${tenantLabel}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b5a47; vertical-align: top;">Comment</td><td style="padding: 8px 0; white-space: pre-line;">${args.comment}</td></tr>
        <tr><td style="padding: 8px 0; color: #6b5a47;">Screenshot</td><td style="padding: 8px 0;">${args.hasScreenshot ? 'Attached — view in the inbox (signed URL)' : 'None'}</td></tr>
      </table>
      <p style="margin: 24px 0 0; font-size: 13px;"><a href="${reportUrl}" style="color: #7a2e2e;">Open in the bug reports inbox →</a></p>
    </div>
  `

  const { error } = await resend.emails.send({
    from: 'onboarding@resend.dev',
    to,
    subject: `[${typeLabel}] ${args.surface} — ${tenantLabel}`,
    html,
  })

  if (error) throw new Error(error.message)
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
  await db.bugReport.update({ where: { id }, data: { status } })
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
