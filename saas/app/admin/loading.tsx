export default function AdminLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      {/* Page title placeholder */}
      <div className="h-7 w-48 rounded-lg" style={{ backgroundColor: '#e0d4c0' }} />

      {/* Filter row placeholder */}
      <div className="flex gap-3 mt-2">
        {[120, 140, 140, 180].map((w, i) => (
          <div key={i} className="h-10 rounded-lg" style={{ width: w, backgroundColor: '#e0d4c0' }} />
        ))}
      </div>

      {/* Table / card placeholder */}
      <div className="rounded-xl border overflow-hidden mt-4" style={{ borderColor: '#e0d4c0' }}>
        {/* Header */}
        <div className="h-10 w-full" style={{ backgroundColor: '#f5efe6' }} />
        {/* Rows */}
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 px-4 py-3 border-t"
            style={{ borderColor: '#e0d4c0', backgroundColor: i % 2 === 0 ? '#ffffff' : '#fff9f3' }}
          >
            {[80, 60, 120, 80, 100, 40, 120, 60].map((w, j) => (
              <div key={j} className="h-4 rounded" style={{ width: w, backgroundColor: '#e0d4c0' }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
