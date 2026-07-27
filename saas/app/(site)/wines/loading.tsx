export default function WinesLoading() {
  const border = 'var(--site-border)'
  const cardBg = 'var(--site-surface)'

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      {/* Logo + heading */}
      <div className="flex flex-col items-center gap-4 mb-10">
        <div className="shimmer rounded-xl" style={{ width: 100, height: 80 }} />
        <div className="shimmer rounded" style={{ width: 200, height: 28 }} />
        <div className="shimmer rounded" style={{ width: 280, height: 15 }} />
      </div>

      {/* Wine card grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-2xl border overflow-hidden flex flex-col"
            style={{ borderColor: border, backgroundColor: cardBg }}
          >
            {/* Image area */}
            <div className="shimmer" style={{ height: 200 }} />
            {/* Content */}
            <div className="p-4 flex flex-col gap-2.5 flex-1">
              <div className="shimmer rounded" style={{ width: '70%', height: 18 }} />
              <div className="shimmer rounded" style={{ width: '90%', height: 13 }} />
              <div className="shimmer rounded" style={{ width: '60%', height: 13 }} />
              <div className="shimmer rounded mt-auto" style={{ width: 80, height: 24 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
