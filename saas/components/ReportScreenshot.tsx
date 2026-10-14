'use client'

/** A reporter's screenshot on My Reports: a thumbnail that opens in the image viewer (not a new tab). */

import { useState } from 'react'
import Lightbox from '@/components/Lightbox'

export default function ReportScreenshot({ src, label }: { src: string; label: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={label} title={label}
        className="mt-3 block overflow-hidden rounded-lg border" style={{ borderColor: 'var(--site-border)', width: 120, height: 80, padding: 0, cursor: 'zoom-in' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      </button>
      {open && <Lightbox images={[{ src, name: label }]} index={0} onIndex={() => {}} onClose={() => setOpen(false)} />}
    </>
  )
}
