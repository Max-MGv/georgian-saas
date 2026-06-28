'use client'

export default function BookingFormEditOverlay() {
  return (
    <div
      onClick={() => window.parent.postMessage({ type: 'switchTab', tab: 'form' }, '*')}
      style={{
        position: 'absolute',
        inset: 0,
        backgroundColor: 'rgba(28,16,8,0.52)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        borderRadius: '12px',
        zIndex: 10,
      }}
    >
      <div style={{
        color: 'white',
        textAlign: 'center',
        padding: '14px 28px',
        backgroundColor: 'rgba(0,0,0,0.38)',
        borderRadius: '10px',
        border: '1px solid rgba(255,255,255,0.18)',
      }}>
        <p style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: 4 }}>Booking Form Labels</p>
        <p style={{ fontSize: '0.82rem', opacity: 0.75 }}>Click to edit in the admin panel →</p>
      </div>
    </div>
  )
}
