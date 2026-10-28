'use client'

import { useState, useTransition } from 'react'
import { asTetri, fromMajor, toMajor, formatTetri } from '@/lib/money'
import {
  createWine, updateWine, deleteWine, assignWineImage,
  createVintage, updateVintage, deleteVintage, assignVintageImage, toggleVintageActive,
  setWineBookable, setVintageBookable,
} from '@/app/actions/wines'
import { deleteWineImage } from '@/app/actions/uploadImage'
import { adminT } from '@/lib/adminT'
import WinePhotoPicker, { storagePathFromUrl, type PhotoItem } from './WinePhotoPicker'

const C = {
  text: 'var(--site-text)', muted: 'var(--site-muted)', faint: 'var(--site-secondary)',
  border: 'var(--site-border)', bg: 'var(--site-surface)', wine: 'var(--color-brand)',
}

const PRODUCT_IMAGES = [
  { path: '/images/products/george.png',  label: 'george' },
  { path: '/images/products/john.png',    label: 'john' },
  { path: '/images/products/uwawo.png',   label: 'uwawo' },
  { path: '/images/products/axoebi.png',  label: 'axoebi' },
  { path: '/images/products/wine5.png',   label: 'wine5' },
  { path: '/images/products/qisi.png',    label: 'qisi' },
]

// Generic bottle illustrations offered to every winery as a starting point (T-302): plain files in public/images/defaults.
const DEFAULT_BOTTLES = [
  { path: '/images/defaults/bottle-red.svg',       labelKey: 'wines.photo.bottleRed' },
  { path: '/images/defaults/bottle-white.svg',     labelKey: 'wines.photo.bottleWhite' },
  { path: '/images/defaults/bottle-amber.svg',     labelKey: 'wines.photo.bottleAmber' },
  { path: '/images/defaults/bottle-rose.svg',      labelKey: 'wines.photo.bottleRose' },
  { path: '/images/defaults/bottle-sparkling.svg', labelKey: 'wines.photo.bottleSparkling' },
]

type WineTypeValue = 'RED' | 'WHITE' | 'AMBER' | 'ROSE'
type SweetnessValue = 'DRY' | 'SEMI_DRY' | 'SEMI_SWEET' | 'SWEET'

const WINE_TYPES: WineTypeValue[] = ['RED', 'WHITE', 'AMBER', 'ROSE']
const SWEETNESS_LEVELS: SweetnessValue[] = ['DRY', 'SEMI_DRY', 'SEMI_SWEET', 'SWEET']

type Vintage = {
  id: string; year: number; price: number; imagePath: string | null
  active: boolean; sortOrder: number
  /** Offered as wine for the table on bookings (T-22). */
  bookable: boolean
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
const inputStyle = { backgroundColor: 'var(--site-surface)', borderColor: C.border, color: C.text }

function ColorSwatch({ color }: { color: string }) {
  return <span className="inline-block w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ backgroundColor: 'var(--site-bg)', color: C.muted }}>
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
  // Which wine / vintage the shared photo window is open for (T-302).
  const [picker, setPicker] = useState<{ wineId: string; vintageId: string | null } | null>(null)
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

  // "Offer on bookings" (T-22). The product switch moves all of a wine's vintages together; a vintage switch (vintage-level
  // wineries) moves one. Both ask the server, which creates the "Wine for the table" group the first time one goes on.
  const [bookableError, setBookableError] = useState('')
  function handleToggleBookable(wine: Wine) {
    const allOn = wine.vintages.length > 0 && wine.vintages.every(v => v.bookable)
    setSaving(wine.id)
    setBookableError('')
    startTransition(async () => {
      const r = await setWineBookable(wine.id, !allOn)
      if ('error' in r) setBookableError(r.error)
      else setWines(prev => prev.map(w => w.id === wine.id ? { ...w, vintages: w.vintages.map(v => ({ ...v, bookable: !allOn })) } : w))
      setSaving(null)
    })
  }
  function handleToggleVintageBookable(wineId: string, v: Vintage) {
    setSaving(v.id)
    setBookableError('')
    startTransition(async () => {
      const r = await setVintageBookable(v.id, !v.bookable)
      if ('error' in r) setBookableError(r.error)
      else setWines(prev => prev.map(w => w.id === wineId ? { ...w, vintages: w.vintages.map(x => x.id === v.id ? { ...x, bookable: !v.bookable } : x) } : w))
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

  function handleAssignProductImage(wine: Wine, newPath: string | null) {
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
      year: String(v.year), price: String(toMajor(asTetri(v.price))), active: v.active,
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
    // The draft holds GEL (what the admin typed); everything below is tetri.
    const priceMajor = parseFloat(vintageDraft.price)
    if (!Number.isFinite(year) || !Number.isFinite(priceMajor)) return
    const price = fromMajor(priceMajor)
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
    const priceMajor = parseFloat(newVintageDraft.price)
    if (!Number.isFinite(year) || !Number.isFinite(priceMajor)) return
    const price = fromMajor(priceMajor)
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

  function handleAssignVintageImage(wineId: string, v: Vintage, newPath: string | null) {
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

  // ── Uploaded photo library (shared by the one photo window, T-302) ──

  function handleImagesUploaded(urls: string[]) {
    setExtraImages(prev => {
      const merged = [...urls.filter(u => !prev.includes(u)), ...prev] // newest first, like the server listing
      return merged
    })
  }

  // The server also clears the photo from every wine / vintage that used it; mirror that in local state.
  async function handleDeletePhoto(url: string) {
    const storagePath = storagePathFromUrl(url)
    if (!storagePath) return
    await deleteWineImage(storagePath)
    setExtraImages(prev => prev.filter(u => u !== url))
    setWines(prev => prev.map(w => ({
      ...w,
      imagePath: w.imagePath === url ? null : w.imagePath,
      vintages: w.vintages.map(v => v.imagePath === url ? { ...v, imagePath: null } : v),
    })))
  }

  const fileOf = (url: string) => decodeURIComponent(url.split('/').pop() ?? url)

  // Who uses a photo, as display names (a vintage's own photo is shown on the public site at either detail level).
  function photoUsers(url: string): string[] {
    const users: string[] = []
    for (const w of wines) {
      if (w.imagePath === url) users.push(w.name)
      for (const v of w.vintages) if (v.imagePath === url) users.push(`${w.name} ${v.year}`)
    }
    return users
  }

  // Display name of a photo: the default bottles have a proper name, uploads show their file name.
  function photoName(url: string) {
    const d = DEFAULT_BOTTLES.find(b => b.path === url)
    return d ? at(d.labelKey) : fileOf(url)
  }

  // Uploaded photos, then the generic default bottles (offered to everyone), then any older built-in product photo a wine
  // still uses (Nikalas's test photos: shown only while in use, never offered to a winery that does not use them).
  function buildLibrary(): PhotoItem[] {
    const uploaded = extraImages.map(url => ({ url, file: fileOf(url), builtin: false, users: photoUsers(url) }))
    const defaults = DEFAULT_BOTTLES.map(b => ({ url: b.path, file: b.path.split('/').pop() ?? '', label: at(b.labelKey), builtin: true, users: photoUsers(b.path) }))
    const legacy = PRODUCT_IMAGES
      .map(b => ({ url: b.path, file: b.path.split('/').pop() ?? b.label, builtin: true, users: photoUsers(b.path) }))
      .filter(b => b.users.length > 0)
    return [...uploaded, ...defaults, ...legacy]
  }

  // Photo field: current picture + buttons, in place of the old strip of thumbnails.
  function photoField(wine: Wine, v: Vintage | null) {
    const obj = v ?? wine
    const own = obj.imagePath
    const shown = own ?? (v ? wine.imagePath : null)
    const busy = imgSaving === obj.id
    const others = own ? photoUsers(own).filter(n => n !== (v ? `${wine.name} ${v.year}` : wine.name)) : []
    const open = () => setPicker({ wineId: wine.id, vintageId: v?.id ?? null })
    const clear = () => v ? handleAssignVintageImage(wine.id, v, null) : handleAssignProductImage(wine, null)
    const dim = !!v && !own
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={open} disabled={busy} aria-label={at(own ? 'wines.photo.change' : 'wines.photo.choose')}
          className="rounded-lg border flex items-center justify-center overflow-hidden flex-shrink-0"
          style={{ width: v ? 48 : 80, height: v ? 62 : 100, borderColor: C.border, backgroundColor: '#faf6f0', borderStyle: shown ? 'solid' : 'dashed' }}>
          {shown
            ? <img src={shown} alt="" className="w-full h-full object-contain" style={{ opacity: dim ? 0.45 : 1 }} />
            : <span className="text-xs px-1 text-center" style={{ color: C.faint }}>{at('wines.photo.none')}</span>}
        </button>
        <div className="min-w-0 space-y-1">
          {v ? (
            <span className="inline-block text-xs px-2 py-0.5 rounded-full"
              style={own ? { backgroundColor: '#eef5e1', color: '#4d7a12', fontWeight: 600 } : { border: `1px solid ${C.border}`, color: C.faint }}>
              {own ? at('wines.photo.own') : at(wine.imagePath ? 'wines.photo.inherits' : 'wines.photo.none')}
            </span>
          ) : (
            <p className="text-xs font-mono break-all" style={{ color: C.muted }}>{own ? photoName(own) : at('wines.photo.noneShown')}</p>
          )}
          {others.length > 0 && <p className="text-xs" style={{ color: C.muted }}>{at('wines.photo.alsoUsedBy', { names: others.join(', ') })}</p>}
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <button type="button" onClick={open} disabled={busy}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ backgroundColor: C.wine }}>
              {busy ? at('wines.savingSuffix') : own ? at('wines.photo.change') : at(v ? 'wines.photo.ownVintage' : 'wines.photo.choose')}
            </button>
            {own && (
              <button type="button" onClick={clear} disabled={busy} className="text-xs underline px-1" style={{ color: C.muted }}>
                {at(v ? 'wines.photo.useProduct' : 'wines.photo.remove')}
              </button>
            )}
          </div>
        </div>
      </div>
    )
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
                      backgroundColor: nameLocale === l ? 'var(--site-surface)' : 'transparent',
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
      {bookableError && <p role="alert" className="text-sm" style={{ color: '#b91c1c' }}>{bookableError}</p>}

      {wines.map(wine => {
        const isExpanded = expandedId === wine.id
        const isDetailsTab = isExpanded && activeTab === 'details'
        const isSaving = saving === wine.id

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
                  {!wine.active && <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--site-bg)', color: C.faint }}>{at('wines.hidden')}</span>}
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
                {/* Offer on bookings (T-22): a switch — on only when every vintage is. A vintage-level winery sees "2/3" while partly on. */}
                {(() => {
                  const on = wine.vintages.filter(v => v.bookable).length
                  const all = wine.vintages.length > 0 && on === wine.vintages.length
                  return (
                    <button type="button" role="switch" aria-checked={all}
                      onClick={() => handleToggleBookable(wine)} disabled={isSaving || wine.vintages.length === 0}
                      title={at('wines.bookable.title')} aria-label={at('wines.bookable.label')}
                      className="flex items-center gap-1.5 text-xs whitespace-nowrap rounded-full border pl-1.5 pr-2.5 py-0.5 disabled:opacity-40"
                      style={{ borderColor: all ? '#86efac' : C.border, color: all ? '#15803d' : C.faint, backgroundColor: all ? '#f0fdf4' : 'transparent' }}>
                      <span aria-hidden className="inline-block w-6 h-3.5 rounded-full relative" style={{ backgroundColor: all ? '#16a34a' : on > 0 ? '#facc15' : '#d1c4b0' }}>
                        <span className="absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all" style={{ left: all ? 12 : 2 }} />
                      </span>
                      {at('wines.bookable.label')}{isVintageMode && on > 0 && !all ? ` ${on}/${wine.vintages.length}` : ''}
                    </button>
                  )
                })()}
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
                      backgroundColor: activeTab === 'details' ? 'var(--site-surface)' : 'transparent',
                      color: activeTab === 'details' ? C.wine : C.muted,
                      boxShadow: activeTab === 'details' ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                    }}>
                    {at('wines.tabDetails')}
                  </button>
                  <button
                    onClick={() => selectTab(wine, 'vintages')}
                    className="px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer"
                    style={{
                      backgroundColor: activeTab === 'vintages' ? 'var(--site-surface)' : 'transparent',
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
                      <label className="text-xs mb-2 block" style={{ color: C.faint }}>{at('wines.productPhoto')}</label>
                      {photoField(wine, null)}
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
                      const rowPhoto = v.imagePath ?? wine.imagePath

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
                                <label className="text-xs mb-2 block" style={{ color: C.faint }}>{at('wines.vintagePhotoOverride')}</label>
                                {photoField(wine, v)}
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
                              <button type="button" onClick={() => setPicker({ wineId: wine.id, vintageId: v.id })}
                                aria-label={`${at('wines.photo.change')} — ${v.year}`} title={at('wines.photo.change')}
                                className="rounded border flex items-center justify-center overflow-hidden flex-shrink-0"
                                style={{ width: 28, height: 36, borderColor: C.border, backgroundColor: '#faf6f0', borderStyle: rowPhoto ? 'solid' : 'dashed' }}>
                                {rowPhoto
                                  ? <img src={rowPhoto} alt="" className="w-full h-full object-contain" style={{ opacity: v.imagePath ? 1 : 0.45 }} />
                                  : <span className="text-xs" style={{ color: C.faint }}>+</span>}
                              </button>
                              <p className="text-sm font-bold" style={{ color: C.text }}>{v.year}</p>
                              <p className="text-sm" style={{ color: C.muted }}>{formatTetri(asTetri(v.price))} / {at('wines.bottle')}</p>
                              {isVintageMode && vintageMetaBadges(v)}
                              {v.imagePath && (
                                <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#f0f7e6', color: '#5a7c14' }}>{at('wines.photo.own')}</span>
                              )}
                              {!v.active && (
                                <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--site-bg)', color: C.faint }}>{at('wines.hidden')}</span>
                              )}
                              <div className="flex items-center gap-2 ml-auto flex-shrink-0">
                                {isVintageMode && (
                                  <button type="button" role="switch" aria-checked={v.bookable}
                                    onClick={() => handleToggleVintageBookable(wine.id, v)} disabled={isVSaving}
                                    title={at('wines.bookable.title')} aria-label={`${at('wines.bookable.label')} — ${v.year}`}
                                    className="flex items-center gap-1.5 text-xs whitespace-nowrap rounded-full border pl-1.5 pr-2.5 py-0.5"
                                    style={{ borderColor: v.bookable ? '#86efac' : C.border, color: v.bookable ? '#15803d' : C.faint, backgroundColor: v.bookable ? '#f0fdf4' : 'transparent' }}>
                                    <span aria-hidden className="inline-block w-6 h-3.5 rounded-full relative" style={{ backgroundColor: v.bookable ? '#16a34a' : '#d1c4b0' }}>
                                      <span className="absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all" style={{ left: v.bookable ? 12 : 2 }} />
                                    </span>
                                    {at('wines.bookable.label')}
                                  </button>
                                )}
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

      {picker && (() => {
        const w = wines.find(x => x.id === picker.wineId)
        if (!w) return null
        const v = picker.vintageId ? w.vintages.find(x => x.id === picker.vintageId) ?? null : null
        if (picker.vintageId && !v) return null
        const target = v ?? w
        return (
          <WinePhotoPicker
            locale={locale}
            title={v ? `${w.name} ${v.year}` : w.name}
            vintageYear={v?.year}
            inheritsProductPhoto={!!v && !v.imagePath}
            photos={buildLibrary()}
            current={target.imagePath}
            onApply={url => {
              if (v) handleAssignVintageImage(w.id, v, url)
              else handleAssignProductImage(w, url)
              setPicker(null)
            }}
            onUploaded={handleImagesUploaded}
            onDeletePhoto={handleDeletePhoto}
            onClose={() => setPicker(null)}
          />
        )
      })()}

    </div>
  )
}
