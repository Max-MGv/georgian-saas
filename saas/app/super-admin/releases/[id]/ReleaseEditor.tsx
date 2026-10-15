'use client'

/**
 * One release, edited in place (vault/Plan-ReleaseNotes.md). Every field saves when you leave it. A switch at the top
 * chooses the language being edited; "Preview as client" shows exactly the clients' What's new page.
 * Publish + "Show to clients" are Max's switches (the token API can never flip them).
 */

import { useRef, useState, useTransition, type CSSProperties, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowDown, ArrowLeft, ArrowUp, Eye, EyeOff, ImagePlus, Monitor, Plus, Rocket, Smartphone, Trash2, Undo2, X } from 'lucide-react'
import type { ReleaseDetail, ReleaseEntryView, ReleaseImageView } from '@/lib/releaseService'
import {
  addEntryAction, deleteEntryAction, deleteReleaseAction, deleteReleaseImageAction, moveEntryAction, updateEntryAction,
  updateReleaseAction, uploadReleaseImage, type ReleaseResult,
} from '@/app/actions/releases'
import WhatsNew from '@/components/WhatsNew'
import { C, EnvPill, IconButton, buttonStyle, ghostButtonStyle, inputStyle } from '../../tickets/ui'

type Lang = 'en' | 'ka'
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const card: CSSProperties = { backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }
const label = (t: ReactNode) => <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: C.faint, marginBottom: 5 }}>{t}</div>

// Light "site" colours so the preview looks like the clients' admin, not the dark super-admin.
const PREVIEW_VARS = {
  '--site-bg': '#f5efe6', '--site-surface': '#fffaf3', '--site-border': '#e6d9c6', '--site-text': '#1c1008',
  '--site-muted': '#6b5a47', '--site-secondary': '#8a7a66', '--color-brand': '#7a2e2e',
} as CSSProperties

export default function ReleaseEditor({ release: r, env }: { release: ReleaseDetail; env: 'PRODUCTION' | 'STAGING' | 'LOCAL' }) {
  const router = useRouter()
  const [refreshing, startTransition] = useTransition()
  const [acting, setActing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lang, setLang] = useState<Lang>('en')
  const [preview, setPreview] = useState<Lang | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const busy = acting || refreshing
  // The switch moves at once, then the saved value takes over (otherwise it snaps back until the refresh lands).
  const [pendingVisible, setPendingVisible] = useState<boolean | null>(null)
  if (pendingVisible !== null && pendingVisible === r.clientVisible) setPendingVisible(null)
  const shownToClients = pendingVisible ?? r.clientVisible

  async function run(fn: () => Promise<ReleaseResult>): Promise<boolean> {
    setActing(true); setError(null)
    try {
      const res = await fn()
      if ('error' in res) { setError(res.error); return false }
      startTransition(() => router.refresh())
      return true
    } catch {
      setError('Something went wrong. Please try again.')
      return false
    } finally {
      setActing(false)
    }
  }

  const published = r.status === 'PUBLISHED'
  const ka = lang === 'ka'

  return (
    <div style={{ color: C.text, maxWidth: 980 }}>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Link href="/super-admin/releases" style={{ color: C.muted, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 4 }}><ArrowLeft size={15} aria-hidden /> Releases</Link>
        <EnvPill env={env} />
      </div>

      {/* ── Release header: date, publish, show to clients ── */}
      <div style={{ ...card, marginBottom: 14 }} className="flex flex-wrap items-center gap-3">
        <Rocket size={18} color={published ? '#86efac' : C.faint} aria-hidden />
        <input type="date" defaultValue={r.releasedOn} aria-label="Release date" style={{ ...inputStyle, fontSize: 15, fontWeight: 700 }}
          onBlur={e => { if (e.target.value && e.target.value !== r.releasedOn) void run(() => updateReleaseAction(r.id, { releasedOn: e.target.value })) }} />
        <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, border: `1px solid ${published ? '#14532d' : '#334155'}`, color: published ? '#86efac' : C.muted }}>
          {published ? 'Published' : 'Draft'}
        </span>
        {published ? (
          <button style={ghostButtonStyle} disabled={busy} onClick={() => void run(() => updateReleaseAction(r.id, { status: 'DRAFT' }))} title="Back to draft - also hides it from clients"><Undo2 size={14} aria-hidden /> Unpublish</button>
        ) : (
          <button style={buttonStyle} disabled={busy || r.entries.length === 0} onClick={() => void run(() => updateReleaseAction(r.id, { status: 'PUBLISHED' }))} title={r.entries.length === 0 ? 'Add a change first' : 'Publish'}><Rocket size={14} aria-hidden /> Publish</button>
        )}
        <label title={published ? '' : 'Publish first'} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: published ? C.text : C.faint, cursor: published ? 'pointer' : 'not-allowed' }}>
          <input type="checkbox" role="switch" checked={shownToClients} disabled={busy || !published} aria-label="Show to clients"
            onChange={e => { const v = e.target.checked; setPendingVisible(v); void run(() => updateReleaseAction(r.id, { clientVisible: v })).then(ok => { if (!ok) setPendingVisible(null) }) }} />
          {shownToClients ? <Eye size={15} color="#7dd3fc" aria-hidden /> : <EyeOff size={15} aria-hidden />} Show to clients
        </label>
        <div style={{ marginLeft: 'auto' }} className="flex items-center gap-2">
          <div style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }} role="group" aria-label="Language being edited">
            {(['en', 'ka'] as const).map(l => (
              <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l} style={{ padding: '6px 11px', fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', backgroundColor: lang === l ? '#312e81' : 'transparent', color: lang === l ? '#e0e7ff' : C.muted }}>
                {l === 'en' ? 'English' : 'ქართული'}
              </button>
            ))}
          </div>
          <button style={{ ...ghostButtonStyle, borderColor: preview ? '#6366f1' : C.border }} onClick={() => setPreview(p => (p ? null : lang))}>
            <Eye size={14} aria-hidden /> {preview ? 'Back to editing' : 'Preview as client'}
          </button>
          {!published && (
            <IconButton icon={Trash2} label="Delete this draft" disabled={busy} onClick={() => {
              if (window.confirm('Delete this draft release and its screenshots?')) void run(() => deleteReleaseAction(r.id)).then(ok => { if (ok) router.push('/super-admin/releases') })
            }} />
          )}
        </div>
      </div>
      {error && <div role="alert" style={{ color: '#fca5a5', fontSize: 13, margin: '-4px 0 12px' }}>{error}</div>}

      {preview ? (
        <div style={{ ...PREVIEW_VARS, backgroundColor: 'var(--site-bg)', borderRadius: 12, padding: 20 }}>
          <div className="flex items-center gap-2 mb-4" style={{ fontSize: 12, color: '#6b5a47' }}>
            Preview — what clients see{r.clientVisible ? '' : ' once this is published and shown to clients'} ·
            {(['en', 'ka'] as const).map(l => <button key={l} onClick={() => setPreview(l)} style={{ fontWeight: preview === l ? 700 : 400, textDecoration: preview === l ? 'underline' : 'none' }}>{l === 'en' ? 'English' : 'ქართული'}</button>)}
          </div>
          <WhatsNew
            releases={[{ ...r, entries: r.entries.filter(e => e.clientVisible) }]} locale={preview}
            labels={preview === 'ka'
              ? { before: 'მანამდე', after: 'შემდეგ', howTo: 'როგორ გამოვიყენოთ', takeMeThere: 'გადასვლა', empty: 'აქ ჯერ არაფერია.', dragHint: 'გადაათრიეთ შესადარებლად - ან გახსენით:' }
              : { before: 'Before', after: 'After', howTo: 'How to use it', takeMeThere: 'Take me there', empty: 'Nothing here yet.', dragHint: 'Drag to compare - or open:' }}
          />
        </div>
      ) : (
        <>
          <div style={{ ...card, marginBottom: 14 }}>
            {label(`Summary${ka ? ' (Georgian)' : ''} — one or two sentences at the top of this release`)}
            <AutoField key={`summary-${lang}`} value={ka ? r.summaryKa : r.summary} placeholder={ka ? r.summary || 'Georgian summary…' : 'e.g. Faster settings, and wine orders can now have a delivery date.'}
              rows={2} busy={busy} onSave={v => run(() => updateReleaseAction(r.id, ka ? { summaryKa: v } : { summary: v }))} />
          </div>

          <div className="flex flex-col gap-3">
            {r.entries.map((e, i) => (
              <EntryCard key={e.id} e={e} lang={lang} busy={busy} first={i === 0} last={i === r.entries.length - 1} run={run} setError={setError} />
            ))}
          </div>

          <div className="flex flex-wrap gap-2 mt-4" style={{ ...card, borderStyle: 'dashed' }}>
            <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="+ Add a change — its title, in plain client language" aria-label="New change title"
              onKeyDown={e => { if (e.key === 'Enter' && newTitle.trim()) void run(() => addEntryAction(r.id, { title: newTitle })).then(ok => { if (ok) setNewTitle('') }) }}
              style={{ ...inputStyle, flex: '1 1 260px', fontSize: 14 }} />
            <button style={buttonStyle} disabled={busy || !newTitle.trim()} onClick={() => void run(() => addEntryAction(r.id, { title: newTitle })).then(ok => { if (ok) setNewTitle('') })}><Plus size={15} aria-hidden /> Add</button>
          </div>
        </>
      )}
    </div>
  )
}

/** A text field that keeps your typing and saves when you leave it; adopts a newer server value when you are not editing. */
function AutoField({ value, onSave, placeholder, rows = 1, busy, mono, ariaLabel }: {
  value: string; onSave: (v: string) => Promise<boolean>; placeholder?: string; rows?: number; busy: boolean; mono?: boolean; ariaLabel?: string
}) {
  const [draft, setDraft] = useState(value)
  const [seen, setSeen] = useState(value)
  const [focused, setFocused] = useState(false)
  if (seen !== value) { setSeen(value); if (!focused) setDraft(value) }
  const common = {
    value: draft, placeholder, 'aria-label': ariaLabel ?? placeholder, disabled: false,
    onFocus: () => setFocused(true),
    onBlur: () => { setFocused(false); if (draft !== value) void onSave(draft) },
    style: { ...inputStyle, width: '100%', fontSize: 14, lineHeight: 1.5, fontFamily: mono ? 'ui-monospace, monospace' : undefined, opacity: busy ? 0.85 : 1 } as CSSProperties,
  }
  return rows > 1
    ? <textarea {...common} rows={rows} onChange={e => setDraft(e.target.value)} style={{ ...common.style, resize: 'vertical' }} />
    : <input {...common} onChange={e => setDraft(e.target.value)} />
}

function EntryCard({ e, lang, busy, first, last, run, setError }: {
  e: ReleaseEntryView; lang: Lang; busy: boolean; first: boolean; last: boolean
  run: (fn: () => Promise<ReleaseResult>) => Promise<boolean>; setError: (s: string | null) => void
}) {
  const ka = lang === 'ka'
  const [viewport, setViewport] = useState<'desktop' | 'phone'>('desktop')
  const save = (patch: Parameters<typeof updateEntryAction>[1]) => run(() => updateEntryAction(e.id, patch))
  const upload = async (files: File[], kind: 'BEFORE' | 'AFTER' | 'IMAGE', pair: number) => {
    for (const f of files) {
      if (!IMAGE_TYPES.includes(f.type)) { setError('Only PNG, JPEG, WebP or GIF images.'); continue }
      if (f.size > 4 * 1024 * 1024) { setError('Image is too large (max 4 MB).'); continue }
      const fd = new FormData()
      fd.set('entryId', e.id); fd.set('file', f); fd.set('kind', kind); fd.set('pair', String(pair)); fd.set('viewport', viewport)
      if (!(await run(() => uploadReleaseImage(fd)))) break
    }
  }
  const pairs = [...new Set(e.images.filter(i => i.kind !== 'IMAGE').map(i => i.pair))].sort((a, b) => a - b)
  const nextPair = pairs.length ? Math.max(...pairs) + 1 : 1
  const singles = e.images.filter(i => i.kind === 'IMAGE')

  return (
    <div style={{ ...card, opacity: e.clientVisible ? 1 : 0.8, borderColor: e.clientVisible ? C.border : '#3f3f46' }}
      onPaste={ev => { const f = Array.from(ev.clipboardData.files); if (f.some(x => x.type.startsWith('image/'))) { ev.preventDefault(); void upload(f, 'IMAGE', 0) } }}>
      <div className="flex items-center gap-2 mb-2">
        <IconButton icon={ArrowUp} label="Move up" disabled={busy || first} onClick={() => void run(() => moveEntryAction(e.id, -1))} />
        <IconButton icon={ArrowDown} label="Move down" disabled={busy || last} onClick={() => void run(() => moveEntryAction(e.id, 1))} />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: e.clientVisible ? '#7dd3fc' : C.faint, cursor: 'pointer', marginLeft: 6 }} title="Internal changes (e.g. Super Admin tools) stay hidden from clients">
          <input type="checkbox" checked={e.clientVisible} disabled={busy} onChange={ev => void save({ clientVisible: ev.target.checked })} aria-label="Clients see this change" />
          {e.clientVisible ? 'Clients see this' : 'Internal — hidden from clients'}
        </label>
        <div style={{ marginLeft: 'auto' }}>
          <IconButton icon={Trash2} label="Delete this change" disabled={busy} onClick={() => { if (window.confirm(`Delete "${e.title}"?`)) void run(() => deleteEntryAction(e.id)) }} />
        </div>
      </div>

      {label(ka ? 'Title (Georgian)' : 'Title')}
      <AutoField key={`t-${lang}`} value={ka ? e.titleKa : e.title} placeholder={ka ? e.title : 'What changed, in a few words'} busy={busy}
        onSave={v => save(ka ? { titleKa: v } : { title: v })} />
      <div style={{ height: 10 }} />
      {label(ka ? 'What changed (Georgian)' : 'What changed — for the client, no jargon')}
      <AutoField key={`b-${lang}`} rows={3} value={ka ? e.bodyKa : e.body} placeholder={ka ? e.body || 'Georgian text…' : 'One or two sentences: what they can do now that they could not before.'} busy={busy}
        onSave={v => save(ka ? { bodyKa: v } : { body: v })} />
      <div style={{ height: 10 }} />
      {label(ka ? 'How to use it (Georgian) — one step per line' : 'How to use it — one step per line')}
      <AutoField key={`h-${lang}`} rows={3} value={ka ? e.howToKa : e.howTo} placeholder={ka ? e.howTo || 'ნაბიჯები…' : 'Open Settings\nTap Delivery\nAdd a zone'} busy={busy}
        onSave={v => save(ka ? { howToKa: v } : { howTo: v })} />

      <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div>
          {label('"Take me there" — admin page')}
          <AutoField value={e.linkPath ?? ''} placeholder="/admin/settings" busy={busy} mono onSave={v => save({ linkPath: v || null })} />
        </div>
        <div>
          {label('From tickets')}
          <AutoField value={e.ticketRefs.join(', ')} placeholder="T-12, P-4" busy={busy} mono onSave={v => save({ ticketRefs: v.split(',').map(s => s.trim()).filter(Boolean) })} />
        </div>
      </div>

      {/* ── Screenshots ── */}
      <div className="flex flex-wrap items-center gap-2 mt-4">
        {label('Screenshots')}
        <div style={{ marginLeft: 'auto', display: 'inline-flex', gap: 4 }}>
          <IconButton icon={Monitor} label="New screenshots are desktop-size" active={viewport === 'desktop'} onClick={() => setViewport('desktop')} />
          <IconButton icon={Smartphone} label="New screenshots are phone-size" active={viewport === 'phone'} onClick={() => setViewport('phone')} />
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {[...pairs, nextPair].map(p => (
          <div key={p} className="flex flex-wrap items-center gap-3">
            {(['BEFORE', 'AFTER'] as const).map(kind => {
              const img = e.images.find(i => i.pair === p && i.kind === kind)
              return <Slot key={kind} img={img} kindLabel={kind === 'BEFORE' ? 'Before' : 'After'} busy={busy}
                onUpload={f => void upload(f, kind, p)} onDelete={() => img && void run(() => deleteReleaseImageAction(img.id))} />
            })}
            {p === nextPair && <span style={{ fontSize: 12, color: C.faint }}>{pairs.length ? 'Another before/after pair' : 'Before/after pair — clients get a slider'}</span>}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          {singles.map(img => <Slot key={img.id} img={img} kindLabel="Image" busy={busy} onUpload={() => {}} onDelete={() => void run(() => deleteReleaseImageAction(img.id))} />)}
          <Slot kindLabel="Single image (or paste)" busy={busy} onUpload={f => void upload(f, 'IMAGE', 0)} onDelete={() => {}} />
        </div>
      </div>
    </div>
  )
}

function Slot({ img, kindLabel, busy, onUpload, onDelete }: { img?: ReleaseImageView; kindLabel: string; busy: boolean; onUpload: (f: File[]) => void; onDelete: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  if (img) {
    return (
      <div style={{ position: 'relative', width: img.viewport === 'phone' ? 90 : 160, height: img.viewport === 'phone' ? 160 : 100, borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.border}`, backgroundColor: '#0f172a' }} title={`${kindLabel} · ${img.viewport}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {img.url && <img src={img.url} alt={kindLabel} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />}
        <span style={{ position: 'absolute', left: 4, bottom: 4, fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, backgroundColor: 'rgba(2,6,23,0.8)', color: '#e2e8f0' }}>{kindLabel}</span>
        <button onClick={onDelete} disabled={busy} aria-label={`Remove ${kindLabel.toLowerCase()} image`} title="Remove"
          style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 999, border: 'none', backgroundColor: 'rgba(2,6,23,0.8)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={12} /></button>
      </div>
    )
  }
  return (
    <>
      <button onClick={() => ref.current?.click()} disabled={busy} aria-label={`Add ${kindLabel.toLowerCase()} image`}
        style={{ width: 160, height: 100, borderRadius: 8, border: '1px dashed #334155', background: 'transparent', color: C.faint, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11 }}>
        <ImagePlus size={18} aria-hidden />{kindLabel}
      </button>
      <input ref={ref} type="file" accept={IMAGE_TYPES.join(',')} hidden onChange={ev => { const f = Array.from(ev.target.files ?? []); ev.target.value = ''; if (f.length) onUpload(f) }} />
    </>
  )
}
