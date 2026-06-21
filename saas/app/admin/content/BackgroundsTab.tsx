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

function BgPreview({ path, x, y, size, scale, pageKey, isMobile }: {
  path: string; x: number; y: number; size: string; scale?: number; pageKey: string; isMobile: boolean
}) {
  // Aspect ratio matching the live hero at the reference viewport for each context
  const aspectRatio = isMobile
    ? (pageKey === 'home' ? '390/520' : '390/300')  // portrait/square for mobile
    : (pageKey === 'home' ? '8/3'     : '1280/300') // landscape for desktop

  // Home mobile preview is portrait — constrain width and centre it
  const isPortrait = isMobile && pageKey === 'home'

  return (
    <div className={isPortrait ? 'flex flex-col items-center w-full' : 'w-full'}>
      <p className="text-xs mb-1.5 w-full" style={{ color: C.muted }}>
        Preview — {isMobile ? 'mobile' : 'desktop at 1280px viewport'}
      </p>

      {/* Nav bar shown above the hero, just like on the real site */}
      <div style={{
        width: isPortrait ? 260 : '100%',
        backgroundColor: '#f5efe6',
        border: `1px solid ${C.border}`,
        borderBottom: 'none',
        borderRadius: '8px 8px 0 0',
        padding: '0 12px',
        height: 32,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ width: 28, height: 8, backgroundColor: '#c8b090', borderRadius: 3 }} />
        {isMobile ? (
          <div style={{ width: 14, height: 10, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {[0,1,2].map(i => <div key={i} style={{ height: 2, backgroundColor: '#a89070', borderRadius: 1 }} />)}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {[44, 36, 44].map((w, i) => <div key={i} style={{ width: w, height: 6, backgroundColor: '#c8b090', borderRadius: 3 }} />)}
            <div style={{ width: 48, height: 18, backgroundColor: C.wine, borderRadius: 4, opacity: 0.8 }} />
          </div>
        )}
      </div>

      {/* Hero preview */}
      <div className="overflow-hidden relative" style={{
        aspectRatio,
        width: isPortrait ? 260 : '100%',
        borderRadius: '0 0 8px 8px',
        border: `1px solid ${C.border}`,
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: path ? `url(${path})` : 'none',
          backgroundColor: path ? undefined : '#e0d4c0',
          backgroundPosition: `${x}% ${y}%`,
          backgroundSize: size,
          transform: scale && scale !== 1 ? `scale(${scale})` : undefined,
          transformOrigin: `${x}% ${y}%`,
        }} />
        <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(28,16,8,0.32)' }} />

        {pageKey === 'home' ? (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 8, padding: isMobile ? '12px 10%' : '12px 20%',
          }}>
            <div style={{ backgroundColor: 'rgba(245,239,230,0.92)', borderRadius: 8, width: 84, height: 26 }} />
            <div style={{ backgroundColor: 'rgba(10,5,2,0.58)', borderRadius: 999, width: 64, height: 9 }} />
            <div style={{ backgroundColor: 'rgba(10,5,2,0.65)', borderRadius: 4, width: '65%', height: 24 }} />
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 8, marginTop: 4, alignItems: 'center' }}>
              <div style={{ backgroundColor: 'rgba(124,29,35,0.92)', border: '1.5px solid rgba(255,255,255,0.65)', borderRadius: 5, width: 80, height: 20 }} />
              <div style={{ backgroundColor: 'rgba(10,5,2,0.52)', border: '1.5px solid rgba(255,255,255,0.65)', borderRadius: 5, width: 80, height: 20 }} />
            </div>
          </div>
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', padding: '0 16px 14px 16px' }}>
            <div style={{
              backgroundColor: 'rgba(10,5,2,0.55)',
              backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
              borderRadius: 8, padding: '10px 18px',
            }}>
              <div style={{ backgroundColor: 'rgba(255,255,255,0.5)', borderRadius: 2, width: 52, height: 6, marginBottom: 8 }} />
              <div style={{ backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 2, width: 88, height: 12 }} />
            </div>
          </div>
        )}
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
          <BgPreview path={desktop.path} x={desktop.x} y={desktop.y} size="cover" scale={desktop.zoom / 100} pageKey={pageKey} isMobile={false} />
          <div className="space-y-4">
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
        </>
      ) : (
        <>
          <p className="text-xs" style={{ color: C.muted }}>
            Mobile always fills the screen first (no grey boxes), then zoom magnifies on top of that.
          </p>
          <ImagePicker selected={mobile.path} onSelect={path => setMobile(m => ({ ...m, path }))} />
          <BgPreview path={mobile.path} x={mobile.x} y={mobile.y} size="cover" scale={mobile.zoom / 100} pageKey={pageKey} isMobile={true} />
          <div className="space-y-4">
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
