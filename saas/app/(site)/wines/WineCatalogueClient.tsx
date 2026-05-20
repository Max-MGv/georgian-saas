'use client'

import { useState, useTransition } from 'react'
import { submitWineOrder } from '@/app/actions/submitWineOrder'

const WINES = [
  { id: 'saperavi_2022',       name: 'Saperavi 2022',        type: 'Red Dry',    price: '18₾ / bottle', color: '#7c1d23', gradient: 'from-[#7c1d23] to-[#4a0f13]' },
  { id: 'rkatsiteli_2023',     name: 'Rkatsiteli 2023',      type: 'White Dry',  price: '15₾ / bottle', color: '#8b6914', gradient: 'from-[#8b6914] to-[#5a430c]' },
  { id: 'rkatsiteli_amber_2022', name: 'Rkatsiteli Amber 2022', type: 'Amber',   price: '22₾ / bottle', color: '#c27c2a', gradient: 'from-[#c27c2a] to-[#8b5510]' },
  { id: 'mtsvane_2023',        name: 'Mtsvane 2023',          type: 'White Dry', price: '16₾ / bottle', color: '#5a7c14', gradient: 'from-[#5a7c14] to-[#384e0c]' },
  { id: 'rose_2023',           name: 'Rosé 2023',             type: 'Rosé Dry',  price: '17₾ / bottle', color: '#c45a6e', gradient: 'from-[#c45a6e] to-[#8b3347]' },
  { id: 'chacha',              name: 'Chacha',                type: 'Spirit 55%', price: '25₾ / bottle', color: '#6b5a47', gradient: 'from-[#6b5a47] to-[#3d3328]' },
]

type WineQty = Record<string, number>

export default function WineCatalogueClient() {
  const [quantities, setQuantities] = useState<WineQty>({})
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function setQty(id: string, delta: number) {
    setQuantities(prev => {
      const current = prev[id] ?? 0
      const next = Math.max(0, current + delta)
      return { ...prev, [id]: next }
    })
  }

  const totalBottles = Object.values(quantities).reduce((s, q) => s + q, 0)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    const form = e.currentTarget
    const formData = new FormData(form)
    const wines = WINES.map(w => ({ id: w.id, name: w.name, quantity: quantities[w.id] ?? 0 }))
    formData.set('wines', JSON.stringify(wines))

    startTransition(async () => {
      const result = await submitWineOrder(formData)
      if (result.error) {
        setError(result.error)
      } else {
        setSubmitted(true)
        form.reset()
        setQuantities({})
      }
    })
  }

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-24 text-center">
        <div className="text-5xl mb-6">🍷</div>
        <h2 className="text-2xl font-bold mb-3" style={{ color: '#1c1008' }}>Order received!</h2>
        <p className="text-base mb-8" style={{ color: '#6b5a47' }}>
          Thank you. We will contact you shortly to confirm the details.
        </p>
        <button
          onClick={() => setSubmitted(false)}
          className="btn-wine font-semibold px-8 py-3 rounded-lg"
        >
          Place another order
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-16">

      {/* Heading */}
      <p className="text-sm font-medium tracking-widest uppercase mb-3" style={{ color: '#8b4513' }}>
        Wine Catalogue
      </p>
      <h1 className="text-3xl sm:text-4xl font-bold mb-3" style={{ color: '#1c1008' }}>
        Nikalas Marani
      </h1>
      <p className="text-base mb-10" style={{ color: '#6b5a47' }}>
        Select wines, set quantities, and place a reservation. We will call you to confirm.
      </p>

      <div className="h-px mb-10" style={{ backgroundColor: '#e0d4c0' }} />

      {/* Wine grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        {WINES.map(wine => {
          const qty = quantities[wine.id] ?? 0
          return (
            <div key={wine.id} className="rounded-xl border overflow-hidden flex flex-col" style={{ backgroundColor: '#fff9f3', borderColor: '#e0d4c0' }}>
              {/* Image placeholder */}
              <div
                className={`h-44 bg-gradient-to-b ${wine.gradient} flex items-center justify-center`}
              >
                <svg width="32" height="64" viewBox="0 0 32 64" fill="none" opacity="0.25">
                  <path d="M8 2h16l-4 24a8 8 0 1 1-8 0L8 2z" fill="white" />
                  <rect x="14" y="50" width="4" height="12" fill="white" />
                  <rect x="8" y="60" width="16" height="2" rx="1" fill="white" />
                </svg>
              </div>

              {/* Info + controls */}
              <div className="p-4 flex flex-col gap-3 flex-1">
                <div>
                  <p className="font-bold text-sm" style={{ color: '#1c1008' }}>{wine.name}</p>
                  <p className="text-xs font-medium uppercase tracking-wide mt-0.5" style={{ color: wine.color }}>{wine.type}</p>
                </div>

                <div className="flex items-center justify-between mt-auto">
                  <span className="text-sm font-semibold" style={{ color: '#1c1008' }}>{wine.price}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQty(wine.id, -1)}
                      disabled={qty === 0}
                      className="w-7 h-7 rounded border font-bold text-base flex items-center justify-center transition-opacity disabled:opacity-30"
                      style={{ borderColor: '#e0d4c0', color: '#1c1008', backgroundColor: '#f5efe6' }}
                    >−</button>
                    <span className="w-5 text-center font-semibold text-sm" style={{ color: '#1c1008' }}>{qty}</span>
                    <button
                      type="button"
                      onClick={() => setQty(wine.id, 1)}
                      className="w-7 h-7 rounded border font-bold text-base flex items-center justify-center"
                      style={{ borderColor: '#e0d4c0', color: '#1c1008', backgroundColor: '#f5efe6' }}
                    >+</button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Selection summary */}
      {totalBottles > 0 && (
        <div className="rounded-xl border px-5 py-3 mb-8 flex items-center gap-2 text-sm" style={{ borderColor: '#c9b99a', backgroundColor: '#fff9f3', color: '#6b5a47' }}>
          <span>🍷</span>
          <span>
            {WINES.filter(w => (quantities[w.id] ?? 0) > 0).map(w => `${w.name} × ${quantities[w.id]}`).join(', ')}
          </span>
        </div>
      )}

      <div className="h-px mb-10" style={{ backgroundColor: '#e0d4c0' }} />

      {/* Reservation form */}
      <h2 className="text-xl font-bold mb-6" style={{ color: '#1c1008' }}>Place a Reservation</h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {[
          { name: 'businessName', placeholder: 'Bar, restaurant, or individual name', required: true },
          { name: 'llcName',      placeholder: 'LLC name (if applicable)',             required: false },
          { name: 'llcId',        placeholder: 'LLC identification number',            required: false },
          { name: 'address',      placeholder: 'Actual address of bar / restaurant',   required: true },
          { name: 'workingHours', placeholder: 'Working hours',                        required: false },
          { name: 'contactName',  placeholder: 'Contact person full name',             required: true },
          { name: 'contactPhone', placeholder: 'Contact person phone number',          required: true },
        ].map(field => (
          <input
            key={field.name}
            name={field.name}
            required={field.required}
            placeholder={field.placeholder}
            className="w-full px-4 py-3 rounded-lg border text-sm outline-none"
            style={{ backgroundColor: '#fff9f3', borderColor: '#e0d4c0', color: '#1c1008' }}
          />
        ))}

        {error && (
          <p className="text-sm" style={{ color: '#7c1d23' }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="btn-wine font-semibold py-3 rounded-lg mt-2 disabled:opacity-60 transition-opacity"
        >
          {isPending ? 'Sending...' : 'Place Reservation'}
        </button>
      </form>

    </div>
  )
}
