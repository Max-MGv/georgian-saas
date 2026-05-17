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
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          style={inputStyle}
        />
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
