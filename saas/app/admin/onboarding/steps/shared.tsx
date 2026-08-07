export const C = { border: '#e0d4c0', bg: '#fff9f3', text: '#1c1008', muted: '#6b5a47', faint: '#a89070', wine: 'var(--color-brand)' }

export type StepKey = 'companies' | 'wines' | 'bookingDetails' | 'payment' | 'contact' | 'photos' | 'review'

export function SmallField({ label, value, onChange, width = 100 }: {
  label: string; value: string; onChange: (v: string) => void; width?: number
}) {
  return (
    <label className="flex flex-col gap-1" style={{ width }}>
      <span className="text-xs" style={{ color: C.muted }}>{label}</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        type="number"
        className="px-2 py-1.5 rounded-lg border text-sm"
        style={{ borderColor: C.border }}
      />
    </label>
  )
}

export function StatusIcon({ symbol, title, bg, color, border }: {
  symbol: string; title: string; bg: string; color: string; border: string
}) {
  return (
    <span
      title={title}
      aria-label={title}
      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-xs flex-shrink-0 cursor-default"
      style={{ backgroundColor: bg, color, border: `1px solid ${border}` }}
    >
      {symbol}
    </span>
  )
}
