'use client'

import { useEffect, useState } from 'react'
import {
  CalendarCheck, Wine, LayoutDashboard, TrendingUp, ReceiptText, Pencil,
  ArrowRight, Columns2, type LucideIcon,
} from 'lucide-react'
import { DEMO, DEMO_FX } from '@/lib/demoTheme'
import { useIsNarrow } from '@/lib/useIsNarrow'
import {
  type Lang, type Copy, type FeatureIcon,
  NAV, HERO, PROBLEM, FEATURES, MIRROR, VISION, FINAL, FOOTER, LANG_LABEL,
  DEMO_URL, DEMO_MIRROR_URL, CONTACT_EMAIL,
} from '@/lib/welcomeCopy'

/**
 * vineworks.ge — the platform's own front page.
 *
 * What it replaces: a 67-line placeholder with three cards, a `mailto:` and,
 * remarkably, **no link to the demo at all**. Max flagged it 2026-09-13: the
 * company's front door pointed at nothing while the demo sat one subdomain
 * away with no route to it.
 *
 * ── The division of labour, decided the same day ──
 * **This page explains and sells; demo.vineworks.ge shows.** The demo's front
 * door (`components/DemoFrontDoor.tsx`) is a *path chooser* — it asks which of
 * four ways in you want, and it is allowed to assume you already know what
 * Vineworks is, because you came through here. Do not move the feature list
 * into it, and do not shorten this page on the theory that the demo repeats it.
 *
 * ── Palette ──
 * Reuses `lib/demoTheme`'s "cellar dark" rather than inventing a third palette.
 * That file's header calls it "the demo chrome's palette"; it is really *the
 * platform's* palette — the voice Vineworks speaks in when it is talking about
 * a winery rather than being one — and this page is that same voice. One
 * palette, one file, no drift (which is how KnownBugs #20/#21 happened).
 * Deliberately NOT the tenant `--site-*` tokens: there is no tenant on this
 * domain, so those resolve to whatever the default preset happens to be.
 *
 * ── Language ──
 * Georgian by default, English behind a toggle. Every string lives in
 * `lib/welcomeCopy.ts`; this file contains no user-visible text.
 */

/** Keyed by `FeatureIcon`, so adding a name to the union without adding the
 *  component here is a compile error rather than a silent wine-glass fallback. */
const ICONS: Record<FeatureIcon, LucideIcon> = {
  calendar: CalendarCheck,
  wine: Wine,
  dashboard: LayoutDashboard,
  trending: TrendingUp,
  receipt: ReceiptText,
  pencil: Pencil,
}

/** Remembered so a Georgian speaker who switched to English once is not handed
 *  Georgian again on every visit. */
const LANG_KEY = 'vineworks-lang'

export default function WelcomeLanding({
  platformLogo,
  platformLogoAlt,
}: {
  platformLogo: string | null
  platformLogoAlt: string
}) {
  // Always 'ka' on the first render, server and client alike. Reading
  // localStorage during render would hydrate one language over another — the
  // same React #418 mismatch Chunk 2 had to chase out of the demo.
  const [lang, setLang] = useState<Lang>('ka')

  // At 375px the header's three items — wordmark, toggle, CTA — do not fit: the
  // CTA wrapped to two lines and pushed the language toggle under the wordmark,
  // clipping "ENG". The CTA is the one that goes, because the hero's identical
  // button is a few hundred pixels below it and the toggle is not repeated
  // anywhere. Measured in the pane at 375×812, 2026-09-13.
  const isNarrow = useIsNarrow()

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY)
      if (saved === 'en' || saved === 'ka') setLang(saved)
    } catch {
      // Private mode. Georgian it is.
    }
  }, [])

  // The <html lang> is set to en-GB by the shared root layout, which cannot
  // know about this page. Screen readers and hyphenation both read it.
  //
  // The tab *title* deliberately does NOT move with the toggle. Writing
  // `document.title` here loses a race with Next's own metadata pass, which
  // rewrites <title> after this effect on a hard navigation — measured, not
  // assumed. Winning that race would mean a timer or a MutationObserver on the
  // head, which is a lot of machinery for a browser tab; the title in
  // `page.tsx` carries both languages instead.
  useEffect(() => {
    document.documentElement.lang = lang === 'ka' ? 'ka' : 'en-GB'
  }, [lang])

  const t = (c: Copy) => c[lang]

  const switchTo = (next: Lang) => {
    setLang(next)
    try { localStorage.setItem(LANG_KEY, next) } catch { /* not persisted */ }
  }

  return (
    <main style={{ backgroundColor: DEMO.ground, color: DEMO.text, minHeight: '100vh' }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header
        style={{
          position: 'sticky', top: 0, zIndex: 20,
          backgroundColor: 'rgba(30, 14, 17, 0.86)',
          backdropFilter: 'blur(10px)',
          borderBottom: `1px solid ${DEMO.border}`,
        }}
      >
        <div style={{ ...wrap, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingTop: 14, paddingBottom: 14 }}>
          <a href="/welcome" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', color: DEMO.text }}>
            {platformLogo ? (
              // maxWidth because the value comes from an operator-set
              // x-platform-logo header with no shape constraint: a wide logo at
              // 30px tall would squeeze the language toggle out of this
              // space-between row.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={platformLogo} alt={platformLogoAlt} style={{ height: 30, width: 'auto', maxWidth: 180 }} />
            ) : (
              <>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 9, backgroundColor: DEMO.accentSolid, color: DEMO_FX.onAccent }}>
                  <Wine size={17} strokeWidth={2.2} />
                </span>
                <strong style={{ fontSize: '1.02rem', letterSpacing: '-0.01em' }}>Vineworks</strong>
              </>
            )}
          </a>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Two buttons rather than one toggling label: the visitor can see
                which language is active and which is on offer at the same time. */}
            <div style={{ display: 'flex', borderRadius: 999, border: `1px solid ${DEMO.border}`, overflow: 'hidden' }}>
              {(['ka', 'en'] as Lang[]).map(l => (
                <button
                  key={l}
                  onClick={() => switchTo(l)}
                  aria-pressed={lang === l}
                  style={{
                    padding: '5px 11px', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.04em',
                    border: 'none', cursor: 'pointer',
                    backgroundColor: lang === l ? DEMO.raised : 'transparent',
                    color: lang === l ? DEMO.text : DEMO.muted,
                  }}
                >
                  {LANG_LABEL[l]}
                </button>
              ))}
            </div>
            {!isNarrow && (
              <a href={DEMO_URL} style={{ ...btnSolid, padding: '8px 15px', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                {t(NAV.cta)}
              </a>
            )}
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section style={{ ...wrap, paddingTop: 72, paddingBottom: 64 }}>
        <p style={eyebrow}>{t(HERO.eyebrow)}</p>
        <h1
          style={{
            margin: '14px 0 0',
            fontSize: 'clamp(2rem, 5vw, 3.25rem)',
            lineHeight: 1.14,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            maxWidth: '18ch',
          }}
        >
          {t(HERO.title)}
        </h1>
        <p style={{ margin: '22px 0 0', fontSize: 'clamp(1rem, 1.6vw, 1.15rem)', lineHeight: 1.65, color: DEMO.muted, maxWidth: '58ch' }}>
          {t(HERO.body)}
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 32 }}>
          <a href={DEMO_URL} style={btnSolid}>
            {t(HERO.ctaPrimary)} <ArrowRight size={16} strokeWidth={2.4} />
          </a>
          <a href={`mailto:${CONTACT_EMAIL}`} style={btnGhost}>
            {t(HERO.ctaSecondary)}
          </a>
        </div>
        <p style={{ margin: '14px 0 0', fontSize: '0.82rem', color: DEMO.muted }}>{t(HERO.ctaNote)}</p>
      </section>

      {/* ── The problem ────────────────────────────────────────────────── */}
      <section style={{ borderTop: `1px solid ${DEMO.border}`, backgroundColor: '#251216' }}>
        <div style={{ ...wrap, paddingTop: 60, paddingBottom: 60 }}>
          <h2 style={h2}>{t(PROBLEM.heading)}</h2>
          <ul style={{ listStyle: 'none', margin: '26px 0 0', padding: 0, display: 'grid', gap: 14, maxWidth: '70ch' }}>
            {PROBLEM.items.map((item, i) => (
              <li key={i} style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
                <span style={{ color: DEMO.accent, fontWeight: 700, fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ fontSize: '1.02rem', lineHeight: 1.6 }}>{t(item)}</span>
              </li>
            ))}
          </ul>
          <p style={{ margin: '26px 0 0', fontSize: '1rem', lineHeight: 1.6, color: DEMO.muted, maxWidth: '62ch' }}>
            {t(PROBLEM.close)}
          </p>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────── */}
      <section id="features" style={{ ...wrap, paddingTop: 72, paddingBottom: 20, scrollMarginTop: 70 }}>
        <h2 style={h2}>{t(NAV.features)}</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 16,
            marginTop: 28,
          }}
        >
          {FEATURES.map(f => {
            const Icon = ICONS[f.icon]
            return (
              <div
                key={f.icon}
                style={{
                  backgroundColor: DEMO.surface,
                  border: `1px solid ${DEMO.border}`,
                  borderRadius: 14,
                  padding: '20px 20px 22px',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 10, backgroundColor: DEMO.raised, color: DEMO.accent }}>
                  <Icon size={19} strokeWidth={2} />
                </span>
                <h3 style={{ margin: '14px 0 0', fontSize: '1.02rem', fontWeight: 700, lineHeight: 1.35 }}>{t(f.title)}</h3>
                <p style={{ margin: '9px 0 0', fontSize: '0.9rem', lineHeight: 1.6, color: DEMO.muted }}>{t(f.body)}</p>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── The live mirror ────────────────────────────────────────────── */}
      <section style={{ ...wrap, paddingTop: 52, paddingBottom: 72 }}>
        <div
          style={{
            backgroundColor: DEMO.surface,
            border: `1px solid ${DEMO.accent}`,
            borderRadius: 18,
            padding: 'clamp(24px, 4vw, 40px)',
            boxShadow: DEMO_FX.shadowMd,
          }}
        >
          <p style={{ ...eyebrow, color: DEMO.accent }}>{t(MIRROR.eyebrow)}</p>
          <h2 style={{ margin: '12px 0 0', fontSize: 'clamp(1.5rem, 3vw, 2.1rem)', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.015em' }}>
            {t(MIRROR.title)}
          </h2>
          <p style={{ margin: '16px 0 0', fontSize: '1rem', lineHeight: 1.65, color: DEMO.muted, maxWidth: '62ch' }}>
            {t(MIRROR.body)}
          </p>
          <a href={DEMO_MIRROR_URL} style={{ ...btnSolid, marginTop: 26 }}>
            <Columns2 size={16} strokeWidth={2.2} /> {t(MIRROR.cta)}
          </a>
        </div>
      </section>

      {/* ── Vision ─────────────────────────────────────────────────────── */}
      <section style={{ borderTop: `1px solid ${DEMO.border}`, backgroundColor: '#251216' }}>
        <div style={{ ...wrap, paddingTop: 64, paddingBottom: 64 }}>
          <h2 style={h2}>{t(VISION.heading)}</h2>
          <div style={{ marginTop: 22, display: 'grid', gap: 16, maxWidth: '64ch' }}>
            {VISION.body.map((p, i) => (
              <p
                key={i}
                style={{
                  margin: 0,
                  // The opening line is the argument; the rest supports it.
                  fontSize: i === 0 ? 'clamp(1.15rem, 2.2vw, 1.4rem)' : '1rem',
                  lineHeight: i === 0 ? 1.45 : 1.68,
                  fontWeight: i === 0 ? 600 : 400,
                  color: i === 0 ? DEMO.text : DEMO.muted,
                }}
              >
                {t(p)}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────────────── */}
      <section id="demo" style={{ ...wrap, paddingTop: 72, paddingBottom: 76, scrollMarginTop: 70 }}>
        <h2 style={{ margin: 0, fontSize: 'clamp(1.6rem, 3.4vw, 2.3rem)', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em', maxWidth: '22ch' }}>
          {t(FINAL.title)}
        </h2>
        <p style={{ margin: '18px 0 0', fontSize: '1rem', lineHeight: 1.65, color: DEMO.muted, maxWidth: '62ch' }}>
          {t(FINAL.body)}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 28 }}>
          <a href={DEMO_URL} style={btnSolid}>
            {t(FINAL.ctaPrimary)} <ArrowRight size={16} strokeWidth={2.4} />
          </a>
          <a href={`mailto:${CONTACT_EMAIL}`} style={btnGhost}>
            {t(FINAL.ctaSecondary)}
          </a>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer id="contact" style={{ borderTop: `1px solid ${DEMO.border}`, scrollMarginTop: 70 }}>
        <div style={{ ...wrap, paddingTop: 30, paddingBottom: 40, display: 'flex', flexWrap: 'wrap', gap: 14, justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: DEMO.muted }}>
            <strong style={{ color: DEMO.text }}>Vineworks</strong> · {t(FOOTER.tagline)}
          </span>
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ fontSize: '0.85rem', color: DEMO.accent, textDecoration: 'underline', textUnderlineOffset: 4 }}>
            {CONTACT_EMAIL}
          </a>
        </div>
      </footer>
    </main>
  )
}

/* ── Shared style objects ─────────────────────────────────────────────────
   Inline rather than Tailwind, matching every other demo-chrome component: the
   colours come from a TS module, and mixing `style` colours with Tailwind
   spacing is how the demo components ended up hard to read. ---------------- */

const wrap: React.CSSProperties = {
  maxWidth: 1080,
  marginLeft: 'auto',
  marginRight: 'auto',
  paddingLeft: 'clamp(20px, 5vw, 40px)',
  paddingRight: 'clamp(20px, 5vw, 40px)',
}

const eyebrow: React.CSSProperties = {
  margin: 0,
  fontSize: '0.74rem',
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: DEMO.muted,
}

const h2: React.CSSProperties = {
  margin: 0,
  fontSize: 'clamp(1.4rem, 2.8vw, 1.9rem)',
  fontWeight: 700,
  lineHeight: 1.25,
  letterSpacing: '-0.015em',
}

const btnBase: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  borderRadius: 999,
  padding: '12px 22px',
  fontSize: '0.92rem',
  fontWeight: 700,
  textDecoration: 'none',
  cursor: 'pointer',
}

const btnSolid: React.CSSProperties = {
  ...btnBase,
  backgroundColor: DEMO.accentSolid,
  color: DEMO_FX.onAccent,
  border: `1px solid ${DEMO.accentSolid}`,
}

const btnGhost: React.CSSProperties = {
  ...btnBase,
  backgroundColor: 'transparent',
  color: DEMO.text,
  border: `1px solid ${DEMO.border}`,
}
