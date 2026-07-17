'use client'

import { useState, useTransition } from 'react'
import {
  createWine, updateWine, deleteWine, assignWineImage,
  createVintage, updateVintage, deleteVintage, assignVintageImage, toggleVintageActive,
} from '@/app/actions/wines'

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
}

type Wine = {
  id: string; name: string; wineType: WineTypeValue; sweetness: SweetnessValue
  sparkling: boolean; alcoholLevel: number | null; description: string | null
  color: string; imagePath: string | null; sortOrder: number; active: boolean
  vintages: Vintage[]
}

type ProductDraft = {
  name: string; wineType: WineTypeValue; sweetness: SweetnessValue
  sparkling: boolean; alcoholLevel: string; description: string; color: string
}

type VintageDraft = { year: string; price: string; active: boolean }

const BLANK_PRODUCT: ProductDraft = {
  name: '', wineType: 'RED', sweetness: 'DRY', sparkling: false,
  alcoholLevel: '', description: '', color: '#7c1d23',
}

const BLANK_VINTAGE: VintageDraft = { year: String(new Date().getFullYear()), price: '', active: true }

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

function ImagePickerGrid({ current, disabled, onPick, onClear }: {
  current: string | null; disabled: boolean
  onPick: (path: string) => void; onClear: () => void
}) {
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
      {current && (
        <button
          type="button"
          onClick={onClear}
          disabled={disabled}
          className="rounded-lg border px-2 text-xs h-[52px]"
          style={{ borderColor: C.border, color: C.faint }}
        >
          Clear
        </button>
      )}
    </div>
  )
}

export default function WinesClient({ wines: initial }: { wines: Wine[] }) {
  const [wines, setWines] = useState<Wine[]>(initial)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
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

  function parseAlcohol(raw: string): number | null {
    const n = parseFloat(raw)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  // ── Product handlers ──────────────────────────────────────────────────

  function toggleExpand(id: string) {
    setExpandedId(prev => (prev === id ? null : id))
    setEditingProductId(null)
    setEditingVintageId(null)
    setAddingVintageFor(null)
    setDeleteConfirm(null)
    setDeleteVintageConfirm(null)
  }

  function startEditProduct(wine: Wine) {
    setExpandedId(wine.id)
    setEditingProductId(wine.id)
    setProductDraft({
      name: wine.name,
      wineType: wine.wineType,
      sweetness: wine.sweetness,
      sparkling: wine.sparkling,
      alcoholLevel: wine.alcoholLevel != null ? String(wine.alcoholLevel) : '',
      description: wine.description ?? '',
      color: wine.color,
    })
    setDeleteConfirm(null)
  }

  function handleAddProduct() {
    if (!addDraft.name.trim()) return
    setSaving('new')
    startTransition(async () => {
      await createWine({
        name: addDraft.name.trim(),
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
      setEditingProductId(null)
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
    setVintageDraft({ year: String(v.year), price: String(v.price), active: v.active })
    setDeleteVintageConfirm(null)
  }

  function handleSaveVintage(wineId: string, vintageId: string) {
    const year = parseInt(vintageDraft.year)
    const price = parseFloat(vintageDraft.price)
    if (!Number.isFinite(year) || !Number.isFinite(price)) return
    setSaving(vintageId)
    startTransition(async () => {
      await updateVintage(vintageId, { year, price, active: vintageDraft.active })
      setWines(prev => prev.map(w => w.id === wineId ? {
        ...w,
        vintages: w.vintages.map(v => v.id === vintageId ? { ...v, year, price, active: vintageDraft.active } : v),
      } : w))
      setEditingVintageId(null)
      setSaving(null)
    })
  }

  function handleAddVintage(wineId: string) {
    const year = parseInt(newVintageDraft.year)
    const price = parseFloat(newVintageDraft.price)
    if (!Number.isFinite(year) || !Number.isFinite(price)) return
    setSaving(`new-vintage-${wineId}`)
    startTransition(async () => {
      await createVintage(wineId, { year, price })
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

  // ── Shared product form (add + edit) ──────────────────────────────────

  function productFields(draft: ProductDraft, setDraft: (fn: (d: ProductDraft) => ProductDraft) => void) {
    return (
      <>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs mb-1 block" style={{ color: C.faint }}>Name</label>
            <input className={inputCls} style={inputStyle} placeholder="e.g. Saperavi" value={draft.name}
              onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: C.faint }}>Type</label>
              <select className={inputCls} style={inputStyle} value={draft.wineType}
                onChange={e => setDraft(d => ({ ...d, wineType: e.target.value as WineTypeValue }))}>
                {WINE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: C.faint }}>Sweetness</label>
              <select className={inputCls} style={inputStyle} value={draft.sweetness}
                onChange={e => setDraft(d => ({ ...d, sweetness: e.target.value as SweetnessValue }))}>
                {SWEETNESS_LEVELS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div className="flex items-center gap-2 pt-5">
            <input type="checkbox" id={`sparkling-${draft.name}`} checked={draft.sparkling}
              onChange={e => setDraft(d => ({ ...d, sparkling: e.target.checked }))} />
            <label htmlFor={`sparkling-${draft.name}`} className="text-sm" style={{ color: C.muted }}>Sparkling</label>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: C.faint }}>Alcohol level % (optional)</label>
            <input className={inputCls} style={inputStyle} type="number" min={0} step={0.1} placeholder="e.g. 13.5"
              value={draft.alcoholLevel}
              onChange={e => setDraft(d => ({ ...d, alcoholLevel: e.target.value }))} />
          </div>
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: C.faint }}>Description / tasting notes</label>
          <textarea
            className={inputCls} style={{ ...inputStyle, resize: 'vertical', minHeight: 64 }}
            placeholder="e.g. Deep ruby colour. Notes of dark cherry, plum, and spice."
            value={draft.description}
            onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
            rows={3}
          />
        </div>
        <div>
          <label className="text-xs mb-1 block" style={{ color: C.faint }}>Colour (hex)</label>
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

  return (
    <div className="space-y-3">

      {wines.map(wine => {
        const isExpanded = expandedId === wine.id
        const isEditing = editingProductId === wine.id
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
                  {!wine.active && <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#f5efe6', color: C.faint }}>Hidden</span>}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  <Badge>{wine.wineType}</Badge>
                  <Badge>{wine.sweetness.replace('_', '-')}</Badge>
                  {wine.sparkling && <Badge>Sparkling</Badge>}
                  {wine.alcoholLevel != null && <Badge>{wine.alcoholLevel}%</Badge>}
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                <span className="text-xs whitespace-nowrap" style={{ color: C.faint }}>
                  {wine.vintages.length} vintage{wine.vintages.length !== 1 ? 's' : ''}
                </span>
                <button onClick={() => handleToggleProductActive(wine)} disabled={isSaving}
                  className="text-xs px-2 py-1 rounded border"
                  style={{ borderColor: C.border, color: C.faint }}>
                  {isSaving ? '…' : wine.active ? 'Hide' : 'Show'}
                </button>
                <button onClick={() => startEditProduct(wine)}
                  className="text-xs px-2 py-1 rounded border"
                  style={{ borderColor: C.border, color: C.muted }}>
                  Edit
                </button>
                {deleteConfirm === wine.id ? (
                  <>
                    <button onClick={() => handleDeleteProduct(wine.id)} disabled={isSaving}
                      className="text-xs px-2 py-1 rounded border font-semibold"
                      style={{ borderColor: '#e53e3e', color: '#e53e3e' }}>
                      {isSaving ? 'Deleting…' : 'Confirm'}
                    </button>
                    <button onClick={() => setDeleteConfirm(null)}
                      className="text-xs px-2 py-1 rounded border"
                      style={{ borderColor: C.border, color: C.faint }}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button onClick={() => setDeleteConfirm(wine.id)}
                    className="text-xs px-2 py-1 rounded border"
                    style={{ borderColor: C.border, color: C.faint }}>
                    Delete
                  </button>
                )}
                <button
                  onClick={() => toggleExpand(wine.id)}
                  className="p-1 rounded transition-transform"
                  style={{ color: C.faint, transform: isExpanded ? 'rotate(180deg)' : 'none' }}
                  title={isExpanded ? 'Collapse' : 'Expand'}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 5.5L7 9.5L11 5.5" />
                  </svg>
                </button>
              </div>
            </div>

            {/* ── Expanded panel ── */}
            {isExpanded && (
              <div className="border-t px-4 py-4 space-y-4" style={{ borderColor: C.border, backgroundColor: '#fdfaf5' }}>

                {isEditing && (
                  <div className="space-y-4">
                    {productFields(productDraft, setProductDraft)}

                    <div>
                      <label className="text-xs mb-2 block" style={{ color: C.faint }}>
                        Product photo {isImgSaving ? <span style={{ color: C.faint }}>— saving…</span> : wine.imagePath ? <span style={{ color: '#5a7c14' }}>— assigned ✓</span> : <span>— none</span>}
                      </label>
                      <ImagePickerGrid
                        current={wine.imagePath}
                        disabled={isImgSaving}
                        onPick={path => handleAssignProductImage(wine, path)}
                        onClear={() => handleAssignProductImage(wine, wine.imagePath!)}
                      />
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button onClick={() => handleSaveProduct(wine.id)} disabled={isSaving}
                        className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white"
                        style={{ backgroundColor: C.wine }}>
                        {isSaving ? 'Saving…' : 'Save'}
                      </button>
                      <button onClick={() => setEditingProductId(null)} disabled={isSaving}
                        className="px-4 py-1.5 rounded-lg text-sm border"
                        style={{ borderColor: C.border, color: C.muted }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Vintage sub-list ── */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: C.faint }}>Vintages</p>
                  <div className="space-y-2">
                    {wine.vintages.length === 0 && (
                      <p className="text-xs italic" style={{ color: C.faint }}>No vintages yet — add one below so this wine appears in the catalogue.</p>
                    )}
                    {wine.vintages.map(v => {
                      const isVEditing = editingVintageId === v.id
                      const isVSaving = saving === v.id
                      const isVImgSaving = imgSaving === v.id

                      return (
                        <div key={v.id} className="rounded-lg border" style={{ borderColor: C.border, backgroundColor: '#ffffff', opacity: v.active ? 1 : 0.6 }}>
                          {isVEditing ? (
                            <div className="p-3 space-y-3">
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-xs mb-1 block" style={{ color: C.faint }}>Year</label>
                                  <input className={inputCls} style={inputStyle} type="number" value={vintageDraft.year}
                                    onChange={e => setVintageDraft(d => ({ ...d, year: e.target.value }))} />
                                </div>
                                <div>
                                  <label className="text-xs mb-1 block" style={{ color: C.faint }}>Price per bottle (₾)</label>
                                  <input className={inputCls} style={inputStyle} type="number" min={0} step={0.5} value={vintageDraft.price}
                                    onChange={e => setVintageDraft(d => ({ ...d, price: e.target.value }))} />
                                </div>
                              </div>
                              <div>
                                <label className="text-xs mb-2 block" style={{ color: C.faint }}>
                                  Vintage photo (overrides product photo) {isVImgSaving ? <span>— saving…</span> : v.imagePath ? <span style={{ color: '#5a7c14' }}>— override set ✓</span> : <span>— using product photo</span>}
                                </label>
                                <ImagePickerGrid
                                  current={v.imagePath}
                                  disabled={isVImgSaving}
                                  onPick={path => handleAssignVintageImage(wine.id, v, path)}
                                  onClear={() => handleAssignVintageImage(wine.id, v, null)}
                                />
                              </div>
                              <div className="flex items-center gap-2">
                                <input type="checkbox" id={`v-active-${v.id}`} checked={vintageDraft.active}
                                  onChange={e => setVintageDraft(d => ({ ...d, active: e.target.checked }))} />
                                <label htmlFor={`v-active-${v.id}`} className="text-sm" style={{ color: C.muted }}>Visible in catalogue</label>
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => handleSaveVintage(wine.id, v.id)} disabled={isVSaving}
                                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                                  style={{ backgroundColor: C.wine }}>
                                  {isVSaving ? 'Saving…' : 'Save'}
                                </button>
                                <button onClick={() => setEditingVintageId(null)} disabled={isVSaving}
                                  className="px-3 py-1.5 rounded-lg text-xs border"
                                  style={{ borderColor: C.border, color: C.muted }}>
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 px-3 py-2">
                              <p className="text-sm font-bold" style={{ color: C.text }}>{v.year}</p>
                              <p className="text-sm" style={{ color: C.muted }}>{v.price}₾ / bottle</p>
                              {v.imagePath && (
                                <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#f0f7e6', color: '#5a7c14' }}>override image</span>
                              )}
                              {!v.active && (
                                <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: '#f5efe6', color: C.faint }}>Hidden</span>
                              )}
                              <div className="flex items-center gap-2 ml-auto flex-shrink-0">
                                <button onClick={() => handleToggleVintageActive(wine.id, v)} disabled={isVSaving}
                                  className="text-xs px-2 py-1 rounded border"
                                  style={{ borderColor: C.border, color: C.faint }}>
                                  {isVSaving ? '…' : v.active ? 'Hide' : 'Show'}
                                </button>
                                <button onClick={() => startEditVintage(v)}
                                  className="text-xs px-2 py-1 rounded border"
                                  style={{ borderColor: C.border, color: C.muted }}>
                                  Edit
                                </button>
                                {deleteVintageConfirm === v.id ? (
                                  <>
                                    <button onClick={() => handleDeleteVintage(wine.id, v.id)} disabled={isVSaving}
                                      className="text-xs px-2 py-1 rounded border font-semibold"
                                      style={{ borderColor: '#e53e3e', color: '#e53e3e' }}>
                                      {isVSaving ? 'Deleting…' : 'Confirm'}
                                    </button>
                                    <button onClick={() => setDeleteVintageConfirm(null)}
                                      className="text-xs px-2 py-1 rounded border"
                                      style={{ borderColor: C.border, color: C.faint }}>
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <button onClick={() => setDeleteVintageConfirm(v.id)}
                                    className="text-xs px-2 py-1 rounded border"
                                    style={{ borderColor: C.border, color: C.faint }}>
                                    Delete
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
                            <label className="text-xs mb-1 block" style={{ color: C.faint }}>Year</label>
                            <input className={inputCls} style={inputStyle} type="number" value={newVintageDraft.year}
                              onChange={e => setNewVintageDraft(d => ({ ...d, year: e.target.value }))} />
                          </div>
                          <div>
                            <label className="text-xs mb-1 block" style={{ color: C.faint }}>Price per bottle (₾)</label>
                            <input className={inputCls} style={inputStyle} type="number" min={0} step={0.5} placeholder="0" value={newVintageDraft.price}
                              onChange={e => setNewVintageDraft(d => ({ ...d, price: e.target.value }))} />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => handleAddVintage(wine.id)}
                            disabled={isPending || !newVintageDraft.year || !newVintageDraft.price}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                            style={{ backgroundColor: C.wine }}>
                            {saving === `new-vintage-${wine.id}` ? 'Adding…' : 'Add vintage'}
                          </button>
                          <button onClick={() => setAddingVintageFor(null)}
                            className="px-3 py-1.5 rounded-lg text-xs border"
                            style={{ borderColor: C.border, color: C.muted }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setAddingVintageFor(wine.id); setNewVintageDraft(BLANK_VINTAGE) }}
                        className="w-full rounded-lg border-2 border-dashed py-2 text-xs font-medium transition-opacity hover:opacity-70"
                        style={{ borderColor: C.border, color: C.faint }}>
                        + Add vintage
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Add new wine */}
      {showAdd ? (
        <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: C.border, backgroundColor: '#ffffff' }}>
          <p className="text-sm font-semibold" style={{ color: C.text }}>New wine</p>
          {productFields(addDraft, setAddDraft)}
          <p className="text-xs italic" style={{ color: C.faint }}>Prices are set per vintage — add a vintage after saving.</p>
          <div className="flex gap-2 pt-1">
            <button onClick={handleAddProduct} disabled={isPending || !addDraft.name.trim()}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: C.wine }}>
              {saving === 'new' ? 'Adding…' : 'Add wine'}
            </button>
            <button onClick={() => { setShowAdd(false); setAddDraft(BLANK_PRODUCT) }}
              className="px-4 py-1.5 rounded-lg text-sm border"
              style={{ borderColor: C.border, color: C.muted }}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)}
          className="w-full rounded-xl border-2 border-dashed py-3 text-sm font-medium transition-opacity hover:opacity-70"
          style={{ borderColor: C.border, color: C.faint }}>
          + Add wine
        </button>
      )}

    </div>
  )
}
