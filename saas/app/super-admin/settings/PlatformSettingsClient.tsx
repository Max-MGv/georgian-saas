'use client'

import { useRef, useState } from 'react'
import { uploadPlatformLogo, savePlatformLogoAlt, removePlatformLogo } from '@/app/actions/platform'

const C = {
  bg: '#0f172a',
  card: '#1e293b',
  border: '#334155',
  text: '#f1f5f9',
  muted: '#94a3b8',
  faint: '#475569',
}

type Props = {
  logoUrl: string | null
  logoAlt: string
}

export default function PlatformSettingsClient({ logoUrl: initialLogoUrl, logoAlt: initialLogoAlt }: Props) {
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl)
  const [logoAlt, setLogoAlt] = useState(initialLogoAlt)
  const [uploading, setUploading] = useState(false)
  const [altSaved, setAltSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const url = await uploadPlatformLogo(fd)
      setLogoUrl(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleRemoveLogo() {
    setError(null)
    await removePlatformLogo()
    setLogoUrl(null)
  }

  async function handleAltBlur() {
    await savePlatformLogoAlt(logoAlt)
    setAltSaved(true)
    setTimeout(() => setAltSaved(false), 2000)
  }

  return (
    <div style={{
      backgroundColor: C.card, border: `1px solid ${C.border}`,
      borderRadius: 14, padding: 24, maxWidth: 520,
    }}>
      <h2 className="text-sm font-semibold mb-1" style={{ color: C.text }}>Login Page Logo</h2>
      <p className="text-xs mb-5" style={{ color: C.faint }}>
        Shown on the <code style={{ color: C.muted }}>/admin/login</code> page for all tenants.
        Must work on a warm cream background. SVG or PNG recommended.
        Changes take effect within 5 minutes (proxy cache TTL).
      </p>

      {/* Current logo preview */}
      {logoUrl ? (
        <div className="mb-4" style={{
          padding: '12px 16px',
          backgroundColor: '#f5efe6',
          borderRadius: 10,
          border: '1px solid #e0d4c0',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 12,
        }}>
          <img src={logoUrl} alt="Platform logo preview" style={{ height: 48, width: 'auto', display: 'block' }} />
          <button
            type="button"
            onClick={handleRemoveLogo}
            className="text-xs"
            style={{ color: '#ef4444', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
          >
            Remove
          </button>
        </div>
      ) : (
        <div className="mb-4" style={{
          padding: '16px 20px',
          backgroundColor: C.bg,
          borderRadius: 10,
          border: `1px dashed ${C.border}`,
          color: C.faint,
          fontSize: 13,
        }}>
          No platform logo set — login page shows text only.
        </div>
      )}

      {/* Upload button */}
      <div className="flex items-center gap-3 mb-5">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/svg+xml,image/jpeg,image/webp"
          style={{ display: 'none' }}
          onChange={handleLogoUpload}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          style={{
            padding: '8px 16px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
            backgroundColor: '#1e1b4b', border: '1px solid #3730a3', color: '#a5b4fc',
            opacity: uploading ? 0.6 : 1,
          }}
        >
          {uploading ? 'Uploading…' : logoUrl ? 'Replace logo' : 'Upload logo'}
        </button>
        {error && <span className="text-xs" style={{ color: '#ef4444' }}>{error}</span>}
      </div>

      {/* Alt text */}
      {logoUrl && (
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: C.muted }}>
            Logo alt text
          </label>
          <div className="flex items-center gap-2">
            <input
              value={logoAlt}
              onChange={e => setLogoAlt(e.target.value)}
              onBlur={handleAltBlur}
              placeholder="e.g. Your Company"
              style={{
                padding: '7px 12px', borderRadius: 8, fontSize: 13,
                backgroundColor: C.bg, border: `1px solid ${C.border}`,
                color: C.text, width: 240, outline: 'none',
              }}
            />
            {altSaved && <span className="text-xs" style={{ color: '#4ade80' }}>✓ Saved</span>}
          </div>
        </div>
      )}
    </div>
  )
}
