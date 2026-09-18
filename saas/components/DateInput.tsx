'use client'

import { useState, useEffect, useRef } from 'react'

type Props = {
  value: string          // YYYY-MM-DD or ''
  onChange: (v: string) => void  // called with YYYY-MM-DD or ''
  min?: string           // YYYY-MM-DD
  style?: React.CSSProperties
  className?: string
}

function isoToDisplay(iso: string) {
  if (!iso || iso.length !== 10) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function displayToIso(display: string) {
  const digits = display.replace(/\D/g, '')
  if (digits.length !== 8) return ''
  const d = digits.slice(0, 2), m = digits.slice(2, 4), y = digits.slice(4, 8)
  if (parseInt(d) < 1 || parseInt(d) > 31 || parseInt(m) < 1 || parseInt(m) > 12) return ''
  return `${y}-${m}-${d}`
}

export default function DateInput({ value, onChange, min, style, className }: Props) {
  const [text, setText] = useState(() => isoToDisplay(value))
  const nativeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setText(isoToDisplay(value))
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 8)
    let formatted = digits
    if (digits.length > 4) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
    } else if (digits.length > 2) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`
    }
    setText(formatted)
    const iso = displayToIso(formatted)
    if (iso) onChange(iso)
    else if (digits.length === 0) onChange('')
  }

  function handleBlur() {
    const iso = displayToIso(text)
    if (iso) setText(isoToDisplay(iso))
  }

  function handleNative(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value)
    // value prop update triggers the useEffect above to update text
  }

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <input
        type="text"
        value={text}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="DD/MM/YYYY"
        maxLength={10}
        className={className}
        style={{ ...style, paddingRight: '2.25rem' }}
      />
      {/*
        Real native date input, sized to actually cover the icon's hit area
        (not the old 0x0 box) and positioned on top of it. Tapping/clicking
        that zone hits this element directly, so the browser opens its own
        picker via normal default behavior — no JS showPicker() trigger
        needed, which is what made this unreliable on mobile (showPicker()
        on a 0x0 element is a no-op on some mobile engines). The rest of the
        field (the text portion) is left uncovered so it still opens the
        typing path. Its own onChange drives the value either way.
      */}
      <input
        ref={nativeRef}
        type="date"
        min={min}
        value={value}
        aria-label="Open calendar"
        onChange={handleNative}
        style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: 40,
          opacity: 0, cursor: 'pointer', border: 0, padding: 0, margin: 0,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', right: 0, top: 0, bottom: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 0.625rem', minWidth: 40, pointerEvents: 'none',
          color: 'var(--site-secondary)',
        }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      </div>
    </div>
  )
}
