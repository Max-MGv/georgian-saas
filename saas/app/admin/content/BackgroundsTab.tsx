'use client'

import { useState } from 'react'
import { updateSetting } from '@/app/actions/settings'

const IMAGES = [
  { path: '/images/winery1.jpg',        label: 'Winery 1' },
  { path: '/images/winery2.jpg',        label: 'Winery 2' },
  { path: '/images/winery3.jpg',        label: 'Winery 3' },
  { path: '/images/slider/hero1.jpg',   label: 'Hero 1' },
  { path: '/images/slider/hero2.jpg',   label: 'Hero 2' },
  { path: '/images/slider/hero3.jpg',   label: 'Hero 3' },
  { path: '/images/gallery/gallery1.jpg', label: 'Gallery 1' },
  { path: '/images/gallery/gallery2.jpg', label: 'Gallery 2' },
]

const C = {
  text: '#1c1008', muted: '#6b5a47', faint: '#a89070',
  border: '#e0d4c0', bg: '#fff9f3', wine: '#7c1d23', rust: '#8b4513',
}

type DesktopBg = { path: string; x: number; y: number; zoom: number }
type MobileBg  = { path: string; x: number; y: number; zoom: number }

function ImagePicker({ selected, onSelect }: { selected: string; onSelect: (path: string) => void }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: C.rust }}>
        Choose image
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {IMAGES.map(img => (
          <button key={img.path} type="button"
            onClick={() => onSelect(img.path)}
            className="relative rounded-lg overflow-hidden border-2 transition-all"
            style={{ aspectRatio: '16/9', borderColor: selected === img.path ? C.wine : C.border }}>
            <img src={img.path} alt={img.label} className="w-full h-full object-cover" />
            {selected === img.path && (
              <div className="absolute inset-0 flex items-center justify-center"
                style={{ backgroundColor: 'rgba(124,29,35,0.3)' }}>
                <svg className="w-5 h-5" fill="white" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}

function BgPreview({ path, x, y, size, scale }: { path: string; x: number; y: number; size: string; scale?: number }) {
  return (
    <div className="flex-shrink-0">
      <p className="text-xs mb-1.5" style={{ color: C.muted }}>Preview</p>
      <div className="rounded-lg overflow-hidden relative" style={{ width: 200, height: 128 }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: path ? `url(${path})` : 'none',
          backgroundColor: path ? undefined : '#e0d4c0',
          backgroundPosition: `${x}% ${y}%`,
          backgroundSize: size,
          transform: scale && scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: `${x}% ${y}%`,
        }} />
        <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(28,16,8,0.52)' }} />
        <div style={{ position: 'relative', padding: '18px 14px', textAlign: 'center', color: 'white' }}>
          <div style={{ fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', opacity: 0.7, marginBottom: 4 }}>
            Kakheti, Georgia
          </div>
          <div style={{ fontSize: 12, fontWeight: 700 }}>Nikalas Marani</div>
        </div>
      </div>
    </div>
  )
}

function PageBgEditor({ pageKey, label, initialDesktop, initialMobile }: {
  pageKey: string
  label: string
  initialDesktop: DesktopBg
  initialMobile: MobileBg
}) {
  const [mode, setMode]       = useState<'desktop' | 'mobile'>('desktop')
  const [desktop, setDesktop] = useState<DesktopBg>(initialDesktop)
  const [mobile, setMobile]   = useState<MobileBg>(initialMobile)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)

  async function save() {
    setSaving(true)
    if (mode === 'desktop') {
      await updateSetting(`${pageKey}_hero_bg_path`, desktop.path)
      await updateSetting(`${pageKey}_hero_bg_x`,    String(desktop.x))
      await updateSetting(`${pageKey}_hero_bg_y`,    String(desktop.y))
      await updateSetting(`${pageKey}_hero_bg_zoom`, String(desktop.zoom))
    } else {
      await updateSetting(`${pageKey}_hero_bg_mobile_path`, mobile.path)
      await updateSetting(`${pageKey}_hero_bg_mobile_x`,    String(mobile.x))
      await updateSetting(`${pageKey}_hero_bg_mobile_y`,    String(mobile.y))
      await updateSetting(`${pageKey}_hero_bg_mobile_zoom`, String(mobile.zoom))
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function clear() {
    setSaving(true)
    if (mode === 'desktop') {
      await updateSetting(`${pageKey}_hero_bg_path`, '')
      await updateSetting(`${pageKey}_hero_bg_x`,    '50')
      await updateSetting(`${pageKey}_hero_bg_y`,    '50')
      await updateSetting(`${pageKey}_hero_bg_zoom`, '110')
      setDesktop({ path: '', x: 50, y: 50, zoom: 110 })
    } else {
      await updateSetting(`${pageKey}_hero_bg_mobile_path`, '')
      await updateSetting(`${pageKey}_hero_bg_mobile_x`,    '50')
      await updateSetting(`${pageKey}_hero_bg_mobile_y`,    '50')
      await updateSetting(`${pageKey}_hero_bg_mobile_zoom`, '100')
      setMobile({ path: '', x: 50, y: 50, zoom: 100 })
    }
    setSaving(false)
  }

  const activePath = mode === 'desktop' ? desktop.path : mobile.path
  const hasImage   = !!activePath

  return (
    <div className="rounded-xl border p-6 space-y-5" style={{ borderColor: C.border, backgroundColor: C.bg }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-base" style={{ color: C.text }}>{label}</h3>
        {hasImage && (
          <button type="button" onClick={clear} disabled={saving}
            className="text-xs px-3 py-1 rounded-md border transition-opacity hover:opacity-70 disabled:opacity-40"
            style={{ borderColor: C.border, color: C.faint }}>
            Remove image
          </button>
        )}
      </div>

      {/* Mobile / Desktop toggle */}
      <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ backgroundColor: C.border }}>
        {(['desktop', 'mobile'] as const).map(m => (
          <button key={m} type="button"
            onClick={() => setMode(m)}
            className="px-4 py-1.5 rounded-md text-xs font-semibold transition-all"
            style={{
              backgroundColor: mode === m ? C.wine : 'transparent',
              color: mode === m ? 'white' : C.muted,
            }}>
            {m === 'desktop' ? '🖥 Desktop' : '📱 Mobile'}
          </button>
        ))}
      </div>

      {mode === 'desktop' ? (
        <>
          <ImagePicker selected={desktop.path} onSelect={path => setDesktop(d => ({ ...d, path }))} />
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <div className="flex-1 space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1.5" style={{ color: C.muted }}>
                  <span>Horizontal position</span><span>{desktop.x}%</span>
                </div>
                <input type="range" min={0} max={100} value={desktop.x}
                  onChange={e => setDesktop(d => ({ ...d, x: +e.target.value }))}
                  className="w-full" style={{ accentColor: C.wine }} />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1.5" style={{ color: C.muted }}>
                  <span>Vertical position</span><span>{desktop.y}%</span>
                </div>
                <input type="range" min={0} max={100} value={desktop.y}
                  onChange={e => setDesktop(d => ({ ...d, y: +e.target.value }))}
                  className="w-full" style={{ accentColor: C.wine }} />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1.5" style={{ color: C.muted }}>
                  <span>Zoom</span><span>{desktop.zoom}%</span>
                </div>
                <input type="range" min={100} max={200} value={desktop.zoom}
                  onChange={e => setDesktop(d => ({ ...d, zoom: +e.target.value }))}
                  className="w-full" style={{ accentColor: C.wine }} />
              </div>
            </div>
            <BgPreview path={desktop.path} x={desktop.x} y={desktop.y} size="cover" scale={desktop.zoom / 100} />
          </div>
        </>
      ) : (
        <>
          <p className="text-xs" style={{ color: C.muted }}>
            Mobile always fills the screen first (no grey boxes), then zoom magnifies on top of that.
          </p>
          <ImagePicker selected={mobile.path} onSelect={path => setMobile(m => ({ ...m, path }))} />
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <div className="flex-1 space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1.5" style={{ color: C.muted }}>
                  <span>Horizontal position</span><span>{mobile.x}%</span>
                </div>
                <input type="range" min={0} max={100} value={mobile.x}
                  onChange={e => setMobile(m => ({ ...m, x: +e.target.value }))}
                  className="w-full" style={{ accentColor: C.wine }} />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1.5" style={{ color: C.muted }}>
                  <span>Vertical position</span><span>{mobile.y}%</span>
                </div>
                <input type="range" min={0} max={100} value={mobile.y}
                  onChange={e => setMobile(m => ({ ...m, y: +e.target.value }))}
                  className="w-full" style={{ accentColor: C.wine }} />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1.5" style={{ color: C.muted }}>
                  <span>Zoom</span><span>{mobile.zoom}%</span>
                </div>
                <input type="range" min={100} max={200} value={mobile.zoom}
                  onChange={e => setMobile(m => ({ ...m, zoom: +e.target.value }))}
                  className="w-full" style={{ accentColor: C.wine }} />
              </div>
            </div>
            <BgPreview path={mobile.path} x={mobile.x} y={mobile.y} size="cover" scale={mobile.zoom / 100} />
          </div>
        </>
      )}

      <button type="button" onClick={save} disabled={saving || !hasImage}
        className="px-6 py-2 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-50"
        style={{ backgroundColor: C.wine }}>
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
      </button>
    </div>
  )
}

type Props = { settings: Record<string, string> }

const D_DEFAULTS: DesktopBg = { path: '', x: 50, y: 50, zoom: 110 }
const M_DEFAULTS: MobileBg  = { path: '', x: 50, y: 50, zoom: 100 }

function getDesktopInitial(settings: Record<string, string>, key: string): DesktopBg {
  return {
    path: settings[`${key}_hero_bg_path`] ?? D_DEFAULTS.path,
    x:    parseInt(settings[`${key}_hero_bg_x`]    ?? '') || D_DEFAULTS.x,
    y:    parseInt(settings[`${key}_hero_bg_y`]    ?? '') || D_DEFAULTS.y,
    zoom: parseInt(settings[`${key}_hero_bg_zoom`] ?? '') || D_DEFAULTS.zoom,
  }
}

function getMobileInitial(settings: Record<string, string>, key: string): MobileBg {
  return {
    path: settings[`${key}_hero_bg_mobile_path`] ?? M_DEFAULTS.path,
    x:    parseInt(settings[`${key}_hero_bg_mobile_x`]    ?? '') || M_DEFAULTS.x,
    y:    parseInt(settings[`${key}_hero_bg_mobile_y`]    ?? '') || M_DEFAULTS.y,
    zoom: parseInt(settings[`${key}_hero_bg_mobile_zoom`] ?? '') || M_DEFAULTS.zoom,
  }
}

export default function BackgroundsTab({ settings }: Props) {
  const pages = [
    { key: 'home',    label: 'Home page hero' },
    { key: 'about',   label: 'About page hero' },
    { key: 'contact', label: 'Contact page hero' },
  ]

  return (
    <div className="space-y-6 max-w-2xl">
      <p className="text-sm" style={{ color: C.muted }}>
        Choose a background image for each page hero. Switch between Desktop and Mobile to set each independently.
      </p>
      {pages.map(p => (
        <PageBgEditor
          key={p.key}
          pageKey={p.key}
          label={p.label}
          initialDesktop={getDesktopInitial(settings, p.key)}
          initialMobile={getMobileInitial(settings, p.key)}
        />
      ))}
    </div>
  )
}
