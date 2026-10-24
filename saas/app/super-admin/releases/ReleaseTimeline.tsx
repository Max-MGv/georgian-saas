'use client'

/**
 * The Releases reading view (vault/Plan-ReleaseNotes.md): every release as one timeline in the clients' colours.
 * Collapsed by default for a macro overview (Max, 2026-10-15) - each release shows its date, summary and one line per
 * change; a click opens that change in full, "Expand" opens the whole release. Counts on top, a few simple filters.
 * Internal changes are left out (as clients would see it) but counted.
 */

import { useEffect, useState, useTransition, type CSSProperties } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Eye, Image as ImageIcon, Search, X } from 'lucide-react'
import type { ReleaseDetail, ReleaseEntryView } from '@/lib/releaseService'
import { updateReleaseAction } from '@/app/actions/releases'
import { ChangeCard, ReleaseHeading, WHATS_NEW_LABELS, pick } from '@/components/WhatsNew'

type Lang = 'en' | 'ka'
type StatusFilter = 'all' | 'published' | 'draft'

const LIGHT = {
  '--site-bg': '#f5efe6', '--site-surface': '#fffaf3', '--site-border': '#e6d9c6', '--site-text': '#1c1008',
  '--site-muted': '#6b5a47', '--site-secondary': '#8a7a66', '--color-brand': '#7a2e2e',
} as CSSProperties
const chip = (on: boolean): CSSProperties => ({
  fontSize: 13, fontWeight: 600, padding: '5px 12px', borderRadius: 999, cursor: 'pointer',
  border: `1px solid ${on ? '#7a2e2e' : '#e6d9c6'}`, backgroundColor: on ? '#7a2e2e' : '#fffaf3', color: on ? '#fff' : '#6b5a47',
})
function Switch({ on, label, disabled, title, onChange }: { on: boolean; label: string; disabled?: boolean; title?: string; onChange: (next: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} title={title} onClick={() => onChange(!on)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: disabled ? '#b3a592' : '#1c1008', cursor: disabled ? 'not-allowed' : 'pointer' }}>
      <span aria-hidden style={{ position: 'relative', width: 34, height: 20, borderRadius: 999, backgroundColor: on ? '#2f7d4f' : '#cdbfa9', opacity: disabled ? 0.55 : 1, flex: 'none' }}>
        <span style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 16, height: 16, borderRadius: '50%', backgroundColor: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.3)' }} />
      </span>
      {label}
    </button>
  )
}

export default function ReleaseTimeline({ details, lang }: { details: ReleaseDetail[]; lang: Lang }) {
  const router = useRouter()
  const [, startRefresh] = useTransition()
  // What the switches show until the refreshed list arrives (so a click moves at once), and the last error per release.
  const [override, setOverride] = useState<Record<string, { published?: boolean; shown?: boolean }>>({})
  const [busyId, setBusyId] = useState<string | null>(null)
  const [switchError, setSwitchError] = useState<Record<string, string>>({})
  useEffect(() => { setOverride({}) }, [details])

  async function flip(r: ReleaseDetail, kind: 'published' | 'shown', next: boolean) {
    setBusyId(r.id)
    setSwitchError(e => ({ ...e, [r.id]: '' }))
    setOverride(o => ({ ...o, [r.id]: kind === 'published' ? { published: next, shown: next ? o[r.id]?.shown ?? r.clientVisible : false } : { ...o[r.id], shown: next } }))
    const res = await updateReleaseAction(r.id, kind === 'published' ? { status: next ? 'PUBLISHED' : 'DRAFT' } : { clientVisible: next })
    setBusyId(null)
    if ('error' in res) {
      setOverride(o => { const { [r.id]: _gone, ...rest } = o; return rest })
      setSwitchError(e => ({ ...e, [r.id]: res.error }))
      return
    }
    startRefresh(() => router.refresh())
  }

  const [status, setStatus] = useState<StatusFilter>('all')
  const [shownOnly, setShownOnly] = useState(false)
  const [q, setQ] = useState('')
  const [openReleases, setOpenReleases] = useState<Set<string>>(new Set())
  const [openChanges, setOpenChanges] = useState<Set<string>>(new Set())

  const needle = q.trim().toLowerCase()
  const matches = (e: ReleaseEntryView) => !needle || [e.title, e.titleKa, e.body, e.bodyKa, e.howTo, e.howToKa].some(t => t.toLowerCase().includes(needle))

  // What is shown: releases passing the filters, each with its client changes that match the search.
  const visible = details
    .filter(r => status === 'all' || (status === 'published' ? r.status === 'PUBLISHED' : r.status === 'DRAFT'))
    .filter(r => !shownOnly || r.clientVisible)
    .map(r => ({ r, changes: r.entries.filter(e => e.clientVisible && matches(e)), internal: r.entries.filter(e => !e.clientVisible).length }))
    .filter(x => !needle || x.changes.length > 0)

  // Counts across everything (not just what the filters show), so the numbers stay a stable overview.
  const all = details.flatMap(r => r.entries)
  const counts = {
    releases: details.length,
    published: details.filter(r => r.status === 'PUBLISHED').length,
    drafts: details.filter(r => r.status === 'DRAFT').length,
    shown: details.filter(r => r.clientVisible).length,
    changes: all.filter(e => e.clientVisible).length,
    internal: all.filter(e => !e.clientVisible).length,
    screenshots: all.reduce((n, e) => n + e.images.length, 0),
  }

  const toggle = (set: Set<string>, id: string, update: (s: Set<string>) => void) => {
    const n = new Set(set); if (n.has(id)) n.delete(id); else n.add(id); update(n)
  }
  const allOpen = visible.length > 0 && visible.every(x => openReleases.has(x.r.id))
  const expandAll = (open: boolean) => { setOpenReleases(open ? new Set(visible.map(x => x.r.id)) : new Set()); if (!open) setOpenChanges(new Set()) }

  const stat = (n: number, label: string, sub?: string) => (
    <div style={{ flex: '1 1 120px', backgroundColor: '#fffaf3', border: '1px solid #e6d9c6', borderRadius: 12, padding: '10px 14px' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#1c1008', lineHeight: 1.2 }}>{n}</div>
      <div style={{ fontSize: 12, color: '#6b5a47' }}>{label}{sub && <span style={{ color: '#8a7a66' }}> · {sub}</span>}</div>
    </div>
  )

  return (
    <div style={{ ...LIGHT, backgroundColor: 'var(--site-bg)', borderRadius: 16, padding: '20px 22px 26px' }}>
      {/* ── Overview ── */}
      <div className="flex flex-wrap gap-3 mb-4">
        {stat(counts.releases, counts.releases === 1 ? 'release' : 'releases', `${counts.published} published · ${counts.drafts} draft${counts.drafts === 1 ? '' : 's'}`)}
        {stat(counts.shown, 'shown to clients')}
        {stat(counts.changes, counts.changes === 1 ? 'change for clients' : 'changes for clients', counts.internal ? `+${counts.internal} internal` : undefined)}
        {stat(counts.screenshots, counts.screenshots === 1 ? 'screenshot' : 'screenshots')}
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {([['all', 'All'], ['published', 'Published'], ['draft', 'Drafts']] as const).map(([v, l]) => (
          <button key={v} style={chip(status === v)} aria-pressed={status === v} onClick={() => setStatus(v)}>{l}</button>
        ))}
        <button style={{ ...chip(shownOnly), display: 'inline-flex', alignItems: 'center', gap: 5 }} aria-pressed={shownOnly} onClick={() => setShownOnly(s => !s)}>
          <Eye size={13} aria-hidden /> Shown to clients
        </button>
        <div style={{ position: 'relative', flex: '1 1 180px', maxWidth: 280 }}>
          <Search size={14} color="#8a7a66" style={{ position: 'absolute', left: 10, top: 9 }} aria-hidden />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search changes" aria-label="Search changes"
            style={{ width: '100%', border: '1px solid #e6d9c6', borderRadius: 999, padding: '6px 30px', fontSize: 13, backgroundColor: '#fff', color: '#1c1008', outline: 'none' }} />
          {q && <button onClick={() => setQ('')} aria-label="Clear search" style={{ position: 'absolute', right: 8, top: 7, color: '#8a7a66' }}><X size={14} /></button>}
        </div>
        <button onClick={() => expandAll(!allOpen)} style={{ marginLeft: 'auto', fontSize: 13, color: '#7a2e2e', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {allOpen ? <ChevronsDownUp size={15} aria-hidden /> : <ChevronsUpDown size={15} aria-hidden />}{allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      {visible.length === 0 && <div style={{ color: '#8a7a66', fontSize: 14 }}>{details.length ? 'Nothing matches these filters.' : 'No releases yet — switch to Manage to start one.'}</div>}

      {/* ── Releases ── */}
      <div className="flex flex-col" style={{ gap: 26 }}>
        {visible.map(({ r, changes, internal }) => {
          const open = openReleases.has(r.id)
          const published = override[r.id]?.published ?? r.status === 'PUBLISHED'
          const shown = published && (override[r.id]?.shown ?? r.clientVisible)
          return (
            <section key={r.id} style={{ borderLeft: '3px solid #e6d9c6', paddingLeft: 16 }}>
              <ReleaseHeading releasedOn={r.releasedOn} summary={pick(r.summary, r.summaryKa, lang)} locale={lang}
                action={<>
                  <span style={{ marginLeft: 'auto' }} className="flex items-center gap-3">
                    <button onClick={() => toggle(openReleases, r.id, setOpenReleases)} aria-expanded={open}
                      style={{ fontSize: 13, color: '#6b5a47', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      {open ? <ChevronDown size={15} aria-hidden /> : <ChevronRight size={15} aria-hidden />}{open ? 'Collapse' : 'Expand'}
                    </button>
                    <Link href={`/super-admin/releases/${r.id}`} style={{ fontSize: 13, color: '#7a2e2e', display: 'inline-flex', alignItems: 'center', gap: 4 }}>Open <ArrowRight size={14} aria-hidden /></Link>
                  </span>
                </>} />
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1" style={{ margin: '4px 0 10px' }}>
                <Switch on={published} label="Published" disabled={busyId === r.id || (!published && r.entries.length === 0)}
                  title={!published && r.entries.length === 0 ? 'Add at least one change first' : published ? 'Back to draft (also hides it from clients)' : 'Publish this release'}
                  onChange={next => void flip(r, 'published', next)} />
                <Switch on={shown} label="Shown to clients" disabled={busyId === r.id || !published}
                  title={published ? 'Clients can read it on their What’s new page when this is on' : 'Publish first'}
                  onChange={next => void flip(r, 'shown', next)} />
                {switchError[r.id] && <span role="alert" style={{ fontSize: 12, color: '#b91c1c' }}>{switchError[r.id]}</span>}
              </div>

              {open ? (
                <div className="flex flex-col gap-4">
                  {changes.map(e => <ChangeCard key={e.id} e={e} locale={lang} labels={WHATS_NEW_LABELS[lang]} />)}
                </div>
              ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }} className="flex flex-col gap-1.5">
                  {changes.map(e => {
                    const eOpen = openChanges.has(e.id)
                    return (
                      <li key={e.id}>
                        <button onClick={() => toggle(openChanges, e.id, setOpenChanges)} aria-expanded={eOpen}
                          className="release-line"
                          style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, border: '1px solid #e6d9c6', backgroundColor: '#fffaf3', color: '#1c1008', fontSize: 15 }}>
                          {eOpen ? <ChevronDown size={15} color="#8a7a66" aria-hidden /> : <ChevronRight size={15} color="#8a7a66" aria-hidden />}
                          <span style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{pick(e.title, e.titleKa, lang)}</span>
                          {e.images.length > 0 && (
                            <span title={`${e.images.length} screenshot${e.images.length === 1 ? '' : 's'}`} style={{ fontSize: 12, color: '#8a7a66', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              <ImageIcon size={13} aria-hidden />{e.images.length}
                            </span>
                          )}
                        </button>
                        {eOpen && <div style={{ marginTop: 8 }}><ChangeCard e={e} locale={lang} labels={WHATS_NEW_LABELS[lang]} /></div>}
                      </li>
                    )
                  })}
                </ul>
              )}
              {internal > 0 && !needle && <div style={{ fontSize: 12, color: '#8a7a66', marginTop: 8 }}>+ {internal} internal change{internal === 1 ? '' : 's'} (Open → Developer view)</div>}
            </section>
          )
        })}
      </div>
      <style>{'.release-line:hover{border-color:#cdb99c !important;background-color:#fff !important}'}</style>
    </div>
  )
}
