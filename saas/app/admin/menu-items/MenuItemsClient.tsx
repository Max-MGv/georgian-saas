'use client'

import { useState } from 'react'
import { createMenuItem, updateMenuItem, deleteMenuItem } from '@/app/actions/menuItems'

const C = {
  text: '#1c1008', muted: '#6b5a47', faint: '#a89070',
  border: '#e0d4c0', bg: '#fff9f3', wine: 'var(--color-brand)',
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

type MenuItem = {
  id: string
  name: string
  type: string
  active: boolean
  sortOrder: number
}

type Props = { items: MenuItem[] }

type SectionType = 'VEGETABLE' | 'MEAT'

const SECTIONS: { type: SectionType; label: string; emoji: string }[] = [
  { type: 'VEGETABLE', label: 'Vegetable Dishes', emoji: '🥦' },
  { type: 'MEAT',      label: 'Meat Dishes',      emoji: '🥩' },
]

function Section({
  type, label, emoji, items,
}: {
  type: SectionType
  label: string
  emoji: string
  items: MenuItem[]
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editSort, setEditSort] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(false)

  function openEdit(item: MenuItem) {
    setEditingId(item.id)
    setEditName(item.name)
    setEditSort(String(item.sortOrder))
  }

  async function handleSave(id: string) {
    if (!editName.trim()) return
    setLoading(true)
    await updateMenuItem(id, { name: editName, sortOrder: Number(editSort) || 0 })
    setEditingId(null)
    setLoading(false)
  }

  async function handleToggleActive(item: MenuItem) {
    await updateMenuItem(item.id, { active: !item.active })
  }

  async function handleDelete(id: string) {
    setLoading(true)
    await deleteMenuItem(id)
    setDeletingId(null)
    setLoading(false)
  }

  async function handleAdd() {
    if (!newName.trim()) return
    setLoading(true)
    await createMenuItem({ name: newName, type })
    setNewName('')
    setAdding(false)
    setLoading(false)
  }

  return (
    <div className="rounded-xl border overflow-hidden mb-6" style={{ borderColor: C.border }}>
      {/* Section header */}
      <div className="px-5 py-3 border-b flex items-center justify-between" style={{ backgroundColor: '#f5efe6', borderColor: C.border }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#8b4513' }}>
          {emoji} {label}
        </p>
        <span className="text-xs" style={{ color: C.faint }}>{items.length} item{items.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Items */}
      {items.length === 0 && !adding && (
        <div className="px-5 py-4 text-sm" style={{ color: C.faint, backgroundColor: C.bg }}>
          No items yet. Add one below.
        </div>
      )}

      {items.map((item, i) => (
        <div
          key={item.id}
          className="px-5 py-3"
          style={{
            backgroundColor: C.bg,
            borderBottom: i < items.length - 1 || adding ? `1px solid ${C.border}` : 'none',
          }}
        >
          {editingId === item.id ? (
            /* Edit row */
            <div className="flex items-center gap-2">
              <input
                style={{ ...inputStyle, flex: 1 }}
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave(item.id)}
                autoFocus
              />
              <input
                style={{ ...inputStyle, width: 64 }}
                type="number"
                value={editSort}
                onChange={e => setEditSort(e.target.value)}
                placeholder="Order"
                title="Sort order"
              />
              <button
                onClick={() => handleSave(item.id)}
                disabled={loading}
                className="text-xs px-3 py-1.5 rounded-lg font-medium text-white"
                style={{ backgroundColor: C.wine }}
              >
                Save
              </button>
              <button
                onClick={() => setEditingId(null)}
                className="text-xs px-3 py-1.5 rounded-lg border"
                style={{ borderColor: C.border, color: C.muted }}
              >
                Cancel
              </button>
            </div>
          ) : (
            /* Display row */
            <div className="flex items-center gap-3">
              {/* Active toggle */}
              <button
                onClick={() => handleToggleActive(item)}
                title={item.active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                className="flex-shrink-0 w-2 h-2 rounded-full"
                style={{ backgroundColor: item.active ? '#16a34a' : '#d1c4b0' }}
              />
              <span
                className="flex-1 text-sm"
                style={{ color: item.active ? C.text : C.faint, textDecoration: item.active ? 'none' : 'line-through' }}
              >
                {item.name}
              </span>
              <span className="text-xs" style={{ color: C.faint }}>#{item.sortOrder}</span>

              {deletingId === item.id ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: C.muted }}>Delete?</span>
                  <button
                    onClick={() => handleDelete(item.id)}
                    disabled={loading}
                    className="text-xs px-2 py-1 rounded font-medium text-white"
                    style={{ backgroundColor: '#b91c1c' }}
                  >Yes</button>
                  <button
                    onClick={() => setDeletingId(null)}
                    className="text-xs px-2 py-1 rounded border"
                    style={{ borderColor: C.border, color: C.muted }}
                  >No</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEdit(item)}
                    className="text-xs px-2 py-1 rounded border"
                    style={{ borderColor: C.border, color: C.muted }}
                  >Edit</button>
                  <button
                    onClick={() => setDeletingId(item.id)}
                    className="text-xs px-2 py-1 rounded border"
                    style={{ borderColor: '#fca5a5', color: '#b91c1c' }}
                  >Delete</button>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Add row */}
      {adding ? (
        <div className="px-5 py-3 flex items-center gap-2" style={{ backgroundColor: C.bg }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setAdding(false); setNewName('') } }}
            placeholder="Dish name…"
            autoFocus
          />
          <button
            onClick={handleAdd}
            disabled={loading || !newName.trim()}
            className="text-xs px-3 py-1.5 rounded-lg font-medium text-white"
            style={{ backgroundColor: C.wine }}
          >Add</button>
          <button
            onClick={() => { setAdding(false); setNewName('') }}
            className="text-xs px-3 py-1.5 rounded-lg border"
            style={{ borderColor: C.border, color: C.muted }}
          >Cancel</button>
        </div>
      ) : (
        <div className="px-5 py-3" style={{ backgroundColor: C.bg }}>
          <button
            onClick={() => setAdding(true)}
            className="text-xs font-medium"
            style={{ color: C.wine }}
          >+ Add dish</button>
        </div>
      )}
    </div>
  )
}

export default function MenuItemsClient({ items }: Props) {
  return (
    <div>
      <p className="text-sm mb-6" style={{ color: C.muted }}>
        Manage hot dish options for the company booking form. Active items appear as dropdown choices.
        Use the sort order number to control the display order.
      </p>
      {SECTIONS.map(s => (
        <Section
          key={s.type}
          type={s.type}
          label={s.label}
          emoji={s.emoji}
          items={items.filter(i => i.type === s.type)}
        />
      ))}
    </div>
  )
}
