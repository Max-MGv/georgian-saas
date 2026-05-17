import LoginForm from './LoginForm'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#f5efe6' }}>
      <div className="w-full max-w-sm px-6">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold" style={{ color: '#1c1008' }}>Nikalas Marani</h1>
          <p className="text-sm mt-1" style={{ color: '#6b5a47' }}>Admin Panel</p>
        </div>
        <LoginForm />
      </div>
    </div>
  )
}
