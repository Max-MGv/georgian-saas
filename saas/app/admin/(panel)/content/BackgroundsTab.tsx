'use client'

import { useEffect, useRef, useState } from 'react'
import { updateSetting } from '@/app/actions/settings'
import { uploadBgImage, deleteBgImage } from '@/app/actions/uploadImage'
import { adminT } from '@/lib/adminT'

const BUILTIN_IMAGES = [
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
  border: '#e0d4c0', bg: '#fff9f3', wine: 'var(--color-brand)', rust: '#8b4513',
}

// Extracts the bucket-relative storage path from a Supabase public URL
// e.g. https://xxx.supabase.co/.../backgrounds/tenantId/file.webp → "tenantId/file.webp"
function storagePathFromUrl(url: string) {
  const marker = '/backgrounds/'
  const idx = url.indexOf(marker)
  if (idx === -1) return url.split('/').pop() ?? ''
  return url.slice(idx + marker.length)
}

function ImagePicker({
  selected, onSelect, extraImages, onUpload, onDelete, adminLocale,
}: {
  selected: string
  onSelect: (path: string) => void
  extraImages: string[]
  onUpload: (url: string) => void
  onDelete: (url: string) => void
  adminLocale: string
}) {
  const at = (key: string) => adminT(adminLocale, key)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [hoveredUrl, setHoveredUrl] = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const url = await uploadBgImage(fd)
      onUpload(url)
      onSelect(url)
    } catch (err) {
      alert(`${adminT(adminLocale, 'wines.uploadFailed')} ` + (err instanceof Error ? err.message : adminT(adminLocale, 'wines.unknownError')))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleDelete(url: string, e: React.MouseEvent) {
    e.stopPropagation()
    const storagePath = storagePathFromUrl(url)
    if (!storagePath) return
    await deleteBgImage(storagePath)
    onDelete(url)
    // If deleted image was selected, clear selection
    if (selected === url) onSelect('')
  }

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: C.rust }}>
        {at('backgrounds.chooseImage')}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {/* Built-in images */}
        {BUILTIN_IMAGES.map(img => (
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

        {/* Uploaded images — with hover X */}
        {extraImages.map(url => (
          <div key={url} className="relative"
            onMouseEnter={() => setHoveredUrl(url)}
            onMouseLeave={() => setHoveredUrl(null)}>
            <button type="button"
              onClick={() => onSelect(url)}
              className="relative w-full rounded-lg overflow-hidden border-2 transition-all"
              style={{ aspectRatio: '16/9', borderColor: selected === url ? C.wine : C.border }}>
              <img src={url} alt={storagePathFromUrl(url).split('/').pop() ?? 'Uploaded image'} className="w-full h-full object-cover" />
              {selected === url && (
                <div className="absolute inset-0 flex items-center justify-center"
                  style={{ backgroundColor: 'rgba(124,29,35,0.3)' }}>
                  <svg className="w-5 h-5" fill="white" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </button>
            {hoveredUrl === url && (
              <button type="button"
                onClick={(e) => handleDelete(url, e)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center text-white transition-opacity hover:opacity-80"
                style={{ backgroundColor: 'rgba(0,0,0,0.6)', fontSize: 12, lineHeight: 1 }}
                title={at('backgrounds.removeImage')}>
                ×
              </button>
            )}
          </div>
        ))}

        {/* Upload button */}
        <button type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-colors hover:border-opacity-70 disabled:opacity-50"
          style={{ aspectRatio: '16/9', borderColor: C.border, color: C.faint }}>
          {uploading ? (
            <span className="text-xs">{at('backgrounds.uploading')}</span>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <span className="text-xs">{at('backgrounds.upload')}</span>
            </>
          )}
        </button>

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </div>
    </div>
  )
}

function BgPreview({ path, x, y, size, scale, pageKey, isMobile, adminLocale }: {
  path: string; x: number; y: number; size: string; scale?: number; pageKey: string; isMobile: boolean; adminLocale: string
}) {
  const at = (key: string, vars?: Record<string, string | number>) => adminT(adminLocale, key, vars)
  // Mirror the actual site viewport width so cover-scaling crops identically
  const [vw, setVw] = useState(1280)
  useEffect(() => {
    setVw(window.innerWidth)
    const onResize = () => setVw(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const heroHeight = pageKey === 'home' ? 480 : 300
  const aspectRatio = isMobile
    ? (pageKey === 'home' ? '390/520' : '390/300')
    : `${vw}/${heroHeight}`

  const isPortrait = isMobile && pageKey === 'home'

  return (
    <div className={isPortrait ? 'flex flex-col items-center w-full' : 'w-full'}>
      <p className="text-xs mb-1.5 w-full" style={{ color: C.muted }}>
        {at('backgrounds.previewCaption', { viewport: isMobile ? at('backgrounds.previewMobile') : at('backgrounds.previewDesktop', { vw }) })}
      </p>

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

function bgEqual(a: DesktopBg | MobileBg, b: DesktopBg | MobileBg) {
  return a.path === b.path && a.x === b.x && a.y === b.y && a.zoom === b.zoom
}

function PageBgEditor({ pageKey, label, initialDesktop, initialMobile, extraImages, onUpload, onDelete, adminLocale }: {
  pageKey: string
  label: string
  initialDesktop: DesktopBg
  initialMobile: MobileBg
  extraImages: string[]
  onUpload: (url: string) => void
  onDelete: (url: string) => void
  adminLocale: string
}) {
  const at = (key: string) => adminT(adminLocale, key)
  const [mode, setMode]       = useState<'desktop' | 'mobile'>('desktop')
  const [desktop, setDesktop] = useState<DesktopBg>(initialDesktop)
  const [mobile, setMobile]   = useState<MobileBg>(initialMobile)
  const [saving, setSaving]   = useState(false)

  // Track the last-saved state so we know when preview differs from live site
  const [savedDesktop, setSavedDesktop] = useState<DesktopBg>(initialDesktop)
  const [savedMobile,  setSavedMobile]  = useState<MobileBg>(initialMobile)

  const isDirty = mode === 'desktop' ? !bgEqual(desktop, savedDesktop) : !bgEqual(mobile, savedMobile)

  async function save() {
    setSaving(true)
    if (mode === 'desktop') {
      await updateSetting(`${pageKey}_hero_bg_path`, desktop.path)
      await updateSetting(`${pageKey}_hero_bg_x`,    String(desktop.x))
      await updateSetting(`${pageKey}_hero_bg_y`,    String(desktop.y))
      await updateSetting(`${pageKey}_hero_bg_zoom`, String(desktop.zoom))
      setSavedDesktop({ ...desktop })
    } else {
      await updateSetting(`${pageKey}_hero_bg_mobile_path`, mobile.path)
      await updateSetting(`${pageKey}_hero_bg_mobile_x`,    String(mobile.x))
      await updateSetting(`${pageKey}_hero_bg_mobile_y`,    String(mobile.y))
      await updateSetting(`${pageKey}_hero_bg_mobile_zoom`, String(mobile.zoom))
      setSavedMobile({ ...mobile })
    }
    setSaving(false)
  }

  async function clear() {
    setSaving(true)
    if (mode === 'desktop') {
      await updateSetting(`${pageKey}_hero_bg_path`, '')
      await updateSetting(`${pageKey}_hero_bg_x`,    '50')
      await updateSetting(`${pageKey}_hero_bg_y`,    '50')
      await updateSetting(`${pageKey}_hero_bg_zoom`, '110')
      const cleared = { path: '', x: 50, y: 50, zoom: 110 }
      setDesktop(cleared)
      setSavedDesktop(cleared)
    } else {
      await updateSetting(`${pageKey}_hero_bg_mobile_path`, '')
      await updateSetting(`${pageKey}_hero_bg_mobile_x`,    '50')
      await updateSetting(`${pageKey}_hero_bg_mobile_y`,    '50')
      await updateSetting(`${pageKey}_hero_bg_mobile_zoom`, '100')
      const cleared = { path: '', x: 50, y: 50, zoom: 100 }
      setMobile(cleared)
      setSavedMobile(cleared)
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
            {at('backgrounds.removeImage')}
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
            {m === 'desktop' ? at('backgrounds.desktop') : at('backgrounds.mobile')}
          </button>
        ))}
      </div>

      {mode === 'desktop' ? (
        <>
          <ImagePicker
            selected={desktop.path}
            onSelect={path => setDesktop(d => ({ ...d, path }))}
            extraImages={extraImages}
            onUpload={onUpload}
            onDelete={onDelete}
            adminLocale={adminLocale}
          />
          <BgPreview path={desktop.path} x={desktop.x} y={desktop.y} size="cover" scale={desktop.zoom / 100} pageKey={pageKey} isMobile={false} adminLocale={adminLocale} />
          <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1.5" style={{ color: C.muted }}>
                  <span>{at('backgrounds.horizontalPosition')}</span><span>{desktop.x}%</span>
                </div>
                <input type="range" min={0} max={100} value={desktop.x}
                  onChange={e => setDesktop(d => ({ ...d, x: +e.target.value }))}
                  className="w-full" style={{ accentColor: C.wine }} />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1.5" style={{ color: C.muted }}>
                  <span>{at('backgrounds.verticalPosition')}</span><span>{desktop.y}%</span>
                </div>
                <input type="range" min={0} max={100} value={desktop.y}
                  onChange={e => setDesktop(d => ({ ...d, y: +e.target.value }))}
                  className="w-full" style={{ accentColor: C.wine }} />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1.5" style={{ color: C.muted }}>
                  <span>{at('backgrounds.zoom')}</span><span>{desktop.zoom}%</span>
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
            {at('backgrounds.mobileHint')}
          </p>
          <ImagePicker
            selected={mobile.path}
            onSelect={path => setMobile(m => ({ ...m, path }))}
            extraImages={extraImages}
            onUpload={onUpload}
            onDelete={onDelete}
            adminLocale={adminLocale}
          />
          <BgPreview path={mobile.path} x={mobile.x} y={mobile.y} size="cover" scale={mobile.zoom / 100} pageKey={pageKey} isMobile={true} adminLocale={adminLocale} />
          <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1.5" style={{ color: C.muted }}>
                  <span>{at('backgrounds.horizontalPosition')}</span><span>{mobile.x}%</span>
                </div>
                <input type="range" min={0} max={100} value={mobile.x}
                  onChange={e => setMobile(m => ({ ...m, x: +e.target.value }))}
                  className="w-full" style={{ accentColor: C.wine }} />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1.5" style={{ color: C.muted }}>
                  <span>{at('backgrounds.verticalPosition')}</span><span>{mobile.y}%</span>
                </div>
                <input type="range" min={0} max={100} value={mobile.y}
                  onChange={e => setMobile(m => ({ ...m, y: +e.target.value }))}
                  className="w-full" style={{ accentColor: C.wine }} />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1.5" style={{ color: C.muted }}>
                  <span>{at('backgrounds.zoom')}</span><span>{mobile.zoom}%</span>
                </div>
                <input type="range" min={100} max={200} value={mobile.zoom}
                  onChange={e => setMobile(m => ({ ...m, zoom: +e.target.value }))}
                  className="w-full" style={{ accentColor: C.wine }} />
              </div>
          </div>
        </>
      )}

      {isDirty && (
        <div className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg"
          style={{ backgroundColor: 'rgba(180,120,0,0.10)', border: '1px solid rgba(180,120,0,0.30)', color: '#7a5200' }}>
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          {at('backgrounds.unsavedChanges')}
        </div>
      )}
      <button type="button" onClick={save} disabled={saving || !hasImage}
        className="px-6 py-2 rounded-lg text-sm font-semibold text-white transition-all disabled:opacity-50"
        style={{
          backgroundColor: C.wine,
          boxShadow: isDirty ? '0 0 0 2px rgba(124,29,35,0.35)' : 'none',
        }}>
        {saving ? at('backgrounds.saving') : isDirty ? at('backgrounds.saveToApply') : at('backgrounds.savedLive')}
      </button>
    </div>
  )
}

type DesktopBg = { path: string; x: number; y: number; zoom: number }
type MobileBg  = { path: string; x: number; y: number; zoom: number }

type Props = { settings: Record<string, string>; uploadedImages: string[]; adminLocale: string }

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

export default function BackgroundsTab({ settings, uploadedImages: initialUploaded, adminLocale }: Props) {
  const at = (key: string) => adminT(adminLocale, key)
  const [extraImages, setExtraImages] = useState<string[]>(initialUploaded)

  function handleUpload(url: string) {
    setExtraImages(prev => prev.includes(url) ? prev : [...prev, url])
  }

  function handleDelete(url: string) {
    setExtraImages(prev => prev.filter(u => u !== url))
  }

  const pages = [
    { key: 'home',    label: at('backgrounds.page.home') },
    { key: 'about',   label: at('backgrounds.page.about') },
    { key: 'contact', label: at('backgrounds.page.contact') },
  ]

  return (
    <div className="space-y-6 max-w-2xl">
      <p className="text-sm" style={{ color: C.muted }}>
        {at('backgrounds.intro')}
      </p>
      {pages.map(p => (
        <PageBgEditor
          key={p.key}
          pageKey={p.key}
          label={p.label}
          initialDesktop={getDesktopInitial(settings, p.key)}
          initialMobile={getMobileInitial(settings, p.key)}
          extraImages={extraImages}
          onUpload={handleUpload}
          onDelete={handleDelete}
          adminLocale={adminLocale}
        />
      ))}
    </div>
  )
}
