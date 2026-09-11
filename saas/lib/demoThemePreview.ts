import { THEME_PRESETS, deriveBrandHover, type PresetId } from '@/lib/themePresets'

/**
 * Previews a theme preset on the demo, in the visitor's browser only.
 *
 * Max's request (2026-09-11): *"later I want to have part of the demo — that
 * they see the catalogue of how colours CAN be changed."*
 *
 * ── Why this writes nothing to the database ──
 * `Plan-DemoFlowFixes` deferred this feature with one open question: can a
 * visitor actually *apply* a preset to the shared sandbox? On a single shared
 * tenant the answer is no — two visitors browsing at once would repaint each
 * other's site mid-sentence, which is the same collision problem Chunk 8 left
 * open for the setup wizard.
 *
 * So the preview is purely client-side. `app/layout.tsx` writes the tenant's
 * real theme into a `:root` rule in a `<style>` tag; setting the same custom
 * properties as *inline* styles on `document.documentElement` outranks that
 * rule, so the whole site repaints instantly and nothing on the server changes.
 * Every visitor gets their own preview, the demo tenant is never written to,
 * and the nightly reseed has nothing to undo.
 *
 * The choice is remembered per browser so it survives a reload and a hard
 * navigation — without that, the preview would evaporate the moment the
 * visitor clicked through to the wine shop, which is exactly where they would
 * want to see it.
 */

const STORAGE_KEY = 'vineworks-demo-theme'

/** The nine custom properties `app/layout.tsx` emits. Keep in step with it. */
function varsFor(presetId: PresetId): Record<string, string> {
  const t = THEME_PRESETS[presetId].tokens
  return {
    '--color-brand': t.brand,
    '--color-brand-hover': deriveBrandHover(t.brand),
    '--site-bg': t.bg,
    '--site-surface': t.surface,
    '--site-header': t.header,
    '--site-text': t.text,
    '--site-muted': t.muted,
    '--site-border': t.border,
    '--site-secondary': t.secondary,
  }
}

function isPresetId(v: string | null): v is PresetId {
  return !!v && v in THEME_PRESETS
}

/** The preset currently being previewed, or null for the winery's own theme. */
export function readPreviewedPreset(): PresetId | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return isPresetId(saved) ? saved : null
  } catch {
    // Private mode or blocked storage: no memory, but previewing still works
    // for as long as the visitor stays on the page.
    return null
  }
}

/** Paints a preset over the tenant's own theme and remembers it. */
export function applyPreviewPreset(presetId: PresetId) {
  const root = document.documentElement
  for (const [name, value] of Object.entries(varsFor(presetId))) {
    root.style.setProperty(name, value)
  }
  try { localStorage.setItem(STORAGE_KEY, presetId) } catch { /* preview is still live this session */ }
}

/** Drops the preview, returning the site to the winery's own theme. */
export function clearPreviewPreset() {
  const root = document.documentElement
  // Removing the inline property, rather than writing the tenant's values back,
  // is what makes this honest: the `:root` rule underneath is untouched, so
  // whatever the tenant's real theme is — now or after an edit — is what shows.
  for (const name of Object.keys(varsFor('cream'))) {
    root.style.removeProperty(name)
  }
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* nothing to forget */ }
}

/**
 * Re-applies a remembered preview. Call from an effect after mount, never
 * during render: the server has no `localStorage`, and a preview applied
 * during the first client render would be a hydration mismatch — the exact
 * class of bug Chunk 2 spent a session on.
 */
export function restorePreviewPreset(): PresetId | null {
  const saved = readPreviewedPreset()
  if (saved) applyPreviewPreset(saved)
  return saved
}
