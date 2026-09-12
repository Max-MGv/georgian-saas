'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import { THEME_PRESETS, type PresetId, type ThemeCategory } from '@/lib/themePresets'
import { DEMO, DEMO_FX } from '@/lib/demoTheme'
import {
  applyPreviewPreset,
  clearPreviewPreset,
  restorePreviewPreset,
} from '@/lib/demoThemePreview'

/**
 * The theme-preset catalogue — Max's request, 2026-09-11: *"later I want to
 * have part of the demo — that they see the catalogue of how colours CAN be
 * changed."*
 *
 * Sixteen presets, each applied to the **real site behind the panel** the
 * instant it is clicked. That is the whole argument: a swatch grid proves
 * nothing, but watching the winery's actual booking form repaint in Midnight
 * Cellar answers "can it look like *mine*?" in one click.
 *
 * Writes nothing to the database — see `lib/demoThemePreview.ts` for why that
 * is a decision rather than a shortcut. The panel says so plainly too, because
 * a visitor who thinks they have just recoloured a stranger's live website will
 * stop clicking.
 *
 * Rendered by `DemoExplore` rather than mounted in the three layouts
 * alongside the other demo components. It is that panel's "Branding and theme
 * presets" row opening in place, not an independent surface, and one fewer
 * mount point is one fewer thing for [[MaintenanceNotes]] §16 to fall out of
 * step on.
 */

export const THEME_CATALOGUE_EVENT = 'vineworks-demo-open-theme-catalogue'

const ORDER: ThemeCategory[] = ['light', 'dark']
const GROUP_LABEL: Record<ThemeCategory, string> = {
  light: 'Light',
  dark: 'Dark',
}

export default function DemoThemeCatalogue() {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState<PresetId | null>(null)
  const [mounted, setMounted] = useState(false)

  // After mount, never during render: the server has no localStorage, and
  // branching on it in the first client render is a hydration mismatch.
  useEffect(() => {
    setMounted(true)
    setActive(restorePreviewPreset())
  }, [])

  useEffect(() => {
    function onOpen() { setOpen(true) }
    window.addEventListener(THEME_CATALOGUE_EVENT, onOpen)
    return () => window.removeEventListener(THEME_CATALOGUE_EVENT, onOpen)
  }, [])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const choose = useCallback((id: PresetId) => {
    applyPreviewPreset(id)
    setActive(id)
  }, [])

  const reset = useCallback(() => {
    clearPreviewPreset()
    setActive(null)
  }, [])

  if (!mounted || !open) return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-theme-title"
      onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}
      style={{
        position: 'fixed', inset: 0, zIndex: 190,
        backgroundColor: DEMO_FX.scrim,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px', overflowY: 'auto',
      }}
    >
      <div
        style={{
          width: '100%', maxWidth: '760px', margin: 'auto',
          backgroundColor: DEMO.ground, color: DEMO.text,
          border: `1px solid ${DEMO.border}`, borderRadius: '18px',
          padding: 'clamp(20px, 4vw, 32px)', boxShadow: DEMO_FX.shadowLg,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
          <div style={{ minWidth: 0 }}>
            <h2 id="demo-theme-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
              Sixteen looks, one click each
            </h2>
            <p style={{ margin: '8px 0 0', color: DEMO.muted, fontSize: '0.85rem', lineHeight: 1.55, maxWidth: '58ch' }}>
              Pick one and the winery&apos;s site behind this panel changes immediately — the real
              pages, not a mock-up. Your own colours can be set exactly too; these are the
              starting points.
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close"
            style={{
              background: 'none', border: 'none', color: DEMO.muted,
              fontSize: '1.1rem', lineHeight: 1, cursor: 'pointer', padding: '2px 6px', flexShrink: 0,
            }}
          >
            ✕
          </button>
        </div>

        {ORDER.map(category => (
          <div key={category} style={{ marginTop: '16px' }}>
            <h3 style={{
              margin: '0 0 10px', color: DEMO.muted, fontSize: '0.66rem',
              fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
            }}>
              {GROUP_LABEL[category]}
            </h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: '8px',
            }}>
              {(Object.keys(THEME_PRESETS) as PresetId[])
                .filter(id => THEME_PRESETS[id].category === category)
                .map(id => {
                  const p = THEME_PRESETS[id]
                  const selected = active === id
                  return (
                    <button
                      key={id}
                      onClick={() => choose(id)}
                      aria-pressed={selected}
                      style={{
                        textAlign: 'left', font: 'inherit', cursor: 'pointer',
                        backgroundColor: selected ? DEMO.raised : DEMO.surface,
                        color: DEMO.text,
                        border: `1px solid ${selected ? DEMO.accent : DEMO.border}`,
                        borderRadius: '12px', padding: '8px',
                        display: 'flex', flexDirection: 'column', gap: '8px',
                      }}
                    >
                      {/* The swatch is the preset's own page: its background,
                          a surface card on top, and a brand-coloured button —
                          the three colours a visitor actually judges. */}
                      <span
                        aria-hidden="true"
                        style={{
                          display: 'block', height: '40px', borderRadius: '7px',
                          backgroundColor: p.tokens.bg,
                          border: `1px solid ${p.tokens.border}`,
                          position: 'relative', overflow: 'hidden',
                        }}
                      >
                        <span style={{
                          position: 'absolute', left: 6, top: 6, right: 6, height: '15px',
                          borderRadius: '4px', backgroundColor: p.tokens.surface,
                          border: `1px solid ${p.tokens.border}`,
                        }} />
                        <span style={{
                          position: 'absolute', left: 6, bottom: 6, width: '38px', height: '10px',
                          borderRadius: '999px', backgroundColor: p.tokens.brand,
                        }} />
                        <span style={{
                          position: 'absolute', right: 6, bottom: 7, width: '24px', height: '8px',
                          borderRadius: '3px', backgroundColor: p.tokens.secondary,
                        }} />
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', fontWeight: 600 }}>
                        {selected && <Check aria-hidden="true" size={13} strokeWidth={2.4} style={{ color: DEMO.accent, flexShrink: 0 }} />}
                        {p.name}
                      </span>
                    </button>
                  )
                })}
            </div>
          </div>
        ))}

        <div style={{
          marginTop: '18px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap',
        }}>
          <button
            onClick={reset}
            disabled={active === null}
            style={{
              backgroundColor: active === null ? 'transparent' : DEMO.accentSolid,
              color: active === null ? DEMO.muted : DEMO_FX.onAccent,
              border: `1px solid ${active === null ? DEMO.border : DEMO.accentSolid}`,
              borderRadius: '999px', padding: '9px 18px',
              fontSize: '0.84rem', fontWeight: 600,
              cursor: active === null ? 'default' : 'pointer',
            }}
          >
            Back to this winery&apos;s own colours
          </button>
          <span style={{ color: DEMO.muted, fontSize: '0.74rem', maxWidth: '46ch' }}>
            This preview is yours alone — it changes nothing for anyone else looking at the demo,
            and nothing is saved.
          </span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
