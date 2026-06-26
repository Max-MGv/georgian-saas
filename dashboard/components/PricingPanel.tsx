'use client'

import { useState } from 'react'

const TIERS = [
  {
    id: 'basic',
    badge: 'Tier 1',
    badgeStyle: { background: '#14532d', color: '#86efac' },
    title: 'Basic — shared domain',
    subtitle: 'Everything on your domain, slug-based URLs',
    price: 'Included',
    effort: 1,
    urls: [
      { label: 'Public page', value: 'maxsapp.com/book/slug' },
      { label: 'Login', value: 'maxsapp.com/login' },
      { label: 'Admin', value: 'maxsapp.com/admin' },
      { label: 'DNS managed by', value: 'You — client does nothing', mono: false },
    ],
    pros: ['Zero setup for client', 'Works immediately', 'No domain cost'],
    cons: ['Your domain in their URL'],
    steps: [
      'Client signs up and gets a unique slug (e.g. hotel-marani)',
      'Public booking page live at maxsapp.com/book/hotel-marani — no setup needed',
      'Client shares the link on WhatsApp, Instagram, Google Maps',
      'Login at maxsapp.com/login — RLS shows only their data after sign-in',
    ],
    effortNote: 'Slug routing only — most of this is already built',
    effortColor: '#16a34a',
    stepStyle: { background: '#14532d', color: '#86efac' },
  },
  {
    id: 'subdomain',
    badge: 'Tier 2',
    badgeStyle: { background: '#1e3a5f', color: '#93c5fd' },
    title: 'Subdomain — branded URL',
    subtitle: 'Client gets their own subdomain on your domain',
    price: '+€5–10 / mo',
    effort: 2,
    urls: [
      { label: 'Public page', value: 'client.maxsapp.com' },
      { label: 'Login', value: 'maxsapp.com/login' },
      { label: 'Admin', value: 'maxsapp.com/admin' },
      { label: 'DNS managed by', value: 'You — client does nothing', mono: false },
    ],
    pros: ['Feels personal to client', 'You control everything', 'Pure margin upsell'],
    cons: ['Still your domain', "Client can't transfer it"],
    steps: [
      'Client upgrades — you create hotel-marani.maxsapp.com for them',
      'You add a DNS record on your end — client does nothing',
      'App detects subdomain, resolves tenant, serves their page',
      'Their /book/slug URL is blocked — subdomain is their only public URL',
    ],
    effortNote: 'Subdomain routing + tenant resolution logic',
    effortColor: '#2563eb',
    stepStyle: { background: '#1e3a5f', color: '#93c5fd' },
  },
  {
    id: 'custom',
    badge: 'Tier 3',
    badgeStyle: { background: '#2e1065', color: '#c4b5fd' },
    title: 'Custom domain — fully branded',
    subtitle: 'Client owns their domain, full white-label',
    price: '+€20–30 / mo',
    effort: 3,
    urls: [
      { label: 'Public page', value: 'client.com' },
      { label: 'Login', value: 'maxsapp.com/login' },
      { label: 'Admin', value: 'maxsapp.com/admin' },
      { label: 'DNS managed by', value: 'Client — they update their CNAME', mono: false },
    ],
    pros: ['Fully white-label', 'Client owns their domain', 'Best for SEO'],
    cons: ['Client must buy a domain', 'DNS setup is a support burden', 'Domain expiry risk'],
    steps: [
      'Client buys their own domain (e.g. hotel-marani.com) from any registrar',
      'They enter it in your dashboard — you give them a CNAME record to add',
      'DNS propagates (up to 48h) — app verifies ownership, issues SSL',
      'Visitor goes to hotel-marani.com — server detects domain, serves their page',
    ],
    effortNote: 'Domain verification UI, DNS routing, SSL per domain, expiry handling',
    effortColor: '#7c3aed',
    stepStyle: { background: '#2e1065', color: '#c4b5fd' },
  },
]

function EffortDots({ count }: { count: number }) {
  return (
    <div style={{ display: 'flex', gap: 3 }}>
      {[1, 2, 3].map(i => (
        <div key={i} style={{
          width: 7, height: 7, borderRadius: '50%',
          background: i <= count ? '#9ca3af' : '#374151',
        }} />
      ))}
    </div>
  )
}

function TierCard({ tier }: { tier: typeof TIERS[0] }) {
  const [open, setOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)

  return (
    <div style={{ border: '1px solid #374151', borderRadius: 10, background: '#111827', marginBottom: 10, overflow: 'hidden' }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer', userSelect: 'none' }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 5, whiteSpace: 'nowrap', ...tier.badgeStyle }}>
          {tier.badge}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#f9fafb' }}>{tier.title}</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>{tier.subtitle}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: '#d1d5db' }}>{tier.price}</span>
          <EffortDots count={tier.effort} />
        </div>
        <span style={{ color: '#4b5563', fontSize: 14, marginLeft: 4, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
      </div>

      {open && (
        <div style={{ borderTop: '1px solid #1f2937', padding: '14px 16px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
            {tier.urls.map(u => (
              <div key={u.label} style={{ background: '#1f2937', borderRadius: 6, padding: '8px 12px' }}>
                <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{u.label}</div>
                <div style={{ fontSize: 11, color: '#e5e7eb', fontFamily: u.mono === false ? 'inherit' : 'monospace' }}>{u.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
            {tier.pros.map(p => (
              <span key={p} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, background: '#14532d22', color: '#86efac', border: '1px solid #166534' }}>{p}</span>
            ))}
            {tier.cons.map(c => (
              <span key={c} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 5, background: '#7f1d1d22', color: '#fca5a5', border: '1px solid #991b1b' }}>{c}</span>
            ))}
          </div>

          <div style={{ border: '1px solid #1f2937', borderRadius: 6, overflow: 'hidden' }}>
            <div
              onClick={() => setDetailOpen(o => !o)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', cursor: 'pointer', userSelect: 'none', background: '#1f2937' }}
            >
              <span style={{ fontSize: 12, color: '#9ca3af' }}>ℹ How it works</span>
              <span style={{ fontSize: 12, color: '#4b5563', transform: detailOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
            </div>
            {detailOpen && (
              <div style={{ padding: '10px 12px', borderTop: '1px solid #1f2937' }}>
                {tier.steps.map((step, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 600, ...tier.stepStyle,
                    }}>{i + 1}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.5 }}>{step}</div>
                  </div>
                ))}
                <div style={{ fontSize: 10, color: '#4b5563', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 10, marginBottom: 4 }}>Build effort</div>
                <div style={{ height: 3, borderRadius: 2, background: '#374151', overflow: 'hidden', marginBottom: 4 }}>
                  <div style={{ height: '100%', borderRadius: 2, background: tier.effortColor, width: `${(tier.effort / 3) * 100}%` }} />
                </div>
                <div style={{ fontSize: 11, color: '#4b5563' }}>{tier.effortNote}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function PricingPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: 420,
      background: '#0f172a', borderLeft: '1px solid #1e293b',
      display: 'flex', flexDirection: 'column', zIndex: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid #1e293b', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>Pricing model</div>
          <div style={{ fontSize: 11, color: '#475569', marginTop: 1 }}>Three tiers — click to expand</div>
        </div>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '2px 6px' }}
        >
          ✕
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 14px 20px' }}>
        <div style={{ fontSize: 11, color: '#374151', marginBottom: 12 }}>
          Effort dots = build complexity · Pricing is suggested
        </div>
        {TIERS.map(tier => <TierCard key={tier.id} tier={tier} />)}
      </div>
    </div>
  )
}
