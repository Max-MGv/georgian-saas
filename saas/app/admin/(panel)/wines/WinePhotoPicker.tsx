'use client'

// T-302: one shared photo library window, opened from "Change photo" on a wine or a vintage. Replaces the old
// per-wine strip of tiny thumbnails that repeated the whole library under every wine and every vintage.
// Nothing here writes to the database except upload / delete of files; the parent assigns the chosen photo.

import { useEffect, useMemo, useRef, useState } from 'react'
import { uploadWineImage } from '@/app/actions/uploadImage'
import { adminT } from '@/lib/adminT'

const C = {
  text: 'var(--site-text)', muted: 'var(--site-muted)', faint: 'var(--site-secondary)',
  border: 'var(--site-border)', wine: 'var(--color-brand)',
}

export type PhotoItem = {
  url: string
  /** File name shown under the photo. */
  file: string
  /** Shipped with the app, not an upload: never deletable. */
  builtin: boolean
  /** Set for the generic default bottles: shown instead of the file name, and the tile says "Default". */
  label?: string
  /** Wines / vintages using it, as display names ("Saperavi Reserve 2020"). */
  users: string[]
}

// Bucket-relative path of an uploaded photo, e.g. https://xxx.supabase.co/.../wine-photos/tenantId/file.webp → "tenantId/file.webp"
export function storagePathFromUrl(url: string) {
  const marker = '/wine-photos/'
  const idx = url.indexOf(marker)
  return idx === -1 ? '' : url.slice(idx + marker.length)
}

type Tab = 'all' | 'unused' | 'used'

export default function WinePhotoPicker({
  locale, title, vintageYear, inheritsProductPhoto, photos, current, onApply, onUploaded, onDeletePhoto, onClose,
}: {
  locale: string
  title: string
  vintageYear?: number
  /** A vintage without its own photo (it currently shows the product photo). */
  inheritsProductPhoto?: boolean
  photos: PhotoItem[]
  current: string | null
  onApply: (url: string) => void
  onUploaded: (urls: string[]) => void
  onDeletePhoto: (url: string) => Promise<void>
  onClose: () => void
}) {
  const at = (key: string, vars?: Record<string, string | number>) => adminT(locale, key, vars)
  const [selected, setSelected] = useState<string | null>(current)
  const [tab, setTab] = useState<Tab>('all')
  const [q, setQ] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [newUrls, setNewUrls] = useState<string[]>([])
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    // Keep the page behind the window from scrolling (on a phone a swipe inside the grid would otherwise move the page).
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prevOverflow }
  }, [onClose])

  const counts = useMemo(() => ({
    all: photos.length,
    unused: photos.filter(p => p.users.length === 0).length,
    used: photos.filter(p => p.users.length > 0).length,
  }), [photos])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return photos.filter(p => {
      if (tab === 'unused' && p.users.length > 0) return false
      if (tab === 'used' && p.users.length === 0) return false
      if (!needle) return true
      return p.file.toLowerCase().includes(needle) || (p.label ?? '').toLowerCase().includes(needle)
        || p.users.some(u => u.toLowerCase().includes(needle))
    })
  }, [photos, tab, q])

  const selectedPhoto = photos.find(p => p.url === selected) ?? null
  const chosen = selectedPhoto && selected !== current ? selectedPhoto : null

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setUploading(true); setError(null)
    try {
      const urls = await Promise.all(files.map(async file => {
        const fd = new FormData()
        fd.append('file', file)
        return uploadWineImage(fd)
      }))
      onUploaded(urls)
      setNewUrls(prev => [...urls, ...prev])
      setSelected(urls[0])
      setTab('all'); setQ('')
    } catch (err) {
      setError(at('wines.uploadFailed') + ' ' + (err instanceof Error ? err.message : at('wines.unknownError')))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleConfirmDelete() {
    if (!confirmDelete) return
    setDeleting(true); setError(null)
    try {
      await onDeletePhoto(confirmDelete)
      if (selected === confirmDelete) setSelected(null)
      setConfirmDelete(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : at('wines.unknownError'))
    } finally {
      setDeleting(false)
    }
  }

  const delPhoto = confirmDelete ? photos.find(p => p.url === confirmDelete) : null
  const hint = chosen
    ? at('wines.photo.hintSelected', { name: title }) + (chosen.users.length ? at('wines.photo.hintAlso', { names: chosen.users.join(', ') }) : '')
    : inheritsProductPhoto ? at('wines.photo.hintInherit') : at('wines.photo.hintPick')

  const tabBtn = (k: Tab, label: string, n: number) => (
    <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k}
      className="rounded-full border px-3 py-2 text-xs font-semibold"
      style={{
        borderColor: tab === k ? C.wine : C.border, color: tab === k ? C.wine : C.muted,
        backgroundColor: tab === k ? 'color-mix(in srgb, var(--color-brand) 10%, white)' : 'transparent',
      }}>
      {label}<span className="ml-1 font-normal opacity-70">{n}</span>
    </button>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(20,14,12,0.55)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={at('wines.photo.popupTitle', { name: title })}
        className="flex flex-col w-full overflow-hidden rounded-2xl outline-none"
        style={{ maxWidth: 780, maxHeight: 'min(720px, 92dvh)', backgroundColor: '#ffffff', boxShadow: '0 18px 50px rgba(30,20,15,0.28)' }}>

        <div className="flex items-start gap-3 px-4 pt-4 pb-2">
          <div className="min-w-0">
            <h2 className="text-base font-bold" style={{ color: C.text }}>{at('wines.photo.popupTitle', { name: title })}</h2>
            <p className="text-xs mt-0.5" style={{ color: C.muted }}>
              {vintageYear != null && <>{at('wines.photo.vintageOnly', { year: vintageYear })} · </>}
              {at('wines.photo.libraryCount', { n: counts.all })}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={at('wines.photo.close')}
            className="ml-auto text-2xl leading-none px-2" style={{ color: C.muted }}>×</button>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={at('wines.photo.search')}
            className="rounded-lg border px-3 py-2 text-sm"
            // Takes the whole row on a phone (the tabs wrap under it) and the free space next to the tabs on a wide screen.
            style={{ flex: '1 1 200px', minWidth: 0, borderColor: C.border, color: C.text, backgroundColor: 'var(--site-bg)' }} />
          <div className="flex flex-wrap gap-1">
            {tabBtn('all', at('wines.photo.tabAll'), counts.all)}
            {tabBtn('unused', at('wines.photo.tabUnused'), counts.unused)}
            {tabBtn('used', at('wines.photo.tabUsed'), counts.used)}
          </div>
        </div>

        <div className="flex-1 overflow-auto px-4 pb-4" style={{ minHeight: 160, overscrollBehavior: 'contain' }}>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))' }}>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center text-sm font-semibold gap-1 p-2"
              style={{ borderColor: C.border, color: C.muted, minHeight: 166 }}>
              <span className="text-2xl leading-none" style={{ color: C.faint }}>+</span>
              {uploading ? at('wines.photo.uploading') : at('wines.photo.upload')}
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />

            {shown.map(p => {
              const isSel = selected === p.url
              const usage = p.users.length === 0 ? null
                : p.users[0] + (p.users.length > 1 ? ' ' + at('wines.photo.more', { n: p.users.length - 1 }) : '')
              return (
                <div key={p.url} className="group relative">
                  <button type="button" onClick={() => setSelected(p.url)} aria-pressed={isSel}
                    className="w-full h-full flex flex-col text-left rounded-xl overflow-hidden border"
                    style={{
                      borderColor: isSel ? C.wine : C.border, borderWidth: isSel ? 2 : 1, backgroundColor: '#faf6f0',
                      boxShadow: isSel ? '0 0 0 3px color-mix(in srgb, var(--color-brand) 15%, white)' : undefined,
                    }}>
                    <span className="flex items-center justify-center p-1.5" style={{ height: 108 }}>
                      <img src={p.url} alt="" className="max-w-full object-contain" style={{ height: '100%' }} loading="lazy" />
                    </span>
                    <span className="block px-2 py-1.5 border-t flex-1"
                      style={{ borderColor: C.border, backgroundColor: isSel ? 'color-mix(in srgb, var(--color-brand) 8%, white)' : '#ffffff', minHeight: 58 }}>
                      <span className={`block text-[10.5px] truncate ${p.label ? '' : 'font-mono'}`} style={{ color: C.faint }} title={p.label ?? p.file}>{p.label ?? p.file}</span>
                      <span className="block text-xs mt-0.5 font-semibold overflow-hidden"
                        style={{ color: usage ? C.text : C.faint, fontWeight: usage ? 600 : 500, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                        {usage ?? (p.label ? at('wines.photo.default') : p.builtin ? at('wines.photo.builtin') : at('wines.photo.unused'))}
                      </span>
                    </span>
                  </button>
                  {(current === p.url || newUrls.includes(p.url)) && (
                    <span className="absolute top-1.5 left-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full pointer-events-none"
                      style={current === p.url ? { backgroundColor: C.wine, color: '#fff' } : { backgroundColor: '#eef5e1', color: '#4d7a12' }}>
                      {current === p.url ? at('wines.photo.current') : at('wines.photo.new')}
                    </span>
                  )}
                  {!p.builtin && (
                    <button type="button" onClick={() => setConfirmDelete(p.url)} aria-label={`${at('wines.photo.delete')}: ${p.file}`} title={at('wines.photo.delete')}
                      className="absolute top-1 right-1 w-8 h-8 rounded-full text-white text-sm flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                      style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>🗑</button>
                  )}
                </div>
              )
            })}

            {shown.length === 0 && (
              <p className="text-sm text-center py-8" style={{ gridColumn: '1 / -1', color: C.muted }}>{at('wines.photo.noMatch', { q })}</p>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="px-4 py-2 text-xs" style={{ backgroundColor: '#fdecea', color: '#a3262e' }}>{error}</p>
        )}

        {delPhoto && (
          <div role="alert" className="px-4 py-3 border-t text-sm" style={{ backgroundColor: '#fbf0dc', borderColor: C.border, color: C.text }}>
            <div className="flex items-start gap-3">
              {/* The photo the question is about, so it is clear which one is being deleted. */}
              <img src={delPhoto.url} alt="" className="flex-shrink-0 rounded border object-contain"
                style={{ width: 40, height: 52, borderColor: C.border, backgroundColor: '#faf6f0' }} />
              <p className="min-w-0">
                {delPhoto.users.length > 0
                  ? at('wines.photo.delUsed', { names: delPhoto.users.join(', ') })
                  : at('wines.photo.delUnused')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              <button type="button" onClick={handleConfirmDelete} disabled={deleting}
                className="px-3 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#a3262e' }}>
                {delPhoto.users.length > 0 ? at('wines.photo.delYes') : at('wines.photo.delete')}
              </button>
              <button type="button" onClick={() => setConfirmDelete(null)} disabled={deleting}
                className="px-3 py-2.5 rounded-lg text-sm border" style={{ borderColor: C.border, color: C.muted, backgroundColor: '#fff' }}>
                {at('wines.photo.keep')}
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-t" style={{ borderColor: C.border }}>
          <span className="text-xs flex-1 min-w-[180px]" style={{ color: C.muted }}>{hint}</span>
          <div className="flex gap-2 ml-auto">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm border"
              style={{ borderColor: C.border, color: C.muted }}>{at('wines.cancel')}</button>
            <button type="button" disabled={!chosen} onClick={() => chosen && onApply(chosen.url)}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
              style={{ backgroundColor: C.wine }}>{at('wines.photo.useThis')}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
