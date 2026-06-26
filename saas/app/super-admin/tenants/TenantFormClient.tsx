'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ColorPicker } from '../ColorPicker'
import { createTenant, updateTenant } from '@/app/actions/superAdmin'

type Props = {
  mode: 'new' | 'edit'
  tenant?: {
    id: string
    name: string
    domain: string
    slug: string
    primaryColor: string
    primaryHover: string
  }
}

const C = {
  bg: '#111827',
  border: '#1e293b',
  borderFocus: '#6366f1',
  text: '#f1f5f9',
  muted: '#94a3b8',
  faint: '#475569',
  inputBg: '#0b1120',
  label: '#64748b',
}

function toSlug(name: string) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: C.muted, marginBottom: 6 }}>
        {label}
      </label>
      {children}
      {hint && <p style={{ fontSize: 12, color: C.faint, marginTop: 5 }}>{hint}</p>}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8, outline: 'none',
  border: `1px solid ${C.border}`, backgroundColor: C.inputBg,
  color: C.text, fontSize: 14, boxSizing: 'border-box',
}

export default function TenantFormClient({ mode, tenant }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [name, setName] = useState(tenant?.name ?? '')
  const [domain, setDomain] = useState(tenant?.domain ?? '')
  const [slug, setSlug] = useState(tenant?.slug ?? '')
  const [primaryColor, setPrimaryColor] = useState(tenant?.primaryColor ?? '#7c1d23')
  const [primaryHover, setPrimaryHover] = useState(tenant?.primaryHover ?? '#9b2429')
  const [slugTouched, setSlugTouched] = useState(mode === 'edit')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  function handleNameChange(val: string) {
    setName(val)
    if (!slugTouched) setSlug(toSlug(val))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!name.trim() || !domain.trim() || !slug.trim()) {
      setError('Name, domain, and slug are all required.')
      return
    }

    startTransition(async () => {
      try {
        if (mode === 'new') {
          await createTenant({ name, domain, slug, primaryColor, primaryHover })
        } else {
          await updateTenant(tenant!.id, { name, domain, slug, primaryColor, primaryHover })
          setSuccess(true)
          setTimeout(() => setSuccess(false), 2500)
        }
        if (mode === 'new') router.push('/super-admin/tenants')
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Something went wrong')
      }
    })
  }

  return (
    <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      {/* Form */}
      <form onSubmit={handleSubmit} style={{ flex: '1 1 400px', minWidth: 320 }}>
        <div style={{
          backgroundColor: C.bg, border: `1px solid ${C.border}`, borderRadius: 14,
          padding: 24, display: 'flex', flexDirection: 'column', gap: 20,
        }}>
          <Field label="Client name" hint="The winery or business name (e.g. Nikalas Marani)">
            <input
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="Nikalas Marani"
              required
              style={inputStyle}
            />
          </Field>

          <Field label="Domain" hint="The custom domain this tenant will use (e.g. nikalasmarani.ge)">
            <input
              value={domain}
              onChange={e => setDomain(e.target.value)}
              placeholder="nikalasmarani.ge"
              required
              style={inputStyle}
            />
          </Field>

          <Field label="Slug" hint="Short URL-safe identifier used internally (auto-filled from name)">
            <input
              value={slug}
              onChange={e => { setSlug(e.target.value); setSlugTouched(true) }}
              placeholder="nikalas-marani"
              required
              style={{ ...inputStyle, fontFamily: 'monospace' }}
            />
          </Field>

          {/* Color pickers */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: C.muted, marginBottom: 14 }}>
              Brand colors
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, color: C.faint, width: 80, flexShrink: 0 }}>Primary</span>
                <ColorPicker color={primaryColor} onChange={setPrimaryColor} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, color: C.faint, width: 80, flexShrink: 0 }}>Hover</span>
                <ColorPicker color={primaryHover} onChange={setPrimaryHover} />
              </div>
            </div>
            <p style={{ fontSize: 12, color: C.faint, marginTop: 8 }}>
              Hover is usually a slightly darker shade of the primary color.
            </p>
          </div>

          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, fontSize: 13,
              backgroundColor: '#450a0a', border: '1px solid #7f1d1d', color: '#fca5a5',
            }}>
              {error}
            </div>
          )}

          {success && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, fontSize: 13,
              backgroundColor: '#052e16', border: '1px solid #166534', color: '#86efac',
            }}>
              Saved successfully.
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
            <button
              type="submit"
              disabled={isPending}
              style={{
                padding: '10px 24px', borderRadius: 8, fontSize: 14, fontWeight: 500,
                backgroundColor: '#6366f1', color: '#fff', cursor: 'pointer',
                border: 'none', opacity: isPending ? 0.7 : 1,
              }}
            >
              {isPending ? 'Saving…' : mode === 'new' ? 'Create Tenant' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={() => router.push('/super-admin/tenants')}
              style={{
                padding: '10px 18px', borderRadius: 8, fontSize: 14, cursor: 'pointer',
                backgroundColor: '#1e293b', border: '1px solid #334155', color: C.muted,
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </form>

      {/* Live Preview */}
      <div style={{ flex: '0 0 280px', minWidth: 240 }}>
        <p style={{ fontSize: 12, fontWeight: 500, color: C.faint, marginBottom: 12, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Brand Preview
        </p>
        <div style={{
          backgroundColor: '#fff9f3', borderRadius: 12, border: '1px solid #e0d4c0',
          overflow: 'hidden',
        }}>
          {/* Mock nav strip */}
          <div style={{
            height: 44, backgroundColor: primaryColor,
            display: 'flex', alignItems: 'center', paddingInline: 16, gap: 12,
          }}>
            <div style={{ width: 70, height: 8, backgroundColor: 'rgba(255,255,255,0.6)', borderRadius: 4 }} />
            <div style={{ flex: 1 }} />
            <div style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 11,
              backgroundColor: 'rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.9)',
            }}>Book</div>
          </div>

          {/* Mock content */}
          <div style={{ padding: '20px 16px' }}>
            <div style={{ fontSize: 11, color: primaryColor, fontWeight: 600, marginBottom: 8 }}>
              {name || 'Client Name'}
            </div>
            <div style={{ fontSize: 13, color: '#1c1008', marginBottom: 6 }}>
              {domain || 'yourdomain.ge'}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              <button style={{
                padding: '8px 18px', borderRadius: 7, fontSize: 12,
                backgroundColor: primaryColor, color: '#fff', border: 'none', cursor: 'default',
              }}>
                Book a Visit
              </button>
              <button style={{
                padding: '8px 18px', borderRadius: 7, fontSize: 12,
                backgroundColor: '#fff', color: primaryColor,
                border: `1.5px solid ${primaryColor}`, cursor: 'default',
              }}>
                Learn More
              </button>
            </div>
            <div style={{
              marginTop: 14, padding: '8px 12px', borderRadius: 8,
              backgroundColor: `${primaryColor}18`,
              borderLeft: `3px solid ${primaryColor}`,
              fontSize: 12, color: '#6b5a47',
            }}>
              Booking confirmation text in brand color accent.
            </div>
          </div>
        </div>

        {/* Color info */}
        <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, padding: '8px 10px', borderRadius: 7, backgroundColor: '#111827', border: '1px solid #1e293b' }}>
            <div style={{ width: '100%', height: 20, borderRadius: 4, backgroundColor: primaryColor, marginBottom: 4 }} />
            <div style={{ fontSize: 11, color: C.faint, fontFamily: 'monospace' }}>{primaryColor}</div>
          </div>
          <div style={{ flex: 1, padding: '8px 10px', borderRadius: 7, backgroundColor: '#111827', border: '1px solid #1e293b' }}>
            <div style={{ width: '100%', height: 20, borderRadius: 4, backgroundColor: primaryHover, marginBottom: 4 }} />
            <div style={{ fontSize: 11, color: C.faint, fontFamily: 'monospace' }}>{primaryHover}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
