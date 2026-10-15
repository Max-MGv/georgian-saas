'use client'

/**
 * One release, shown the way clients will read it (vault/Plan-ReleaseNotes.md). Each change has a small toolbar -
 * ✎ opens that one change in a form; ↑ ↓ reorder; the eye makes it internal. The language switch changes what you
 * read AND what you edit. Publish + "Show to clients" are Max's switches (the token API can never flip them).
 */

import { useRef, useState, useTransition, type CSSProperties, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowDown, ArrowLeft, ArrowUp, Check, Eye, EyeOff, ImagePlus, Monitor, Pencil, Plus, Rocket, Smartphone, Trash2, Undo2, X } from 'lucide-react'
import type { ReleaseDetail, ReleaseEntryView, ReleaseImageView } from '@/lib/releaseService'
import {
  addEntryAction, deleteEntryAction, deleteReleaseAction, deleteReleaseImageAction, moveEntryAction, updateEntryAction,
  updateReleaseAction, uploadReleaseImage, type ReleaseResult,
} from '@/app/actions/releases'
import { ChangeCard, ReleaseHeading, WHATS_NEW_LABELS, pick } from '@/components/WhatsNew'
import { C, EnvPill, buttonStyle, ghostButtonStyle } from '../../tickets/ui'

type Lang = 'en' | 'ka'
type Run = (fn: () => Promise<ReleaseResult>) => Promise<boolean>
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

// The document area uses the clients' light admin colours, so it reads exactly like their What's new page.
const LIGHT = {
  '--site-bg': '#f5efe6', '--site-surface': '#fffaf3', '--site-border': '#e6d9c6', '--site-text': '#1c1008',
  '--site-muted': '#6b5a47', '--site-secondary': '#8a7a66', '--color-brand': '#7a2e2e',
} as CSSProperties
const field: CSSProperties = { width: '100%', border: '1px solid #d9c9b2', borderRadius: 8, padding: '9px 11px', fontSize: 15, lineHeight: 1.5, color: '#1c1008', backgroundColor: '#fff', outline: 'none' }
const fieldLabel = (t: ReactNode, hint?: string) => (
  <div style={{ fontSize: 12, fontWeight: 700, color: '#6b5a47', margin: '14px 0 5px' }}>{t}{hint && <span style={{ fontWeight: 400, color: '#8a7a66' }}> — {hint}</span>}</div>
)
const tool: CSSProperties = { width: 32, height: 32, borderRadius: 8, border: '1px solid #e6d9c6', backgroundColor: '#fff', color: '#6b5a47', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }
const brandButton: CSSProperties = { ...buttonStyle, backgroundColor: '#7a2e2e', borderColor: '#7a2e2e' }

export default function ReleaseEditor({ release: r, env }: { release: ReleaseDetail; env: 'PRODUCTION' | 'STAGING' | 'LOCAL' }) {
  const router = useRouter()
  const [refreshing, startTransition] = useTransition()
  const [acting, setActing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lang, setLang] = useState<Lang>('en')
  const [editing, setEditing] = useState<string | null>(null) // an entry id, or 'summary'
  const [newTitle, setNewTitle] = useState('')
  const busy = acting || refreshing
  // The switch moves at once, then the saved value takes over (otherwise it snaps back until the refresh lands).
  const [pendingVisible, setPendingVisible] = useState<boolean | null>(null)
  if (pendingVisible !== null && pendingVisible === r.clientVisible) setPendingVisible(null)
  const shownToClients = pendingVisible ?? r.clientVisible

  const run: Run = async fn => {
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
  const internalCount = r.entries.filter(e => !e.clientVisible).length
  const summary = pick(r.summary, r.summaryKa, lang)
  const addEntry = () => void run(() => addEntryAction(r.id, { title: newTitle })).then(ok => { if (ok) setNewTitle('') })

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      {/* ── Control bar (dark, like the rest of Super Admin) ── */}
      <div className="flex flex-wrap items-center gap-3 mb-3" style={{ color: C.text }}>
        <Link href="/super-admin/releases" style={{ color: C.muted, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 4 }}><ArrowLeft size={15} aria-hidden /> Releases</Link>
        <EnvPill env={env} />
        <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 999, border: `1px solid ${published ? '#14532d' : '#334155'}`, color: published ? '#86efac' : C.muted }}>
          {published ? 'Published' : 'Draft'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }} role="group" aria-label="Language">
          {(['en', 'ka'] as const).map(l => (
            <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l} style={{ padding: '6px 12px', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', backgroundColor: lang === l ? '#312e81' : 'transparent', color: lang === l ? '#e0e7ff' : C.muted }}>
              {l === 'en' ? 'English' : 'ქართული'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-4" style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: '10px 14px', color: C.text }}>
        {published ? (
          <button style={ghostButtonStyle} disabled={busy} onClick={() => void run(() => updateReleaseAction(r.id, { status: 'DRAFT' }))} title="Back to draft - also hides it from clients"><Undo2 size={14} aria-hidden /> Unpublish</button>
        ) : (
          <button style={buttonStyle} disabled={busy || r.entries.length === 0} onClick={() => void run(() => updateReleaseAction(r.id, { status: 'PUBLISHED' }))}><Rocket size={14} aria-hidden /> Publish</button>
        )}
        <label title={published ? '' : 'Publish first'} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, color: published ? C.text : C.faint, cursor: published ? 'pointer' : 'not-allowed' }}>
          <input type="checkbox" role="switch" checked={shownToClients} disabled={busy || !published} aria-label="Show to clients"
            onChange={e => { const v = e.target.checked; setPendingVisible(v); void run(() => updateReleaseAction(r.id, { clientVisible: v })).then(ok => { if (!ok) setPendingVisible(null) }) }} />
          {shownToClients ? <Eye size={15} color="#7dd3fc" aria-hidden /> : <EyeOff size={15} aria-hidden />} Show to clients
        </label>
        <span style={{ fontSize: 12, color: C.faint }}>
          {shownToClients ? 'Clients can read this now.' : published ? 'Published, but clients do not see it yet.' : 'Draft — only you see it.'}
          {internalCount ? ` ${internalCount} change${internalCount === 1 ? ' is' : 's are'} internal (never shown to clients).` : ''}
        </span>
        {!published && (
          <button style={{ ...ghostButtonStyle, marginLeft: 'auto' }} disabled={busy} aria-label="Delete this draft" title="Delete this draft"
            onClick={() => { if (window.confirm('Delete this draft release and its screenshots?')) void run(() => deleteReleaseAction(r.id)).then(ok => { if (ok) router.push('/super-admin/releases') }) }}>
            <Trash2 size={14} aria-hidden />
          </button>
        )}
      </div>
      {error && <div role="alert" style={{ color: '#fca5a5', fontSize: 13, margin: '-6px 0 12px' }}>{error}</div>}

      {/* ── The release, as clients read it ── */}
      <div style={{ ...LIGHT, backgroundColor: 'var(--site-bg)', borderRadius: 16, padding: '24px 24px 28px' }} className="release-doc">
        {editing === 'summary' ? (
          <SummaryForm r={r} lang={lang} busy={busy} run={run} onDone={() => setEditing(null)} />
        ) : (
          <>
            <ReleaseHeading releasedOn={r.releasedOn} summary={summary} locale={lang}
              action={<button style={tool} title="Edit date and summary" aria-label="Edit date and summary" onClick={() => setEditing('summary')}><Pencil size={14} /></button>} />
            {!summary && <button onClick={() => setEditing('summary')} style={{ fontSize: 14, color: '#8a7a66', textDecoration: 'underline', margin: '-6px 0 14px' }}>+ Add a one-line summary</button>}
          </>
        )}

        <div className="flex flex-col gap-4">
          {r.entries.map((e, i) => editing === e.id ? (
            <EntryForm key={e.id} e={e} lang={lang} busy={busy} run={run} setError={setError} onDone={() => setEditing(null)} />
          ) : (
            <div key={e.id}>
              {!e.clientVisible && <div style={{ fontSize: 12, fontWeight: 700, color: '#8a7a66', margin: '0 0 4px 4px', display: 'flex', alignItems: 'center', gap: 5 }}><EyeOff size={13} aria-hidden /> Internal — clients never see this change</div>}
              <ChangeCard e={e} locale={lang} labels={WHATS_NEW_LABELS[lang]} muted={!e.clientVisible}
                toolbar={
                  <div className="flex items-center gap-1.5" style={{ flexShrink: 0 }}>
                    <button style={tool} title="Move up" aria-label="Move up" disabled={busy || i === 0} onClick={() => void run(() => moveEntryAction(e.id, -1))}><ArrowUp size={14} /></button>
                    <button style={tool} title="Move down" aria-label="Move down" disabled={busy || i === r.entries.length - 1} onClick={() => void run(() => moveEntryAction(e.id, 1))}><ArrowDown size={14} /></button>
                    <button style={{ ...tool, color: e.clientVisible ? '#6b5a47' : '#b45309' }} disabled={busy} title={e.clientVisible ? 'Make internal (hide from clients)' : 'Show this change to clients'} aria-label={e.clientVisible ? 'Make this change internal' : 'Show this change to clients'}
                      onClick={() => void run(() => updateEntryAction(e.id, { clientVisible: !e.clientVisible }))}>{e.clientVisible ? <Eye size={14} /> : <EyeOff size={14} />}</button>
                    <button style={{ ...tool, backgroundColor: '#7a2e2e', borderColor: '#7a2e2e', color: '#fff' }} title="Edit this change" aria-label="Edit this change" onClick={() => setEditing(e.id)}><Pencil size={14} /></button>
                  </div>
                } />
              {lang === 'ka' && (!e.titleKa || (e.body && !e.bodyKa)) && (
                <div style={{ fontSize: 12, color: '#b45309', margin: '4px 0 0 4px' }}>Georgian translation missing — clients reading in Georgian see the English text.</div>
              )}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 mt-5">
          <input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="+ Add a change — its title, in plain client language" aria-label="New change title"
            onKeyDown={e => { if (e.key === 'Enter' && newTitle.trim()) addEntry() }}
            style={{ ...field, flex: '1 1 280px', width: 'auto' }} />
          <button style={brandButton} disabled={busy || !newTitle.trim()} onClick={addEntry}><Plus size={15} aria-hidden /> Add</button>
        </div>
        <style>{'.release-doc button:disabled{opacity:.45;cursor:default}'}</style>
      </div>
    </div>
  )
}

function SummaryForm({ r, lang, busy, run, onDone }: { r: ReleaseDetail; lang: Lang; busy: boolean; run: Run; onDone: () => void }) {
  const [day, setDay] = useState(r.releasedOn)
  const [summary, setSummary] = useState(lang === 'ka' ? r.summaryKa : r.summary)
  return (
    <div className="mb-5 rounded-xl border p-4" style={{ backgroundColor: '#fff', borderColor: '#7a2e2e' }}>
      {fieldLabel('Release date')}
      <input type="date" value={day} onChange={e => setDay(e.target.value)} style={{ ...field, width: 200 }} aria-label="Release date" />
      {fieldLabel(lang === 'ka' ? 'Summary (Georgian)' : 'Summary', 'one or two sentences under the date')}
      <textarea value={summary} onChange={e => setSummary(e.target.value)} rows={2} style={field} aria-label="Summary" placeholder={lang === 'ka' ? r.summary : 'e.g. Phones got much easier to use, and big photos upload again.'} />
      <SaveRow busy={busy} onCancel={onDone} onSave={() => void run(() => updateReleaseAction(r.id, { releasedOn: day, ...(lang === 'ka' ? { summaryKa: summary } : { summary }) })).then(ok => { if (ok) onDone() })} />
    </div>
  )
}

function SaveRow({ busy, onSave, onCancel, left }: { busy: boolean; onSave: () => void; onCancel: () => void; left?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 mt-5">
      {left}
      <div style={{ marginLeft: 'auto' }} className="flex gap-2">
        <button style={{ ...ghostButtonStyle, color: '#6b5a47', borderColor: '#d9c9b2' }} onClick={onCancel}><X size={14} aria-hidden /> Close</button>
        <button style={brandButton} disabled={busy} onClick={onSave}><Check size={14} aria-hidden /> Save</button>
      </div>
    </div>
  )
}

/** One change, open for editing: text in the current language, link, tickets, and its screenshots shown large. */
function EntryForm({ e, lang, busy, run, setError, onDone }: { e: ReleaseEntryView; lang: Lang; busy: boolean; run: Run; setError: (s: string | null) => void; onDone: () => void }) {
  const ka = lang === 'ka'
  const [f, setF] = useState({
    title: ka ? e.titleKa : e.title, body: ka ? e.bodyKa : e.body, howTo: ka ? e.howToKa : e.howTo,
    linkPath: e.linkPath ?? '', tickets: e.ticketRefs.join(', '),
  })
  const [viewport, setViewport] = useState<'desktop' | 'phone'>(e.images.find(i => i.kind !== 'IMAGE')?.viewport === 'phone' ? 'phone' : 'desktop')
  const save = () => void run(() => updateEntryAction(e.id, {
    ...(ka ? { titleKa: f.title, bodyKa: f.body, howToKa: f.howTo } : { title: f.title, body: f.body, howTo: f.howTo }),
    linkPath: f.linkPath || null, ticketRefs: f.tickets.split(',').map(s => s.trim()).filter(Boolean),
  })).then(ok => { if (ok) onDone() })
  const upload = async (files: File[], kind: 'BEFORE' | 'AFTER' | 'IMAGE', pair: number) => {
    for (const file of files) {
      if (!IMAGE_TYPES.includes(file.type)) { setError('Only PNG, JPEG, WebP or GIF images.'); continue }
      if (file.size > 4 * 1024 * 1024) { setError('Image is too large (max 4 MB).'); continue }
      const fd = new FormData()
      fd.set('entryId', e.id); fd.set('file', file); fd.set('kind', kind); fd.set('pair', String(pair)); fd.set('viewport', viewport)
      if (!(await run(() => uploadReleaseImage(fd)))) break
    }
  }
  const pairs = [...new Set(e.images.filter(i => i.kind !== 'IMAGE').map(i => i.pair))].sort((a, b) => a - b)
  const nextPair = pairs.length ? Math.max(...pairs) + 1 : 1
  const singles = e.images.filter(i => i.kind === 'IMAGE')

  return (
    <div className="rounded-xl border p-5" style={{ backgroundColor: '#fff', borderColor: '#7a2e2e', boxShadow: '0 4px 18px rgba(0,0,0,0.08)' }}
      onPaste={ev => { const files = Array.from(ev.clipboardData.files); if (files.some(x => x.type.startsWith('image/'))) { ev.preventDefault(); void upload(files, 'IMAGE', 0) } }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#7a2e2e' }}>Editing{ka ? ' — Georgian text' : ''}</div>
      {fieldLabel(ka ? 'Title (Georgian)' : 'Title', 'a few words: what clients can now do')}
      <input value={f.title} onChange={ev => setF({ ...f, title: ev.target.value })} style={{ ...field, fontSize: 17, fontWeight: 600 }} placeholder={ka ? e.title : ''} aria-label="Title" />
      {fieldLabel(ka ? 'What changed (Georgian)' : 'What changed', 'one or two sentences, no technical words')}
      <textarea value={f.body} onChange={ev => setF({ ...f, body: ev.target.value })} rows={3} style={field} placeholder={ka ? e.body : ''} aria-label="What changed" />
      {fieldLabel(ka ? 'How to use it (Georgian)' : 'How to use it', 'one step per line, optional')}
      <textarea value={f.howTo} onChange={ev => setF({ ...f, howTo: ev.target.value })} rows={3} style={field} placeholder={ka ? e.howTo : 'Open Settings\nTap Delivery'} aria-label="How to use it" />
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div>
          {fieldLabel('"Take me there" button', 'an admin page')}
          <input value={f.linkPath} onChange={ev => setF({ ...f, linkPath: ev.target.value })} style={{ ...field, fontFamily: 'ui-monospace, monospace', fontSize: 14 }} placeholder="/admin/settings" aria-label="Take me there" />
        </div>
        <div>
          {fieldLabel('From tickets')}
          <input value={f.tickets} onChange={ev => setF({ ...f, tickets: ev.target.value })} style={{ ...field, fontFamily: 'ui-monospace, monospace', fontSize: 14 }} placeholder="T-12, P-4" aria-label="From tickets" />
        </div>
      </div>

      {/* Screenshots */}
      <div className="flex flex-wrap items-center gap-2" style={{ margin: '22px 0 8px' }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#6b5a47' }}>Screenshots</div>
        <span style={{ fontSize: 12, color: '#8a7a66' }}>new uploads are from a</span>
        {(['desktop', 'phone'] as const).map(v => (
          <button key={v} onClick={() => setViewport(v)} aria-pressed={viewport === v}
            style={{ ...tool, width: 'auto', padding: '0 10px', gap: 5, fontSize: 12, borderColor: viewport === v ? '#7a2e2e' : '#e6d9c6', color: viewport === v ? '#7a2e2e' : '#8a7a66' }}>
            {v === 'desktop' ? <Monitor size={13} /> : <Smartphone size={13} />}{v === 'desktop' ? 'computer' : 'phone'}
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-4">
        {[...pairs, nextPair].map(p => (
          <div key={p}>
            <div style={{ fontSize: 12, color: '#8a7a66', marginBottom: 6 }}>{p === nextPair ? (pairs.length ? 'Add another before / after' : 'Before / after — clients compare them') : `Before / after ${pairs.indexOf(p) + 1}`}</div>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              {(['BEFORE', 'AFTER'] as const).map(kind => {
                const img = e.images.find(i => i.pair === p && i.kind === kind)
                return <Slot key={kind} img={img} label={kind === 'BEFORE' ? 'Before' : 'After'} busy={busy}
                  onUpload={files => void upload(files, kind, p)} onDelete={() => img && void run(() => deleteReleaseImageAction(img.id))} />
              })}
            </div>
          </div>
        ))}
        <div>
          <div style={{ fontSize: 12, color: '#8a7a66', marginBottom: 6 }}>Single images (or paste one anywhere in this box)</div>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            {singles.map(img => <Slot key={img.id} img={img} label="Image" busy={busy} onUpload={() => {}} onDelete={() => void run(() => deleteReleaseImageAction(img.id))} />)}
            <Slot label="Add an image" busy={busy} onUpload={files => void upload(files, 'IMAGE', 0)} onDelete={() => {}} />
          </div>
        </div>
      </div>

      <SaveRow busy={busy} onCancel={onDone} onSave={save}
        left={<button style={{ ...ghostButtonStyle, color: '#b91c1c', borderColor: '#fecaca' }} disabled={busy}
          onClick={() => { if (window.confirm(`Delete "${e.title}"?`)) void run(() => deleteEntryAction(e.id)).then(ok => { if (ok) onDone() }) }}><Trash2 size={14} aria-hidden /> Delete change</button>} />
    </div>
  )
}

function Slot({ img, label, busy, onUpload, onDelete }: { img?: ReleaseImageView; label: string; busy: boolean; onUpload: (f: File[]) => void; onDelete: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  if (img) {
    return (
      <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid #e6d9c6', backgroundColor: '#f5efe6' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {img.url && <img src={img.url} alt={label} style={{ display: 'block', width: '100%', height: 'auto', maxHeight: 360, objectFit: 'contain', objectPosition: 'top' }} />}
        <span style={{ position: 'absolute', left: 8, top: 8, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, backgroundColor: label === 'Before' ? '#64748b' : label === 'After' ? '#15803d' : '#475569', color: '#fff' }}>
          {label} · {img.viewport === 'phone' ? 'phone' : 'computer'}
        </span>
        <button onClick={onDelete} disabled={busy} aria-label={`Remove ${label.toLowerCase()} image`} title="Remove"
          style={{ position: 'absolute', top: 8, right: 8, width: 26, height: 26, borderRadius: 999, border: 'none', backgroundColor: 'rgba(28,16,8,0.75)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={13} /></button>
      </div>
    )
  }
  return (
    <>
      <button onClick={() => ref.current?.click()} disabled={busy} aria-label={`Add ${label.toLowerCase()} image`}
        style={{ minHeight: 110, borderRadius: 10, border: '1px dashed #cdb99c', background: '#fffaf3', color: '#8a7a66', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, fontSize: 13 }}>
        <ImagePlus size={20} aria-hidden />{label}
      </button>
      <input ref={ref} type="file" accept={IMAGE_TYPES.join(',')} hidden onChange={ev => { const files = Array.from(ev.target.files ?? []); ev.target.value = ''; if (files.length) onUpload(files) }} />
    </>
  )
}
