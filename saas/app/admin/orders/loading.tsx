export default function OrdersLoading() {
  const border = '#e0d4c0'
  const bg = '#fff9f3'
  const headerBg = '#f5efe6'

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="shimmer h-7 w-24 rounded-lg" />
        <div className="flex items-center gap-3">
          <div className="shimmer h-5 w-20 rounded" />
          <div className="shimmer h-8 w-24 rounded-lg" />
          <div className="shimmer h-8 w-28 rounded-lg" />
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        {[72, 110, 110, 170, 90, 90].map((w, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <div className="shimmer h-3 w-8 rounded" />
            <div className="shimmer h-9 rounded-lg" style={{ width: w }} />
          </div>
        ))}
      </div>

      {/* Table card */}
      <div className="rounded-xl border overflow-hidden mt-4" style={{ borderColor: border, backgroundColor: bg }}>
        {/* Table header row */}
        <div className="flex gap-6 px-4 py-3 border-b" style={{ borderColor: border, backgroundColor: headerBg }}>
          {[56, 72, 130, 90, 64, 64, 56].map((w, i) => (
            <div key={i} className="shimmer h-3 rounded" style={{ width: w }} />
          ))}
        </div>
        {/* Rows */}
        {Array.from({ length: 9 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-6 px-4 py-3.5 border-b"
            style={{ borderColor: border, backgroundColor: i % 2 === 0 ? bg : '#fffdf9' }}
          >
            {[56, 72, 140, 90, 60, 68, 48].map((w, j) => (
              <div key={j} className="shimmer h-3 rounded" style={{ width: w }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
