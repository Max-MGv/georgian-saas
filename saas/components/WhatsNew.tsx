'use client'

/**
 * The clients' "What's new" page (Plan-ReleaseNotes.md) - also used as the preview in Super Admin → Releases, so what
 * Max previews is exactly what clients get. Text in the admin language (Georgian falls back to English where a
 * translation is missing). Before/after screenshots are shown with a slider; any image opens in the viewer.
 */

import { useRef, useState, type CSSProperties } from 'react'
import { ArrowRight } from 'lucide-react'
import Lightbox from '@/components/Lightbox'
import { formatIsoDay } from '@/lib/wineOrderDate'
import type { ReleaseDetail, ReleaseImageView } from '@/lib/releaseService'

export type WhatsNewLabels = { before: string; after: string; howTo: string; takeMeThere: string; empty: string; dragHint: string }

const pick = (en: string, ka: string, locale: string) => (locale === 'ka' && ka.trim() ? ka : en)

export default function WhatsNew({ releases, locale, labels }: { releases: ReleaseDetail[]; locale: string; labels: WhatsNewLabels }) {
  const [viewer, setViewer] = useState<{ images: { src: string; name: string }[]; index: number } | null>(null)
  if (releases.length === 0) {
    return <div className="rounded-xl border p-6 text-sm" style={{ backgroundColor: 'var(--site-surface)', borderColor: 'var(--site-border)', color: 'var(--site-muted)' }}>{labels.empty}</div>
  }
  return (
    <div className="flex flex-col gap-8">
      {releases.map(r => (
        <section key={r.id}>
          <div className="flex items-baseline gap-3 flex-wrap mb-1">
            <h2 className="text-lg font-bold" style={{ color: 'var(--site-text)' }}>{formatIsoDay(r.releasedOn, locale)}</h2>
          </div>
          {pick(r.summary, r.summaryKa, locale) && (
            <p className="text-sm mb-3" style={{ color: 'var(--site-muted)', whiteSpace: 'pre-line' }}>{pick(r.summary, r.summaryKa, locale)}</p>
          )}
          <div className="flex flex-col gap-4">
            {r.entries.map(e => {
              const steps = pick(e.howTo, e.howToKa, locale).split(/\r?\n/).map(s => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean)
              const pairs = groupImages(e.images)
              return (
                <article key={e.id} className="rounded-xl border p-4" style={{ backgroundColor: 'var(--site-surface)', borderColor: 'var(--site-border)' }}>
                  <h3 className="font-semibold" style={{ color: 'var(--site-text)' }}>{pick(e.title, e.titleKa, locale)}</h3>
                  {pick(e.body, e.bodyKa, locale) && <p className="text-sm mt-1.5" style={{ color: 'var(--site-text)', whiteSpace: 'pre-line', lineHeight: 1.55 }}>{pick(e.body, e.bodyKa, locale)}</p>}
                  {pairs.map((p, i) => p.before && p.after
                    ? <BeforeAfter key={i} before={p.before} after={p.after} labels={labels} onOpen={idx => setViewer({ images: [p.before!, p.after!].map(x => ({ src: x.url!, name: x.caption || labels[idx === 0 ? 'before' : 'after'] })), index: idx })} />
                    : (
                      <div key={i} className="flex flex-wrap gap-3 mt-3">
                        {p.singles.map((img, k) => (
                          <button key={img.id} type="button" onClick={() => setViewer({ images: p.singles.map(x => ({ src: x.url!, name: x.caption || '' })), index: k })}
                            className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--site-border)', padding: 0, cursor: 'zoom-in', maxWidth: img.viewport === 'phone' ? 260 : '100%' }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={img.url!} alt={img.caption} style={{ display: 'block', width: '100%', height: 'auto' }} />
                          </button>
                        ))}
                      </div>
                    ))}
                  {steps.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--site-muted)' }}>{labels.howTo}</div>
                      <ol className="text-sm list-decimal pl-5 flex flex-col gap-0.5" style={{ color: 'var(--site-text)' }}>{steps.map((s, k) => <li key={k}>{s}</li>)}</ol>
                    </div>
                  )}
                  {e.linkPath && (
                    <a href={e.linkPath} className="inline-flex items-center gap-1.5 text-sm font-semibold mt-3 px-3 py-2 rounded-lg"
                      style={{ color: 'var(--color-brand)', border: '1px solid var(--site-border)' }}>
                      {labels.takeMeThere} <ArrowRight size={15} aria-hidden />
                    </a>
                  )}
                </article>
              )
            })}
          </div>
        </section>
      ))}
      {viewer && <Lightbox images={viewer.images} index={viewer.index} onIndex={i => setViewer(v => (v ? { ...v, index: i } : v))} onClose={() => setViewer(null)} />}
    </div>
  )
}

type Group = { before?: ReleaseImageView; after?: ReleaseImageView; singles: ReleaseImageView[] }

/** BEFORE + AFTER with the same pair number become one slider; everything else is shown as plain images. */
function groupImages(images: ReleaseImageView[]): Group[] {
  const usable = images.filter(i => i.url)
  const pairs = new Map<number, Group>()
  const singles: ReleaseImageView[] = []
  for (const img of usable) {
    if (img.kind === 'IMAGE') { singles.push(img); continue }
    const g = pairs.get(img.pair) ?? { singles: [] }
    if (img.kind === 'BEFORE') g.before = img; else g.after = img
    pairs.set(img.pair, g)
  }
  const out: Group[] = []
  for (const g of pairs.values()) {
    if (g.before && g.after) out.push(g)
    else singles.push(...[g.before, g.after].filter((x): x is ReleaseImageView => !!x)) // half a pair is just an image
  }
  if (singles.length) out.push({ singles })
  return out
}

/** Drag (or use the arrow keys on) the handle to wipe between the old and the new screen. */
function BeforeAfter({ before, after, labels, onOpen }: { before: ReleaseImageView; after: ReleaseImageView; labels: WhatsNewLabels; onOpen: (i: 0 | 1) => void }) {
  const [pos, setPos] = useState(50)
  const box = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const setFrom = (clientX: number) => {
    const r = box.current?.getBoundingClientRect()
    if (r) setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)))
  }
  const phone = after.viewport === 'phone'
  const tag: CSSProperties = { position: 'absolute', top: 8, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, backgroundColor: 'rgba(15,23,42,0.75)', color: '#fff', pointerEvents: 'none' }
  return (
    <div className="mt-3" style={{ maxWidth: phone ? 300 : '100%' }}>
      <div
        ref={box}
        className="relative overflow-hidden rounded-lg border select-none"
        style={{ borderColor: 'var(--site-border)', touchAction: 'pan-y', cursor: 'ew-resize' }}
        onPointerDown={e => { dragging.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); setFrom(e.clientX) }}
        onPointerMove={e => { if (dragging.current) setFrom(e.clientX) }}
        onPointerUp={() => { dragging.current = false }}
        onPointerCancel={() => { dragging.current = false }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={after.url!} alt={after.caption || labels.after} draggable={false} style={{ display: 'block', width: '100%', height: 'auto' }} />
        <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={before.url!} alt={before.caption || labels.before} draggable={false} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
        </div>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pos}%`, width: 2, marginLeft: -1, backgroundColor: '#fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.25)', pointerEvents: 'none' }} />
        <div
          role="slider" tabIndex={0} aria-label={`${labels.before} / ${labels.after}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pos)}
          onKeyDown={e => { if (e.key === 'ArrowLeft') setPos(p => Math.max(0, p - 5)); if (e.key === 'ArrowRight') setPos(p => Math.min(100, p + 5)) }}
          style={{ position: 'absolute', top: '50%', left: `${pos}%`, width: 34, height: 34, marginLeft: -17, marginTop: -17, borderRadius: 999, backgroundColor: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: '#334155' }}
        >⇆</div>
        <span style={{ ...tag, left: 8 }}>{labels.before}</span>
        <span style={{ ...tag, right: 8 }}>{labels.after}</span>
      </div>
      <div className="flex items-center gap-3 mt-1.5 text-xs" style={{ color: 'var(--site-muted)' }}>
        <span>{labels.dragHint}</span>
        <button type="button" onClick={() => onOpen(0)} className="underline">{labels.before}</button>
        <button type="button" onClick={() => onOpen(1)} className="underline">{labels.after}</button>
      </div>
    </div>
  )
}
