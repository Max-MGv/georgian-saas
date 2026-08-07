'use client'

import { useState, useEffect, useRef } from 'react'
import { Upload } from 'lucide-react'
import { uploadTenantLogo, saveTenantLogo } from '@/app/actions/uploadLogo'
import { uploadBgImage } from '@/app/actions/uploadImage'
import { updateSetting } from '@/app/actions/settings'
import { adminT } from '@/lib/adminT'
import { C } from './shared'

function UploadCard({ label, previewUrl, fallback, aspect, uploading, onFile }: {
  label: string
  previewUrl: string | null
  fallback: React.ReactNode
  aspect: string
  uploading: boolean
  onFile: (file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: C.muted }}>{label}</p>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault()
          setDragging(false)
          const file = e.dataTransfer.files?.[0]
          if (file) onFile(file)
        }}
        className="relative rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden cursor-pointer transition-colors"
        style={{
          aspectRatio: aspect,
          borderColor: dragging ? C.wine : C.border,
          backgroundColor: previewUrl ? 'transparent' : '#fffdf9',
        }}
      >
        {previewUrl ? (
          <img src={previewUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 p-6">{fallback}</div>
        )}
        <div
          className="absolute inset-0 flex items-center justify-center transition-opacity"
          style={{
            backgroundColor: 'rgba(28,16,8,0.45)',
            opacity: uploading || dragging ? 1 : 0,
          }}
        >
          <Upload size={20} color="white" />
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) onFile(file)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}

export default function ContentPhotosStep({ locale, tenantName, initialLogoUrl, initialHeroBgPath, onDoneChange }: {
  locale: string
  tenantName: string
  initialLogoUrl: string | null
  initialHeroBgPath: string | null
  onDoneChange?: (done: boolean) => void
}) {
  const at = (key: string) => adminT(locale, key)
  const [logoUrl, setLogoUrl] = useState(initialLogoUrl)
  const [heroUrl, setHeroUrl] = useState(initialHeroBgPath)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingHero, setUploadingHero] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    onDoneChange?.(Boolean(logoUrl || heroUrl))
  }, [logoUrl, heroUrl, onDoneChange])

  async function handleLogoFile(file: File) {
    setUploadingLogo(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const url = await uploadTenantLogo(formData)
      await saveTenantLogo(url, tenantName)
      setLogoUrl(url)
    } catch {
      setError(at('onboarding.photos.uploadError'))
    }
    setUploadingLogo(false)
  }

  async function handleHeroFile(file: File) {
    setUploadingHero(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const url = await uploadBgImage(formData)
      await Promise.all([
        updateSetting('home_hero_bg_path', url),
        updateSetting('home_hero_bg_x', '50'),
        updateSetting('home_hero_bg_y', '50'),
        updateSetting('home_hero_bg_zoom', '110'),
      ])
      setHeroUrl(url)
    } catch {
      setError(at('onboarding.photos.uploadError'))
    }
    setUploadingHero(false)
  }

  return (
    <div>
      <p className="font-medium mb-1" style={{ color: C.text }}>{at('onboarding.photos.title')}</p>
      <p className="text-sm mb-4" style={{ color: C.muted }}>{at('onboarding.photos.hint')}</p>

      <div className="grid sm:grid-cols-2 gap-4">
        <UploadCard
          label={at('onboarding.photos.logoLabel')}
          previewUrl={logoUrl}
          aspect="3 / 1"
          uploading={uploadingLogo}
          onFile={handleLogoFile}
          fallback={
            <>
              <span className="font-serif text-lg font-semibold" style={{ color: C.wine }}>{tenantName}</span>
              <span className="text-xs" style={{ color: C.muted }}>{at('onboarding.photos.uploadHint')}</span>
            </>
          }
        />
        <UploadCard
          label={at('onboarding.photos.heroLabel')}
          previewUrl={heroUrl}
          aspect="16 / 9"
          uploading={uploadingHero}
          onFile={handleHeroFile}
          fallback={
            <>
              <div className="w-10 h-10 rounded-full" style={{ background: `linear-gradient(135deg, ${C.wine}, #c9a15a)` }} />
              <span className="text-xs" style={{ color: C.muted }}>{at('onboarding.photos.uploadHint')}</span>
            </>
          }
        />
      </div>
      {error && <p className="text-sm mt-3" style={{ color: '#b91c1c' }}>{error}</p>}
    </div>
  )
}
