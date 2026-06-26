'use client'

import { useState, useRef, useEffect } from 'react'
import { HexColorPicker } from 'react-colorful'

interface Props {
  color: string
  onChange: (color: string) => void
}

export function ColorPicker({ color, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [hex, setHex] = useState(color)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { setHex(color) }, [color])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  function handleHexInput(val: string) {
    setHex(val)
    if (/^#[0-9a-fA-F]{6}$/.test(val)) onChange(val)
  }

  function handlePickerChange(val: string) {
    onChange(val)
    setHex(val)
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
          border: '1px solid #334155', backgroundColor: '#0f172a',
        }}
      >
        <div style={{
          width: 28, height: 28, borderRadius: 6,
          backgroundColor: color,
          border: '2px solid rgba(255,255,255,0.2)',
          boxShadow: `0 0 0 1px rgba(0,0,0,0.4)`,
          flexShrink: 0,
        }} />
        <span style={{ fontSize: 13, color: '#94a3b8', fontFamily: 'monospace', letterSpacing: 1 }}>
          {color}
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: '#475569' }}>
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 50, marginTop: 8,
          padding: 16, borderRadius: 14,
          backgroundColor: '#1e293b', border: '1px solid #334155',
          boxShadow: '0 24px 48px rgba(0,0,0,0.6)',
          minWidth: 220,
        }}>
          {/* The color wheel from react-colorful */}
          <HexColorPicker color={color} onChange={handlePickerChange} style={{ width: '100%' }} />

          {/* Hex input */}
          <div style={{ marginTop: 12, position: 'relative' }}>
            <span style={{
              position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
              color: '#475569', fontSize: 13, fontFamily: 'monospace',
            }}>#</span>
            <input
              type="text"
              value={hex.replace('#', '')}
              onChange={e => handleHexInput('#' + e.target.value)}
              maxLength={6}
              placeholder="7c1d23"
              style={{
                width: '100%', padding: '7px 10px 7px 22px',
                borderRadius: 7, border: '1px solid #334155',
                backgroundColor: '#0f172a', color: '#f1f5f9',
                fontSize: 13, fontFamily: 'monospace',
                outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Current color preview strip */}
          <div style={{
            marginTop: 10, height: 12, borderRadius: 6,
            backgroundColor: color,
            border: '1px solid rgba(255,255,255,0.1)',
          }} />
        </div>
      )}
    </div>
  )
}
