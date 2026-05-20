'use client'

import { useState, useTransition } from 'react'
import { submitWineOrder } from '@/app/actions/submitWineOrder'

const WINES = [
  { id: 'saperavi_2022', name: 'Saperavi 2022', type: 'წითელი მშრალი', desc: 'კლასიკური კახური საფერავი, მუხის კასრში დავარგებული. ბროწეულის, შავი მოცვის და სანელებლების არომატი.', price: '18₾ / ბოთლი', color: '#7c1d23' },
  { id: 'rkatsiteli_2023', name: 'Rkatsiteli 2023', type: 'თეთრი მშრალი', desc: 'სუფთა, სასიამოვნო მჟავიანობით. ვაშლის, ატმის და ციტრუსის ნოტები. კარგად ერევა ზღვის პროდუქტებს.', price: '15₾ / ბოთლი', color: '#8b6914' },
  { id: 'rkatsiteli_amber_2022', name: 'Rkatsiteli Amber 2022', type: 'ქარვისფერი', desc: 'ტრადიციული ქვევრის მეთოდი. კანზე დაყენება 6 თვე. თხილის, გამხმარი ხილის და თეთრი ყვავილის არომატი.', price: '22₾ / ბოთლი', color: '#c27c2a' },
  { id: 'mtsvane_2023', name: 'Mtsvane 2023', type: 'თეთრი მშრალი', desc: 'მოხდენილი, ყვავილოვანი ბუკეტით. კარგი სიმჟავე და სიგრძე. გოგრის, ლიმონის და ყვავილების ნოტები.', price: '16₾ / ბოთლი', color: '#5a7c14' },
  { id: 'rose_2023', name: 'Rosé 2023', type: 'როზე მშრალი', desc: 'მსუბუქი, გამაგრილებელი. გამხმარი ვარდის, ჟოლოს და ატმის ნოტებით. საზაფხულო ტიპი.', price: '17₾ / ბოთლი', color: '#c45a6e' },
  { id: 'chacha', name: 'ჭაჭა', type: 'სასმელი, 55%', desc: 'სახლის ტრადიციული ჭაჭა. სუფთა, ძლიერი, ყოველ ჯამში ახლადგამოხდილი.', price: '25₾ / ბოთლი', color: '#6b5a47' },
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
        <h2 className="text-2xl font-bold mb-3" style={{ color: '#1c1008' }}>ჯავშანი მიღებულია!</h2>
        <p className="text-base mb-8" style={{ color: '#6b5a47' }}>
          გმადლობთ. ჩვენი გუნდი დაგიკავშირდებათ მალე დეტალების დასადასტურებლად.
        </p>
        <button
          onClick={() => setSubmitted(false)}
          className="btn-wine font-semibold px-8 py-3 rounded-lg"
        >
          ახალი ჯავშანი
        </button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-16">

      {/* Heading */}
      <p className="text-sm font-medium tracking-widest uppercase mb-3" style={{ color: '#8b4513' }}>
        ღვინის კატალოგი
      </p>
      <h1 className="text-3xl sm:text-4xl font-bold mb-3" style={{ color: '#1c1008' }}>
        ნიკალას მარანი
      </h1>
      <p className="text-base mb-10" style={{ color: '#6b5a47' }}>
        შეარჩიეთ ღვინო, მიუთითეთ რაოდენობა და გაფორმდეთ ჯავშანი. დაგიკავშირდებით დასადასტურებლად.
      </p>

      <div className="h-px mb-10" style={{ backgroundColor: '#e0d4c0' }} />

      {/* Wine grid */}
      <div className="grid sm:grid-cols-2 gap-5 mb-12">
        {WINES.map(wine => {
          const qty = quantities[wine.id] ?? 0
          return (
            <div key={wine.id} className="rounded-xl border p-5 flex flex-col gap-3" style={{ backgroundColor: '#fff9f3', borderColor: '#e0d4c0' }}>
              {/* Colour strip */}
              <div className="w-10 h-1 rounded-full" style={{ backgroundColor: wine.color }} />
              <div>
                <p className="font-bold text-base" style={{ color: '#1c1008' }}>{wine.name}</p>
                <p className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: wine.color }}>{wine.type}</p>
                <p className="text-sm leading-relaxed" style={{ color: '#6b5a47' }}>{wine.desc}</p>
              </div>
              <div className="flex items-center justify-between mt-auto pt-2">
                <span className="font-semibold text-sm" style={{ color: '#1c1008' }}>{wine.price}</span>
                {/* Quantity control */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQty(wine.id, -1)}
                    disabled={qty === 0}
                    className="w-8 h-8 rounded-lg border font-bold text-lg flex items-center justify-center transition-opacity disabled:opacity-30"
                    style={{ borderColor: '#e0d4c0', color: '#1c1008', backgroundColor: '#f5efe6' }}
                  >−</button>
                  <span className="w-6 text-center font-semibold text-sm" style={{ color: '#1c1008' }}>{qty}</span>
                  <button
                    type="button"
                    onClick={() => setQty(wine.id, 1)}
                    className="w-8 h-8 rounded-lg border font-bold text-lg flex items-center justify-center transition-colors"
                    style={{ borderColor: '#e0d4c0', color: '#1c1008', backgroundColor: '#f5efe6' }}
                  >+</button>
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
      <h2 className="text-xl font-bold mb-6" style={{ color: '#1c1008' }}>ჯავშნის გაფორმება:</h2>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {[
          { name: 'businessName', placeholder: 'ბარის ან რესტორნის ან ფიზიკური პირის დასახელება', required: true },
          { name: 'llcName',      placeholder: 'შპს დასახელება', required: false },
          { name: 'llcId',        placeholder: 'შპს საიდნეფიკაციო', required: false },
          { name: 'address',      placeholder: 'ბარის/რესტორნის ფაქტიური მისამართი', required: true },
          { name: 'workingHours', placeholder: 'სამუშაო საათები', required: false },
          { name: 'contactName',  placeholder: 'საკონტაქტო პირის სახელი გვარი', required: true },
          { name: 'contactPhone', placeholder: 'საკონტაქტო პირის ტელ. ნომერი', required: true },
        ].map(field => (
          <input
            key={field.name}
            name={field.name}
            required={field.required}
            placeholder={field.placeholder}
            className="w-full px-4 py-3 rounded-lg border text-sm outline-none transition-colors"
            style={{
              backgroundColor: '#fff9f3',
              borderColor: '#e0d4c0',
              color: '#1c1008',
            }}
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
          {isPending ? 'იგზავნება...' : 'ჯავშნის გაფორმება'}
        </button>
      </form>

    </div>
  )
}
