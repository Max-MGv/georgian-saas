'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const C = {
  border: '#e0d4c0',
  text: '#1c1008',
  muted: '#6b5a47',
  inputBg: '#fffdf9',
  wine: '#7c1d23',
}

export default function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError('Incorrect email or password.')
      setLoading(false)
    } else {
      router.push('/admin')
      router.refresh()
    }
  }

  const inputStyle = {
    width: '100%',
    backgroundColor: C.inputBg,
    borderColor: C.border,
    color: C.text,
    border: '1px solid',
    borderRadius: '8px',
    padding: '10px 12px',
    fontSize: '0.875rem',
    outline: 'none',
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label style={{ color: C.muted, fontSize: '0.875rem', fontWeight: 500, display: 'block', marginBottom: 6 }}>
          Email
        </label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoComplete="email"
          style={inputStyle}
        />
      </div>

      <div>
        <label style={{ color: C.muted, fontSize: '0.875rem', fontWeight: 500, display: 'block', marginBottom: 6 }}>
          Password
        </label>
        <div style={{ position: 'relative' }}>
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            style={{ ...inputStyle, paddingRight: '40px' }}
          />
          <button
            type="button"
            onClick={() => setShowPassword(v => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', padding: 4,
              color: C.muted, lineHeight: 0,
            }}
          >
            {showPassword ? (
              // Eye-off icon
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            ) : (
              // Eye icon
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      {error && <p style={{ color: '#b91c1c', fontSize: '0.875rem' }}>{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="btn-wine w-full font-semibold py-3 rounded-lg"
      >
        {loading ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
  )
}
