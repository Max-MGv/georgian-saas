import SiteNav from './SiteNav'

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#f5efe6', color: '#1c1008' }}>
      <SiteNav />

      <main className="flex-1">
        {children}
      </main>

      <footer className="border-t px-6 py-8 text-center text-sm" style={{ borderColor: '#e0d4c0', color: '#a89070' }}>
        <p>Kardanakhi, Gurjaani · +995 599 96 33 17 · nikalasmarani@gmail.com</p>
        <p className="mt-1">48-hour cancellation policy applies.</p>
      </footer>
    </div>
  )
}
