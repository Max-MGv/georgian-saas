'use client'

/**
 * Floating bug/feature report widget — Phase 3 of Plan-BugReportWidget.md.
 *
 * Mounted once per surface (`(site)`, `admin/(panel)`, `super-admin` layouts)
 * with a `surface` prop identifying which one. Renders a small floating
 * button, bottom-right, that opens a slide-over panel matching the
 * edit-panel pattern already used in `app/admin/(panel)/orders/OrdersTable.tsx`
 * (fixed backdrop + fixed right-side panel, translateX transition).
 *
 * IMPORTANT — this is UI only. There is no server action yet (that's Phase 4,
 * `app/actions/bugReports.ts` → `submitBugReport`). The submit handler below
 * calls `stubSubmitBugReport()`, which just logs the assembled payload to the
 * console and resolves after a short delay to simulate a network round trip.
 * Phase 4 should replace that one function call — everything else (state,
 * validation, the payload shape) is meant to carry over unchanged.
 */

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { getBreadcrumbs, clearBreadcrumbs, type Breadcrumb } from '@/lib/breadcrumbs'
import { submitBugReport } from '@/app/actions/bugReports'

export type BugReportSurface = 'PUBLIC_SITE' | 'ADMIN' | 'SUPER_ADMIN'

type ReportType = 'BUG' | 'FEATURE'

const MAX_COMMENT_LENGTH = 2000
// Provisional — Phase 4 owns the real cap (client + server) alongside the
// Storage bucket's own limits. Keeping this here just avoids obviously large
// pastes/uploads bogging down the panel before Phase 4 exists.
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024

type BugReportPayload = {
  type: ReportType
  surface: BugReportSurface
  comment: string
  pageUrl: string
  userAgent: string
  tenantId: string | null
  submitterEmail: string | null
  submitterUserId: string | null
  breadcrumbs: Breadcrumb[]
  screenshot: { name: string; size: number; type: string } | null
}

// Phase 4: real submission — packs the payload into FormData (server actions
// taking a File need FormData, not a plain object; matches
// app/actions/uploadLogo.ts's calling convention) and calls the real server
// action.
async function realSubmitBugReport(
  payload: BugReportPayload,
  screenshotFile: File | null
): Promise<{ ok: true } | { error: string }> {
  const formData = new FormData()
  formData.set('type', payload.type)
  formData.set('surface', payload.surface)
  formData.set('comment', payload.comment)
  formData.set('pageUrl', payload.pageUrl)
  formData.set('userAgent', payload.userAgent)
  if (payload.tenantId) formData.set('tenantId', payload.tenantId)
  if (payload.submitterEmail) formData.set('submitterEmail', payload.submitterEmail)
  if (payload.submitterUserId) formData.set('submitterUserId', payload.submitterUserId)
  formData.set('breadcrumbs', JSON.stringify(payload.breadcrumbs))
  if (screenshotFile) formData.set('screenshot', screenshotFile)
  return submitBugReport(formData)
}

export default function BugReportWidget({
  surface,
  tenantId = null,
  submitterEmail = null,
  submitterUserId = null,
}: {
  surface: BugReportSurface
  tenantId?: string | null
  submitterEmail?: string | null
  submitterUserId?: string | null
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<ReportType>('BUG')
  const [comment, setComment] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [imageError, setImageError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  function reset() {
    setType('BUG')
    setComment('')
    clearImage()
    setSubmitting(false)
    setSuccess(false)
    setSubmitError(null)
  }

  function close() {
    setOpen(false)
    // Small delay so the slide-out transition doesn't visibly reset content
    // mid-animation.
    setTimeout(reset, 200)
  }

  function clearImage() {
    setImageFile(null)
    setImageError(null)
    setImagePreviewUrl(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function acceptImage(file: File) {
    if (!file.type.startsWith('image/')) {
      setImageError('Please attach an image file.')
      return
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      setImageError(`Image is too large (max ${Math.round(MAX_SCREENSHOT_BYTES / 1024 / 1024)}MB).`)
      return
    }
    setImageError(null)
    setImageFile(file)
    setImagePreviewUrl(prev => {
      if (prev) URL.revokeObjectURL(prev)
      return URL.createObjectURL(file)
    })
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) acceptImage(file)
  }

  // Paste-from-clipboard support, only while the panel is open.
  useEffect(() => {
    if (!open) return
    function handlePaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            acceptImage(file)
            e.preventDefault()
          }
          break
        }
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Revoke any outstanding object URL on unmount.
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit() {
    if (!comment.trim() || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    const payload: BugReportPayload = {
      type,
      surface,
      comment: comment.trim(),
      pageUrl: typeof window !== 'undefined' ? window.location.href : pathname,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      tenantId,
      submitterEmail,
      submitterUserId,
      // Read once, at submit time — not continuously — per Phase 3 spec.
      breadcrumbs: getBreadcrumbs(),
      screenshot: imageFile
        ? { name: imageFile.name, size: imageFile.size, type: imageFile.type }
        : null,
    }
    try {
      const result = await realSubmitBugReport(payload, imageFile)
      setSubmitting(false)
      if ('error' in result) {
        setSubmitError(result.error)
        return
      }
      setSuccess(true)
      // Only clear the breadcrumb trail after a confirmed successful submit —
      // not before, so a failed/retried submission still carries context.
      clearBreadcrumbs()
      setTimeout(close, 1500)
    } catch {
      setSubmitting(false)
      setSubmitError('Something went wrong. Please try again.')
    }
  }

  const commentCount = comment.length
  const C = {
    surface: 'var(--site-surface)',
    border: 'var(--site-border)',
    text: 'var(--site-text)',
    muted: 'var(--site-muted)',
    brand: 'var(--color-brand)',
  }

  return (
    <>
      {/* Floating trigger button — bottom-right, fixed. Kept clear of the
          public-site mobile hamburger (top header, not fixed-bottom) and the
          admin panel's top nav / OrdersTable slide-over (which itself lives
          at z-40/z-50) by sitting at a higher z-index. */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Report a bug or feature request"
          title="Report a bug or feature request"
          className="fixed flex items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105"
          style={{
            bottom: 20,
            right: 20,
            width: 48,
            height: 48,
            zIndex: 8900,
            backgroundColor: C.brand,
            color: 'white',
            border: '1px solid rgba(0,0,0,0.1)',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="8" y="6" width="8" height="12" rx="4" />
            <path d="M12 2v4M12 18v4M4 10H2M4 14H2M22 10h-2M22 14h-2M6 8 4.5 6.5M18 8l1.5-1.5M6 16l-1.5 1.5M18 16l1.5 1.5" />
          </svg>
        </button>
      )}

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0"
          style={{ zIndex: 8990, backgroundColor: 'rgba(28,16,8,0.35)' }}
          onClick={close}
        />
      )}

      {/* Slide-over panel */}
      <div
        ref={panelRef}
        className="fixed top-0 right-0 h-full overflow-y-auto w-full sm:w-[400px]"
        style={{
          zIndex: 9000,
          backgroundColor: C.surface,
          borderLeft: `1px solid ${C.border}`,
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.2s ease',
          padding: '24px',
        }}
      >
        {open && (
          <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-semibold text-base" style={{ color: C.text }}>Report a bug or idea</h2>
              <button onClick={close} aria-label="Close" style={{ color: C.muted, fontSize: '1.25rem', lineHeight: 1 }}>×</button>
            </div>

            {success ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <div
                  className="flex items-center justify-center rounded-full"
                  style={{ width: 48, height: 48, backgroundColor: '#dcfce7', color: '#16a34a' }}
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </div>
                <p className="text-sm font-medium" style={{ color: C.text }}>Thanks — got it.</p>
                <p className="text-xs" style={{ color: C.muted }}>We'll take a look.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {/* Type toggle */}
                <div className="flex gap-2">
                  {(['BUG', 'FEATURE'] as ReportType[]).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
                      style={
                        type === t
                          ? { backgroundColor: C.brand, color: 'white' }
                          : { backgroundColor: 'transparent', color: C.muted, border: `1px solid ${C.border}` }
                      }
                    >
                      {t === 'BUG' ? 'Bug' : 'Feature request'}
                    </button>
                  ))}
                </div>

                {/* Comment */}
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>
                    What happened? <span style={{ color: '#b91c1c' }}>*</span>
                  </label>
                  <textarea
                    value={comment}
                    onChange={e => setComment(e.target.value.slice(0, MAX_COMMENT_LENGTH))}
                    maxLength={MAX_COMMENT_LENGTH}
                    rows={5}
                    placeholder="Describe the bug or the feature you'd like…"
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ backgroundColor: 'transparent', border: `1px solid ${C.border}`, color: C.text, resize: 'vertical' }}
                  />
                  <div className="flex justify-end mt-1">
                    <span className="text-xs" style={{ color: C.muted }}>{commentCount}/{MAX_COMMENT_LENGTH}</span>
                  </div>
                </div>

                {/* Screenshot */}
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: C.muted }}>
                    Screenshot (optional)
                  </label>
                  {imagePreviewUrl ? (
                    <div className="relative inline-block">
                      <img
                        src={imagePreviewUrl}
                        alt="Attached screenshot"
                        className="rounded-lg border"
                        style={{ maxWidth: '100%', maxHeight: 160, borderColor: C.border, display: 'block' }}
                      />
                      <button
                        type="button"
                        onClick={clearImage}
                        aria-label="Remove screenshot"
                        className="absolute rounded-full flex items-center justify-center"
                        style={{
                          top: -8, right: -8, width: 22, height: 22,
                          backgroundColor: '#1c1008', color: 'white', fontSize: 12, lineHeight: 1,
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <div
                      className="rounded-lg border border-dashed px-3 py-4 text-center text-xs"
                      style={{ borderColor: C.border, color: C.muted }}
                    >
                      <p>Paste an image (Ctrl/Cmd+V) or</p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="mt-2 px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{ border: `1px solid ${C.border}`, color: C.text }}
                      >
                        Choose file
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleFileInputChange}
                        className="hidden"
                      />
                    </div>
                  )}
                  {imageError && <p className="text-xs mt-1" style={{ color: '#b91c1c' }}>{imageError}</p>}
                </div>

                {submitError && (
                  <p className="text-xs" style={{ color: '#b91c1c' }}>{submitError}</p>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleSubmit}
                    disabled={!comment.trim() || submitting}
                    className="btn-wine flex-1 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {submitting ? 'Sending…' : 'Send report'}
                  </button>
                  <button
                    onClick={close}
                    className="px-4 py-2 rounded-lg border text-sm"
                    style={{ borderColor: C.border, color: C.muted }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
