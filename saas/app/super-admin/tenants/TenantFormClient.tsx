'use client'

import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ColorPicker } from '../ColorPicker'
import { createTenant, updateTenant, checkTenantDomain, type DomainCheckResult } from '@/app/actions/superAdmin'
import { uploadTenantLogoAdmin, uploadTenantFaviconAdmin } from '@/app/actions/uploadLogo'
import { THEME_PRESETS, resolveTenantTheme, DEFAULT_PRESET_ID, type PresetId } from '@/lib/themePresets'

type Props = {
  mode: 'new' | 'edit'
  tenant?: {
    id: string
    name: string
    domain: string
    slug: string
    presetId: PresetId
    primaryColorOverride?: string
    logoUrl?: string | null
    logoAlt?: string
    faviconUrl?: string | null
    displayName?: string
    modulesBooking?: boolean
    modulesWineOrders?: boolean
    modulesPublicSite?: boolean
    modulesLegalPages?: boolean
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
  const [displayName, setDisplayName] = useState(tenant?.displayName ?? '')
  const [presetId, setPresetId] = useState<PresetId>(tenant?.presetId ?? DEFAULT_PRESET_ID)
  const [overrideEnabled, setOverrideEnabled] = useState(!!tenant?.primaryColorOverride)
  const [primaryColorOverride, setPrimaryColorOverride] = useState(
    tenant?.primaryColorOverride ?? THEME_PRESETS[tenant?.presetId ?? DEFAULT_PRESET_ID].tokens.brand
  )
  const resolvedTheme = resolveTenantTheme({
    v: 1, presetId, primaryColorOverride: overrideEnabled ? primaryColorOverride : undefined,
  })
  const [logoUrl, setLogoUrl] = useState<string | null>(tenant?.logoUrl ?? null)
  const [logoAlt, setLogoAlt] = useState(tenant?.logoAlt ?? '')
  const [faviconUrl, setFaviconUrl] = useState<string | null>(tenant?.faviconUrl ?? null)
  const [modulesBooking, setModulesBooking] = useState(tenant?.modulesBooking ?? true)
  const [modulesWineOrders, setModulesWineOrders] = useState(tenant?.modulesWineOrders ?? false)
  const [modulesPublicSite, setModulesPublicSite] = useState(tenant?.modulesPublicSite ?? true)
  const [modulesLegalPages, setModulesLegalPages] = useState(tenant?.modulesLegalPages ?? true)
  const [slugTouched, setSlugTouched] = useState(mode === 'edit')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [faviconUploading, setFaviconUploading] = useState(false)
  const [idCopied, setIdCopied] = useState(false)
  const [domainCheck, setDomainCheck] = useState<DomainCheckResult | null>(null)
  const [domainChecking, setDomainChecking] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const faviconInputRef = useRef<HTMLInputElement>(null)

  async function handleDomainCheck() {
    if (!tenant?.id || !domain.trim()) return
    setDomainChecking(true)
    setDomainCheck(null)
    try {
      setDomainCheck(await checkTenantDomain(domain, tenant.id))
    } catch (err) {
      setDomainCheck({ status: 'unreachable', message: err instanceof Error ? err.message : 'Check failed' })
    } finally {
      setDomainChecking(false)
    }
  }

  function domainCheckDisplay(r: DomainCheckResult): { color: string; text: string } {
    switch (r.status) {
      case 'ok':
        return { color: '#86efac', text: `✓ Domain reaches the platform and resolves to this tenant (${r.resolvedSlug})` }
      case 'wrong-tenant':
        return { color: '#fca5a5', text: `✗ Domain resolves to a different tenant: ${r.resolvedSlug}` }
      case 'no-tenant':
        return { color: '#fcd34d', text: '⚠ Domain reaches the platform but no tenant is assigned to it yet — save this form first, then re-check (changes can take up to 5 min due to caching)' }
      case 'not-our-app':
        return { color: '#fca5a5', text: `✗ Domain responds (HTTP ${r.httpStatus}) but is not serving this platform — is it added to the Vercel project?` }
      case 'unreachable':
        return { color: '#fca5a5', text: `✗ ${r.message}` }
    }
  }

  function copyTenantId() {
    if (!tenant?.id) return
    navigator.clipboard.writeText(tenant.id)
    setIdCopied(true)
    setTimeout(() => setIdCopied(false), 1800)
  }

  function handleNameChange(val: string) {
    setName(val)
    if (!slugTouched) setSlug(toSlug(val))
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !tenant?.id) return
    setLogoUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const url = await uploadTenantLogoAdmin(tenant.id, fd)
      setLogoUrl(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Logo upload failed')
    } finally {
      setLogoUploading(false)
    }
  }

  async function handleFaviconUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !tenant?.id) return
    setFaviconUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const url = await uploadTenantFaviconAdmin(tenant.id, fd)
      setFaviconUrl(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Favicon upload failed')
    } finally {
      setFaviconUploading(false)
    }
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
        const payload = {
          name, domain, slug,
          presetId,
          primaryColorOverride: overrideEnabled ? primaryColorOverride : undefined,
          logoUrl, logoAlt, faviconUrl,
          displayName: displayName || undefined,
          modulesBooking, modulesWineOrders, modulesPublicSite, modulesLegalPages,
        }
        if (mode === 'new') {
          await createTenant(payload)
        } else {
          await updateTenant(tenant!.id, payload)
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
          {tenant?.id && (
            <Field label="Tenant ID" hint="Used for the set-admin script and seed scripts">
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={tenant.id}
                  readOnly
                  style={{ ...inputStyle, fontFamily: 'monospace', color: C.muted, cursor: 'text' }}
                />
                <button
                  type="button"
                  onClick={copyTenantId}
                  style={{
                    padding: '0 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
                    backgroundColor: idCopied ? '#052e16' : '#1e293b',
                    border: `1px solid ${idCopied ? '#166534' : '#334155'}`,
                    color: idCopied ? '#86efac' : C.muted, flexShrink: 0,
                  }}
                >
                  {idCopied ? 'Copied ✓' : 'Copy'}
                </button>
              </div>
            </Field>
          )}

          <Field label="Client name" hint="The winery or business name (e.g. Nikalas Marani)">
            <input
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="Nikalas Marani"
              required
              style={inputStyle}
            />
          </Field>

          <Field label="Domain" hint="The domain this tenant answers on. Two steps: 1) add the domain to the Vercel project (Settings → Domains), 2) save it here. Changes can take up to 5 min to go live (routing cache).">
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                value={domain}
                onChange={e => { setDomain(e.target.value); setDomainCheck(null) }}
                placeholder="nikalasmarani.vercel.app"
                required
                style={inputStyle}
              />
              {tenant?.id && (
                <button
                  type="button"
                  onClick={handleDomainCheck}
                  disabled={domainChecking || !domain.trim()}
                  style={{
                    padding: '0 16px', borderRadius: 8, fontSize: 13, cursor: domainChecking ? 'wait' : 'pointer',
                    backgroundColor: '#1e293b', border: '1px solid #334155',
                    color: C.muted, flexShrink: 0,
                  }}
                >
                  {domainChecking ? 'Checking…' : 'Check'}
                </button>
              )}
            </div>
            {domainCheck && (
              <p style={{ fontSize: 12, marginTop: 6, color: domainCheckDisplay(domainCheck).color }}>
                {domainCheckDisplay(domainCheck).text}
              </p>
            )}
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

          <Field label="Display name" hint="Shown in browser tab title and admin nav. Defaults to client name if blank.">
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder={name || 'Nikalas Marani'}
              style={inputStyle}
            />
          </Field>

          {/* Logo upload */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: C.muted, marginBottom: 6 }}>
              Logo
            </label>
            <p style={{ fontSize: 12, color: C.faint, marginBottom: 8 }}>
              Must work on a light/white background. SVG or PNG recommended.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {logoUrl && (
                <div style={{
                  padding: '8px 12px', backgroundColor: '#fff9f3', borderRadius: 8,
                  border: '1px solid #e0d4c0',
                }}>
                  <img src={logoUrl} alt="Logo preview" style={{ height: 36, width: 'auto', display: 'block' }} />
                </div>
              )}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/svg+xml,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={handleLogoUpload}
              />
              <button
                type="button"
                disabled={!tenant?.id || logoUploading}
                onClick={() => logoInputRef.current?.click()}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: tenant?.id ? 'pointer' : 'not-allowed',
                  backgroundColor: '#1e293b', border: '1px solid #334155', color: C.muted,
                  opacity: !tenant?.id || logoUploading ? 0.5 : 1,
                }}
              >
                {logoUploading ? 'Uploading…' : logoUrl ? 'Replace' : 'Upload logo'}
              </button>
              {logoUrl && (
                <button
                  type="button"
                  onClick={() => setLogoUrl(null)}
                  style={{ fontSize: 12, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Remove
                </button>
              )}
            </div>
            {!tenant?.id && (
              <p style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>Save the tenant first, then upload a logo.</p>
            )}
            {logoUrl && (
              <Field label="Logo alt text" hint="Shown when logo image fails to load (accessibility)">
                <input
                  value={logoAlt}
                  onChange={e => setLogoAlt(e.target.value)}
                  placeholder={name || 'Winery logo'}
                  style={{ ...inputStyle, marginTop: 8 }}
                />
              </Field>
            )}
          </div>

          {/* Favicon upload */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: C.muted, marginBottom: 6 }}>
              Favicon
            </label>
            <p style={{ fontSize: 12, color: C.faint, marginBottom: 8 }}>
              ICO or 32×32 PNG. Shown in browser tabs.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {faviconUrl && (
                <img src={faviconUrl} alt="Favicon" style={{ width: 32, height: 32 }} />
              )}
              <input
                ref={faviconInputRef}
                type="file"
                accept="image/x-icon,image/png,image/svg+xml"
                style={{ display: 'none' }}
                onChange={handleFaviconUpload}
              />
              <button
                type="button"
                disabled={!tenant?.id || faviconUploading}
                onClick={() => faviconInputRef.current?.click()}
                style={{
                  padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: tenant?.id ? 'pointer' : 'not-allowed',
                  backgroundColor: '#1e293b', border: '1px solid #334155', color: C.muted,
                  opacity: !tenant?.id || faviconUploading ? 0.5 : 1,
                }}
              >
                {faviconUploading ? 'Uploading…' : faviconUrl ? 'Replace' : 'Upload favicon'}
              </button>
              {faviconUrl && (
                <button
                  type="button"
                  onClick={() => setFaviconUrl(null)}
                  style={{ fontSize: 12, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  Remove
                </button>
              )}
            </div>
            {!tenant?.id && (
              <p style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>Save the tenant first, then upload a favicon.</p>
            )}
          </div>

          {/* Modules */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: C.muted, marginBottom: 6 }}>
              Modules
            </label>
            <p style={{ fontSize: 12, color: C.faint, marginBottom: 10 }}>
              Which parts of the platform this tenant has access to.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={modulesBooking} onChange={e => setModulesBooking(e.target.checked)} />
                <span style={{ fontSize: 14, color: C.text }}>Bookings</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={modulesWineOrders} onChange={e => setModulesWineOrders(e.target.checked)} />
                <span style={{ fontSize: 14, color: C.text }}>Wine Orders</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={modulesPublicSite} onChange={e => setModulesPublicSite(e.target.checked)} />
                <span style={{ fontSize: 14, color: C.text }}>Public website</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={modulesLegalPages} onChange={e => setModulesLegalPages(e.target.checked)} />
                <span style={{ fontSize: 14, color: C.text }}>Legal pages</span>
              </label>
              {!modulesLegalPages && (
                <p style={{ fontSize: 12, color: '#fbbf24', padding: '8px 12px', backgroundColor: '#451a03', borderRadius: 6 }}>
                  Terms/Privacy/Returns pages and footer links will be hidden. On by default — this is a legal expectation, not an opt-in feature.
                </p>
              )}
              {!modulesPublicSite && (
                <p style={{ fontSize: 12, color: '#fbbf24', padding: '8px 12px', backgroundColor: '#451a03', borderRadius: 6 }}>
                  Public domain will show a &quot;coming soon&quot; page. Admin panel stays fully usable.
                </p>
              )}
            </div>
          </div>

          {/* Theme preset picker */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: C.muted, marginBottom: 10 }}>
              Theme
            </label>
            {(['light', 'dark'] as const).map(category => (
              <div key={category} style={{ marginBottom: category === 'light' ? 14 : 0 }}>
                <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: C.faint, margin: '0 0 6px' }}>
                  {category === 'light' ? 'Light' : 'Dark'}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {(Object.keys(THEME_PRESETS) as PresetId[]).filter(id => THEME_PRESETS[id].category === category).map(id => {
                    const preset = THEME_PRESETS[id]
                    const selected = id === presetId
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          setPresetId(id)
                          if (!overrideEnabled) setPrimaryColorOverride(preset.tokens.brand)
                        }}
                        style={{
                          textAlign: 'left', padding: 10, borderRadius: 10, cursor: 'pointer',
                          backgroundColor: preset.tokens.bg,
                          border: `2px solid ${selected ? preset.tokens.brand : C.border}`,
                        }}
                      >
                        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                          {[preset.tokens.surface, preset.tokens.border, preset.tokens.secondary, preset.tokens.brand].map((sw, i) => (
                            <div key={i} style={{ width: 16, height: 16, borderRadius: 4, backgroundColor: sw, border: `1px solid ${preset.tokens.border}` }} />
                          ))}
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 500, color: preset.tokens.text }}>{preset.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={overrideEnabled}
                onChange={e => {
                  setOverrideEnabled(e.target.checked)
                  if (e.target.checked) setPrimaryColorOverride(THEME_PRESETS[presetId].tokens.brand)
                }}
              />
              <span style={{ fontSize: 13, color: C.text }}>Override brand color</span>
            </label>
            {overrideEnabled && (
              <div style={{ marginTop: 10 }}>
                <ColorPicker color={primaryColorOverride} onChange={setPrimaryColorOverride} />
              </div>
            )}
            <p style={{ fontSize: 12, color: C.faint, marginTop: 8 }}>
              Everything but the brand color is fixed by the theme. Enable the override to match a client&apos;s existing brand color within the chosen theme.
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
          Theme Preview
        </p>
        <div style={{
          backgroundColor: resolvedTheme.bg, borderRadius: 12, border: `1px solid ${resolvedTheme.border}`,
          overflow: 'hidden',
        }}>
          {/* Mock nav strip */}
          <div style={{
            height: 40, backgroundColor: resolvedTheme.header,
            borderBottom: `1px solid ${resolvedTheme.border}`,
            display: 'flex', alignItems: 'center', paddingInline: 16, gap: 12,
          }}>
            <div style={{ width: 70, height: 8, backgroundColor: resolvedTheme.text, opacity: 0.6, borderRadius: 4 }} />
            <div style={{ flex: 1 }} />
            <div style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 11, color: '#fff',
              backgroundColor: resolvedTheme.brand,
            }}>Book</div>
          </div>

          {/* Mock content */}
          <div style={{ padding: '20px 16px' }}>
            <div style={{ fontSize: 11, color: resolvedTheme.brand, fontWeight: 600, marginBottom: 8 }}>
              {name || 'Client Name'}
            </div>
            <div style={{ fontSize: 13, color: resolvedTheme.text, marginBottom: 6 }}>
              {domain || 'yourdomain.ge'}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              <button style={{
                padding: '8px 18px', borderRadius: 7, fontSize: 12,
                backgroundColor: resolvedTheme.brand, color: '#fff', border: 'none', cursor: 'default',
              }}>
                Book a Visit
              </button>
              <button style={{
                padding: '8px 18px', borderRadius: 7, fontSize: 12,
                backgroundColor: resolvedTheme.surface, color: resolvedTheme.brand,
                border: `1.5px solid ${resolvedTheme.brand}`, cursor: 'default',
              }}>
                Learn More
              </button>
            </div>
            <div style={{
              marginTop: 14, padding: '8px 12px', borderRadius: 8,
              backgroundColor: resolvedTheme.surface,
              border: `1px solid ${resolvedTheme.border}`,
              borderLeft: `3px solid ${resolvedTheme.brand}`,
              fontSize: 12, color: resolvedTheme.muted,
            }}>
              Booking confirmation text in brand color accent.
            </div>
          </div>
        </div>

        {/* Token info */}
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {([
            ['brand', resolvedTheme.brand], ['text', resolvedTheme.text],
            ['surface', resolvedTheme.surface], ['secondary', resolvedTheme.secondary],
          ] as const).map(([label, hex]) => (
            <div key={label} style={{ padding: '8px 10px', borderRadius: 7, backgroundColor: '#111827', border: '1px solid #1e293b' }}>
              <div style={{ width: '100%', height: 16, borderRadius: 4, backgroundColor: hex, marginBottom: 4, border: '1px solid rgba(255,255,255,0.08)' }} />
              <div style={{ fontSize: 10, color: C.faint, fontFamily: 'monospace' }}>{label} {hex}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
