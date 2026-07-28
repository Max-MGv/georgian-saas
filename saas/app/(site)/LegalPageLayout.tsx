import { t } from '@/lib/t'

// Shared shell for /terms, /privacy, /returns — title, breadcrumb, single content
// card. Content is plain text (no markdown/HTML) with paragraphs separated by a
// blank line; each paragraph becomes its own <p>.
export default function LegalPageLayout({ locale, title, content }: { locale: string; title: string; content: string }) {
  const paragraphs = content.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)

  return (
    <div className="max-w-2xl mx-auto px-6 py-16">
      <p className="text-sm mb-2" style={{ color: 'var(--site-secondary)' }}>
        <a href="/" className="hover:opacity-70 transition-opacity">{t(locale, 'legal.breadcrumb_home')}</a>
        {' / '}
        <span style={{ color: 'var(--site-muted)' }}>{title}</span>
      </p>
      <h1 className="text-3xl font-bold mb-8" style={{ color: 'var(--site-text)' }}>{title}</h1>

      <div className="rounded-xl border p-6 sm:p-8 space-y-4"
        style={{ backgroundColor: 'var(--site-surface)', borderColor: 'var(--site-border)' }}>
        {paragraphs.map((p, i) => (
          <p key={i} className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--site-text)' }}>{p}</p>
        ))}
      </div>
    </div>
  )
}
