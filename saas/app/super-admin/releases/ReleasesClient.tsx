'use client'

/** Super Admin → Releases: every release, newest first (vault/Plan-ReleaseNotes.md). */

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Images, Plus, Rocket } from 'lucide-react'
import type { ReleaseListItem } from '@/lib/releaseService'
import { createReleaseAction } from '@/app/actions/releases'
import { formatIsoDay } from '@/lib/wineOrderDate'
import { C, EnvPill, buttonStyle, inputStyle } from '../tickets/ui'

export default function ReleasesClient({ releases, env, today }: { releases: ReleaseListItem[]; env: 'PRODUCTION' | 'STAGING' | 'LOCAL'; today: string }) {
  const router = useRouter()
  const [day, setDay] = useState(today)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create() {
    setBusy(true); setError(null)
    const res = await createReleaseAction(day)
    setBusy(false)
    if ('error' in res) { setError(res.error); return }
    router.push(`/super-admin/releases/${res.id}`)
  }

  return (
    <div style={{ color: C.text, maxWidth: 900 }}>
      <div className="flex flex-wrap items-center gap-3 mb-2">
        <h1 className="text-xl font-semibold">Releases</h1>
        <EnvPill env={env} />
      </div>
      <p style={{ fontSize: 13, color: C.muted, marginBottom: 16, lineHeight: 1.5 }}>
        What changed in each production update. Clients see a release on their <strong>What&apos;s new</strong> page only when it is
        <strong> published</strong> and <strong>shown to clients</strong>{env !== 'PRODUCTION' && ' — and only on the production board; this one is for trying things out'}.
      </p>

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
            <a key={r.id} href={`/super-admin/releases/${r.id}`} className="release-row"
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
            </a>
          ))}
          <style>{'.release-row:hover{border-color:#334155 !important}'}</style>
        </div>
      )}
    </div>
  )
}
