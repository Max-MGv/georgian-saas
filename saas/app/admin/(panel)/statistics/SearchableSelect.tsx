'use client'

import { useState, useRef, useEffect } from 'react'
import { adminT } from '@/lib/adminT'

const C = {
  text: '#1c1008', muted: '#6b5a47', faint: '#a89070',
  border: '#e0d4c0', wine: 'var(--color-brand)',
}

export type SelectOption = { value: string; label: string }

type Props = {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]   // first option should be { value: '', label: 'All …' }
  placeholder?: string
  minWidth?: number
  locale?: string
}

export default function SearchableSelect({ value, onChange, options, placeholder = 'All', minWidth = 160, locale = 'en' }: Props) {
  const at = (key: string) => adminT(locale, key)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedLabel = options.find(o => o.value === value)?.label ?? ''

  // Close + reset search on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const filtered = search.trim()
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options

  function handleSelect(opt: SelectOption) {
    onChange(opt.value)
    setOpen(false)
    setSearch('')
  }

  function handleFocus() {
    setOpen(true)
    setSearch('')   // clear so user can type fresh filter
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', minWidth }}>

      {/* Input / trigger */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          backgroundColor: '#fffdf9',
          border: `1px solid ${open ? C.muted : C.border}`,
          borderRadius: 8, padding: '8px 12px', cursor: 'text',
          transition: 'border-color 0.15s',
        }}
        onClick={() => { setOpen(true); inputRef.current?.focus() }}
      >
        <input
          ref={inputRef}
          type="text"
          value={open ? search : selectedLabel}
          placeholder={open ? at('statistics.search') : placeholder}
          onChange={e => { setSearch(e.target.value); setOpen(true) }}
          onFocus={handleFocus}
          style={{
            border: 'none', outline: 'none', background: 'transparent',
            fontSize: '0.875rem', color: C.text, width: '100%', minWidth: 0,
          }}
        />
        <svg
          width="10" height="6" viewBox="0 0 10 6"
          style={{ flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
        >
          <path d="M1 1l4 4 4-4" stroke={C.faint} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </div>

      {/* Dropdown list */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
          backgroundColor: '#fffdf9', border: `1px solid ${C.border}`,
          borderRadius: 8, boxShadow: '0 4px 20px rgba(28,16,8,0.10)',
          zIndex: 200, maxHeight: 220, overflowY: 'auto',
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: '0.875rem', color: C.faint }}>{at('statistics.noMatches')}</div>
          ) : (
            filtered.map(opt => {
              const isSelected = opt.value === value
              const isHovered = opt.value === hovered
              return (
                <div
                  key={opt.value}
                  onMouseDown={e => { e.preventDefault(); handleSelect(opt) }}
                  onMouseEnter={() => setHovered(opt.value)}
                  onMouseLeave={() => setHovered('')}
                  style={{
                    padding: '9px 12px', fontSize: '0.875rem', cursor: 'pointer',
                    color: isSelected ? C.wine : C.text,
                    fontWeight: isSelected ? 600 : 400,
                    backgroundColor: isSelected ? '#fdf0e8' : isHovered ? '#f5ede0' : 'transparent',
                    transition: 'background-color 0.1s',
                  }}
                >
                  {opt.label}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
