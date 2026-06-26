import { headers } from 'next/headers'
import LoginForm from './LoginForm'

export default async function LoginPage() {
  const h = await headers()
  const logoUrl = h.get('x-tenant-logo') ?? '/icons/logo-dark.svg'
  const logoAlt = h.get('x-tenant-logo-alt') ?? 'Nikalas Marani'

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f5efe6' }}>
      <div className="w-full max-w-sm px-6">
        <div className="text-center mb-8">
          <img src={logoUrl} alt={logoAlt} style={{ height: '56px', width: 'auto' }} className="mx-auto" />
          <p className="text-sm mt-3" style={{ color: '#6b5a47' }}>Admin Panel</p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
