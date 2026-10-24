import { headers } from 'next/headers'
import DemoLoginShortcut from '@/components/DemoLoginShortcut'
import LoginForm from './LoginForm'

export default async function LoginPage() {
  const h = await headers()
  // The platform domain (www.vineworks.ge) resolves to no winery on purpose - it doubles as HQ for /super-admin -
  // so a missing tenant is normal here, not an error (it used to throw and answer 500).
  const tenantId = h.get('x-tenant-id') ?? ''
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
        {/* Demo tenant only — a no-op everywhere else. Closes the dead end a
            shared /admin link used to lead to. Plan-DemoRedesign task 1.4. */}
        <DemoLoginShortcut tenantId={tenantId} />
        <LoginForm />
      </div>
    </div>
  )
}
