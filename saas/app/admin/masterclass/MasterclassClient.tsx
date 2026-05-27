'use client'

import { useState } from 'react'
import { createMasterclassItem, updateMasterclassItem, deleteMasterclassItem } from '@/app/actions/masterclassItems'

const C = {
  text: '#1c1008', muted: '#6b5a47', faint: '#a89070',
  border: '#e0d4c0', bg: '#fff9f3', wine: '#7c1d23',
}

const inputStyle = {
  backgroundColor: '#fffdf9',
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: '6px 10px',
  fontSize: '0.875rem',
  color: C.text,
  outline: 'none',
}

type MasterclassItem = {
  id: string
  name: string
  unit: string
  pricePerUnit: number
  active: boolean
  sortOrder: number
}

export default function MasterclassClient({ items: initial }: { items: MasterclassItem[] }) {
  const [items, setItems] = useState(initial)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editUnit, setEditUnit] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editSort, setEditSort] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newUnit, setNewUnit] = useState('person')
  const [newPrice, setNewPrice] = useState('')
  const [loading, setLoading] = useState(false)

  function openEdit(item: MasterclassItem) {
    setEditingId(item.id)
    setEditName(item.name)
    setEditUnit(item.unit)
    setEditPrice(String(item.pricePerUnit))
    setEditSort(String(item.sortOrder))
  }

  async function handleSave(id: string) {
    if (!editName.trim() || !editUnit.trim()) return
    setLoading(true)
    await updateMasterclassItem(id, {
      name: editName,
      unit: editUnit,
      pricePerUnit: parseFloat(editPrice) || 0,
      sortOrder: parseInt(editSort) || 0,
    })
    setItems(prev => prev.map(i => i.id === id ? {
      ...i, name: editName, unit: editUnit,
      pricePerUnit: parseFloat(editPrice) || 0,
      sortOrder: parseInt(editSort) || 0,
    } : i))
    setEditingId(null)
    setLoading(false)
  }

  async function handleToggleActive(item: MasterclassItem) {
    await updateMasterclassItem(item.id, { active: !item.active })
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, active: !i.active } : i))
  }

  async function handleDelete(id: string) {
    setLoading(true)
    await deleteMasterclassItem(id)
    setItems(prev => prev.filter(i => i.id !== id))
    setDeletingId(null)
    setLoading(false)
  }

  async function handleAdd() {
    if (!newName.trim() || !newUnit.trim()) return
    setLoading(true)
    await createMasterclassItem({
      name: newName,
      unit: newUnit,
      pricePerUnit: parseFloat(newPrice) || 0,
    })
    setNewName('')
    setNewUnit('person')
    setNewPrice('')
    setAdding(false)
    setLoading(false)
  }

  return (
    <div>
      <p className="text-sm mb-6" style={{ color: C.muted }}>
        Manage masterclass options available for company bookings. Each item has a unit (e.g. "person", "piece") and a price per unit.
      </p>

      <div className="rounded-xl border overflow-hidden" style={{ borderColor: C.border }}>
        {/* Header */}
        <div className="grid px-5 py-2 border-b text-xs font-semibold uppercase tracking-wider"
          style={{ backgroundColor: '#f5efe6', borderColor: C.border, color: '#8b4513', gridTemplateColumns: '1fr 100px 80px 80px 120px' }}>
          <span>Name</span>
          <span>Unit</span>
          <span>Price</span>
          <span>Order</span>
          <span></span>
        </div>

        {items.length === 0 && !adding && (
          <div className="px-5 py-6 text-sm text-center" style={{ color: C.faint, backgroundColor: C.bg }}>
            No masterclass items yet. Add one below.
          </div>
        )}

        {items.map((item, i) => (
          <div key={item.id} style={{
            backgroundColor: C.bg,
            borderBottom: i < items.length - 1 || adding ? `1px solid ${C.border}` : 'none',
          }}>
            {editingId === item.id ? (
              <div className="grid items-center gap-2 px-5 py-3"
                style={{ gridTemplateColumns: '1fr 100px 80px 80px 120px' }}>
                <input style={inputStyle} value={editName} onChange={e => setEditName(e.target.value)} autoFocus />
                <input style={inputStyle} value={editUnit} onChange={e => setEditUnit(e.target.value)} placeholder="person" />
                <input style={inputStyle} type="number" value={editPrice} onChange={e => setEditPrice(e.target.value)} placeholder="0" />
                <input style={inputStyle} type="number" value={editSort} onChange={e => setEditSort(e.target.value)} placeholder="0" />
                <div className="flex gap-1">
                  <button onClick={() => handleSave(item.id)} disabled={loading}
                    className="text-xs px-2 py-1 rounded font-medium text-white" style={{ backgroundColor: C.wine }}>Save</button>
                  <button onClick={() => setEditingId(null)}
                    className="text-xs px-2 py-1 rounded border" style={{ borderColor: C.border, color: C.muted }}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="grid items-center gap-2 px-5 py-3"
                style={{ gridTemplateColumns: '1fr 100px 80px 80px 120px' }}>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleActive(item)}
                    title={item.active ? 'Active' : 'Inactive'}
                    className="flex-shrink-0 w-2 h-2 rounded-full"
                    style={{ backgroundColor: item.active ? '#16a34a' : '#d1c4b0' }}
                  />
                  <span className="text-sm" style={{
                    color: item.active ? C.text : C.faint,
                    textDecoration: item.active ? 'none' : 'line-through',
                  }}>{item.name}</span>
                </div>
                <span className="text-sm" style={{ color: C.muted }}>per {item.unit}</span>
                <span className="text-sm font-medium" style={{ color: C.wine }}>{item.pricePerUnit}₾</span>
                <span className="text-xs" style={{ color: C.faint }}>#{item.sortOrder}</span>
                {deletingId === item.id ? (
                  <div className="flex gap-1">
                    <span className="text-xs" style={{ color: C.muted }}>Delete?</span>
                    <button onClick={() => handleDelete(item.id)} disabled={loading}
                      className="text-xs px-2 py-1 rounded font-medium text-white" style={{ backgroundColor: '#b91c1c' }}>Yes</button>
                    <button onClick={() => setDeletingId(null)}
                      className="text-xs px-2 py-1 rounded border" style={{ borderColor: C.border, color: C.muted }}>No</button>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(item)}
                      className="text-xs px-2 py-1 rounded border" style={{ borderColor: C.border, color: C.muted }}>Edit</button>
                    <button onClick={() => setDeletingId(item.id)}
                      className="text-xs px-2 py-1 rounded border" style={{ borderColor: '#fca5a5', color: '#b91c1c' }}>Delete</button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Add row */}
        {adding ? (
          <div className="grid items-center gap-2 px-5 py-3" style={{ backgroundColor: C.bg, gridTemplateColumns: '1fr 100px 80px 80px 120px' }}>
            <input style={inputStyle} value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Churchkhela" autoFocus
              onKeyDown={e => e.key === 'Escape' && setAdding(false)} />
            <input style={inputStyle} value={newUnit} onChange={e => setNewUnit(e.target.value)} placeholder="person" />
            <input style={inputStyle} type="number" value={newPrice} onChange={e => setNewPrice(e.target.value)} placeholder="0" />
            <span />
            <div className="flex gap-1">
              <button onClick={handleAdd} disabled={loading || !newName.trim() || !newUnit.trim()}
                className="text-xs px-2 py-1 rounded font-medium text-white" style={{ backgroundColor: C.wine }}>Add</button>
              <button onClick={() => { setAdding(false); setNewName(''); setNewUnit('person'); setNewPrice('') }}
                className="text-xs px-2 py-1 rounded border" style={{ borderColor: C.border, color: C.muted }}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="px-5 py-3" style={{ backgroundColor: C.bg }}>
            <button onClick={() => setAdding(true)} className="text-xs font-medium" style={{ color: C.wine }}>
              + Add masterclass item
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
