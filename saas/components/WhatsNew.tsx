'use client'

/**
 * The clients' "What's new" page (Plan-ReleaseNotes.md). The pieces (ReleaseHeading, ChangeCard) are also what the
 * Super Admin editor shows, so what Max reads while editing is exactly what clients get. Text in the admin language
 * (Georgian falls back to English where a translation is missing). Screenshots: a desktop before/after is a wipe
 * slider; a phone before/after is shown side by side (two narrow screens read better next to each other); any image
 * opens full size in the viewer.
 */

import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import Lightbox from '@/components/Lightbox'
import { formatIsoDay } from '@/lib/wineOrderDate'
import type { ReleaseDetail, ReleaseEntryView, ReleaseImageView } from '@/lib/releaseService'

export type WhatsNewLabels = { before: string; after: string; howTo: string; takeMeThere: string; empty: string; dragHint: string }

export const WHATS_NEW_LABELS: Record<'en' | 'ka', WhatsNewLabels> = {
  en: { before: 'Before', after: 'After', howTo: 'How to use it', takeMeThere: 'Take me there', empty: 'Nothing here yet.', dragHint: 'Drag to compare' },
  ka: { before: 'მანამდე', after: 'შემდეგ', howTo: 'როგორ გამოვიყენოთ', takeMeThere: 'გადასვლა', empty: 'აქ ჯერ არაფერია.', dragHint: 'გადაათრიეთ შესადარებლად' },
}

export const pick = (en: string, ka: string, locale: string) => (locale === 'ka' && ka.trim() ? ka : en)

export default function WhatsNew({ releases, locale, labels }: { releases: ReleaseDetail[]; locale: string; labels: WhatsNewLabels }) {
  if (releases.length === 0) {
    return <div className="rounded-xl border p-6 text-sm" style={{ backgroundColor: 'var(--site-surface)', borderColor: 'var(--site-border)', color: 'var(--site-muted)' }}>{labels.empty}</div>
  }
  return (
    <div className="flex flex-col gap-10">
      {releases.map(r => (
        <section key={r.id}>
          <ReleaseHeading releasedOn={r.releasedOn} summary={pick(r.summary, r.summaryKa, locale)} locale={locale} />
          <div className="flex flex-col gap-4">
            {r.entries.map(e => <ChangeCard key={e.id} e={e} locale={locale} labels={labels} />)}
          </div>
        </section>
      ))}
    </div>
  )
}

export function ReleaseHeading({ releasedOn, summary, locale, action }: { releasedOn: string; summary: string; locale: string; action?: ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold" style={{ color: 'var(--site-text)' }}>{formatIsoDay(releasedOn, locale)}</h2>
        {action}
      </div>
      {summary && <p className="mt-1" style={{ color: 'var(--site-muted)', whiteSpace: 'pre-line', fontSize: 15, lineHeight: 1.5 }}>{summary}</p>}
    </div>
  )
}

/** One change, as clients see it. `toolbar` (Super Admin only) sits in the top-right corner. */
export function ChangeCard({ e, locale, labels, toolbar, muted }: { e: ReleaseEntryView; locale: string; labels: WhatsNewLabels; toolbar?: ReactNode; muted?: boolean }) {
  const [viewer, setViewer] = useState<{ images: { src: string; name: string }[]; index: number } | null>(null)
  const steps = pick(e.howTo, e.howToKa, locale).split(/\r?\n/).map(s => s.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean)
  const groups = groupImages(e.images)
  const body = pick(e.body, e.bodyKa, locale)
  return (
    <article className="rounded-xl border" style={{ backgroundColor: 'var(--site-surface)', borderColor: 'var(--site-border)', borderStyle: muted ? 'dashed' : 'solid', opacity: muted ? 0.75 : 1, padding: '18px 20px' }}>
      <div className="flex items-start gap-3">
        <h3 className="font-semibold flex-1" style={{ color: 'var(--site-text)', fontSize: 17, lineHeight: 1.35 }}>{pick(e.title, e.titleKa, locale)}</h3>
        {toolbar}
      </div>
      {body && <p className="mt-2" style={{ color: 'var(--site-text)', whiteSpace: 'pre-line', lineHeight: 1.6, fontSize: 15 }}>{body}</p>}

      {groups.map((g, i) => {
        if (g.before && g.after) {
          const open = (idx: 0 | 1) => setViewer({ images: [g.before!, g.after!].map((x, k) => ({ src: x.url!, name: x.caption || (k === 0 ? labels.before : labels.after) })), index: idx })
          return g.after.viewport === 'phone'
            ? <SideBySide key={i} before={g.before} after={g.after} labels={labels} onOpen={open} />
            : <Wipe key={i} before={g.before} after={g.after} labels={labels} onOpen={open} />
        }
        return (
          <div key={i} className="flex flex-wrap gap-3 mt-4">
            {g.singles.map((img, k) => (
              <figure key={img.id} style={{ margin: 0, maxWidth: img.viewport === 'phone' ? 280 : '100%' }}>
                <button type="button" onClick={() => setViewer({ images: g.singles.map(x => ({ src: x.url!, name: x.caption || '' })), index: k })}
                  className="block rounded-lg overflow-hidden border" style={{ borderColor: 'var(--site-border)', padding: 0, cursor: 'zoom-in' }} aria-label={img.caption || 'Open image'}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url!} alt={img.caption} style={{ display: 'block', width: '100%', height: 'auto' }} />
                </button>
                {img.caption && <figcaption className="text-xs mt-1" style={{ color: 'var(--site-muted)' }}>{img.caption}</figcaption>}
              </figure>
            ))}
          </div>
        )
      })}

      {steps.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: 'var(--site-muted)' }}>{labels.howTo}</div>
          <ol className="list-decimal pl-5 flex flex-col gap-1" style={{ color: 'var(--site-text)', fontSize: 15 }}>{steps.map((s, k) => <li key={k}>{s}</li>)}</ol>
        </div>
      )}
      {e.linkPath && (
        <a href={e.linkPath} className="inline-flex items-center gap-1.5 text-sm font-semibold mt-4 px-3 py-2 rounded-lg"
          style={{ color: 'var(--color-brand)', border: '1px solid var(--site-border)' }}>
          {labels.takeMeThere} <ArrowRight size={15} aria-hidden />
        </a>
      )}
      {viewer && <Lightbox images={viewer.images} index={viewer.index} onIndex={i => setViewer(v => (v ? { ...v, index: i } : v))} onClose={() => setViewer(null)} />}
    </article>
  )
}

type Group = { before?: ReleaseImageView; after?: ReleaseImageView; singles: ReleaseImageView[] }

/** BEFORE + AFTER with the same pair number become one comparison; everything else is shown as plain images. */
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

const tag = (color: string): CSSProperties => ({ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, backgroundColor: color, color: '#fff', letterSpacing: '0.02em' })

/** Phone screenshots: before and after next to each other, each tappable to open full size. */
function SideBySide({ before, after, labels, onOpen }: { before: ReleaseImageView; after: ReleaseImageView; labels: WhatsNewLabels; onOpen: (i: 0 | 1) => void }) {
  return (
    <div className="grid gap-4 mt-4" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 300px))' }}>
      {([before, after] as const).map((img, i) => (
        <figure key={img.id} style={{ margin: 0 }}>
          <div className="mb-1.5"><span style={tag(i === 0 ? '#64748b' : '#15803d')}>{i === 0 ? labels.before : labels.after}</span></div>
          <button type="button" onClick={() => onOpen(i as 0 | 1)} className="block w-full rounded-xl overflow-hidden border"
            style={{ borderColor: 'var(--site-border)', padding: 0, cursor: 'zoom-in', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }} aria-label={i === 0 ? labels.before : labels.after}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url!} alt={img.caption || (i === 0 ? labels.before : labels.after)} style={{ display: 'block', width: '100%', height: 'auto' }} />
          </button>
          {img.caption && <figcaption className="text-xs mt-1" style={{ color: 'var(--site-muted)' }}>{img.caption}</figcaption>}
        </figure>
      ))}
    </div>
  )
}

/**
 * Desktop screenshots: drag (or use the arrow keys on) the handle to wipe between the old and the new screen. A wipe
 * only makes sense when both pictures have the same shape; if they differ (the old and new screen are different
 * sizes), they are shown one above the other instead.
 */
function Wipe({ before, after, labels, onOpen }: { before: ReleaseImageView; after: ReleaseImageView; labels: WhatsNewLabels; onOpen: (i: 0 | 1) => void }) {
  const [ratios, setRatios] = useState<{ b?: number; a?: number }>({})
  const sameShape = !ratios.a || !ratios.b || Math.abs(ratios.a - ratios.b) / ratios.a < 0.06
  const measure = (k: 'a' | 'b') => (img: HTMLImageElement | null) => {
    // Called on load AND when the element mounts: an image already loaded before React attached never fires onLoad.
    if (img?.complete && img.naturalWidth) {
      const ratio = img.naturalHeight / img.naturalWidth
      setRatios(r => (r[k] === ratio ? r : { ...r, [k]: ratio }))
    }
  }
  if (!sameShape) return <Stacked before={before} after={after} labels={labels} onOpen={onOpen} />
  return <WipeSlider before={before} after={after} labels={labels} onOpen={onOpen} onMeasure={measure} />
}

function Stacked({ before, after, labels, onOpen }: { before: ReleaseImageView; after: ReleaseImageView; labels: WhatsNewLabels; onOpen: (i: 0 | 1) => void }) {
  return (
    <div className="flex flex-col gap-4 mt-4">
      {([before, after] as const).map((img, i) => (
        <figure key={img.id} style={{ margin: 0 }}>
          <div className="mb-1.5"><span style={tag(i === 0 ? '#64748b' : '#15803d')}>{i === 0 ? labels.before : labels.after}</span></div>
          <button type="button" onClick={() => onOpen(i as 0 | 1)} className="block w-full rounded-xl overflow-hidden border"
            style={{ borderColor: 'var(--site-border)', padding: 0, cursor: 'zoom-in', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }} aria-label={i === 0 ? labels.before : labels.after}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.url!} alt={img.caption || (i === 0 ? labels.before : labels.after)} style={{ display: 'block', width: '100%', height: 'auto' }} />
          </button>
        </figure>
      ))}
    </div>
  )
}

function WipeSlider({ before, after, labels, onOpen, onMeasure }: {
  before: ReleaseImageView; after: ReleaseImageView; labels: WhatsNewLabels; onOpen: (i: 0 | 1) => void
  onMeasure: (k: 'a' | 'b') => (img: HTMLImageElement | null) => void
}) {
  const [pos, setPos] = useState(50)
  const box = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const setFrom = (clientX: number) => {
    const r = box.current?.getBoundingClientRect()
    if (r) setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)))
  }
  const corner: CSSProperties = { position: 'absolute', top: 10, pointerEvents: 'none' }
  return (
    <div className="mt-4">
      <div
        ref={box}
        className="relative overflow-hidden rounded-xl border select-none"
        style={{ borderColor: 'var(--site-border)', touchAction: 'pan-y', cursor: 'ew-resize', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}
        onPointerDown={e => { dragging.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); setFrom(e.clientX) }}
        onPointerMove={e => { if (dragging.current) setFrom(e.clientX) }}
        onPointerUp={() => { dragging.current = false }}
        onPointerCancel={() => { dragging.current = false }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={after.url!} alt={after.caption || labels.after} draggable={false} ref={onMeasure('a')} onLoad={ev => onMeasure('a')(ev.currentTarget)} style={{ display: 'block', width: '100%', height: 'auto' }} />
        <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={before.url!} alt={before.caption || labels.before} draggable={false} ref={onMeasure('b')} onLoad={ev => onMeasure('b')(ev.currentTarget)} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top left' }} />
        </div>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${pos}%`, width: 3, marginLeft: -1.5, backgroundColor: '#fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.25)', pointerEvents: 'none' }} />
        <div
          role="slider" tabIndex={0} aria-label={`${labels.before} / ${labels.after}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pos)}
          onKeyDown={e => { if (e.key === 'ArrowLeft') setPos(p => Math.max(0, p - 5)); if (e.key === 'ArrowRight') setPos(p => Math.min(100, p + 5)) }}
          style={{ position: 'absolute', top: '50%', left: `${pos}%`, width: 38, height: 38, marginLeft: -19, marginTop: -19, borderRadius: 999, backgroundColor: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, color: '#334155' }}
        >⇆</div>
        <span style={{ ...corner, left: 10 }}><span style={tag('#64748b')}>{labels.before}</span></span>
        <span style={{ ...corner, right: 10 }}><span style={tag('#15803d')}>{labels.after}</span></span>
      </div>
      <div className="flex items-center gap-3 mt-1.5 text-xs" style={{ color: 'var(--site-muted)' }}>
        <span>{labels.dragHint} ·</span>
        <button type="button" onClick={() => onOpen(0)} className="underline">{labels.before}</button>
        <button type="button" onClick={() => onOpen(1)} className="underline">{labels.after}</button>
      </div>
    </div>
  )
}
