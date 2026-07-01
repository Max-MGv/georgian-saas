import { headers } from 'next/headers'
import LoginForm from './LoginForm'

export default async function LoginPage() {
  const h = await headers()
  const logoUrl = h.get('x-platform-logo')
  const logoAlt = h.get('x-platform-logo-alt') ?? ''

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f5efe6' }}>
      <div className="w-full max-w-sm px-6">
        <div className="text-center mb-8">
          {logoUrl && (
            <img src={logoUrl} alt={logoAlt} style={{ height: '56px', width: 'auto' }} className="mx-auto mb-3" />
          )}
          <p className="text-sm font-medium" style={{ color: '#6b5a47' }}>Admin Panel</p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
