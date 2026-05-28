'use client'

import { useState, useTransition } from 'react'
import { createWine, updateWine, deleteWine } from '@/app/actions/wines'

const C = {
  text: '#1c1008', muted: '#6b5a47', faint: '#a89070',
  border: '#e0d4c0', bg: '#fff9f3', wine: '#7c1d23',
}

const PRODUCT_IMAGES = [
  { path: '/images/products/george.png',  label: 'george' },
  { path: '/images/products/john.png',    label: 'john' },
  { path: '/images/products/uwawo.png',   label: 'uwawo' },
  { path: '/images/products/axoebi.png',  label: 'axoebi' },
  { path: '/images/products/wine5.png',   label: 'wine5' },
  { path: '/images/products/qisi.png',    label: 'qisi' },
]

type Wine = {
  id: string; name: string; type: string; description: string | null; price: number
  color: string; imagePath: string | null; active: boolean; sortOrder: number
}

const BLANK = { name: '', type: '', description: '', price: 0, color: '#7c1d23' }

const inputCls = 'w-full rounded-lg border px-3 py-2 text-sm outline-none'
const inputStyle = { backgroundColor: '#fffdf9', borderColor: C.border, color: C.text }

function ColorSwatch({ color }: { color: string }) {
  return <span className="inline-block w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
}

export default function WinesClient({ wines: initial }: { wines: Wine[] }) {
  const [wines, setWines] = useState<Wine[]>(initial)
  const [editId, setEditId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [draft, setDraft] = useState(BLANK)
  const [editDraft, setEditDraft] = useState<Partial<Wine & { description: string }>>({})
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [imgSaving, setImgSaving] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // ── ADD ──
  function handleAdd() {
    if (!draft.name.trim() || !draft.type.trim() || !draft.price) return
    setSaving('new')
    startTransition(async () => {
      await createWine({ name: draft.name.trim(), type: draft.type.trim(), description: draft.description.trim() || undefined, price: Number(draft.price), color: draft.color })
      setDraft(BLANK)
      setShowAdd(false)
      setSaving(null)
      window.location.reload()
    })
  }

  // ── EDIT ──
  function startEdit(wine: Wine) {
    setEditId(wine.id)
    setEditDraft({ name: wine.name, type: wine.type, description: wine.description ?? '', price: wine.price, color: wine.color, active: wine.active })
    setDeleteConfirm(null)
  }

  function handleSave(id: string) {
    setSaving(id)
    startTransition(async () => {
      await updateWine(id, {
        name: editDraft.name,
        type: editDraft.type,
        description: editDraft.description || undefined,
        price: Number(editDraft.price),
        color: editDraft.color,
        active: editDraft.active,
      })
      setWines(prev => prev.map(w => w.id === id ? { ...w, ...editDraft, price: Number(editDraft.price) } as Wine : w))
      setEditId(null)
      setSaving(null)
    })
  }

  // ── IMAGE ASSIGN (saves immediately, independent of edit save) ──
  function handleAssignImage(wineId: string, currentPath: string | null, clickedPath: string) {
    const newPath = currentPath === clickedPath ? null : clickedPath
    setImgSaving(wineId)
    startTransition(async () => {
      await updateWine(wineId, { imagePath: newPath })
      setWines(prev => prev.map(w => w.id === wineId ? { ...w, imagePath: newPath } : w))
      // Also keep editDraft in sync so display row updates immediately
      setImgSaving(null)
    })
  }

  // ── TOGGLE ACTIVE ──
  function handleToggleActive(wine: Wine) {
    setSaving(wine.id)
    startTransition(async () => {
      await updateWine(wine.id, { active: !wine.active })
      setWines(prev => prev.map(w => w.id === wine.id ? { ...w, active: !w.active } : w))
      setSaving(null)
    })
  }

  // ── DELETE ──
  function handleDelete(id: string) {
    setSaving(id)
    startTransition(async () => {
      await deleteWine(id)
      setWines(prev => prev.filter(w => w.id !== id))
      setDeleteConfirm(null)
      setSaving(null)
    })
  }

  return (
    <div className="space-y-3">

      {wines.map(wine => {
        const isEditing = editId === wine.id
        const isSaving = saving === wine.id
        const isImgSaving = imgSaving === wine.id

        return (
          <div
            key={wine.id}
            className="rounded-xl border overflow-hidden"
            style={{ borderColor: C.border, backgroundColor: '#ffffff', opacity: wine.active ? 1 : 0.65 }}
          >
            {isEditing ? (
              /* ── EDIT ROW ── */
              <div className="p-4 space-y-4">

                {/* Fields */}
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: C.faint }}>Name</label>
                    <input className={inputCls} style={inputStyle} value={editDraft.name ?? ''} onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: C.faint }}>Type</label>
                    <input className={inputCls} style={inputStyle} placeholder="e.g. Red Dry, Amber, Spirit 55%" value={editDraft.type ?? ''} onChange={e => setEditDraft(d => ({ ...d, type: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: C.faint }}>Description / tasting notes</label>
                  <textarea
                    className={inputCls} style={{ ...inputStyle, resize: 'vertical', minHeight: 64 }}
                    placeholder="e.g. Deep ruby colour. Notes of dark cherry, plum, and spice. Long finish."
                    value={editDraft.description ?? ''}
                    onChange={e => setEditDraft(d => ({ ...d, description: e.target.value }))}
                    rows={3}
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: C.faint }}>Price per bottle (₾)</label>
                    <input className={inputCls} style={inputStyle} type="number" min={0} value={editDraft.price ?? ''} onChange={e => setEditDraft(d => ({ ...d, price: Number(e.target.value) }))} />
                  </div>
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: C.faint }}>Colour (hex)</label>
                    <div className="flex gap-2 items-center">
                      <input className={inputCls} style={inputStyle} value={editDraft.color ?? ''} onChange={e => setEditDraft(d => ({ ...d, color: e.target.value }))} />
                      <input type="color" value={editDraft.color ?? '#7c1d23'} onChange={e => setEditDraft(d => ({ ...d, color: e.target.value }))} className="h-9 w-9 rounded border cursor-pointer flex-shrink-0" style={{ borderColor: C.border }} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id={`active-${wine.id}`} checked={editDraft.active ?? true} onChange={e => setEditDraft(d => ({ ...d, active: e.target.checked }))} />
                  <label htmlFor={`active-${wine.id}`} className="text-sm" style={{ color: C.muted }}>Visible in catalogue</label>
                </div>

                {/* Image picker */}
                <div>
                  <label className="text-xs mb-2 block" style={{ color: C.faint }}>
                    Photo {isImgSaving ? <span style={{ color: C.faint }}>— saving…</span> : wine.imagePath ? <span style={{ color: '#5a7c14' }}>— assigned ✓</span> : <span>— none</span>}
                  </label>
                  <div className="flex flex-wrap gap-2 items-center">
                    {PRODUCT_IMAGES.map(img => {
                      const isActive = wine.imagePath === img.path
                      const usedByOther = wines.some(w => w.id !== wine.id && w.imagePath === img.path)
                      return (
                        <button
                          key={img.path}
                          type="button"
                          onClick={() => handleAssignImage(wine.id, wine.imagePath, img.path)}
                          disabled={isImgSaving}
                          title={img.label}
                          className="rounded-lg border overflow-hidden transition-all"
                          style={{
                            width: 52, height: 52,
                            borderColor: isActive ? C.wine : C.border,
                            borderWidth: isActive ? 2 : 1,
                            opacity: usedByOther ? 0.35 : 1,
                            backgroundColor: '#faf6f0',
                          }}
                        >
                          <img src={img.path} alt={img.label} className="w-full h-full object-contain" />
                        </button>
                      )
                    })}
                    {wine.imagePath && (
                      <button
                        type="button"
                        onClick={() => handleAssignImage(wine.id, wine.imagePath, wine.imagePath!)}
                        disabled={isImgSaving}
                        className="rounded-lg border px-2 text-xs h-[52px]"
                        style={{ borderColor: C.border, color: C.faint }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                {/* Save / Cancel */}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => handleSave(wine.id)} disabled={isSaving}
                    className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white"
                    style={{ backgroundColor: C.wine }}>
                    {isSaving ? 'Saving…' : 'Save'}
                  </button>
                  <button onClick={() => setEditId(null)} disabled={isSaving}
                    className="px-4 py-1.5 rounded-lg text-sm border"
                    style={{ borderColor: C.border, color: C.muted }}>
                    Cancel
                  </button>
                </div>
              </div>

            ) : (
              /* ── DISPLAY ROW ── */
              <div className="flex items-center gap-3 px-4 py-3">
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
                  <p className="text-xs" style={{ color: C.faint }}>{wine.type} · {wine.price}₾ / bottle</p>
                  {wine.description && (
                    <p className="text-xs mt-1 line-clamp-2" style={{ color: C.muted }}>{wine.description}</p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => handleToggleActive(wine)} disabled={saving === wine.id}
                    className="text-xs px-2 py-1 rounded border"
                    style={{ borderColor: C.border, color: C.faint }}>
                    {saving === wine.id ? '…' : wine.active ? 'Hide' : 'Show'}
                  </button>
                  <button onClick={() => startEdit(wine)}
                    className="text-xs px-2 py-1 rounded border"
                    style={{ borderColor: C.border, color: C.muted }}>
                    Edit
                  </button>
                  {deleteConfirm === wine.id ? (
                    <>
                      <button onClick={() => handleDelete(wine.id)} disabled={saving === wine.id}
                        className="text-xs px-2 py-1 rounded border font-semibold"
                        style={{ borderColor: '#e53e3e', color: '#e53e3e' }}>
                        {saving === wine.id ? 'Deleting…' : 'Confirm'}
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
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Add new wine */}
      {showAdd ? (
        <div className="rounded-xl border p-4 space-y-3" style={{ borderColor: C.border, backgroundColor: '#ffffff' }}>
          <p className="text-sm font-semibold" style={{ color: C.text }}>New wine</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: C.faint }}>Name</label>
              <input className={inputCls} style={inputStyle} placeholder="e.g. Saperavi 2024" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: C.faint }}>Type</label>
              <input className={inputCls} style={inputStyle} placeholder="e.g. Red Dry" value={draft.type} onChange={e => setDraft(d => ({ ...d, type: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="text-xs mb-1 block" style={{ color: C.faint }}>Description / tasting notes</label>
            <textarea
              className={inputCls} style={{ ...inputStyle, resize: 'vertical', minHeight: 64 }}
              placeholder="e.g. Deep ruby colour. Notes of dark cherry, plum, and spice."
              value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
              rows={3}
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs mb-1 block" style={{ color: C.faint }}>Price per bottle (₾)</label>
              <input className={inputCls} style={inputStyle} type="number" min={0} placeholder="0" value={draft.price || ''} onChange={e => setDraft(d => ({ ...d, price: Number(e.target.value) }))} />
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: C.faint }}>Colour (hex)</label>
              <div className="flex gap-2 items-center">
                <input className={inputCls} style={inputStyle} value={draft.color} onChange={e => setDraft(d => ({ ...d, color: e.target.value }))} />
                <input type="color" value={draft.color} onChange={e => setDraft(d => ({ ...d, color: e.target.value }))} className="h-9 w-9 rounded border cursor-pointer flex-shrink-0" style={{ borderColor: C.border }} />
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleAdd} disabled={isPending || !draft.name.trim() || !draft.type.trim() || !draft.price}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: C.wine }}>
              {saving === 'new' ? 'Adding…' : 'Add wine'}
            </button>
            <button onClick={() => { setShowAdd(false); setDraft(BLANK) }}
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
