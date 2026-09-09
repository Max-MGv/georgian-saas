/**
 * Lightweight client-side breadcrumb trail — the last ~25 clicks/navigations
 * in the current session, used by the Bug Report Widget (Plan-BugReportWidget.md)
 * so Max can see what a user was doing right before they filed a report.
 *
 * This module owns ONLY the capture/storage mechanism. It does not render any
 * UI and is not (yet) consumed by anything — Phase 3/4 will read getBreadcrumbs()
 * when the report widget is built and submitted.
 *
 * Entry shape (documented for later phases):
 *   {
 *     type: 'click' | 'navigation'
 *     target: string   // human-readable description — for 'click', something like
 *                       // `button "Save"` or `a "Book now" > nav`; for 'navigation',
 *                       // the new pathname (also duplicated into `path` below)
 *     path: string      // the page pathname the entry happened on
 *     timestamp: number // Date.now() at capture time
 *   }
 *
 * Privacy: only element identity (tag name, visible text, aria-label, title,
 * or role of the nearest identifiable ancestor) is ever recorded. Input/textarea
 * VALUES are never read, and any element with type="password" is skipped entirely
 * — even its tag name is not recorded beyond a generic "[password field]" marker.
 */

export type Breadcrumb = {
  type: 'click' | 'navigation'
  target: string
  path: string
  timestamp: number
}

const MAX_ENTRIES = 25
const STORAGE_KEY = 'bugReportBreadcrumbs'

// In-memory ring buffer. Module-level so it survives client-side navigations
// (the module is only ever evaluated once per page load) and is hydrated from
// sessionStorage on first import so a full page reload doesn't lose the trail.
let buffer: Breadcrumb[] = []
let initialized = false
let listenersAttached = false

function hydrateFromStorage() {
  if (initialized) return
  initialized = true
  try {
    if (typeof window === 'undefined') return
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      buffer = parsed.slice(-MAX_ENTRIES)
    }
  } catch {
    // sessionStorage can throw in private browsing / disabled storage contexts —
    // never let breadcrumb capture break the page.
  }
}

function persistToStorage() {
  try {
    if (typeof window === 'undefined') return
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(buffer))
  } catch {
    // Same as above — swallow and move on. Losing the mirror is fine, the
    // in-memory buffer still works for the current page's lifetime.
  }
}

function push(entry: Breadcrumb) {
  buffer.push(entry)
  if (buffer.length > MAX_ENTRIES) {
    buffer = buffer.slice(buffer.length - MAX_ENTRIES)
  }
  persistToStorage()
}

/** True for any field whose value must never be inspected or logged. */
function isSensitiveField(el: Element): boolean {
  const tag = el.tagName.toLowerCase()
  if (tag === 'input') {
    const type = (el.getAttribute('type') || 'text').toLowerCase()
    if (type === 'password') return true
  }
  return false
}

/** Short, human-readable visible text for an element — never a value/content dump. */
function shortLabel(el: Element): string {
  if (isSensitiveField(el)) return '[password field]'

  const tag = el.tagName.toLowerCase()

  // Never read values of form controls — only identity.
  if (tag === 'input' || tag === 'textarea') {
    const type = tag === 'input' ? (el.getAttribute('type') || 'text').toLowerCase() : 'textarea'
    const label =
      el.getAttribute('aria-label') ||
      el.getAttribute('placeholder') ||
      el.getAttribute('name') ||
      ''
    return label ? `${tag}[${type}] "${truncate(label)}"` : `${tag}[${type}]`
  }

  const ariaLabel = el.getAttribute('aria-label')
  const title = el.getAttribute('title')
  const text = (el.textContent || '').trim().replace(/\s+/g, ' ')

  const label = ariaLabel || title || text
  return label ? `${tag} "${truncate(label)}"` : tag
}

function truncate(s: string, max = 40): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

const IDENTIFIABLE_SELECTOR =
  'button, a, [role="button"], [role="link"], [role="menuitem"], [role="tab"], input, textarea, select, summary, label'

/** Build a short description of the click target, e.g. `button "Save" > nav`. */
function describeClickTarget(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null

  // If the exact target is (or is inside) a sensitive field, never describe
  // anything more specific than the generic marker.
  const sensitiveAncestor = target.closest('input[type="password"]')
  if (sensitiveAncestor) return '[password field]'

  const leaf = shortLabel(target)

  // Nearest ancestor with an identifiable role, if different from the leaf itself.
  const ancestor = target.closest(IDENTIFIABLE_SELECTOR)
  if (ancestor && ancestor !== target) {
    if (isSensitiveField(ancestor)) return '[password field]'
    const ancestorLabel = shortLabel(ancestor)
    if (ancestorLabel !== leaf) {
      return `${leaf} > ${ancestorLabel}`
    }
  }

  return leaf
}

function currentPath(): string {
  if (typeof window === 'undefined') return ''
  return window.location.pathname
}

function handleClick(e: MouseEvent) {
  const description = describeClickTarget(e.target)
  if (!description) return
  push({ type: 'click', target: description, path: currentPath(), timestamp: Date.now() })
}

/**
 * Attach the document-level click listener once. Safe to call multiple times
 * (e.g. if mounted on more than one layout in some future refactor) — a module
 * flag prevents duplicate listeners.
 */
export function initBreadcrumbTracking() {
  if (typeof window === 'undefined') return
  hydrateFromStorage()
  if (listenersAttached) return
  listenersAttached = true
  document.addEventListener('click', handleClick, { capture: true })
}

/** Called by the navigation watcher (see BreadcrumbNavWatcher) on every pathname change. */
export function recordNavigation(path: string) {
  hydrateFromStorage()
  push({ type: 'navigation', target: path, path, timestamp: Date.now() })
}

/** Current buffer contents, oldest first. */
export function getBreadcrumbs(): Breadcrumb[] {
  hydrateFromStorage()
  return [...buffer]
}

/** Clear the buffer — for Phase 4 to call after a report is successfully submitted. */
export function clearBreadcrumbs() {
  buffer = []
  persistToStorage()
}
