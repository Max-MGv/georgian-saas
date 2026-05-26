'use client'

import { useState, useTransition } from 'react'
import { updateWine } from '@/app/actions/wines'

const C = {
  text: '#1c1008', muted: '#6b5a47', faint: '#a89070',
  border: '#e0d4c0', bg: '#fff9f3', wine: '#7c1d23',
}

type Wine = { id: string; name: string; imagePath: string | null }
type WineImage = { path: string; label: string }

type Props = {
  wines: Wine[]
  images: WineImage[]
}

export default function ImageAssignClient({ wines: initialWines, images }: Props) {
  const [wines, setWines] = useState<Wine[]>(initialWines)
  const [isPending, startTransition] = useTransition()
  const [savingId, setSavingId] = useState<string | null>(null)
  const [lastSaved, setLastSaved] = useState<string | null>(null)

  function assign(wineId: string, imagePath: string) {
    const wine = wines.find(w => w.id === wineId)
    if (!wine) return
    // Toggle off if already selected
    const newPath = wine.imagePath === imagePath ? null : imagePath
    setSavingId(wineId)
    setLastSaved(null)
    startTransition(async () => {
      await updateWine(wineId, { imagePath: newPath ?? undefined })
      setWines(prev => prev.map(w => w.id === wineId ? { ...w, imagePath: newPath } : w))
      setSavingId(null)
      setLastSaved(wineId)
    })
  }

  return (
    <div className="space-y-8">

      {/* Image gallery reference */}
      <div className="rounded-xl border p-5" style={{ borderColor: C.border, backgroundColor: '#ffffff' }}>
        <p className="text-sm font-semibold mb-4" style={{ color: C.text }}>Available Photos</p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {images.map(img => {
            const usedByWine = wines.find(w => w.imagePath === img.path)
            return (
              <div key={img.path} className="text-center">
                <div
                  className="rounded-lg border overflow-hidden mb-1"
                  style={{ borderColor: usedByWine ? C.wine : C.border, borderWidth: usedByWine ? 2 : 1 }}
                >
                  <img
                    src={img.path}
                    alt={img.label}
                    className="w-full object-contain"
                    style={{ height: 80, backgroundColor: '#faf6f0' }}
                  />
                </div>
                <p className="text-xs truncate" style={{ color: usedByWine ? C.wine : C.faint }}>
                  {usedByWine ? usedByWine.name : img.label}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Wine list with image pickers */}
      <div className="space-y-4">
        {wines.map(wine => {
          const isSaving = savingId === wine.id
          const justSaved = lastSaved === wine.id && !isSaving
          return (
            <div key={wine.id} className="rounded-xl border p-4" style={{ borderColor: C.border, backgroundColor: '#ffffff' }}>
              <div className="flex items-center gap-4">
                {/* Selected image preview or placeholder */}
                <div
                  className="rounded-lg border flex-shrink-0 overflow-hidden"
                  style={{ width: 64, height: 64, borderColor: C.border, backgroundColor: '#faf6f0' }}
                >
                  {wine.imagePath ? (
                    <img src={wine.imagePath} alt={wine.name} className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span style={{ color: C.faint, fontSize: 24 }}>?</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm font-semibold" style={{ color: C.text }}>{wine.name}</p>
                    {isSaving && <span className="text-xs" style={{ color: C.faint }}>Saving…</span>}
                    {justSaved && <span className="text-xs" style={{ color: '#5a7c14' }}>✓ Saved</span>}
                  </div>
                  {/* Image options */}
                  <div className="flex flex-wrap gap-2">
                    {images.map(img => {
                      const isActive = wine.imagePath === img.path
                      const isUsedElsewhere = !isActive && wines.some(w => w.id !== wine.id && w.imagePath === img.path)
                      return (
                        <button
                          key={img.path}
                          onClick={() => assign(wine.id, img.path)}
                          disabled={isSaving}
                          title={img.label}
                          className="rounded-lg border overflow-hidden transition-all"
                          style={{
                            width: 44, height: 44,
                            borderColor: isActive ? C.wine : C.border,
                            borderWidth: isActive ? 2 : 1,
                            opacity: isUsedElsewhere ? 0.35 : 1,
                            backgroundColor: '#faf6f0',
                          }}
                        >
                          <img src={img.path} alt={img.label} className="w-full h-full object-contain" />
                        </button>
                      )
                    })}
                    {wine.imagePath && (
                      <button
                        onClick={() => assign(wine.id, wine.imagePath!)}
                        disabled={isSaving}
                        className="rounded-lg border px-2 text-xs"
                        style={{ borderColor: C.border, color: C.faint, height: 44 }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

    </div>
  )
}
