'use client'

import { useRef, useState, useTransition } from 'react'
import {
  createWine, updateWine, deleteWine, assignWineImage,
  createVintage, updateVintage, deleteVintage, assignVintageImage, toggleVintageActive,
} from '@/app/actions/wines'
import { uploadWineImage, deleteWineImage } from '@/app/actions/uploadImage'
import { adminT } from '@/lib/adminT'

const C = {
  text: '#1c1008', muted: '#6b5a47', faint: '#a89070',
  border: '#e0d4c0', bg: '#fff9f3', wine: 'var(--color-brand)',
}

const PRODUCT_IMAGES = [
  { path: '/images/products/george.png',  label: 'george' },
  { path: '/images/products/john.png',    label: 'john' },
  { path: '/images/products/uwawo.png',   label: 'uwawo' },
  { path: '/images/products/axoebi.png',  label: 'axoebi' },
  { path: '/images/products/wine5.png',   label: 'wine5' },
  { path: '/images/products/qisi.png',    label: 'qisi' },
]

type WineTypeValue = 'RED' | 'WHITE' | 'AMBER' | 'ROSE'
type SweetnessValue = 'DRY' | 'SEMI_DRY' | 'SEMI_SWEET' | 'SWEET'

const WINE_TYPES: WineTypeValue[] = ['RED', 'WHITE', 'AMBER', 'ROSE']
const SWEETNESS_LEVELS: SweetnessValue[] = ['DRY', 'SEMI_DRY', 'SEMI_SWEET', 'SWEET']

type Vintage = {
  id: string; year: number; price: number; imagePath: string | null
  active: boolean; sortOrder: number
  wineType: WineTypeValue | null; sweetness: SweetnessValue | null
  sparkling: boolean | null; alcoholLevel: number | null
}

type Wine = {
  id: string; name: string; nameKa: string | null; wineType: WineTypeValue; sweetness: SweetnessValue
  sparkling: boolean; alcoholLevel: number | null; description: string | null
  color: string; imagePath: string | null; sortOrder: number; active: boolean
  vintages: Vintage[]
}

type ProductDraft = {
  name: string; nameKa: string; wineType: WineTypeValue; sweetness: SweetnessValue
  sparkling: boolean; alcoholLevel: string; description: string; color: string
}

// wineType/sweetness: '' means "not specified". sparkling: '' = not specified,
// 'true'/'false' = specified either way — kept distinct from an empty string
// so "unset" and "explicitly not sparkling" never collapse into each other.
type VintageDraft = {
  year: string; price: string; active: boolean
  wineType: WineTypeValue | ''; sweetness: SweetnessValue | ''
  sparkling: '' | 'true' | 'false'; alcoholLevel: string
}

const BLANK_PRODUCT: ProductDraft = {
  name: '', nameKa: '', wineType: 'RED', sweetness: 'DRY', sparkling: false,
  alcoholLevel: '', description: '', color: '#7c1d23',
}

const BLANK_VINTAGE: VintageDraft = {
  year: String(new Date().getFullYear()), price: '', active: true,
  wineType: '', sweetness: '', sparkling: '', alcoholLevel: '',
}

const inputCls = 'w-full rounded-lg border px-3 py-2 text-sm outline-none'
const inputStyle = { backgroundColor: '#fffdf9', borderColor: C.border, color: C.text }

function ColorSwatch({ color }: { color: string }) {
  return <span className="inline-block w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: '#f5efe6', color: C.muted }}>
      {children}
    </span>
  )
}

// Icon set matches the orders admin page (OrdersTable.tsx) for consistency across the panel.
const iconProps = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

function IconEye() {
  return (
    <svg {...iconProps}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function IconEyeOff() {
  return (
    <svg {...iconProps}>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

function IconPencil() {
  return (
    <svg {...iconProps}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg {...iconProps}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg {...iconProps}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function IconX() {
  return (
    <svg {...iconProps}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

// Extracts the bucket-relative storage path from a Supabase public URL
// e.g. https://xxx.supabase.co/.../wine-photos/tenantId/file.webp → "tenantId/file.webp"
function storagePathFromUrl(url: string) {
  const marker = '/wine-photos/'
  const idx = url.indexOf(marker)
  return idx === -1 ? '' : url.slice(idx + marker.length)
}

function ImagePickerGrid({ current, disabled, onPick, onClear, extraImages, onUpload, onDelete, locale }: {
  current: string | null; disabled: boolean
  onPick: (path: string) => void; onClear: () => void
  extraImages: string[]
  onUpload: (urls: string[]) => void
  onDelete: (url: string) => void
  locale: string
}) {
  const at = (key: string) => adminT(locale, key)
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [hoveredUrl, setHoveredUrl] = useState<string | null>(null)

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setUploading(true)
    try {
      const urls = await Promise.all(files.map(async file => {
        const fd = new FormData()
        fd.append('file', file)
        return uploadWineImage(fd)
      }))
      onUpload(urls)
    } catch (err) {
      alert(at('wines.uploadFailed') + ' ' + (err instanceof Error ? err.message : at('wines.unknownError')))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleDeleteUploaded(url: string, e: React.MouseEvent) {
    e.stopPropagation()
    const storagePath = storagePathFromUrl(url)
    if (!storagePath) return
    await deleteWineImage(storagePath)
    onDelete(url)
    if (current === url) onClear()
  }

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {PRODUCT_IMAGES.map(img => {
        const isActive = current === img.path
        return (
          <button
            key={img.path}
            type="button"
            onClick={() => onPick(img.path)}
            disabled={disabled}
            title={img.label}
            className="rounded-lg border overflow-hidden transition-all"
            style={{
              width: 52, height: 52,
              borderColor: isActive ? C.wine : C.border,
              borderWidth: isActive ? 2 : 1,
              backgroundColor: '#faf6f0',
            }}
          >
            <img src={img.path} alt={img.label} className="w-full h-full object-contain" />
          </button>
        )
      })}

      {extraImages.map(url => {
        const isActive = current === url
        return (
          <div key={url} className="relative" onMouseEnter={() => setHoveredUrl(url)} onMouseLeave={() => setHoveredUrl(null)}>
            <button
              type="button"
              onClick={() => onPick(url)}
              disabled={disabled}
              title={at('wines.uploadedPhoto')}
              className="rounded-lg border overflow-hidden transition-all"
              style={{
                width: 52, height: 52,
                borderColor: isActive ? C.wine : C.border,
                borderWidth: isActive ? 2 : 1,
                backgroundColor: '#faf6f0',
              }}
            >
              <img src={url} alt="Uploaded" className="w-full h-full object-cover" />
            </button>
            {hoveredUrl === url && !disabled && (
              <button
                type="button"
                onClick={e => handleDeleteUploaded(url, e)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-white"
                style={{ backgroundColor: 'rgba(0,0,0,0.65)', fontSize: 10, lineHeight: 1 }}
                title={at('wines.deleteUploadedPhoto')}
              >
                ×
              </button>
            )}
          </div>
        )
      })}

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={disabled || uploading}
        title={at('wines.uploadOnePhoto')}
        className="rounded-lg border-2 border-dashed flex items-center justify-center text-lg leading-none"
        style={{ width: 52, height: 52, borderColor: C.border, color: C.faint }}
      >
        {uploading ? <span className="text-xs">…</span> : '+'}
      </button>
      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />

      {current && (
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="rounded-lg border px-2 text-xs h-[52px]"
          style={{ borderColor: C.border, color: C.faint }}
        >
          {at('wines.clear')}
        </button>
      )}
    </div>
  )
}

export default function WinesClient({ wines: initial, uploadedImages: initialUploaded, locale = 'en', wineDetailLevel }: { wines: Wine[]; uploadedImages: string[]; locale?: string; wineDetailLevel: 'PRODUCT' | 'VINTAGE' }) {
  const isVintageMode = wineDetailLevel === 'VINTAGE'
  const at = (key: string, vars?: Record<string, string | number>) => adminT(locale, key, vars)
  const TYPE_LABEL: Record<WineTypeValue, string> = {
    RED: at('wines.type.RED'), WHITE: at('wines.type.WHITE'), AMBER: at('wines.type.AMBER'), ROSE: at('wines.type.ROSE'),
  }
  const SWEETNESS_LABEL: Record<SweetnessValue, string> = {
    DRY: at('wines.sweetness.DRY'), SEMI_DRY: at('wines.sweetness.SEMI_DRY'), SEMI_SWEET: at('wines.sweetness.SEMI_SWEET'), SWEET: at('wines.sweetness.SWEET'),
  }
  const [wines, setWines] = useState<Wine[]>(initial)
  const [extraImages, setExtraImages] = useState<string[]>(initialUploaded)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // Which tab is showing inside the expanded wine — "Vintages" is the default
  // landing tab since that's what you're browsing most often; "Wine Details"
  // is a click away, never stacked underneath it.
  const [activeTab, setActiveTab] = useState<'details' | 'vintages'>('vintages')
  const [editingVintageId, setEditingVintageId] = useState<string | null>(null)
  const [productDraft, setProductDraft] = useState<ProductDraft>(BLANK_PRODUCT)
  const [vintageDraft, setVintageDraft] = useState<VintageDraft>(BLANK_VINTAGE)
  const [showAdd, setShowAdd] = useState(false)
  const [addDraft, setAddDraft] = useState<ProductDraft>(BLANK_PRODUCT)
  const [addingVintageFor, setAddingVintageFor] = useState<string | null>(null)
  const [newVintageDraft, setNewVintageDraft] = useState<VintageDraft>(BLANK_VINTAGE)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleteVintageConfirm, setDeleteVintageConfirm] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [imgSaving, setImgSaving] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [addNameLocale, setAddNameLocale] = useState<'en' | 'ka'>('en')
  const [editNameLocale, setEditNameLocale] = useState<'en' | 'ka'>('en')

  function parseAlcohol(raw: string): number | null {
    const n = parseFloat(raw)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  // ── Product handlers ──────────────────────────────────────────────────

  function toggleExpand(id: string) {
    setExpandedId(prev => (prev === id ? null : id))
    setActiveTab('vintages')
    setEditingVintageId(null)
    setAddingVintageFor(null)
    setDeleteConfirm(null)
    setDeleteVintageConfirm(null)
  }

  function resetProductDraft(wine: Wine) {
    setEditNameLocale('en')
    setProductDraft({
      name: wine.name,
      nameKa: wine.nameKa ?? '',
      wineType: wine.wineType,
      sweetness: wine.sweetness,
      sparkling: wine.sparkling,
      alcoholLevel: wine.alcoholLevel != null ? String(wine.alcoholLevel) : '',
      description: wine.description ?? '',
      color: wine.color,
    })
  }

  // The single entry point for switching tabs inside an expanded wine. Always
  // re-syncs the Details draft from the wine's current saved values, so
  // leaving the tab with unsaved edits and coming back starts clean — same
  // as re-opening any other edit form.
  function selectTab(wine: Wine, tab: 'details' | 'vintages') {
    setExpandedId(wine.id)
    setActiveTab(tab)
    setDeleteConfirm(null)
    if (tab === 'details') resetProductDraft(wine)
  }

  function handleAddProduct() {
    if (!addDraft.name.trim()) return
    setSaving('new')
    startTransition(async () => {
      await createWine({
        name: addDraft.name.trim(),
        nameKa: addDraft.nameKa.trim() || undefined,
        wineType: addDraft.wineType,
        sweetness: addDraft.sweetness,
        sparkling: addDraft.sparkling,
        alcoholLevel: parseAlcohol(addDraft.alcoholLevel) ?? undefined,
        description: addDraft.description.trim() || undefined,
        color: addDraft.color,
      })
      window.location.reload()
    })
  }

  function handleSaveProduct(id: string) {
    setSaving(id)
    const data = {
      name: productDraft.name,
      nameKa: productDraft.nameKa.trim() || null,
      wineType: productDraft.wineType,
      sweetness: productDraft.sweetness,
      sparkling: productDraft.sparkling,
      alcoholLevel: parseAlcohol(productDraft.alcoholLevel),
      description: productDraft.description || undefined,
      color: productDraft.color,
    }
    startTransition(async () => {
      await updateWine(id, data)
      setWines(prev => prev.map(w => w.id === id ? {
        ...w, ...data,
        alcoholLevel: data.alcoholLevel,
        description: data.description ?? null,
      } : w))
      setSaving(null)
    })
  }

  function handleToggleProductActive(wine: Wine) {
    setSaving(wine.id)
    startTransition(async () => {
      await updateWine(wine.id, { active: !wine.active })
      setWines(prev => prev.map(w => w.id === wine.id ? { ...w, active: !w.active } : w))
      setSaving(null)
    })
  }

  function handleDeleteProduct(id: string) {
    setSaving(id)
    startTransition(async () => {
      await deleteWine(id)
      setWines(prev => prev.filter(w => w.id !== id))
      setDeleteConfirm(null)
      setSaving(null)
      if (expandedId === id) setExpandedId(null)
    })
  }

  function handleAssignProductImage(wine: Wine, clickedPath: string) {
    const newPath = wine.imagePath === clickedPath ? null : clickedPath
    setImgSaving(wine.id)
    startTransition(async () => {
      await assignWineImage(wine.id, newPath)
      setWines(prev => prev.map(w => w.id === wine.id ? { ...w, imagePath: newPath } : w))
      setImgSaving(null)
    })
  }

  // ── Vintage handlers ──────────────────────────────────────────────────

  function startEditVintage(v: Vintage) {
    setEditingVintageId(v.id)
    setVintageDraft({
      year: String(v.year), price: String(v.price), active: v.active,
      wineType: v.wineType ?? '', sweetness: v.sweetness ?? '',
      sparkling: v.sparkling === null ? '' : v.sparkling ? 'true' : 'false',
      alcoholLevel: v.alcoholLevel != null ? String(v.alcoholLevel) : '',
    })
    setDeleteVintageConfirm(null)
  }

  // Only meaningful in VINTAGE mode — PRODUCT-mode tenants never write these
  // columns, so the fields stay null forever and are never read back.
  function vintageCharacteristics(draft: VintageDraft) {
    return {
      wineType: draft.wineType || null,
      sweetness: draft.sweetness || null,
      sparkling: draft.sparkling === '' ? null : draft.sparkling === 'true',
      alcoholLevel: parseAlcohol(draft.alcoholLevel),
    }
  }

  function handleSaveVintage(wineId: string, vintageId: string) {
    const year = parseInt(vintageDraft.year)
    const price = parseFloat(vintageDraft.price)
    if (!Number.isFinite(year) || !Number.isFinite(price)) return
    const extra = isVintageMode ? vintageCharacteristics(vintageDraft) : {}
    setSaving(vintageId)
    startTransition(async () => {
      await updateVintage(vintageId, { year, price, active: vintageDraft.active, ...extra })
      setWines(prev => prev.map(w => w.id === wineId ? {
        ...w,
        vintages: w.vintages.map(v => v.id === vintageId ? { ...v, year, price, active: vintageDraft.active, ...extra } : v),
      } : w))
      setEditingVintageId(null)
      setSaving(null)
    })
  }

  function handleAddVintage(wineId: string) {
    const year = parseInt(newVintageDraft.year)
    const price = parseFloat(newVintageDraft.price)
    if (!Number.isFinite(year) || !Number.isFinite(price)) return
    // createVintage's fields are optional-undefined (no explicit-null clearing
    // needed on a brand-new row), unlike updateVintage's nullable fields — so
    // "not specified" here means omitted, not null.
    const c = isVintageMode ? vintageCharacteristics(newVintageDraft) : null
    setSaving(`new-vintage-${wineId}`)
    startTransition(async () => {
      await createVintage(wineId, {
        year, price,
        wineType: c?.wineType ?? undefined,
        sweetness: c?.sweetness ?? undefined,
        sparkling: c?.sparkling ?? undefined,
        alcoholLevel: c?.alcoholLevel ?? undefined,
      })
      window.location.reload()
    })
  }

  function handleToggleVintageActive(wineId: string, v: Vintage) {
    setSaving(v.id)
    startTransition(async () => {
      await toggleVintageActive(v.id, !v.active)
      setWines(prev => prev.map(w => w.id === wineId ? {
        ...w,
        vintages: w.vintages.map(x => x.id === v.id ? { ...x, active: !v.active } : x),
      } : w))
      setSaving(null)
    })
  }

  function handleDeleteVintage(wineId: string, vintageId: string) {
    setSaving(vintageId)
    startTransition(async () => {
      await deleteVintage(vintageId)
      setWines(prev => prev.map(w => w.id === wineId ? {
        ...w,
        vintages: w.vintages.filter(v => v.id !== vintageId),
      } : w))
      setDeleteVintageConfirm(null)
      setSaving(null)
    })
  }

  function handleAssignVintageImage(wineId: string, v: Vintage, clickedPath: string | null) {
    const newPath = clickedPath !== null && v.imagePath === clickedPath ? null : clickedPath
    setImgSaving(v.id)
    startTransition(async () => {
      await assignVintageImage(v.id, newPath)
      setWines(prev => prev.map(w => w.id === wineId ? {
        ...w,
        vintages: w.vintages.map(x => x.id === v.id ? { ...x, imagePath: newPath } : x),
      } : w))
      setImgSaving(null)
    })
  }

  // ── Uploaded photo library (shared across all product + vintage pickers) ──

  function handleImagesUploaded(urls: string[]) {
    setExtraImages(prev => {
      const merged = [...prev]
      for (const u of urls) if (!merged.includes(u)) merged.push(u)
      return merged
    })
  }

  function handleImageDeleted(url: string) {
    setExtraImages(prev => prev.filter(u => u !== url))
  }

  // ── Shared product form (add + edit) ──────────────────────────────────

  function productFields(
    draft: ProductDraft, setDraft: (fn: (d: ProductDraft) => ProductDraft) => void,
    nameLocale: 'en' | 'ka', setNameLocale: (l: 'en' | 'ka') => void
  ) {
    return (
      <>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs block" style={{ color: C.faint }}>{at('wines.name')}</label>
              <div className="flex gap-0.5 p-0.5 rounded-md" style={{ backgroundColor: '#ede5d8' }}>
                {(['en', 'ka'] as const).map(l => (
                  <button key={l} type="button" onClick={() => setNameLocale(l)}
                    className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase transition-all"
                    style={{
                      backgroundColor: nameLocale === l ? '#fff9f3' : 'transparent',
                      color: nameLocale === l ? C.wine : C.muted,
                    }}>
                    {l === 'en' ? at('content.localeToggle.english') : at('content.localeToggle.georgian')}
                  </button>
                ))}
              </div>
            </div>
            {nameLocale === 'en' ? (
              <input className={inputCls} style={inputStyle} placeholder={at('wines.namePh')} value={draft.name}
                onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
            ) : (
              <>
                <input className={inputCls} style={inputStyle} placeholder={at('wines.nameKaPh')} value={draft.nameKa}
                  onChange={e => setDraft(d => ({ ...d, nameKa: e.target.value }))} />
                {!draft.nameKa.trim() && (
                  <p className="text-[11px] italic mt-1" style={{ color: C.faint }}>{at('wines.nameKaFallbackHint')}</p>
                )}
              </>
            )}
          </div>
          {!isVintageMode && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs mb-1 block" style={{ color: C.faint }}>{at('wines.type')}</label>
                <select className={inputCls} style={inputStyle} value={draft.wineType}
                  onChange={e => setDraft(d => ({ ...d, wineType: e.target.value as WineTypeValue }))}>
                  {WINE_TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: C.faint }}>{at('wines.sweetness')}</label>
                <select className={inputCls} style={inputStyle} value={draft.sweetness}
                  onChange={e => setDraft(d => ({ ...d, sweetness: e.target.value as SweetnessValue }))}>
                  {SWEETNESS_LEVELS.map(s => <option key={s} value={s}>{SWEETNESS_LABEL[s]}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>
        {!isVintageMode && (
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" id={`sparkling-${draft.name}`} checked={draft.sparkling}
                onChange={e => setDraft(d => ({ ...d, sparkling: e.target.checked }))} />
              <label htmlFor={`sparkling-${draft.name}`} className="text-sm" style={{ color: C.muted }}>{at('wines.sparkling')}</label>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: C.faint }}>{at('wines.alcoholLevel')}</label>
              <input className={inputCls} style={inputStyle} type="number" min={0} step={0.1} placeholder={at('wines.alcoholLevelPh')}
                value={draft.alcoholLevel}
                onChange={e => setDraft(d => ({ ...d, alcoholLevel: e.target.value }))} />
            </div>
          </div>
        )}
        {isVintageMode && (
          <p className="text-xs italic" style={{ color: C.faint }}>{at('wines.characteristicsPerVintageHint')}</p>
        )}
        <div>
          <label className="text-xs mb-1 block" style={{ color: C.faint }}>{at('wines.description')}</label>
          <textarea
            className={inputCls} style={{ ...inputStyle, resize: 'vertical', minHeight: 64 }}
            placeholder={at('wines.descriptionPh')}
            value={draft.description}
            onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
            rows={3}
          />
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: C.faint }}>{at('wines.colorHex')}</label>
          <div className="flex gap-2 items-center sm:max-w-[50%]">
            <input className={inputCls} style={inputStyle} value={draft.color}
              onChange={e => setDraft(d => ({ ...d, color: e.target.value }))} />
            <input type="color" value={draft.color}
              onChange={e => setDraft(d => ({ ...d, color: e.target.value }))}
              className="h-9 w-9 rounded border cursor-pointer flex-shrink-0" style={{ borderColor: C.border }} />
          </div>
        </div>
      </>
    )
  }

  // ── Per-vintage characteristics fields (VINTAGE mode only) ─────────────
  // Each field defaults to "not specified" and stays that way until someone
  // deliberately picks a value — no pre-fill from the wine, ever.
  function vintageFields(draft: VintageDraft, setDraft: (fn: (d: VintageDraft) => VintageDraft) => void) {
    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs mb-1 block" style={{ color: C.faint }}>{at('wines.type')}</label>
          <select className={inputCls} style={inputStyle} value={draft.wineType}
            onChange={e => setDraft(d => ({ ...d, wineType: e.target.value as WineTypeValue | '' }))}>
            <option value="">{at('wines.notSpecified')}</option>
            {WINE_TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: C.faint }}>{at('wines.sweetness')}</label>
          <select className={inputCls} style={inputStyle} value={draft.sweetness}
            onChange={e => setDraft(d => ({ ...d, sweetness: e.target.value as SweetnessValue | '' }))}>
            <option value="">{at('wines.notSpecified')}</option>
            {SWEETNESS_LEVELS.map(s => <option key={s} value={s}>{SWEETNESS_LABEL[s]}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: C.faint }}>{at('wines.sparkling')}</label>
          <select className={inputCls} style={inputStyle} value={draft.sparkling}
            onChange={e => setDraft(d => ({ ...d, sparkling: e.target.value as '' | 'true' | 'false' }))}>
            <option value="">{at('wines.notSpecified')}</option>
            <option value="true">{at('wines.sparklingYes')}</option>
            <option value="false">{at('wines.sparklingNo')}</option>
          </select>
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: C.faint }}>{at('wines.alcoholLevel')}</label>
          <input className={inputCls} style={inputStyle} type="number" min={0} step={0.1} placeholder={at('wines.notSpecified')}
            value={draft.alcoholLevel}
            onChange={e => setDraft(d => ({ ...d, alcoholLevel: e.target.value }))} />
        </div>
      </div>
    )
  }

  // ── Read-only per-vintage characteristics summary (VINTAGE mode only) ──
  // If nothing has been entered for this vintage, say so plainly rather than
  // rendering an empty row that looks the same as "deliberately left blank".
  function vintageMetaBadges(v: Vintage) {
    const hasAny = v.wineType != null || v.sweetness != null || v.sparkling != null || v.alcoholLevel != null
    if (!hasAny) return <span className="text-xs italic" style={{ color: C.faint }}>{at('wines.notSpecified')}</span>
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {v.wineType && <Badge>{TYPE_LABEL[v.wineType]}</Badge>}
        {v.sweetness && <Badge>{SWEETNESS_LABEL[v.sweetness]}</Badge>}
        {v.sparkling === true && <Badge>{at('wines.sparkling')}</Badge>}
        {v.alcoholLevel != null && <Badge>{v.alcoholLevel}%</Badge>}
      </div>
    )
  }

  return (
    <div className="space-y-3">

      {wines.map(wine => {
        const isExpanded = expandedId === wine.id
        const isDetailsTab = isExpanded && activeTab === 'details'
        const isSaving = saving === wine.id
        const isImgSaving = imgSaving === wine.id

        return (
          <div
            key={wine.id}
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: C.border, backgroundColor: '#ffffff', opacity: wine.active ? 1 : 0.65 }}
          >
            {/* ── Product row ── */}
            <div
              className="flex items-center gap-3 px-4 py-3 cursor-pointer"
              onClick={() => toggleExpand(wine.id)}
            >
              <div className="w-10 h-10 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center" style={{ backgroundColor: '#faf6f0' }}>
                {wine.imagePath
                  ? <img src={wine.imagePath} alt={wine.name} className="w-full h-full object-contain" />
                  : <ColorSwatch color={wine.color} />
                }
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold truncate" style={{ color: C.text }}>{wine.name}</p>
                  {!wine.active && <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#f5efe6', color: C.faint }}>{at('wines.hidden')}</span>}
                </div>
                {!isVintageMode && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <Badge>{TYPE_LABEL[wine.wineType]}</Badge>
                    <Badge>{SWEETNESS_LABEL[wine.sweetness]}</Badge>
                    {wine.sparkling && <Badge>{at('wines.sparkling')}</Badge>}
                    {wine.alcoholLevel != null && <Badge>{wine.alcoholLevel}%</Badge>}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                <span className="text-xs whitespace-nowrap" style={{ color: C.faint }}>
                  {wine.vintages.length} {wine.vintages.length !== 1 ? at('wines.vintage.plural') : at('wines.vintage.singular')}
                </span>
                <button onClick={() => handleToggleProductActive(wine)} disabled={isSaving}
                  title={wine.active ? at('wines.hideFromCatalogue') : at('wines.showInCatalogue')}
                  className="p-1 rounded border"
                  style={{ borderColor: C.border, color: C.muted }}>
                  {wine.active ? <IconEye /> : <IconEyeOff />}
                </button>
                <button onClick={() => selectTab(wine, 'details')} title={at('wines.editWine')}
                  className="p-1 rounded border"
                  style={{ borderColor: C.border, color: C.muted }}>
                  <IconPencil />
                </button>
                {deleteConfirm === wine.id ? (
                  <>
                    <button onClick={() => handleDeleteProduct(wine.id)} disabled={isSaving} title={at('wines.confirmDelete')}
                      className="p-1 rounded border"
                      style={{ borderColor: '#86efac', color: '#16a34a' }}>
                      <IconCheck />
                    </button>
                    <button onClick={() => setDeleteConfirm(null)} title={at('wines.cancel')}
                      className="p-1 rounded border"
                      style={{ borderColor: C.border, color: C.faint }}>
                      <IconX />
                    </button>
                  </>
                ) : (
                  <button onClick={() => setDeleteConfirm(wine.id)} title={at('wines.deleteWine')}
                    className="p-1 rounded border"
                    style={{ borderColor: '#fca5a5', color: '#dc2626' }}>
                    <IconTrash />
                  </button>
                )}
                <button
                  onClick={() => toggleExpand(wine.id)}
                  className="p-1 rounded transition-transform"
                  style={{ color: C.faint, transform: isExpanded ? 'rotate(180deg)' : 'none' }}
                  title={isExpanded ? at('wines.collapse') : at('wines.expand')}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 5.5L7 9.5L11 5.5" />
                  </svg>
                </button>
              </div>
            </div>

            {/* ── Expanded panel ── */}
            {isExpanded && (
              <div className="border-t px-4 py-4" style={{ borderColor: C.border, backgroundColor: '#fdfaf5' }}>

                {/* ── Tabs — the only way in or out of either edit surface, so it's
                    always visible which one you're in and how to switch. ── */}
                <div className="flex gap-1 p-1 rounded-lg mb-4 w-fit" style={{ backgroundColor: '#ede5d8' }}>
                  <button
                    onClick={() => selectTab(wine, 'details')}
                    className="px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer"
                    style={{
                      backgroundColor: activeTab === 'details' ? '#fffdf9' : 'transparent',
                      color: activeTab === 'details' ? C.wine : C.muted,
                      boxShadow: activeTab === 'details' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                    }}>
                    {at('wines.tabDetails')}
                  </button>
                  <button
                    onClick={() => selectTab(wine, 'vintages')}
                    className="px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer"
                    style={{
                      backgroundColor: activeTab === 'vintages' ? '#fffdf9' : 'transparent',
                      color: activeTab === 'vintages' ? C.wine : C.muted,
                      boxShadow: activeTab === 'vintages' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                    }}>
                    {at('wines.vintagesTitle')} ({wine.vintages.length})
                  </button>
                </div>

                {isDetailsTab && (
                  <div className="space-y-4">
                    {productFields(productDraft, setProductDraft, editNameLocale, setEditNameLocale)}

                    <div>
                      <label className="text-xs mb-2 block" style={{ color: C.faint }}>
                        {at('wines.productPhoto')} {isImgSaving ? <span style={{ color: C.faint }}>— {at('wines.savingSuffix')}</span> : wine.imagePath ? <span style={{ color: '#5a7c14' }}>— {at('wines.assignedSuffix')}</span> : <span>— {at('wines.noneSuffix')}</span>}
                      </label>
                      <ImagePickerGrid
                        current={wine.imagePath}
                        disabled={isImgSaving}
                        onPick={path => handleAssignProductImage(wine, path)}
                        onClear={() => handleAssignProductImage(wine, wine.imagePath!)}
                        extraImages={extraImages}
                        onUpload={handleImagesUploaded}
                        onDelete={handleImageDeleted}
                        locale={locale}
                      />
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button onClick={() => handleSaveProduct(wine.id)} disabled={isSaving}
                        className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white"
                        style={{ backgroundColor: C.wine }}>
                        {isSaving ? at('wines.saving') : at('wines.saveWineDetails')}
                      </button>
                      <button onClick={() => selectTab(wine, 'vintages')} disabled={isSaving}
                        className="px-4 py-1.5 rounded-lg text-sm border"
                        style={{ borderColor: C.border, color: C.muted }}>
                        {at('wines.cancel')}
                      </button>
                    </div>
                  </div>
                )}

                {activeTab === 'vintages' && (
                  <div className="space-y-2">
                    {wine.vintages.length === 0 && (
                      <p className="text-xs italic" style={{ color: C.faint }}>{at('wines.noVintagesYet')}</p>
                    )}
                    {wine.vintages.map(v => {
                      const isVEditing = editingVintageId === v.id
                      const isVSaving = saving === v.id
                      const isVImgSaving = imgSaving === v.id

                      return (
                        <div key={v.id} className="rounded-lg border overflow-hidden" style={{ borderColor: C.border, backgroundColor: '#ffffff', opacity: v.active ? 1 : 0.6 }}>
                          {isVEditing ? (
                            // Tinted background + left accent border marks this as
                            // nested under the 2023 row above, not a floating peer
                            // section — same idea as the wine/vintage tabs above.
                            <div className="p-3 pl-4 space-y-3" style={{ backgroundColor: '#fbf1ee', borderLeft: `3px solid ${C.wine}` }}>
                              <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide" style={{ color: C.wine }}>
                                <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: C.wine }} />
                                {at('wines.editingVintage', { year: v.year })}
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-xs mb-1 block" style={{ color: C.faint }}>{at('wines.year')}</label>
                                  <input className={inputCls} style={inputStyle} type="number" value={vintageDraft.year}
                                    onChange={e => setVintageDraft(d => ({ ...d, year: e.target.value }))} />
                                </div>
                                <div>
                                  <label className="text-xs mb-1 block" style={{ color: C.faint }}>{at('wines.pricePerBottle')}</label>
                                  <input className={inputCls} style={inputStyle} type="number" min={0} step={0.5} value={vintageDraft.price}
                                    onChange={e => setVintageDraft(d => ({ ...d, price: e.target.value }))} />
                                </div>
                              </div>
                              {isVintageMode && vintageFields(vintageDraft, setVintageDraft)}
                              <div>
                                <label className="text-xs mb-2 block" style={{ color: C.faint }}>
                                  {at('wines.vintagePhotoOverride')} {isVImgSaving ? <span>— {at('wines.savingSuffix')}</span> : v.imagePath ? <span style={{ color: '#5a7c14' }}>— {at('wines.overrideSetSuffix')}</span> : <span>— {at('wines.usingProductPhotoSuffix')}</span>}
                                </label>
                                <ImagePickerGrid
                                  current={v.imagePath}
                                  disabled={isVImgSaving}
                                  onPick={path => handleAssignVintageImage(wine.id, v, path)}
                                  onClear={() => handleAssignVintageImage(wine.id, v, null)}
                                  extraImages={extraImages}
                                  onUpload={handleImagesUploaded}
                                  onDelete={handleImageDeleted}
                                  locale={locale}
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <input type="checkbox" id={`v-active-${v.id}`} checked={vintageDraft.active}
                                  onChange={e => setVintageDraft(d => ({ ...d, active: e.target.checked }))} />
                                <label htmlFor={`v-active-${v.id}`} className="text-sm" style={{ color: C.muted }}>{at('wines.visibleInCatalogue')}</label>
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => handleSaveVintage(wine.id, v.id)} disabled={isVSaving}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                                  style={{ backgroundColor: C.wine }}>
                                  {isVSaving ? at('wines.saving') : at('wines.saveVintage')}
                                </button>
                                <button onClick={() => setEditingVintageId(null)} disabled={isVSaving}
                                  className="px-3 py-1.5 rounded-lg text-xs border"
                                  style={{ borderColor: C.border, color: C.muted }}>
                                  {at('wines.cancel')}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 px-3 py-2 flex-wrap">
                              <p className="text-sm font-bold" style={{ color: C.text }}>{v.year}</p>
                              <p className="text-sm" style={{ color: C.muted }}>{v.price}₾ / {at('wines.bottle')}</p>
                              {isVintageMode && vintageMetaBadges(v)}
                              {v.imagePath && (
                                <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#f0f7e6', color: '#5a7c14' }}>{at('wines.overrideImageBadge')}</span>
                              )}
                              {!v.active && (
                                <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#f5efe6', color: C.faint }}>{at('wines.hidden')}</span>
                              )}
                              <div className="flex items-center gap-2 ml-auto flex-shrink-0">
                                <button onClick={() => handleToggleVintageActive(wine.id, v)} disabled={isVSaving}
                                  title={v.active ? at('wines.hideFromCatalogue') : at('wines.showInCatalogue')}
                                  className="p-1 rounded border"
                                  style={{ borderColor: C.border, color: C.muted }}>
                                  {v.active ? <IconEye /> : <IconEyeOff />}
                                </button>
                                <button onClick={() => startEditVintage(v)} title={at('wines.editVintage')}
                                  className="p-1 rounded border"
                                  style={{ borderColor: C.border, color: C.muted }}>
                                  <IconPencil />
                                </button>
                                {deleteVintageConfirm === v.id ? (
                                  <>
                                    <button onClick={() => handleDeleteVintage(wine.id, v.id)} disabled={isVSaving} title={at('wines.confirmDelete')}
                                      className="p-1 rounded border"
                                      style={{ borderColor: '#86efac', color: '#16a34a' }}>
                                      <IconCheck />
                                    </button>
                                    <button onClick={() => setDeleteVintageConfirm(null)} title={at('wines.cancel')}
                                      className="p-1 rounded border"
                                      style={{ borderColor: C.border, color: C.faint }}>
                                      <IconX />
                                    </button>
                                  </>
                                ) : (
                                  <button onClick={() => setDeleteVintageConfirm(v.id)} title={at('wines.deleteVintage')}
                                    className="p-1 rounded border"
                                    style={{ borderColor: '#fca5a5', color: '#dc2626' }}>
                                    <IconTrash />
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {/* Add vintage */}
                    {addingVintageFor === wine.id ? (
                      <div className="rounded-lg border p-3 space-y-3" style={{ borderColor: C.border, backgroundColor: '#ffffff' }}>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs mb-1 block" style={{ color: C.faint }}>{at('wines.year')}</label>
                            <input className={inputCls} style={inputStyle} type="number" value={newVintageDraft.year}
                              onChange={e => setNewVintageDraft(d => ({ ...d, year: e.target.value }))} />
                          </div>
                          <div>
                            <label className="text-xs mb-1 block" style={{ color: C.faint }}>{at('wines.pricePerBottle')}</label>
                            <input className={inputCls} style={inputStyle} type="number" min={0} step={0.5} placeholder="0" value={newVintageDraft.price}
                              onChange={e => setNewVintageDraft(d => ({ ...d, price: e.target.value }))} />
                          </div>
                        </div>
                        {isVintageMode && vintageFields(newVintageDraft, setNewVintageDraft)}
                        <div className="flex gap-2">
                          <button onClick={() => handleAddVintage(wine.id)}
                            disabled={isPending || !newVintageDraft.year || !newVintageDraft.price}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                            style={{ backgroundColor: C.wine }}>
                            {saving === `new-vintage-${wine.id}` ? at('wines.adding') : at('wines.addVintage')}
                          </button>
                          <button onClick={() => setAddingVintageFor(null)}
                            className="px-3 py-1.5 rounded-lg text-xs border"
                            style={{ borderColor: C.border, color: C.muted }}>
                            {at('wines.cancel')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAddingVintageFor(wine.id); setNewVintageDraft(BLANK_VINTAGE) }}
                        className="w-full rounded-lg border-2 border-dashed py-2 text-xs font-medium transition-opacity hover:opacity-70"
                        style={{ borderColor: C.border, color: C.faint }}>
                        + {at('wines.addVintage')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Add new wine */}
      {showAdd ? (
        <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: C.border, backgroundColor: '#ffffff' }}>
          <p className="text-sm font-semibold" style={{ color: C.text }}>{at('wines.newWine')}</p>
          {productFields(addDraft, setAddDraft, addNameLocale, setAddNameLocale)}
          <p className="text-xs italic" style={{ color: C.faint }}>{at('wines.pricesPerVintageHint')}</p>
          <div className="flex gap-2 pt-1">
            <button onClick={handleAddProduct} disabled={isPending || !addDraft.name.trim()}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: C.wine }}>
              {saving === 'new' ? at('wines.adding') : at('wines.addWine')}
            </button>
            <button onClick={() => { setShowAdd(false); setAddDraft(BLANK_PRODUCT); setAddNameLocale('en') }}
              className="px-4 py-1.5 rounded-lg text-sm border"
              style={{ borderColor: C.border, color: C.muted }}>
              {at('wines.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)}
          className="w-full rounded-xl border-2 border-dashed py-3 text-sm font-medium transition-opacity hover:opacity-70"
          style={{ borderColor: C.border, color: C.faint }}>
          + {at('wines.addWine')}
        </button>
      )}

    </div>
  )
}
