'use client'

/**
 * Super Admin → Releases (vault/Plan-ReleaseNotes.md). Opens in the READING view - every release as one What's new
 * timeline, the way clients read it (Max, 2026-10-15: "we are also users"); drafts are marked. "Manage" shows the
 * list with status, counts and "New release".
 */

import { useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, BookOpen, Eye, EyeOff, Images, ListChecks, Plus, Rocket } from 'lucide-react'
import type { ReleaseDetail, ReleaseListItem } from '@/lib/releaseService'
import { createReleaseAction } from '@/app/actions/releases'
import { formatIsoDay } from '@/lib/wineOrderDate'
import { ChangeCard, ReleaseHeading, WHATS_NEW_LABELS, pick } from '@/components/WhatsNew'
import { C, EnvPill, buttonStyle, inputStyle } from '../tickets/ui'

type Lang = 'en' | 'ka'
const LIGHT = {
  '--site-bg': '#f5efe6', '--site-surface': '#fffaf3', '--site-border': '#e6d9c6', '--site-text': '#1c1008',
  '--site-muted': '#6b5a47', '--site-secondary': '#8a7a66', '--color-brand': '#7a2e2e',
} as React.CSSProperties

export default function ReleasesClient({ releases, details, env, today }: {
  releases: ReleaseListItem[]; details: ReleaseDetail[]; env: 'PRODUCTION' | 'STAGING' | 'LOCAL'; today: string
}) {
  const router = useRouter()
  const sp = useSearchParams()
  const manage = sp.get('mode') === 'manage'
  const setManage = (m: boolean) => window.history.replaceState(null, '', m ? '?mode=manage' : window.location.pathname)
  const [lang, setLang] = useState<Lang>('en')
  const [day, setDay] = useState(today)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    setBusy(true); setError(null)
    const res = await createReleaseAction(day)
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    router.push(`/super-admin/releases/${res.id}?mode=edit`)
  }

  const seg = (on: boolean): React.CSSProperties => ({ padding: '6px 12px', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, backgroundColor: on ? '#312e81' : 'transparent', color: on ? '#e0e7ff' : C.muted })

  return (
    <div style={{ color: C.text, maxWidth: 900, margin: '0 auto' }}>
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <h1 className="text-xl font-semibold">Releases</h1>
        <EnvPill env={env} />
        <div style={{ marginLeft: 'auto' }} className="flex flex-wrap gap-2">
          <div style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }} role="group" aria-label="View">
            <button style={seg(!manage)} aria-pressed={!manage} onClick={() => setManage(false)}><BookOpen size={13} aria-hidden /> Read</button>
            <button style={seg(manage)} aria-pressed={manage} onClick={() => setManage(true)}><ListChecks size={13} aria-hidden /> Manage</button>
          </div>
          {!manage && (
            <div style={{ display: 'inline-flex', border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }} role="group" aria-label="Language">
              {(['en', 'ka'] as const).map(l => <button key={l} style={seg(lang === l)} aria-pressed={lang === l} onClick={() => setLang(l)}>{l === 'en' ? 'English' : 'ქართული'}</button>)}
            </div>
          )}
        </div>
      </div>
      <p style={{ fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 1.5 }}>
        What changed in each production update. Clients see a release on their <strong>What&apos;s new</strong> page only when it is
        <strong> published</strong> and <strong>shown to clients</strong>{env !== 'PRODUCTION' && ' — and only on the production board; this one is for trying things out'}.
      </p>

      {!manage ? (
        <div style={{ ...LIGHT, backgroundColor: 'var(--site-bg)', borderRadius: 16, padding: '24px 24px 28px' }}>
          {details.length === 0 && <div style={{ color: '#8a7a66' }}>No releases yet — switch to Manage to start one.</div>}
          <div className="flex flex-col" style={{ gap: 44 }}>
            {details.map(r => {
              const forClients = r.entries.filter(e => e.clientVisible)
              const internal = r.entries.length - forClients.length
              return (
                <section key={r.id}>
                  <ReleaseHeading releasedOn={r.releasedOn} summary={pick(r.summary, r.summaryKa, lang)} locale={lang}
                    action={<>
                      {r.status === 'DRAFT' && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, backgroundColor: '#e6d9c6', color: '#6b5a47' }}>Draft</span>}
                      {r.status === 'PUBLISHED' && !r.clientVisible && <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, backgroundColor: '#e6d9c6', color: '#6b5a47' }}>Not shown to clients</span>}
                      <Link href={`/super-admin/releases/${r.id}`} style={{ marginLeft: 'auto', fontSize: 13, color: '#7a2e2e', display: 'inline-flex', alignItems: 'center', gap: 4 }}>Open <ArrowRight size={14} aria-hidden /></Link>
                    </>} />
                  <div className="flex flex-col gap-4">
                    {forClients.map(e => <ChangeCard key={e.id} e={e} locale={lang} labels={WHATS_NEW_LABELS[lang]} />)}
                  </div>
                  {internal > 0 && <div style={{ fontSize: 12, color: '#8a7a66', marginTop: 8 }}>+ {internal} internal change{internal === 1 ? '' : 's'} (Open → Developer view)</div>}
                </section>
              )
            })}
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-5" style={{ backgroundColor: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
            <span style={{ fontSize: 13, color: C.muted }}>New release for</span>
            <input type="date" value={day} onChange={e => setDay(e.target.value)} aria-label="Release date" style={inputStyle} />
            <button style={buttonStyle} disabled={busy || !day} onClick={() => void create()}><Plus size={15} aria-hidden /> New release</button>
            {error && <span role="alert" style={{ color: '#fca5a5', fontSize: 13 }}>{error}</span>}
          </div>
          {releases.length === 0 ? (
            <div style={{ color: C.faint, fontSize: 14 }}>No releases yet.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {releases.map(r => (
                <Link key={r.id} href={`/super-admin/releases/${r.id}`} className="release-row"
                  style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, border: `1px solid ${C.border}`, backgroundColor: C.card, color: C.text, textDecoration: 'none' }}>
                  <Rocket size={16} color={r.status === 'PUBLISHED' ? '#86efac' : C.faint} aria-hidden />
                  <strong style={{ minWidth: 110 }}>{formatIsoDay(r.releasedOn, 'en')}</strong>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 9px', borderRadius: 999, border: `1px solid ${r.status === 'PUBLISHED' ? '#14532d' : '#334155'}`, color: r.status === 'PUBLISHED' ? '#86efac' : C.muted }}>
                    {r.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                  </span>
                  <span title={r.clientVisible ? 'Clients see this release' : 'Hidden from clients'} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: r.clientVisible ? '#7dd3fc' : C.faint }}>
                    {r.clientVisible ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />}{r.clientVisible ? 'Clients see it' : 'Not shown to clients'}
                  </span>
                  <span style={{ fontSize: 12, color: C.faint }}>{r.entryCount} change{r.entryCount === 1 ? '' : 's'}{r.hiddenEntries ? ` (${r.hiddenEntries} internal)` : ''}</span>
                  {r.imageCount > 0 && <span style={{ fontSize: 12, color: C.faint, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Images size={13} aria-hidden />{r.imageCount}</span>}
                  {r.summary && <span style={{ flexBasis: '100%', fontSize: 13, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.summary}</span>}
                </Link>
              ))}
              <style>{'.release-row:hover{border-color:#334155 !important}'}</style>
            </div>
          )}
        </>
      )}
    </div>
  )
}
