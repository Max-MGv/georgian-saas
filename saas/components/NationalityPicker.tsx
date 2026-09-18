'use client'

// Type-ahead multi-select tag input for the company-booking nationality field
// (Plan-CompanyNationality). Backed by the static list in lib/countries.ts — no
// combobox library is installed anywhere in this codebase, so this follows the
// same hand-rolled, inline-styled convention as DateInput.tsx / OrdersFilters.tsx's
// dropdowns rather than pulling in a new dependency.

import { useState, useRef, useEffect } from 'react'
import { COUNTRIES, countryName } from '@/lib/countries'

type Props = {
  value: string[]                 // ISO codes already selected
  onChange: (codes: string[]) => void
  placeholder?: string
  emptyText?: string               // shown in the dropdown when nothing matches
}

const MAX_SUGGESTIONS = 8

export default function NationalityPicker({ value, onChange, placeholder, emptyText }: Props) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const query = text.trim().toLowerCase()
  const suggestions = query
    ? COUNTRIES.filter(c => !value.includes(c.code) && c.name.toLowerCase().includes(query)).slice(0, MAX_SUGGESTIONS)
    : COUNTRIES.filter(c => !value.includes(c.code)).slice(0, MAX_SUGGESTIONS)

  useEffect(() => {
    if (!open) return
    function close(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [open])

  function addCountry(code: string) {
    if (!value.includes(code)) onChange([...value, code])
    setText('')
    setHighlighted(0)
    inputRef.current?.focus()
  }

  function removeCountry(code: string) {
    onChange(value.filter(c => c !== code))
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlighted(h => Math.min(h + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = suggestions[highlighted]
      if (pick) addCountry(pick.code)
    } else if (e.key === 'Escape') {
      setOpen(false)
    } else if (e.key === 'Backspace' && text === '' && value.length > 0) {
      removeCountry(value[value.length - 1])
    }
  }

  const inputStyle: React.CSSProperties = {
    backgroundColor: 'var(--site-surface)',
    border: '1px solid var(--site-border)',
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: '0.875rem',
    color: 'var(--site-text)',
    outline: 'none',
    width: '100%',
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      {value.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {value.map(code => (
            <span
              key={code}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                backgroundColor: 'var(--site-surface)', border: '1px solid var(--site-border)',
                borderRadius: 999, padding: '4px 10px', fontSize: '0.8rem', color: 'var(--site-text)',
              }}
            >
              {countryName(code)}
              <button
                type="button"
                onClick={() => removeCountry(code)}
                aria-label={`Remove ${countryName(code)}`}
                style={{
                  border: 0, background: 'none', cursor: 'pointer', padding: 0,
                  display: 'flex', color: 'var(--site-secondary)', lineHeight: 1,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="text"
        value={text}
        placeholder={placeholder}
        onChange={e => { setText(e.target.value); setOpen(true); setHighlighted(0) }}
        onFocus={() => { setOpen(true); setHighlighted(0) }}
        onKeyDown={handleKeyDown}
        style={inputStyle}
        autoComplete="off"
      />

      {open && (
        <div
          role="listbox"
          className="absolute z-40 rounded-xl border shadow-lg mt-1"
          style={{
            backgroundColor: 'var(--site-surface)', borderColor: 'var(--site-border)',
            left: 0, right: 0, maxHeight: 220, overflowY: 'auto',
          }}
        >
          {suggestions.length === 0 ? (
            <div className="px-3 py-2 text-xs" style={{ color: 'var(--site-secondary)' }}>
              {emptyText ?? 'No matches'}
            </div>
          ) : (
            suggestions.map((c, i) => (
              <button
                key={c.code}
                type="button"
                role="option"
                aria-selected={i === highlighted}
                onClick={() => addCountry(c.code)}
                onMouseEnter={() => setHighlighted(i)}
                className="w-full text-left px-3 py-1.5 text-sm"
                style={{
                  backgroundColor: i === highlighted ? 'color-mix(in srgb, var(--color-brand) 10%, var(--site-surface))' : 'transparent',
                  color: 'var(--site-text)', cursor: 'pointer', border: 0,
                }}
              >
                {c.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
