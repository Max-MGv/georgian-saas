'use client'

import { useState, useTransition } from 'react'
import { updateWineImages } from '@/app/actions/settings'

const C = {
  text: '#1c1008', muted: '#6b5a47', faint: '#a89070',
  border: '#e0d4c0', bg: '#fff9f3', wine: '#7c1d23',
}

type Wine = { id: string; name: string }
type WineImage = { path: string; label: string }

type Props = {
  wines: Wine[]
  images: WineImage[]
  initialMapping: Record<string, string>
}

export default function ImageAssignClient({ wines, images, initialMapping }: Props) {
  const [mapping, setMapping] = useState<Record<string, string>>(initialMapping)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function assign(wineId: string, imagePath: string) {
    setMapping(prev => {
      // If already assigned to this wine, unassign (toggle off)
      if (prev[wineId] === imagePath) {
        const next = { ...prev }
        delete next[wineId]
        return next
      }
      return { ...prev, [wineId]: imagePath }
    })
    setSavedAt(null)
  }

  function handleSave() {
    startTransition(async () => {
      await updateWineImages(mapping)
      setSavedAt(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))
    })
  }

  return (
    <div className="space-y-8">

      {/* Image gallery reference */}
      <div className="rounded-xl border p-5" style={{ borderColor: C.border, backgroundColor: '#ffffff' }}>
        <p className="text-sm font-semibold mb-4" style={{ color: C.text }}>Available Photos</p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {images.map(img => {
            const usedBy = Object.entries(mapping).find(([, v]) => v === img.path)?.[0]
            const usedByName = usedBy ? wines.find(w => w.id === usedBy)?.name : null
            return (
              <div key={img.path} className="text-center">
                <div
                  className="rounded-lg border overflow-hidden mb-1"
                  style={{ borderColor: usedBy ? C.wine : C.border, borderWidth: usedBy ? 2 : 1 }}
                >
                  <img
                    src={img.path}
                    alt={img.label}
                    className="w-full object-contain"
                    style={{ height: 80, backgroundColor: '#faf6f0' }}
                  />
                </div>
                <p className="text-xs truncate" style={{ color: usedByName ? C.wine : C.faint }}>
                  {usedByName ?? img.label}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Wine list with image pickers */}
      <div className="space-y-4">
        {wines.map(wine => {
          const selected = mapping[wine.id]
          return (
            <div key={wine.id} className="rounded-xl border p-4" style={{ borderColor: C.border, backgroundColor: '#ffffff' }}>
              <div className="flex items-center gap-4">
                {/* Selected image preview or placeholder */}
                <div
                  className="rounded-lg border flex-shrink-0 overflow-hidden"
                  style={{ width: 64, height: 64, borderColor: C.border, backgroundColor: '#faf6f0' }}
                >
                  {selected ? (
                    <img src={selected} alt={wine.name} className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span style={{ color: C.faint, fontSize: 24 }}>?</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold mb-2" style={{ color: C.text }}>{wine.name}</p>
                  {/* Image options */}
                  <div className="flex flex-wrap gap-2">
                    {images.map(img => {
                      const isActive = selected === img.path
                      const isUsedElsewhere = !isActive && Object.entries(mapping).some(([k, v]) => v === img.path && k !== wine.id)
                      return (
                        <button
                          key={img.path}
                          onClick={() => assign(wine.id, img.path)}
                          title={img.label}
                          className="rounded-lg border overflow-hidden transition-all"
                          style={{
                            width: 44,
                            height: 44,
                            borderColor: isActive ? C.wine : C.border,
                            borderWidth: isActive ? 2 : 1,
                            opacity: isUsedElsewhere ? 0.4 : 1,
                            backgroundColor: '#faf6f0',
                          }}
                        >
                          <img src={img.path} alt={img.label} className="w-full h-full object-contain" />
                        </button>
                      )
                    })}
                    {selected && (
                      <button
                        onClick={() => assign(wine.id, selected)}
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

      {/* Save */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
          style={{ backgroundColor: isPending ? '#a0392a' : C.wine }}
        >
          {isPending ? 'Saving…' : 'Save assignments'}
        </button>
        {savedAt && !isPending && (
          <p className="text-xs" style={{ color: C.faint }}>Saved at {savedAt}</p>
        )}
      </div>

    </div>
  )
}
