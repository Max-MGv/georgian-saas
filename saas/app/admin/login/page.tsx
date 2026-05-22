import LoginForm from './LoginForm'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f5efe6' }}>
      <div className="w-full max-w-sm px-6">
        <div className="text-center mb-8">
          <img src="/icons/logo-dark.svg" alt="Nikalas Marani" style={{ height: '56px', width: 'auto' }} className="mx-auto" />
          <p className="text-sm mt-3" style={{ color: '#6b5a47' }}>Admin Panel</p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
