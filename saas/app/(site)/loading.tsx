// Skeleton shown while any public page loads (home, about, contact)
export default function SiteLoading() {
  const border = 'var(--site-border)'
  const cardBg = 'var(--site-surface)'

  return (
    <div>
      {/* Hero */}
      <div
        className="shimmer-dark flex flex-col items-center justify-center gap-5 px-6"
        style={{ minHeight: 360 }}
      >
        {/* Logo pill */}
        <div className="shimmer rounded-[22px]" style={{ width: 160, height: 96, opacity: 0.18 }} />
        {/* Eyebrow */}
        <div className="shimmer rounded-full" style={{ width: 128, height: 14, opacity: 0.14 }} />
        {/* Subtitle lines */}
        <div className="flex flex-col items-center gap-2">
          <div className="shimmer rounded" style={{ width: 280, height: 14, opacity: 0.14 }} />
          <div className="shimmer rounded" style={{ width: 220, height: 14, opacity: 0.14 }} />
        </div>
        {/* Buttons */}
        <div className="flex gap-3 mt-1">
          <div className="shimmer rounded-lg" style={{ width: 148, height: 48, opacity: 0.18 }} />
          <div className="shimmer rounded-lg" style={{ width: 148, height: 48, opacity: 0.18 }} />
        </div>
      </div>

      {/* Divider */}
      <div className="max-w-2xl mx-auto px-6">
        <div className="h-px" style={{ backgroundColor: border }} />
      </div>

      {/* Package cards */}
      <div className="max-w-2xl mx-auto px-6 py-14 grid sm:grid-cols-2 gap-4">
        {[0, 1].map(i => (
          <div key={i} className="rounded-xl border p-6 flex flex-col gap-3" style={{ borderColor: border, backgroundColor: cardBg }}>
            <div className="shimmer rounded" style={{ width: 140, height: 20 }} />
            <div className="shimmer rounded" style={{ width: '100%', height: 14 }} />
            <div className="shimmer rounded" style={{ width: '75%', height: 14 }} />
            <div className="shimmer rounded mt-1" style={{ width: 72, height: 32 }} />
          </div>
        ))}
      </div>

      {/* Divider */}
      <div className="max-w-2xl mx-auto px-6">
        <div className="h-px" style={{ backgroundColor: border }} />
      </div>

      {/* Booking form */}
      <div className="max-w-2xl mx-auto px-6 py-16 flex flex-col gap-5">
        {/* Heading + intro */}
        <div className="shimmer rounded" style={{ width: 160, height: 28 }} />
        <div className="shimmer rounded" style={{ width: 320, height: 15 }} />

        {/* Booking type buttons */}
        <div className="flex gap-3 mt-2">
          <div className="shimmer rounded-xl" style={{ width: 164, height: 44 }} />
          <div className="shimmer rounded-xl" style={{ width: 148, height: 44 }} />
        </div>

        {/* Visit type */}
        <div className="flex gap-3">
          <div className="shimmer flex-1 rounded-xl" style={{ height: 64 }} />
          <div className="shimmer flex-1 rounded-xl" style={{ height: 64 }} />
        </div>

        {/* Date + time */}
        <div className="flex gap-3">
          <div className="shimmer flex-1 rounded-xl" style={{ height: 44 }} />
          <div className="shimmer flex-1 rounded-xl" style={{ height: 44 }} />
        </div>

        {/* Guests */}
        <div className="shimmer rounded-xl" style={{ width: 160, height: 44 }} />

        {/* Name */}
        <div className="flex gap-3">
          <div className="shimmer flex-1 rounded-xl" style={{ height: 44 }} />
          <div className="shimmer flex-1 rounded-xl" style={{ height: 44 }} />
        </div>

        {/* Phone + email */}
        <div className="flex gap-3">
          <div className="shimmer flex-1 rounded-xl" style={{ height: 44 }} />
          <div className="shimmer flex-1 rounded-xl" style={{ height: 44 }} />
        </div>

        {/* Submit */}
        <div className="shimmer rounded-xl" style={{ height: 48 }} />

        {/* Cancel policy */}
        <div className="shimmer rounded mx-auto" style={{ width: 280, height: 13 }} />
      </div>
    </div>
  )
}
