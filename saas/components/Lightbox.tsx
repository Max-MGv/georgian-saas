'use client'

/**
 * Full-screen image viewer (Plan-TicketsV2 1.2) - ticket screenshots, and a client's own screenshot on My Reports: opens over the page instead of a
 * new tab. Esc / click on the dark area / ✕ closes; ← → (keys, buttons or a swipe) step between images;
 * click the image to zoom to its real size and scroll around.
 */

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, X, ZoomIn, ZoomOut } from 'lucide-react'

export type LightboxImage = { src: string; name: string }

export default function Lightbox({ images, index, onIndex, onClose }: {
  images: LightboxImage[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const [zoom, setZoom] = useState(false)
  const touchX = useRef<number | null>(null)
  const count = images.length
  const img = images[index]
  const go = (d: number) => { setZoom(false); onIndex((index + d + count) % count) }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose() }
      else if (e.key === 'ArrowRight' && count > 1) go(1)
      else if (e.key === 'ArrowLeft' && count > 1) go(-1)
    }
    // Capture phase: the ticket panel underneath also closes on Escape, and only the viewer should.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  if (!img) return null
  const btn = { background: 'rgba(15,23,42,0.75)', border: '1px solid #334155', color: '#e2e8f0', borderRadius: 999, width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' } as const

  return (
    <div
      role="dialog" aria-modal="true" aria-label={`Image ${index + 1} of ${count}: ${img.name}`}
      onClick={onClose}
      onTouchStart={e => { touchX.current = e.touches[0].clientX }}
      onTouchEnd={e => {
        const start = touchX.current; touchX.current = null
        if (start === null || zoom || count < 2) return
        const dx = e.changedTouches[0].clientX - start
        if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1)
      }}
      style={{ position: 'fixed', inset: 0, zIndex: 9200, backgroundColor: 'rgba(2,6,23,0.92)', display: 'flex', flexDirection: 'column' }}
    >
      <div className="flex items-center gap-2" style={{ padding: '10px 12px', color: '#cbd5e1', fontSize: 13 }} onClick={e => e.stopPropagation()}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>
          {count > 1 && <strong style={{ marginRight: 8 }}>{index + 1} / {count}</strong>}{img.name}
        </span>
        <button style={btn} onClick={() => setZoom(z => !z)} aria-label={zoom ? 'Fit to screen' : 'Zoom to real size'} title={zoom ? 'Fit to screen' : 'Real size'}>
          {zoom ? <ZoomOut size={18} /> : <ZoomIn size={18} />}
        </button>
        <a style={btn} href={img.src} target="_blank" rel="noopener noreferrer" aria-label="Open original in a new tab" title="Open original"><ExternalLink size={17} /></a>
        <button style={btn} onClick={onClose} aria-label="Close image" title="Close (Esc)"><X size={20} /></button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: zoom ? 'auto' : 'hidden', display: 'flex', alignItems: zoom ? 'flex-start' : 'center', justifyContent: zoom ? 'flex-start' : 'center', padding: zoom ? 0 : '0 12px 16px' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={img.src} alt={img.name}
          onClick={e => { e.stopPropagation(); setZoom(z => !z) }}
          style={zoom
            ? { maxWidth: 'none', cursor: 'zoom-out', margin: 'auto' }
            : { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', cursor: 'zoom-in', borderRadius: 6, boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}
        />
      </div>

      {count > 1 && (
        <>
          <button style={{ ...btn, position: 'absolute', left: 12, top: '50%' }} onClick={e => { e.stopPropagation(); go(-1) }} aria-label="Previous image"><ChevronLeft size={22} /></button>
          <button style={{ ...btn, position: 'absolute', right: 12, top: '50%' }} onClick={e => { e.stopPropagation(); go(1) }} aria-label="Next image"><ChevronRight size={22} /></button>
        </>
      )}
    </div>
  )
}
